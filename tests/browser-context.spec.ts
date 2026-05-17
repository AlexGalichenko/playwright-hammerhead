import { test, expect } from './fixtures';

test.describe('BrowserContext.cookies', () => {
    test('returns empty array when no cookies are set', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
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
        await page.goto('https://www.saucedemo.com/');
        await page.evaluate(() => { document.cookie = 'test_key=test_value; path=/'; });

        const cookies = await page.context().cookies();
        const found = cookies.find(c => c.name === 'test_key');
        expect(found).toBeTruthy();
        expect(found!.value).toBe('test_value');
    });

    test('returns multiple cookies', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
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
        await page.goto('https://www.saucedemo.com/');
        const cookies = await page.context().cookies('https://www.saucedemo.com/');
        expect(Array.isArray(cookies)).toBe(true);
    });
});

test.describe('BrowserContext.clearCookies', () => {
    test('removes all cookies', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.evaluate(() => { document.cookie = 'to_clear=yes; path=/'; });

        await page.context().clearCookies();

        const cookies = await page.context().cookies();
        expect(cookies).toEqual([]);
    });

    test('is a no-op when there are no cookies', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.context().clearCookies();
        await page.context().clearCookies();

        const cookies = await page.context().cookies();
        expect(cookies).toEqual([]);
    });
});

test.describe('BrowserContext.addCookies', () => {
    test('adds a single cookie that is readable afterwards', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.context().clearCookies();

        await page.context().addCookies([{ name: 'session', value: 'abc123' }]);

        const cookies = await page.context().cookies();
        const found = cookies.find(c => c.name === 'session');
        expect(found).toBeTruthy();
        expect(found!.value).toBe('abc123');
    });

    test('adds multiple cookies in one call', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.context().clearCookies();

        await page.context().addCookies([
            { name: 'c1', value: 'v1' },
            { name: 'c2', value: 'v2' },
        ]);

        const cookies = await page.context().cookies();
        const names = cookies.map(c => c.name);
        expect(names).toContain('c1');
        expect(names).toContain('c2');
    });

    test('cookie with path attribute is set', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.context().clearCookies();

        await page.context().addCookies([{ name: 'pathcookie', value: 'pv', path: '/' }]);

        const cookies = await page.context().cookies();
        expect(cookies.find(c => c.name === 'pathcookie')).toBeTruthy();
    });

    test('cookie with expires attribute is accepted', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.context().clearCookies();

        const future = Math.floor(Date.now() / 1000) + 3600;
        await page.context().addCookies([{ name: 'expcookie', value: 'ev', expires: future }]);

        const cookies = await page.context().cookies();
        expect(cookies.find(c => c.name === 'expcookie')).toBeTruthy();
    });

    test('cookie with secure flag does not throw', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await expect(
            page.context().addCookies([{ name: 'securecookie', value: 'sv', secure: true }])
        ).resolves.toBeUndefined();
    });

    test('cookie with sameSite attribute is accepted', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.context().clearCookies();

        await page.context().addCookies([{ name: 'sscookie', value: 'ssv', sameSite: 'Lax' }]);

        const cookies = await page.context().cookies();
        expect(cookies.find(c => c.name === 'sscookie')).toBeTruthy();
    });

    test('does nothing when passed an empty array', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.context().clearCookies();

        await page.context().addCookies([]);

        const cookies = await page.context().cookies();
        expect(cookies).toEqual([]);
    });
});

test.describe('BrowserContext.storageState', () => {
    test('returns cookies in the state', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.context().clearCookies();
        await page.context().addCookies([{ name: 'state_cookie', value: 'state_val' }]);

        const state = await page.context().storageState();

        const found = state.cookies.find(c => c.name === 'state_cookie');
        expect(found).toBeTruthy();
        expect(found!.value).toBe('state_val');
    });

    test('returns localStorage items in the origins array', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.evaluate(() => localStorage.setItem('ls_key', 'ls_val'));

        const state = await page.context().storageState();

        expect(state.origins.length).toBeGreaterThan(0);
        const ls = state.origins[0].localStorage;
        const item = ls.find(i => i.name === 'ls_key');
        expect(item).toBeTruthy();
        expect(item!.value).toBe('ls_val');
    });

    test('origin matches the current page URL origin', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        const pageOrigin = new URL(await page.url()).origin;
        const state = await page.context().storageState();

        expect(state.origins[0].origin).toBe(pageOrigin);
    });

    test('localStorage array is empty when nothing is stored', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.evaluate(() => localStorage.clear());

        const state = await page.context().storageState();

        expect(state.origins[0].localStorage).toEqual([]);
    });

    test('returns multiple localStorage entries', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
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
        await page.goto('https://www.saucedemo.com/');
        await expect(page.context().close()).resolves.toBeUndefined();
    });

    test('can be called multiple times without error', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.context().close();
        await expect(page.context().close()).resolves.toBeUndefined();
    });
});
