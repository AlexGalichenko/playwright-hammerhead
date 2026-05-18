import { Proxy } from 'testcafe-hammerhead';
import { BridgeSession } from '../session/bridge-session';
import { Page, PageConfig } from '../page/page';
import { BrowserContext } from './browser-context';
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
    private _contexts: BrowserContext[] = [];
    private _defaultContext: BrowserContext | null = null;

    constructor(
        private readonly proxy: Proxy,
        private readonly proxyPort: number,
        private readonly _use?: UseOptions
    ) {}

    protected _createPage(proxy: Proxy, session: BridgeSession, config: PageConfig, context: BrowserContext): Page {
        return new Page(proxy, session, config, context);
    }

    private async _newPageInContext(context: BrowserContext, options?: NewPageOptions): Promise<Page> {
        const session = new BridgeSession(this.proxyPort);
        const config: PageConfig = {
            actionTimeout: options?.actionTimeout ?? this._use?.actionTimeout,
            navigationTimeout: options?.navigationTimeout ?? this._use?.navigationTimeout,
            expectTimeout: options?.expectTimeout ?? this._use?.expectTimeout,
        };
        const page = this._createPage(this.proxy, session, config, context);
        await page._openBlankPage(config.navigationTimeout ?? config.actionTimeout ?? 30_000);
        return page;
    }

    async newContext(options?: NewPageOptions): Promise<BrowserContext> {
        const ctx = new BrowserContext((context) => this._newPageInContext(context, options));
        this._contexts.push(ctx);
        ctx.once('close', () => {
            this._contexts = this._contexts.filter(c => c !== ctx);
            if (this._defaultContext === ctx) this._defaultContext = null;
        });
        return ctx;
    }

    async newPage(options?: NewPageOptions): Promise<Page> {
        if (!this._defaultContext) {
            this._defaultContext = await this.newContext(options);
        }
        return this._defaultContext.newPage();
    }

    pages(): Page[] {
        return this._contexts.flatMap(c => c.pages());
    }

    async close(): Promise<void> {
        const contexts = [...this._contexts];
        for (const ctx of contexts) {
            try { await ctx.close(); } catch {}
        }
        this._contexts = [];
        this._defaultContext = null;
        this.proxy.close();
    }

    contexts(): BrowserContext[] {
        return [...this._contexts];
    }
}
