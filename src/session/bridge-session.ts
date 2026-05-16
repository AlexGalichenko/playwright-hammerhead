import { Session } from 'testcafe-hammerhead';
import { randomUUID } from 'crypto';
import { Deferred } from '../utils/deferred';

export interface BridgeCommand {
    id: string;
    type: string;
    [key: string]: unknown;
}

type ServiceMsg = { sessionId?: string; cmd?: string; id?: string; result?: unknown; error?: string };

export class BridgeSession extends Session {
    private commandQueue: BridgeCommand[] = [];
    private pendingCommands = new Map<string, Deferred<unknown>>();
    private pendingPoll: Deferred<BridgeCommand | null> | null = null;
    private readyDeferred: Deferred<void> | null = null;
    private isReady = false;
    private _initScripts: string[] = [];

    readonly proxyPort: number;

    constructor(proxyPort: number) {
        super([], { disablePageCaching: true });
        this.proxyPort = proxyPort;
    }

    addInitScript(script: string): void {
        this._initScripts.push(script);
    }

    async getPayloadScript(): Promise<string> {
        const sessionId = this.id;
        const messagingUrl = `http://localhost:${this.proxyPort}/messaging`;
        const initBlock = this._initScripts.length > 0
            ? this._initScripts.map(s => `try { (function(){ ${s} })(); } catch(e) { console.error('[initScript]', e); }`).join('\n') + '\n'
            : '';
        return `${initBlock}(function() {
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

    function waitForSelector(selector, timeoutMs) {
        timeoutMs = timeoutMs != null ? timeoutMs : 30000;
        return new Promise(function(resolve, reject) {
            var el = document.querySelector(selector);
            if (el) { resolve(el); return; }
            var observer = new MutationObserver(function() {
                var found = document.querySelector(selector);
                if (found) { observer.disconnect(); clearTimeout(timer); resolve(found); }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
            var timer = setTimeout(function() {
                observer.disconnect();
                reject(new Error('Timeout ' + timeoutMs + 'ms waiting for selector: ' + selector));
            }, timeoutMs);
        });
    }

    function executeCommand(cmd) {
        try {
            switch (cmd.type) {
                case 'evaluate':
                    return Promise.resolve().then(function() { return (function() { return eval(cmd.expression); })(); });
                case 'click':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) {
                        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return null;
                    });
                case 'dblclick':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) {
                        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })); return null;
                    });
                case 'fill':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) {
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
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) {
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
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) {
                        el.focus();
                        var text = cmd.text;
                        var nativeSetter = 'value' in el
                            ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
                            : null;
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
                case 'textContent':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) { return el.textContent; });
                case 'innerText':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) { return el.innerText; });
                case 'innerHTML':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) { return el.innerHTML; });
                case 'inputValue':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) { return el.value !== undefined ? el.value : null; });
                case 'getAttribute':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) { return el.getAttribute(cmd.name); });
                case 'isVisible':
                    return Promise.resolve().then(function() {
                        var el = document.querySelector(cmd.selector);
                        if (!el) return false;
                        var rect = el.getBoundingClientRect();
                        var style = window.getComputedStyle(el);
                        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
                    });
                case 'isEnabled':
                    return Promise.resolve().then(function() {
                        var el = document.querySelector(cmd.selector);
                        return el ? !el.disabled : false;
                    });
                case 'isChecked':
                    return Promise.resolve().then(function() {
                        var el = document.querySelector(cmd.selector);
                        return el ? !!el.checked : false;
                    });
                case 'isEditable':
                    return Promise.resolve().then(function() {
                        var el = document.querySelector(cmd.selector);
                        if (!el) return false;
                        return !el.disabled && !el.readOnly;
                    });
                case 'count':
                    return Promise.resolve(document.querySelectorAll(cmd.selector).length);
                case 'waitForSelector':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function() { return null; });
                case 'title':
                    return Promise.resolve(document.title);
                case 'url':
                    return Promise.resolve(location.href);
                case 'content':
                    return Promise.resolve(document.documentElement.outerHTML);
                case 'hover':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) {
                        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: false }));
                        return null;
                    });
                case 'focus':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) { el.focus(); return null; });
                case 'blur':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) { el.blur(); return null; });
                case 'selectOption':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) {
                        var values = Array.isArray(cmd.values) ? cmd.values : [cmd.values];
                        var selected = [];
                        Array.from(el.options).forEach(function(opt) {
                            opt.selected = values.indexOf(opt.value) !== -1 || values.indexOf(opt.text) !== -1;
                            if (opt.selected) selected.push(opt.value);
                        });
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return selected;
                    });
                case 'check':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) {
                        if (!el.checked) el.click(); return null;
                    });
                case 'uncheck':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) {
                        if (el.checked) el.click(); return null;
                    });
                case 'scrollIntoView':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return null;
                    });
                case 'scrollTo':
                    return Promise.resolve().then(function() { window.scrollTo(cmd.x || 0, cmd.y || 0); return null; });
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
                        if (el) el.click(); return null;
                    });
                case 'locatorEvaluate':
                    return waitForSelector(cmd.selector, cmd.timeout).then(function(el) {
                        return (new Function('element', 'args', 'return (' + cmd.fn + ')(element, args)'))(el, cmd.args);
                    });
                default:
                    return Promise.reject(new Error('Unknown command type: ' + cmd.type));
            }
        } catch(e) {
            return Promise.reject(e);
        }
    }

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

    poll();
})();`;
    }

    async getIframePayloadScript(_iframeWithoutSrc: boolean): Promise<string> {
        return '';
    }

    handleFileDownload(): void {}

    getAuthCredentials(): null {
        return null;
    }

    handleAttachment(_opts: { isOpenedInNewWindow: boolean }): void {}

    handlePageError(_ctx: unknown, _err: Error): void {}

    // Called by hammerhead's handleServiceMessage dispatcher via this[msg.cmd]
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
