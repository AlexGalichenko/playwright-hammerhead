/* global sendEvent */

function workerForwarder() {
    if (typeof Worker !== 'undefined') {
        (function() {
            var OrigWorker = Worker;
            function PatchedWorker(url, opts) { sendEvent('worker', { url: String(url) }); return new OrigWorker(url, opts); }
            PatchedWorker.prototype = OrigWorker.prototype;
            window.Worker = PatchedWorker;
        })();
    }
}

const _s = workerForwarder.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
