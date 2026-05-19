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

test.describe('UI5', () => {
    test('ui5 cart functionality', async ({ safariPage: page }) => {
        await page.goto('https://ui5.sap.com/test-resources/sap/m/demokit/cart/webapp/index.html?sap-ui-theme=sap_horizon_dark#');
        await page.locator('[role="listitem"][id*=category]').filter({ hasText: 'Keyboards' }).click();
        await page.locator('[role="listitem"][id*=category]').filter({ hasText: 'Internet Keyboard' }).click();
        await page.locator('[aria-label="Product Footer"] button').click();
        await page.locator('[aria-label="Show Shopping Cart"]').click();
        await page.locator('[data-sap-ui="container-cart---cartView--proceedButton"]').click();
        await page.locator('[data-sap-ui="container-cart---checkoutView--contentsStep-nextButton"]').click();
        await page.locator('[data-sap-ui="container-cart---checkoutView--paymentTypeStep-nextButton"]').click();
        await page.locator('#container-cart---checkoutView--creditCardHolderName-inner').fill('John Doe');
        await page.locator('#container-cart---checkoutView--creditCardNumber-inner').fill('4111 1111 1111 1111');
        await page.locator('#container-cart---checkoutView--creditCardExpirationDate-inner').fill('12/2030');
        await page.locator('#container-cart---checkoutView--creditCardSecurityNumber-inner').fill('123');
        await page.locator('#container-cart---checkoutView--creditCardHolderName-inner').focus();
        await page.locator('[data-sap-ui="container-cart---checkoutView--creditCardStep-nextButton"]').click();

        await page.locator('#container-cart---checkoutView--invoiceAddressAddress-inner').fill('Main St 123');
        await page.locator('#container-cart---checkoutView--invoiceAddressZip-inner').fill('12345');
        await page.locator('#container-cart---checkoutView--invoiceAddressCity-inner').fill('Anytown');
        await page.locator('#container-cart---checkoutView--invoiceAddressCountry-inner').fill('USA');
        await page.locator('#container-cart---checkoutView--invoiceAddressAddress-inner').focus();
        await page.locator('[data-sap-ui="container-cart---checkoutView--invoiceStep-nextButton"]').click();
        await page.locator('[data-sap-ui="container-cart---checkoutView--deliveryTypeStep-nextButton"]').click();
        
        await expect(page.locator('#container-cart---checkoutView--totalPriceTitle-inner')).toHaveText('Total: 16,00 EUR');
        await page.locator('#container-cart---checkoutView--submitOrder').click();
        await page.locator('footer button:has-text("Yes")').click();
        await expect(page.locator('[aria-label="Order Completed"]')).toBeVisible();
        await expect(page.locator('[aria-label="Order Completed"]')).toContainText('Thank you for your order!');
    });
});

test.describe('testauto.app', () => {
    test('create task', async ({ safariPage: page }) => {
        await page.goto('https://testauto.app/task-manager');
        const addTaskButton = page.locator('.btn-add-task');
        await addTaskButton.click();
        const title = page.locator('#task-form-title');
        await title.fill('Test Automation 42');
        const description = page.locator('#task-form-description');
        await description.fill('This is a test automation task.');
        const staus = page.locator('#task-form-status');
        await staus.selectOption('In Progress');
        const radio = page.locator('input[type="radio"][value="LOW"]');
        await radio.click();
        const dateField = page.locator('#task-form-due-date');
        await dateField.fill('2026-05-19');
        const labels = page.locator('#task-form-labels');
        await labels.fill('automation, testing');
        const submitButton = page.locator('button[type="submit"]');
        await submitButton.click();
        const searchInput = page.locator('[aria-label="Search tasks"]');
        await searchInput.fill('Test Automation 42');
        await expect(page.locator('tr:has-text("Test Automation 42")')).toBeVisible();
    });
});