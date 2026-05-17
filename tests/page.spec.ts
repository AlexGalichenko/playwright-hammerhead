/// <reference types="node" />
import { test, expect } from './fixtures';
import type { Request, PageResponse } from '../src';

// ── page.url ──────────────────────────────────────────────────────────────────

test.describe('page.url', () => {
    test('returns a URL containing the navigated hostname', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        expect(await page.url()).toContain('saucedemo.com');
    });

    test('reflects updated URL after SPA navigation', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');
        await expect(page.locator('.inventory_list')).toBeVisible({ timeout: 10000 });

        const url = await page.url();
        expect(url).toContain('saucedemo.com');
    });
});

// ── page.title ────────────────────────────────────────────────────────────────

test.describe('page.title', () => {
    test('returns the page document title', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        expect(await page.title()).toBe('Swag Labs');
    });
});

// ── page.content ──────────────────────────────────────────────────────────────

test.describe('page.content', () => {
    test('returns the full HTML starting with <html', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const html = await page.content();
        expect(html).toMatch(/^<html/i);
    });

    test('returned HTML contains page text', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        expect(await page.content()).toContain('Swag Labs');
    });
});

// ── page.setContent ───────────────────────────────────────────────────────────

test.describe('page.setContent', () => {
    test('replaces the page with provided HTML', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><h1 id="hdr">Hello</h1></body></html>');
        expect(await page.textContent('#hdr')).toBe('Hello');
    });

    test('content() reflects the new HTML after setContent', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><p id="p">world</p></body></html>');
        expect(await page.content()).toContain('world');
    });
});

// ── page.reload ───────────────────────────────────────────────────────────────

test.describe('page.reload', () => {
    test('clears window-side effects set by evaluate', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.evaluate(() => { (window as any).__reloadTest = true; });
        expect(await page.evaluate(() => (window as any).__reloadTest)).toBe(true);

        await page.reload();
        expect(await page.evaluate(() => (window as any).__reloadTest)).toBeUndefined();
    });

    test('page title is unchanged after reload', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.reload();
        expect(await page.title()).toBe('Swag Labs');
    });
});

// ── page.goBack / page.goForward ──────────────────────────────────────────────

test.describe('page.goBack / page.goForward', () => {
    test('goBack returns to the page loaded by the previous goto', async ({ safariBrowser }) => {
        const page = await safariBrowser.newPage();
        await page.goto('https://www.saucedemo.com/');
        await page.goto('https://example.com/');
        await page.goBack();
        expect(await page.title()).toBe('Swag Labs');
        expect(await page.url()).toContain('saucedemo.com');
        await page.close();
    });

    test('goForward after goBack restores the forward page', async ({ safariBrowser }) => {
        const page = await safariBrowser.newPage();
        await page.goto('https://www.saucedemo.com/');
        await page.goto('https://example.com/');

        await page.goBack();
        await page.goForward();
        expect(await page.title()).toBe('Example Domain');
        await page.close();
    });
});

// ── page.ariaSnapshot ─────────────────────────────────────────────────────────

test.describe('page.ariaSnapshot', () => {
    test('returns a non-empty string', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const snap = await page.ariaSnapshot();
        expect(typeof snap).toBe('string');
        expect(snap.length).toBeGreaterThan(0);
    });

    test('snapshot contains visible text from the page', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const snap = await page.ariaSnapshot();
        expect(snap).toContain('Swag Lab');
    });
});

// ── page.getBy* ───────────────────────────────────────────────────────────────

test.describe('page.getByText', () => {
    test('finds element containing the given text', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await expect(page.getByText('Swag Labs')).toBeVisible();
    });
});

test.describe('page.getByPlaceholder', () => {
    test('finds input by placeholder', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await expect(page.getByPlaceholder('Username')).toBeVisible();
    });

    test('located input can be filled', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.getByPlaceholder('Username').fill('standard_user');
        expect(await page.getByPlaceholder('Username').inputValue()).toBe('standard_user');
    });
});

test.describe('page.getByRole', () => {
    test('finds element with explicit role attribute', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><button role="dialog" id="d">Open</button></body></html>');
        await expect(page.getByRole('dialog')).toBeVisible();
    });

    test('name option narrows to matching element text', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(`
            <html><body>
                <div role="tab">Alpha</div>
                <div role="tab">Beta</div>
            </body></html>
        `);
        const tab = page.getByRole('tab', { name: 'Beta' });
        expect(await tab.textContent()).toBe('Beta');
    });
});

test.describe('page.getByLabel', () => {
    test('finds input by aria-label', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><input aria-label="Search" id="s"></body></html>');
        await expect(page.getByLabel('Search')).toBeVisible();
    });

    test('finds input following a label element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><label>Email</label><input type="email" id="e"></body></html>');
        await expect(page.getByLabel('Email')).toBeVisible();
    });
});

test.describe('page.getByTestId', () => {
    test('finds element with data-testid attribute', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><button data-testid="submit-btn">Submit</button></body></html>');
        await expect(page.getByTestId('submit-btn')).toBeVisible();
    });
});

test.describe('page.getByAltText', () => {
    test('finds image by alt text', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><img alt="Company Logo" id="logo" src="data:,x"></body></html>');
        await expect(page.getByAltText('Company Logo')).toBeVisible();
    });
});

test.describe('page.getByTitle', () => {
    test('finds element with matching title attribute', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><abbr title="HyperText Markup Language">HTML</abbr></body></html>');
        await expect(page.getByTitle('HyperText Markup Language')).toBeVisible();
    });
});

// ── page.dblclick ─────────────────────────────────────────────────────────────

test.describe('page.dblclick', () => {
    test('fires dblclick event on the element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><div id="d">target</div></body></html>');
        await page.evaluate(() => {
            (window as any).__dblclicks = 0;
            document.getElementById('d')!.addEventListener('dblclick', () => { (window as any).__dblclicks++; });
        });

        await page.dblclick('#d');
        expect(await page.evaluate(() => (window as any).__dblclicks)).toBe(1);
    });
});

// ── page.type ─────────────────────────────────────────────────────────────────

test.describe('page.type', () => {
    test('appends characters to the input one-by-one', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><input id="inp" type="text"></body></html>');

        await page.type('#inp', 'hello');
        expect(await page.inputValue('#inp')).toBe('hello');
    });

    test('appends to existing value', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><input id="inp" type="text" value="abc"></body></html>');

        await page.type('#inp', 'XY');
        expect(await page.inputValue('#inp')).toBe('abcXY');
    });
});

// ── page.press ────────────────────────────────────────────────────────────────

test.describe('page.press', () => {
    test('dispatches keydown event with the correct key', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><input id="inp" type="text"></body></html>');
        await page.evaluate(() => {
            (window as any).__lastKey = '';
            document.getElementById('inp')!.addEventListener('keydown', (e) => { (window as any).__lastKey = e.key; });
        });

        await page.press('#inp', 'Enter');
        expect(await page.evaluate(() => (window as any).__lastKey)).toBe('Enter');
    });
});

// ── page.tap ──────────────────────────────────────────────────────────────────

test.describe('page.tap', () => {
    test('dispatches touch events on the element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><button id="btn">Tap me</button></body></html>');
        await page.evaluate(() => {
            (window as any).__tapped = false;
            document.getElementById('btn')!.addEventListener('touchstart', () => { (window as any).__tapped = true; });
        });

        await page.tap('#btn');
        expect(await page.evaluate(() => (window as any).__tapped)).toBe(true);
    });
});

// ── page.hover ────────────────────────────────────────────────────────────────

test.describe('page.hover', () => {
    test('dispatches mouseover on the element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><div id="d" style="width:100px;height:100px">hover me</div></body></html>');
        await page.evaluate(() => {
            (window as any).__hovered = false;
            document.getElementById('d')!.addEventListener('mouseover', () => { (window as any).__hovered = true; });
        });

        await page.hover('#d');
        expect(await page.evaluate(() => (window as any).__hovered)).toBe(true);
    });
});

// ── page.focus ────────────────────────────────────────────────────────────────

test.describe('page.focus', () => {
    test('makes the element the document.activeElement', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><input id="inp" type="text"></body></html>');

        await page.focus('#inp');
        const activeId = await page.evaluate(() => document.activeElement?.id);
        expect(activeId).toBe('inp');
    });
});

// ── page.check / uncheck / setChecked / isChecked ─────────────────────────────

test.describe('page.check / page.uncheck / page.setChecked / page.isChecked', () => {
    test.beforeEach(async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><input id="cb" type="checkbox"></body></html>');
    });

    test('check() makes the checkbox checked', async ({ safariPage: page }) => {
        await page.check('#cb');
        expect(await page.isChecked('#cb')).toBe(true);
    });

    test('uncheck() removes the checked state', async ({ safariPage: page }) => {
        await page.check('#cb');
        await page.uncheck('#cb');
        expect(await page.isChecked('#cb')).toBe(false);
    });

    test('setChecked(true) checks an unchecked box', async ({ safariPage: page }) => {
        await page.setChecked('#cb', true);
        expect(await page.isChecked('#cb')).toBe(true);
    });

    test('setChecked(false) unchecks a checked box', async ({ safariPage: page }) => {
        await page.check('#cb');
        await page.setChecked('#cb', false);
        expect(await page.isChecked('#cb')).toBe(false);
    });

    test('isChecked() returns false for initially unchecked box', async ({ safariPage: page }) => {
        expect(await page.isChecked('#cb')).toBe(false);
    });
});

// ── page.getAttribute ─────────────────────────────────────────────────────────

test.describe('page.getAttribute', () => {
    test('returns the value of the named attribute', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        expect(await page.getAttribute('#user-name', 'placeholder')).toBe('Username');
    });

    test('returns null for an attribute that does not exist', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        expect(await page.getAttribute('#user-name', 'nonexistent')).toBeNull();
    });
});

// ── page.textContent ──────────────────────────────────────────────────────────

test.describe('page.textContent', () => {
    test('returns the text content of the matched element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><p id="p">Hello World</p></body></html>');
        expect(await page.textContent('#p')).toBe('Hello World');
    });
});

// ── page.innerHTML ────────────────────────────────────────────────────────────

test.describe('page.innerHTML', () => {
    test('returns the innerHTML of the matched element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><div id="d"><span>inner</span></div></body></html>');
        expect(await page.innerHTML('#d')).toBe('<span>inner</span>');
    });
});

// ── page.innerText ────────────────────────────────────────────────────────────

test.describe('page.innerText', () => {
    test('returns the rendered inner text of the element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><p id="p">  trimmed  </p></body></html>');
        const text = await page.innerText('#p');
        expect(text.trim()).toBe('trimmed');
    });
});

// ── page.inputValue ───────────────────────────────────────────────────────────

test.describe('page.inputValue', () => {
    test('returns the current value of an input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.fill('#user-name', 'test_user');
        expect(await page.inputValue('#user-name')).toBe('test_user');
    });
});

// ── page.isVisible / page.isHidden ────────────────────────────────────────────

test.describe('page.isVisible / page.isHidden', () => {
    test('isVisible() is true for a rendered element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        expect(await page.isVisible('#user-name')).toBe(true);
    });

    test('isVisible() is false for a hidden element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><div id="d" style="display:none">hidden</div></body></html>');
        expect(await page.isVisible('#d')).toBe(false);
    });

    test('isHidden() is true for a display:none element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><div id="d" style="display:none">hidden</div></body></html>');
        expect(await page.isHidden('#d')).toBe(true);
    });

    test('isHidden() is false for a visible element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        expect(await page.isHidden('#user-name')).toBe(false);
    });
});

// ── page.isEnabled / page.isDisabled ─────────────────────────────────────────

test.describe('page.isEnabled / page.isDisabled', () => {
    test('isEnabled() is true for a normal input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        expect(await page.isEnabled('#user-name')).toBe(true);
    });

    test('isDisabled() is true for a disabled input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><input id="d" type="text" disabled></body></html>');
        expect(await page.isDisabled('#d')).toBe(true);
    });

    test('isEnabled() is false for a disabled input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><input id="d" type="text" disabled></body></html>');
        expect(await page.isEnabled('#d')).toBe(false);
    });
});

// ── page.isEditable ───────────────────────────────────────────────────────────

test.describe('page.isEditable', () => {
    test('is true for a normal text input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        expect(await page.isEditable('#user-name')).toBe(true);
    });

    test('is false for a disabled input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><input id="d" type="text" disabled></body></html>');
        expect(await page.isEditable('#d')).toBe(false);
    });

    test('is false for a readonly input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><input id="r" type="text" readonly></body></html>');
        expect(await page.isEditable('#r')).toBe(false);
    });
});

// ── page.isClosed ─────────────────────────────────────────────────────────────

test.describe('page.isClosed', () => {
    test('is false while the page is open', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        expect(page.isClosed()).toBe(false);
    });

    test('is true after page.close()', async ({ safariBrowser }) => {
        const page = await safariBrowser.newPage();
        await page.goto('https://www.saucedemo.com/');
        expect(page.isClosed()).toBe(false);

        await page.close();
        expect(page.isClosed()).toBe(true);
    });
});

// ── page.waitForSelector ──────────────────────────────────────────────────────

test.describe('page.waitForSelector', () => {
    test('resolves when the selector becomes available', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const loc = await page.waitForSelector('#user-name');
        expect(loc).toBeTruthy();
    });

    test('returned locator is usable for further actions', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const loc = await page.waitForSelector('#login-button');
        expect(await loc.isVisible()).toBe(true);
    });
});

// ── page.waitForURL ───────────────────────────────────────────────────────────

test.describe('page.waitForURL', () => {
    test('resolves when URL matches a string fragment', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');
        await page.waitForURL('inventory');
    });

    test('resolves when URL matches a regex', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.fill('#user-name', 'standard_user');
        await page.fill('#password', 'secret_sauce');
        await page.click('#login-button');
        await page.waitForURL(/inventory/);
    });
});

// ── page.waitForFunction ──────────────────────────────────────────────────────

test.describe('page.waitForFunction', () => {
    test('resolves when the function returns truthy', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const result = await page.waitForFunction(() => document.title === 'Swag Labs');
        expect(result).toBeTruthy();
    });

    test('resolves for a string expression', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.evaluate(() => { setTimeout(() => { (window as any).__ready = true; }, 100); });
        const result = await page.waitForFunction('window.__ready');
        expect(result).toBe(true);
    });
});

// ── page.waitForRequest ───────────────────────────────────────────────────────

test.describe('page.waitForRequest', () => {
    test('resolves with the matched request by URL substring', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.route('**/api/wfr', async (route) => route.fulfill({ status: 200, body: 'ok' }));

        const reqPromise = page.waitForRequest('/api/wfr');
        await page.evaluate(() => fetch('https://api.example.com/api/wfr'));
        const req = await reqPromise;

        expect(req.url()).toContain('/api/wfr');
    });

    test('resolves with the matched request by regex', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.route('**/api/wfr-re', async (route) => route.fulfill({ status: 200, body: 'ok' }));

        const reqPromise = page.waitForRequest(/\/api\/wfr-re/);
        await page.evaluate(() => fetch('https://api.example.com/api/wfr-re'));
        const req = await reqPromise;

        expect(req.url()).toContain('/api/wfr-re');
    });
});

// ── page.waitForResponse ──────────────────────────────────────────────────────

test.describe('page.waitForResponse', () => {
    test('resolves with the matched response by URL substring', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.route('**/api/wfresp', async (route) => route.fulfill({ status: 202, body: 'accepted' }));

        const respPromise = page.waitForResponse('/api/wfresp');
        await page.evaluate(() => fetch('https://api.example.com/api/wfresp'));
        const resp = await respPromise;

        expect(resp.url()).toContain('/api/wfresp');
        expect(resp.status()).toBe(202);
    });
});

// ── page.evaluateHandle ───────────────────────────────────────────────────────

test.describe('page.evaluateHandle', () => {
    test('evaluates the expression and returns the result', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const result = await page.evaluateHandle(() => document.title);
        expect(result).toBe('Swag Labs');
    });

    test('accepts arguments just like evaluate', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const result = await page.evaluateHandle((x: unknown) => (x as number) * 2, 21);
        expect(result).toBe(42);
    });
});

// ── page.dispatchEvent ────────────────────────────────────────────────────────

test.describe('page.dispatchEvent', () => {
    test('fires a custom event on the target element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><div id="d">target</div></body></html>');
        await page.evaluate(() => {
            (window as any).__customFired = false;
            document.getElementById('d')!.addEventListener('my-event', () => { (window as any).__customFired = true; });
        });

        await page.dispatchEvent('#d', 'my-event');
        expect(await page.evaluate(() => (window as any).__customFired)).toBe(true);
    });

    test('passes eventInit data to the custom event', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><div id="d">target</div></body></html>');
        await page.evaluate(() => {
            (window as any).__detail = null;
            document.getElementById('d')!.addEventListener('data-event', (e) => { (window as any).__detail = (e as CustomEvent).detail; });
        });

        await page.dispatchEvent('#d', 'data-event', { detail: 42 });
        expect(await page.evaluate(() => (window as any).__detail)).toBe(42);
    });
});

// ── page.dragAndDrop ──────────────────────────────────────────────────────────

test.describe('page.dragAndDrop', () => {
    test('fires drag events on source and drop events on target', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(`
            <html><body>
                <div id="src" draggable="true" style="width:50px;height:50px">drag</div>
                <div id="tgt" style="width:50px;height:50px">drop</div>
            </body></html>
        `);
        await page.evaluate(() => {
            (window as any).__dropped = false;
            document.getElementById('tgt')!.addEventListener('drop', () => { (window as any).__dropped = true; });
            document.getElementById('tgt')!.addEventListener('dragover', (e) => e.preventDefault());
        });

        await page.dragAndDrop('#src', '#tgt');
        expect(await page.evaluate(() => (window as any).__dropped)).toBe(true);
    });
});

// ── page.exposeFunction ───────────────────────────────────────────────────────

test.describe('page.exposeFunction', () => {
    test('exposed function is callable from page context and returns value', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.exposeFunction('nodeAdd', (a: unknown, b: unknown) => (a as number) + (b as number));
        await page.reload();

        const result = await page.evaluate(() => (window as any).nodeAdd(3, 4));
        expect(result).toBe(7);
    });
});

// ── page.setExtraHTTPHeaders ──────────────────────────────────────────────────

test.describe('page.setExtraHTTPHeaders', () => {
    test('headers are attached to subsequent fetch requests', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        let receivedHeaders: Record<string, string> = {};

        await page.route('**/api/headers', async (route, request) => {
            receivedHeaders = request.headers();
            await route.fulfill({ status: 200, body: 'ok' });
        }, { debug: true });

        await page.setExtraHTTPHeaders({ 'x-test-header': 'hello' });
        await page.evaluate(() => fetch('https://api.example.com/api/headers'));
        await page.waitForTimeout(500);

        expect(receivedHeaders['x-test-header']).toBe('hello');
    });
});

// ── page.unrouteAll ───────────────────────────────────────────────────────────

test.describe('page.unrouteAll', () => {
    test('removes all registered routes', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        let hit = false;

        await page.route('**/api/all', async (route) => { hit = true; await route.fulfill({ status: 200 }); });
        await page.unrouteAll();

        await page.evaluate(() => fetch('https://api.example.com/api/all').catch(() => null));
        await page.waitForTimeout(500);

        expect(hit).toBe(false);
    });
});

// ── page.removeLocatorHandler ─────────────────────────────────────────────────

test.describe('page.removeLocatorHandler', () => {
    test('handler no longer fires after removal', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        let callCount = 0;

        const loc = page.locator('#__remove_handler_target');
        await page.addLocatorHandler(loc, async () => { callCount++; });

        await page.evaluate(() => {
            const d = document.createElement('div');
            d.id = '__remove_handler_target';
            d.style.cssText = 'width:50px;height:50px;position:fixed;top:0;left:0';
            document.body.appendChild(d);
        });
        await page.waitForTimeout(700);
        expect(callCount).toBeGreaterThan(0);

        const countAtRemoval = callCount;
        await page.removeLocatorHandler(loc);

        await page.waitForTimeout(700);
        expect(callCount).toBe(countAtRemoval);
    });
});

// ── page.screenshot ───────────────────────────────────────────────────────────

test.describe('page.screenshot', () => {
    test('returns a non-empty Buffer', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const buf = await page.screenshot();
        expect(buf).toBeInstanceOf(Buffer);
        expect(buf.length).toBeGreaterThan(0);
    });

    test('jpeg type returns a smaller buffer than png', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        const png = await page.screenshot({ type: 'png' });
        const jpeg = await page.screenshot({ type: 'jpeg', quality: 0.5 });
        expect(jpeg.length).toBeLessThan(png.length);
    });
});

// ── page.scrollTo ─────────────────────────────────────────────────────────────

test.describe('page.scrollTo', () => {
    test('scrolls the page to the given y position', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(`
            <html><body style="height:3000px">
                <div id="top">top</div>
            </body></html>
        `);

        await page.scrollTo(0, 500);
        const scrollY = await page.evaluate(() => window.scrollY);
        expect(scrollY).toBeGreaterThan(0);
    });
});

// ── page.setInputFiles ────────────────────────────────────────────────────────

test.describe('page.setInputFiles', () => {
    test('sets files on a file input via FilePayload', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent('<html><body><input id="f" type="file"></body></html>');

        await page.setInputFiles('#f', {
            name: 'hello.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('hello'),
        });

        const fileName = await page.evaluate(() => {
            const el = document.getElementById('f') as HTMLInputElement;
            return el.files?.[0]?.name ?? null;
        });
        expect(fileName).toBe('hello.txt');
    });
});
