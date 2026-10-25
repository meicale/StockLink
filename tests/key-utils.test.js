'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { KEY_ALPHABET, KeyRegistry, isEditableElement } = require('../extension/key-utils.js');

test('KeyRegistry assigns a-z once per unique code', () => {
    const registry = new KeyRegistry();
    for (let i = 0; i < KEY_ALPHABET.length; i++) {
        assert.equal(registry.assign('code-' + i, 'name-' + i), KEY_ALPHABET[i]);
    }
    assert.equal(registry.size, KEY_ALPHABET.length);
    assert.equal(registry.assign('code-0', 'other-name'), 'a');
    assert.equal(registry.assign('code-26', 'name-26'), null);
    assert.equal(registry.size, KEY_ALPHABET.length);
    assert.deepEqual(registry.get('a'), { code: 'code-0', name: 'name-0' });
    assert.deepEqual(registry.get('z'), { code: 'code-25', name: 'name-25' });
    assert.equal(registry.get('A'), null);
});

test('KeyRegistry supports a custom alphabet and exposes the stock by key', () => {
    const registry = new KeyRegistry('xy');
    assert.equal(registry.assign('600519', '贵州茅台'), 'x');
    assert.equal(registry.assign('000001', '平安银行'), 'y');
    assert.equal(registry.assign('600036', '招商银行'), null);
    assert.deepEqual(registry.get('x'), { code: '600519', name: '贵州茅台' });
});

test('isEditableElement detects text-entry controls', () => {
    assert.equal(isEditableElement(null), false);
    assert.equal(isEditableElement({ tagName: 'TEXTAREA' }), true);
    assert.equal(isEditableElement({ tagName: 'SELECT' }), true);
    assert.equal(isEditableElement({ tagName: 'INPUT', type: 'text' }), true);
    assert.equal(isEditableElement({ tagName: 'INPUT' }), true);
    assert.equal(isEditableElement({ tagName: 'INPUT', type: 'search' }), true);
    assert.equal(isEditableElement({ tagName: 'INPUT', type: 'hidden' }), false);
    assert.equal(isEditableElement({ tagName: 'INPUT', type: 'button' }), false);
    assert.equal(isEditableElement({ tagName: 'INPUT', type: 'checkbox' }), false);
    assert.equal(isEditableElement({ tagName: 'DIV', isContentEditable: true }), true);
});

test('isEditableElement detects editable ancestors and textbox roles', () => {
    assert.equal(isEditableElement({ tagName: 'DIV', closest: () => null }), false);
    assert.equal(isEditableElement({ tagName: 'DIV', closest: () => ({}) }), true);
    assert.equal(isEditableElement({
        tagName: 'SPAN',
        closest: (selector) => selector.includes('role="textbox"') ? {} : null
    }), true);
});

test('key-utils.js attaches EasyLinkKeyUtils when loaded as a browser script', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'key-utils.js'), 'utf8');
    const context = vm.createContext({});
    vm.runInContext(source, context);
    assert.ok(context.EasyLinkKeyUtils);
    assert.equal(typeof context.EasyLinkKeyUtils.KeyRegistry, 'function');
    assert.equal(typeof context.EasyLinkKeyUtils.isEditableElement, 'function');
    const registry = new context.EasyLinkKeyUtils.KeyRegistry();
    assert.equal(registry.assign('600519', '贵州茅台'), 'a');
});
