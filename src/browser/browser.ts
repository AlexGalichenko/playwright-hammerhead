import { Proxy } from 'testcafe-hammerhead';
import { BridgeSession } from '../session/bridge-session';
import { Page } from '../page/page';
import type { UseOptions } from './browser-type';

export interface NewPageOptions {
    /** Default timeout for page actions and locator operations */
    actionTimeout?: number;
    /** Default timeout for navigation methods like goto/reload/goBack */
    navigationTimeout?: number;
    /** Default timeout for expect() assertions */
    expectTimeout?: number;
}

export class Browser {
    private pages: Page[] = [];

    constructor(
        private readonly proxy: Proxy,
        private readonly proxyPort: number,
        private readonly _use?: UseOptions
    ) {}

    async newPage(options?: NewPageOptions): Promise<Page> {
        const session = new BridgeSession(this.proxyPort);
        const page = new Page(this.proxy, session, {
            actionTimeout: options?.actionTimeout ?? this._use?.actionTimeout,
            navigationTimeout: options?.navigationTimeout ?? this._use?.navigationTimeout,
            expectTimeout: options?.expectTimeout ?? this._use?.expectTimeout,
        });
        this.pages.push(page);
        return page;
    }

    async close(): Promise<void> {
        for (const page of this.pages) {
            try {
                await page.close();
            } catch {
                // ignore errors on close
            }
        }
        this.pages = [];
        this.proxy.close();
    }

    contexts(): never[] {
        return [];
    }
}
