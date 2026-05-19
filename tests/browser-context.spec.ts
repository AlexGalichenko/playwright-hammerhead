import { test, expect } from './fixtures';

const LOCAL = 'http://localhost:8000/index.html';

test.describe('BrowserContext.cookies', () => {
    test('returns empty array when no cookies are set', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.evaluate(() => {
            document.cookie.split(';').forEach(c => {
                const name = c.split('=')[0].trim();
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
            });
        });

        const cookies = await page.context().cookies();
        expect(cookies).toEqual([]);
    });

    test('returns a cookie that was set via document.cookie', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.evaluate(() => { document.cookie = 'test_key=test_value; path=/'; });

        const cookies = await page.context().cookies();
        const found = cookies.find(c => c.name === 'test_key');
        expect(found).toBeTruthy();
        expect(found!.value).toBe('test_value');
    });

    test('returns multiple cookies', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.evaluate(() => {
            document.cookie = 'alpha=1; path=/';
            document.cookie = 'beta=2; path=/';
        });

        const cookies = await page.context().cookies();
        const names = cookies.map(c => c.name);
        expect(names).toContain('alpha');
        expect(names).toContain('beta');
    });

    test('_urls parameter is accepted without error', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        const cookies = await page.context().cookies(LOCAL);
        expect(Array.isArray(cookies)).toBe(true);
    });
});

test.describe('BrowserContext.clearCookies', () => {
    test('removes all cookies', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.evaluate(() => { document.cookie = 'to_clear=yes; path=/'; });

        await page.context().clearCookies();

        const cookies = await page.context().cookies();
        expect(cookies).toEqual([]);
    });

    test('is a no-op when there are no cookies', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.context().clearCookies();
        await page.context().clearCookies();

        const cookies = await page.context().cookies();
        expect(cookies).toEqual([]);
    });
});

test.describe('BrowserContext.addCookies', () => {
    test('adds a single cookie that is readable afterwards', async ({ safariPage: page }) => {
        await page.context().clearCookies();
        await page.context().addCookies([{ name: 'session', value: 'abc123' }]);
        await page.goto(LOCAL);
        const cookies = await page.context().cookies();
        const found = cookies.find(c => c.name === 'session');
        expect(found).toBeTruthy();
        expect(found!.value).toBe('abc123');
    });

    test('adds multiple cookies in one call', async ({ safariPage: page }) => {
        await page.context().clearCookies();
        await page.context().addCookies([
            { name: 'c1', value: 'v1' },
            { name: 'c2', value: 'v2' },
        ]);
        await page.goto(LOCAL);
        const cookies = await page.context().cookies();
        const names = cookies.map(c => c.name);
        expect(names).toContain('c1');
        expect(names).toContain('c2');
    });

    test('cookie with path attribute is set', async ({ safariPage: page }) => {
        await page.context().clearCookies();
        await page.context().addCookies([{ name: 'pathcookie', value: 'pv', path: '/' }]);
        await page.goto(LOCAL);
        const cookies = await page.context().cookies();
        expect(cookies.find(c => c.name === 'pathcookie')).toBeTruthy();
    });

    test('cookie with expires attribute is accepted', async ({ safariPage: page }) => {
        await page.context().clearCookies();
        await page.goto(LOCAL);
        const future = Math.floor(Date.now() / 1000) + 3600;
        await page.context().addCookies([{ name: 'expcookie', value: 'ev', expires: future }]);

        const cookies = await page.context().cookies();
        expect(cookies.find(c => c.name === 'expcookie')).toBeTruthy();
    });

    test('cookie with secure flag does not throw', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await expect(
            page.context().addCookies([{ name: 'securecookie', value: 'sv', secure: true }])
        ).resolves.toBeUndefined();
    });

    test('cookie with sameSite attribute is accepted', async ({ safariPage: page }) => {
        await page.context().clearCookies();
        await page.context().addCookies([{ name: 'sscookie', value: 'ssv', sameSite: 'Lax' }]);
        await page.goto(LOCAL);
        const cookies = await page.context().cookies();
        expect(cookies.find(c => c.name === 'sscookie')).toBeTruthy();
    });

    test('does nothing when passed an empty array', async ({ safariPage: page }) => {
        await page.context().clearCookies();
        await page.context().addCookies([]);
        await page.goto(LOCAL);
        const cookies = await page.context().cookies();
        expect(cookies).toEqual([]);
    });
});

test.describe('BrowserContext.storageState', () => {
    test('returns cookies in the state', async ({ safariPage: page }) => {
        await page.context().clearCookies();
        await page.context().addCookies([{ name: 'state_cookie', value: 'state_val' }]);
        await page.goto(LOCAL);
        const state = await page.context().storageState();

        const found = state.cookies.find(c => c.name === 'state_cookie');
        expect(found).toBeTruthy();
        expect(found!.value).toBe('state_val');
    });

    test('returns localStorage items in the origins array', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.evaluate(() => localStorage.setItem('ls_key', 'ls_val'));

        const state = await page.context().storageState();

        expect(state.origins.length).toBeGreaterThan(0);
        const ls = state.origins[0].localStorage;
        const item = ls.find(i => i.name === 'ls_key');
        expect(item).toBeTruthy();
        expect(item!.value).toBe('ls_val');
    });

    test('origin matches the current page URL origin', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const pageOrigin = new URL(await page.url()).origin;
        const state = await page.context().storageState();

        expect(state.origins[0].origin).toBe(pageOrigin);
    });

    test('localStorage array is empty when nothing is stored', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.evaluate(() => localStorage.clear());

        const state = await page.context().storageState();

        expect(state.origins[0].localStorage).toEqual([]);
    });

    test('returns multiple localStorage entries', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.evaluate(() => {
            localStorage.clear();
            localStorage.setItem('k1', 'v1');
            localStorage.setItem('k2', 'v2');
        });

        const state = await page.context().storageState();
        const ls = state.origins[0].localStorage;

        expect(ls.find(i => i.name === 'k1')?.value).toBe('v1');
        expect(ls.find(i => i.name === 'k2')?.value).toBe('v2');
    });
});

test.describe('BrowserContext.close', () => {
    test('resolves without throwing', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await expect(page.context().close()).resolves.toBeUndefined();
    });

    test('can be called multiple times without error', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.context().close();
        await expect(page.context().close()).resolves.toBeUndefined();
    });
});

test.describe('BrowserContext.isClosed', () => {
    test('is false before the context is closed', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        expect(ctx.isClosed()).toBe(false);
        await ctx.close();
    });

    test('is true after the context is closed', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        await ctx.close();
        expect(ctx.isClosed()).toBe(true);
    });
});

test.describe('BrowserContext.browser', () => {
    test('returns the browser that created the context', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        expect(ctx.browser()).toBe(safariBrowser);
        await ctx.close();
    });
});

test.describe('BrowserContext.addInitScript', () => {
    test('script runs on pages opened after the call', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        await ctx.addInitScript('window.__ctxInit = 42;');
        const page = await ctx.newPage();
        await page.goto(LOCAL);
        const val = await page.evaluate(() => (window as any).__ctxInit);
        expect(val).toBe(42);
        await ctx.close();
    });
});

test.describe('BrowserContext.exposeFunction', () => {
    test('exposed function is accessible on pages in the context', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        await ctx.exposeFunction('ctxAdd', (a: unknown, b: unknown) => (a as number) + (b as number));
        const page = await ctx.newPage();
        await page.goto(LOCAL);
        await page.reload();
        const result = await page.evaluate(() => (window as any).ctxAdd(10, 20));
        expect(result).toBe(30);
        await ctx.close();
    });
});

test.describe('BrowserContext.setDefaultTimeout', () => {
    test('propagates to pages created within the context', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        ctx.setDefaultTimeout(15000);
        const page = await ctx.newPage();
        await page.goto(LOCAL);
        await page.locator('#login-button').waitFor({ state: 'visible' });
        await ctx.close();
    });
});

test.describe('BrowserContext.setExtraHTTPHeaders', () => {
    test('headers are sent with requests from context pages', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const page = await ctx.newPage();
        await page.goto(LOCAL);

        let receivedHeaders: Record<string, string> = {};
        await page.route('**/api/ctx-headers', async (route, request) => {
            receivedHeaders = request.headers();
            await route.fulfill({ status: 200, body: 'ok' });
        }, { debug: true });

        await ctx.setExtraHTTPHeaders({ 'x-ctx-header': 'ctx-value' });
        await page.evaluate(() => fetch('https://api.example.com/api/ctx-headers'));
        await page.waitForTimeout(500);

        expect(receivedHeaders['x-ctx-header']).toBe('ctx-value');
        await ctx.close();
    });
});

test.describe('BrowserContext.setGeolocation', () => {
    test('overrides navigator.geolocation.getCurrentPosition', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const page = await ctx.newPage();
        await page.goto(LOCAL);
        await ctx.setGeolocation({ latitude: 51.5074, longitude: -0.1278 });

        const coords = await page.evaluate(() => new Promise(resolve => {
            navigator.geolocation.getCurrentPosition(
                pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => resolve(null),
            );
        }));

        expect((coords as any).lat).toBeCloseTo(51.5074);
        expect((coords as any).lng).toBeCloseTo(-0.1278);
        await ctx.close();
    });
});

test.describe('BrowserContext.setOffline', () => {
    test('makes fetch reject when offline mode is enabled', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const page = await ctx.newPage();
        await page.goto(LOCAL);
        await ctx.setOffline(true);

        const failed = await page.evaluate(() =>
            fetch('https://api.example.com/api/offline-test')
                .then(() => false)
                .catch(() => true)
        );
        expect(failed).toBe(true);

        await ctx.setOffline(false);
        await ctx.close();
    });
});

test.describe('BrowserContext.route', () => {
    test('intercepts requests from pages in the context', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const page = await ctx.newPage();
        await page.goto(LOCAL);

        let handled = false;
        await ctx.route('**/api/ctx-route', async (route) => {
            handled = true;
            await route.fulfill({ status: 200, body: 'context-ok' });
        });

        const body = await page.evaluate(() =>
            fetch('https://api.example.com/api/ctx-route').then(r => r.text())
        );

        expect(handled).toBe(true);
        expect(body).toBe('context-ok');
        await ctx.close();
    });
});

test.describe('BrowserContext.setStorageState', () => {
    test('restores cookies from the provided state', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const page = await ctx.newPage();
        await page.goto(LOCAL);
        await ctx.clearCookies();

        await ctx.setStorageState({
            cookies: [{ name: 'restored', value: 'yes' }],
        });

        const cookies = await ctx.cookies();
        expect(cookies.find(c => c.name === 'restored')?.value).toBe('yes');
        await ctx.close();
    });

    test('restores localStorage items from the provided state', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const page = await ctx.newPage();
        await page.goto(LOCAL);
        await page.evaluate(() => localStorage.clear());

        await ctx.setStorageState({
            origins: [{ origin: 'http://localhost:8000', localStorage: [{ name: 'stored', value: 'data' }] }],
        });

        const val = await page.evaluate(() => localStorage.getItem('stored'));
        expect(val).toBe('data');
        await ctx.close();
    });
});
