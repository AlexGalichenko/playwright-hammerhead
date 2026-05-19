import { test, expect } from './fixtures';

const LOCAL       = 'http://localhost:8000/index.html';
const SECOND_PAGE = 'http://localhost:8000/secondPage.html';
const POPUP_PAGE  = 'http://localhost:8000/popup-page.html';

test.describe('browser.newContext / multi-page', () => {
    test('newContext returns a BrowserContext with newPage', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        expect(ctx).toBeTruthy();
        expect(typeof ctx.newPage).toBe('function');
        await ctx.close();
    });

    test('context.newPage opens a page and adds it to context.pages()', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const page = await ctx.newPage();

        expect(ctx.pages()).toHaveLength(1);
        expect(ctx.pages()[0]).toBe(page);

        await ctx.close();
    });

    test('two pages coexist in the same context', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const page1 = await ctx.newPage();
        const page2 = await ctx.newPage();

        await page1.goto(LOCAL);
        await page2.goto(SECOND_PAGE);

        expect(ctx.pages()).toHaveLength(2);
        expect(safariBrowser.pages()).toContain(page1);
        expect(safariBrowser.pages()).toContain(page2);

        await ctx.close();
    });

    test('two pages load independent content', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const page1 = await ctx.newPage();
        const page2 = await ctx.newPage();

        await page1.goto(LOCAL);
        await page2.goto(SECOND_PAGE);

        expect(await page1.title()).toBe('Local Test Page');
        expect(await page2.title()).toBe('Local Second Test Page');

        await ctx.close();
    });

    test('closing a page removes it from context.pages()', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const page1 = await ctx.newPage();
        const page2 = await ctx.newPage();

        expect(ctx.pages()).toHaveLength(2);
        await page1.close();
        expect(ctx.pages()).toHaveLength(1);
        expect(ctx.pages()[0]).toBe(page2);

        await ctx.close();
    });

    test('browser.pages() lists pages across contexts', async ({ safariBrowser }) => {
        const ctx1 = await safariBrowser.newContext();
        const ctx2 = await safariBrowser.newContext();
        const p1 = await ctx1.newPage();
        const p2 = await ctx2.newPage();

        const all = safariBrowser.pages();
        expect(all).toContain(p1);
        expect(all).toContain(p2);

        await ctx1.close();
        await ctx2.close();
    });

    test('context.waitForEvent("page") resolves when newPage is called', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const [newPage] = await Promise.all([
            ctx.waitForEvent('page'),
            ctx.newPage(),
        ]);

        expect(newPage).toBeTruthy();
        await ctx.close();
    });

    test('browser.contexts() returns created contexts', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        expect(safariBrowser.contexts()).toContain(ctx);
        await ctx.close();
        expect(safariBrowser.contexts()).not.toContain(ctx);
    });

    test('context.close() closes all its pages', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const page1 = await ctx.newPage();
        const page2 = await ctx.newPage();

        expect(page1.isClosed()).toBe(false);
        expect(page2.isClosed()).toBe(false);

        await ctx.close();

        expect(page1.isClosed()).toBe(true);
        expect(page2.isClosed()).toBe(true);
    });

    test('popup-page.html opens a second page via window.open', async ({ safariPage }) => {
        await safariPage.goto(POPUP_PAGE);
        await expect.poll(() => safariPage.context().pages()).toHaveLength(2);
        const pages = safariPage.context().pages();
        const page2 = pages[1];
        await page2.waitForLoadState();
        expect(await page2.url()).toBe(SECOND_PAGE);
        expect(await page2.title()).toBe('Local Second Test Page');
    });

    test('navigating two pages independently does not affect each other', async ({ safariBrowser }) => {
        const ctx = await safariBrowser.newContext();
        const page1 = await ctx.newPage();
        const page2 = await ctx.newPage();

        await page1.goto(LOCAL);
        await page2.goto(LOCAL);

        await page1.goto(SECOND_PAGE);

        expect(await page1.title()).toBe('Local Second Test Page');
        expect(await page2.title()).toBe('Local Test Page');

        await ctx.close();
    });
});
