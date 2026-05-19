/* global sendEvent */

function dialogForwarder() {
    window.__hhDialogDefaults = window.__hhDialogDefaults || { confirm: true, prompt: '' };
    (function() {
        window.alert = function(msg) {
            sendEvent('dialog', { type: 'alert', message: String(msg == null ? '' : msg), defaultValue: '' });
        };
        var origConfirm = window.confirm;
        window.confirm = function(msg) {
            var result = window.__hhDialogDefaults.confirm !== false;
            sendEvent('dialog', { type: 'confirm', message: String(msg == null ? '' : msg), defaultValue: '' });
            return result;
        };
        var origPrompt = window.prompt;
        window.prompt = function(msg, def) {
            var result = window.__hhDialogDefaults.prompt != null ? window.__hhDialogDefaults.prompt : (def != null ? String(def) : null);
            sendEvent('dialog', { type: 'prompt', message: String(msg == null ? '' : msg), defaultValue: def != null ? String(def) : '' });
            return result;
        };
    })();
}

const _s = dialogForwarder.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
