import type { BridgeSession } from '../session/bridge-session';

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
    constructor(
        private readonly _url: string,
        private readonly _name: string
    ) {}
    url(): string { return this._url; }
    name(): string { return this._name; }
}

export class FileChooser {
    constructor(
        private readonly _multiple: boolean,
        private readonly _accept: string
    ) {}
    isMultiple(): boolean { return this._multiple; }
    accept(): string { return this._accept; }
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
