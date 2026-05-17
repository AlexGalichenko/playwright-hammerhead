import { execSync } from 'node:child_process';

/**
 * Opens a URL in iOS Simulator Safari.
 * `device` can be 'booted', a UDID, or a simulator name (e.g. 'iPhone 16 Pro').
 */
export function openSimulatorSafariAtUrl(url: string, device = 'booted'): void {
    execSync(`xcrun simctl openurl ${JSON.stringify(device)} ${JSON.stringify(url)}`);
}

/**
 * Terminates Safari on the iOS Simulator, closing all open tabs.
 */
export function closeSimulatorSafari(device = 'booted'): void {
    try {
        execSync(`xcrun simctl terminate ${JSON.stringify(device)} com.apple.mobilesafari`);
    } catch {
        // ignore — simulator may not be running or Safari may already be closed
    }
}
