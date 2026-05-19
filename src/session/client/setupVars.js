/* global SESSION_ID, MESSAGING_URL */

function setupVars() {
    var _hh = window['%hammerhead%'];
    var _nm = _hh && _hh.nativeMethods;
    var NativeXHR = (_nm && _nm.XMLHttpRequest) || XMLHttpRequest;
    var nativeOpen = (_nm && _nm.xhrOpen) || XMLHttpRequest.prototype.open;
    var nativeSend = (_nm && _nm.xhrSend) || XMLHttpRequest.prototype.send;
    var nativeSetHeader = (_nm && _nm.xhrSetRequestHeader) || XMLHttpRequest.prototype.setRequestHeader;

    function sendMsg(cmd, extra, timeoutMs) {
        return new Promise(function(resolve, reject) {
            var xhr = new NativeXHR();
            nativeOpen.call(xhr, 'POST', MESSAGING_URL, true);
            nativeSetHeader.call(xhr, 'Content-Type', 'application/json;charset=utf-8');
            xhr.onload = function() {
                try { resolve(JSON.parse(xhr.responseText)); } catch(e) { resolve(null); }
            };
            xhr.onerror = function() { reject(new Error('XHR network error')); };
            xhr.ontimeout = function() { reject(new Error('XHR timeout')); };
            xhr.timeout = timeoutMs || 35000;
            nativeSend.call(xhr, JSON.stringify(Object.assign({ sessionId: SESSION_ID, cmd: cmd }, extra || {})));
        });
    }

    window.__hhBridge = sendMsg;

    function sendEvent(name, data) {
        sendMsg('bridge_event', { event: name, data: data || {} }, 3000).catch(function() {});
    }
}

const _s = setupVars.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
