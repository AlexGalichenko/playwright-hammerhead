/* global sendEvent */

function frameForwarder() {
    (function() {
        var obs = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(n) {
                    if (n.tagName === 'IFRAME') sendEvent('frameattached', { url: n.src || '', name: n.name || '' });
                });
                m.removedNodes.forEach(function(n) {
                    if (n.tagName === 'IFRAME') sendEvent('framedetached', { url: n.src || '', name: n.name || '' });
                });
            });
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        document.addEventListener('load', function(e) {
            var t = e.target;
            if (t && t.tagName === 'IFRAME') sendEvent('framenavigated', { url: t.src || '', name: t.name || '' });
        }, true);
    })();
}

const _s = frameForwarder.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
