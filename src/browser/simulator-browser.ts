import { Proxy } from 'testcafe-hammerhead';
import { BridgeSession } from '../session/bridge-session';
import { Browser } from './browser';
import { SimulatorPage } from '../page/simulator-page';
import { Page, PageConfig } from '../page/page';
import type { UseOptions } from './browser-type';

export class SimulatorBrowser extends Browser {
    constructor(
        proxy: Proxy,
        proxyPort: number,
        use: UseOptions | undefined,
        private readonly device: string
    ) {
        super(proxy, proxyPort, use);
    }

    protected _createPage(proxy: Proxy, session: BridgeSession, config: PageConfig): Page {
        return new SimulatorPage(proxy, session, config, this.device);
    }
}
