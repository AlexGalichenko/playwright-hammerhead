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
            window.__hhLastFileInput = t;
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

    // Execute a selector-step chain and return the matched elements.
    // Each step narrows/transforms the current element set:
    //   css    — querySelectorAll inside every context element (deduped, document-order)
    //   nth    — pick one by index (negative counts from end)
    //   filter — narrow by text content and/or child-locator presence
    //   and    — intersect with an independently-resolved locator
    //   or     — union with an independently-resolved locator
    function resolveSteps(steps, initContexts) {
        var contexts = initContexts || [document.documentElement];
        var elements = [];
        for (var si = 0; si < steps.length; si++) {
            var step = steps[si];
            if (step.kind === 'css') {
                var seen = [];
                elements = [];
                for (var ci = 0; ci < contexts.length; ci++) {
                    var found = contexts[ci].querySelectorAll(step.sel);
                    for (var fi = 0; fi < found.length; fi++) {
                        if (seen.indexOf(found[fi]) === -1) { seen.push(found[fi]); elements.push(found[fi]); }
                    }
                }
                contexts = elements;
            } else if (step.kind === 'nth') {
                var idx = step.index < 0 ? elements.length + step.index : step.index;
                elements = (idx >= 0 && idx < elements.length) ? [elements[idx]] : [];
                contexts = elements;
            } else if (step.kind === 'filter') {
                var fstep = step;
                elements = elements.filter(function(el) {
                    var t = el.textContent || '';
                    if (fstep.hasText !== undefined) {
                        if (typeof fstep.hasText === 'string') { if (t.indexOf(fstep.hasText) === -1) return false; }
                        else { if (!new RegExp(fstep.hasText.source, fstep.hasText.flags || '').test(t)) return false; }
                    }
                    if (fstep.hasNotText !== undefined) {
                        if (typeof fstep.hasNotText === 'string') { if (t.indexOf(fstep.hasNotText) !== -1) return false; }
                        else { if (new RegExp(fstep.hasNotText.source, fstep.hasNotText.flags || '').test(t)) return false; }
                    }
                    if (fstep.hasSteps    && fstep.hasSteps.length    && resolveSteps(fstep.hasSteps,    [el]).length === 0) return false;
                    if (fstep.hasNotSteps && fstep.hasNotSteps.length  && resolveSteps(fstep.hasNotSteps, [el]).length  > 0) return false;
                    return true;
                });
                contexts = elements;
            } else if (step.kind === 'and') {
                var andEls = resolveSteps(step.steps);
                elements = elements.filter(function(el) { return andEls.indexOf(el) !== -1; });
                contexts = elements;
            } else if (step.kind === 'or') {
                var orEls = resolveSteps(step.steps);
                for (var oi = 0; oi < orEls.length; oi++) {
                    if (elements.indexOf(orEls[oi]) === -1) elements.push(orEls[oi]);
                }
                contexts = elements;
            } else if (step.kind === 'iframe') {
                var iSeen = [];
                var iframes = [];
                for (var ici = 0; ici < contexts.length; ici++) {
                    var iFound = contexts[ici].querySelectorAll(step.sel);
                    for (var ifi = 0; ifi < iFound.length; ifi++) {
                        if (iSeen.indexOf(iFound[ifi]) === -1) { iSeen.push(iFound[ifi]); iframes.push(iFound[ifi]); }
                    }
                }
                if (step.index !== undefined) {
                    var ni = step.index < 0 ? iframes.length + step.index : step.index;
                    iframes = (ni >= 0 && ni < iframes.length) ? [iframes[ni]] : [];
                }
                elements = iframes;
                contexts = iframes.map(function(f) {
                    try { return f.contentDocument ? f.contentDocument.documentElement : null; }
                    catch(_) { return null; }
                }).filter(function(el) { return el !== null; });
            }
        }
        return elements;
    }

    function waitForElements(steps, timeoutMs) {
        timeoutMs = timeoutMs != null ? timeoutMs : 30000;
        function findEls() { return resolveSteps(steps); }
        return new Promise(function(resolve, reject) {
            var els = findEls();
            if (els.length > 0) { resolve(els); return; }
            var observer = new MutationObserver(function() {
                var found = findEls();
                if (found.length > 0) { observer.disconnect(); clearTimeout(timer); resolve(found); }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
            var timer = setTimeout(function() {
                observer.disconnect();
                reject(new Error('Timeout ' + timeoutMs + 'ms waiting for elements'));
            }, timeoutMs);
        });
    }`;
    }

    private _ariaHelperFns(): string {
        return `
    function _ariaRole(el) {
        if (!el || el.nodeType !== 1) return null;
        var explicit = el.getAttribute('role');
        if (explicit) {
            var r = explicit.trim().split(/\s+/)[0].toLowerCase();
            if (r === 'none' || r === 'presentation') return null;
            return r;
        }
        var tag = el.tagName.toLowerCase();
        var type = (el.getAttribute('type') || '').toLowerCase();
        switch (tag) {
            case 'a':        return el.hasAttribute('href') ? 'link' : null;
            case 'area':     return el.hasAttribute('href') ? 'link' : null;
            case 'button':   return 'button';
            case 'datalist': return 'listbox';
            case 'details':  return 'group';
            case 'dialog':   return 'dialog';
            case 'fieldset': return 'group';
            case 'figure':   return 'figure';
            case 'footer':   return 'contentinfo';
            case 'form':     return 'form';
            case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
            case 'header':   return 'banner';
            case 'hr':       return 'separator';
            case 'img':      return el.getAttribute('alt') !== null ? 'img' : null;
            case 'input':
                if (type === 'button' || type === 'image' || type === 'reset' || type === 'submit') return 'button';
                if (type === 'checkbox')  return 'checkbox';
                if (type === 'radio')     return 'radio';
                if (type === 'range')     return 'slider';
                if (type === 'number')    return 'spinbutton';
                if (type === 'search')    return 'searchbox';
                if (type === 'hidden')    return null;
                return 'textbox';
            case 'li':       return 'listitem';
            case 'main':     return 'main';
            case 'menu':     return 'list';
            case 'meter':    return 'meter';
            case 'nav':      return 'navigation';
            case 'ol':       return 'list';
            case 'option':   return 'option';
            case 'output':   return 'status';
            case 'progress': return 'progressbar';
            case 'section':
                return (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) ? 'region' : null;
            case 'select':   return (el.multiple || el.size > 1) ? 'listbox' : 'combobox';
            case 'summary':  return 'button';
            case 'table':    return 'table';
            case 'tbody': case 'thead': case 'tfoot': return 'rowgroup';
            case 'td':       return 'cell';
            case 'textarea': return 'textbox';
            case 'th':
                return (el.getAttribute('scope') === 'row' || el.getAttribute('scope') === 'rowgroup')
                    ? 'rowheader' : 'columnheader';
            case 'tr':       return 'row';
            case 'ul':       return 'list';
            case 'body':     return 'document';
            default:         return null;
        }
    }

    function _ariaName(el, role) {
        var lbl = el.getAttribute('aria-label');
        if (lbl && lbl.trim()) return lbl.trim();

        var lby = el.getAttribute('aria-labelledby');
        if (lby) {
            var parts = lby.trim().split(/\s+/).map(function(id) {
                var ref = document.getElementById(id);
                return ref ? (ref.textContent || '').replace(/\s+/g, ' ').trim() : '';
            }).filter(Boolean);
            if (parts.length) return parts.join(' ');
        }

        var tag = el.tagName.toLowerCase();
        var type = (el.getAttribute('type') || '').toLowerCase();

        if (tag === 'img') return (el.getAttribute('alt') || '').trim();

        if (tag === 'input' && (type === 'button' || type === 'submit' || type === 'reset')) {
            var v = el.getAttribute('value');
            if (v) return v.trim();
            if (type === 'submit') return 'Submit';
            if (type === 'reset')  return 'Reset';
            return '';
        }

        if (tag === 'input' || tag === 'select' || tag === 'textarea') {
            if (el.id) {
                var lf = document.querySelector('label[for="' + el.id + '"]');
                if (lf) return (lf.textContent || '').replace(/\s+/g, ' ').trim();
            }
            var pl = el.closest && el.closest('label');
            if (pl) {
                var cl = pl.cloneNode(true);
                cl.querySelectorAll('input,select,textarea').forEach(function(i) { i.parentNode && i.parentNode.removeChild(i); });
                return (cl.textContent || '').replace(/\s+/g, ' ').trim();
            }
            var ph = el.getAttribute('placeholder');
            if (ph) return ph.trim();
            return '';
        }

        var nfc = { button:1, cell:1, checkbox:1, columnheader:1, gridcell:1, heading:1,
                    link:1, menuitem:1, menuitemcheckbox:1, menuitemradio:1, option:1,
                    radio:1, rowheader:1, 'switch':1, tab:1, treeitem:1 };
        if (nfc[role]) return (el.textContent || '').replace(/\s+/g, ' ').trim();

        var ti = el.getAttribute('title');
        if (ti) return ti.trim();
        return '';
    }

    function _ariaAttrs(el, role) {
        var a = [];
        var tag = el.tagName.toLowerCase();
        var type = (el.getAttribute('type') || '').toLowerCase();

        if (role === 'heading') {
            var lvl = el.getAttribute('aria-level');
            if (lvl) { a.push('level=' + parseInt(lvl, 10)); }
            else { var hm = tag.match(/^h([1-6])$/); if (hm) a.push('level=' + hm[1]); }
        }

        var ac = el.getAttribute('aria-checked');
        if (ac === 'true') a.push('checked');
        else if (ac === 'mixed') a.push('indeterminate');
        else if (ac === null && (type === 'checkbox' || type === 'radio') && el.checked) a.push('checked');

        if (el.disabled || el.getAttribute('aria-disabled') === 'true') a.push('disabled');
        if (el.getAttribute('aria-selected') === 'true') a.push('selected');
        if (tag === 'option' && el.selected) a.push('selected');

        var ae = el.getAttribute('aria-expanded');
        if (ae === 'true')  a.push('expanded');
        else if (ae === 'false') a.push('collapsed');

        if (el.required || el.getAttribute('aria-required') === 'true') a.push('required');
        if (el.readOnly  || el.getAttribute('aria-readonly')  === 'true') a.push('readonly');

        if (role === 'slider' || role === 'spinbutton' || role === 'progressbar' || role === 'meter') {
            var av = el.getAttribute('aria-valuenow');
            var rv = av !== null ? av : (el.value !== undefined ? String(el.value) : '');
            if (rv !== '') a.push('value=' + rv);
        }
        return a;
    }

    function _ariaHidden(el) {
        if (!el || el.nodeType !== 1) return false;
        if (el.getAttribute('aria-hidden') === 'true') return true;
        var s = window.getComputedStyle(el);
        return s.display === 'none' || s.visibility === 'hidden';
    }

    var _ariaSkipChildren = {
        button:1, checkbox:1, cell:1, columnheader:1, heading:1, link:1, menuitem:1,
        menuitemcheckbox:1, menuitemradio:1, option:1, radio:1, rowheader:1,
        'switch':1, tab:1, treeitem:1,
        img:1, textbox:1, searchbox:1, spinbutton:1, slider:1, separator:1,
        progressbar:1, meter:1, combobox:1
    };

    function buildAriaSnapshot(node, indent) {
        if (node.nodeType === 3) {
            var t = (node.textContent || '').replace(/\s+/g, ' ').trim();
            return t ? indent + '- text: ' + t + '\\n' : '';
        }
        if (node.nodeType !== 1 || _ariaHidden(node)) return '';

        var role = _ariaRole(node);
        if (!role) {
            var pass = '';
            for (var pi = 0; pi < node.childNodes.length; pi++) pass += buildAriaSnapshot(node.childNodes[pi], indent);
            return pass;
        }

        var name  = _ariaName(node, role);
        var attrs = _ariaAttrs(node, role);
        var line  = indent + '- ' + role;
        if (name)        line += ' ' + JSON.stringify(name);
        if (attrs.length) line += ' [' + attrs.join(', ') + ']';

        if (_ariaSkipChildren[role]) return line + '\\n';

        var kids = '';
        for (var ci = 0; ci < node.childNodes.length; ci++) kids += buildAriaSnapshot(node.childNodes[ci], indent + '  ');
        if (!kids) return line + '\\n';

        // Render inline when children are pure text
        var hasElemChild = false;
        for (var ei = 0; ei < node.childNodes.length; ei++) {
            if (node.childNodes[ei].nodeType === 1 && !_ariaHidden(node.childNodes[ei])) { hasElemChild = true; break; }
        }
        if (!hasElemChild) {
            var inline = (node.textContent || '').replace(/\s+/g, ' ').trim();
            return inline ? line + ': ' + inline + '\\n' : line + '\\n';
        }

        return line + ':\\n' + kids;
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

                // --- Single-element writes (step-based) ---
                case 'click':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        var el = els[0];
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
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        var el = els[0];
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
                        el.dispatchEvent(new PointerEvent('pointerdown',  i.p));
                        el.dispatchEvent(new MouseEvent('mousedown',      i.m));
                        el.dispatchEvent(new PointerEvent('pointerup',    pup));
                        el.dispatchEvent(new MouseEvent('mouseup',        up));
                        el.dispatchEvent(new MouseEvent('click',          Object.assign({}, up, { detail: 2 })));
                        el.dispatchEvent(new MouseEvent('dblclick',       Object.assign({}, up, { detail: 2 })));
                        return null;
                    });
                case 'fill':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        var el = els[0];
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
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        var el = els[0];
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
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        var el = els[0];
                        el.focus();
                        var text = cmd.text;
                        var nativeSetter = 'value' in el ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value') : null;
                        for (var i = 0; i < text.length; i++) {
                            var ch = text[i];
                            el.dispatchEvent(new KeyboardEvent('keydown',  { key: ch, bubbles: true, cancelable: true }));
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
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        var el = els[0];
                        el.focus();
                        var init = { key: cmd.key, code: cmd.code || cmd.key, bubbles: true, cancelable: true };
                        el.dispatchEvent(new KeyboardEvent('keydown',  init));
                        el.dispatchEvent(new KeyboardEvent('keypress', init));
                        el.dispatchEvent(new KeyboardEvent('keyup',    init));
                        return null;
                    });
                case 'hover':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        var el = els[0];
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
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) { els[0].focus(); return null; });
                case 'blur':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) { els[0].blur(); return null; });
                case 'check':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        if (!els[0].checked) els[0].click(); return null;
                    });
                case 'uncheck':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        if (els[0].checked) els[0].click(); return null;
                    });
                case 'setChecked':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        if (!!els[0].checked !== !!cmd.checked) els[0].click(); return null;
                    });
                case 'selectOption':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        var el = els[0];
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
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        els[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); return null;
                    });
                case 'dispatchEvent':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        var init = Object.assign({ bubbles: true, cancelable: true }, cmd.eventInit || {});
                        els[0].dispatchEvent(new CustomEvent(cmd.eventType, init)); return null;
                    });

                // --- Single-element reads ---
                case 'textContent':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) { return els[0].textContent; });
                case 'innerText':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) { return els[0].innerText; });
                case 'innerHTML':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) { return els[0].innerHTML; });
                case 'inputValue':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) { return els[0].value !== undefined ? els[0].value : null; });
                case 'getAttribute':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) { return els[0].getAttribute(cmd.name); });
                case 'boundingBox':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        var r = els[0].getBoundingClientRect();
                        return r.width === 0 && r.height === 0 ? null : { x: r.left, y: r.top, width: r.width, height: r.height };
                    });
                case 'locatorEvaluate':
                    return waitForElements(cmd.steps, cmd.timeout).then(function(els) {
                        return (new Function('element', 'args', 'return (' + cmd.fn + ')(element, args)'))(els[0], cmd.args);
                    });

                // --- State queries (non-waiting, return false if not found) ---
                case 'isVisible':
                    return Promise.resolve().then(function() {
                        var el = resolveSteps(cmd.steps)[0];
                        if (!el) return false;
                        var rect = el.getBoundingClientRect(), style = window.getComputedStyle(el);
                        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
                    });
                case 'isEnabled':
                    return Promise.resolve().then(function() {
                        var el = resolveSteps(cmd.steps)[0];
                        return el ? !el.disabled : false;
                    });
                case 'isChecked':
                    return Promise.resolve().then(function() {
                        var el = resolveSteps(cmd.steps)[0];
                        return el ? !!el.checked : false;
                    });
                case 'isEditable':
                    return Promise.resolve().then(function() {
                        var el = resolveSteps(cmd.steps)[0];
                        if (!el) return false;
                        return !el.disabled && !el.readOnly;
                    });

                // --- Page info / navigation ---
                case 'title':   return Promise.resolve(document.title);
                case 'url':     return Promise.resolve(location.href);
                case 'content': return Promise.resolve(document.documentElement.outerHTML);
                case 'count':
                    return Promise.resolve(resolveSteps(cmd.steps).length);
                case 'waitForSelector':
                    return waitForElements(cmd.steps, cmd.timeout).then(function() { return null; });
                case 'scrollTo':
                    return Promise.resolve().then(function() { window.scrollTo(cmd.x || 0, cmd.y || 0); return null; });

                // --- Global keyboard / mouse (no steps) ---
                case 'keyPress':
                    return Promise.resolve().then(function() {
                        var target = document.activeElement || document.body;
                        var init = { key: cmd.key, code: cmd.code || cmd.key, bubbles: true, cancelable: true };
                        target.dispatchEvent(new KeyboardEvent('keydown',  init));
                        target.dispatchEvent(new KeyboardEvent('keypress', init));
                        target.dispatchEvent(new KeyboardEvent('keyup',    init));
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
                    return Promise.resolve(resolveSteps(cmd.steps).map(function(el) { return el.textContent || ''; }));
                case 'allInnerTexts':
                    return Promise.resolve(resolveSteps(cmd.steps).map(function(el) { return el.innerText || ''; }));
                case 'evaluateAll':
                    return Promise.resolve().then(function() {
                        var els = resolveSteps(cmd.steps);
                        return (new Function('elements', 'args', 'return (' + cmd.fn + ')(elements, args)'))(els, cmd.args);
                    });

                // --- Drag ---
                case 'dragTo':
                    return Promise.resolve().then(function() {
                        var src = resolveSteps(cmd.srcSteps)[0];
                        var tgt = resolveSteps(cmd.tgtSteps)[0];
                        if (!src) throw new Error('Drag source not found');
                        if (!tgt) throw new Error('Drag target not found');
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

                // --- Aria snapshot ---
                case 'ariaSnapshot':
                    return Promise.resolve().then(function() {
                        var root = (cmd.steps && cmd.steps.length) ? resolveSteps(cmd.steps)[0] : null;
                        if (!root) {
                            var bodyKids = '';
                            for (var i = 0; i < document.body.childNodes.length; i++) bodyKids += buildAriaSnapshot(document.body.childNodes[i], '  ');
                            return '- document:\\n' + bodyKids;
                        }
                        return buildAriaSnapshot(root, '');
                    });

                case 'mouseWheel':
                    return Promise.resolve().then(function() {
                        var el = document.elementFromPoint(cmd.x, cmd.y) || document.body;
                        el.dispatchEvent(new WheelEvent('wheel', {
                            bubbles: true, cancelable: true,
                            clientX: cmd.x, clientY: cmd.y,
                            deltaX: cmd.deltaX || 0, deltaY: cmd.deltaY || 0, deltaMode: 0,
                        }));
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
            this._ariaHelperFns(),
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
