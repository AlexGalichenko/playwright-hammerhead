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

const PORT = 9000;

export const test = base.extend<SafariTestFixtures, SafariWorkerFixtures>({
    safariBrowser: [
        async ({}, use, testInfo) => {
            const port = PORT + 2 * testInfo.workerIndex;
            const crossDomainPort = port + 1;
            const browser = await safari.launch({ port: port, crossDomainPort: crossDomainPort, use: { actionTimeout: 30_000, navigationTimeout: 30_000 } });
            await use(browser);
            await browser.close();
        },
        { scope: 'worker' },
    ],

    safariPage: async ({ safariBrowser }, use) => {
        const page = await safariBrowser.newPage();
        page._stepReporter = (title, fn) => test.step(title, fn);
        await use(page);
        await page.close();
    },
});

export { expect } from '../src/matchers';
