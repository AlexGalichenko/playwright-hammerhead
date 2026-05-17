import { BridgeSession } from '../session/bridge-session';

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

export class BrowserContext {
    constructor(private readonly session: BridgeSession) {}

    async cookies(_urls?: string | string[]): Promise<Cookie[]> {
        const raw = await this.session.sendCommand<string>({
            type: 'evaluate',
            expression: 'document.cookie',
        });
        if (!raw) return [];
        return raw.split(';').map(c => c.trim()).filter(Boolean).map(pair => {
            const eq = pair.indexOf('=');
            return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() };
        });
    }

    async clearCookies(): Promise<void> {
        await this.session.sendCommand({
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
        for (const c of cookies) {
            const parts = [`${encodeURIComponent(c.name)}=${encodeURIComponent(c.value)}`];
            if (c.path) parts.push(`path=${c.path}`);
            if (c.domain) parts.push(`domain=${c.domain}`);
            if (c.expires !== undefined) parts.push(`expires=${new Date(c.expires * 1000).toUTCString()}`);
            if (c.secure) parts.push('secure');
            if (c.sameSite) parts.push(`samesite=${c.sameSite}`);
            await this.session.sendCommand({
                type: 'evaluate',
                expression: `document.cookie = ${JSON.stringify(parts.join('; '))}`,
            });
        }
    }

    async storageState(): Promise<{
        cookies: Cookie[];
        origins: { origin: string; localStorage: { name: string; value: string }[] }[];
    }> {
        const [cookies, items, currentUrl] = await Promise.all([
            this.cookies(),
            this.session.sendCommand<{ name: string; value: string }[]>({
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
            this.session.sendCommand<string>({ type: 'url' }),
        ]);
        let origin = '*';
        try { origin = new URL(currentUrl).origin; } catch { /* keep '*' */ }
        return { cookies, origins: [{ origin, localStorage: items }] };
    }

    async close(): Promise<void> {}
}
