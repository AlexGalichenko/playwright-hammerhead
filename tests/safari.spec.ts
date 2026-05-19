import { test, expect } from './fixtures';
import type { Route, ConsoleMessage, Dialog, Frame, FileChooser, WebSocketEvent, PageResponse } from '../src';

const LOCAL = 'http://localhost:8000/index.html';
const LOGIN_URL  = 'http://localhost:8000/login.html';

test.describe('Shop checkout flow', () => {
    test('completes full checkout as standard_user', async ({ safariPage: page }) => {
        await page.goto(LOGIN_URL);

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
        await test.info().attach('screenshot.png', {
            body: await page.screenshot(),
        });
    });
});

test.describe('Shop login', () => {
    test('locked_out_user sees error message', async ({ safariPage: page }) => {
        await page.goto(LOGIN_URL);
        await page.fill('#user-name', 'locked_out_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');

        await expect(page.locator('[data-test="error"]')).toBeVisible();
        await expect(page.locator('[data-test="error"]')).toContainText('locked out');
    });

    test('empty credentials show required-field error', async ({ safariPage: page }) => {
        await page.goto(LOGIN_URL);
        await page.click('#login-button');

        await expect(page.locator('[data-test="error"]')).toBeVisible();
    });

    test('wrong password shows error', async ({ safariPage: page }) => {
        await page.goto(LOGIN_URL);
        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'wrong_password');
        await page.click('#login-button');

        await expect(page.locator('[data-test="error"]')).toBeVisible();
    });
});

test.describe('Shop inventory', () => {
    test.beforeEach(async ({ safariPage: page }) => {
        await page.goto(LOGIN_URL);
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

test.describe('page.route', () => {
    test.beforeEach(async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await expect(page.locator('#login-button')).toBeVisible({ timeout: 10000 });
    });

    test('fulfill returns custom JSON body', async ({ safariPage: page }) => {
        let handlerCalled = false;

        await page.route('**/api/products', async (route) => {
            handlerCalled = true;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{ id: 1, name: 'Mocked Item' }]),
            });
        }, { debug: true });

        const data = await page.evaluate(() =>
            fetch('https://api.example.com/api/products').then(r => r.json())
        );

        expect(handlerCalled).toBe(true);
        expect(data).toEqual([{ id: 1, name: 'Mocked Item' }]);
    });

    test('fulfill sets custom status code', async ({ safariPage: page }) => {
        await page.route('**/api/missing', async (route) => {
            await route.fulfill({ status: 404, body: 'Not Found' });
        });

        const status = await page.evaluate(() =>
            fetch('https://api.example.com/api/missing').then(r => r.status)
        );

        expect(status).toBe(404);
    });

    test('abort blocks the request with 503', async ({ safariPage: page }) => {
        let handlerCalled = false;

        await page.route('**/api/blocked', async (route) => {
            handlerCalled = true;
            await route.abort();
        }, { debug: true });

        const status = await page.evaluate(() =>
            fetch('https://api.example.com/api/blocked').then(r => r.status)
        );

        expect(handlerCalled).toBe(true);
        expect(status).toBe(503);
    });

    test('continue passes request through and handler is called', async ({ safariPage: page }) => {
        let intercepted = false;

        await page.route('**/api/passthrough', async (route) => {
            intercepted = true;
            await route.continue();
        });

        await page.evaluate(() =>
            fetch('https://api.example.com/api/passthrough').catch(() => null)
        );

        expect(intercepted).toBe(true);
    });

    test('handler receives correct url and method from Request', async ({ safariPage: page }) => {
        let capturedUrl = '';
        let capturedMethod = '';

        await page.route('**/api/info', async (route, request) => {
            capturedUrl = request.url();
            capturedMethod = request.method();
            await route.fulfill({ status: 200, body: 'ok' });
        });

        await page.evaluate(() => fetch('https://api.example.com/api/info'));

        expect(capturedUrl).toContain('/api/info');
        expect(capturedMethod).toBe('get');
    });

    test('regex pattern matches request url', async ({ safariPage: page }) => {
        let matched = false;

        await page.route(/\/api\/v\d+\/users/, async (route) => {
            matched = true;
            await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        });

        await page.evaluate(() => fetch('https://api.example.com/api/v3/users'));

        expect(matched).toBe(true);
    });

    test('function predicate matches request url', async ({ safariPage: page }) => {
        let matched = false;

        await page.route(
            (url) => url.includes('/api/custom'),
            async (route) => {
                matched = true;
                await route.fulfill({ status: 200, body: 'custom' });
            }
        );

        await page.evaluate(() => fetch('https://api.example.com/api/custom/endpoint'));

        expect(matched).toBe(true);
    });

    test('multiple routes each intercept their own url', async ({ safariPage: page }) => {
        await page.route('**/api/users', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(['Alice', 'Bob']),
            });
        });

        await page.route('**/api/orders', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([1, 2, 3]),
            });
        });

        const [users, orders] = await page.evaluate(() =>
            Promise.all([
                fetch('https://api.example.com/api/users').then(r => r.json()),
                fetch('https://api.example.com/api/orders').then(r => r.json()),
            ])
        );

        expect(users).toEqual(['Alice', 'Bob']);
        expect(orders).toEqual([1, 2, 3]);
    });

    test('unroute stops handler from being called', async ({ safariPage: page }) => {
        let callCount = 0;

        const handler = async (route: Route) => {
            callCount++;
            await route.fulfill({ status: 200, body: 'ok' });
        };

        await page.route('**/api/counted', handler);
        await page.evaluate(() => fetch('https://api.example.com/api/counted'));

        await page.unroute('**/api/counted', handler);
        await page.evaluate(() =>
            fetch('https://api.example.com/api/counted').catch(() => null)
        );

        expect(callCount).toBe(1);
    });

    test('unroute with no args removes all routes', async ({ safariPage: page }) => {
        let aHit = false;
        let bHit = false;

        await page.route('**/api/a', async (route) => { aHit = true; await route.fulfill({ status: 200 }); });
        await page.route('**/api/b', async (route) => { bHit = true; await route.fulfill({ status: 200 }); });

        await page.unroute();

        await page.evaluate(() =>
            Promise.all([
                fetch('https://api.example.com/api/a').catch(() => null),
                fetch('https://api.example.com/api/b').catch(() => null),
            ])
        );

        expect(aHit).toBe(false);
        expect(bHit).toBe(false);
    });
});

test.describe('page.addInitScript', () => {
    test('string script sets window variable before page code runs', async ({ safariPage: page }) => {
        await page.addInitScript('window.__initFlag = true;');
        await page.goto(LOCAL);

        const flag = await page.evaluate(() => (window as any).__initFlag);
        expect(flag).toBe(true);
    });

    test('function script with serialised arg sets window variable', async ({ safariPage: page }) => {
        await page.addInitScript((val: unknown) => { (window as any).__initArg = val; }, 42);
        await page.goto(LOCAL);

        const val = await page.evaluate(() => (window as any).__initArg);
        expect(val).toBe(42);
    });

    test('multiple init scripts all run', async ({ safariPage: page }) => {
        await page.addInitScript('window.__a = 1;');
        await page.addInitScript('window.__b = 2;');
        await page.goto(LOCAL);

        const [a, b] = await page.evaluate(() => [(window as any).__a, (window as any).__b]);
        expect(a).toBe(1);
        expect(b).toBe(2);
    });

    test('init script re-runs on subsequent navigation', async ({ safariPage: page }) => {
        await page.addInitScript('window.__nav = (window.__nav || 0) + 1;');
        await page.goto(LOCAL);
        const first = await page.evaluate(() => (window as any).__nav);

        await page.goto(LOCAL);
        const second = await page.evaluate(() => (window as any).__nav);

        expect(first).toBe(1);
        expect(second).toBe(1);
    });
});

test.describe('page.addLocatorHandler', () => {
    test('handler is called when locator becomes visible', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        let handlerCalled = false;

        await page.addLocatorHandler(page.locator('#__hh_overlay'), async () => {
            handlerCalled = true;
        });

        await page.evaluate(() => {
            const d = document.createElement('div');
            d.id = '__hh_overlay';
            d.style.cssText = 'width:100px;height:100px;position:fixed;top:0;left:0;background:red';
            document.body.appendChild(d);
        });

        await page.waitForTimeout(1500);
        expect(handlerCalled).toBe(true);
    });

    test('handler is not called before locator appears', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        let handlerCalled = false;

        await page.addLocatorHandler(page.locator('#__never_exists'), async () => {
            handlerCalled = true;
        });

        await page.waitForTimeout(600);
        expect(handlerCalled).toBe(false);
    });

    test('handler is not called again while already running', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        let callCount = 0;

        await page.addLocatorHandler(page.locator('#__slow_overlay'), async () => {
            callCount++;
            await page.waitForTimeout(800);
        });

        await page.evaluate(() => {
            const d = document.createElement('div');
            d.id = '__slow_overlay';
            d.style.cssText = 'width:50px;height:50px;position:fixed;top:0;left:0';
            document.body.appendChild(d);
        });

        await page.waitForTimeout(1200);
        expect(callCount).toBe(1);
    });
});

test.describe('page.addScriptTag', () => {
    test('inline content script is executed in page context', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.addScriptTag({ content: 'window.__scriptTag = 123;' });

        const val = await page.evaluate(() => (window as any).__scriptTag);
        expect(val).toBe(123);
    });

    test('type attribute is set on injected script element', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.addScriptTag({ content: 'window.__typedScript = true;', type: 'text/javascript' });

        const val = await page.evaluate(() => (window as any).__typedScript);
        expect(val).toBe(true);
    });

    test('multiple script tags can be injected independently', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.addScriptTag({ content: 'window.__s1 = "first";' });
        await page.addScriptTag({ content: 'window.__s2 = "second";' });

        const [s1, s2] = await page.evaluate(() => [(window as any).__s1, (window as any).__s2]);
        expect(s1).toBe('first');
        expect(s2).toBe('second');
    });
});

test.describe('page.addStyleTag', () => {
    test('inline content style is applied to the page', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.addStyleTag({ content: '#login-button { opacity: 0.5; }' });

        const opacity = await page.evaluate(() => {
            const el = document.querySelector('#login-button');
            return el ? window.getComputedStyle(el).opacity : null;
        });
        expect(opacity).toBe('0.5');
    });

    test('multiple style tags can be injected and both apply', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.addStyleTag({ content: '#user-name { color: rgb(255, 0, 0); }' });
        await page.addStyleTag({ content: '#password { color: rgb(0, 0, 255); }' });

        const [c1, c2] = await page.evaluate(() => [
            window.getComputedStyle(document.querySelector('#user-name')!).color,
            window.getComputedStyle(document.querySelector('#password')!).color,
        ]);
        expect(c1).toBe('rgb(255, 0, 0)');
        expect(c2).toBe('rgb(0, 0, 255)');
    });

    test('injected style does not affect unrelated elements', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await page.addStyleTag({ content: '#user-name { visibility: hidden; }' });

        const userNameVisible = await page.evaluate(() => {
            const el = document.querySelector('#user-name');
            return el ? window.getComputedStyle(el).visibility !== 'hidden' : true;
        });
        const passwordVisible = await page.evaluate(() => {
            const el = document.querySelector('#password');
            return el ? window.getComputedStyle(el).visibility !== 'hidden' : false;
        });

        expect(userNameVisible).toBe(false);
        expect(passwordVisible).toBe(true);
    });
});

test.describe('page events', () => {
    // ── close ──────────────────────────────────────────────────────────────

    test('close fires when page.close() is called', async ({ safariBrowser }) => {
        const page = await safariBrowser.newPage();
        await page.goto(LOCAL);

        let fired = false;
        page.once('close', () => { fired = true; });
        await page.close();

        expect(fired).toBe(true);
    });

    // ── console ────────────────────────────────────────────────────────────

    test('console fires with correct type and text for console.log', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const msgPromise = new Promise<ConsoleMessage>(resolve => page.once('console', resolve));
        await page.evaluate(() => console.log('hello events'));
        const msg = await msgPromise;

        expect(msg.type()).toBe('log');
        expect(msg.text()).toBe('hello events');
    });

    test('console captures console.error with error type', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const msgPromise = new Promise<ConsoleMessage>(resolve => page.once('console', resolve));
        await page.evaluate(() => console.error('something broke'));
        const msg = await msgPromise;

        expect(msg.type()).toBe('error');
        expect(msg.text()).toContain('something broke');
    });

    // ── pageerror ──────────────────────────────────────────────────────────

    test('pageerror fires for uncaught window error events', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const errPromise = new Promise<Error>(resolve => page.once('pageerror', resolve));
        await page.evaluate(() =>
            window.dispatchEvent(new ErrorEvent('error', { message: 'intentional test error' }))
        );
        const err = await errPromise;

        expect(err.message).toBe('intentional test error');
    });

    // ── dialog ─────────────────────────────────────────────────────────────

    test('dialog fires for window.alert with correct type and message', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const dialogPromise = new Promise<Dialog>(resolve => page.once('dialog', resolve));
        await page.evaluate(() => window.alert('hello dialog'));
        const dialog = await dialogPromise;

        expect(dialog.type()).toBe('alert');
        expect(dialog.message()).toBe('hello dialog');
    });

    test('dialog fires for window.confirm and returns true by default', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const dialogPromise = new Promise<Dialog>(resolve => page.once('dialog', resolve));
        const result = await page.evaluate(() => window.confirm('Are you sure?'));
        await dialogPromise;

        expect(result).toBe(true);
    });

    test('dialog.dismiss() makes next confirm return false', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const first = new Promise<Dialog>(resolve => page.once('dialog', resolve));
        await page.evaluate(() => window.confirm('first'));
        await (await first).dismiss();

        const result = await page.evaluate(() => window.confirm('second'));
        expect(result).toBe(false);
    });

    test('dialog fires for window.prompt with message and defaultValue', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const dialogPromise = new Promise<Dialog>(resolve => page.once('dialog', resolve));
        await page.evaluate(() => window.prompt('Enter name', 'default'));
        const dialog = await dialogPromise;

        expect(dialog.type()).toBe('prompt');
        expect(dialog.message()).toBe('Enter name');
        expect(dialog.defaultValue()).toBe('default');
    });

    // ── domcontentloaded / load ────────────────────────────────────────────

    test('domcontentloaded fires during page.goto', async ({ safariPage: page }) => {
        const dclPromise = new Promise<unknown>(resolve => page.once('domcontentloaded', resolve));
        await page.goto(LOCAL);
        const arg = await dclPromise;

        expect(arg).toBe(page);
    });

    test('load fires during page.goto', async ({ safariPage: page }) => {
        const loadPromise = new Promise<unknown>(resolve => page.once('load', resolve));
        await page.goto(LOCAL);
        const arg = await loadPromise;

        expect(arg).toBe(page);
    });

    // ── popup ──────────────────────────────────────────────────────────────

    test('popup fires with url and target when window.open is called', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const popupPromise = new Promise<{ url: string; target: string }>(resolve => page.once('popup', resolve));
        await page.evaluate(() => window.open('https://example.com', '_blank'));
        const info = await popupPromise;

        expect(info.url).toContain('example.com');
        expect(info.target).toBe('_blank');
    });

    // ── websocket ──────────────────────────────────────────────────────────

    test('websocket fires with url when new WebSocket is created', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const wsPromise = new Promise<WebSocketEvent>(resolve => page.once('websocket', resolve));
        await page.evaluate(() => {
            try { new WebSocket('wss://localhost:1'); } catch (_) {}
        });
        const ws = await wsPromise;

        expect(ws.url()).toContain('wss://localhost:1');
    });

    // ── filechooser ────────────────────────────────────────────────────────

    test('filechooser fires when a file input is clicked', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        await page.evaluate(() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.id = '__test_file_input';
            input.accept = 'image/*';
            document.body.appendChild(input);
        });

        const chooserPromise = new Promise<FileChooser>(resolve => page.once('filechooser', resolve));
        await page.click('#__test_file_input');
        const chooser = await chooserPromise;

        expect(chooser.isMultiple()).toBe(false);
        expect(chooser.accept()).toBe('image/*');
    });

    // ── frame events ───────────────────────────────────────────────────────

    test('frameattached fires when an iframe is added to the DOM', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const framePromise = new Promise<Frame>(resolve => page.once('frameattached', resolve));
        await page.evaluate(() => {
            const iframe = document.createElement('iframe');
            iframe.name = 'test-frame';
            iframe.src = 'about:blank';
            document.body.appendChild(iframe);
        });
        const frame = await framePromise;

        expect(frame.name()).toBe('test-frame');
    });

    test('framedetached fires when an iframe is removed from the DOM', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        await page.evaluate(() => {
            const iframe = document.createElement('iframe');
            iframe.id = '__detach_frame';
            iframe.src = 'about:blank';
            document.body.appendChild(iframe);
        });
        await page.waitForTimeout(200);

        const detachPromise = new Promise<Frame>(resolve => page.once('framedetached', resolve));
        await page.evaluate(() => {
            const el = document.getElementById('__detach_frame');
            el?.parentNode?.removeChild(el);
        });
        await detachPromise;
    });

    // ── request / response / requestfinished ───────────────────────────────

    test('request fires for a page fetch', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        await page.route('**/api/evt-req', async (route) => route.fulfill({ status: 200, body: 'ok' }));

        const requestedUrls: string[] = [];
        page.on('request', (req) => requestedUrls.push(req.url()));
        await page.waitForTimeout(200);

        await page.evaluate(() => fetch('https://api.example.com/api/evt-req'));
        await page.waitForTimeout(500);

        expect(requestedUrls.some(u => u.includes('/api/evt-req'))).toBe(true);
    });

    test('response fires after a fulfilled fetch with correct status', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        await page.route('**/api/evt-resp', async (route) =>
            route.fulfill({ status: 201, body: 'created' })
        );

        const responses: PageResponse[] = [];
        page.on('response', (r) => responses.push(r));
        await page.waitForTimeout(200);

        await page.evaluate(() => fetch('https://api.example.com/api/evt-resp'));
        await page.waitForTimeout(500);

        const match = responses.find(r => r.url().includes('/api/evt-resp'));
        expect(match).toBeTruthy();
        expect(match!.status()).toBe(201);
    });

    test('requestfinished fires for a completed fetch', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        await page.route('**/api/evt-fin', async (route) => route.fulfill({ status: 200, body: 'done' }));

        const finishedUrls: string[] = [];
        page.on('requestfinished', (req) => finishedUrls.push(req.url()));
        await page.waitForTimeout(200);

        await page.evaluate(() => fetch('https://api.example.com/api/evt-fin'));
        await page.waitForTimeout(500);

        expect(finishedUrls.some(u => u.includes('/api/evt-fin'))).toBe(true);
    });
});

test.describe('page.setViewportSize', () => {
    test.beforeEach(async ({ safariPage: page }) => {
        await page.goto(LOCAL);
    });

    test('viewportSize returns positive width and height', async ({ safariPage: page }) => {
        const size = await page.viewportSize();
        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
    });

    test('injects meta viewport tag with specified width', async ({ safariPage: page }) => {
        await page.setViewportSize({ width: 375, height: 812 });

        const content = await page.evaluate(() => {
            const meta = document.querySelector('meta[name="viewport"]');
            return meta?.getAttribute('content') ?? null;
        });

        expect(content).toContain('width=375');
    });

    test('injects constraining style tag with specified dimensions', async ({ safariPage: page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });

        const styleText = await page.evaluate(() =>
            document.getElementById('__hh_viewport__')?.textContent ?? null
        );

        expect(styleText).toContain('1920px');
        expect(styleText).toContain('1080px');
    });

    test('repeated calls update constraints without duplicating elements', async ({ safariPage: page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.setViewportSize({ width: 1280, height: 800 });

        const metaCount = await page.evaluate(() =>
            document.querySelectorAll('meta[name="viewport"]').length
        );
        const styleCount = await page.evaluate(() =>
            document.querySelectorAll('#__hh_viewport__').length
        );

        expect(metaCount).toBe(1);
        expect(styleCount).toBe(1);
    });

    test('second call overrides first width constraint', async ({ safariPage: page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.setViewportSize({ width: 1280, height: 800 });

        const content = await page.evaluate(() =>
            document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null
        );

        expect(content).toContain('width=1280');
        expect(content).not.toContain('width=375');
    });
});

test.describe('has-text', () => {
    test('has-text', async ({ safariPage: page }) => {
        await page.goto(LOGIN_URL);

        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');

        await expect(page.locator('.inventory_list')).toBeVisible({ timeout: 10000 });

        const inventoryItem = page.locator('.inventory_item');
        await inventoryItem.filter({ hasText: 'Sauce Labs Backpack' }).locator('button').click();
        await inventoryItem.filter({ hasText: 'Sauce Labs Bike Light' }).locator('button').click();
        await inventoryItem.filter({ hasText: 'Sauce Labs Bolt T-Shirt' }).locator('button').click();
        await inventoryItem.filter({ hasText: 'Sauce Labs Fleece Jacket' }).locator('button').click();
        await inventoryItem.filter({ hasText: 'Sauce Labs Onesie' }).locator('button').click();
        await inventoryItem.filter({ hasText: 'Test.allTheThings() T-Shirt (Red)' }).locator('button').click();

        await expect(page.locator('.shopping_cart_badge')).toHaveText('6');
    });
});

// ── Helper: add a named iframe and wait for its frameattached event ──────────
async function addIframe(page: import('../src').Page, name: string): Promise<void> {
    const attached = new Promise<void>(resolve => page.once('frameattached', () => resolve()));
    await page.evaluate((n: any) => {
        const f = document.createElement('iframe');
        f.name = n;
        f.src = 'about:blank';
        document.body.appendChild(f);
    }, name);
    await attached;
}

async function removeIframe(page: import('../src').Page, id: string): Promise<void> {
    const detached = new Promise<void>(resolve => page.once('framedetached', () => resolve()));
    await page.evaluate((elId: any) => {
        const el = document.getElementById(elId);
        el?.parentNode?.removeChild(el);
    }, id);
    await detached;
}

test.describe('page.mainFrame', () => {
    test('mainFrame().title() matches page.title()', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        const frameTitle = await page.mainFrame().title();
        const pageTitle  = await page.title();
        expect(frameTitle).toBe(pageTitle);
    });

    test('mainFrame().content() returns the full HTML document', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        const content = await page.mainFrame().content();
        expect(content).toMatch(/^<html/i);
        expect(content).toContain('Local Test Page');
    });

    test('mainFrame().evaluate() runs JS in the page context', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        const result = await page.mainFrame().evaluate(() => document.title);
        expect(result).toContain('Local Test Page');
    });

    test('mainFrame().locator() can query page elements', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        const text = await page.mainFrame().locator('h1').textContent();
        expect(text?.trim()).toBe('Local Test Page');
    });
});

test.describe('page.frames', () => {
    test('frames()[0] is always mainFrame()', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        expect(page.frames()[0]).toBe(page.mainFrame());
    });

    test('frames() grows by one when an iframe is attached', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        const before = page.frames().length;

        await addIframe(page, 'grow-frame');

        expect(page.frames().length).toBe(before + 1);
    });

    test('frames() shrinks by one when an iframe is removed', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const attached = new Promise<void>(resolve => page.once('frameattached', () => resolve()));
        await page.evaluate(() => {
            const f = document.createElement('iframe');
            f.id   = '__shrink_frame';
            f.name = 'shrink-frame';
            (f as HTMLIFrameElement).src = 'about:blank';
            document.body.appendChild(f);
        });
        await attached;

        const count = page.frames().length;
        await removeIframe(page, '__shrink_frame');

        expect(page.frames().length).toBe(count - 1);
    });

    test('both frames appear in frames() when two iframes are added', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        await addIframe(page, 'alpha-frame');
        await addIframe(page, 'beta-frame');

        const names = page.frames().map(f => f.name());
        expect(names).toContain('alpha-frame');
        expect(names).toContain('beta-frame');
    });
});

test.describe('page.frame', () => {
    test('frame({ name }) finds a named iframe', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await addIframe(page, 'lookup-frame');

        const found = page.frame({ name: 'lookup-frame' });
        expect(found).not.toBeNull();
        expect(found!.name()).toBe('lookup-frame');
    });

    test('frame({ name }) returns null for an unknown name', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        expect(page.frame({ name: 'no-such-frame' })).toBeNull();
    });

    test('frame({ url }) finds a frame by URL pattern', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const attached = new Promise<void>(resolve => page.once('frameattached', () => resolve()));
        await page.evaluate(() => {
            const f = document.createElement('iframe');
            (f as HTMLIFrameElement).src = 'about:blank';
            document.body.appendChild(f);
        });
        await attached;

        const found = page.frame({ url: /about:blank/ });
        expect(found).not.toBeNull();
    });

    test('frame({ name }) returns null after the iframe is detached', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const attached = new Promise<void>(resolve => page.once('frameattached', () => resolve()));
        await page.evaluate(() => {
            const f = document.createElement('iframe');
            f.id   = '__remove_frame';
            f.name = 'remove-frame';
            (f as HTMLIFrameElement).src = 'about:blank';
            document.body.appendChild(f);
        });
        await attached;

        expect(page.frame({ name: 'remove-frame' })).not.toBeNull();

        await removeIframe(page, '__remove_frame');

        expect(page.frame({ name: 'remove-frame' })).toBeNull();
    });
});

// ── Helper: inject an iframe with given id and HTML content ──────────────────
async function injectIframeWithContent(
    page: import('../src').Page,
    id: string,
    html: string,
): Promise<void> {
    const attached = new Promise<void>(resolve => page.once('frameattached', () => resolve()));
    await page.evaluate((args: any) => {
        const f = document.createElement('iframe');
        f.id = args.id;
        document.body.appendChild(f);
        f.contentDocument!.open();
        f.contentDocument!.write(args.html);
        f.contentDocument!.close();
    }, { id, html });
    await attached;
}

test.describe('page.frameLocator', () => {
    test('frameLocator().locator() finds an element inside the iframe', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await injectIframeWithContent(page, 'fl-basic', '<button id="btn">Click me</button>');

        const btn = page.frameLocator('#fl-basic').locator('#btn');
        await expect(btn).toBeVisible();
    });

    test('frameLocator().locator().textContent() reads iframe text', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await injectIframeWithContent(page, 'fl-text', '<span id="msg">Hello iframe</span>');

        const text = await page.frameLocator('#fl-text').locator('#msg').textContent();
        expect(text).toBe('Hello iframe');
    });

    test('frameLocator().locator().getAttribute() reads iframe attribute', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await injectIframeWithContent(page, 'fl-attr', '<input id="inp" placeholder="type here">');

        const attr = await page.frameLocator('#fl-attr').locator('#inp').getAttribute('placeholder');
        expect(attr).toBe('type here');
    });

    test('frameLocator().locator().isVisible() is true for visible iframe element', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await injectIframeWithContent(page, 'fl-vis', '<p id="p">Visible</p>');

        const visible = await page.frameLocator('#fl-vis').locator('#p').isVisible();
        expect(visible).toBe(true);
    });

    test('frameLocator().locator().isVisible() is false for hidden iframe element', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await injectIframeWithContent(page, 'fl-hidden', '<p id="p" style="display:none">Hidden</p>');

        const visible = await page.frameLocator('#fl-hidden').locator('#p').isVisible();
        expect(visible).toBe(false);
    });

    test('frameLocator().locator().click() fires click inside the iframe', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await injectIframeWithContent(
            page, 'fl-click',
            '<button id="btn" onclick="document.getElementById(\'out\').textContent=\'clicked\'">Go</button><span id="out"></span>',
        );

        await page.frameLocator('#fl-click').locator('#btn').click();
        const out = await page.frameLocator('#fl-click').locator('#out').textContent();
        expect(out).toBe('clicked');
    });

    test('frameLocator().locator().fill() fills an input inside the iframe', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await injectIframeWithContent(page, 'fl-fill', '<input id="inp" type="text">');

        await page.frameLocator('#fl-fill').locator('#inp').fill('hello');
        await expect(page.frameLocator('#fl-fill').locator('#inp')).toHaveValue('hello');
    });

    test('frameLocator().getByText() finds element by text inside iframe', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await injectIframeWithContent(page, 'fl-bytext', '<p>Find me</p>');

        await expect(page.frameLocator('#fl-bytext').getByText('Find me')).toBeVisible();
    });

    test('frameLocator().locator().count() counts elements inside iframe', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await injectIframeWithContent(page, 'fl-count', '<li>a</li><li>b</li><li>c</li>');

        const count = await page.frameLocator('#fl-count').locator('li').count();
        expect(count).toBe(3);
    });

    test('frameLocator().nth() selects the correct iframe when multiple exist', async ({ safariPage: page }) => {
        await page.goto(LOCAL);

        const p1 = new Promise<void>(resolve => page.once('frameattached', () => resolve()));
        await page.evaluate(() => {
            const f = document.createElement('iframe');
            f.className = 'fl-multi';
            document.body.appendChild(f);
            f.contentDocument!.open();
            f.contentDocument!.write('<span id="label">first</span>');
            f.contentDocument!.close();
        });
        await p1;

        const p2 = new Promise<void>(resolve => page.once('frameattached', () => resolve()));
        await page.evaluate(() => {
            const f = document.createElement('iframe');
            f.className = 'fl-multi';
            document.body.appendChild(f);
            f.contentDocument!.open();
            f.contentDocument!.write('<span id="label">second</span>');
            f.contentDocument!.close();
        });
        await p2;

        const first  = await page.frameLocator('.fl-multi').first().locator('#label').textContent();
        const second = await page.frameLocator('.fl-multi').nth(1).locator('#label').textContent();
        expect(first).toBe('first');
        expect(second).toBe('second');
    });

    test('locator().frameLocator() scopes into a nested iframe via a parent locator', async ({ safariPage: page }) => {
        await page.goto(LOCAL);
        await injectIframeWithContent(page, 'fl-scoped', '<em id="em">scoped</em>');

        const text = await page.locator('body').frameLocator('#fl-scoped').locator('#em').textContent();
        expect(text).toBe('scoped');
    });
});
