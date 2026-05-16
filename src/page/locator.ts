import { writeFileSync } from 'fs';
import { BridgeSession } from '../session/bridge-session';
import { getModernScreenshotCode } from '../utils/screenshot';

export type LocatorState = 'visible' | 'hidden' | 'attached' | 'detached';

export interface LocatorFilter {
    hasText?: string | RegExp;
    hasNotText?: string | RegExp;
    has?: Locator;
    hasNot?: Locator;
}

type SerializedText = string | { source: string; flags: string };

export class Locator {
    readonly selector: string;
    readonly _expectTimeout: number;

    constructor(
        private readonly session: BridgeSession,
        selector: string,
        private readonly defaultTimeout: number = 30000,
        private readonly _filter?: LocatorFilter,
        private readonly _nth?: number,
        _expectTimeout: number = 5000,
    ) {
        this.selector = selector;
        this._expectTimeout = _expectTimeout;
    }

    private get _cssSel(): string {
        let sel = this.selector;
        if (this._filter?.has) sel += `:has(${this._filter.has.selector})`;
        if (this._filter?.hasNot) sel += `:not(:has(${this._filter.hasNot.selector}))`;
        return sel;
    }

    private _serText(v: string | RegExp): SerializedText {
        return v instanceof RegExp ? { source: v.source, flags: v.flags } : v;
    }

    private _filterExtras(): Record<string, unknown> {
        const extras: Record<string, unknown> = {};
        if (this._filter?.hasText !== undefined) extras.hasText = this._serText(this._filter.hasText);
        if (this._filter?.hasNotText !== undefined) extras.hasNotText = this._serText(this._filter.hasNotText);
        return extras;
    }

    private async _nthForCmd(): Promise<number | undefined> {
        if (this._nth !== undefined) return this._nth;
        if (this._filter?.hasText === undefined && this._filter?.hasNotText === undefined) return undefined;
        const indices = await this.session.sendCommand<number[]>({
            type: 'filterIndices',
            selector: this._cssSel,
            ...this._filterExtras(),
        });
        if (indices.length === 0) throw new Error(`Locator '${this.selector}': no element matched filter`);
        return indices[0];
    }

    // --- Clicks ---

    async click(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'click',
            selector: this._cssSel,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async dblclick(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'dblclick',
            selector: this._cssSel,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    // --- Typing ---

    async fill(value: string, options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'fill',
            selector: this._cssSel,
            value,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async type(text: string, options?: { timeout?: number; delay?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'type',
            selector: this._cssSel,
            text,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async clear(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'clear',
            selector: this._cssSel,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async pressSequentially(text: string, options?: { delay?: number }): Promise<void> {
        await this.type(text, options);
    }

    async press(key: string, options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'press',
            selector: this._cssSel,
            key,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    // --- State queries ---

    async isVisible(): Promise<boolean> {
        return this.session.sendCommand<boolean>({
            type: 'isVisible',
            selector: this._cssSel,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async isHidden(): Promise<boolean> {
        return !(await this.isVisible());
    }

    async isEnabled(): Promise<boolean> {
        return this.session.sendCommand<boolean>({
            type: 'isEnabled',
            selector: this._cssSel,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async isDisabled(): Promise<boolean> {
        return !(await this.isEnabled());
    }

    async isChecked(): Promise<boolean> {
        return this.session.sendCommand<boolean>({
            type: 'isChecked',
            selector: this._cssSel,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async isEditable(): Promise<boolean> {
        return this.session.sendCommand<boolean>({
            type: 'isEditable',
            selector: this._cssSel,
            nthOfAll: await this._nthForCmd(),
        });
    }

    // --- Content ---

    async textContent(): Promise<string | null> {
        return this.session.sendCommand<string | null>({
            type: 'textContent',
            selector: this._cssSel,
            timeout: this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async innerText(): Promise<string> {
        return this.session.sendCommand<string>({
            type: 'innerText',
            selector: this._cssSel,
            timeout: this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async innerHTML(): Promise<string> {
        return this.session.sendCommand<string>({
            type: 'innerHTML',
            selector: this._cssSel,
            timeout: this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async inputValue(): Promise<string> {
        return this.session.sendCommand<string>({
            type: 'inputValue',
            selector: this._cssSel,
            timeout: this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async getAttribute(name: string): Promise<string | null> {
        return this.session.sendCommand<string | null>({
            type: 'getAttribute',
            selector: this._cssSel,
            name,
            timeout: this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    // --- Actions ---

    async hover(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'hover',
            selector: this._cssSel,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async focus(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'focus',
            selector: this._cssSel,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async blur(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'blur',
            selector: this._cssSel,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async scrollIntoViewIfNeeded(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'scrollIntoView',
            selector: this._cssSel,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async selectOption(values: string | string[], options?: { timeout?: number }): Promise<string[]> {
        return this.session.sendCommand<string[]>({
            type: 'selectOption',
            selector: this._cssSel,
            values: Array.isArray(values) ? values : [values],
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async check(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'check',
            selector: this._cssSel,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async uncheck(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'uncheck',
            selector: this._cssSel,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async setChecked(checked: boolean, options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'setChecked',
            selector: this._cssSel,
            checked,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async dispatchEvent(type: string, eventInit?: Record<string, unknown>, options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'dispatchEvent',
            selector: this._cssSel,
            eventType: type,
            eventInit: eventInit ?? {},
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async boundingBox(options?: { timeout?: number }): Promise<{ x: number; y: number; width: number; height: number } | null> {
        return this.session.sendCommand<{ x: number; y: number; width: number; height: number } | null>({
            type: 'boundingBox',
            selector: this._cssSel,
            timeout: options?.timeout ?? this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    // --- Waiting ---

    async waitFor(options?: { state?: LocatorState; timeout?: number }): Promise<void> {
        const state = options?.state ?? 'visible';
        const timeout = options?.timeout ?? this.defaultTimeout;

        if (state === 'visible' || state === 'attached') {
            await this.session.sendCommand({
                type: 'waitForSelector',
                selector: this._cssSel,
                timeout,
                nthOfAll: await this._nthForCmd(),
            });
        } else if (state === 'hidden') {
            const deadline = Date.now() + timeout;
            while (Date.now() < deadline) {
                if (await this.isVisible() === false) return;
                await new Promise(r => setTimeout(r, 100));
            }
            throw new Error(`Timeout ${timeout}ms waiting for '${this.selector}' to be hidden`);
        } else if (state === 'detached') {
            const deadline = Date.now() + timeout;
            while (Date.now() < deadline) {
                if (await this.count() === 0) return;
                await new Promise(r => setTimeout(r, 100));
            }
            throw new Error(`Timeout ${timeout}ms waiting for '${this.selector}' to be detached`);
        }
    }

    // --- Count / nth / filter ---

    async count(): Promise<number> {
        const hasTextFilter = this._filter?.hasText !== undefined || this._filter?.hasNotText !== undefined;
        if (hasTextFilter) {
            const indices = await this.session.sendCommand<number[]>({
                type: 'filterIndices',
                selector: this._cssSel,
                ...this._filterExtras(),
            });
            return indices.length;
        }
        return this.session.sendCommand<number>({ type: 'count', selector: this._cssSel });
    }

    nth(index: number): Locator {
        return new Locator(this.session, `:is(${this.selector}):nth-child(${index + 1})`, this.defaultTimeout, undefined, undefined, this._expectTimeout);
    }

    first(): Locator {
        return new Locator(this.session, `:is(${this.selector}):first-child`, this.defaultTimeout, undefined, undefined, this._expectTimeout);
    }

    last(): Locator {
        return new Locator(this.session, `:is(${this.selector}):last-child`, this.defaultTimeout, undefined, undefined, this._expectTimeout);
    }

    locator(subSelector: string): Locator {
        return new Locator(this.session, `${this.selector} ${subSelector}`, this.defaultTimeout, undefined, undefined, this._expectTimeout);
    }

    filter(options: LocatorFilter): Locator {
        return new Locator(this.session, this.selector, this.defaultTimeout, { ...this._filter, ...options }, undefined, this._expectTimeout);
    }

    async all(): Promise<Locator[]> {
        const hasTextFilter = this._filter?.hasText !== undefined || this._filter?.hasNotText !== undefined;
        if (hasTextFilter) {
            const indices = await this.session.sendCommand<number[]>({
                type: 'filterIndices',
                selector: this._cssSel,
                ...this._filterExtras(),
            });
            return indices.map(i => new Locator(this.session, this._cssSel, this.defaultTimeout, undefined, i, this._expectTimeout));
        }
        const count = await this.session.sendCommand<number>({ type: 'count', selector: this._cssSel });
        return Array.from({ length: count }, (_, i) => new Locator(this.session, this._cssSel, this.defaultTimeout, undefined, i, this._expectTimeout));
    }

    async allTextContents(): Promise<string[]> {
        return this.session.sendCommand<string[]>({
            type: 'allTextContents',
            selector: this._cssSel,
            ...this._filterExtras(),
        });
    }

    async allInnerTexts(): Promise<string[]> {
        return this.session.sendCommand<string[]>({
            type: 'allInnerTexts',
            selector: this._cssSel,
            ...this._filterExtras(),
        });
    }

    // --- Evaluation ---

    async evaluate<T>(fn: (element: unknown, ...args: unknown[]) => T, ...args: unknown[]): Promise<T> {
        return this.session.sendCommand<T>({
            type: 'locatorEvaluate',
            selector: this._cssSel,
            fn: fn.toString(),
            args,
            timeout: this.defaultTimeout,
            nthOfAll: await this._nthForCmd(),
        });
    }

    async evaluateAll<T>(fn: (elements: unknown[], ...args: unknown[]) => T, ...args: unknown[]): Promise<T> {
        return this.session.sendCommand<T>({
            type: 'evaluateAll',
            selector: this._cssSel,
            fn: fn.toString(),
            args,
            ...this._filterExtras(),
        });
    }

    // --- Composition ---

    and(other: Locator): Locator {
        return new Locator(this.session, `:is(${this.selector}):is(${other.selector})`, this.defaultTimeout, undefined, undefined, this._expectTimeout);
    }

    or(other: Locator): Locator {
        return new Locator(this.session, `:is(${this.selector}), :is(${other.selector})`, this.defaultTimeout, undefined, undefined, this._expectTimeout);
    }

    // --- Drag ---

    async dragTo(target: Locator, options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'dragTo',
            srcSelector: this._cssSel,
            tgtSelector: target._cssSel,
            srcNth: await this._nthForCmd(),
            tgtNth: await target._nthForCmd(),
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    // --- Screenshot ---

    async screenshot(options?: { path?: string; type?: 'png' | 'jpeg'; quality?: number }): Promise<Buffer> {
        const libCode = getModernScreenshotCode();
        const isJpeg = options?.type === 'jpeg';
        const quality = options?.quality ?? (isJpeg ? 0.92 : 1);
        const nthOfAll = await this._nthForCmd();
        const targetExpr = nthOfAll !== undefined
            ? `document.querySelectorAll(${JSON.stringify(this._cssSel)})[${nthOfAll}]`
            : `document.querySelector(${JSON.stringify(this._cssSel)})`;

        const expression = `
            new Promise(function(resolve, reject) {
                try {
                    if (!window.__modernScreenshotLoaded) {
                        var s = document.createElement('script');
                        s.textContent = ${JSON.stringify(libCode)};
                        document.head.appendChild(s);
                        window.__modernScreenshotLoaded = true;
                    }
                    var target = ${targetExpr};
                    if (!target) { reject(new Error('Element not found')); return; }
                    var fn = ${isJpeg} ? window.modernScreenshot.domToJpeg : window.modernScreenshot.domToPng;
                    fn(target, { type: ${JSON.stringify(isJpeg ? 'image/jpeg' : 'image/png')}, quality: ${quality} }).then(resolve).catch(reject);
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
}
