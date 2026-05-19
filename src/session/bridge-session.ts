import { Session } from 'testcafe-hammerhead';
import { randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Deferred } from '../utils/deferred';
import setupVars from './client/setupVars';
import consoleForwarder from './client/consoleForwarder';
import errorForwarder from './client/errorForwarder';
import dialogForwarder from './client/dialogForwarder';
import lifecycleForwarder from './client/lifecycleForwarder';
import popupForwarder from './client/popupForwarder';
import workerForwarder from './client/workerForwarder';
import webSocketForwarder from './client/webSocketForwarder';
import fileChooserForwarder from './client/fileChooserForwarder';
import frameForwarder from './client/frameForwarder';
import domHelpers from './client/domHelpers';
import ariaHelpers from './client/ariaHelpers';
import executeCommand from './client/executeCommand';
import poll from './client/poll';

export interface BridgeCommand {
    id: string;
    type: string;
    [key: string]: unknown;
}

type ServiceMsg = { sessionId?: string; cmd?: string; id?: string; result?: unknown; error?: string; event?: string; data?: unknown };

export class BridgeSession extends Session {
    private commandQueue: BridgeCommand[] = [];
    private pendingCommands = new Map<string, Deferred<unknown>>();
    private dispatchedCommands = new Map<string, BridgeCommand>();
    private pendingPoll: Deferred<BridgeCommand | null> | null = null;
    private readyDeferred: Deferred<void> | null = null;
    private isReady = false;
    private _initScripts: string[] = [];
    private _cookieInitScript: string | null = null;
    private _eventListener: ((event: string, data: unknown) => void) | null = null;
    private _exposedFunctions = new Map<string, (...args: unknown[]) => unknown>();
    private _exposedBindings = new Map<string, (source: Record<string, unknown>, ...args: unknown[]) => unknown>();
    private _blankServer: Server | null = null;
    private _blankPort = 0;
    private _suppressRedispatch = false;

    readonly proxyPort: number;

    constructor(proxyPort: number) {
        super([], { disablePageCaching: true });
        this.proxyPort = proxyPort;
    }

    addInitScript(script: string): void {
        this._initScripts.push(script);
    }

    setCookieInitScript(script: string | null): void {
        this._cookieInitScript = script;
    }

    setEventListener(listener: (event: string, data: unknown) => void): void {
        this._eventListener = listener;
    }

    // -------------------------------------------------------------------------
    // Blank-page server — a minimal local HTTP server the proxy fetches to
    // inject the bridge script into a blank page on first browser open.
    // -------------------------------------------------------------------------

    getBlankPageUrl(): Promise<string> {
        if (this._blankServer) return Promise.resolve(`http://127.0.0.1:${this._blankPort}/`);
        return new Promise<string>((resolve) => {
            const server = createServer((_req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>');
            });
            server.listen(0, '127.0.0.1', () => {
                this._blankPort = (server.address() as AddressInfo).port;
                this._blankServer = server;
                resolve(`http://127.0.0.1:${this._blankPort}/`);
            });
        });
    }

    closeBlankServer(): void {
        if (this._blankServer) {
            this._blankServer.close();
            this._blankServer = null;
            this._blankPort = 0;
        }
    }

    async getPayloadScript(): Promise<string> {
        const sessionId = this.id;
        const messagingUrl = `http://localhost:${this.proxyPort}/messaging`;
        const allScripts = this._cookieInitScript
            ? [this._cookieInitScript, ...this._initScripts]
            : this._initScripts;
        const initBlock = allScripts.length > 0
            ? allScripts.map(s => `try { (function(){ ${s} })(); } catch(e) { console.error('[initScript]', e); }`).join('\n') + '\n'
            : '';

        const varInit = `    var SESSION_ID = '${sessionId}';\n    var MESSAGING_URL = '${messagingUrl}';`;

        return [
            initBlock,
            '(function() {',
            varInit,
            setupVars,
            consoleForwarder,
            errorForwarder,
            dialogForwarder,
            lifecycleForwarder,
            popupForwarder,
            workerForwarder,
            webSocketForwarder,
            fileChooserForwarder,
            frameForwarder,
            domHelpers,
            ariaHelpers,
            executeCommand,
            poll,
            '})();',
        ].join('\n');
    }

    // -------------------------------------------------------------------------
    // Session overrides
    // -------------------------------------------------------------------------

    async getIframePayloadScript(_iframeWithoutSrc: boolean): Promise<string> {
        return '';
    }

    handleFileDownload(): void {
        if (this._eventListener) this._eventListener('download', { url: '', suggestedFilename: '' });
    }

    getAuthCredentials(): null {
        return null;
    }

    handleAttachment(_opts: { isOpenedInNewWindow: boolean }): void { }

    handlePageError(_ctx: unknown, _err: Error): void { }

    // -------------------------------------------------------------------------
    // Service message handlers (called by hammerhead via this[msg.cmd])
    // -------------------------------------------------------------------------

    registerExposedFunction(name: string, fn: (...args: unknown[]) => unknown): void {
        this._exposedFunctions.set(name, fn);
    }

    registerExposedBinding(name: string, fn: (source: Record<string, unknown>, ...args: unknown[]) => unknown): void {
        this._exposedBindings.set(name, fn);
    }

    async bridge_expose_call(msg: ServiceMsg): Promise<{ value?: unknown; error?: string }> {
        const m = msg as Record<string, unknown>;
        const name = (m.expName as string | undefined) ?? '';
        const args = (m.args as unknown[]) ?? [];
        const fn = this._exposedFunctions.get(name);
        if (!fn) return { error: `No exposed function: ${name}` };
        try {
            return { value: await fn(...args) };
        } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
        }
    }

    async bridge_expose_binding_call(msg: ServiceMsg): Promise<{ value?: unknown; error?: string }> {
        const m = msg as Record<string, unknown>;
        const name = (m.expName as string | undefined) ?? '';
        const args = (m.args as unknown[]) ?? [];
        const source = (m.source as Record<string, unknown>) ?? {};
        const fn = this._exposedBindings.get(name);
        if (!fn) return { error: `No exposed binding: ${name}` };
        try {
            return { value: await fn(source, ...args) };
        } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
        }
    }

    async bridge_event(msg: ServiceMsg): Promise<null> {
        if (msg.event && this._eventListener) this._eventListener(msg.event, msg.data ?? {});
        return null;
    }

    resetReady(): void {
        this.isReady = false;
        // Suppress re-dispatch on the next bridge_ready: this is an intentional navigation
        // (goto/reload/goBack/goForward), so any currently dispatched commands belong to the
        // old page and should be discarded rather than replayed on the new one.
        this._suppressRedispatch = true;
        // Discard any unresolved deferred from a previous timed-out navigation so that
        // a late-arriving bridge_ready from the old page cannot satisfy a new waitForReady.
        this.readyDeferred = null;
    }

    async bridge_ready(_msg: ServiceMsg): Promise<null> {
        this.isReady = true;
        if (this._suppressRedispatch) {
            // Intentional navigation — discard stale in-flight commands instead of replaying them.
            // Replaying a navigate command (location.href = ...) on the freshly-loaded page would
            // trigger an infinite reload loop.
            this._suppressRedispatch = false;
            this.dispatchedCommands.clear();
        } else {
            // Re-deliver commands that were dispatched to the previous bridge but never answered
            // (happens when a JS-triggered navigation causes the old bridge to drop in-flight commands).
            const dropped = [...this.dispatchedCommands.values()];
            this.dispatchedCommands.clear();
            for (const cmd of dropped) {
                if (this.pendingPoll) {
                    // New bridge is already waiting — deliver directly so it doesn't wait 30s for the poll timeout.
                    const poll = this.pendingPoll;
                    this.pendingPoll = null;
                    this.dispatchedCommands.set(cmd.id, cmd);
                    poll.resolve(cmd);
                } else {
                    this.commandQueue.unshift(cmd);
                }
            }
        }
        if (this.readyDeferred) {
            this.readyDeferred.resolve();
            this.readyDeferred = null;
        }
        return null;
    }

    async bridge_getCommand(_msg: ServiceMsg): Promise<BridgeCommand | null> {
        if (this.commandQueue.length > 0) {
            const cmd = this.commandQueue.shift()!;
            this.dispatchedCommands.set(cmd.id, cmd);
            return cmd;
        }
        this.pendingPoll = new Deferred<BridgeCommand | null>();
        const pollDeferred = this.pendingPoll;
        const timeout = setTimeout(() => {
            if (this.pendingPoll === pollDeferred) {
                this.pendingPoll = null;
            }
            pollDeferred.resolve(null);
        }, 30000);
        const result = await pollDeferred.promise;
        clearTimeout(timeout);
        return result;
    }

    async bridge_commandResult(msg: ServiceMsg): Promise<null> {
        if (!msg.id) return null;
        this.dispatchedCommands.delete(msg.id);
        const deferred = this.pendingCommands.get(msg.id);
        if (deferred) {
            this.pendingCommands.delete(msg.id);
            if (msg.error) deferred.reject(new Error(msg.error));
            else deferred.resolve(msg.result);
        }
        return null;
    }

    async sendCommand<T>(command: Omit<BridgeCommand, 'id'>): Promise<T> {
        const id = randomUUID();
        const fullCommand = Object.assign({ id }, command) as BridgeCommand;
        const deferred = new Deferred<T>();
        this.pendingCommands.set(id, deferred as unknown as Deferred<unknown>);

        if (this.pendingPoll) {
            const poll = this.pendingPoll;
            this.pendingPoll = null;
            this.dispatchedCommands.set(id, fullCommand);
            poll.resolve(fullCommand);
        } else {
            this.commandQueue.push(fullCommand);
        }

        return deferred.promise;
    }

    waitForReady(timeout = 30000): Promise<void> {
        if (this.isReady) return Promise.resolve();

        // Reuse an existing deferred so concurrent callers share the same resolution signal.
        // Each caller wraps it with its own independent timeout.
        if (!this.readyDeferred) {
            this.readyDeferred = new Deferred<void>();
        }
        const deferred = this.readyDeferred;

        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Timeout ${timeout}ms waiting for page bridge to connect`));
            }, timeout);
            deferred.promise
                .then(() => { clearTimeout(timer); resolve(); })
                .catch(e => { clearTimeout(timer); reject(e); });
        });
    }
}
