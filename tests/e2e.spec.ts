import { test, expect } from './fixtures';

const LOGIN_URL = 'http://localhost:8000/login.html';

test.describe('Shop', () => {
    test.beforeEach(async ({ safariPage: page }) => {
        await page.goto(LOGIN_URL);
        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');
        await expect(page.locator('.inventory_list')).toBeVisible();
    });

    test('adds item to cart', async ({ safariPage: page }) => {
        await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');
        await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
    });

    test('cart shows added item', async ({ safariPage: page }) => {
        await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');
        await page.click('.shopping_cart_link');
        await expect(page.locator('.cart_item')).toBeVisible();
        await expect(page.locator('[data-test="item-4-title-link"]')).toContainText('Sauce Labs Backpack');
    });

    test('completes full checkout', async ({ safariPage: page }) => {
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

    test('shows error when checkout info is missing', async ({ safariPage: page }) => {
        await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');
        await page.click('.shopping_cart_link');
        await page.click('[data-test="checkout"]');
        await page.click('[data-test="continue"]');

        await expect(page.locator('[data-test="error"]')).toBeVisible();
    });
});

test.describe('Catalog', () => {
    test('multi-step catalog checkout', async ({ safariPage: page }) => {
        await page.goto('http://localhost:8000/catalog.html');
        await page.locator('[role="listitem"][id*=category]').filter({ hasText: 'Keyboards' }).click();
        await page.locator('[role="listitem"][id*=category]').filter({ hasText: 'Internet Keyboard' }).click();
        await page.locator('[aria-label="Product Footer"] button').click();
        await page.locator('[aria-label="Show Shopping Cart"]').click();
        await page.locator('[data-sap-ui="container-cart---cartView--proceedButton"]').click();
        await page.locator('[data-sap-ui="container-cart---checkoutView--contentsStep-nextButton"]').click();
        await page.locator('[data-sap-ui="container-cart---checkoutView--paymentTypeStep-nextButton"]').click();
        await page.locator('#container-cart---checkoutView--creditCardHolderName-inner').fill('John Doe');
        await page.locator('#container-cart---checkoutView--creditCardNumber-inner').fill('4111 1111 1111 1111');
        await page.locator('#container-cart---checkoutView--creditCardExpirationDate-inner').fill('12/34');
        await page.locator('#container-cart---checkoutView--creditCardSecurityNumber-inner').fill('123');
        await page.locator('[data-sap-ui="container-cart---checkoutView--creditCardStep-nextButton"]').click();
        await expect(page.locator('#view-order-complete')).toBeVisible();
    });
});
