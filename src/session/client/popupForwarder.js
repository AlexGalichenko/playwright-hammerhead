/* global sendEvent */

function popupForwarder() {
    (function() {
        window.open = function(url, target) {
            sendEvent('popup', { url: url ? String(url) : '', target: target ? String(target) : '' });
            return null;
        };
    })();
}

const _s = popupForwarder.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
