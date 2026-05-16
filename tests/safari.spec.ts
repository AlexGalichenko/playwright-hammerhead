import { test, expect } from './fixtures';

test.describe('Saucedemo checkout flow', () => {
    test('completes full checkout as standard_user', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');

        await expect(page.locator('.inventory_list')).toBeVisible({ timeout: 10000 });

        await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');

        await expect(page.locator('.shopping_cart_badge')).toHaveText('1');

        await page.click('.shopping_cart_link');

        await expect(page.locator('.cart_item')).toBeVisible();

        await page.click('[data-test="checkout"]');

        await page.fill('[data-test="firstName"]', 'John');
        await page.fill('[data-test="lastName"]', 'Doe');
        await page.fill('[data-test="postalCode"]', '12345');
        await page.click('[data-test="continue"]');

        await expect(page.locator('.summary_info')).toBeVisible();

        await page.click('[data-test="finish"]');

        await expect(page.locator('.complete-header')).toHaveText('Thank you for your order!', { timeout: 10000 });
    });
});

test.describe('Saucedemo login', () => {
    test('locked_out_user sees error message', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.fill('#user-name', 'locked_out_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');

        await expect(page.locator('[data-test="error"]')).toBeVisible();
        await expect(page.locator('[data-test="error"]')).toContainText('locked out');
    });

    test('empty credentials show required-field error', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.click('#login-button');

        await expect(page.locator('[data-test="error"]')).toBeVisible();
    });

    test('wrong password shows error', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'wrong_password');
        await page.click('#login-button');

        await expect(page.locator('[data-test="error"]')).toBeVisible();
    });
});

test.describe('Saucedemo inventory', () => {
    test.beforeEach(async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');
        await expect(page.locator('.inventory_list')).toBeVisible({ timeout: 10000 });
    });

    test('shows six products', async ({ safariPage: page }) => {
        await expect(page.locator('.inventory_item')).toHaveCount(6);
    });

    test('sorts products by price high to low', async ({ safariPage: page }) => {
        await page.selectOption('.product_sort_container', 'hilo');
        await expect(page.locator('.inventory_item_price')).toHaveText('$49.99');
    });

    test('sorts products by name Z to A', async ({ safariPage: page }) => {
        await page.selectOption('.product_sort_container', 'za');
        await expect(page.locator('.inventory_item_name')).toHaveText('Test.allTheThings() T-Shirt (Red)');
    });

    test('navigates to product detail and back', async ({ safariPage: page }) => {
        await page.click('.inventory_item_name');

        await expect(page.locator('.inventory_details_name')).toBeVisible();

        await page.click('[data-test="back-to-products"]');

        await expect(page.locator('.inventory_list')).toBeVisible();
    });

    test('add multiple items updates cart badge', async ({ safariPage: page }) => {
        await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');
        await page.click('[data-test="add-to-cart-sauce-labs-bike-light"]');

        await expect(page.locator('.shopping_cart_badge')).toHaveText('2');
    });

    test('remove item from cart decrements badge', async ({ safariPage: page }) => {
        await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');
        await page.click('[data-test="add-to-cart-sauce-labs-bike-light"]');

        await expect(page.locator('.shopping_cart_badge')).toHaveText('2');

        await page.click('[data-test="remove-sauce-labs-backpack"]');

        await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
    });

    test('logout returns to login page', async ({ safariPage: page }) => {
        await page.click('#react-burger-menu-btn');

        await expect(page.locator('#logout_sidebar_link')).toBeVisible();

        await page.click('#logout_sidebar_link');

        await expect(page.locator('#login-button')).toBeVisible();
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
        await expect(page.locator('h1')).toBeVisible();
        await expect(page.locator('#does-not-exist')).toBeHidden();
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
