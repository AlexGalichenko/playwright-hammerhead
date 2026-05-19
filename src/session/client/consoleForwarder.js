/* global sendEvent */

function consoleForwarder() {
    (function() {
        var methods = ['log', 'warn', 'error', 'info', 'debug'];
        methods.forEach(function(method) {
            var orig = console[method].bind(console);
            console[method] = function() {
                var args = Array.prototype.slice.call(arguments).map(function(a) {
                    try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(_) { return String(a); }
                });
                sendEvent('console', { type: method, args: args });
                return orig.apply(console, arguments);
            };
        });
    })();
}

const _s = consoleForwarder.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
