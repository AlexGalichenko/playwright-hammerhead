import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    webServer: {
        command: 'node server.js',
        port: 8000,
        reuseExistingServer: !process.env.CI,
    },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: [['html', { open: 'never' }]],
    use: {
        trace: 'on-first-retry',
        actionTimeout: 10 * 1000,
    },
    expect: {
        timeout: 10000,
    },
    timeout: 60 * 1000,

    projects: [
        // Hammerhead-powered real Safari — uses custom fixtures, no Playwright browser needed
        {
            name: 'safari-hammerhead',
            testMatch: '**/*.spec.ts',
        },
        {
            name: 'e2e',
            testMatch: '**/checkout.spec.ts',
        },
    ],
});
