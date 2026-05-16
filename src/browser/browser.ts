import { Proxy } from 'testcafe-hammerhead';
import { BridgeSession } from '../session/bridge-session';
import { Page } from '../page/page';

export interface NewPageOptions {
    defaultTimeout?: number;
}

export class Browser {
    private pages: Page[] = [];

    constructor(
        private readonly proxy: Proxy,
        private readonly proxyPort: number
    ) {}

    async newPage(options?: NewPageOptions): Promise<Page> {
        const session = new BridgeSession(this.proxyPort);
        const page = new Page(this.proxy, session, options?.defaultTimeout);
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
