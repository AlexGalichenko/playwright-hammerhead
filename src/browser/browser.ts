import { Proxy } from 'testcafe-hammerhead';
import { BridgeSession } from '../session/bridge-session';
import { Page, PageConfig } from '../page/page';
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

    protected _createPage(proxy: Proxy, session: BridgeSession, config: PageConfig): Page {
        return new Page(proxy, session, config);
    }

    async newPage(options?: NewPageOptions): Promise<Page> {
        const session = new BridgeSession(this.proxyPort);
        const config: PageConfig = {
            actionTimeout: options?.actionTimeout ?? this._use?.actionTimeout,
            navigationTimeout: options?.navigationTimeout ?? this._use?.navigationTimeout,
            expectTimeout: options?.expectTimeout ?? this._use?.expectTimeout,
        };
        const page = this._createPage(this.proxy, session, config);
        this.pages.push(page);
        await page._openBlankPage(config.navigationTimeout ?? config.actionTimeout ?? 30_000);
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
