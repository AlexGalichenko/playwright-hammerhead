/* global sendEvent */

function lifecycleForwarder() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { sendEvent('domcontentloaded', {}); }, { once: true });
    } else {
        sendEvent('domcontentloaded', {});
    }
    if (document.readyState === 'complete') {
        sendEvent('load', {});
    } else {
        window.addEventListener('load', function() { sendEvent('load', {}); }, { once: true });
    }
}

const _s = lifecycleForwarder.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
