import { Proxy } from 'testcafe-hammerhead';
import { BridgeSession } from '../session/bridge-session';
import { Page, PageConfig } from './page';
import { openSimulatorSafariAtUrl, closeSimulatorSafari } from '../utils/simulator';

export class SimulatorPage extends Page {
    private readonly device: string;

    constructor(proxy: Proxy, session: BridgeSession, config: PageConfig, device: string) {
        super(proxy, session, config);
        this.device = device;
    }

    protected _openUrl(proxiedUrl: string): void {
        openSimulatorSafariAtUrl(proxiedUrl, this.device);
    }

    protected _closeBrowser(): void {
        closeSimulatorSafari(this.device);
    }
}
