import { Proxy } from 'testcafe-hammerhead';
import { Browser } from './browser';

export interface UseOptions {
    /** Default timeout for page actions and locator operations (default: 30000) */
    actionTimeout?: number;
    /** Default timeout for navigation methods like goto/reload/goBack (default: same as actionTimeout) */
    navigationTimeout?: number;
    /** Default timeout for expect() assertions (default: 5000) */
    expectTimeout?: number;
}

export interface LaunchOptions {
    /** Proxy port for the hammerhead server (default: 1337) */
    port?: number;
    /** Cross-domain proxy port (default: 1338) */
    crossDomainPort?: number;
    /** Whether to run in development mode (verbose logging) */
    devMode?: boolean;
    /** Timeout defaults applied to every page created by this browser */
    use?: UseOptions;
}

export class SafariBrowserType {
    readonly name = 'safari';

    async launch(options: LaunchOptions = {}): Promise<Browser> {
        const port = options.port ?? 1337;
        const crossDomainPort = options.crossDomainPort ?? 1338;

        const proxy = new Proxy({});
        proxy.start({
            hostname: 'localhost',
            port1: port,
            port2: crossDomainPort,
            developmentMode: options.devMode ?? false,
        });

        return new Browser(proxy, port, options.use);
    }
}

export const safari = new SafariBrowserType();
