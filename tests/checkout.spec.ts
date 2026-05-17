import { test, expect } from './fixtures';

const BASE_URL = 'https://www.saucedemo.com';

test.describe('Saucedemo checkout flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL);
        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');
        await expect(page.locator('.inventory_list')).toBeVisible();
    });

    test('adds item to cart', async ({ page }) => {
        await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');
        await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
    });

    test('cart shows added item', async ({ page }) => {
        await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');
        await page.click('.shopping_cart_link');
        await expect(page.locator('.cart_item')).toBeVisible();
        await expect(page.locator('[data-test="item-4-title-link"]')).toContainText('Sauce Labs Backpack');
    });

    test('completes full checkout', async ({ page }) => {
        await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');
        await page.click('.shopping_cart_link');
        await page.click('[data-test="checkout"]');

        await page.fill('[data-test="firstName"]', 'John');
        await page.fill('[data-test="lastName"]', 'Doe');
        await page.fill('[data-test="postalCode"]', '12345');
        await page.click('[data-test="continue"]');

        await expect(page.locator('.summary_info')).toBeVisible();
        await page.click('[data-test="finish"]');

        await expect(page.locator('.complete-header')).toHaveText('Thank you for your order!');
    });

    test('shows error when checkout info is missing', async ({ page }) => {
        await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');
        await page.click('.shopping_cart_link');
        await page.click('[data-test="checkout"]');
        await page.click('[data-test="continue"]');

        await expect(page.locator('[data-test="error"]')).toBeVisible();
    });
});
