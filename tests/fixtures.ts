import { test as base } from '@playwright/test';
import { safari } from '../src';
import type { Browser } from '../src/browser/browser';
import type { Page } from '../src/page/page';

type SafariWorkerFixtures = {
    safariBrowser: Browser;
};

type SafariTestFixtures = {
    safariPage: Page;
};

export const test = base.extend<SafariTestFixtures, SafariWorkerFixtures>({
    safariBrowser: [
        async ({}, use) => {
            const browser = await safari.launch({ port: 1337, crossDomainPort: 1338 });
            await use(browser);
            await browser.close();
        },
        { scope: 'worker' },
    ],

    safariPage: async ({ safariBrowser }, use) => {
        const page = await safariBrowser.newPage();
        await use(page);
        await page.close();
    },
});

export { expect } from '../src/matchers';
