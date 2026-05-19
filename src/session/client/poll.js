/* global sendMsg, executeCommand */

function poll() {
    function signalReady() {
        sendMsg('bridge_ready', {}, 5000).catch(function() { setTimeout(signalReady, 500); });
    }

    if (document.readyState === 'complete') {
        signalReady();
    } else {
        window.addEventListener('load', signalReady, { once: true });
    }

    window.addEventListener('pageshow', function(e) {
        if (e.persisted) { signalReady(); }
    });

    function _poll() {
        sendMsg('bridge_getCommand', {}, 35000).then(function(cmd) {
            if (cmd && cmd.type) {
                executeCommand(cmd)
                    .then(function(result) { return sendMsg('bridge_commandResult', { id: cmd.id, result: result }, 5000); })
                    .catch(function(err) { return sendMsg('bridge_commandResult', { id: cmd.id, error: err.message || String(err) }, 5000); })
                    .then(function() { _poll(); })
                    .catch(function() { setTimeout(_poll, 500); });
            } else {
                _poll();
            }
        }).catch(function() { setTimeout(_poll, 500); });
    }

    _poll();
}

const _s = poll.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
