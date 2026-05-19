function ariaHelpers() {
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
            return t ? indent + '- text: ' + t + '\n' : '';
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

        if (_ariaSkipChildren[role]) return line + '\n';

        var kids = '';
        for (var ci = 0; ci < node.childNodes.length; ci++) kids += buildAriaSnapshot(node.childNodes[ci], indent + '  ');
        if (!kids) return line + '\n';

        var hasElemChild = false;
        for (var ei = 0; ei < node.childNodes.length; ei++) {
            if (node.childNodes[ei].nodeType === 1 && !_ariaHidden(node.childNodes[ei])) { hasElemChild = true; break; }
        }
        if (!hasElemChild) {
            var inline = (node.textContent || '').replace(/\s+/g, ' ').trim();
            return inline ? line + ': ' + inline + '\n' : line + '\n';
        }

        return line + ':\n' + kids;
    }
}

const _s = ariaHelpers.toString();
export default _s.slice(_s.indexOf('{') + 1, _s.lastIndexOf('}'));
