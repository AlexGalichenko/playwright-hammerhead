import { readFileSync } from 'fs';
import { BridgeSession } from '../session/bridge-session';
import { Locator } from './locator';

type WaitUntilState = 'domcontentloaded' | 'load' | 'networkidle';
type FilePayload = { name: string; mimeType: string; buffer: Buffer };
type FileInput = string | FilePayload | (string | FilePayload)[];

export class ConsoleMessage {
    constructor(
        private readonly _type: string,
        private readonly _args: string[]
    ) {}
    type(): string { return this._type; }
    text(): string { return this._args.join(' '); }
    args(): string[] { return this._args; }
}

export class Dialog {
    constructor(
        private readonly _type: 'alert' | 'confirm' | 'prompt',
        private readonly _message: string,
        private readonly _defaultValue: string,
        private readonly session: BridgeSession
    ) {}

    type(): 'alert' | 'confirm' | 'prompt' { return this._type; }
    message(): string { return this._message; }
    defaultValue(): string { return this._defaultValue; }

    async accept(promptText?: string): Promise<void> {
        const val = promptText ?? this._defaultValue;
        await this.session.sendCommand({
            type: 'evaluate',
            expression: `window.__hhDialogDefaults = { confirm: true, prompt: ${JSON.stringify(val)} };`,
        });
    }

    async dismiss(): Promise<void> {
        await this.session.sendCommand({
            type: 'evaluate',
            expression: `window.__hhDialogDefaults = { confirm: false, prompt: null };`,
        });
    }
}

export class Download {
    constructor(
        private readonly _url: string,
        private readonly _suggestedFilename: string
    ) {}
    url(): string { return this._url; }
    suggestedFilename(): string { return this._suggestedFilename; }
}

export class Frame {
    private _url: string;

    constructor(
        url: string,
        private readonly _name: string,
        private readonly _session?: BridgeSession,
        private readonly _defaultTimeout: number = 30000,
    ) {
        this._url = url;
    }

    url(): string { return this._url; }
    name(): string { return this._name; }

    _setUrl(url: string): void { this._url = url; }

    async title(): Promise<string> {
        if (!this._session) return '';
        return this._session.sendCommand<string>({ type: 'title' });
    }

    async content(): Promise<string> {
        if (!this._session) return '';
        return this._session.sendCommand<string>({ type: 'content' });
    }

    async evaluate<T>(fn: ((...args: unknown[]) => T) | string, ...args: unknown[]): Promise<T> {
        if (!this._session) throw new Error('Frame is detached');
        const expression = typeof fn === 'function'
            ? `(${fn.toString()})(${args.map(a => JSON.stringify(a)).join(', ')})`
            : fn;
        return this._session.sendCommand<T>({ type: 'evaluate', expression });
    }

    locator(selector: string): Locator {
        if (!this._session) throw new Error('Frame is detached');
        return Locator.fromSelector(this._session, selector, this._defaultTimeout, 5000);
    }

    async waitForLoadState(state: WaitUntilState = 'load', options?: { timeout?: number }): Promise<void> {
        if (!this._session) return;
        const deadline = Date.now() + (options?.timeout ?? this._defaultTimeout);
        const valid = state === 'load' ? ['complete'] : ['interactive', 'complete'];
        while (Date.now() < deadline) {
            const rs = await this._session.sendCommand<string>({ type: 'evaluate', expression: 'document.readyState' });
            if (valid.includes(rs)) return;
            await new Promise(r => setTimeout(r, 100));
        }
    }

    async goto(url: string, options?: { timeout?: number }): Promise<void> {
        if (!this._session) throw new Error('Frame is detached');
        await this._session.sendCommand({ type: 'evaluate', expression: `location.href = ${JSON.stringify(url)}` });
        await this.waitForLoadState('load', options);
    }
}

export class FileChooser {
    constructor(
        private readonly _multiple: boolean,
        private readonly _accept: string,
        private readonly _session: BridgeSession,
    ) {}

    isMultiple(): boolean { return this._multiple; }
    accept(): string { return this._accept; }

    async setFiles(files: FileInput): Promise<void> {
        const arr = Array.isArray(files) ? files : [files];
        const payloads: FilePayload[] = arr.map(f => {
            if (typeof f === 'string') {
                const buf = readFileSync(f);
                return { name: f.split('/').pop() ?? f, mimeType: 'application/octet-stream', buffer: buf };
            }
            return f;
        });
        const serialized = payloads.map(p => ({
            name: p.name, mimeType: p.mimeType, base64: p.buffer.toString('base64'),
        }));
        await this._session.sendCommand({
            type: 'evaluate',
            expression: `(function() {
                var el = window.__hhLastFileInput;
                if (!el) throw new Error('No pending file chooser');
                var payloads = ${JSON.stringify(serialized)};
                var dt = new DataTransfer();
                payloads.forEach(function(p) {
                    var bytes = atob(p.base64);
                    var arr = new Uint8Array(bytes.length);
                    for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
                    dt.items.add(new File([arr], p.name, { type: p.mimeType }));
                });
                Object.defineProperty(el, 'files', { value: dt.files, configurable: true });
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                window.__hhLastFileInput = null;
            })()`,
        });
    }
}

export class WebSocketEvent {
    constructor(private readonly _url: string) {}
    url(): string { return this._url; }
}

export class WorkerEvent {
    constructor(private readonly _url: string) {}
    url(): string { return this._url; }
}

export class PageResponse {
    constructor(
        private readonly _url: string,
        private readonly _status: number,
        private readonly _headers: Record<string, string | string[]>,
        private readonly _body: Buffer
    ) {}
    url(): string { return this._url; }
    status(): number { return this._status; }
    ok(): boolean { return this._status >= 200 && this._status < 300; }
    headers(): Record<string, string | string[]> { return this._headers; }
    async body(): Promise<Buffer> { return this._body; }
    async text(): Promise<string> { return this._body.toString('utf-8'); }
    async json(): Promise<unknown> { return JSON.parse(this._body.toString('utf-8')); }
}
