import { Session } from 'testcafe-hammerhead';
import { randomUUID } from 'crypto';
import { Deferred } from '../utils/deferred';

export interface BridgeCommand {
    id: string;
    type: string;
    [key: string]: unknown;
}

type ServiceMsg = { sessionId?: string; cmd?: string; id?: string; result?: unknown; error?: string; event?: string; data?: unknown };

export class BridgeSession extends Session {
    private commandQueue: BridgeCommand[] = [];
    private pendingCommands = new Map<string, Deferred<unknown>>();
    private pendingPoll: Deferred<BridgeCommand | null> | null = null;
    private readyDeferred: Deferred<void> | null = null;
    private isReady = false;
    private _initScripts: string[] = [];
    private _eventListener: ((event: string, data: unknown) => void) | null = null;
    private _exposedFunctions = new Map<string, (...args: unknown[]) => unknown>();

    readonly proxyPort: number;

    constructor(proxyPort: number) {
        super([], { disablePageCaching: true });
        this.proxyPort = proxyPort;
    }

    addInitScript(script: string): void {
        this._initScripts.push(script);
    }

    setEventListener(listener: (event: string, data: unknown) => void): void {
        this._eventListener = listener;
    }

    // -------------------------------------------------------------------------
    // Browser payload script generation
    // -------------------------------------------------------------------------

    private _setupVars(sessionId: string, messagingUrl: string): string {
        return `
    var SESSION_ID = '${sessionId}';
    var MESSAGING_URL = '${messagingUrl}';
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
    }`;
    }

    private _consoleForwarder(): string {
        return `
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
    })();`;
    }

    private _errorForwarder(): string {
        return `
    window.addEventListener('error', function(e) {
        sendEvent('pageerror', { message: e.message || String(e), filename: e.filename, lineno: e.lineno, colno: e.colno });
    });
    window.addEventListener('unhandledrejection', function(e) {
        try { sendEvent('pageerror', { message: e.reason && e.reason.message ? e.reason.message : String(e.reason) }); } catch(_) {}
    });`;
    }

    private _dialogForwarder(): string {
        return `
    window.__hhDialogDefaults = window.__hhDialogDefaults || { confirm: true, prompt: '' };
    (function() {
        var origAlert = window.alert;
        window.alert = function(msg) {
            sendEvent('dialog', { type: 'alert', message: String(msg == null ? '' : msg), defaultValue: '' });
            return typeof origAlert === 'function' ? origAlert.call(window, msg) : undefined;
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
    })();`;
    }

    private _lifecycleForwarder(): string {
        return `
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { sendEvent('domcontentloaded', {}); }, { once: true });
    } else {
        sendEvent('domcontentloaded', {});
    }
    if (document.readyState === 'complete') {
        sendEvent('load', {});
    } else {
        window.addEventListener('load', function() { sendEvent('load', {}); }, { once: true });
    }`;
    }

    private _popupForwarder(): string {
        return `
    (function() {
        var origOpen = window.open;
        window.open = function(url, target, features) {
            sendEvent('popup', { url: url ? String(url) : '', target: target ? String(target) : '' });
            return typeof origOpen === 'function' ? origOpen.apply(window, arguments) : null;
        };
    })();`;
    }

    private _workerForwarder(): string {
        return `
    if (typeof Worker !== 'undefined') {
        (function() {
            var OrigWorker = Worker;
            function PatchedWorker(url, opts) { sendEvent('worker', { url: String(url) }); return new OrigWorker(url, opts); }
            PatchedWorker.prototype = OrigWorker.prototype;
            window.Worker = PatchedWorker;
        })();
    }`;
    }

    private _webSocketForwarder(): string {
        return `
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
    }`;
    }

    private _fileChooserForwarder(): string {
        return `
    document.addEventListener('click', function(e) {
        var t = e.target || e.srcElement;
        if (t && t.tagName === 'INPUT' && (t.type || '').toLowerCase() === 'file') {
            sendEvent('filechooser', { multiple: !!t.multiple, accept: t.accept || '' });
        }
    }, true);`;
    }

    private _frameForwarder(): string {
        return `
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
    })();`;
    }

    private _domHelperFns(): string {
        return `
    function mouseInits(el) {
        var r = el.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var m = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, screenX: cx, screenY: cy, button: 0, buttons: 1 };
        var p = Object.assign({}, m, { pointerType: 'mouse', isPrimary: true, pointerId: 1 });
        return { m: m, p: p };
    }

    function waitForSelector(selector, timeoutMs, nthOfAll) {
        timeoutMs = timeoutMs != null ? timeoutMs : 30000;
        function findEl() { return nthOfAll !== undefined ? (document.querySelectorAll(selector)[nthOfAll] || null) : document.querySelector(selector); }
        return new Promise(function(resolve, reject) {
            var el = findEl();
            if (el) { resolve(el); return; }
            var observer = new MutationObserver(function() {
                var found = findEl();
                if (found) { observer.disconnect(); clearTimeout(timer); resolve(found); }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
            var timer = setTimeout(function() {
                observer.disconnect();
                reject(new Error('Timeout ' + timeoutMs + 'ms waiting for selector: ' + selector));
            }, timeoutMs);
        });
    }

    // Returns [{el, idx}] — idx is position in the original querySelectorAll result.
    // When hasText/hasNotText are both undefined, all elements pass through.
    function applyTextFilter(els, hasText, hasNotText) {
        return els.reduce(function(acc, el, i) {
            var t = el.textContent || '';
            if (hasText !== undefined) {
                if (typeof hasText === 'string') { if (t.indexOf(hasText) === -1) return acc; }
                else { if (!new RegExp(hasText.source, hasText.flags || '').test(t)) return acc; }
            }
            if (hasNotText !== undefined) {
                if (typeof hasNotText === 'string') { if (t.indexOf(hasNotText) !== -1) return acc; }
                else { if (new RegExp(hasNotText.source, hasNotText.flags || '').test(t)) return acc; }
            }
            acc.push({ el: el, idx: i });
            return acc;
        }, []);
    }`;
    }

    private _executeCommandFn(): string {
        return `
    function executeCommand(cmd) {
        try {
            switch (cmd.type) {

                // --- Evaluate ---
                case 'evaluate':
                    return Promise.resolve().then(function() { return (function() { return eval(cmd.expression); })(); });

                // --- Single-element writes ---
                case 'click':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        var i = mouseInits(el);
                        var up = Object.assign({}, i.m, { buttons: 0 });
                        var pup = Object.assign({}, i.p, { buttons: 0 });
                        el.dispatchEvent(new PointerEvent('pointerover',  i.p));
                        el.dispatchEvent(new MouseEvent('mouseover',      i.m));
                        el.dispatchEvent(new PointerEvent('pointerenter', Object.assign({}, i.p, { bubbles: false })));
                        el.dispatchEvent(new MouseEvent('mouseenter',     Object.assign({}, i.m, { bubbles: false })));
                        el.dispatchEvent(new PointerEvent('pointermove',  i.p));
                        el.dispatchEvent(new MouseEvent('mousemove',      i.m));
                        el.dispatchEvent(new PointerEvent('pointerdown',  i.p));
                        el.dispatchEvent(new MouseEvent('mousedown',      i.m));
                        el.focus();
                        el.dispatchEvent(new PointerEvent('pointerup',    pup));
                        el.dispatchEvent(new MouseEvent('mouseup',        up));
                        el.dispatchEvent(new MouseEvent('click',          Object.assign({}, up, { detail: 1 })));
                        return null;
                    });
                case 'dblclick':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        var i = mouseInits(el);
                        var up = Object.assign({}, i.m, { buttons: 0 });
                        var pup = Object.assign({}, i.p, { buttons: 0 });
                        el.dispatchEvent(new PointerEvent('pointerover',  i.p));
                        el.dispatchEvent(new MouseEvent('mouseover',      i.m));
                        el.dispatchEvent(new PointerEvent('pointerenter', Object.assign({}, i.p, { bubbles: false })));
                        el.dispatchEvent(new MouseEvent('mouseenter',     Object.assign({}, i.m, { bubbles: false })));
                        el.dispatchEvent(new PointerEvent('pointermove',  i.p));
                        el.dispatchEvent(new MouseEvent('mousemove',      i.m));
                        // first click
                        el.dispatchEvent(new PointerEvent('pointerdown',  i.p));
                        el.dispatchEvent(new MouseEvent('mousedown',      i.m));
                        el.focus();
                        el.dispatchEvent(new PointerEvent('pointerup',    pup));
                        el.dispatchEvent(new MouseEvent('mouseup',        up));
                        el.dispatchEvent(new MouseEvent('click',          Object.assign({}, up, { detail: 1 })));
                        // second click
                        el.dispatchEvent(new PointerEvent('pointerdown',  i.p));
                        el.dispatchEvent(new MouseEvent('mousedown',      i.m));
                        el.dispatchEvent(new PointerEvent('pointerup',    pup));
                        el.dispatchEvent(new MouseEvent('mouseup',        up));
                        el.dispatchEvent(new MouseEvent('click',          Object.assign({}, up, { detail: 2 })));
                        el.dispatchEvent(new MouseEvent('dblclick',       Object.assign({}, up, { detail: 2 })));
                        return null;
                    });
                case 'fill':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        el.focus();
                        if ('value' in el) {
                            var nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
                            if (nativeSetter && nativeSetter.set) { nativeSetter.set.call(el, cmd.value); }
                            else { el.value = cmd.value; }
                        }
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return null;
                    });
                case 'clear':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        el.focus();
                        if ('value' in el) {
                            var nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
                            if (nativeSetter && nativeSetter.set) { nativeSetter.set.call(el, ''); }
                            else { el.value = ''; }
                        }
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return null;
                    });
                case 'type':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        el.focus();
                        var text = cmd.text;
                        var nativeSetter = 'value' in el ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value') : null;
                        for (var i = 0; i < text.length; i++) {
                            var ch = text[i];
                            el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
                            el.dispatchEvent(new KeyboardEvent('keypress', { key: ch, bubbles: true, cancelable: true }));
                            if ('value' in el) {
                                var next = el.value + ch;
                                if (nativeSetter && nativeSetter.set) { nativeSetter.set.call(el, next); }
                                else { el.value = next; }
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true, cancelable: true }));
                        }
                        return null;
                    });
                case 'press':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        el.focus();
                        var init = { key: cmd.key, code: cmd.code || cmd.key, bubbles: true, cancelable: true };
                        el.dispatchEvent(new KeyboardEvent('keydown', init));
                        el.dispatchEvent(new KeyboardEvent('keypress', init));
                        el.dispatchEvent(new KeyboardEvent('keyup', init));
                        return null;
                    });
                case 'hover':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        var i = mouseInits(el);
                        var nm = Object.assign({}, i.m, { buttons: 0 });
                        var np = Object.assign({}, i.p, { buttons: 0 });
                        el.dispatchEvent(new PointerEvent('pointerover',  np));
                        el.dispatchEvent(new MouseEvent('mouseover',      nm));
                        el.dispatchEvent(new PointerEvent('pointerenter', Object.assign({}, np, { bubbles: false })));
                        el.dispatchEvent(new MouseEvent('mouseenter',     Object.assign({}, nm, { bubbles: false })));
                        el.dispatchEvent(new PointerEvent('pointermove',  np));
                        el.dispatchEvent(new MouseEvent('mousemove',      nm));
                        return null;
                    });
                case 'focus':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) { el.focus(); return null; });
                case 'blur':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) { el.blur(); return null; });
                case 'check':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        if (!el.checked) el.click(); return null;
                    });
                case 'uncheck':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        if (el.checked) el.click(); return null;
                    });
                case 'setChecked':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        if (!!el.checked !== !!cmd.checked) el.click(); return null;
                    });
                case 'selectOption':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        var values = Array.isArray(cmd.values) ? cmd.values : [cmd.values];
                        var selected = [];
                        Array.from(el.options).forEach(function(opt) {
                            opt.selected = values.indexOf(opt.value) !== -1 || values.indexOf(opt.text) !== -1;
                            if (opt.selected) selected.push(opt.value);
                        });
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return selected;
                    });
                case 'scrollIntoView':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return null;
                    });
                case 'dispatchEvent':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        var init = Object.assign({ bubbles: true, cancelable: true }, cmd.eventInit || {});
                        el.dispatchEvent(new CustomEvent(cmd.eventType, init)); return null;
                    });

                // --- Single-element reads ---
                case 'textContent':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) { return el.textContent; });
                case 'innerText':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) { return el.innerText; });
                case 'innerHTML':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) { return el.innerHTML; });
                case 'inputValue':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) { return el.value !== undefined ? el.value : null; });
                case 'getAttribute':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) { return el.getAttribute(cmd.name); });
                case 'boundingBox':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        var r = el.getBoundingClientRect();
                        return r.width === 0 && r.height === 0 ? null : { x: r.left, y: r.top, width: r.width, height: r.height };
                    });
                case 'locatorEvaluate':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function(el) {
                        return (new Function('element', 'args', 'return (' + cmd.fn + ')(element, args)'))(el, cmd.args);
                    });

                // --- State queries ---
                case 'isVisible':
                    return Promise.resolve().then(function() {
                        var el = cmd.nthOfAll !== undefined ? document.querySelectorAll(cmd.selector)[cmd.nthOfAll] : document.querySelector(cmd.selector);
                        if (!el) return false;
                        var rect = el.getBoundingClientRect(), style = window.getComputedStyle(el);
                        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
                    });
                case 'isEnabled':
                    return Promise.resolve().then(function() {
                        var el = cmd.nthOfAll !== undefined ? document.querySelectorAll(cmd.selector)[cmd.nthOfAll] : document.querySelector(cmd.selector);
                        return el ? !el.disabled : false;
                    });
                case 'isChecked':
                    return Promise.resolve().then(function() {
                        var el = cmd.nthOfAll !== undefined ? document.querySelectorAll(cmd.selector)[cmd.nthOfAll] : document.querySelector(cmd.selector);
                        return el ? !!el.checked : false;
                    });
                case 'isEditable':
                    return Promise.resolve().then(function() {
                        var el = cmd.nthOfAll !== undefined ? document.querySelectorAll(cmd.selector)[cmd.nthOfAll] : document.querySelector(cmd.selector);
                        if (!el) return false;
                        return !el.disabled && !el.readOnly;
                    });

                // --- Page info / navigation ---
                case 'title':    return Promise.resolve(document.title);
                case 'url':      return Promise.resolve(location.href);
                case 'content':  return Promise.resolve(document.documentElement.outerHTML);
                case 'count':    return Promise.resolve(document.querySelectorAll(cmd.selector).length);
                case 'waitForSelector':
                    return waitForSelector(cmd.selector, cmd.timeout, cmd.nthOfAll).then(function() { return null; });
                case 'scrollTo':
                    return Promise.resolve().then(function() { window.scrollTo(cmd.x || 0, cmd.y || 0); return null; });

                // --- Global keyboard / mouse ---
                case 'keyPress':
                    return Promise.resolve().then(function() {
                        var target = document.activeElement || document.body;
                        var init = { key: cmd.key, code: cmd.code || cmd.key, bubbles: true, cancelable: true };
                        target.dispatchEvent(new KeyboardEvent('keydown', init));
                        target.dispatchEvent(new KeyboardEvent('keypress', init));
                        target.dispatchEvent(new KeyboardEvent('keyup', init));
                        return null;
                    });
                case 'mouseClick':
                    return Promise.resolve().then(function() {
                        var el = document.elementFromPoint(cmd.x, cmd.y);
                        if (!el) return null;
                        var cx = cmd.x, cy = cmd.y;
                        var m = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, screenX: cx, screenY: cy, button: 0, buttons: 1 };
                        var p = Object.assign({}, m, { pointerType: 'mouse', isPrimary: true, pointerId: 1 });
                        var up = Object.assign({}, m, { buttons: 0 });
                        var pup = Object.assign({}, p, { buttons: 0 });
                        el.dispatchEvent(new PointerEvent('pointerdown', p));
                        el.dispatchEvent(new MouseEvent('mousedown',     m));
                        el.focus();
                        el.dispatchEvent(new PointerEvent('pointerup',   pup));
                        el.dispatchEvent(new MouseEvent('mouseup',       up));
                        el.dispatchEvent(new MouseEvent('click',         Object.assign({}, up, { detail: 1 })));
                        return null;
                    });

                // --- Multi-element reads ---
                case 'allTextContents':
                    return Promise.resolve().then(function() {
                        return applyTextFilter(Array.from(document.querySelectorAll(cmd.selector)), cmd.hasText, cmd.hasNotText)
                            .map(function(x) { return x.el.textContent || ''; });
                    });
                case 'allInnerTexts':
                    return Promise.resolve().then(function() {
                        return applyTextFilter(Array.from(document.querySelectorAll(cmd.selector)), cmd.hasText, cmd.hasNotText)
                            .map(function(x) { return x.el.innerText || ''; });
                    });
                case 'evaluateAll':
                    return Promise.resolve().then(function() {
                        var els = applyTextFilter(Array.from(document.querySelectorAll(cmd.selector)), cmd.hasText, cmd.hasNotText)
                            .map(function(x) { return x.el; });
                        return (new Function('elements', 'args', 'return (' + cmd.fn + ')(elements, args)'))(els, cmd.args);
                    });
                case 'filterIndices':
                    return Promise.resolve().then(function() {
                        return applyTextFilter(Array.from(document.querySelectorAll(cmd.selector)), cmd.hasText, cmd.hasNotText)
                            .filter(function(x) {
                                if (cmd.hasSelector && !x.el.querySelector(cmd.hasSelector)) return false;
                                if (cmd.hasNotSelector && x.el.querySelector(cmd.hasNotSelector)) return false;
                                return true;
                            })
                            .map(function(x) { return x.idx; });
                    });

                // --- Drag ---
                case 'dragTo':
                    return Promise.resolve().then(function() {
                        var src = cmd.srcNth !== undefined ? document.querySelectorAll(cmd.srcSelector)[cmd.srcNth] : document.querySelector(cmd.srcSelector);
                        var tgt = cmd.tgtNth !== undefined ? document.querySelectorAll(cmd.tgtSelector)[cmd.tgtNth] : document.querySelector(cmd.tgtSelector);
                        if (!src) throw new Error('Drag source not found: ' + cmd.srcSelector);
                        if (!tgt) throw new Error('Drag target not found: ' + cmd.tgtSelector);
                        var sr = src.getBoundingClientRect(), tr = tgt.getBoundingClientRect();
                        var sx = sr.left + sr.width / 2, sy = sr.top + sr.height / 2;
                        var tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
                        var dt = new DataTransfer();
                        src.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: sx, clientY: sy }));
                        src.dispatchEvent(new MouseEvent('mousedown',  { bubbles: true, cancelable: true, clientX: sx, clientY: sy }));
                        src.dispatchEvent(new DragEvent('dragstart',   { bubbles: true, cancelable: true, dataTransfer: dt, clientX: sx, clientY: sy }));
                        tgt.dispatchEvent(new DragEvent('dragenter',   { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tx, clientY: ty }));
                        tgt.dispatchEvent(new DragEvent('dragover',    { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tx, clientY: ty }));
                        document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: tx, clientY: ty }));
                        document.dispatchEvent(new MouseEvent('mousemove',     { bubbles: true, cancelable: true, clientX: tx, clientY: ty }));
                        tgt.dispatchEvent(new DragEvent('drop',        { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tx, clientY: ty }));
                        src.dispatchEvent(new DragEvent('dragend',     { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tx, clientY: ty }));
                        tgt.dispatchEvent(new PointerEvent('pointerup',{ bubbles: true, cancelable: true, clientX: tx, clientY: ty }));
                        tgt.dispatchEvent(new MouseEvent('mouseup',    { bubbles: true, cancelable: true, clientX: tx, clientY: ty }));
                        return null;
                    });

                default:
                    return Promise.reject(new Error('Unknown command type: ' + cmd.type));
            }
        } catch(e) {
            return Promise.reject(e);
        }
    }`;
    }

    private _pollFn(): string {
        return `
    function signalReady() {
        sendMsg('bridge_ready', {}, 5000).catch(function() {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', signalReady);
    } else {
        signalReady();
    }

    function poll() {
        sendMsg('bridge_getCommand', {}, 35000).then(function(cmd) {
            if (cmd && cmd.type) {
                executeCommand(cmd)
                    .then(function(result) { return sendMsg('bridge_commandResult', { id: cmd.id, result: result }, 5000); })
                    .catch(function(err) { return sendMsg('bridge_commandResult', { id: cmd.id, error: err.message || String(err) }, 5000); })
                    .then(function() { poll(); })
                    .catch(function() { setTimeout(poll, 500); });
            } else {
                poll();
            }
        }).catch(function() { setTimeout(poll, 500); });
    }

    poll();`;
    }

    async getPayloadScript(): Promise<string> {
        const sessionId = this.id;
        const messagingUrl = `http://localhost:${this.proxyPort}/messaging`;
        const initBlock = this._initScripts.length > 0
            ? this._initScripts.map(s => `try { (function(){ ${s} })(); } catch(e) { console.error('[initScript]', e); }`).join('\n') + '\n'
            : '';

        return [
            initBlock,
            '(function() {',
            this._setupVars(sessionId, messagingUrl),
            this._consoleForwarder(),
            this._errorForwarder(),
            this._dialogForwarder(),
            this._lifecycleForwarder(),
            this._popupForwarder(),
            this._workerForwarder(),
            this._webSocketForwarder(),
            this._fileChooserForwarder(),
            this._frameForwarder(),
            this._domHelperFns(),
            this._executeCommandFn(),
            this._pollFn(),
            '})();',
        ].join('\n');
    }

    // -------------------------------------------------------------------------
    // Session overrides
    // -------------------------------------------------------------------------

    async getIframePayloadScript(_iframeWithoutSrc: boolean): Promise<string> {
        return '';
    }

    handleFileDownload(): void {
        if (this._eventListener) this._eventListener('download', { url: '', suggestedFilename: '' });
    }

    getAuthCredentials(): null {
        return null;
    }

    handleAttachment(_opts: { isOpenedInNewWindow: boolean }): void {}

    handlePageError(_ctx: unknown, _err: Error): void {}

    // -------------------------------------------------------------------------
    // Service message handlers (called by hammerhead via this[msg.cmd])
    // -------------------------------------------------------------------------

    registerExposedFunction(name: string, fn: (...args: unknown[]) => unknown): void {
        this._exposedFunctions.set(name, fn);
    }

    async bridge_expose_call(msg: ServiceMsg): Promise<{ value?: unknown; error?: string }> {
        const m = msg as Record<string, unknown>;
        const name = (m.expName as string | undefined) ?? '';
        const args = (m.args as unknown[]) ?? [];
        const fn = this._exposedFunctions.get(name);
        if (!fn) return { error: `No exposed function: ${name}` };
        try {
            return { value: await fn(...args) };
        } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
        }
    }

    async bridge_event(msg: ServiceMsg): Promise<null> {
        if (msg.event && this._eventListener) this._eventListener(msg.event, msg.data ?? {});
        return null;
    }

    async bridge_ready(_msg: ServiceMsg): Promise<null> {
        this.isReady = true;
        if (this.readyDeferred) {
            this.readyDeferred.resolve();
            this.readyDeferred = null;
        }
        return null;
    }

    async bridge_getCommand(_msg: ServiceMsg): Promise<BridgeCommand | null> {
        if (this.commandQueue.length > 0) {
            return this.commandQueue.shift()!;
        }
        this.pendingPoll = new Deferred<BridgeCommand | null>();
        const pollDeferred = this.pendingPoll;
        const timeout = setTimeout(() => {
            if (this.pendingPoll === pollDeferred) {
                this.pendingPoll = null;
            }
            pollDeferred.resolve(null);
        }, 30000);
        const result = await pollDeferred.promise;
        clearTimeout(timeout);
        return result;
    }

    async bridge_commandResult(msg: ServiceMsg): Promise<null> {
        if (!msg.id) return null;
        const deferred = this.pendingCommands.get(msg.id);
        if (deferred) {
            this.pendingCommands.delete(msg.id);
            if (msg.error) deferred.reject(new Error(msg.error));
            else deferred.resolve(msg.result);
        }
        return null;
    }

    async sendCommand<T>(command: Omit<BridgeCommand, 'id'>): Promise<T> {
        const id = randomUUID();
        const fullCommand = Object.assign({ id }, command) as BridgeCommand;
        const deferred = new Deferred<T>();
        this.pendingCommands.set(id, deferred as unknown as Deferred<unknown>);

        if (this.pendingPoll) {
            const poll = this.pendingPoll;
            this.pendingPoll = null;
            poll.resolve(fullCommand);
        } else {
            this.commandQueue.push(fullCommand);
        }

        return deferred.promise;
    }

    waitForReady(timeout = 30000): Promise<void> {
        if (this.isReady) return Promise.resolve();

        this.readyDeferred = new Deferred<void>();
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.readyDeferred = null;
                reject(new Error(`Timeout ${timeout}ms waiting for page bridge to connect`));
            }, timeout);
            this.readyDeferred!.promise.then(() => { clearTimeout(timer); resolve(); }).catch(reject);
        });
    }
}
