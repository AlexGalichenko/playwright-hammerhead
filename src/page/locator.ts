import { writeFileSync } from 'fs';
import { BridgeSession } from '../session/bridge-session';
import { buildScreenshotExpression, decodeScreenshotDataUrl } from '../utils/screenshot';
import { serializeFiles, fileTransferScript } from '../utils/files';
import type { FilePayload, FileInput } from '../utils/files';
import type { Page } from './page';

export type StepReporter = <T>(title: string, fn: () => Promise<T>) => Promise<T>;

const noopReporter: StepReporter = (_, fn) => fn();

export type LocatorState = 'visible' | 'hidden' | 'attached' | 'detached' | 'actionable';

export interface LocatorFilter {
    hasText?: string | RegExp;
    hasNotText?: string | RegExp;
    has?: Locator;
    hasNot?: Locator;
}

type SerializedText = string | { source: string; flags: string };

// A selector chain step. Steps are executed sequentially in the browser:
//   css    — querySelectorAll within current context elements
//   nth    — pick one element by index (negative counts from end)
//   filter — narrow the set by text / child-locator presence
//   and    — intersect with an independently-resolved locator
//   or     — union with an independently-resolved locator
//   iframe — cross into an iframe's contentDocument (used by FrameLocator)
export type SelectorStep =
    | { kind: 'css';         sel: string }
    | { kind: 'xpath';       expr: string }
    | { kind: 'nth';         index: number }
    | { kind: 'filter';      hasText?: SerializedText; hasNotText?: SerializedText; hasSteps?: SelectorStep[]; hasNotSteps?: SelectorStep[] }
    | { kind: 'and';         steps: SelectorStep[] }
    | { kind: 'or';          steps: SelectorStep[] }
    | { kind: 'iframe';      sel: string; index?: number }
    | { kind: 'getByLabel';  text: string }
    | { kind: 'getByAttr';   attr: string; value: SerializedText };

export class Locator {
    readonly _steps: SelectorStep[];
    readonly _expectTimeout: number;
    readonly _stepReporter: StepReporter;
    private readonly _page: Page | undefined;

    /** First CSS or XPath selector in the chain — kept for error messages. */
    get selector(): string {
        const first = this._steps.find(s => s.kind === 'css' || s.kind === 'xpath');
        if (!first) return '';
        if (first.kind === 'css') return first.sel;
        if (first.kind === 'xpath') return 'xpath=' + first.expr;
        return '';
    }

    constructor(
        private readonly session: BridgeSession,
        steps: SelectorStep[],
        private readonly defaultTimeout: number = 30000,
        _expectTimeout: number = 5000,
        stepReporter: StepReporter = noopReporter,
        page?: Page,
    ) {
        this._steps = steps;
        this._expectTimeout = _expectTimeout;
        this._stepReporter = stepReporter;
        this._page = page;
    }

    page(): Page {
        if (!this._page) throw new Error('Locator is not attached to a page');
        return this._page;
    }

    toString(): string {
        return this._description();
    }

    _description(): string {
        let result = '';
        for (const step of this._steps) {
            if (step.kind === 'css') {
                result = result
                    ? `${result}.locator(${JSON.stringify(step.sel)})`
                    : `locator(${JSON.stringify(step.sel)})`;
            } else if (step.kind === 'xpath') {
                result = result
                    ? `${result}.locator(${JSON.stringify('xpath=' + step.expr)})`
                    : `locator(${JSON.stringify('xpath=' + step.expr)})`;
            } else if (step.kind === 'nth') {
                result = `${result}.nth(${step.index})`;
            } else if (step.kind === 'filter') {
                const parts: string[] = [];
                if (step.hasText) {
                    const t = typeof step.hasText === 'string' ? step.hasText : `/${step.hasText.source}/${step.hasText.flags}`;
                    parts.push(`hasText: ${JSON.stringify(t)}`);
                }
                if (step.hasNotText) {
                    const t = typeof step.hasNotText === 'string' ? step.hasNotText : `/${step.hasNotText.source}/${step.hasNotText.flags}`;
                    parts.push(`hasNotText: ${JSON.stringify(t)}`);
                }
                result = `${result}.filter({ ${parts.join(', ')} })`;
            } else if (step.kind === 'iframe') {
                result = result
                    ? `${result}.frameLocator(${JSON.stringify(step.sel)})`
                    : `frameLocator(${JSON.stringify(step.sel)})`;
                if (step.index !== undefined) result += `.nth(${step.index})`;
            } else if (step.kind === 'getByLabel') {
                result = result
                    ? `${result}.getByLabel(${JSON.stringify(step.text)})`
                    : `getByLabel(${JSON.stringify(step.text)})`;
            }
        }
        return result || 'locator(*)';
    }

    private _runStep<T>(title: string, fn: () => Promise<T>): Promise<T> {
        return this._stepReporter(title, fn);
    }

    // -------------------------------------------------------------------------
    // Factory — parse Playwright pseudo-classes from a raw selector string
    // -------------------------------------------------------------------------

    static fromSelector(
        session: BridgeSession,
        rawSelector: string,
        defaultTimeout: number,
        expectTimeout: number,
        stepReporter: StepReporter = noopReporter,
        page?: Page,
    ): Locator {
        const xpathExpr = Locator._extractXPath(rawSelector);
        if (xpathExpr !== null) {
            return new Locator(session, [{ kind: 'xpath', expr: xpathExpr }], defaultTimeout, expectTimeout, stepReporter, page);
        }
        const { cleanSelector, hasText, hasNotText } = Locator._parseHasTextPseudo(rawSelector);
        const steps: SelectorStep[] = [{ kind: 'css', sel: cleanSelector }];
        if (hasText !== undefined || hasNotText !== undefined) {
            const f: Extract<SelectorStep, { kind: 'filter' }> = { kind: 'filter' };
            if (hasText    !== undefined) f.hasText    = Locator._serText(hasText);
            if (hasNotText !== undefined) f.hasNotText = Locator._serText(hasNotText);
            steps.push(f);
        }
        return new Locator(session, steps, defaultTimeout, expectTimeout, stepReporter, page);
    }

    /** Returns the XPath expression if the selector is an XPath, otherwise null. */
    private static _extractXPath(selector: string): string | null {
        const trimmed = selector.trim();
        if (trimmed.startsWith('xpath=')) return trimmed.slice('xpath='.length);
        if (trimmed.startsWith('//') || trimmed.startsWith('..')) return trimmed;
        return null;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    static _serText(v: string | RegExp): SerializedText {
        return v instanceof RegExp ? { source: v.source, flags: v.flags } : v;
    }

    static _cssAttrValue(s: string): string {
        return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    // Strips :has-text(...) / :has-not-text(...) Playwright pseudo-classes and
    // returns the clean CSS selector plus the extracted text filters.
    private static _parseHasTextPseudo(selector: string): {
        cleanSelector: string;
        hasText?: string | RegExp;
        hasNotText?: string | RegExp;
    } {
        let s = selector;
        let hasText: string | RegExp | undefined;
        let hasNotText: string | RegExp | undefined;

        const arg = String.raw`\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\/(?:[^\/\\]|\\.)*\/[gimsuy]*))\s*\)`;

        s = s.replace(new RegExp(`:has-not-text${arg}`, 'g'), (_, dq, sq, rx) => {
            hasNotText = rx !== undefined
                ? Locator._parseRegexLiteral(rx)
                : (dq ?? sq ?? '').replace(/\\(.)/g, '$1');
            return '';
        });

        s = s.replace(new RegExp(`:has-text${arg}`, 'g'), (_, dq, sq, rx) => {
            hasText = rx !== undefined
                ? Locator._parseRegexLiteral(rx)
                : (dq ?? sq ?? '').replace(/\\(.)/g, '$1');
            return '';
        });

        return { cleanSelector: s.trim() || '*', hasText, hasNotText };
    }

    private static _parseRegexLiteral(literal: string): RegExp {
        const m = literal.match(/^\/([\s\S]*)\/([\w]*)$/);
        return m ? new RegExp(m[1], m[2]) : new RegExp(literal);
    }

    private async _waitForActionable(timeout: number): Promise<void> {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            try {
                const [visible, enabled] = await Promise.all([this.isVisible(), this.isEnabled()]);
                if (visible && enabled) return;
            } catch {
                // element not yet in DOM — keep polling
            }
            await new Promise(r => setTimeout(r, 50));
        }
        throw new Error(`Timeout ${timeout}ms waiting for '${this.selector}' to be actionable`);
    }

    // -------------------------------------------------------------------------
    // Clicks
    // -------------------------------------------------------------------------

    async click(options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.click()`, async () => {
            const timeout = options?.timeout ?? this.defaultTimeout;
            await this._waitForActionable(timeout);
            await this.session.sendCommand({ type: 'click', steps: this._steps, timeout });
        });
    }

    async dblclick(options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.dblclick()`, async () => {
            const timeout = options?.timeout ?? this.defaultTimeout;
            await this._waitForActionable(timeout);
            await this.session.sendCommand({ type: 'dblclick', steps: this._steps, timeout });
        });
    }

    async tap(options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.tap()`, async () => {
            const timeout = options?.timeout ?? this.defaultTimeout;
            await this._waitForActionable(timeout);
            await this.session.sendCommand({
                type: 'evaluate',
                expression: `(function() {
                    var els = resolveSteps(${JSON.stringify(this._steps)});
                    var el = els[0];
                    if (!el) throw new Error('Element not found for tap');
                    var r = el.getBoundingClientRect();
                    var x = r.left + r.width / 2, y = r.top + r.height / 2;
                    var TouchCls = window['Touch'];
                    var TouchEventCls = window['TouchEvent'];
                    if (TouchCls && TouchEventCls) {
                        ['touchstart','touchend'].forEach(function(type) {
                            var t = new TouchCls({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
                            el.dispatchEvent(new TouchEventCls(type, { touches: type === 'touchstart' ? [t] : [], changedTouches: [t], bubbles: true }));
                        });
                    } else {
                        ['touchstart','touchend'].forEach(function(type) {
                            var e = document.createEvent('Event');
                            e.initEvent(type, true, true);
                            el.dispatchEvent(e);
                        });
                    }
                })()`,
            });
        });
    }

    // -------------------------------------------------------------------------
    // Typing
    // -------------------------------------------------------------------------

    async fill(value: string, options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.fill(${JSON.stringify(value)})`, async () => {
            const timeout = options?.timeout ?? this.defaultTimeout;
            await this._waitForActionable(timeout);
            await this.session.sendCommand({ type: 'fill', steps: this._steps, value, timeout });
        });
    }

    async type(text: string, options?: { timeout?: number; delay?: number }): Promise<void> {
        return this._runStep(`${this._description()}.type(${JSON.stringify(text)})`, async () => {
            const timeout = options?.timeout ?? this.defaultTimeout;
            await this._waitForActionable(timeout);
            await this.session.sendCommand({ type: 'type', steps: this._steps, text, timeout });
        });
    }

    async clear(options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.clear()`, async () => {
            await this.session.sendCommand({
                type: 'clear',
                steps: this._steps,
                timeout: options?.timeout ?? this.defaultTimeout,
            });
        });
    }

    async pressSequentially(text: string, options?: { delay?: number }): Promise<void> {
        await this.type(text, options);
    }

    async press(key: string, options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.press(${JSON.stringify(key)})`, async () => {
            const timeout = options?.timeout ?? this.defaultTimeout;
            await this._waitForActionable(timeout);
            await this.session.sendCommand({ type: 'press', steps: this._steps, key, timeout });
        });
    }

    // -------------------------------------------------------------------------
    // State queries
    // -------------------------------------------------------------------------

    async isVisible(): Promise<boolean> {
        return this.session.sendCommand<boolean>({ type: 'isVisible', steps: this._steps });
    }

    async isHidden(): Promise<boolean> {
        return !(await this.isVisible());
    }

    async isEnabled(): Promise<boolean> {
        return this.session.sendCommand<boolean>({ type: 'isEnabled', steps: this._steps });
    }

    async isDisabled(): Promise<boolean> {
        return !(await this.isEnabled());
    }

    async isChecked(): Promise<boolean> {
        return this.session.sendCommand<boolean>({ type: 'isChecked', steps: this._steps });
    }

    async isEditable(): Promise<boolean> {
        return this.session.sendCommand<boolean>({ type: 'isEditable', steps: this._steps });
    }

    // -------------------------------------------------------------------------
    // Content
    // -------------------------------------------------------------------------

    async textContent(): Promise<string | null> {
        return this.session.sendCommand<string | null>({
            type: 'textContent',
            steps: this._steps,
            timeout: this.defaultTimeout,
        });
    }

    async innerText(): Promise<string> {
        return this.session.sendCommand<string>({
            type: 'innerText',
            steps: this._steps,
            timeout: this.defaultTimeout,
        });
    }

    async innerHTML(): Promise<string> {
        return this.session.sendCommand<string>({
            type: 'innerHTML',
            steps: this._steps,
            timeout: this.defaultTimeout,
        });
    }

    async inputValue(): Promise<string> {
        return this.session.sendCommand<string>({
            type: 'inputValue',
            steps: this._steps,
            timeout: this.defaultTimeout,
        });
    }

    async getAttribute(name: string): Promise<string | null> {
        return this.session.sendCommand<string | null>({
            type: 'getAttribute',
            steps: this._steps,
            name,
            timeout: this.defaultTimeout,
        });
    }

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    async hover(options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.hover()`, async () => {
            const timeout = options?.timeout ?? this.defaultTimeout;
            await this._waitForActionable(timeout);
            await this.session.sendCommand({ type: 'hover', steps: this._steps, timeout });
        });
    }

    async focus(options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.focus()`, async () => {
            await this.session.sendCommand({
                type: 'focus',
                steps: this._steps,
                timeout: options?.timeout ?? this.defaultTimeout,
            });
        });
    }

    async blur(options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.blur()`, async () => {
            await this.session.sendCommand({
                type: 'blur',
                steps: this._steps,
                timeout: options?.timeout ?? this.defaultTimeout,
            });
        });
    }

    async scrollIntoViewIfNeeded(options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.scrollIntoViewIfNeeded()`, async () => {
            await this.session.sendCommand({
                type: 'scrollIntoView',
                steps: this._steps,
                timeout: options?.timeout ?? this.defaultTimeout,
            });
        });
    }

    async selectOption(values: string | string[], options?: { timeout?: number }): Promise<string[]> {
        return this._runStep(`${this._description()}.selectOption(${JSON.stringify(values)})`, async () => {
            return this.session.sendCommand<string[]>({
                type: 'selectOption',
                steps: this._steps,
                values: Array.isArray(values) ? values : [values],
                timeout: options?.timeout ?? this.defaultTimeout,
            });
        });
    }

    async check(options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.check()`, async () => {
            const timeout = options?.timeout ?? this.defaultTimeout;
            await this._waitForActionable(timeout);
            await this.session.sendCommand({ type: 'check', steps: this._steps, timeout });
        });
    }

    async uncheck(options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.uncheck()`, async () => {
            const timeout = options?.timeout ?? this.defaultTimeout;
            await this._waitForActionable(timeout);
            await this.session.sendCommand({ type: 'uncheck', steps: this._steps, timeout });
        });
    }

    async setChecked(checked: boolean, options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.setChecked(${checked})`, async () => {
            const timeout = options?.timeout ?? this.defaultTimeout;
            await this._waitForActionable(timeout);
            await this.session.sendCommand({ type: 'setChecked', steps: this._steps, checked, timeout });
        });
    }

    async dispatchEvent(type: string, eventInit?: Record<string, unknown>, options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'dispatchEvent',
            steps: this._steps,
            eventType: type,
            eventInit: eventInit ?? {},
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    async boundingBox(options?: { timeout?: number }): Promise<{ x: number; y: number; width: number; height: number } | null> {
        return this.session.sendCommand<{ x: number; y: number; width: number; height: number } | null>({
            type: 'boundingBox',
            steps: this._steps,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    // -------------------------------------------------------------------------
    // Waiting
    // -------------------------------------------------------------------------

    async waitFor(options?: { state?: LocatorState; timeout?: number }): Promise<void> {
        const state = options?.state ?? 'visible';
        const timeout = options?.timeout ?? this.defaultTimeout;

        if (state === 'visible' || state === 'attached') {
            await this.session.sendCommand({ type: 'waitForSelector', steps: this._steps, timeout });
        } else if (state === 'actionable') {
            await this._waitForActionable(timeout);
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

    // -------------------------------------------------------------------------
    // Count / nth / filter
    // -------------------------------------------------------------------------

    async count(): Promise<number> {
        return this.session.sendCommand<number>({ type: 'count', steps: this._steps });
    }

    nth(index: number): Locator {
        return new Locator(this.session, [...this._steps, { kind: 'nth', index }], this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
    }

    first(): Locator {
        return new Locator(this.session, [...this._steps, { kind: 'nth', index: 0 }], this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
    }

    last(): Locator {
        return new Locator(this.session, [...this._steps, { kind: 'nth', index: -1 }], this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
    }

    locator(subSelector: string): Locator {
        const xpathExpr = Locator._extractXPath(subSelector);
        if (xpathExpr !== null) {
            return new Locator(this.session, [...this._steps, { kind: 'xpath', expr: xpathExpr }], this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
        }
        const { cleanSelector, hasText, hasNotText } = Locator._parseHasTextPseudo(subSelector);
        const steps: SelectorStep[] = [...this._steps, { kind: 'css', sel: cleanSelector }];
        if (hasText !== undefined || hasNotText !== undefined) {
            const f: Extract<SelectorStep, { kind: 'filter' }> = { kind: 'filter' };
            if (hasText    !== undefined) f.hasText    = Locator._serText(hasText);
            if (hasNotText !== undefined) f.hasNotText = Locator._serText(hasNotText);
            steps.push(f);
        }
        return new Locator(this.session, steps, this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
    }

    getByXPath(expr: string): Locator {
        return new Locator(this.session, [...this._steps, { kind: 'xpath', expr }], this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
    }

    getByRole(role: string, options?: { name?: string | RegExp }): Locator {
        if (options?.name) {
            const name = typeof options.name === 'string' ? options.name : options.name.source;
            return this.locator(`[role="${role}"][aria-label*="${name}"], [role="${role}"]:has-text("${name}")`);
        }
        return this.locator(`[role="${role}"]`);
    }

    getByText(text: string | RegExp): Locator {
        if (text instanceof RegExp)
            return this.locator('body *').filter({ hasText: text });
        return this.locator(`body *:has-text("${Locator._cssAttrValue(text)}")`);
    }

    getByLabel(text: string): Locator {
        return new Locator(this.session, [...this._steps, { kind: 'getByLabel', text }], this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
    }

    getByPlaceholder(placeholder: string): Locator {
        return this.locator(`[placeholder="${Locator._cssAttrValue(placeholder)}"]`);
    }

    getByTestId(testId: string): Locator {
        return this.locator(`[data-testid="${Locator._cssAttrValue(testId)}"]`);
    }

    getByAltText(text: string | RegExp): Locator {
        if (text instanceof RegExp)
            return new Locator(this.session, [...this._steps, { kind: 'getByAttr', attr: 'alt', value: Locator._serText(text) }], this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
        return this.locator(`[alt="${Locator._cssAttrValue(text)}"]`);
    }

    getByTitle(text: string | RegExp): Locator {
        if (text instanceof RegExp)
            return new Locator(this.session, [...this._steps, { kind: 'getByAttr', attr: 'title', value: Locator._serText(text) }], this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
        return this.locator(`[title="${Locator._cssAttrValue(text)}"]`);
    }

    filter(options: LocatorFilter): Locator {
        const f: Extract<SelectorStep, { kind: 'filter' }> = { kind: 'filter' };
        if (options.hasText !== undefined) f.hasText    = Locator._serText(options.hasText);
        if (options.hasNotText !== undefined) f.hasNotText = Locator._serText(options.hasNotText);
        if (options.has) f.hasSteps = options.has._steps;
        if (options.hasNot) f.hasNotSteps = options.hasNot._steps;
        return new Locator(this.session, [...this._steps, f], this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
    }

    async all(): Promise<Locator[]> {
        const count = await this.session.sendCommand<number>({ type: 'count', steps: this._steps });
        return Array.from({ length: count }, (_, i) =>
            new Locator(this.session, [...this._steps, { kind: 'nth', index: i }], this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page)
        );
    }

    async allTextContents(): Promise<string[]> {
        return this.session.sendCommand<string[]>({ type: 'allTextContents', steps: this._steps });
    }

    async allInnerTexts(): Promise<string[]> {
        return this.session.sendCommand<string[]>({ type: 'allInnerTexts', steps: this._steps });
    }

    // -------------------------------------------------------------------------
    // Evaluation
    // -------------------------------------------------------------------------

    async evaluate<T>(fn: (element: unknown, ...args: unknown[]) => T, ...args: unknown[]): Promise<T> {
        return this.session.sendCommand<T>({
            type: 'locatorEvaluate',
            steps: this._steps,
            fn: fn.toString(),
            args,
            timeout: this.defaultTimeout,
        });
    }

    async evaluateAll<T>(fn: (elements: unknown[], ...args: unknown[]) => T, ...args: unknown[]): Promise<T> {
        return this.session.sendCommand<T>({
            type: 'evaluateAll',
            steps: this._steps,
            fn: fn.toString(),
            args,
        });
    }

    // -------------------------------------------------------------------------
    // Composition
    // -------------------------------------------------------------------------

    and(other: Locator): Locator {
        return new Locator(this.session, [...this._steps, { kind: 'and', steps: other._steps }], this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
    }

    or(other: Locator): Locator {
        return new Locator(this.session, [...this._steps, { kind: 'or', steps: other._steps }], this.defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
    }

    frameLocator(selector: string): FrameLocator {
        return new FrameLocator(
            this.session,
            [...this._steps, { kind: 'iframe', sel: selector }],
            this.defaultTimeout,
            this._expectTimeout,
            this._stepReporter,
            this._page,
        );
    }

    // -------------------------------------------------------------------------
    // Drag
    // -------------------------------------------------------------------------

    async selectText(options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.selectText()`, async () => {
            await this._waitForActionable(options?.timeout ?? this.defaultTimeout);
            await this.session.sendCommand({
                type: 'evaluate',
                expression: `(function() {
                    var els = resolveSteps(${JSON.stringify(this._steps)});
                    var el = els[0];
                    if (!el) throw new Error('Element not found for selectText');
                    if (typeof el.select === 'function') {
                        el.select();
                    } else {
                        var range = document.createRange();
                        range.selectNodeContents(el);
                        var sel = window.getSelection();
                        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
                    }
                })()`,
            });
        });
    }

    async setInputFiles(
        files: FileInput,
        options?: { timeout?: number }
    ): Promise<void> {
        return this._runStep(`${this._description()}.setInputFiles(...)`, async () => {
            const serialized = serializeFiles(files);
            await this.waitFor({ timeout: options?.timeout ?? this.defaultTimeout });
            await this.session.sendCommand({
                type: 'evaluate',
                expression: `(function() {
                    var els = resolveSteps(${JSON.stringify(this._steps)});
                    var el = els[0];
                    if (!el) throw new Error('Element not found for setInputFiles');
                    ${fileTransferScript(serialized)}
                })()`,
            });
        });
    }

    async dragTo(target: Locator, options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.dragTo(${target._description()})`, async () => {
            await this.session.sendCommand({
                type: 'dragTo',
                srcSteps: this._steps,
                tgtSteps: target._steps,
                timeout: options?.timeout ?? this.defaultTimeout,
            });
        });
    }

    async drop(options?: { timeout?: number }): Promise<void> {
        return this._runStep(`${this._description()}.drop()`, async () => {
            await this._waitForActionable(options?.timeout ?? this.defaultTimeout);
            await this.session.sendCommand({
                type: 'evaluate',
                expression: `(function() {
                    var els = resolveSteps(${JSON.stringify(this._steps)});
                    var el = els[0];
                    if (!el) throw new Error('Element not found for drop');
                    ['dragenter', 'dragover', 'drop'].forEach(function(type) {
                        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true }));
                    });
                })()`,
            });
        });
    }

    // -------------------------------------------------------------------------
    // Aria snapshot
    // -------------------------------------------------------------------------

    async highlight(): Promise<void> {
        await this.session.sendCommand({
            type: 'evaluate',
            expression: `(function() {
                var els = resolveSteps(${JSON.stringify(this._steps)});
                els.forEach(function(el) {
                    var prev = el.style.outline;
                    el.style.outline = '2px solid crimson';
                    setTimeout(function() { el.style.outline = prev; }, 2000);
                });
            })()`,
        });
    }

    async ariaSnapshot(options?: { timeout?: number }): Promise<string> {
        return this.session.sendCommand<string>({
            type: 'ariaSnapshot',
            steps: this._steps,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    // -------------------------------------------------------------------------
    // Screenshot
    // -------------------------------------------------------------------------

    async screenshot(options?: { path?: string; type?: 'png' | 'jpeg'; quality?: number }): Promise<Buffer> {
        const targetExpr = `resolveSteps(${JSON.stringify(this._steps)})[0]`;
        const expression = buildScreenshotExpression(targetExpr, options);
        const dataUrl = await this.session.sendCommand<string>({ type: 'evaluate', expression });
        const buffer = decodeScreenshotDataUrl(dataUrl);
        if (options?.path) writeFileSync(options.path, buffer);
        return buffer;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// FrameLocator — scopes queries to an iframe's content document
// ─────────────────────────────────────────────────────────────────────────────

export class FrameLocator {
    constructor(
        private readonly _session: BridgeSession,
        readonly _steps: SelectorStep[],
        private readonly _defaultTimeout: number,
        private readonly _expectTimeout: number,
        private readonly _stepReporter: StepReporter = noopReporter,
        private readonly _page?: Page,
    ) {}

    // ─── Description ──────────────────────────────────────────────────────────

    _description(): string {
        let result = '';
        for (const step of this._steps) {
            if (step.kind === 'iframe') {
                result = result
                    ? `${result}.frameLocator(${JSON.stringify(step.sel)})`
                    : `frameLocator(${JSON.stringify(step.sel)})`;
                if (step.index !== undefined) result += `.nth(${step.index})`;
            }
        }
        return result || 'frameLocator(*)';
    }

    // ─── Index selection ──────────────────────────────────────────────────────

    nth(index: number): FrameLocator {
        const steps = this._steps.map((s, i) =>
            i === this._steps.length - 1 && s.kind === 'iframe' ? { ...s, index } : s
        );
        return new FrameLocator(this._session, steps, this._defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
    }

    first(): FrameLocator { return this.nth(0); }
    last(): FrameLocator  { return this.nth(-1); }

    // ─── Locator factories ────────────────────────────────────────────────────

    locator(selector: string): Locator {
        const inner = Locator.fromSelector(this._session, selector, this._defaultTimeout, this._expectTimeout);
        return new Locator(
            this._session,
            [...this._steps, ...inner._steps],
            this._defaultTimeout,
            this._expectTimeout,
            this._stepReporter,
            this._page,
        );
    }

    getByXPath(expr: string): Locator {
        return new Locator(this._session, [...this._steps, { kind: 'xpath', expr }], this._defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
    }

    getByRole(role: string, options?: { name?: string | RegExp }): Locator {
        if (options?.name) {
            const name = typeof options.name === 'string' ? options.name : options.name.source;
            return this.locator(`[role="${role}"][aria-label*="${name}"], [role="${role}"]:has-text("${name}")`);
        }
        return this.locator(`[role="${role}"]`);
    }

    getByText(text: string | RegExp): Locator {
        if (text instanceof RegExp)
            return this.locator('body *').filter({ hasText: text });
        return this.locator(`body *:has-text("${Locator._cssAttrValue(text)}")`);
    }

    getByLabel(text: string): Locator {
        return new Locator(this._session, [...this._steps, { kind: 'getByLabel', text }], this._defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
    }

    getByPlaceholder(placeholder: string): Locator {
        return this.locator(`[placeholder="${Locator._cssAttrValue(placeholder)}"]`);
    }

    getByTestId(testId: string): Locator {
        return this.locator(`[data-testid="${Locator._cssAttrValue(testId)}"]`);
    }

    getByAltText(text: string | RegExp): Locator {
        if (text instanceof RegExp)
            return new Locator(this._session, [...this._steps, { kind: 'getByAttr', attr: 'alt', value: Locator._serText(text) }], this._defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
        return this.locator(`[alt="${Locator._cssAttrValue(text)}"]`);
    }

    getByTitle(text: string | RegExp): Locator {
        if (text instanceof RegExp)
            return new Locator(this._session, [...this._steps, { kind: 'getByAttr', attr: 'title', value: Locator._serText(text) }], this._defaultTimeout, this._expectTimeout, this._stepReporter, this._page);
        return this.locator(`[title="${Locator._cssAttrValue(text)}"]`);
    }

    // ─── Nested frame ─────────────────────────────────────────────────────────

    frameLocator(selector: string): FrameLocator {
        return new FrameLocator(
            this._session,
            [...this._steps, { kind: 'iframe', sel: selector }],
            this._defaultTimeout,
            this._expectTimeout,
            this._stepReporter,
            this._page,
        );
    }
}
