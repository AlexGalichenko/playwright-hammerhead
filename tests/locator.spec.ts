/// <reference types="node" />
import { test, expect } from './fixtures';

const HTML = (body: string) => `<html><body>${body}</body></html>`;

// ── locator.count ─────────────────────────────────────────────────────────────

test.describe('locator.count', () => {
    test('returns the number of matched elements', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>a</li><li>b</li><li>c</li>'));
        expect(await page.locator('li').count()).toBe(3);
    });

    test('returns 0 when nothing matches', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p>hello</p>'));
        expect(await page.locator('span').count()).toBe(0);
    });
});

// ── locator.nth / first / last ────────────────────────────────────────────────

test.describe('locator.nth / first / last', () => {
    test('nth(0) returns the first element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li id="a">A</li><li id="b">B</li><li id="c">C</li>'));
        expect(await page.locator('li').nth(0).textContent()).toBe('A');
    });

    test('nth(1) returns the second element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>A</li><li>B</li><li>C</li>'));
        expect(await page.locator('li').nth(1).textContent()).toBe('B');
    });

    test('nth(-1) returns the last element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>A</li><li>B</li><li>C</li>'));
        expect(await page.locator('li').nth(-1).textContent()).toBe('C');
    });

    test('first() returns the first element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>First</li><li>Second</li>'));
        expect(await page.locator('li').first().textContent()).toBe('First');
    });

    test('last() returns the last element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>First</li><li>Last</li>'));
        expect(await page.locator('li').last().textContent()).toBe('Last');
    });
});

// ── locator.all ───────────────────────────────────────────────────────────────

test.describe('locator.all', () => {
    test('returns one locator per matched element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>A</li><li>B</li><li>C</li>'));
        const items = await page.locator('li').all();
        expect(items).toHaveLength(3);
    });

    test('each locator resolves to its element text', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>X</li><li>Y</li>'));
        const items = await page.locator('li').all();
        expect(await items[0].textContent()).toBe('X');
        expect(await items[1].textContent()).toBe('Y');
    });
});

// ── locator.allTextContents / allInnerTexts ───────────────────────────────────

test.describe('locator.allTextContents / allInnerTexts', () => {
    test('allTextContents returns text of every matched element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>One</li><li>Two</li><li>Three</li>'));
        expect(await page.locator('li').allTextContents()).toEqual(['One', 'Two', 'Three']);
    });

    test('allInnerTexts returns innerText of every matched element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>Alpha</li><li>Beta</li>'));
        const texts = await page.locator('li').allInnerTexts();
        expect(texts).toContain('Alpha');
        expect(texts).toContain('Beta');
    });
});

// ── locator.filter ────────────────────────────────────────────────────────────

test.describe('locator.filter', () => {
    test('hasText narrows to elements containing the text', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>Apple</li><li>Banana</li><li>Apricot</li>'));
        expect(await page.locator('li').filter({ hasText: 'Apple' }).count()).toBe(1);
        expect(await page.locator('li').filter({ hasText: 'Apple' }).textContent()).toBe('Apple');
    });

    test('hasText accepts a regex', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>Apple</li><li>Banana</li><li>Apricot</li>'));
        expect(await page.locator('li').filter({ hasText: /^Ap/ }).count()).toBe(2);
    });

    test('hasNotText excludes elements containing the text', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>Apple</li><li>Banana</li><li>Cherry</li>'));
        const locs = await page.locator('li').filter({ hasNotText: 'Apple' });
        expect(await locs.count()).toBe(2);
    });

    test('has narrows to elements containing a matching child', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<div><span class="tag">yes</span></div><div><em>no</em></div>'));
        const result = await page.locator('div').filter({ has: page.locator('.tag') });
        expect(await result.count()).toBe(1);
        expect(await result.textContent()).toBe('yes');
    });

    test('hasNot excludes elements that contain a matching child', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<div><span class="tag">yes</span></div><div><em>no</em></div>'));
        const result = await page.locator('div').filter({ hasNot: page.locator('.tag') });
        expect(await result.count()).toBe(1);
        expect(await result.textContent()).toBe('no');
    });
});

// ── locator.and / locator.or ──────────────────────────────────────────────────

test.describe('locator.and / locator.or', () => {
    test('and() intersects two locator sets', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<button class="primary" id="ok">OK</button><button id="cancel">Cancel</button>'));
        const result = page.locator('button').and(page.locator('.primary'));
        expect(await result.count()).toBe(1);
        expect(await result.textContent()).toBe('OK');
    });

    test('or() unions two locator sets', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<button id="a">A</button><input id="b" type="text">'));
        const result = page.locator('button').or(page.locator('input'));
        expect(await result.count()).toBe(2);
    });
});

// ── locator chaining (locator.locator) ────────────────────────────────────────

test.describe('locator.locator (chaining)', () => {
    test('narrows scope to descendants of the parent locator', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML(`
            <ul id="list1"><li>A</li><li>B</li></ul>
            <ul id="list2"><li>C</li></ul>
        `));
        const items = await page.locator('#list1').locator('li').allTextContents();
        expect(items).toEqual(['A', 'B']);
    });

    test('does not match elements outside the parent', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML(`
            <div id="inner"><span>inside</span></div>
            <span>outside</span>
        `));
        expect(await page.locator('#inner').locator('span').count()).toBe(1);
        expect(await page.locator('#inner').locator('span').textContent()).toBe('inside');
    });
});

// ── locator state queries ─────────────────────────────────────────────────────

test.describe('locator state queries', () => {
    test('isVisible() is true for a rendered element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p">Hello</p>'));
        expect(await page.locator('#p').isVisible()).toBe(true);
    });

    test('isHidden() is true for a display:none element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p" style="display:none">hidden</p>'));
        expect(await page.locator('#p').isHidden()).toBe(true);
    });

    test('isEnabled() is true for a normal input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="i" type="text">'));
        expect(await page.locator('#i').isEnabled()).toBe(true);
    });

    test('isDisabled() is true for a disabled input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="i" type="text" disabled>'));
        expect(await page.locator('#i').isDisabled()).toBe(true);
    });

    test('isChecked() is true for a checked checkbox', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="cb" type="checkbox" checked>'));
        expect(await page.locator('#cb').isChecked()).toBe(true);
    });

    test('isEditable() is false for a readonly input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="r" type="text" readonly>'));
        expect(await page.locator('#r').isEditable()).toBe(false);
    });
});

// ── locator text / attribute getters ─────────────────────────────────────────

test.describe('locator text and attribute getters', () => {
    test('textContent() returns raw text content', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p">  hello world  </p>'));
        expect(await page.locator('#p').textContent()).toBe('  hello world  ');
    });

    test('innerText() returns rendered text', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p">  trimmed  </p>'));
        const text = await page.locator('#p').innerText();
        expect(text.trim()).toBe('trimmed');
    });

    test('innerHTML() returns child markup', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<div id="d"><span>inner</span></div>'));
        expect(await page.locator('#d').innerHTML()).toBe('<span>inner</span>');
    });

    test('inputValue() returns current value of input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="i" type="text" value="hello">'));
        expect(await page.locator('#i').inputValue()).toBe('hello');
    });

    test('getAttribute() returns the attribute value', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<div id="d" data-foo="bar"></div>'));
        expect(await page.locator('#d').getAttribute('data-foo')).toBe('bar');
    });

    test('getAttribute() returns null for missing attribute', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<div id="d"></div>'));
        expect(await page.locator('#d').getAttribute('nonexistent')).toBeNull();
    });
});

// ── locator actions ───────────────────────────────────────────────────────────

test.describe('locator.click', () => {
    test('fires click event on the element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<button id="btn">Click me</button>'));
        await page.evaluate(() => {
            (window as any).__clicked = false;
            document.getElementById('btn')!.addEventListener('click', () => { (window as any).__clicked = true; });
        });
        await page.locator('#btn').click();
        expect(await page.evaluate(() => (window as any).__clicked)).toBe(true);
    });
});

test.describe('locator.fill', () => {
    test('sets the input value', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="i" type="text">'));
        await page.locator('#i').fill('test value');
        expect(await page.locator('#i').inputValue()).toBe('test value');
    });
});

test.describe('locator.clear', () => {
    test('empties a filled input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="i" type="text" value="preset">'));
        await page.locator('#i').clear();
        expect(await page.locator('#i').inputValue()).toBe('');
    });
});

test.describe('locator.check / uncheck / setChecked', () => {
    test('check() sets the checkbox', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="cb" type="checkbox">'));
        await page.locator('#cb').check();
        expect(await page.locator('#cb').isChecked()).toBe(true);
    });

    test('uncheck() clears the checkbox', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="cb" type="checkbox" checked>'));
        await page.locator('#cb').uncheck();
        expect(await page.locator('#cb').isChecked()).toBe(false);
    });

    test('setChecked(true) checks an unchecked box', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="cb" type="checkbox">'));
        await page.locator('#cb').setChecked(true);
        expect(await page.locator('#cb').isChecked()).toBe(true);
    });
});

test.describe('locator.selectOption', () => {
    test('selects an option by value', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML(`
            <select id="sel">
                <option value="a">Alpha</option>
                <option value="b">Beta</option>
            </select>
        `));
        await page.locator('#sel').selectOption('b');
        expect(await page.locator('#sel').inputValue()).toBe('b');
    });
});

test.describe('locator.focus / blur', () => {
    test('focus() makes the element active', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="i" type="text">'));
        await page.locator('#i').focus();
        expect(await page.evaluate(() => document.activeElement?.id)).toBe('i');
    });

    test('blur() removes focus from the element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="i" type="text">'));
        await page.locator('#i').focus();
        await page.locator('#i').blur();
        expect(await page.evaluate(() => document.activeElement?.id)).not.toBe('i');
    });
});

test.describe('locator.dispatchEvent', () => {
    test('fires a custom event on the element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<div id="d">target</div>'));
        await page.evaluate(() => {
            (window as any).__fired = false;
            document.getElementById('d')!.addEventListener('my-event', () => { (window as any).__fired = true; });
        });
        await page.locator('#d').dispatchEvent('my-event');
        expect(await page.evaluate(() => (window as any).__fired)).toBe(true);
    });
});

// ── locator.evaluate / evaluateAll ────────────────────────────────────────────

test.describe('locator.evaluate / evaluateAll', () => {
    test('evaluate runs a function on the first matched element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p">hello</p>'));
        const result = await page.locator('#p').evaluate((el) => (el as HTMLElement).tagName);
        expect(result).toBe('P');
    });

    test('evaluate passes arguments to the function', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p">hello</p>'));
        const result = await page.locator('#p').evaluate((el, suffix) => (el as HTMLElement).textContent + suffix, '!');
        expect(result).toBe('hello!');
    });

    test('evaluateAll receives all matched elements', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>A</li><li>B</li><li>C</li>'));
        const texts = await page.locator('li').evaluateAll((els) => (els as HTMLElement[]).map(e => e.textContent));
        expect(texts).toEqual(['A', 'B', 'C']);
    });
});

// ── locator.boundingBox ───────────────────────────────────────────────────────

test.describe('locator.boundingBox', () => {
    test('returns a non-null box for a visible element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<div id="d" style="width:100px;height:50px">box</div>'));
        const box = await page.locator('#d').boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
    });

    test('returns null for a hidden element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<div id="d" style="display:none">hidden</div>'));
        const box = await page.locator('#d').boundingBox();
        expect(box).toBeNull();
    });
});

// ── locator.waitFor ───────────────────────────────────────────────────────────

test.describe('locator.waitFor', () => {
    test('resolves immediately when element is already visible', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p">visible</p>'));
        await page.locator('#p').waitFor({ state: 'visible' });
    });

    test('resolves when element is added to DOM after a delay', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<div id="root"></div>'));
        await page.evaluate(() => {
            setTimeout(() => {
                const p = document.createElement('p');
                p.id = 'p';
                p.textContent = 'late';
                document.getElementById('root')!.appendChild(p);
            }, 200);
        });
        await page.locator('#p').waitFor({ state: 'visible', timeout: 5000 });
        expect(await page.locator('#p').count()).toBe(1);
    });

    test('resolves for state "attached" when element exists', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p">here</p>'));
        await page.locator('#p').waitFor({ state: 'attached' });
    });

    test('resolves for state "hidden" when element is not visible', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p" style="display:none">hidden</p>'));
        await page.locator('#p').waitFor({ state: 'hidden' });
    });

    test('resolves for state "detached" after element is removed', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p">remove me</p>'));
        await page.evaluate(() => {
            setTimeout(() => document.getElementById('p')!.remove(), 150);
        });
        await page.locator('#p').waitFor({ state: 'detached', timeout: 5000 });
    });
});

// ── locator expect matchers ───────────────────────────────────────────────────

test.describe('expect(locator).toBeVisible / toBeHidden', () => {
    test('toBeVisible passes for a rendered element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p">visible</p>'));
        await expect(page.locator('#p')).toBeVisible();
    });

    test('toBeHidden passes for a display:none element', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p" style="display:none">hidden</p>'));
        await expect(page.locator('#p')).toBeHidden();
    });
});

test.describe('expect(locator).toHaveText / toContainText', () => {
    test('toHaveText matches exact text content', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p">Hello World</p>'));
        await expect(page.locator('#p')).toHaveText('Hello World');
    });

    test('toContainText passes when text is a substring', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<p id="p">Hello World</p>'));
        await expect(page.locator('#p')).toContainText('World');
    });
});

test.describe('expect(locator).toHaveValue', () => {
    test('passes when input value matches', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="i" type="text" value="abc">'));
        await expect(page.locator('#i')).toHaveValue('abc');
    });
});

test.describe('expect(locator).toHaveCount', () => {
    test('passes when the count matches', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<li>a</li><li>b</li><li>c</li>'));
        await expect(page.locator('li')).toHaveCount(3);
    });
});

test.describe('expect(locator).toBeEnabled / toBeDisabled / toBeChecked / toBeEditable', () => {
    test('toBeEnabled passes for a normal input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="i" type="text">'));
        await expect(page.locator('#i')).toBeEnabled();
    });

    test('toBeDisabled passes for a disabled input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="i" type="text" disabled>'));
        await expect(page.locator('#i')).toBeDisabled();
    });

    test('toBeChecked passes for a checked checkbox', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="cb" type="checkbox" checked>'));
        await expect(page.locator('#cb')).toBeChecked();
    });

    test('toBeEditable passes for an enabled writable input', async ({ safariPage: page }) => {
        await page.goto('https://www.saucedemo.com/');
        await page.setContent(HTML('<input id="i" type="text">'));
        await expect(page.locator('#i')).toBeEditable();
    });
});
