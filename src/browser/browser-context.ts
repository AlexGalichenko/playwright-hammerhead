import { EventEmitter } from 'events';
import type { BridgeSession } from '../session/bridge-session';
import type { Page } from '../page/page';

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

export class BrowserContext extends EventEmitter {
    private _pages: Page[] = [];
    private _closed = false;
    private readonly _pageFactory: PageFactory;

    constructor(pageFactory: PageFactory) {
        super();
        this._pageFactory = pageFactory;
    }

    // ── Page management ──────────────────────────────────────────────────────

    async newPage(): Promise<Page> {
        const page = await this._pageFactory(this);
        this._registerPage(page);
        return page;
    }

    _registerPage(page: Page): void {
        if (this._pages.includes(page)) return;
        this._pages.push(page);
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

    pages(): Page[] {
        return [...this._pages];
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

    async close(): Promise<void> {
        if (this._closed) return;
        this._closed = true;
        await Promise.all(this._pages.map(p => p.close().catch(() => {})));
        this.removeAllListeners();
    }
}
