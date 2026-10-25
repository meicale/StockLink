(function(root, factory) {
    'use strict';
    const api = factory();
    if (root) root.EasyLinkKeyUtils = api;
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

    class KeyRegistry {
        constructor(alphabet) {
            this.alphabet = alphabet || KEY_ALPHABET;
            this.codeToKey = new Map();
            this.keyToStock = new Map();
            this.nextIndex = 0;
        }

        assign(code, name) {
            if (this.codeToKey.has(code)) return this.codeToKey.get(code);
            if (this.nextIndex >= this.alphabet.length) return null;
            const key = this.alphabet[this.nextIndex++];
            this.codeToKey.set(code, key);
            this.keyToStock.set(key, { code, name });
            return key;
        }

        get(key) {
            return this.keyToStock.get(key) || null;
        }

        get size() {
            return this.keyToStock.size;
        }
    }

    function isEditableElement(el) {
        if (!el || typeof el !== 'object') return false;
        if (el.isContentEditable) return true;
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (tag === 'INPUT') {
            const type = String(el.type || 'text').toLowerCase();
            return !['hidden', 'button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image'].includes(type);
        }
        if (el.closest) {
            return !!el.closest('[contenteditable="true"],[contenteditable=""],[role="textbox"]');
        }
        return false;
    }

    return { KEY_ALPHABET, KeyRegistry, isEditableElement };
});
