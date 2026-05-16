import { Proxy } from 'testcafe-hammerhead';
import { BridgeSession } from '../session/bridge-session';
import { Locator } from './locator';
import { Keyboard } from './keyboard';
import { Mouse } from './mouse';
import { openSafariAtUrl, closeSafariWindowByUrlFragment } from '../utils/safari';

export type WaitUntilState = 'domcontentloaded' | 'load' | 'networkidle';

export interface GotoOptions {
    timeout?: number;
    waitUntil?: WaitUntilState;
}

export interface WaitForSelectorOptions {
    state?: 'visible' | 'hidden' | 'attached' | 'detached';
    timeout?: number;
}

export class Page {
    readonly keyboard: Keyboard;
    readonly mouse: Mouse;

    private readonly defaultTimeout: number;

    constructor(
        private readonly proxy: Proxy,
        private readonly session: BridgeSession,
        defaultTimeout = 30000
    ) {
        this.defaultTimeout = defaultTimeout;
        this.keyboard = new Keyboard(session);
        this.mouse = new Mouse(session);
    }

    // --- Navigation ---

    async goto(url: string, options?: GotoOptions): Promise<void> {
        const timeout = options?.timeout ?? this.defaultTimeout;
        (this.session as unknown as { isReady: boolean }).isReady = false;

        const proxiedUrl = this.proxy.openSession(url, this.session, { url: '' });
        const readyPromise = this.session.waitForReady(timeout);
        openSafariAtUrl(proxiedUrl);
        await readyPromise;
    }

    async reload(options?: { timeout?: number }): Promise<void> {
        const timeout = options?.timeout ?? this.defaultTimeout;
        (this.session as unknown as { isReady: boolean }).isReady = false;
        const readyPromise = this.session.waitForReady(timeout);
        await this.session.sendCommand({ type: 'evaluate', expression: 'location.reload()' }).catch(() => {});
        await readyPromise;
    }

    async goBack(options?: { timeout?: number }): Promise<void> {
        const timeout = options?.timeout ?? this.defaultTimeout;
        (this.session as unknown as { isReady: boolean }).isReady = false;
        const readyPromise = this.session.waitForReady(timeout);
        await this.session.sendCommand({ type: 'evaluate', expression: 'history.back()' }).catch(() => {});
        await readyPromise;
    }

    async goForward(options?: { timeout?: number }): Promise<void> {
        const timeout = options?.timeout ?? this.defaultTimeout;
        (this.session as unknown as { isReady: boolean }).isReady = false;
        const readyPromise = this.session.waitForReady(timeout);
        await this.session.sendCommand({ type: 'evaluate', expression: 'history.forward()' }).catch(() => {});
        await readyPromise;
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

    // --- Locators ---

    locator(selector: string): Locator {
        return new Locator(this.session, selector, this.defaultTimeout);
    }

    getByRole(_role: string, options?: { name?: string | RegExp }): Locator {
        if (options?.name) {
            const name = typeof options.name === 'string'
                ? options.name
                : options.name.source;
            return new Locator(this.session, `[role="${_role}"][aria-label*="${name}"], [role="${_role}"]:contains("${name}")`, this.defaultTimeout);
        }
        return new Locator(this.session, `[role="${_role}"]`, this.defaultTimeout);
    }

    getByText(text: string | RegExp): Locator {
        const textStr = typeof text === 'string' ? text : text.source;
        return new Locator(this.session, `*:contains("${textStr}")`, this.defaultTimeout);
    }

    getByLabel(text: string): Locator {
        return new Locator(this.session, `[aria-label="${text}"], label:contains("${text}") + input, label:contains("${text}") ~ input`, this.defaultTimeout);
    }

    getByPlaceholder(placeholder: string): Locator {
        return new Locator(this.session, `[placeholder="${placeholder}"]`, this.defaultTimeout);
    }

    getByTestId(testId: string): Locator {
        return new Locator(this.session, `[data-testid="${testId}"]`, this.defaultTimeout);
    }

    // --- Direct element actions ---

    async click(selector: string, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).click(options);
    }

    async fill(selector: string, value: string, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).fill(value, options);
    }

    async type(selector: string, text: string, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).type(text, options);
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

    async hover(selector: string, options?: { timeout?: number }): Promise<void> {
        await this.locator(selector).hover(options);
    }

    async focus(selector: string): Promise<void> {
        await this.locator(selector).focus();
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

    async waitForLoadState(_state: WaitUntilState = 'load'): Promise<void> {
        await this.session.sendCommand({
            type: 'evaluate',
            expression: `new Promise(resolve => {
                if (document.readyState === 'complete') { resolve(); return; }
                window.addEventListener('load', resolve, { once: true });
            })`,
        });
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

    // --- Screenshot (no-op — cannot capture Safari screenshot from script) ---

    async screenshot(_options?: { path?: string; fullPage?: boolean }): Promise<Buffer> {
        return Buffer.alloc(0);
    }

    // --- Scroll ---

    async scrollTo(x: number, y: number): Promise<void> {
        await this.session.sendCommand({ type: 'scrollTo', x, y });
    }

    // --- Lifecycle ---

    async close(): Promise<void> {
        this.proxy.closeSession(this.session);
        closeSafariWindowByUrlFragment(this.session.id);
    }
}
