import { expect as baseExpect } from '@playwright/test';
import type { Locator } from './page/locator';

type MatcherOptions = { timeout?: number };

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
        const pass = await waitForCondition(() => locator.isVisible(), !this.isNot, timeout);
        return {
            pass,
            message: () => `expected locator to${this.isNot ? ' not' : ''} be visible`,
        };
    },

    async toBeHidden(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const pass = await waitForCondition(
            async () => !(await locator.isVisible()),
            !this.isNot,
            timeout
        );
        return {
            pass,
            message: () => `expected locator to${this.isNot ? ' not' : ''} be hidden`,
        };
    },

    async toBeEnabled(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const pass = await waitForCondition(() => locator.isEnabled(), !this.isNot, timeout);
        return {
            pass,
            message: () => `expected locator to${this.isNot ? ' not' : ''} be enabled`,
        };
    },

    async toBeDisabled(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const pass = await waitForCondition(() => locator.isDisabled(), !this.isNot, timeout);
        return {
            pass,
            message: () => `expected locator to${this.isNot ? ' not' : ''} be disabled`,
        };
    },

    async toBeChecked(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const pass = await waitForCondition(() => locator.isChecked(), !this.isNot, timeout);
        return {
            pass,
            message: () => `expected locator to${this.isNot ? ' not' : ''} be checked`,
        };
    },

    async toBeEditable(this: MatcherContext, locator: Locator, options?: MatcherOptions): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        const pass = await waitForCondition(() => locator.isEditable(), !this.isNot, timeout);
        return {
            pass,
            message: () => `expected locator to${this.isNot ? ' not' : ''} be editable`,
        };
    },

    async toHaveText(
        this: MatcherContext,
        locator: Locator,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        let actual: string | null = null;
        const matches = (text: string) =>
            typeof expected === 'string' ? text.trim() === expected : expected.test(text);
        const pass = await waitForCondition(async () => {
            actual = await locator.textContent();
            return actual !== null && matches(actual);
        }, !this.isNot, timeout);
        return {
            pass,
            message: () =>
                `expected locator to${this.isNot ? ' not' : ''} have text ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
        };
    },

    async toContainText(
        this: MatcherContext,
        locator: Locator,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        let actual: string | null = null;
        const contains = (text: string) =>
            typeof expected === 'string' ? text.includes(expected) : expected.test(text);
        const pass = await waitForCondition(async () => {
            actual = await locator.textContent();
            return actual !== null && contains(actual);
        }, !this.isNot, timeout);
        return {
            pass,
            message: () =>
                `expected locator to${this.isNot ? ' not' : ''} contain text ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
        };
    },

    async toHaveValue(
        this: MatcherContext,
        locator: Locator,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        let actual = '';
        const matches = (v: string) =>
            typeof expected === 'string' ? v === expected : expected.test(v);
        const pass = await waitForCondition(async () => {
            actual = await locator.inputValue();
            return matches(actual);
        }, !this.isNot, timeout);
        return {
            pass,
            message: () =>
                `expected input to${this.isNot ? ' not' : ''} have value ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
        };
    },

    async toHaveAttribute(
        this: MatcherContext,
        locator: Locator,
        name: string,
        expected: string | RegExp,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        let actual: string | null = null;
        const matches = (v: string) =>
            typeof expected === 'string' ? v === expected : expected.test(v);
        const pass = await waitForCondition(async () => {
            actual = await locator.getAttribute(name);
            return actual !== null && matches(actual);
        }, !this.isNot, timeout);
        return {
            pass,
            message: () =>
                `expected attribute "${name}" to${this.isNot ? ' not' : ''} be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
        };
    },

    async toHaveCount(
        this: MatcherContext,
        locator: Locator,
        expected: number,
        options?: MatcherOptions
    ): MatcherResult {
        const timeout = options?.timeout ?? locator._expectTimeout;
        let actual = 0;
        const pass = await waitForCondition(async () => {
            actual = await locator.count();
            return actual === expected;
        }, !this.isNot, timeout);
        return {
            pass,
            message: () =>
                `expected locator to${this.isNot ? ' not' : ''} have count ${expected}, received ${actual}`,
        };
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
    }
}
