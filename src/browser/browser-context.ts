import { readFileSync } from 'fs';
import { EventEmitter } from 'events';
import type { BridgeSession } from '../session/bridge-session';
import type { Page, RouteHandler, UrlPattern } from '../page/page';

export interface Cookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
}

export type PageFactory = (ctx: BrowserContext) => Promise<Page>;

export interface IBrowser {}

interface ContextRoute {
    pattern: UrlPattern;
    handler: RouteHandler;
}

export class BrowserContext extends EventEmitter {
    private _pages: Page[] = [];
    private _closed = false;
    private readonly _pageFactory: PageFactory;
    private _browser: IBrowser | null = null;
    private _initScripts: string[] = [];
    private _exposedFunctions = new Map<string, (...args: unknown[]) => unknown>();
    private _exposedBindings = new Map<string, (source: { url: string }, ...args: unknown[]) => unknown>();
    private _defaultTimeout: number | null = null;
    private _defaultNavigationTimeout: number | null = null;
    private _extraHTTPHeaders: Record<string, string> | null = null;
    private _geolocation: { latitude: number; longitude: number; accuracy?: number } | null = null;
    private _offline = false;
    private _contextRoutes: ContextRoute[] = [];

    constructor(pageFactory: PageFactory) {
        super();
        this._pageFactory = pageFactory;
    }

    // ── Browser reference ────────────────────────────────────────────────────

    _setBrowser(b: IBrowser): void { this._browser = b; }

    browser(): IBrowser | null { return this._browser; }

    // ── Page management ──────────────────────────────────────────────────────

    async newPage(): Promise<Page> {
        const page = await this._pageFactory(this);
        this._registerPage(page);
        return page;
    }

    _registerPage(page: Page): void {
        if (this._pages.includes(page)) return;
        this._pages.push(page);
        // Apply sync context settings before any user navigation
        for (const script of this._initScripts) {
            page.session.addInitScript(script);
        }
        if (this._defaultTimeout !== null) page.setDefaultTimeout(this._defaultTimeout);
        if (this._defaultNavigationTimeout !== null) page.setDefaultNavigationTimeout(this._defaultNavigationTimeout);
        void this._applyAsyncSettingsToPage(page);
        page.once('close', () => {
            this._pages = this._pages.filter(p => p !== page);
        });
        page.on('popup', ({ url }: { url: string; target: string }) => {
            if (!url) return;
            this.newPage()
                .then(async newPage => { await newPage.goto(url).catch(() => {}); })
                .catch(() => {});
        });
        this.emit('page', page);
    }

    private async _applyAsyncSettingsToPage(page: Page): Promise<void> {
        if (this._extraHTTPHeaders) await page.setExtraHTTPHeaders(this._extraHTTPHeaders).catch(() => {});
        for (const [name, fn] of this._exposedFunctions) {
            await page.exposeFunction(name, fn).catch(() => {});
        }
        for (const [name, fn] of this._exposedBindings) {
            await page.exposeBinding(name, fn).catch(() => {});
        }
        for (const r of this._contextRoutes) {
            await page.route(r.pattern, r.handler).catch(() => {});
        }
        if (this._geolocation !== null) await this._applyGeolocationToPage(page).catch(() => {});
        if (this._offline) await this._applyOfflineToPage(page).catch(() => {});
    }

    pages(): Page[] {
        return [...this._pages];
    }

    isClosed(): boolean {
        return this._closed;
    }

    waitForEvent(event: 'page', options?: { timeout?: number }): Promise<Page>;
    waitForEvent(event: string, options?: { timeout?: number }): Promise<unknown> {
        const timeout = options?.timeout ?? 30_000;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off(event, handler);
                reject(new Error(`Timeout ${timeout}ms waiting for context event: ${event}`));
            }, timeout);
            const handler = (data: unknown) => { clearTimeout(timer); resolve(data); };
            this.once(event, handler);
        });
    }

    // ── Cookie / storage helpers ─────────────────────────────────────────────

    private _activeSession(): BridgeSession | null {
        for (const p of this._pages) {
            if (!p.isClosed()) return (p as unknown as { session: BridgeSession }).session;
        }
        return null;
    }

    async cookies(_urls?: string | string[]): Promise<Cookie[]> {
        const session = this._activeSession();
        if (!session) return [];
        const raw = await session.sendCommand<string>({ type: 'evaluate', expression: 'document.cookie' });
        if (!raw) return [];
        return raw.split(';').map(c => c.trim()).filter(Boolean).map(pair => {
            const eq = pair.indexOf('=');
            return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() };
        });
    }

    async clearCookies(): Promise<void> {
        const session = this._activeSession();
        if (!session) return;
        await session.sendCommand({
            type: 'evaluate',
            expression: `(function() {
                document.cookie.split(';').forEach(function(c) {
                    var name = c.split('=')[0].trim();
                    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
                });
            })()`,
        });
    }

    async addCookies(cookies: Cookie[]): Promise<void> {
        const activeSessions = this._pages
            .filter(p => !p.isClosed())
            .map(p => (p as unknown as { session: BridgeSession }).session);
        if (activeSessions.length === 0) return;
        for (const c of cookies) {
            const parts = [`${encodeURIComponent(c.name)}=${encodeURIComponent(c.value)}`];
            if (c.path) parts.push(`path=${c.path}`);
            if (c.domain) parts.push(`domain=${c.domain}`);
            if (c.expires !== undefined) parts.push(`expires=${new Date(c.expires * 1000).toUTCString()}`);
            if (c.secure) parts.push('secure');
            if (c.sameSite) parts.push(`samesite=${c.sameSite}`);
            for (const session of activeSessions) {
                await session.sendCommand({
                    type: 'evaluate',
                    expression: `document.cookie = ${JSON.stringify(parts.join('; '))}`,
                });
            }
        }
    }

    async storageState(): Promise<{
        cookies: Cookie[];
        origins: { origin: string; localStorage: { name: string; value: string }[] }[];
    }> {
        const session = this._activeSession();
        if (!session) return { cookies: [], origins: [] };
        const [cookies, items, currentUrl] = await Promise.all([
            this.cookies(),
            session.sendCommand<{ name: string; value: string }[]>({
                type: 'evaluate',
                expression: `(function() {
                    var items = [];
                    for (var i = 0; i < localStorage.length; i++) {
                        var k = localStorage.key(i);
                        if (k !== null) items.push({ name: k, value: localStorage.getItem(k) || '' });
                    }
                    return items;
                })()`,
            }),
            session.sendCommand<string>({ type: 'url' }),
        ]);
        let origin = '*';
        try { origin = new URL(currentUrl).origin; } catch { /* keep '*' */ }
        return { cookies, origins: [{ origin, localStorage: items }] };
    }

    async setStorageState(state: {
        cookies?: Cookie[];
        origins?: { origin: string; localStorage: { name: string; value: string }[] }[];
    }): Promise<void> {
        if (state.cookies?.length) await this.addCookies(state.cookies);
        if (state.origins?.length) {
            const session = this._activeSession();
            if (session) {
                for (const o of state.origins) {
                    await session.sendCommand({
                        type: 'evaluate',
                        expression: `(function() {
                            var items = ${JSON.stringify(o.localStorage)};
                            items.forEach(function(item) {
                                try { localStorage.setItem(item.name, item.value); } catch(_) {}
                            });
                        })()`,
                    });
                }
            }
        }
    }

    // ── Init scripts ─────────────────────────────────────────────────────────

    async addInitScript(script: string | ((...args: unknown[]) => unknown), arg?: unknown): Promise<void> {
        const scriptStr = typeof script === 'function'
            ? `(${script.toString()})(${arg !== undefined ? JSON.stringify(arg) : ''})`
            : script;
        this._initScripts.push(scriptStr);
        for (const p of this._pages) {
            if (!p.isClosed()) p.session.addInitScript(scriptStr);
        }
    }

    // ── Exposed functions / bindings ─────────────────────────────────────────

    async exposeFunction(name: string, fn: (...args: unknown[]) => unknown): Promise<void> {
        this._exposedFunctions.set(name, fn);
        for (const p of this._pages) {
            if (!p.isClosed()) await p.exposeFunction(name, fn).catch(() => {});
        }
    }

    async exposeBinding(name: string, fn: (source: { url: string }, ...args: unknown[]) => unknown): Promise<void> {
        this._exposedBindings.set(name, fn);
        for (const p of this._pages) {
            if (!p.isClosed()) await p.exposeBinding(name, fn).catch(() => {});
        }
    }

    // ── Timeouts ─────────────────────────────────────────────────────────────

    setDefaultTimeout(ms: number): void {
        this._defaultTimeout = ms;
        for (const p of this._pages) {
            if (!p.isClosed()) p.setDefaultTimeout(ms);
        }
    }

    setDefaultNavigationTimeout(ms: number): void {
        this._defaultNavigationTimeout = ms;
        for (const p of this._pages) {
            if (!p.isClosed()) p.setDefaultNavigationTimeout(ms);
        }
    }

    // ── HTTP headers ─────────────────────────────────────────────────────────

    async setExtraHTTPHeaders(headers: Record<string, string>): Promise<void> {
        this._extraHTTPHeaders = headers;
        for (const p of this._pages) {
            if (!p.isClosed()) await p.setExtraHTTPHeaders(headers).catch(() => {});
        }
    }

    // ── Geolocation ──────────────────────────────────────────────────────────

    async setGeolocation(geolocation: { latitude: number; longitude: number; accuracy?: number } | null): Promise<void> {
        this._geolocation = geolocation;
        for (const p of this._pages) {
            if (!p.isClosed()) await this._applyGeolocationToPage(p).catch(() => {});
        }
    }

    private async _applyGeolocationToPage(page: Page): Promise<void> {
        const geo = this._geolocation;
        const script = geo === null
            ? `(function() {
                try { delete navigator.geolocation; } catch(_) {}
            })()`
            : `(function() {
                var coords = {
                    latitude: ${geo.latitude}, longitude: ${geo.longitude},
                    accuracy: ${geo.accuracy ?? 1},
                    altitude: null, altitudeAccuracy: null, heading: null, speed: null
                };
                var pos = { coords: coords, timestamp: Date.now() };
                Object.defineProperty(navigator, 'geolocation', {
                    configurable: true,
                    get: function() {
                        return {
                            getCurrentPosition: function(success) { success(pos); },
                            watchPosition: function(success) { success(pos); return 0; },
                            clearWatch: function() {}
                        };
                    }
                });
            })()`;
        page.session.addInitScript(script);
        await page.evaluate(script).catch(() => {});
    }

    // ── Offline mode ─────────────────────────────────────────────────────────

    async setOffline(offline: boolean): Promise<void> {
        this._offline = offline;
        for (const p of this._pages) {
            if (!p.isClosed()) await this._applyOfflineToPage(p).catch(() => {});
        }
    }

    private async _applyOfflineToPage(page: Page): Promise<void> {
        const offline = this._offline;
        const patchScript = `(function() {
            window.__hhOffline = ${offline};
            if (!window.__hhOfflinePatch) {
                window.__hhOfflinePatch = true;
                var origFetch = window.fetch;
                if (origFetch) {
                    window.fetch = function() {
                        if (window.__hhOffline) return Promise.reject(new TypeError('Failed to fetch'));
                        return origFetch.apply(window, arguments);
                    };
                }
                var origSend = XMLHttpRequest.prototype.send;
                XMLHttpRequest.prototype.send = function() {
                    if (window.__hhOffline) {
                        var self = this;
                        setTimeout(function() { self.dispatchEvent(new Event('error')); }, 0);
                        return;
                    }
                    origSend.apply(this, arguments);
                };
            }
        })()`;
        page.session.addInitScript(`window.__hhOffline = ${offline};`);
        await page.evaluate(patchScript).catch(() => {});
    }

    // ── Routing ──────────────────────────────────────────────────────────────

    async route(pattern: UrlPattern, handler: RouteHandler): Promise<void> {
        this._contextRoutes.push({ pattern, handler });
        for (const p of this._pages) {
            if (!p.isClosed()) await p.route(pattern, handler).catch(() => {});
        }
    }

    async unroute(pattern?: UrlPattern, handler?: RouteHandler): Promise<void> {
        if (pattern === undefined) {
            this._contextRoutes.length = 0;
            for (const p of this._pages) {
                if (!p.isClosed()) await p.unrouteAll().catch(() => {});
            }
            return;
        }
        this._contextRoutes = this._contextRoutes.filter(
            r => !(r.pattern === pattern && (handler === undefined || r.handler === handler))
        );
        for (const p of this._pages) {
            if (!p.isClosed()) await p.unroute(pattern, handler).catch(() => {});
        }
    }

    async unrouteAll(): Promise<void> {
        await this.unroute();
    }

    // ── HAR routing ──────────────────────────────────────────────────────────

    async routeFromHAR(
        har: string,
        options?: { url?: string | RegExp; notFound?: 'abort' | 'fallthrough' }
    ): Promise<void> {
        interface HarEntry {
            request: { url: string };
            response: {
                status: number;
                headers: { name: string; value: string }[];
                content: { text?: string; encoding?: string; mimeType: string };
            };
        }

        let entries: HarEntry[];
        try {
            const parsed = JSON.parse(readFileSync(har, 'utf-8')) as { log: { entries: HarEntry[] } };
            entries = parsed.log?.entries ?? [];
        } catch {
            throw new Error(`routeFromHAR: failed to read/parse HAR file: ${har}`);
        }

        const urlFilter = options?.url;
        const notFound = options?.notFound ?? 'abort';
        const outerPattern: UrlPattern = urlFilter ?? /.*/;

        const findEntry = (url: string): HarEntry | undefined =>
            entries.find(e => url === e.request.url || url.split('?')[0] === e.request.url.split('?')[0]);

        await this.route(outerPattern, async (route, request) => {
            const entry = findEntry(request.url());
            if (!entry) {
                if (notFound === 'abort') await route.abort();
                else await route.continue();
                return;
            }
            const headers: Record<string, string> = {};
            for (const h of entry.response.headers) headers[h.name.toLowerCase()] = h.value;
            let body: string | Buffer = '';
            if (entry.response.content.text) {
                body = entry.response.content.encoding === 'base64'
                    ? Buffer.from(entry.response.content.text, 'base64')
                    : entry.response.content.text;
            }
            await route.fulfill({
                status: entry.response.status,
                headers,
                contentType: entry.response.content.mimeType,
                body,
            });
        });
    }

    // ── Permissions ──────────────────────────────────────────────────────────

    async grantPermissions(_permissions: string[], _options?: { origin?: string }): Promise<void> {
        // Browser-level permissions cannot be granted via JS injection
    }

    async clearPermissions(): Promise<void> {
        // Browser-level permissions cannot be cleared via JS injection
    }

    // ── Service workers ──────────────────────────────────────────────────────

    serviceWorkers(): never[] {
        return [];
    }

    // ── Unsupported ──────────────────────────────────────────────────────────

    async newCDPSession(): Promise<never> {
        throw new Error('newCDPSession() is not supported by playwright-hammerhead');
    }

    async routeWebSocket(): Promise<never> {
        throw new Error('routeWebSocket() is not supported by playwright-hammerhead');
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    async close(): Promise<void> {
        if (this._closed) return;
        this._closed = true;
        await Promise.all(this._pages.map(p => p.close().catch(() => {})));
        this.removeAllListeners();
    }
}
