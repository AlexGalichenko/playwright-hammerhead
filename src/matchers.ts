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
        toHaveText(expected: string | RegExp, options?: MatcherOptions): R;
        toContainText(expected: string | RegExp, options?: MatcherOptions): R;
        toHaveValue(expected: string | RegExp, options?: MatcherOptions): R;
        toHaveAttribute(name: string, expected: string | RegExp, options?: MatcherOptions): R;
        toHaveCount(expected: number, options?: MatcherOptions): R;
        toHaveTitle(expected: string | RegExp, options?: MatcherOptions): R;
        toHaveURL(expected: string | RegExp, options?: MatcherOptions): R;
    }
}
