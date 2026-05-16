import { Proxy } from 'testcafe-hammerhead';
import { Browser } from './browser';

export interface LaunchOptions {
    /** Proxy port for the hammerhead server (default: 1337) */
    port?: number;
    /** Cross-domain proxy port (default: 1338) */
    crossDomainPort?: number;
    /** Whether to run in development mode (verbose logging) */
    devMode?: boolean;
    /** Default navigation timeout in ms (default: 30000) */
    defaultTimeout?: number;
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

        return new Browser(proxy, port);
    }
}

export const safari = new SafariBrowserType();
