import { test as base, expect as playwrightExpect } from '@playwright/test';
import { safari, expect } from '../src';
import type { Browser } from '../src/browser/browser';
import type { Page } from '../src/page/page';

// Requires a booted iOS Simulator: `xcrun simctl boot <device>` or launch via Xcode / Simulator.app
// Run with: npx playwright test tests/simulator.spec.ts

type SimulatorWorkerFixtures = { simulatorBrowser: Browser };
type SimulatorTestFixtures  = { simulatorPage: Page };

const SIM_PORT = 9200;

const test = base.extend<SimulatorTestFixtures, SimulatorWorkerFixtures>({
    simulatorBrowser: [
        async ({}, use, testInfo) => {
            const port = SIM_PORT + 2 * testInfo.workerIndex;
            const crossDomainPort = port + 1;
            const browser = await safari.launch({ port, crossDomainPort, device: 'booted' });
            await use(browser);
            await browser.close();
        },
        { scope: 'worker' },
    ],

    simulatorPage: async ({ simulatorBrowser }, use) => {
        const page = await simulatorBrowser.newPage();
        page._stepReporter = (title, fn) => test.step(title, fn);
        await use(page);
        await page.close();
    },
});

test.describe('iOS Simulator — Saucedemo checkout flow', () => {
    test('completes full checkout as standard_user', async ({ simulatorPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');

        await expect(page.locator('.inventory_list')).toBeVisible({ timeout: 15000 });

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

        await expect(page.locator('.complete-header')).toHaveText('Thank you for your order!', { timeout: 15000 });
        await test.info().attach('screenshot.png', {
            body: await page.screenshot(),
        });
    });
});

test.describe('iOS Simulator — Saucedemo login', () => {
    test('login page loads and title is correct', async ({ simulatorPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        const title = await page.title();
        playwrightExpect(title).toContain('Swag Labs');
    });

    test('standard_user can log in and see inventory', async ({ simulatorPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');

        await expect(page.locator('.inventory_list')).toBeVisible({ timeout: 15000 });
        await page.waitForTimeout(10000);
    });

    test('locked_out_user sees error message', async ({ simulatorPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        await page.fill('#user-name', 'locked_out_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');

        await expect(page.locator('[data-test="error"]')).toBeVisible();
        await expect(page.locator('[data-test="error"]')).toContainText('locked out');
    });
});

test.describe('iOS Simulator — page.evaluate', () => {
    test('evaluate returns document title', async ({ simulatorPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        const title = await page.evaluate(() => document.title);
        playwrightExpect(title).toContain('Swag Labs');
    });

    test('evaluate can read and write window variables', async ({ simulatorPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        await page.evaluate(() => { (window as any).__sim_test = 42; });
        const val = await page.evaluate(() => (window as any).__sim_test);
        playwrightExpect(val).toBe(42);
    });
});

test.describe('iOS Simulator — page.route', () => {
    test('fulfill returns mocked JSON response', async ({ simulatorPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        let handled = false;
        await page.route('**/api/sim-test', async (route) => {
            handled = true;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true }),
            });
        });

        const data = await page.evaluate(() =>
            fetch('https://api.example.com/api/sim-test').then(r => r.json())
        );

        playwrightExpect(handled).toBe(true);
        playwrightExpect(data).toEqual({ ok: true });
    });
});
