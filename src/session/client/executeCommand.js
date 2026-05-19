
export default executeCommand.toString() + '\n\n';

function executeCommand(cmd) {
    function simulateKeyPress(cmd) {
        const target = cmd.target || (
            document.activeElement &&
                document.activeElement !== document.body
                ? document.activeElement
                : document.querySelector(
                    'input, textarea, [contenteditable="true"]'
                ) || document.body
        );

        const key = cmd.key;
        const code = cmd.code || key;

        const modifiers = {
            ctrlKey: !!cmd.ctrlKey,
            shiftKey: !!cmd.shiftKey,
            altKey: !!cmd.altKey,
            metaKey: !!cmd.metaKey,
            repeat: !!cmd.repeat,
        };

        const keyCode =
            cmd.keyCode ??
            (key.length === 1
                ? key.toUpperCase().charCodeAt(0)
                : getKeyCode(key));

        const eventInit = {
            key,
            code,
            bubbles: true,
            cancelable: true,
            composed: true,
            ...modifiers,
        };

        function dispatchKeyboardEvent(type) {
            const event = new KeyboardEvent(type, eventInit);

            // Compatibility patch for frameworks using legacy fields
            Object.defineProperties(event, {
                keyCode: { get: () => keyCode },
                which: { get: () => keyCode },
                charCode: {
                    get: () => (type === 'keypress' ? keyCode : 0),
                },
            });

            return target.dispatchEvent(event);
        }

        // 1. keydown
        const keydownAllowed = dispatchKeyboardEvent('keydown');
        if (!keydownAllowed) {
            return { prevented: true };
        }

        // 2. keypress (legacy but still used)
        const printable = key.length === 1 || key === 'Enter';
        if (printable) {
            dispatchKeyboardEvent('keypress');
        }

        // 3. beforeinput/input + actual insertion
        const editable =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target.isContentEditable;

        const shouldInsertText =
            editable &&
            key.length === 1 &&
            !modifiers.ctrlKey &&
            !modifiers.metaKey &&
            !modifiers.altKey;

        if (shouldInsertText) {
            const beforeInput = new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                data: key,
                inputType: 'insertText',
            });

            const allowed = target.dispatchEvent(beforeInput);

            if (allowed) {
                insertText(target, key);

                target.dispatchEvent(
                    new InputEvent('input', {
                        bubbles: true,
                        data: key,
                        inputType: 'insertText',
                    })
                );
            }
        }

        // 4. keyup
        dispatchKeyboardEvent('keyup');

        return {
            key,
            code,
            prevented: false,
            target,
        };
    }

    function insertText(target, text) {
        if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement
        ) {
            try {
                const start = target.selectionStart ?? target.value.length;
                const end = target.selectionEnd ?? start;
                target.setRangeText(text, start, end, 'end');
            } catch (_e) {
                // Input types like date/number/color don't support selection APIs in Safari.
                // Fall back to appending via the native value setter.
                const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value');
                if (nativeSetter && nativeSetter.set) { nativeSetter.set.call(target, target.value + text); }
                else { target.value = target.value + text; }
            }
            return;
        }

        if (target.isContentEditable) {
            const selection = window.getSelection();

            if (!selection || selection.rangeCount === 0) {
                target.appendChild(document.createTextNode(text));
                return;
            }

            const range = selection.getRangeAt(0);

            range.deleteContents();

            const textNode = document.createTextNode(text);
            range.insertNode(textNode);

            // Move caret after inserted text
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);

            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    function getKeyCode(key) {
        const map = {
            Enter: 13,
            Tab: 9,
            Escape: 27,
            Backspace: 8,
            Delete: 46,
            ArrowLeft: 37,
            ArrowUp: 38,
            ArrowRight: 39,
            ArrowDown: 40,
            Space: 32,
        };

        return map[key] ?? 0;
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function simulateClick(el, options = {}) {
        if (!el || !el.isConnected) {
            throw new Error('Element is not attached to DOM');
        }

        // Disabled controls do not receive clicks
        if (
            el instanceof HTMLElement &&
            ('disabled' in el && el.disabled)
        ) {
            return { prevented: true, reason: 'disabled' };
        }

        const rect = el.getBoundingClientRect();

        const x = options.clientX ?? rect.left + rect.width / 2;
        const y = options.clientY ?? rect.top + rect.height / 2;

        const button = options.button ?? 0;

        const buttonsMap = {
            0: 1, // left
            1: 4, // middle
            2: 2, // right
        };

        const base = {
            bubbles: true,
            cancelable: true,
            composed: true,

            clientX: x,
            clientY: y,
            screenX: window.screenX + x,
            screenY: window.screenY + y,

            button,
            buttons: buttonsMap[button] ?? 1,

            ctrlKey: !!options.ctrlKey,
            shiftKey: !!options.shiftKey,
            altKey: !!options.altKey,
            metaKey: !!options.metaKey,

            relatedTarget: null,
        };

        const pointerBase = {
            ...base,
            pointerId: 1,
            pointerType: options.pointerType ?? 'mouse',
            isPrimary: true,
            pressure: button === 0 ? 0.5 : 0,
        };

        const dispatch = (target, type, EventType, init) => {
            const event = new EventType(type, init);
            return target.dispatchEvent(event);
        };

        // Hover sequence
        dispatch(el, 'pointerover', PointerEvent, pointerBase);
        dispatch(el, 'mouseover', MouseEvent, base);

        dispatch(el, 'pointerenter', PointerEvent, {
            ...pointerBase,
            bubbles: false,
        });

        dispatch(el, 'mouseenter', MouseEvent, {
            ...base,
            bubbles: false,
        });

        dispatch(el, 'pointermove', PointerEvent, pointerBase);
        dispatch(el, 'mousemove', MouseEvent, base);

        // Down
        const pointerDownAllowed = dispatch(
            el,
            'pointerdown',
            PointerEvent,
            pointerBase
        );

        const mouseDownAllowed = dispatch(
            el,
            'mousedown',
            MouseEvent,
            base
        );

        // Browser focus behavior
        if (
            pointerDownAllowed &&
            mouseDownAllowed &&
            isFocusable(el)
        ) {
            el.focus({ preventScroll: true });
        }

        const upMouse = {
            ...base,
            buttons: 0,
        };

        const upPointer = {
            ...pointerBase,
            buttons: 0,
            pressure: 0,
        };

        // Up
        dispatch(el, 'pointerup', PointerEvent, upPointer);
        dispatch(el, 'mouseup', MouseEvent, upMouse);

        // Primary click
        if (button === 0) {
            const clickAllowed = dispatch(
                el,
                'click',
                MouseEvent,
                {
                    ...upMouse,
                    detail: options.detail ?? 1,
                }
            );

            if (clickAllowed) {
                performDefaultAction(el);
            }

            // Double click support
            if ((options.detail ?? 1) === 2) {
                dispatch(el, 'dblclick', MouseEvent, {
                    ...upMouse,
                    detail: 2,
                });
            }
        }

        // Middle click
        if (button === 1) {
            dispatch(el, 'auxclick', MouseEvent, upMouse);
        }

        // Right click
        if (button === 2) {
            dispatch(el, 'contextmenu', MouseEvent, upMouse);
        }

        return {
            element: el,
            clientX: x,
            clientY: y,
        };
    }

    function isFocusable(el) {
        return (
            el.tabIndex >= 0 ||
            /^(INPUT|BUTTON|SELECT|TEXTAREA|A)$/.test(
                el.tagName
            ) ||
            el.isContentEditable
        );
    }

    function performDefaultAction(el) {
        // Label delegation
        if (el instanceof HTMLLabelElement && el.control) {
            el.control.click();
            return;
        }

        // Checkbox toggle
        if (
            el instanceof HTMLInputElement &&
            el.type === 'checkbox'
        ) {
            el.checked = !el.checked;
            el.dispatchEvent(
                new Event('input', { bubbles: true })
            );
            el.dispatchEvent(
                new Event('change', { bubbles: true })
            );
            return;
        }

        // Radio selection
        if (
            el instanceof HTMLInputElement &&
            el.type === 'radio'
        ) {
            el.checked = true;
            el.dispatchEvent(
                new Event('input', { bubbles: true })
            );
            el.dispatchEvent(
                new Event('change', { bubbles: true })
            );
            return;
        }

        // Native activation fallback
        if (typeof el.click === 'function') {
            el.click();
        }
    }

    try {
        switch (cmd.type) {

            // --- Evaluate ---
            case 'evaluate':
                return Promise.resolve().then(function () { return (function () { return eval(cmd.expression); })(); });

            // --- Single-element writes (step-based) ---
            case 'click':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    simulateClick(els[0]);
                    return null;
                });
            case 'dblclick':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    var el = els[0];
                    var i = mouseInits(el);
                    var up = Object.assign({}, i.m, { buttons: 0 });
                    var pup = Object.assign({}, i.p, { buttons: 0 });
                    el.dispatchEvent(new PointerEvent('pointerover', i.p));
                    el.dispatchEvent(new MouseEvent('mouseover', i.m));
                    el.dispatchEvent(new PointerEvent('pointerenter', Object.assign({}, i.p, { bubbles: false })));
                    el.dispatchEvent(new MouseEvent('mouseenter', Object.assign({}, i.m, { bubbles: false })));
                    el.dispatchEvent(new PointerEvent('pointermove', i.p));
                    el.dispatchEvent(new MouseEvent('mousemove', i.m));
                    el.dispatchEvent(new PointerEvent('pointerdown', i.p));
                    el.dispatchEvent(new MouseEvent('mousedown', i.m));
                    el.focus();
                    el.dispatchEvent(new PointerEvent('pointerup', pup));
                    el.dispatchEvent(new MouseEvent('mouseup', up));
                    el.dispatchEvent(new MouseEvent('click', Object.assign({}, up, { detail: 1 })));
                    el.dispatchEvent(new PointerEvent('pointerdown', i.p));
                    el.dispatchEvent(new MouseEvent('mousedown', i.m));
                    el.dispatchEvent(new PointerEvent('pointerup', pup));
                    el.dispatchEvent(new MouseEvent('mouseup', up));
                    el.dispatchEvent(new MouseEvent('click', Object.assign({}, up, { detail: 2 })));
                    el.dispatchEvent(new MouseEvent('dblclick', Object.assign({}, up, { detail: 2 })));
                    return null;
                });
            case 'fill':
                return waitForElements(cmd.steps, cmd.timeout).then(async function (els) {
                    var el = els[0];
                    el.focus();
                    // Input types like date/number/color don't support selectionStart in Safari —
                    // char-by-char key simulation would throw. Set the value directly instead.
                    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.selectionStart === null) {
                        var nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
                        if (nativeSetter && nativeSetter.set) { nativeSetter.set.call(el, cmd.value); }
                        else { el.value = cmd.value; }
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return null;
                    }
                    for (var i = 0; i < cmd.value.length; i++) {
                        if (document.activeElement !== el) el.focus({ preventScroll: true });
                        await simulateKeyPress({
                            key: cmd.value[i],
                            code: cmd.value[i],
                            target: el
                        });
                        await delay(30);
                    }
                    return null;
                });
            case 'clear':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
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
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    var el = els[0];
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
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    var el = els[0];
                    el.focus();
                    var init = { key: cmd.key, code: cmd.code || cmd.key, bubbles: true, cancelable: true };
                    el.dispatchEvent(new KeyboardEvent('keydown', init));
                    el.dispatchEvent(new KeyboardEvent('keypress', init));
                    el.dispatchEvent(new KeyboardEvent('keyup', init));
                    return null;
                });
            case 'hover':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    var el = els[0];
                    var i = mouseInits(el);
                    var nm = Object.assign({}, i.m, { buttons: 0 });
                    var np = Object.assign({}, i.p, { buttons: 0 });
                    el.dispatchEvent(new PointerEvent('pointerover', np));
                    el.dispatchEvent(new MouseEvent('mouseover', nm));
                    el.dispatchEvent(new PointerEvent('pointerenter', Object.assign({}, np, { bubbles: false })));
                    el.dispatchEvent(new MouseEvent('mouseenter', Object.assign({}, nm, { bubbles: false })));
                    el.dispatchEvent(new PointerEvent('pointermove', np));
                    el.dispatchEvent(new MouseEvent('mousemove', nm));
                    return null;
                });
            case 'focus':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) { els[0].focus(); return null; });
            case 'blur':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) { els[0].blur(); return null; });
            case 'check':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    if (!els[0].checked) els[0].click(); return null;
                });
            case 'uncheck':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    if (els[0].checked) els[0].click(); return null;
                });
            case 'setChecked':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    if (!!els[0].checked !== !!cmd.checked) els[0].click(); return null;
                });
            case 'selectOption':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    var el = els[0];
                    var values = Array.isArray(cmd.values) ? cmd.values : [cmd.values];
                    var selected = [];
                    Array.from(el.options).forEach(function (opt) {
                        opt.selected = values.indexOf(opt.value) !== -1 || values.indexOf(opt.text) !== -1;
                        if (opt.selected) selected.push(opt.value);
                    });
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return selected;
                });
            case 'scrollIntoView':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    els[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); return null;
                });
            case 'dispatchEvent':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    var init = Object.assign({ bubbles: true, cancelable: true }, cmd.eventInit || {});
                    els[0].dispatchEvent(new CustomEvent(cmd.eventType, init)); return null;
                });

            // --- Single-element reads ---
            case 'textContent':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) { return els[0].textContent; });
            case 'innerText':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) { return els[0].innerText; });
            case 'innerHTML':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) { return els[0].innerHTML; });
            case 'inputValue':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) { return els[0].value !== undefined ? els[0].value : null; });
            case 'getAttribute':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) { return els[0].getAttribute(cmd.name); });
            case 'boundingBox':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    var r = els[0].getBoundingClientRect();
                    return r.width === 0 && r.height === 0 ? null : { x: r.left, y: r.top, width: r.width, height: r.height };
                });
            case 'locatorEvaluate':
                return waitForElements(cmd.steps, cmd.timeout).then(function (els) {
                    return (new Function('element', 'args', 'return (' + cmd.fn + ')(element, args)'))(els[0], cmd.args);
                });

            // --- State queries (non-waiting, return false if not found) ---
            case 'isVisible':
                return Promise.resolve().then(function () {
                    var el = resolveSteps(cmd.steps)[0];
                    if (!el) return false;
                    var rect = el.getBoundingClientRect(), style = window.getComputedStyle(el);
                    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
                });
            case 'isEnabled':
                return Promise.resolve().then(function () {
                    var el = resolveSteps(cmd.steps)[0];
                    return el ? !el.disabled : false;
                });
            case 'isChecked':
                return Promise.resolve().then(function () {
                    var el = resolveSteps(cmd.steps)[0];
                    return el ? !!el.checked : false;
                });
            case 'isEditable':
                return Promise.resolve().then(function () {
                    var el = resolveSteps(cmd.steps)[0];
                    if (!el) return false;
                    return !el.disabled && !el.readOnly;
                });

            // --- Page info / navigation ---
            case 'title': return Promise.resolve(document.title);
            case 'url': return Promise.resolve((_hh && _hh.utils && _hh.utils.destLocation) ? _hh.utils.destLocation.get() : location.href);
            case 'content': return Promise.resolve(document.documentElement.outerHTML);
            case 'count':
                return Promise.resolve(resolveSteps(cmd.steps).length);
            case 'waitForSelector':
                return waitForElements(cmd.steps, cmd.timeout).then(function () { return null; });
            case 'scrollTo':
                return Promise.resolve().then(function () { window.scrollTo(cmd.x || 0, cmd.y || 0); return null; });

            // --- Global keyboard / mouse (no steps) ---
            case 'keyPress':
                return Promise.resolve().then(function () {
                    return simulateKeyPress({
                        key: cmd.key,
                        code: cmd.code || cmd.key
                    });
                });
            case 'keyDown':
                return Promise.resolve().then(function () {
                    var target = document.activeElement || document.body;
                    target.dispatchEvent(new KeyboardEvent('keydown', { key: cmd.key, code: cmd.code || cmd.key, bubbles: true, cancelable: true }));
                    return null;
                });
            case 'keyUp':
                return Promise.resolve().then(function () {
                    var target = document.activeElement || document.body;
                    target.dispatchEvent(new KeyboardEvent('keyup', { key: cmd.key, code: cmd.code || cmd.key, bubbles: true, cancelable: true }));
                    return null;
                });
            case 'mouseMove':
                return Promise.resolve().then(function () {
                    var el = document.elementFromPoint(cmd.x, cmd.y) || document.body;
                    var init = { bubbles: true, cancelable: true, clientX: cmd.x, clientY: cmd.y, screenX: cmd.x, screenY: cmd.y };
                    el.dispatchEvent(new PointerEvent('pointermove', Object.assign({}, init, { pointerType: 'mouse', isPrimary: true, pointerId: 1 })));
                    el.dispatchEvent(new MouseEvent('mousemove', init));
                    return null;
                });
            case 'mouseDown':
                return Promise.resolve().then(function () {
                    var el = document.elementFromPoint(cmd.x, cmd.y);
                    if (!el) return null;
                    var btn = cmd.button === 'right' ? 2 : cmd.button === 'middle' ? 1 : 0;
                    var m = { bubbles: true, cancelable: true, clientX: cmd.x, clientY: cmd.y, screenX: cmd.x, screenY: cmd.y, button: btn, buttons: 1 };
                    el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, m, { pointerType: 'mouse', isPrimary: true, pointerId: 1 })));
                    el.dispatchEvent(new MouseEvent('mousedown', m));
                    el.focus();
                    return null;
                });
            case 'mouseUp':
                return Promise.resolve().then(function () {
                    var el = document.elementFromPoint(cmd.x, cmd.y);
                    if (!el) return null;
                    var btn = cmd.button === 'right' ? 2 : cmd.button === 'middle' ? 1 : 0;
                    var m = { bubbles: true, cancelable: true, clientX: cmd.x, clientY: cmd.y, screenX: cmd.x, screenY: cmd.y, button: btn, buttons: 0 };
                    el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, m, { pointerType: 'mouse', isPrimary: true, pointerId: 1 })));
                    el.dispatchEvent(new MouseEvent('mouseup', m));
                    return null;
                });
            case 'mouseClick':
                return Promise.resolve().then(function () {
                    var el = document.elementFromPoint(cmd.x, cmd.y);
                    if (!el) return null;
                    var cx = cmd.x, cy = cmd.y;
                    var m = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, screenX: cx, screenY: cy, button: 0, buttons: 1 };
                    var p = Object.assign({}, m, { pointerType: 'mouse', isPrimary: true, pointerId: 1 });
                    var up = Object.assign({}, m, { buttons: 0 });
                    var pup = Object.assign({}, p, { buttons: 0 });
                    el.dispatchEvent(new PointerEvent('pointerdown', p));
                    el.dispatchEvent(new MouseEvent('mousedown', m));
                    el.focus();
                    el.dispatchEvent(new PointerEvent('pointerup', pup));
                    el.dispatchEvent(new MouseEvent('mouseup', up));
                    el.dispatchEvent(new MouseEvent('click', Object.assign({}, up, { detail: 1 })));
                    return null;
                });

            // --- Multi-element reads ---
            case 'allTextContents':
                return Promise.resolve(resolveSteps(cmd.steps).map(function (el) { return el.textContent || ''; }));
            case 'allInnerTexts':
                return Promise.resolve(resolveSteps(cmd.steps).map(function (el) { return el.innerText || ''; }));
            case 'evaluateAll':
                return Promise.resolve().then(function () {
                    var els = resolveSteps(cmd.steps);
                    return (new Function('elements', 'args', 'return (' + cmd.fn + ')(elements, args)'))(els, cmd.args);
                });

            // --- Drag ---
            case 'dragTo':
                return Promise.resolve().then(function () {
                    var src = resolveSteps(cmd.srcSteps)[0];
                    var tgt = resolveSteps(cmd.tgtSteps)[0];
                    if (!src) throw new Error('Drag source not found');
                    if (!tgt) throw new Error('Drag target not found');
                    var sr = src.getBoundingClientRect(), tr = tgt.getBoundingClientRect();
                    var sx = sr.left + sr.width / 2, sy = sr.top + sr.height / 2;
                    var tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
                    var dt = new DataTransfer();
                    src.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: sx, clientY: sy }));
                    src.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: sx, clientY: sy }));
                    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: sx, clientY: sy }));
                    tgt.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tx, clientY: ty }));
                    tgt.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tx, clientY: ty }));
                    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: tx, clientY: ty }));
                    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: tx, clientY: ty }));
                    tgt.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tx, clientY: ty }));
                    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tx, clientY: ty }));
                    tgt.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: tx, clientY: ty }));
                    tgt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: tx, clientY: ty }));
                    return null;
                });

            // --- Aria snapshot ---
            case 'ariaSnapshot':
                return Promise.resolve().then(function () {
                    var root = (cmd.steps && cmd.steps.length) ? resolveSteps(cmd.steps)[0] : null;
                    if (!root) {
                        var bodyKids = '';
                        for (var i = 0; i < document.body.childNodes.length; i++) bodyKids += buildAriaSnapshot(document.body.childNodes[i], '  ');
                        return '- document:\\n' + bodyKids;
                    }
                    return buildAriaSnapshot(root, '');
                });

            case 'mouseWheel':
                return Promise.resolve().then(function () {
                    var el = document.elementFromPoint(cmd.x, cmd.y) || document.body;
                    el.dispatchEvent(new WheelEvent('wheel', {
                        bubbles: true, cancelable: true,
                        clientX: cmd.x, clientY: cmd.y,
                        deltaX: cmd.deltaX || 0, deltaY: cmd.deltaY || 0, deltaMode: 0,
                    }));
                    return null;
                });

            case 'touchTap':
                return Promise.resolve().then(function () {
                    var el = document.elementFromPoint(cmd.x, cmd.y) || document.body;
                    var x = cmd.x, y = cmd.y;
                    var TouchCls = window['Touch'];
                    var TouchEventCls = window['TouchEvent'];
                    if (TouchCls && TouchEventCls) {
                        var touch = new TouchCls({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x + window.scrollX, pageY: y + window.scrollY, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
                        el.dispatchEvent(new TouchEventCls('touchstart', { bubbles: true, cancelable: true, touches: [touch], changedTouches: [touch], targetTouches: [touch] }));
                        el.dispatchEvent(new TouchEventCls('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [touch], targetTouches: [] }));
                    } else {
                        var ts = document.createEvent('Event');
                        ts.initEvent('touchstart', true, true);
                        el.dispatchEvent(ts);
                        var te = document.createEvent('Event');
                        te.initEvent('touchend', true, true);
                        el.dispatchEvent(te);
                    }
                    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y, detail: 1 }));
                    return null;
                });

            case 'storeHandle':
                return Promise.resolve().then(function () {
                    window.__hhHandles = window.__hhHandles || {};
                    var val = (new Function('args', 'return (' + cmd.expression + ')')(cmd.args));
                    window.__hhHandles[cmd.handleId] = val;
                    return cmd.handleId;
                });
            case 'handleEvaluate':
                return Promise.resolve().then(function () {
                    var h = (window.__hhHandles || {})[cmd.handleId];
                    return (new Function('handle', 'args', 'return (' + cmd.fn + ')(handle, args)'))(h, cmd.args);
                });
            case 'handleGetProperty':
                return Promise.resolve().then(function () {
                    var h = (window.__hhHandles || {})[cmd.handleId];
                    var child = h != null ? h[cmd.name] : undefined;
                    var childId = cmd.handleId + '.' + cmd.name;
                    window.__hhHandles = window.__hhHandles || {};
                    window.__hhHandles[childId] = child;
                    return childId;
                });
            case 'handleJsonValue':
                return Promise.resolve().then(function () {
                    var h = (window.__hhHandles || {})[cmd.handleId];
                    return JSON.parse(JSON.stringify(h));
                });
            case 'disposeHandle':
                return Promise.resolve().then(function () {
                    if (window.__hhHandles) delete window.__hhHandles[cmd.handleId];
                    return null;
                });

            default:
                return Promise.reject(new Error('Unknown command type: ' + cmd.type));
        }
    } catch (e) {
        return Promise.reject(e);
    }
}