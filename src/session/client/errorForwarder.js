/* global sendEvent */

function errorForwarder() {
    window.addEventListener('error', function(e) {
        sendEvent('pageerror', { message: e.message || String(e), filename: e.filename, lineno: e.lineno, colno: e.colno });
    });
    window.addEventListener('unhandledrejection', function(e) {
        try { sendEvent('pageerror', { message: e.reason && e.reason.message ? e.reason.message : String(e.reason) }); } catch(_) {}
    });
}

const _s = errorForwarder.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
