import { readFileSync } from 'fs';
import { Proxy, RequestFilterRule, RequestInfo } from 'testcafe-hammerhead';
import { BridgeSession } from '../session/bridge-session';
import { Locator } from './locator';
import { Keyboard } from './keyboard';
import { Mouse } from './mouse';
import { Route, Request, FulfillOptions, ContinueOptions } from './route';
import { openSafariAtUrl, closeSafariWindowByUrlFragment } from '../utils/safari';

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

interface RouteEntry {
    pattern: UrlPattern;
    rule: RequestFilterRule;
    handler: RouteHandler;
}

export class Page {
    readonly keyboard: Keyboard;
    readonly mouse: Mouse;

    private readonly defaultTimeout: number;
    private readonly _routes: RouteEntry[] = [];
    private readonly _locatorHandlerIntervals: ReturnType<typeof setInterval>[] = [];

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
        this._locatorHandlerIntervals.push(interval);
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
        for (const interval of this._locatorHandlerIntervals) clearInterval(interval);
        this._locatorHandlerIntervals.length = 0;
        this.proxy.closeSession(this.session);
        closeSafariWindowByUrlFragment(this.session.id);
    }
}
