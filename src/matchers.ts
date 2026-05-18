import { expect as baseExpect } from '@playwright/test';
import type { StepReporter } from './page/locator';
import type { Locator } from './page/locator';
import type { Page } from './page/page';

export type MatcherOptions = { timeout?: number };

async function withMatcherStep(
    reporter: StepReporter,
    title: string,
    fn: () => Promise<void>
): Promise<void> {
    try {
        await reporter(title, fn);
    } catch {
        // step is already marked failed by the reporter; result returned via pass variable
    }
}

async function waitForCondition(
    fn: () => Promise<boolean>,
    expected: boolean,
    timeout: number
): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const result = await fn();
        if (result === expected) return result;
        await new Promise(r => setTimeout(r, 100));
    }
    return fn();
}

type MatcherContext = { isNot: boolean };
type MatcherResult = Promise<{ pass: boolean; message: () => string }>;

async function runLocator(
    ctx: MatcherContext,
    locator: Locator,
    timeout: number,
    label: string,
    msg: (not: boolean) => string,
    condition: () => Promise<boolean>
): MatcherResult {
    const not = ctx.isNot;
    const m = () => msg(not);
    let pass = false;
    await withMatcherStep(
        locator._stepReporter,
        `expect(${locator._description()}).${not ? 'not.' : ''}${label}`,
        async () => {
            pass = await waitForCondition(condition, !not, timeout);
            if (pass !== !not) throw new Error(m());
        }
    );
    return { pass, message: m };
}

async function runPage(
    ctx: MatcherContext,
    page: Page,
    timeout: number,
    label: string,
    msg: (not: boolean) => string,
    condition: () => Promise<boolean>
): MatcherResult {
    const not = ctx.isNot;
    const m = () => msg(not);
    let pass = false;
    await withMatcherStep(
        page._stepReporter,
        `expect(page).${not ? 'not.' : ''}${label}`,
        async () => {
            pass = await waitForCondition(condition, !not, timeout);
            if (pass !== !not) throw new Error(m());
        }
    );
    return { pass, message: m };
}

const locatorMatchers = {
    async toBeVisible(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            'toBeVisible()',
            n => `expected locator to${n ? ' not' : ''} be visible`,
            () => locator.isVisible());
    },

    async toBeHidden(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            'toBeHidden()',
            n => `expected locator to${n ? ' not' : ''} be hidden`,
            async () => !(await locator.isVisible()));
    },

    async toBeEnabled(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            'toBeEnabled()',
            n => `expected locator to${n ? ' not' : ''} be enabled`,
            () => locator.isEnabled());
    },

    async toBeDisabled(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            'toBeDisabled()',
            n => `expected locator to${n ? ' not' : ''} be disabled`,
            () => locator.isDisabled());
    },

    async toBeChecked(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            'toBeChecked()',
            n => `expected locator to${n ? ' not' : ''} be checked`,
            () => locator.isChecked());
    },

    async toBeEditable(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            'toBeEditable()',
            n => `expected locator to${n ? ' not' : ''} be editable`,
            () => locator.isEditable());
    },

    async toHaveText(this: MatcherContext, locator: Locator, expected: string | RegExp, options?: MatcherOptions): MatcherResult {
        let actual: string | null = null;
        const matches = (text: string) => typeof expected === 'string' ? text.trim() === expected : expected.test(text);
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveText(${JSON.stringify(expected)})`,
            n => `expected locator to${n ? ' not' : ''} have text ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
            async () => { actual = await locator.textContent(); return actual !== null && matches(actual); });
    },

    async toContainText(this: MatcherContext, locator: Locator, expected: string | RegExp, options?: MatcherOptions): MatcherResult {
        let actual: string | null = null;
        const contains = (text: string) => typeof expected === 'string' ? text.includes(expected) : expected.test(text);
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toContainText(${JSON.stringify(expected)})`,
            n => `expected locator to${n ? ' not' : ''} contain text ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
            async () => { actual = await locator.textContent(); return actual !== null && contains(actual); });
    },

    async toHaveValue(this: MatcherContext, locator: Locator, expected: string | RegExp, options?: MatcherOptions): MatcherResult {
        let actual = '';
        const matches = (v: string) => typeof expected === 'string' ? v === expected : expected.test(v);
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveValue(${JSON.stringify(expected)})`,
            n => `expected input to${n ? ' not' : ''} have value ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
            async () => { actual = await locator.inputValue(); return matches(actual); });
    },

    async toHaveAttribute(this: MatcherContext, locator: Locator, name: string, expected: string | RegExp, options?: MatcherOptions): MatcherResult {
        let actual: string | null = null;
        const matches = (v: string) => typeof expected === 'string' ? v === expected : expected.test(v);
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveAttribute(${JSON.stringify(name)}, ${JSON.stringify(expected)})`,
            n => `expected attribute "${name}" to${n ? ' not' : ''} be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
            async () => { actual = await locator.getAttribute(name); return actual !== null && matches(actual); });
    },

    async toHaveCount(this: MatcherContext, locator: Locator, expected: number, options?: MatcherOptions): MatcherResult {
        let actual = 0;
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveCount(${expected})`,
            n => `expected locator to${n ? ' not' : ''} have count ${expected}, received ${actual}`,
            async () => { actual = await locator.count(); return actual === expected; });
    },

    async toBeAttached(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            'toBeAttached()',
            n => `expected locator to${n ? ' not' : ''} be attached`,
            async () => (await locator.count()) > 0);
    },

    async toBeEmpty(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            'toBeEmpty()',
            n => `expected locator to${n ? ' not' : ''} be empty`,
            () => locator.evaluate((el: any) => {
                const tag = (el.tagName || '').toLowerCase();
                if (tag === 'input' || tag === 'textarea') return (el.value || '') === '';
                if (tag === 'select') return el.options.length === 0;
                return (el.textContent || '').trim() === '';
            }));
    },

    async toBeFocused(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            'toBeFocused()',
            n => `expected locator to${n ? ' not' : ''} be focused`,
            () => locator.evaluate((el: any) => el.ownerDocument.activeElement === el));
    },

    async toBeInViewport(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            'toBeInViewport()',
            n => `expected locator to${n ? ' not' : ''} be in viewport`,
            () => locator.evaluate((el: any) => {
                const r = el.getBoundingClientRect();
                const win = el.ownerDocument.defaultView;
                return r.bottom > 0 && r.right > 0 && r.top < win.innerHeight && r.left < win.innerWidth;
            }));
    },

    async toHaveClass(this: MatcherContext, locator: Locator, expected: string | RegExp, options?: MatcherOptions): MatcherResult {
        let actual = '';
        const matches = (cls: string) =>
            typeof expected === 'string'
                ? cls.split(/\s+/).filter(Boolean).includes(expected)
                : expected.test(cls);
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveClass(${JSON.stringify(String(expected))})`,
            n => `expected locator to${n ? ' not' : ''} have class ${JSON.stringify(String(expected))}, received ${JSON.stringify(actual)}`,
            async () => { actual = (await locator.getAttribute('class')) ?? ''; return matches(actual); });
    },

    async toHaveId(this: MatcherContext, locator: Locator, expected: string | RegExp, options?: MatcherOptions): MatcherResult {
        let actual: string | null = null;
        const matches = (v: string) => typeof expected === 'string' ? v === expected : expected.test(v);
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveId(${JSON.stringify(String(expected))})`,
            n => `expected locator to${n ? ' not' : ''} have id ${JSON.stringify(String(expected))}, received ${JSON.stringify(actual)}`,
            async () => { actual = await locator.getAttribute('id'); return actual !== null && matches(actual); });
    },

    async toHaveRole(this: MatcherContext, locator: Locator, expected: string, options?: MatcherOptions): MatcherResult {
        let actual: string | null = null;
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveRole(${JSON.stringify(expected)})`,
            n => `expected locator to${n ? ' not' : ''} have role ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
            async () => {
                actual = await locator.evaluate((el: any) => {
                    if (!el || el.nodeType !== 1) return null;
                    const explicit = el.getAttribute('role');
                    if (explicit) {
                        const r = explicit.trim().split(/\s+/)[0].toLowerCase();
                        if (r === 'none' || r === 'presentation') return null;
                        return r;
                    }
                    const tag = el.tagName.toLowerCase();
                    const type = (el.getAttribute('type') || '').toLowerCase();
                    switch (tag) {
                        case 'a':        return el.hasAttribute('href') ? 'link' : null;
                        case 'area':     return el.hasAttribute('href') ? 'link' : null;
                        case 'button':   return 'button';
                        case 'datalist': return 'listbox';
                        case 'details':  return 'group';
                        case 'dialog':   return 'dialog';
                        case 'fieldset': return 'group';
                        case 'figure':   return 'figure';
                        case 'footer':   return 'contentinfo';
                        case 'form':     return 'form';
                        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
                        case 'header':   return 'banner';
                        case 'hr':       return 'separator';
                        case 'img':      return el.getAttribute('alt') !== null ? 'img' : null;
                        case 'input':
                            if (type === 'button' || type === 'image' || type === 'reset' || type === 'submit') return 'button';
                            if (type === 'checkbox') return 'checkbox';
                            if (type === 'radio')    return 'radio';
                            if (type === 'range')    return 'slider';
                            if (type === 'number')   return 'spinbutton';
                            if (type === 'search')   return 'searchbox';
                            if (type === 'hidden')   return null;
                            return 'textbox';
                        case 'li':       return 'listitem';
                        case 'main':     return 'main';
                        case 'menu':     return 'list';
                        case 'meter':    return 'meter';
                        case 'nav':      return 'navigation';
                        case 'ol':       return 'list';
                        case 'option':   return 'option';
                        case 'output':   return 'status';
                        case 'progress': return 'progressbar';
                        case 'section':  return (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) ? 'region' : null;
                        case 'select':   return (el.multiple || el.size > 1) ? 'listbox' : 'combobox';
                        case 'summary':  return 'button';
                        case 'table':    return 'table';
                        case 'tbody': case 'thead': case 'tfoot': return 'rowgroup';
                        case 'td':       return 'cell';
                        case 'textarea': return 'textbox';
                        case 'th':       return (el.getAttribute('scope') === 'row' || el.getAttribute('scope') === 'rowgroup') ? 'rowheader' : 'columnheader';
                        case 'tr':       return 'row';
                        case 'ul':       return 'list';
                        case 'body':     return 'document';
                        default:         return null;
                    }
                });
                return actual === expected;
            });
    },

    async toHaveJSProperty(this: MatcherContext, locator: Locator, name: string, value: unknown, options?: MatcherOptions): MatcherResult {
        let actual: unknown;
        const expectedStr = JSON.stringify(value);
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveJSProperty(${JSON.stringify(name)}, ${expectedStr})`,
            n => `expected locator to${n ? ' not' : ''} have JS property ${JSON.stringify(name)} = ${expectedStr}, received ${JSON.stringify(actual)}`,
            async () => { actual = await locator.evaluate((el: any, args: any) => el[args[0]], name); return JSON.stringify(actual) === expectedStr; });
    },

    async toHaveCSS(this: MatcherContext, locator: Locator, property: string, value: string | RegExp, options?: MatcherOptions): MatcherResult {
        let actual = '';
        const matches = (v: string) => typeof value === 'string' ? v === value : value.test(v);
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveCSS(${JSON.stringify(property)}, ${JSON.stringify(String(value))})`,
            n => `expected locator to${n ? ' not' : ''} have CSS property ${JSON.stringify(property)} = ${JSON.stringify(String(value))}, received ${JSON.stringify(actual)}`,
            async () => {
                actual = await locator.evaluate(
                    (el: any, args: any) => el.ownerDocument.defaultView.getComputedStyle(el).getPropertyValue(args[0]),
                    property
                );
                return matches(actual);
            });
    },

    async toHaveValues(this: MatcherContext, locator: Locator, values: string[], options?: MatcherOptions): MatcherResult {
        let actual: string[] = [];
        const sorted = [...values].sort();
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveValues(${JSON.stringify(values)})`,
            n => `expected locator to${n ? ' not' : ''} have values ${JSON.stringify(values)}, received ${JSON.stringify(actual)}`,
            async () => {
                actual = await locator.evaluate((el: any) =>
                    Array.from(el.selectedOptions || []).map(function(o: any) { return o.value; })
                );
                return JSON.stringify([...actual].sort()) === JSON.stringify(sorted);
            });
    },

    async toHaveAccessibleName(this: MatcherContext, locator: Locator, expected: string | RegExp, options?: MatcherOptions): MatcherResult {
        let actual = '';
        const matches = (v: string) => typeof expected === 'string' ? v === expected : expected.test(v);
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveAccessibleName(${JSON.stringify(String(expected))})`,
            n => `expected locator to${n ? ' not' : ''} have accessible name ${JSON.stringify(String(expected))}, received ${JSON.stringify(actual)}`,
            async () => {
                actual = await locator.evaluate((el: any) => {
                    const lbl = el.getAttribute('aria-label');
                    if (lbl && lbl.trim()) return lbl.trim();
                    const lbyId = el.getAttribute('aria-labelledby');
                    if (lbyId) {
                        const parts = lbyId.trim().split(/\s+/).map(function(id: any) {
                            const ref = el.ownerDocument.getElementById(id);
                            return ref ? (ref.textContent || '').replace(/\s+/g, ' ').trim() : '';
                        }).filter(function(s: any) { return s; });
                        if (parts.length) return parts.join(' ');
                    }
                    const title = el.getAttribute('title');
                    if (title && title.trim()) return title.trim();
                    return '';
                });
                return matches(actual);
            });
    },

    async toHaveAccessibleDescription(this: MatcherContext, locator: Locator, expected: string | RegExp, options?: MatcherOptions): MatcherResult {
        let actual = '';
        const matches = (v: string) => typeof expected === 'string' ? v === expected : expected.test(v);
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveAccessibleDescription(${JSON.stringify(String(expected))})`,
            n => `expected locator to${n ? ' not' : ''} have accessible description ${JSON.stringify(String(expected))}, received ${JSON.stringify(actual)}`,
            async () => {
                actual = await locator.evaluate((el: any) => {
                    const dbyId = el.getAttribute('aria-describedby');
                    if (dbyId) {
                        const parts = dbyId.trim().split(/\s+/).map(function(id: any) {
                            const ref = el.ownerDocument.getElementById(id);
                            return ref ? (ref.textContent || '').replace(/\s+/g, ' ').trim() : '';
                        }).filter(function(s: any) { return s; });
                        if (parts.length) return parts.join(' ');
                    }
                    const desc = el.getAttribute('aria-description');
                    if (desc && desc.trim()) return desc.trim();
                    return '';
                });
                return matches(actual);
            });
    },

    async toHaveAccessibleErrorMessage(this: MatcherContext, locator: Locator, expected: string | RegExp, options?: MatcherOptions): MatcherResult {
        let actual = '';
        const matches = (v: string) => typeof expected === 'string' ? v === expected : expected.test(v);
        return runLocator(this, locator, options?.timeout ?? locator._expectTimeout,
            `toHaveAccessibleErrorMessage(${JSON.stringify(String(expected))})`,
            n => `expected locator to${n ? ' not' : ''} have accessible error message ${JSON.stringify(String(expected))}, received ${JSON.stringify(actual)}`,
            async () => {
                actual = await locator.evaluate((el: any) => {
                    const errId = el.getAttribute('aria-errormessage');
                    if (!errId) return '';
                    const ref = el.ownerDocument.getElementById(errId);
                    return ref ? (ref.textContent || '').replace(/\s+/g, ' ').trim() : '';
                });
                return matches(actual);
            });
    },

    async toHaveTitle(this: MatcherContext, page: Page, expected: string | RegExp, options?: MatcherOptions): MatcherResult {
        let actual = '';
        const matches = (t: string) => typeof expected === 'string' ? t === expected : expected.test(t);
        return runPage(this, page, options?.timeout ?? page.expectTimeout,
            `toHaveTitle(${JSON.stringify(expected)})`,
            n => `expected page to${n ? ' not' : ''} have title ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
            async () => { actual = await page.title(); return matches(actual); });
    },

    async toHaveURL(this: MatcherContext, page: Page, expected: string | RegExp, options?: MatcherOptions): MatcherResult {
        let actual = '';
        const matches = (u: string) => typeof expected === 'string' ? u.includes(expected) : expected.test(u);
        return runPage(this, page, options?.timeout ?? page.expectTimeout,
            `toHaveURL(${JSON.stringify(expected)})`,
            n => `expected page to${n ? ' not' : ''} have URL ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
            async () => { actual = await page.url(); return matches(actual); });
    },
};

export const expect = baseExpect.extend(locatorMatchers);

declare module '@playwright/test' {
    interface Matchers<R> {
        toBeVisible(options?: MatcherOptions): R;
        toBeHidden(options?: MatcherOptions): R;
        toBeEnabled(options?: MatcherOptions): R;
        toBeDisabled(options?: MatcherOptions): R;
        toBeChecked(options?: MatcherOptions): R;
        toBeEditable(options?: MatcherOptions): R;
        toBeAttached(options?: MatcherOptions): R;
        toBeEmpty(options?: MatcherOptions): R;
        toBeFocused(options?: MatcherOptions): R;
        toBeInViewport(options?: MatcherOptions): R;
        toHaveText(expected: string | RegExp, options?: MatcherOptions): R;
        toContainText(expected: string | RegExp, options?: MatcherOptions): R;
        toHaveValue(expected: string | RegExp, options?: MatcherOptions): R;
        toHaveAttribute(name: string, expected: string | RegExp, options?: MatcherOptions): R;
        toHaveCount(expected: number, options?: MatcherOptions): R;
        toHaveClass(expected: string | RegExp, options?: MatcherOptions): R;
        toHaveId(expected: string | RegExp, options?: MatcherOptions): R;
        toHaveRole(expected: string, options?: MatcherOptions): R;
        toHaveJSProperty(name: string, value: unknown, options?: MatcherOptions): R;
        toHaveCSS(property: string, value: string | RegExp, options?: MatcherOptions): R;
        toHaveValues(values: string[], options?: MatcherOptions): R;
        toHaveAccessibleName(expected: string | RegExp, options?: MatcherOptions): R;
        toHaveAccessibleDescription(expected: string | RegExp, options?: MatcherOptions): R;
        toHaveAccessibleErrorMessage(expected: string | RegExp, options?: MatcherOptions): R;
        toHaveTitle(expected: string | RegExp, options?: MatcherOptions): R;
        toHaveURL(expected: string | RegExp, options?: MatcherOptions): R;
    }
}
