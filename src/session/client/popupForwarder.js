/* global sendEvent, MESSAGING_URL */

function popupForwarder() {
    (function() {
        window.open = function(url, target) {
            var rawUrl = url ? String(url) : '';
            var destUrl = rawUrl;
            try {
                var _hh = window['%hammerhead%'];
                var urlUtils = _hh && _hh.utils && _hh.utils.url;
                // Try parseProxyUrl first — works for absolute dest URLs
                var parsed = urlUtils && urlUtils.parseProxyUrl && urlUtils.parseProxyUrl(rawUrl);
                if (parsed && parsed.destUrl) {
                    destUrl = parsed.destUrl;
                } else {
                    // parseProxyUrl returns null when the dest part is a relative path
                    // (e.g. http://proxy:port/session/page.html). Strip the proxy prefix manually.
                    var proxyPrefix = MESSAGING_URL.replace(/\/messaging$/, '') + '/';
                    if (rawUrl.indexOf(proxyPrefix) === 0) {
                        var rest = rawUrl.slice(proxyPrefix.length); // "sessionId/page.html"
                        var slash = rest.indexOf('/');
                        if (slash !== -1) destUrl = rest.slice(slash + 1); // "page.html"
                    }
                }
                // Resolve relative dest URLs against the current page's destination URL
                if (destUrl && !/^https?:/.test(destUrl)) {
                    var base = _hh && _hh.utils && _hh.utils.destLocation && _hh.utils.destLocation.get();
                    if (base) try { destUrl = new URL(destUrl, base).href; } catch (_e2) {}
                }
            } catch (_e) {}
            sendEvent('popup', { url: destUrl, target: target ? String(target) : '' });
            return null;
        };
    })();
}

const _s = popupForwarder.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
