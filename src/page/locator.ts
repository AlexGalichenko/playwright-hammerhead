import { BridgeSession } from '../session/bridge-session';

export type LocatorState = 'visible' | 'hidden' | 'attached' | 'detached';

export class Locator {
    constructor(
        private readonly session: BridgeSession,
        private readonly selector: string,
        private readonly defaultTimeout: number = 30000
    ) {}

    private get(overrideSelector?: string): string {
        return overrideSelector ?? this.selector;
    }

    // --- Clicks ---

    async click(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'click',
            selector: this.selector,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    async dblclick(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'dblclick',
            selector: this.selector,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    // --- Typing ---

    async fill(value: string, options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'fill',
            selector: this.selector,
            value,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    async type(text: string, options?: { timeout?: number; delay?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'type',
            selector: this.selector,
            text,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    async clear(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'clear',
            selector: this.selector,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    async pressSequentially(text: string, options?: { delay?: number }): Promise<void> {
        await this.type(text, options);
    }

    // --- State queries ---

    async isVisible(): Promise<boolean> {
        return this.session.sendCommand<boolean>({
            type: 'isVisible',
            selector: this.selector,
        });
    }

    async isHidden(): Promise<boolean> {
        return !(await this.isVisible());
    }

    async isEnabled(): Promise<boolean> {
        return this.session.sendCommand<boolean>({
            type: 'isEnabled',
            selector: this.selector,
        });
    }

    async isDisabled(): Promise<boolean> {
        return !(await this.isEnabled());
    }

    async isChecked(): Promise<boolean> {
        return this.session.sendCommand<boolean>({
            type: 'isChecked',
            selector: this.selector,
        });
    }

    async isEditable(): Promise<boolean> {
        return this.session.sendCommand<boolean>({
            type: 'isEditable',
            selector: this.selector,
        });
    }

    // --- Content ---

    async textContent(): Promise<string | null> {
        return this.session.sendCommand<string | null>({
            type: 'textContent',
            selector: this.selector,
            timeout: this.defaultTimeout,
        });
    }

    async innerText(): Promise<string> {
        return this.session.sendCommand<string>({
            type: 'innerText',
            selector: this.selector,
            timeout: this.defaultTimeout,
        });
    }

    async innerHTML(): Promise<string> {
        return this.session.sendCommand<string>({
            type: 'innerHTML',
            selector: this.selector,
            timeout: this.defaultTimeout,
        });
    }

    async inputValue(): Promise<string> {
        return this.session.sendCommand<string>({
            type: 'inputValue',
            selector: this.selector,
            timeout: this.defaultTimeout,
        });
    }

    async getAttribute(name: string): Promise<string | null> {
        return this.session.sendCommand<string | null>({
            type: 'getAttribute',
            selector: this.selector,
            name,
            timeout: this.defaultTimeout,
        });
    }

    // --- Actions ---

    async hover(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'hover',
            selector: this.selector,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    async focus(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'focus',
            selector: this.selector,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    async blur(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'blur',
            selector: this.selector,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    async scrollIntoViewIfNeeded(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'scrollIntoView',
            selector: this.selector,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    async selectOption(
        values: string | string[],
        options?: { timeout?: number }
    ): Promise<string[]> {
        return this.session.sendCommand<string[]>({
            type: 'selectOption',
            selector: this.selector,
            values: Array.isArray(values) ? values : [values],
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    async check(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'check',
            selector: this.selector,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    async uncheck(options?: { timeout?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'uncheck',
            selector: this.selector,
            timeout: options?.timeout ?? this.defaultTimeout,
        });
    }

    // --- Waiting ---

    async waitFor(options?: { state?: LocatorState; timeout?: number }): Promise<void> {
        const state = options?.state ?? 'visible';
        const timeout = options?.timeout ?? this.defaultTimeout;

        if (state === 'visible') {
            await this.session.sendCommand({ type: 'waitForSelector', selector: this.selector, timeout });
        } else if (state === 'hidden') {
            const deadline = Date.now() + timeout;
            while (Date.now() < deadline) {
                const visible = await this.isVisible();
                if (!visible) return;
                await new Promise(r => setTimeout(r, 100));
            }
            throw new Error(`Timeout ${timeout}ms waiting for ${this.selector} to be hidden`);
        } else if (state === 'attached') {
            await this.session.sendCommand({ type: 'waitForSelector', selector: this.selector, timeout });
        } else if (state === 'detached') {
            const deadline = Date.now() + timeout;
            while (Date.now() < deadline) {
                const count = await this.count();
                if (count === 0) return;
                await new Promise(r => setTimeout(r, 100));
            }
            throw new Error(`Timeout ${timeout}ms waiting for ${this.selector} to be detached`);
        }
    }

    // --- Count / nth ---

    async count(): Promise<number> {
        return this.session.sendCommand<number>({
            type: 'count',
            selector: this.selector,
        });
    }

    nth(index: number): Locator {
        return new Locator(this.session, `:is(${this.selector}):nth-child(${index + 1})`, this.defaultTimeout);
    }

    first(): Locator {
        return new Locator(this.session, `:is(${this.selector}):first-child`, this.defaultTimeout);
    }

    last(): Locator {
        return new Locator(this.session, `:is(${this.selector}):last-child`, this.defaultTimeout);
    }

    locator(subSelector: string): Locator {
        return new Locator(this.session, `${this.selector} ${subSelector}`, this.defaultTimeout);
    }

    // --- Evaluation ---

    async evaluate<T>(
        fn: (element: unknown, ...args: unknown[]) => T,
        ...args: unknown[]
    ): Promise<T> {
        return this.session.sendCommand<T>({
            type: 'locatorEvaluate',
            selector: this.selector,
            fn: fn.toString(),
            args,
            timeout: this.defaultTimeout,
        });
    }
}
