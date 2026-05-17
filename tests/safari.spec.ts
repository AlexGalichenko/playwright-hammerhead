import { test, expect } from './fixtures';
import type { Route, ConsoleMessage, Dialog, Frame, FileChooser, WebSocketEvent, PageResponse } from '../src';

test.describe('Saucedemo checkout flow', () => {
    test('completes full checkout as standard_user', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

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

test.describe('Saucedemo login', () => {
    test('locked_out_user sees error message', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.fill('#user-name', 'locked_out_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');

        await expect(page.locator('[data-test="error"]')).toBeVisible();
        await expect(page.locator('[data-test="error"]')).toContainText('locked out');
    });

    test('empty credentials show required-field error', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.click('#login-button');

        await expect(page.locator('[data-test="error"]')).toBeVisible();
    });

    test('wrong password shows error', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'wrong_password');
        await page.click('#login-button');

        await expect(page.locator('[data-test="error"]')).toBeVisible();
    });
});

test.describe('Saucedemo inventory', () => {
    test.beforeEach(async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
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

    test('navigates to product detail and back', async ({ safariPage: page }) => {
        await page.click('.inventory_item_name');

        await expect(page.locator('.inventory_details_name')).toBeVisible();

        await page.click('[data-test="back-to-products"]');

        await expect(page.locator('.inventory_list')).toBeVisible();
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
        await page.goto('https://www.saucedemo.com/');
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

test.describe('Safari via hammerhead proxy', () => {
    test('page has correct title', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const title = await page.title();
        expect(title).toContain('Swag Labs');
    });

    test('can read heading text content', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const heading = await page.locator('h1').textContent();
        expect(heading?.trim()).toBe('Swag Labs');
    });

    test('can evaluate JS in the page context', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const linkCount = await page.evaluate(
            () => document.querySelectorAll('a').length
        );
        expect(linkCount).toBeGreaterThan(0);
    });

    test('locator isVisible reflects element presence', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await expect(page.locator('h1')).toBeVisible();
        await expect(page.locator('#does-not-exist')).toBeHidden();
    });

    test('can read href attribute via locator', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const href = await page.locator('a').getAttribute('href');
        expect(href).toBeTruthy();
    });
});

test.describe('Google calc', () => {
    test('page has correct title', async ({ safariPage: page }) => {
        await page.goto('https://www.google.com/search?q=google+calculator');
        const title = await page.title();
        expect(title).toContain('Google Search');
    });
});

test.describe('page.addInitScript', () => {
    test('string script sets window variable before page code runs', async ({ safariPage: page }) => {
        await page.addInitScript('window.__initFlag = true;');
        await page.goto('https://www.saucedemo.com/');

        const flag = await page.evaluate(() => (window as any).__initFlag);
        expect(flag).toBe(true);
    });

    test('function script with serialised arg sets window variable', async ({ safariPage: page }) => {
        await page.addInitScript((val: unknown) => { (window as any).__initArg = val; }, 42);
        await page.goto('https://www.saucedemo.com/');

        const val = await page.evaluate(() => (window as any).__initArg);
        expect(val).toBe(42);
    });

    test('multiple init scripts all run', async ({ safariPage: page }) => {
        await page.addInitScript('window.__a = 1;');
        await page.addInitScript('window.__b = 2;');
        await page.goto('https://www.saucedemo.com/');

        const [a, b] = await page.evaluate(() => [(window as any).__a, (window as any).__b]);
        expect(a).toBe(1);
        expect(b).toBe(2);
    });

    test('init script re-runs on subsequent navigation', async ({ safariPage: page }) => {
        await page.addInitScript('window.__nav = (window.__nav || 0) + 1;');
        await page.goto('https://www.saucedemo.com/');
        const first = await page.evaluate(() => (window as any).__nav);

        await page.goto('https://www.saucedemo.com/');
        const second = await page.evaluate(() => (window as any).__nav);

        expect(first).toBe(1);
        expect(second).toBe(1);
    });
});

test.describe('page.addLocatorHandler', () => {
    test('handler is called when locator becomes visible', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
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
        await page.goto('https://www.saucedemo.com/');
        let handlerCalled = false;

        await page.addLocatorHandler(page.locator('#__never_exists'), async () => {
            handlerCalled = true;
        });

        await page.waitForTimeout(600);
        expect(handlerCalled).toBe(false);
    });

    test('handler is not called again while already running', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
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
        await page.goto('https://www.saucedemo.com/');
        await page.addScriptTag({ content: 'window.__scriptTag = 123;' });

        const val = await page.evaluate(() => (window as any).__scriptTag);
        expect(val).toBe(123);
    });

    test('type attribute is set on injected script element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.addScriptTag({ content: 'window.__typedScript = true;', type: 'text/javascript' });

        const val = await page.evaluate(() => (window as any).__typedScript);
        expect(val).toBe(true);
    });

    test('multiple script tags can be injected independently', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.addScriptTag({ content: 'window.__s1 = "first";' });
        await page.addScriptTag({ content: 'window.__s2 = "second";' });

        const [s1, s2] = await page.evaluate(() => [(window as any).__s1, (window as any).__s2]);
        expect(s1).toBe('first');
        expect(s2).toBe('second');
    });
});

test.describe('page.addStyleTag', () => {
    test('inline content style is applied to the page', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.addStyleTag({ content: '#login-button { opacity: 0.5; }' });

        const opacity = await page.evaluate(() => {
            const el = document.querySelector('#login-button');
            return el ? window.getComputedStyle(el).opacity : null;
        });
        expect(opacity).toBe('0.5');
    });

    test('multiple style tags can be injected and both apply', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
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
        await page.goto('https://www.saucedemo.com/');
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
        await page.goto('https://www.saucedemo.com/');

        let fired = false;
        page.once('close', () => { fired = true; });
        await page.close();

        expect(fired).toBe(true);
    });

    // ── console ────────────────────────────────────────────────────────────

    test('console fires with correct type and text for console.log', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        const msgPromise = new Promise<ConsoleMessage>(resolve => page.once('console', resolve));
        await page.evaluate(() => console.log('hello events'));
        const msg = await msgPromise;

        expect(msg.type()).toBe('log');
        expect(msg.text()).toBe('hello events');
    });

    test('console captures console.error with error type', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        const msgPromise = new Promise<ConsoleMessage>(resolve => page.once('console', resolve));
        await page.evaluate(() => console.error('something broke'));
        const msg = await msgPromise;

        expect(msg.type()).toBe('error');
        expect(msg.text()).toContain('something broke');
    });

    // ── pageerror ──────────────────────────────────────────────────────────

    test('pageerror fires for uncaught window error events', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        const errPromise = new Promise<Error>(resolve => page.once('pageerror', resolve));
        await page.evaluate(() =>
            window.dispatchEvent(new ErrorEvent('error', { message: 'intentional test error' }))
        );
        const err = await errPromise;

        expect(err.message).toBe('intentional test error');
    });

    // ── dialog ─────────────────────────────────────────────────────────────

    test('dialog fires for window.alert with correct type and message', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        const dialogPromise = new Promise<Dialog>(resolve => page.once('dialog', resolve));
        await page.evaluate(() => window.alert('hello dialog'));
        const dialog = await dialogPromise;

        expect(dialog.type()).toBe('alert');
        expect(dialog.message()).toBe('hello dialog');
    });

    test('dialog fires for window.confirm and returns true by default', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        const dialogPromise = new Promise<Dialog>(resolve => page.once('dialog', resolve));
        const result = await page.evaluate(() => window.confirm('Are you sure?'));
        await dialogPromise;

        expect(result).toBe(true);
    });

    test('dialog.dismiss() makes next confirm return false', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        const first = new Promise<Dialog>(resolve => page.once('dialog', resolve));
        await page.evaluate(() => window.confirm('first'));
        await (await first).dismiss();

        const result = await page.evaluate(() => window.confirm('second'));
        expect(result).toBe(false);
    });

    test('dialog fires for window.prompt with message and defaultValue', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

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
        await page.goto('https://www.saucedemo.com/');
        const arg = await dclPromise;

        expect(arg).toBe(page);
    });

    test('load fires during page.goto', async ({ safariPage: page }) => {
        const loadPromise = new Promise<unknown>(resolve => page.once('load', resolve));
        await page.goto('https://www.saucedemo.com/');
        const arg = await loadPromise;

        expect(arg).toBe(page);
    });

    // ── popup ──────────────────────────────────────────────────────────────

    test('popup fires with url and target when window.open is called', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        const popupPromise = new Promise<{ url: string; target: string }>(resolve => page.once('popup', resolve));
        await page.evaluate(() => window.open('https://example.com', '_blank'));
        const info = await popupPromise;

        expect(info.url).toContain('example.com');
        expect(info.target).toBe('_blank');
    });

    // ── websocket ──────────────────────────────────────────────────────────

    test('websocket fires with url when new WebSocket is created', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

        const wsPromise = new Promise<WebSocketEvent>(resolve => page.once('websocket', resolve));
        await page.evaluate(() => {
            try { new WebSocket('wss://localhost:1'); } catch (_) {}
        });
        const ws = await wsPromise;

        expect(ws.url()).toContain('wss://localhost:1');
    });

    // ── filechooser ────────────────────────────────────────────────────────

    test('filechooser fires when a file input is clicked', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

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
        await page.goto('https://www.saucedemo.com/');

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
        await page.goto('https://www.saucedemo.com/');

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
        await page.goto('https://www.saucedemo.com/');

        await page.route('**/api/evt-req', async (route) => route.fulfill({ status: 200, body: 'ok' }));

        const requestedUrls: string[] = [];
        page.on('request', (req) => requestedUrls.push(req.url()));
        await page.waitForTimeout(200);

        await page.evaluate(() => fetch('https://api.example.com/api/evt-req'));
        await page.waitForTimeout(500);

        expect(requestedUrls.some(u => u.includes('/api/evt-req'))).toBe(true);
    });

    test('response fires after a fulfilled fetch with correct status', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');

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
        await page.goto('https://www.saucedemo.com/');

        await page.route('**/api/evt-fin', async (route) => route.fulfill({ status: 200, body: 'done' }));

        const finishedUrls: string[] = [];
        page.on('requestfinished', (req) => finishedUrls.push(req.url()));
        await page.waitForTimeout(200);

        await page.evaluate(() => fetch('https://api.example.com/api/evt-fin'));
        await page.waitForTimeout(500);

        expect(finishedUrls.some(u => u.includes('/api/evt-fin'))).toBe(true);
    });
});
