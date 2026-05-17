import { Proxy } from 'testcafe-hammerhead';
import { Browser } from './browser';
import { SimulatorBrowser } from './simulator-browser';

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
    /**
     * iOS Simulator device to use instead of macOS Safari.
     * Accepts 'booted', a simulator UDID, or a device name (e.g. 'iPhone 16 Pro').
     * When set, pages will open in iOS Simulator Safari via `xcrun simctl openurl`.
     */
    device?: string;
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

        // Suppress unhandled rejections that hammerhead emits when Safari navigates
        // away and aborts in-flight connections to the proxy (bfcache, history.back/forward).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = proxy as any;
        const origOnServiceMsg = p._onServiceMessage.bind(proxy);
        p._onServiceMessage = async function(req: unknown, res: unknown, serverInfo: unknown): Promise<void> {
            try {
                await origOnServiceMsg(req, res, serverInfo);
            } catch (err: unknown) {
                const e = err as { code?: string; message?: string };
                const isSocketError = e.code === 'ECONNRESET' || e.code === 'EPIPE' ||
                    e.code === 'ERR_HTTP_HEADERS_SENT' || e.message === 'aborted';
                if (!isSocketError) throw err;
            }
        };

        if (options.device !== undefined) {
            return new SimulatorBrowser(proxy, port, options.use, options.device);
        }
        return new Browser(proxy, port, options.use);
    }
}

export const safari = new SafariBrowserType();
