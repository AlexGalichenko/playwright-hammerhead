# playwright-hammerhead

A Playwright-compatible API layer for Safari automation via [testcafe-hammerhead](https://github.com/DevExpress/testcafe-hammerhead) proxy and [modern-screenshot](https://github.com/qq15725/modern-screenshot).

Playwright does not support controlling a real Safari instance. This library solves that by running a local hammerhead HTTP proxy that instruments every page Safari loads — injecting a bridge script that exposes a Playwright-like `Page`, `Locator`, `Browser`, and `BrowserContext` API. Tests are written exactly as they would be in Playwright and run through the standard `@playwright/test` runner.

---

## How it works

```
Test code (Playwright API)
        │
        ▼
  playwright-hammerhead
        │  launches
        ▼
testcafe-hammerhead proxy  ←──  Safari opens http://localhost:<port>/proxy?url=…
        │  injects bridge script into every response
        ▼
  BridgeSession (WebSocket)  ◄──►  bridge script running in Safari
        │
        ▼
     browser
```

No WebDriver, no CDP, no browser extension. The proxy rewrites all traffic so the bridge script can intercept XHR/fetch calls, dispatch DOM events, and communicate results back over a WebSocket.

---

## Prerequisites

- **macOS** with Safari installed
- **Node.js** 18+
- `@playwright/test` (peer dependency — used as the test runner)

---

## Installation

```bash
npm install playwright-hammerhead
```

---

## Quick start

### 1. Set up fixtures

Create a file like `tests/fixtures.ts`:

```ts
import { test as base } from '@playwright/test';
import { safari } from 'playwright-hammerhead';
import type { Browser } from 'playwright-hammerhead';
import type { Page } from 'playwright-hammerhead';

type WorkerFixtures = { safariBrowser: Browser };
type TestFixtures  = { safariPage: Page };

const PORT = 9000;

export const test = base.extend<TestFixtures, WorkerFixtures>({
    safariBrowser: [
        async ({}, use, testInfo) => {
            // Each worker gets its own port pair to run in parallel
            const port = PORT + 2 * testInfo.workerIndex;
            const crossDomainPort = port + 1;
            const browser = await safari.launch({ port, crossDomainPort });
            await use(browser);
            await browser.close();
        },
        { scope: 'worker' },
    ],

    safariPage: async ({ safariBrowser }, use) => {
        const page = await safariBrowser.newPage();
        page._stepReporter = (title, fn) => test.step(title, fn); // optional: Playwright step tracing
        await use(page);
        await page.close();
    },
});

export { expect } from 'playwright-hammerhead';
```

### 2. Write tests

```ts
import { test, expect } from './fixtures';

test('logs in and sees inventory', async ({ safariPage: page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.fill('#user-name', 'standard_user');
    await page.fill('#password', 'secret_sauce');
    await page.click('#login-button');

    await expect(page.locator('.inventory_list')).toBeVisible({ timeout: 10_000 });
});
```

### 3. Configure Playwright

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    workers: 2,
    timeout: 60_000,
    use: { actionTimeout: 10_000 },
    projects: [
        {
            name: 'safari-hammerhead',
            testMatch: '**/*.spec.ts',
        },
    ],
});
```

### 4. Run

```bash
npx playwright test
```

---

## Network interception

Routes work exactly like Playwright's `page.route`:

```ts
// Fulfill with mock data
await page.route('**/api/products', async route => {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 1, name: 'Mocked Item' }]),
    });
});

// Abort a request
await page.route('**/api/blocked', route => route.abort());

// Pass through (observe without modifying)
await page.route('**/api/passthrough', async route => {
    console.log('intercepted', route.request().url());
    await route.continue();
});

// Match with RegExp or predicate
await page.route(/\/api\/v\d+\/users/, route => route.fulfill({ status: 200, body: '[]' }));
await page.route(url => url.includes('/api/custom'), route => route.fulfill({ status: 200 }));
```

---

## Building from source

```bash
git clone https://github.com/AlexGalichenko/playwright-hammerhead.git
cd playwright-hammerhead
npm install
npm run build        # compiles TypeScript → dist/
npm run build:watch  # watch mode
```

---

## Running the test suite

```bash
npx playwright test
npx playwright test --ui   # interactive UI mode
```

Tests require an internet connection — they navigate to `saucedemo.com`.

---

## API coverage

### Page

| Method | Status | Notes |
|---|---|---|
| `goto(url, options?)` | ✅ | |
| `reload(options?)` | ✅ | |
| `goBack(options?)` | ✅ | |
| `goForward(options?)` | ✅ | |
| `url()` | ✅ | |
| `title()` | ✅ | |
| `content()` | ✅ | |
| `setContent(html, options?)` | ✅ | |
| `ariaSnapshot(options?)` | ✅ | |
| `screenshot(options?)` | ✅ | via modern-screenshot |
| `locator(selector)` | ✅ | |
| `getByRole(role, options?)` | ✅ | |
| `getByText(text)` | ✅ | |
| `getByLabel(text)` | ✅ | |
| `getByPlaceholder(text)` | ✅ | |
| `getByTestId(id)` | ✅ | |
| `getByAltText(text)` | ✅ | |
| `getByTitle(text)` | ✅ | |
| `click(selector, options?)` | ✅ | |
| `dblclick(selector, options?)` | ✅ | |
| `tap(selector, options?)` | ✅ | dispatches touchstart/touchend events |
| `fill(selector, value, options?)` | ✅ | |
| `type(selector, text, options?)` | ✅ | |
| `press(selector, key, options?)` | ✅ | |
| `selectOption(selector, values)` | ✅ | |
| `check(selector)` | ✅ | |
| `uncheck(selector)` | ✅ | |
| `setChecked(selector, checked, options?)` | ✅ | |
| `setInputFiles(selector, files, options?)` | ✅ | injects via DataTransfer |
| `hover(selector, options?)` | ✅ | |
| `focus(selector)` | ✅ | |
| `waitForSelector(selector, options?)` | ✅ | |
| `waitForTimeout(ms)` | ✅ | |
| `waitForLoadState(state?)` | ✅ | domcontentloaded, load, networkidle |
| `waitForNavigation(options?)` | ✅ | |
| `waitForURL(url, options?)` | ✅ | |
| `waitForEvent(event, options?)` | ✅ | |
| `waitForFunction(fn, options?)` | ✅ | polling interval configurable |
| `waitForRequest(urlOrPredicate, options?)` | ✅ | string, RegExp, or predicate |
| `waitForResponse(urlOrPredicate, options?)` | ✅ | string, RegExp, or predicate |
| `evaluate(fn, ...args)` | ✅ | |
| `evaluateHandle(fn, ...args)` | ✅ | |
| `route(pattern, handler, options?)` | ✅ | |
| `unroute(pattern?, handler?)` | ✅ | |
| `unrouteAll()` | ✅ | |
| `addInitScript(script, arg?)` | ✅ | |
| `addLocatorHandler(locator, handler)` | ✅ | |
| `removeLocatorHandler(locator)` | ✅ | |
| `addScriptTag(options)` | ✅ | |
| `addStyleTag(options)` | ✅ | |
| `scrollTo(x, y)` | ✅ | |
| `close()` | ✅ | |
| `isClosed()` | ✅ | |
| `context()` | ✅ | |
| `on(event, listener)` / `once` / `off` | ✅ | console, dialog, load, request, … |
| `setDefaultTimeout(ms)` | ✅ | |
| `setDefaultNavigationTimeout(ms)` | ✅ | |
| `setViewportSize(size)` | ✅ | injects meta viewport + CSS constraints |
| `viewportSize()` | ✅ | |
| `mainFrame()` | ✅ | |
| `frames()` | ✅ | |
| `frame({ name?, url? })` | ✅ | |
| `frameLocator(selector)` | ✅ | |
| `setExtraHTTPHeaders(headers)` | ✅ | patches XHR + fetch browser-side |
| `dispatchEvent(selector, type, init?)` | ✅ | |
| `dragAndDrop(source, target)` | ✅ | |
| `exposeFunction(name, fn)` | ✅ | browser calls Node.js fn via bridge |
| `exposeBinding(name, fn)` | ✅ | source carries `{ url }` |
| `emulateMedia(params)` | ✅ | shims `window.matchMedia` |
| `bringToFront()` | ⚠️ | throws — not supported |
| `workers()` | ⚠️ | throws — not supported |
| `pause()` | ⚠️ | throws — not supported |
| `pdf(options?)` | ⚠️ | throws — Safari/N/A |

### Locator

| Method | Status | Notes |
|---|---|---|
| `click(options?)` | ✅ | |
| `dblclick(options?)` | ✅ | |
| `tap(options?)` | ✅ | dispatches touchstart/touchend events |
| `fill(value, options?)` | ✅ | |
| `type(text, options?)` | ✅ | |
| `clear(options?)` | ✅ | |
| `pressSequentially(text, options?)` | ✅ | delegates to `type` |
| `press(key)` | ✅ | |
| `hover(options?)` | ✅ | |
| `focus(options?)` | ✅ | |
| `blur(options?)` | ✅ | |
| `scrollIntoViewIfNeeded(options?)` | ✅ | |
| `selectOption(values, options?)` | ✅ | |
| `check(options?)` | ✅ | |
| `uncheck(options?)` | ✅ | |
| `setChecked(checked, options?)` | ✅ | |
| `setInputFiles(files, options?)` | ✅ | injects via DataTransfer |
| `selectText(options?)` | ✅ | uses `el.select()` or Selection API |
| `isVisible()` | ✅ | |
| `isHidden()` | ✅ | |
| `isEnabled()` | ✅ | |
| `isDisabled()` | ✅ | |
| `isChecked()` | ✅ | |
| `isEditable()` | ✅ | |
| `textContent()` | ✅ | |
| `innerText()` | ✅ | |
| `innerHTML()` | ✅ | |
| `inputValue()` | ✅ | |
| `getAttribute(name)` | ✅ | |
| `waitFor(options?)` | ✅ | |
| `count()` | ✅ | |
| `nth(index)` | ✅ | |
| `first()` | ✅ | |
| `last()` | ✅ | |
| `locator(subSelector)` | ✅ | |
| `frameLocator(selector)` | ✅ | |
| `getByRole(role, options?)` | ✅ | |
| `getByText(text)` | ✅ | |
| `getByLabel(text)` | ✅ | |
| `getByPlaceholder(text)` | ✅ | |
| `getByTestId(id)` | ✅ | |
| `getByAltText(text)` | ✅ | |
| `getByTitle(text)` | ✅ | |
| `filter(options)` | ✅ | hasText, hasNotText, has, hasNot |
| `and(locator)` | ✅ | |
| `or(locator)` | ✅ | |
| `all()` | ✅ | |
| `allTextContents()` | ✅ | |
| `allInnerTexts()` | ✅ | |
| `evaluate(fn, ...args)` | ✅ | |
| `evaluateAll(fn, ...args)` | ✅ | |
| `dispatchEvent(type, init?)` | ✅ | |
| `dragTo(target, options?)` | ✅ | |
| `drop(options?)` | ✅ | |
| `boundingBox(options?)` | ✅ | |
| `screenshot(options?)` | ✅ | via modern-screenshot |
| `ariaSnapshot(options?)` | ✅ | |
| `highlight()` | ✅ | outlines element for 2 s |
| `elementHandle()` | ❌ | returns ElementHandle (legacy) |

### Matchers (`expect`)

Import `expect` from `playwright-hammerhead` (or from your fixtures file) to get Safari-compatible matchers backed by polling rather than CDP.

| Matcher | Target |
|---|---|
| `toBeVisible(options?)` | Locator |
| `toBeHidden(options?)` | Locator |
| `toBeEnabled(options?)` | Locator |
| `toBeDisabled(options?)` | Locator |
| `toBeChecked(options?)` | Locator |
| `toBeEditable(options?)` | Locator |
| `toBeAttached(options?)` | Locator |
| `toBeEmpty(options?)` | Locator |
| `toBeFocused(options?)` | Locator |
| `toBeInViewport(options?)` | Locator |
| `toHaveText(expected, options?)` | Locator |
| `toContainText(expected, options?)` | Locator |
| `toHaveValue(expected, options?)` | Locator |
| `toHaveAttribute(name, expected, options?)` | Locator |
| `toHaveCount(expected, options?)` | Locator |
| `toHaveClass(expected, options?)` | Locator |
| `toHaveId(expected, options?)` | Locator |
| `toHaveRole(expected, options?)` | Locator |
| `toHaveJSProperty(name, value, options?)` | Locator |
| `toHaveCSS(property, value, options?)` | Locator |
| `toHaveValues(values, options?)` | Locator |
| `toHaveAccessibleName(expected, options?)` | Locator |
| `toHaveAccessibleDescription(expected, options?)` | Locator |
| `toHaveAccessibleErrorMessage(expected, options?)` | Locator |
| `toHaveTitle(expected, options?)` | Page |
| `toHaveURL(expected, options?)` | Page |

---

## License

MIT
