import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [['html', { open: 'never' }]],
    use: {
        trace: 'on-first-retry',
    },

    projects: [
        // Hammerhead-powered real Safari — uses custom fixtures, no Playwright browser needed
        {
            name: 'safari-hammerhead',
            testMatch: '**/safari.spec.ts',
        },

        // Standard Playwright browser projects — exclude the safari hammerhead spec
        {
            name: 'chromium',
            testMatch: ['**/example.spec.ts', '**/checkout.spec.ts'],
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            testMatch: ['**/example.spec.ts', '**/checkout.spec.ts'],
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            testMatch: ['**/example.spec.ts', '**/checkout.spec.ts'],
            use: { ...devices['Desktop Safari'] },
        },
    ],
});
