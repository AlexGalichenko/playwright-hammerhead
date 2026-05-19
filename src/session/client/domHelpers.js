function domHelpers() {
    function mouseInits(el) {
        var r = el.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var m = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, screenX: cx, screenY: cy, button: 0, buttons: 1 };
        var p = Object.assign({}, m, { pointerType: 'mouse', isPrimary: true, pointerId: 1 });
        return { m: m, p: p };
    }

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
            } else if (step.kind === 'xpath') {
                var xSeen = [];
                elements = [];
                for (var xci = 0; xci < contexts.length; xci++) {
                    var xctx = contexts[xci];
                    var xdoc = xctx.ownerDocument || xctx;
                    try {
                        var xres = xdoc.evaluate(step.expr, xctx, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                        for (var xni = 0; xni < xres.snapshotLength; xni++) {
                            var xnode = xres.snapshotItem(xni);
                            if (xnode && xSeen.indexOf(xnode) === -1) { xSeen.push(xnode); elements.push(xnode); }
                        }
                    } catch(_xe) {}
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
            } else if (step.kind === 'getByLabel') {
                var ltext = step.text;
                var lSeen = [];
                var lEls = [];
                var root = contexts.length ? contexts[0].ownerDocument || document : document;
                var byAria = root.querySelectorAll('[aria-label]');
                for (var ai = 0; ai < byAria.length; ai++) {
                    if ((byAria[ai].getAttribute('aria-label') || '') === ltext && lSeen.indexOf(byAria[ai]) === -1) {
                        lSeen.push(byAria[ai]); lEls.push(byAria[ai]);
                    }
                }
                var lbls = root.querySelectorAll('label');
                for (var lbli = 0; lbli < lbls.length; lbli++) {
                    var lbl = lbls[lbli];
                    if ((lbl.textContent || '').trim() !== ltext) continue;
                    var forId = lbl.getAttribute('for');
                    if (forId) {
                        var ctrl = root.getElementById(forId);
                        if (ctrl && lSeen.indexOf(ctrl) === -1) { lSeen.push(ctrl); lEls.push(ctrl); }
                    } else {
                        var sib = lbl.nextElementSibling;
                        while (sib) {
                            if (/^(INPUT|SELECT|TEXTAREA)$/i.test(sib.tagName) && lSeen.indexOf(sib) === -1) {
                                lSeen.push(sib); lEls.push(sib); break;
                            }
                            sib = sib.nextElementSibling;
                        }
                    }
                }
                elements = lEls;
                contexts = elements;
            } else if (step.kind === 'getByAttr') {
                var attrSeen = [];
                var attrEls = [];
                var attrVal = step.value;
                for (var attrCi = 0; attrCi < contexts.length; attrCi++) {
                    var attrCandidates = contexts[attrCi].querySelectorAll('[' + step.attr + ']');
                    for (var attrFi = 0; attrFi < attrCandidates.length; attrFi++) {
                        var attrEl = attrCandidates[attrFi];
                        var attrActual = attrEl.getAttribute(step.attr);
                        var attrMatch = typeof attrVal === 'string'
                            ? attrActual === attrVal
                            : new RegExp(attrVal.source, attrVal.flags || '').test(attrActual || '');
                        if (attrMatch && attrSeen.indexOf(attrEl) === -1) { attrSeen.push(attrEl); attrEls.push(attrEl); }
                    }
                }
                elements = attrEls;
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
    }
}

const _s = domHelpers.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
