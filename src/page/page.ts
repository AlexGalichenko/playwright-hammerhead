import { readFileSync, writeFileSync } from 'fs';
import { EventEmitter } from 'events';
import { Proxy, RequestFilterRule, RequestInfo, ResponseEvent } from 'testcafe-hammerhead';
import { BridgeSession } from '../session/bridge-session';
import { Locator, FrameLocator, StepReporter } from './locator';
import { Keyboard } from './keyboard';
import { Mouse } from './mouse';
import { Route, Request, FulfillOptions, ContinueOptions } from './route';
import {
    ConsoleMessage, Dialog, Download, Frame, FileChooser,
    WebSocketEvent, WorkerEvent, PageResponse,
} from './events';
import { openSafariAtUrl, closeSafariWindowByUrlFragment } from '../utils/safari';
import { getModernScreenshotCode } from '../utils/screenshot';
import { APIRequestContext } from './request';
import { BrowserContext } from '../browser/browser-context';

export type { FulfillOptions, ContinueOptions };

export type RouteHandler = (route: Route, request: Request) => void | Promise<void>;
export type UrlPattern = string | RegExp | ((url: string) => boolean);
export interface RouteOptions { debug?: boolean; }

function patternToRule(pattern: UrlPattern): RequestFilterRule {
    if (typeof pattern === 'string') {
        if (pattern.includes('*') || pattern.includes('?')) {
            const regexStr = pattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*')
                .replace(/\?/g, '.');
            return new RequestFilterRule(new RegExp(regexStr));
        }
        return new RequestFilterRule((info: RequestInfo) => info.url.includes(pattern));
    }
    if (pattern instanceof RegExp) {
        return new RequestFilterRule(pattern);
    }
    return new RequestFilterRule((info: RequestInfo) => pattern(info.url));
}

export type WaitUntilState = 'domcontentloaded' | 'load' | 'networkidle';

export interface PageConfig {
    actionTimeout?: number;
    navigationTimeout?: number;
    expectTimeout?: number;
}

export interface GotoOptions {
    timeout?: number;
    waitUntil?: WaitUntilState;
}

export interface WaitForSelectorOptions {
    state?: 'visible' | 'hidden' | 'attached' | 'detached';
    timeout?: number;
}

export interface ScriptTagOptions {
    url?: string;
    path?: string;
    content?: string;
    type?: string;
}

export interface StyleTagOptions {
    url?: string;
    path?: string;
    content?: string;
}

export interface ScreenshotOptions {
    path?: string;
    fullPage?: boolean;
    type?: 'png' | 'jpeg';
    quality?: number;
}

export type FilePayload = { name: string; mimeType: string; buffer: Buffer };
export type FileInput = string | string[] | FilePayload | FilePayload[];

const REQUEST_EVENTS = new Set(['request', 'response', 'requestfinished', 'requestfailed']);

interface RouteEntry {
    pattern: UrlPattern;
    rule: RequestFilterRule;
    handler: RouteHandler;
}

export class Page extends EventEmitter {
    // --- Typed event overloads ---
    on(event: 'close', listener: () => void): this;
    on(event: 'console', listener: (msg: ConsoleMessage) => void): this;
    on(event: 'crash', listener: () => void): this;
    on(event: 'dialog', listener: (dialog: Dialog) => void): this;
    on(event: 'domcontentloaded', listener: (page: Page) => void): this;
    on(event: 'download', listener: (download: Download) => void): this;
    on(event: 'filechooser', listener: (chooser: FileChooser) => void): this;
    on(event: 'frameattached', listener: (frame: Frame) => void): this;
    on(event: 'framedetached', listener: (frame: Frame) => void): this;
    on(event: 'framenavigated', listener: (frame: Frame) => void): this;
    on(event: 'load', listener: (page: Page) => void): this;
    on(event: 'pageerror', listener: (error: Error) => void): this;
    on(event: 'popup', listener: (info: { url: string; target: string }) => void): this;
    on(event: 'request', listener: (request: Request) => void): this;
    on(event: 'requestfailed', listener: (request: Request) => void): this;
    on(event: 'requestfinished', listener: (request: Request) => void): this;
    on(event: 'response', listener: (response: PageResponse) => void): this;
    on(event: 'websocket', listener: (ws: WebSocketEvent) => void): this;
    on(event: 'worker', listener: (worker: WorkerEvent) => void): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        if (REQUEST_EVENTS.has(event as string) && !this._requestHookSetup) this._setupRequestHook();
        return super.on(event, listener);
    }

    once(event: 'close', listener: () => void): this;
    once(event: 'console', listener: (msg: ConsoleMessage) => void): this;
    once(event: 'crash', listener: () => void): this;
    once(event: 'dialog', listener: (dialog: Dialog) => void): this;
    once(event: 'domcontentloaded', listener: (page: Page) => void): this;
    once(event: 'download', listener: (download: Download) => void): this;
    once(event: 'filechooser', listener: (chooser: FileChooser) => void): this;
    once(event: 'frameattached', listener: (frame: Frame) => void): this;
    once(event: 'framedetached', listener: (frame: Frame) => void): this;
    once(event: 'framenavigated', listener: (frame: Frame) => void): this;
    once(event: 'load', listener: (page: Page) => void): this;
    once(event: 'pageerror', listener: (error: Error) => void): this;
    once(event: 'popup', listener: (info: { url: string; target: string }) => void): this;
    once(event: 'request', listener: (request: Request) => void): this;
    once(event: 'requestfailed', listener: (request: Request) => void): this;
    once(event: 'requestfinished', listener: (request: Request) => void): this;
    once(event: 'response', listener: (response: PageResponse) => void): this;
    once(event: 'websocket', listener: (ws: WebSocketEvent) => void): this;
    once(event: 'worker', listener: (worker: WorkerEvent) => void): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    once(event: string | symbol, listener: (...args: any[]) => void): this {
        if (REQUEST_EVENTS.has(event as string) && !this._requestHookSetup) this._setupRequestHook();
        return super.once(event, listener);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    off(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.off(event, listener);
    }

    readonly keyboard: Keyboard;
    readonly mouse: Mouse;
    readonly request: APIRequestContext;

    _stepReporter: StepReporter = (_, fn) => fn();

    private defaultTimeout: number;
    private navigationTimeout: number;
    readonly expectTimeout: number;
    private readonly _routes: RouteEntry[] = [];
    private readonly _locatorHandlers = new Map<Locator, ReturnType<typeof setInterval>>();
    private readonly _requestInfoMap = new Map<string, RequestInfo>();
    private _requestHookSetup = false;
    private _closed = false;
    private _mainFrame: Frame | undefined;
    private readonly _trackedFrames = new Map<string, Frame>();
    private _browserContext: BrowserContext | undefined;

    constructor(
        private readonly proxy: Proxy,
        private readonly session: BridgeSession,
        config: PageConfig = {}
    ) {
        super();
        this.defaultTimeout = config.actionTimeout ?? 10_000;
        this.navigationTimeout = config.navigationTimeout ?? this.defaultTimeout;
        this.expectTimeout = config.expectTimeout ?? 5_000;
        this.keyboard = new Keyboard(session);
        this.mouse = new Mouse(session);
        this.request = new APIRequestContext();
        this.session.setEventListener((event, data) => this._handleBridgeEvent(event, data as Record<string, unknown>));
    }

    private _handleBridgeEvent(event: string, data: Record<string, unknown>): void {
        switch (event) {
            case 'console':
                this.emit('console', new ConsoleMessage(data['type'] as string, data['args'] as string[]));
                break;
            case 'pageerror':
                this.emit('pageerror', Object.assign(new Error(data['message'] as string), { filename: data['filename'], lineno: data['lineno'] }));
                break;
            case 'dialog':
                this.emit('dialog', new Dialog(
                    data['type'] as 'alert' | 'confirm' | 'prompt',
                    data['message'] as string,
                    data['defaultValue'] as string ?? '',
                    this.session
                ));
                break;
            case 'domcontentloaded':
                this.emit('domcontentloaded', this);
                break;
            case 'load':
                this.emit('load', this);
                break;
            case 'popup':
                this.emit('popup', { url: data['url'] as string, target: data['target'] as string });
                break;
            case 'worker':
                this.emit('worker', new WorkerEvent(data['url'] as string));
                break;
            case 'websocket':
                this.emit('websocket', new WebSocketEvent(data['url'] as string));
                break;
            case 'filechooser':
                this.emit('filechooser', new FileChooser(data['multiple'] as boolean, data['accept'] as string, this.session));
                break;
            case 'frameattached': {
                const frameUrl = data['url'] as string;
                const frameName = data['name'] as string;
                const key = frameName || frameUrl;
                const af = new Frame(frameUrl, frameName);
                if (key) this._trackedFrames.set(key, af);
                this.emit('frameattached', af);
                break;
            }
            case 'framedetached': {
                const key = (data['name'] as string) || (data['url'] as string);
                const df = key ? (this._trackedFrames.get(key) ?? new Frame(data['url'] as string, data['name'] as string)) : new Frame(data['url'] as string, data['name'] as string);
                if (key) this._trackedFrames.delete(key);
                this.emit('framedetached', df);
                break;
            }
            case 'framenavigated': {
                const nUrl = data['url'] as string;
                const nName = data['name'] as string;
                const nKey = nName || nUrl;
                const existing = nKey ? this._trackedFrames.get(nKey) : undefined;
                if (existing) {
                    existing._setUrl(nUrl);
                    this.emit('framenavigated', existing);
                } else {
                    const nf = new Frame(nUrl, nName);
                    if (nKey) this._trackedFrames.set(nKey, nf);
                    this.emit('framenavigated', nf);
                }
                break;
            }
            case 'download':
                this.emit('download', new Download(data['url'] as string, data['suggestedFilename'] as string ?? ''));
                break;
        }
    }

    private _setupRequestHook(): void {
        this._requestHookSetup = true;
        const catchAll = new RequestFilterRule(() => true);
        this.session.requestHookEventProvider.addRequestEventListeners(
            catchAll,
            {
                onRequest: async (event: import('testcafe-hammerhead').RequestEvent) => {
                    const info = event._requestInfo;
                    if (info.url.startsWith('http://localhost')) return;
                    this._requestInfoMap.set(info.requestId, info);
                    this.emit('request', new Request(info));
                },
                onConfigureResponse: async () => {},
                onResponse: async (event: ResponseEvent) => {
                    if (event.isSameOriginPolicyFailed) return;
                    const info = this._requestInfoMap.get(event.requestId);
                    if (!info || info.url.startsWith('http://localhost')) return;
                    this._requestInfoMap.delete(event.requestId);
                    const headers: Record<string, string | string[]> = {};
                    if (event.headers) Object.assign(headers, event.headers);
                    const response = new PageResponse(info.url, event.statusCode, headers, event.body ?? Buffer.alloc(0));
                    this.emit('response', response);
                    this.emit('requestfinished', new Request(info));
                },
            },
            (err) => {
                const info = err as unknown as { requestInfo?: RequestInfo };
                if (info.requestInfo) this.emit('requestfailed', new Request(info.requestInfo));
            }
        ).catch(e => console.error('[page events] request hook setup failed:', e));
    }

    setDefaultTimeout(ms: number): void {
        this.defaultTimeout = ms;
        this.navigationTimeout = ms;
    }

    setDefaultNavigationTimeout(ms: number): void {
        this.navigationTimeout = ms;
    }

    // --- Navigation ---

    async goto(url: string, options?: GotoOptions): Promise<void> {
        return this._stepReporter(`page.goto(${JSON.stringify(url)})`, async () => {
            const timeout = options?.timeout ?? this.navigationTimeout;
            (this.session as unknown as { isReady: boolean }).isReady = false;
            const proxiedUrl = this.proxy.openSession(url, this.session, { url: '' });
            const readyPromise = this.session.waitForReady(timeout);
            this._openUrl(proxiedUrl);
            await readyPromise;
        });
    }

    async reload(options?: { timeout?: number }): Promise<void> {
        return this._stepReporter('page.reload()', async () => {
            const timeout = options?.timeout ?? this.navigationTimeout;
            (this.session as unknown as { isReady: boolean }).isReady = false;
            const readyPromise = this.session.waitForReady(timeout);
            await this.session.sendCommand({ type: 'evaluate', expression: 'location.reload()' }).catch(() => {});
            await readyPromise;
        });
    }

    async goBack(options?: { timeout?: number }): Promise<void> {
        return this._stepReporter('page.goBack()', async () => {
            const timeout = options?.timeout ?? this.navigationTimeout;
            (this.session as unknown as { isReady: boolean }).isReady = false;
            const readyPromise = this.session.waitForReady(timeout);
            await this.session.sendCommand({ type: 'evaluate', expression: 'history.back()' }).catch(() => {});
            await readyPromise;
        });
    }

    async goForward(options?: { timeout?: number }): Promise<void> {
        return this._stepReporter('page.goForward()', async () => {
            const timeout = options?.timeout ?? this.navigationTimeout;
            (this.session as unknown as { isReady: boolean }).isReady = false;
            const readyPromise = this.session.waitForReady(timeout);
            await this.session.sendCommand({ type: 'evaluate', expression: 'history.forward()' }).catch(() => {});
            await readyPromise;
        });
    }

    // --- Info ---

    async url(): Promise<string> {
        return this.session.sendCommand<string>({ type: 'url' });
    }

    async title(): Promise<string> {
        return this.session.sendCommand<string>({ type: 'title' });
    }

    async content(): Promise<string> {
        return this.session.sendCommand<string>({ type: 'content' });
    }

    async setContent(html: string, options?: { timeout?: number; waitUntil?: WaitUntilState }): Promise<void> {
        return this._stepReporter('page.setContent()', async () => {
            await this.session.sendCommand({
                type: 'evaluate',
                expression: `document.open(); document.write(${JSON.stringify(html)}); document.close();`,
            });
            await this.waitForLoadState(options?.waitUntil ?? 'load');
        });
    }

    async ariaSnapshot(options?: { timeout?: number }): Promise<string> {
        return this.session.sendCommand<string>({ type: 'ariaSnapshot', timeout: options?.timeout ?? this.defaultTimeout });
    }

    async viewportSize(): Promise<{ width: number; height: number }> {
        return this.evaluate<{ width: number; height: number }>(
            '({ width: window.innerWidth, height: window.innerHeight })'
        );
    }

    async setViewportSize(size: { width: number; height: number }): Promise<void> {
        return this._stepReporter(`page.setViewportSize(${JSON.stringify(size)})`, async () => {
            await this.evaluate(`(function() {
                var meta = document.querySelector('meta[name="viewport"]');
                if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.appendChild(meta); }
                meta.content = 'width=${size.width},initial-scale=1';
                var style = document.getElementById('__hh_viewport__');
                if (!style) { style = document.createElement('style'); style.id = '__hh_viewport__'; document.head.appendChild(style); }
                style.textContent = 'html,body{width:${size.width}px!important;height:${size.height}px!important;overflow:auto!important;}';
            })()`);
        });
    }

    // --- Context / Frames ---

    context(): BrowserContext {
        if (!this._browserContext) this._browserContext = new BrowserContext(this.session);
        return this._browserContext;
    }

    mainFrame(): Frame {
        if (!this._mainFrame) this._mainFrame = new Frame('', '', this.session, this.defaultTimeout);
        return this._mainFrame;
    }

    frames(): Frame[] {
        return [this.mainFrame(), ...this._trackedFrames.values()];
    }

    frame(options: { name?: string; url?: string | RegExp }): Frame | null {
        for (const f of this._trackedFrames.values()) {
            if (options.name && f.name() === options.name) return f;
            if (options.url) {
                const u = f.url();
                if (typeof options.url === 'string' ? u === options.url || u.includes(options.url) : options.url.test(u)) return f;
            }
        }
        return null;
    }

    // --- Locators ---

    locator(selector: string): Locator {
        return Locator.fromSelector(this.session, selector, this.defaultTimeout, this.expectTimeout, this._stepReporter, this);
    }

    frameLocator(selector: string): FrameLocator {
        return new FrameLocator(
            this.session,
            [{ kind: 'iframe', sel: selector }],
            this.defaultTimeout,
            this.expectTimeout,
            this._stepReporter,
            this,
        );
    }

    getByRole(_role: string, options?: { name?: string | RegExp }): Locator {
        if (options?.name) {
            const name = typeof options.name === 'string' ? options.name : options.name.source;
            return this.locator(`[role="${_role}"][aria-label*="${name}"], [role="${_role}"]:has-text("${name}")`);
        }
        return this.locator(`[role="${_role}"]`);
    }

    getByText(text: string | RegExp): Locator {
        const textStr = typeof text === 'string' ? text : text.source;
        return this.locator(`*:has-text("${textStr}")`);
    }

    getByLabel(text: string): Locator {
        return this.locator(`[aria-label="${text}"], label:has-text("${text}") + input, label:has-text("${text}") ~ input`);
    }

    getByPlaceholder(placeholder: string): Locator {
        return this.locator(`[placeholder="${placeholder}"]`);
    }

    getByTestId(testId: string): Locator {
        return this.locator(`[data-testid="${testId}"]`);
    }

    getByAltText(text: string | RegExp): Locator {
        const textStr = typeof text === 'string' ? text : text.source;
        return this.locator(`[alt="${textStr}"], [alt*="${textStr}"]`);
    }

    getByTitle(text: string | RegExp): Locator {
        const textStr = typeof text === 'string' ? text : text.source;
        return this.locator(`[title="${textStr}"]`);
    }

    // --- Direct element actions ---

    async click(selector: string, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).click(options);
    }

    async dblclick(selector: string, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).dblclick(options);
    }

    async tap(selector: string, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).tap(options);
    }

    async fill(selector: string, value: string, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).fill(value, options);
    }

    async type(selector: string, text: string, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).type(text, options);
    }

    async press(selector: string, key: string, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).press(key, options);
    }

    async selectOption(selector: string, values: string | string[]): Promise<string[]> {
        return this.locator(selector).selectOption(values);
    }

    async check(selector: string): Promise<void> {
        await this.locator(selector).check();
    }

    async uncheck(selector: string): Promise<void> {
        await this.locator(selector).uncheck();
    }

    async setChecked(selector: string, checked: boolean, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).setChecked(checked, options);
    }

    async setInputFiles(
        selector: string,
        files: FileInput,
        options?: { timeout?: number }
    ): Promise<void> {
        return this._stepReporter(`page.setInputFiles(${JSON.stringify(selector)})`, async () => {
            const arr = Array.isArray(files) ? files : [files];
            const payloads: FilePayload[] = arr.map(f => {
                if (typeof f === 'string') {
                    const buf = readFileSync(f);
                    const name = f.split('/').pop() ?? f;
                    return { name, mimeType: 'application/octet-stream', buffer: buf };
                }
                return f;
            });
            const serialized = payloads.map(p => ({
                name: p.name,
                mimeType: p.mimeType,
                base64: p.buffer.toString('base64'),
            }));
            const loc = this.locator(selector);
            await loc.waitFor({ timeout: options?.timeout ?? this.defaultTimeout });
            await this.session.sendCommand({
                type: 'evaluate',
                expression: `(function() {
                    var payloads = ${JSON.stringify(serialized)};
                    var els = resolveSteps(${JSON.stringify(loc['_steps'])});
                    var el = els[0];
                    if (!el) throw new Error('Element not found for setInputFiles');
                    var dt = new DataTransfer();
                    payloads.forEach(function(p) {
                        var bytes = atob(p.base64);
                        var arr = new Uint8Array(bytes.length);
                        for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
                        var file = new File([arr], p.name, { type: p.mimeType });
                        dt.items.add(file);
                    });
                    Object.defineProperty(el, 'files', { value: dt.files, configurable: true });
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                })()`,
            });
        });
    }

    async hover(selector: string, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).hover(options);
    }

    async focus(selector: string): Promise<void> {
        await this.locator(selector).focus();
    }

    // --- Direct element queries ---

    async getAttribute(selector: string, name: string): Promise<string | null> {
        return this.locator(selector).getAttribute(name);
    }

    async textContent(selector: string): Promise<string | null> {
        return this.locator(selector).textContent();
    }

    async innerHTML(selector: string): Promise<string> {
        return this.locator(selector).innerHTML();
    }

    async innerText(selector: string): Promise<string> {
        return this.locator(selector).innerText();
    }

    async inputValue(selector: string): Promise<string> {
        return this.locator(selector).inputValue();
    }

    async isVisible(selector: string): Promise<boolean> {
        return this.locator(selector).isVisible();
    }

    async isHidden(selector: string): Promise<boolean> {
        return this.locator(selector).isHidden();
    }

    async isEnabled(selector: string): Promise<boolean> {
        return this.locator(selector).isEnabled();
    }

    async isDisabled(selector: string): Promise<boolean> {
        return this.locator(selector).isDisabled();
    }

    async isChecked(selector: string): Promise<boolean> {
        return this.locator(selector).isChecked();
    }

    async isEditable(selector: string): Promise<boolean> {
        return this.locator(selector).isEditable();
    }

    isClosed(): boolean {
        return this._closed;
    }

    // --- Waiting ---

    async waitForSelector(selector: string, options?: WaitForSelectorOptions): Promise<Locator> {
        const loc = this.locator(selector);
        await loc.waitFor(options);
        return loc;
    }

    async waitForTimeout(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async waitForLoadState(state: WaitUntilState = 'load'): Promise<void> {
        if (state === 'networkidle') {
            await this.waitForLoadState('load');
            await this.waitForTimeout(500);
            return;
        }
        const readyStateOk = state === 'domcontentloaded'
            ? `['interactive','complete'].indexOf(document.readyState) !== -1`
            : `document.readyState === 'complete'`;
        const eventName = state === 'domcontentloaded' ? 'DOMContentLoaded' : 'load';
        await this.session.sendCommand({
            type: 'evaluate',
            expression: `new Promise(function(resolve) {
                if (${readyStateOk}) { resolve(); return; }
                window.addEventListener(${JSON.stringify(eventName)}, resolve, { once: true });
            })`,
        });
    }

    async waitForNavigation(options?: { timeout?: number; waitUntil?: WaitUntilState }): Promise<void> {
        const timeout = options?.timeout ?? this.navigationTimeout;
        (this.session as unknown as { isReady: boolean }).isReady = false;
        await this.session.waitForReady(timeout);
        await this.waitForLoadState(options?.waitUntil ?? 'load');
    }

    async waitForURL(url: string | RegExp, options?: { timeout?: number }): Promise<void> {
        const timeout = options?.timeout ?? this.defaultTimeout;
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const current = await this.url();
            const matches = typeof url === 'string' ? current.includes(url) : url.test(current);
            if (matches) return;
            await new Promise(r => setTimeout(r, 200));
        }
        throw new Error(`Timeout ${timeout}ms waiting for URL: ${url}`);
    }

    async waitForEvent(event: string, options?: { timeout?: number }): Promise<unknown> {
        const timeout = options?.timeout ?? this.defaultTimeout;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                (this as unknown as EventEmitter).off(event, handler);
                reject(new Error(`Timeout ${timeout}ms waiting for event: ${event}`));
            }, timeout);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const handler = (data: any) => { clearTimeout(timer); resolve(data); };
            (this as unknown as EventEmitter).once(event, handler);
        });
    }

    async waitForFunction<T = unknown>(
        fn: (() => T) | string,
        options?: { timeout?: number; polling?: number }
    ): Promise<T> {
        const timeout = options?.timeout ?? this.defaultTimeout;
        const polling = options?.polling ?? 100;
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const result = await this.evaluate(fn as () => T);
            if (result) return result;
            await new Promise(r => setTimeout(r, polling));
        }
        throw new Error(`Timeout ${timeout}ms waiting for function to return truthy`);
    }

    async waitForRequest(
        urlOrPredicate: string | RegExp | ((request: Request) => boolean),
        options?: { timeout?: number }
    ): Promise<Request> {
        const timeout = options?.timeout ?? this.defaultTimeout;
        if (!this._requestHookSetup) this._setupRequestHook();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off('request', handler);
                reject(new Error(`Timeout ${timeout}ms waiting for request`));
            }, timeout);
            const handler = (request: Request) => {
                const u = request.url();
                const matches = typeof urlOrPredicate === 'function'
                    ? urlOrPredicate(request)
                    : urlOrPredicate instanceof RegExp
                        ? urlOrPredicate.test(u)
                        : u.includes(urlOrPredicate);
                if (matches) { clearTimeout(timer); this.off('request', handler); resolve(request); }
            };
            this.on('request', handler);
        });
    }

    async waitForResponse(
        urlOrPredicate: string | RegExp | ((response: PageResponse) => boolean),
        options?: { timeout?: number }
    ): Promise<PageResponse> {
        const timeout = options?.timeout ?? this.defaultTimeout;
        if (!this._requestHookSetup) this._setupRequestHook();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off('response', handler);
                reject(new Error(`Timeout ${timeout}ms waiting for response`));
            }, timeout);
            const handler = (response: PageResponse) => {
                const u = response.url();
                const matches = typeof urlOrPredicate === 'function'
                    ? urlOrPredicate(response)
                    : urlOrPredicate instanceof RegExp
                        ? urlOrPredicate.test(u)
                        : u.includes(urlOrPredicate);
                if (matches) { clearTimeout(timer); this.off('response', handler); resolve(response); }
            };
            this.on('response', handler);
        });
    }

    // --- Evaluation ---

    async evaluate<T>(fn: ((...args: unknown[]) => T) | string, ...args: unknown[]): Promise<T> {
        const expression = typeof fn === 'function'
            ? `(${fn.toString()})(${args.map(a => JSON.stringify(a)).join(',')})`
            : fn;
        return this.session.sendCommand<T>({ type: 'evaluate', expression });
    }

    async evaluateHandle(fn: ((...args: unknown[]) => unknown) | string, ...args: unknown[]): Promise<unknown> {
        return this.evaluate(fn as (...args: unknown[]) => unknown, ...args);
    }

    async dispatchEvent(selector: string, type: string, eventInit?: Record<string, unknown>, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).dispatchEvent(type, eventInit, options);
    }

    async dragAndDrop(source: string, target: string, options?: { timeout?: number }): Promise<void> {
        await this.locator(source).dragTo(this.locator(target), options);
    }

    async exposeFunction(name: string, fn: (...args: unknown[]) => unknown): Promise<void> {
        this.session.registerExposedFunction(name, fn);
        const wrapper = `(function() {
            window[${JSON.stringify(name)}] = function() {
                var args = Array.prototype.slice.call(arguments);
                return window.__hhBridge('bridge_expose_call', { expName: ${JSON.stringify(name)}, args: args }, 30000)
                    .then(function(r) { return r && 'value' in r ? r.value : undefined; });
            };
        })()`;
        await this.addInitScript(wrapper);
        await this.evaluate(wrapper).catch(() => {});
    }

    async setExtraHTTPHeaders(headers: Record<string, string>): Promise<void> {
        const script = `(function() {
            var extra = ${JSON.stringify(headers)};
            var OrigOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function() { this.__hhExtra = extra; return OrigOpen.apply(this, arguments); };
            var OrigSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function() {
                var self = this;
                if (self.__hhExtra) Object.keys(self.__hhExtra).forEach(function(k) { self.setRequestHeader(k, self.__hhExtra[k]); });
                return OrigSend.apply(self, arguments);
            };
            if (typeof window.fetch === 'function') {
                var OrigFetch = window.fetch;
                window.fetch = function(input, init) {
                    init = Object.assign({}, init);
                    init.headers = Object.assign({}, extra, init.headers || {});
                    return OrigFetch.call(window, input, init);
                };
            }
        })()`;
        await this.addInitScript(script);
        await this.evaluate(script).catch(() => {});
    }

    // --- Routing ---

    async route(pattern: UrlPattern, handler: RouteHandler, options?: RouteOptions): Promise<void> {
        const rule = patternToRule(pattern);
        const debug = options?.debug ?? false;

        await this.session.requestHookEventProvider.addRequestEventListeners(
            rule,
            {
                onRequest: async (event: import('testcafe-hammerhead').RequestEvent) => {
                    const req = new Request(event._requestInfo);
                    if (debug) {
                        console.log(`[page.route] matched pattern=${String(pattern)} url=${req.url()} method=${req.method()}`);
                    }
                    const route = new Route(event, req);
                    await handler(route, req);
                },
                onConfigureResponse: async () => {},
                onResponse: async () => {},
            },
            (err) => { console.error('[page.route] handler error:', err.error); }
        );

        this._routes.push({ pattern, rule, handler });
    }

    async unrouteAll(): Promise<void> {
        await this.unroute();
    }

    async unroute(pattern?: UrlPattern, handler?: RouteHandler): Promise<void> {
        if (pattern === undefined) {
            for (const entry of this._routes) {
                await this.session.requestHookEventProvider.removeRequestEventListeners(entry.rule);
            }
            this._routes.length = 0;
            return;
        }

        const toRemove = this._routes.filter(
            (e) => e.pattern === pattern && (handler === undefined || e.handler === handler)
        );
        for (const entry of toRemove) {
            await this.session.requestHookEventProvider.removeRequestEventListeners(entry.rule);
            this._routes.splice(this._routes.indexOf(entry), 1);
        }
    }

    // --- Init scripts & handlers ---

    async addInitScript(script: string | ((...args: unknown[]) => unknown), arg?: unknown): Promise<void> {
        const scriptStr = typeof script === 'function'
            ? `(${script.toString()})(${arg !== undefined ? JSON.stringify(arg) : ''})`
            : script;
        this.session.addInitScript(scriptStr);
    }

    async addLocatorHandler(locator: Locator, handler: () => Promise<void>): Promise<void> {
        let running = false;
        const interval = setInterval(async () => {
            if (running) return;
            try {
                const visible = await locator.isVisible();
                if (visible) {
                    running = true;
                    try { await handler(); } finally { running = false; }
                }
            } catch { running = false; }
        }, 500);
        this._locatorHandlers.set(locator, interval);
    }

    async removeLocatorHandler(locator: Locator): Promise<void> {
        const interval = this._locatorHandlers.get(locator);
        if (interval !== undefined) {
            clearInterval(interval);
            this._locatorHandlers.delete(locator);
        }
    }

    // --- Script / style injection ---

    async addScriptTag(options: ScriptTagOptions): Promise<void> {
        let content = options.content;
        if (options.path) content = readFileSync(options.path, 'utf-8');

        if (content !== undefined) {
            const typeAttr = options.type ? `s.type = ${JSON.stringify(options.type)};` : '';
            await this.evaluate(`
                (function() {
                    var s = document.createElement('script');
                    ${typeAttr}
                    s.textContent = ${JSON.stringify(content)};
                    document.head.appendChild(s);
                    return null;
                })()
            `);
        } else if (options.url) {
            const typeAttr = options.type ? `s.type = ${JSON.stringify(options.type)};` : '';
            await this.evaluate(`
                new Promise(function(resolve, reject) {
                    var s = document.createElement('script');
                    ${typeAttr}
                    s.onload = function() { resolve(null); };
                    s.onerror = function() { reject(new Error('Failed to load script: ' + s.src)); };
                    s.src = ${JSON.stringify(options.url)};
                    document.head.appendChild(s);
                })
            `);
        }
    }

    async addStyleTag(options: StyleTagOptions): Promise<void> {
        let content = options.content;
        if (options.path) content = readFileSync(options.path, 'utf-8');

        if (content !== undefined) {
            await this.evaluate(`
                (function() {
                    var s = document.createElement('style');
                    s.textContent = ${JSON.stringify(content)};
                    document.head.appendChild(s);
                    return null;
                })()
            `);
        } else if (options.url) {
            await this.evaluate(`
                new Promise(function(resolve, reject) {
                    var link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.onload = function() { resolve(null); };
                    link.onerror = function() { reject(new Error('Failed to load stylesheet: ' + link.href)); };
                    link.href = ${JSON.stringify(options.url)};
                    document.head.appendChild(link);
                })
            `);
        }
    }

    // --- Screenshot via modern-screenshot ---

    async screenshot(options?: ScreenshotOptions): Promise<Buffer> {
        const libCode = getModernScreenshotCode();
        const isJpeg = options?.type === 'jpeg';
        const quality = options?.quality ?? (isJpeg ? 0.92 : 1);
        const msType = isJpeg ? 'image/jpeg' : 'image/png';
        const fullPage = options?.fullPage ?? false;

        const expression = `
            new Promise(function(resolve, reject) {
                try {
                    if (!window.__modernScreenshotLoaded) {
                        var s = document.createElement('script');
                        s.textContent = ${JSON.stringify(libCode)};
                        document.head.appendChild(s);
                        window.__modernScreenshotLoaded = true;
                    }
                    var target = document.documentElement;
                    var opts = { type: ${JSON.stringify(msType)}, quality: ${quality} };
                    if (${fullPage}) {
                        opts.width = document.documentElement.scrollWidth;
                        opts.height = document.documentElement.scrollHeight;
                    }
                    var fn = ${isJpeg} ? window.modernScreenshot.domToJpeg : window.modernScreenshot.domToPng;
                    fn(target, opts).then(resolve).catch(reject);
                } catch(e) { reject(e instanceof Error ? e.message : String(e)); }
            })
        `;

        const dataUrl = await this.session.sendCommand<string>({ type: 'evaluate', expression });
        if (!dataUrl || typeof dataUrl !== 'string') return Buffer.alloc(0);

        const base64 = dataUrl.split(',')[1] ?? '';
        const buffer = Buffer.from(base64, 'base64');

        if (options?.path) writeFileSync(options.path, buffer);

        return buffer;
    }

    // --- Scroll ---

    async scrollTo(x: number, y: number): Promise<void> {
        await this.session.sendCommand({ type: 'scrollTo', x, y });
    }

    // --- Lifecycle ---

    protected _openUrl(proxiedUrl: string): void {
        openSafariAtUrl(proxiedUrl);
    }

    protected _closeBrowser(): void {
        closeSafariWindowByUrlFragment(this.session.id);
    }

    async close(): Promise<void> {
        if (this._closed) return;
        this._closed = true;
        for (const interval of this._locatorHandlers.values()) clearInterval(interval);
        this._locatorHandlers.clear();
        this.emit('close');
        this.removeAllListeners();
        this.proxy.closeSession(this.session);
        this._closeBrowser();
    }
}
