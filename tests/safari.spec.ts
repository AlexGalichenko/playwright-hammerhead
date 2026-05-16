import { test, expect } from './fixtures';

test.describe('Saucedemo checkout flow', () => {
    test('completes full checkout as standard_user', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');

        await expect
            .poll(() => page.locator('.inventory_list').isVisible(), { timeout: 10000 })
            .toBe(true);

        await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');

        await expect
            .poll(() => page.locator('.shopping_cart_badge').textContent(), { timeout: 5000 })
            .toBe('1');

        await page.click('.shopping_cart_link');

        await expect
            .poll(() => page.locator('.cart_item').isVisible(), { timeout: 5000 })
            .toBe(true);

        await page.click('[data-test="checkout"]');

        await page.fill('[data-test="firstName"]', 'John');
        await page.fill('[data-test="lastName"]', 'Doe');
        await page.fill('[data-test="postalCode"]', '12345');
        await page.click('[data-test="continue"]');

        await expect
            .poll(() => page.locator('.summary_info').isVisible(), { timeout: 5000 })
            .toBe(true);

        await page.click('[data-test="finish"]');

        await expect
            .poll(() => page.locator('.complete-header').textContent(), { timeout: 10000 })
            .toBe('Thank you for your order!');
    });
});

test.describe('Safari via hammerhead proxy', () => {
    test('page has correct title', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const title = await page.title();
        expect(title).toContain('Swag Labs');
    });

    test('can read heading text content', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const heading = await page.locator('h1').textContent();
        expect(heading?.trim()).toBe('Swag Labs');
    });

    test('can evaluate JS in the page context', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const linkCount = await page.evaluate(
            () => document.querySelectorAll('a').length
        );
        expect(linkCount).toBeGreaterThan(0);
    });

    test('locator isVisible reflects element presence', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await expect
            .poll(() => page.locator('h1').isVisible(), { timeout: 5000 })
            .toBe(true);
        await expect
            .poll(() => page.locator('#does-not-exist').isVisible(), { timeout: 5000 })
            .toBe(false);
    });

    test('can read href attribute via locator', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const href = await page.locator('a').getAttribute('href');
        expect(href).toBeTruthy();
    });
});

test.describe('Google calc', () => {
    test('page has correct title', async ({ safariPage: page }) => {
        await page.goto('https://www.google.com/search?q=google+calculator');
        const title = await page.title();
        expect(title).toContain('Google Search');
    });
});
