import { execSync } from 'child_process';

function runAppleScript(script: string): string {
    return execSync(`osascript << 'APPLESCRIPT'\n${script}\nAPPLESCRIPT`).toString().trim();
}

function escapeAppleScriptString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Opens a new Safari window at the given URL.
 * `make new document` always creates a new window, regardless of Safari tab preferences.
 */
export function openSafariAtUrl(url: string): void {
    const escaped = escapeAppleScriptString(url);
    runAppleScript(`
tell application "Safari"
    activate
    make new document with properties {URL:"${escaped}"}
end tell`);
}

/**
 * Closes the Safari window/tab whose current URL contains `urlFragment`.
 * Matching by URL fragment (e.g. the hammerhead session ID) is robust against
 * window index shifts caused by other windows opening or closing during a run.
 */
export function closeSafariWindowByUrlFragment(urlFragment: string): void {
    const escaped = escapeAppleScriptString(urlFragment);
    try {
        runAppleScript(`
tell application "Safari"
    repeat with w in windows
        try
            if URL of current tab of w contains "${escaped}" then
                close w
                return
            end if
        end try
    end repeat
end tell`);
    } catch {
        // ignore — window may already be closed or Safari not running
    }
}
