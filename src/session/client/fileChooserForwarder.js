/* global sendEvent */

function fileChooserForwarder() {
    document.addEventListener('click', function(e) {
        var t = e.target || e.srcElement;
        if (t && t.tagName === 'INPUT' && (t.type || '').toLowerCase() === 'file') {
            window.__hhLastFileInput = t;
            sendEvent('filechooser', { multiple: !!t.multiple, accept: t.accept || '' });
        }
    }, true);
}

const _s = fileChooserForwarder.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
