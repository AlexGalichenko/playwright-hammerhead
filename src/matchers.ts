import { expect as baseExpect } from '@playwright/test';
import type { StepReporter } from './page/locator';
import type { Locator } from './page/locator';
import type { Page } from './page/page';

type MatcherOptions = { timeout?: number };

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

const locatorMatchers = {
    async toBeVisible(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        const msg = () => `expected locator to${not ? ' not' : ''} be visible`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toBeVisible()`, async () => {
            pass = await waitForCondition(() => locator.isVisible(), !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toBeHidden(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        const msg = () => `expected locator to${not ? ' not' : ''} be hidden`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toBeHidden()`, async () => {
            pass = await waitForCondition(async () => !(await locator.isVisible()), !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toBeEnabled(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        const msg = () => `expected locator to${not ? ' not' : ''} be enabled`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toBeEnabled()`, async () => {
            pass = await waitForCondition(() => locator.isEnabled(), !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toBeDisabled(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        const msg = () => `expected locator to${not ? ' not' : ''} be disabled`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toBeDisabled()`, async () => {
            pass = await waitForCondition(() => locator.isDisabled(), !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toBeChecked(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        const msg = () => `expected locator to${not ? ' not' : ''} be checked`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toBeChecked()`, async () => {
            pass = await waitForCondition(() => locator.isChecked(), !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toBeEditable(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        const msg = () => `expected locator to${not ? ' not' : ''} be editable`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toBeEditable()`, async () => {
            pass = await waitForCondition(() => locator.isEditable(), !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveText(
        this: MatcherContext,
        locator: Locator,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual: string | null = null;
        const matches = (text: string) =>
            typeof expected === 'string' ? text.trim() === expected : expected.test(text);
        const msg = () => `expected locator to${not ? ' not' : ''} have text ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveText(${JSON.stringify(expected)})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await locator.textContent();
                return actual !== null && matches(actual);
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toContainText(
        this: MatcherContext,
        locator: Locator,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual: string | null = null;
        const contains = (text: string) =>
            typeof expected === 'string' ? text.includes(expected) : expected.test(text);
        const msg = () => `expected locator to${not ? ' not' : ''} contain text ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toContainText(${JSON.stringify(expected)})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await locator.textContent();
                return actual !== null && contains(actual);
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveValue(
        this: MatcherContext,
        locator: Locator,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual = '';
        const matches = (v: string) =>
            typeof expected === 'string' ? v === expected : expected.test(v);
        const msg = () => `expected input to${not ? ' not' : ''} have value ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveValue(${JSON.stringify(expected)})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await locator.inputValue();
                return matches(actual);
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveAttribute(
        this: MatcherContext,
        locator: Locator,
        name: string,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual: string | null = null;
        const matches = (v: string) =>
            typeof expected === 'string' ? v === expected : expected.test(v);
        const msg = () => `expected attribute "${name}" to${not ? ' not' : ''} be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveAttribute(${JSON.stringify(name)}, ${JSON.stringify(expected)})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await locator.getAttribute(name);
                return actual !== null && matches(actual);
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveCount(
        this: MatcherContext,
        locator: Locator,
        expected: number,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual = 0;
        const msg = () => `expected locator to${not ? ' not' : ''} have count ${expected}, received ${actual}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveCount(${expected})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await locator.count();
                return actual === expected;
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toBeAttached(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        const msg = () => `expected locator to${not ? ' not' : ''} be attached`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toBeAttached()`, async () => {
            pass = await waitForCondition(async () => (await locator.count()) > 0, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toBeEmpty(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        const msg = () => `expected locator to${not ? ' not' : ''} be empty`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toBeEmpty()`, async () => {
            pass = await waitForCondition(async () => {
                return locator.evaluate((el: any) => {
                    const tag = (el.tagName || '').toLowerCase();
                    if (tag === 'input' || tag === 'textarea') return (el.value || '') === '';
                    if (tag === 'select') return el.options.length === 0;
                    return (el.textContent || '').trim() === '';
                });
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toBeFocused(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        const msg = () => `expected locator to${not ? ' not' : ''} be focused`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toBeFocused()`, async () => {
            pass = await waitForCondition(async () => {
                return locator.evaluate((el: any) => el.ownerDocument.activeElement === el);
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toBeInViewport(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        const msg = () => `expected locator to${not ? ' not' : ''} be in viewport`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toBeInViewport()`, async () => {
            pass = await waitForCondition(async () => {
                return locator.evaluate((el: any) => {
                    const r = el.getBoundingClientRect();
                    const win = el.ownerDocument.defaultView;
                    return r.bottom > 0 && r.right > 0 && r.top < win.innerHeight && r.left < win.innerWidth;
                });
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveClass(
        this: MatcherContext,
        locator: Locator,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual = '';
        const matches = (cls: string) =>
            typeof expected === 'string'
                ? cls.split(/\s+/).filter(Boolean).includes(expected)
                : expected.test(cls);
        const msg = () => `expected locator to${not ? ' not' : ''} have class ${JSON.stringify(String(expected))}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveClass(${JSON.stringify(String(expected))})`, async () => {
            pass = await waitForCondition(async () => {
                actual = (await locator.getAttribute('class')) ?? '';
                return matches(actual);
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveId(
        this: MatcherContext,
        locator: Locator,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual: string | null = null;
        const matches = (v: string) =>
            typeof expected === 'string' ? v === expected : expected.test(v);
        const msg = () => `expected locator to${not ? ' not' : ''} have id ${JSON.stringify(String(expected))}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveId(${JSON.stringify(String(expected))})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await locator.getAttribute('id');
                return actual !== null && matches(actual);
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveRole(
        this: MatcherContext,
        locator: Locator,
        expected: string,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual: string | null = null;
        const msg = () => `expected locator to${not ? ' not' : ''} have role ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveRole(${JSON.stringify(expected)})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await locator.evaluate((el: any) => {
                    const explicit = el.getAttribute('role');
                    if (explicit) return explicit.trim().split(/\s+/)[0].toLowerCase();
                    const tag = el.tagName.toLowerCase();
                    const type = (el.getAttribute('type') || '').toLowerCase();
                    if (tag === 'button' || tag === 'summary') return 'button';
                    if (tag === 'a' && el.hasAttribute('href')) return 'link';
                    if (tag === 'input') {
                        if (type === 'checkbox') return 'checkbox';
                        if (type === 'radio') return 'radio';
                        if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') return 'button';
                        if (type === 'hidden') return null;
                        return 'textbox';
                    }
                    if (tag === 'select') return (el.multiple || el.size > 1) ? 'listbox' : 'combobox';
                    if (tag === 'textarea') return 'textbox';
                    if (tag === 'img') return el.getAttribute('alt') !== null ? 'img' : null;
                    if (tag === 'nav') return 'navigation';
                    if (tag === 'main') return 'main';
                    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return 'heading';
                    if (tag === 'ul' || tag === 'ol' || tag === 'menu') return 'list';
                    if (tag === 'li') return 'listitem';
                    if (tag === 'table') return 'table';
                    if (tag === 'dialog') return 'dialog';
                    return null;
                });
                return actual === expected;
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveJSProperty(
        this: MatcherContext,
        locator: Locator,
        name: string,
        value: unknown,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual: unknown;
        const expectedStr = JSON.stringify(value);
        const msg = () => `expected locator to${not ? ' not' : ''} have JS property ${JSON.stringify(name)} = ${expectedStr}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveJSProperty(${JSON.stringify(name)}, ${expectedStr})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await locator.evaluate((el: any, args: any) => el[args[0]], name);
                return JSON.stringify(actual) === expectedStr;
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveCSS(
        this: MatcherContext,
        locator: Locator,
        property: string,
        value: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual = '';
        const matches = (v: string) =>
            typeof value === 'string' ? v === value : value.test(v);
        const msg = () => `expected locator to${not ? ' not' : ''} have CSS property ${JSON.stringify(property)} = ${JSON.stringify(String(value))}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveCSS(${JSON.stringify(property)}, ${JSON.stringify(String(value))})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await locator.evaluate((el: any, args: any) => {
                    return el.ownerDocument.defaultView.getComputedStyle(el).getPropertyValue(args[0]);
                }, property);
                return matches(actual);
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveValues(
        this: MatcherContext,
        locator: Locator,
        values: string[],
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual: string[] = [];
        const sorted = [...values].sort();
        const msg = () => `expected locator to${not ? ' not' : ''} have values ${JSON.stringify(values)}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveValues(${JSON.stringify(values)})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await locator.evaluate((el: any) => {
                    return Array.from(el.selectedOptions || []).map(function(o: any) { return o.value; });
                });
                return JSON.stringify([...actual].sort()) === JSON.stringify(sorted);
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveAccessibleName(
        this: MatcherContext,
        locator: Locator,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual = '';
        const matches = (v: string) =>
            typeof expected === 'string' ? v === expected : expected.test(v);
        const msg = () => `expected locator to${not ? ' not' : ''} have accessible name ${JSON.stringify(String(expected))}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveAccessibleName(${JSON.stringify(String(expected))})`, async () => {
            pass = await waitForCondition(async () => {
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
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveAccessibleDescription(
        this: MatcherContext,
        locator: Locator,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual = '';
        const matches = (v: string) =>
            typeof expected === 'string' ? v === expected : expected.test(v);
        const msg = () => `expected locator to${not ? ' not' : ''} have accessible description ${JSON.stringify(String(expected))}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveAccessibleDescription(${JSON.stringify(String(expected))})`, async () => {
            pass = await waitForCondition(async () => {
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
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveAccessibleErrorMessage(
        this: MatcherContext,
        locator: Locator,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const not = this.isNot;
        let actual = '';
        const matches = (v: string) =>
            typeof expected === 'string' ? v === expected : expected.test(v);
        const msg = () => `expected locator to${not ? ' not' : ''} have accessible error message ${JSON.stringify(String(expected))}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(locator._stepReporter, `expect(${locator._description()}).${not ? 'not.' : ''}toHaveAccessibleErrorMessage(${JSON.stringify(String(expected))})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await locator.evaluate((el: any) => {
                    const errId = el.getAttribute('aria-errormessage');
                    if (!errId) return '';
                    const ref = el.ownerDocument.getElementById(errId);
                    return ref ? (ref.textContent || '').replace(/\s+/g, ' ').trim() : '';
                });
                return matches(actual);
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveTitle(
        this: MatcherContext,
        page: Page,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? page.expectTimeout;
        const not = this.isNot;
        let actual = '';
        const matches = (t: string) =>
            typeof expected === 'string' ? t === expected : expected.test(t);
        const msg = () => `expected page to${not ? ' not' : ''} have title ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(page._stepReporter, `expect(page).${not ? 'not.' : ''}toHaveTitle(${JSON.stringify(expected)})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await page.title();
                return matches(actual);
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
    },

    async toHaveURL(
        this: MatcherContext,
        page: Page,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? page.expectTimeout;
        const not = this.isNot;
        let actual = '';
        const matches = (u: string) =>
            typeof expected === 'string' ? u.includes(expected) : expected.test(u);
        const msg = () => `expected page to${not ? ' not' : ''} have URL ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
        let pass = false;
        await withMatcherStep(page._stepReporter, `expect(page).${not ? 'not.' : ''}toHaveURL(${JSON.stringify(expected)})`, async () => {
            pass = await waitForCondition(async () => {
                actual = await page.url();
                return matches(actual);
            }, !not, timeout);
            if (pass !== !not) throw new Error(msg());
        });
        return { pass, message: msg };
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
