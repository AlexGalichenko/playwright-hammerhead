/* global sendEvent */

function webSocketForwarder() {
    if (typeof WebSocket !== 'undefined') {
        (function() {
            var OrigWS = WebSocket;
            function PatchedWS(url, protocols) {
                sendEvent('websocket', { url: String(url) });
                return protocols != null ? new OrigWS(url, protocols) : new OrigWS(url);
            }
            PatchedWS.prototype = OrigWS.prototype;
            PatchedWS.CONNECTING = OrigWS.CONNECTING;
            PatchedWS.OPEN = OrigWS.OPEN;
            PatchedWS.CLOSING = OrigWS.CLOSING;
            PatchedWS.CLOSED = OrigWS.CLOSED;
            window.WebSocket = PatchedWS;
        })();
    }
}

const _s = webSocketForwarder.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
