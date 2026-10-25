'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let JSDOM = null;
let VirtualConsole = null;
try {
    ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {}

const extensionDir = path.join(__dirname, '..', 'extension');
const keyUtilsSource = fs.readFileSync(path.join(extensionDir, 'key-utils.js'), 'utf8');
const contentScriptSource = fs.readFileSync(path.join(extensionDir, 'content-script.js'), 'utf8');
const stockData = JSON.parse(fs.readFileSync(path.join(extensionDir, 'stock-data.json'), 'utf8'));

function createChromeMock() {
    const messages = [];
    return {
        messages,
        api: {
            runtime: {
                sendMessage: async (msg) => {
                    messages.push(msg);
                    if (msg.type === 'GET_STOCK_DICT') return { data: stockData };
                    if (msg.type === 'LINK_STOCK') {
                        return { success: true, data: { tongdaxin: { success: true } } };
                    }
                    return { success: false };
                },
                getURL: (resource) => 'chrome-extension://test/' + resource,
                onMessage: { addListener() {} }
            }
        }
    };
}

async function boot(html) {
    const chromeMock = createChromeMock();
    const virtualConsole = new VirtualConsole();
    const dom = new JSDOM(html, {
        url: 'http://127.0.0.1/easylink-test.html',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        virtualConsole
    });
    if (dom.window.document.readyState !== 'complete') {
        await new Promise((resolve) => dom.window.addEventListener('load', resolve, { once: true }));
    }
    dom.window.chrome = chromeMock.api;
    dom.window.eval(keyUtilsSource);
    dom.window.eval(contentScriptSource);
    await new Promise((resolve) => setTimeout(resolve, 120));
    return { dom, messages: chromeMock.messages };
}

function keydown(dom, target, init) {
    const event = new dom.window.KeyboardEvent('keydown', Object.assign({
        bubbles: true,
        cancelable: true
    }, init));
    target.dispatchEvent(event);
    return event;
}

test('content script labels 26 unique codes and sends by key, click, and respects editable focus', { skip: !JSDOM }, async () => {
    const html = fs.readFileSync(path.join(__dirname, 'extension-test-page.html'), 'utf8');
    const { dom, messages } = await boot(html);
    try {
        const doc = dom.window.document;
        const keyed = Array.from(doc.querySelectorAll('stock-highlight[data-stock-key]'));
        const keyedCodes = new Set(keyed.map((el) => el.dataset.stockCode));
        assert.equal(keyedCodes.size, 26);

        assert.equal(doc.querySelector('stock-highlight[data-stock-code="600000"]').dataset.stockKey, 'a');
        assert.equal(doc.querySelector('stock-highlight[data-stock-code="600004"]').dataset.stockKey, 'b');

        const twentySeventh = doc.querySelector('stock-highlight[data-stock-code="600038"]');
        assert.ok(twentySeventh);
        assert.equal(twentySeventh.hasAttribute('data-stock-key'), false);

        const duplicates = Array.from(doc.querySelectorAll('stock-highlight[data-stock-code="600000"]'));
        assert.ok(duplicates.length >= 2);
        for (const el of duplicates) assert.equal(el.dataset.stockKey, 'a');

        messages.length = 0;
        keydown(dom, doc.body, { key: 'a' });
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.ok(messages.some((msg) => msg.type === 'LINK_STOCK' && msg.code === '600000' && msg.name === '浦发银行'));

        messages.length = 0;
        keydown(dom, doc.body, { key: '1' });
        keydown(dom, doc.body, { key: 'a', repeat: true });
        keydown(dom, doc.body, { key: 'a', ctrlKey: true });
        keydown(dom, doc.body, { key: 'a', shiftKey: true });
        keydown(dom, doc.body, { key: 'a', isComposing: true });
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(messages.filter((msg) => msg.type === 'LINK_STOCK').length, 0);

        messages.length = 0;
        const input = doc.getElementById('text-input');
        input.focus();
        keydown(dom, input, { key: 'a' });
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(messages.filter((msg) => msg.type === 'LINK_STOCK').length, 0);

        messages.length = 0;
        const editable = doc.querySelector('[contenteditable]');
        editable.focus();
        keydown(dom, editable, { key: 'a' });
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(messages.filter((msg) => msg.type === 'LINK_STOCK').length, 0);

        messages.length = 0;
        input.blur();
        doc.querySelector('stock-highlight[data-stock-code="600000"]').dispatchEvent(new dom.window.MouseEvent('click', {
            bubbles: true,
            cancelable: true
        }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.ok(messages.some((msg) => msg.type === 'LINK_STOCK' && msg.code === '600000'));

        messages.length = 0;
        twentySeventh.dispatchEvent(new dom.window.MouseEvent('click', {
            bubbles: true,
            cancelable: true
        }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.ok(messages.some((msg) => msg.type === 'LINK_STOCK' && msg.code === '600038'));

        messages.length = 0;
        const originalSetTimeout = dom.window.setTimeout;
        dom.window.setTimeout = function(fn, delay) {
            const args = Array.prototype.slice.call(arguments, 2);
            return originalSetTimeout.apply(dom.window, [fn, delay === 3000 ? 0 : delay].concat(args));
        };
        const hoverTarget = doc.querySelector('stock-highlight[data-stock-code="600004"]');
        hoverTarget.dispatchEvent(new dom.window.MouseEvent('mouseenter', { bubbles: false, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        dom.window.setTimeout = originalSetTimeout;
        assert.ok(messages.some((msg) => msg.type === 'LINK_STOCK' && msg.code === '600004'));
    } finally {
        dom.window.close();
    }
});

test('dynamic content gets the next key and duplicate codes reuse the existing key', { skip: !JSDOM }, async () => {
    const html = '<!DOCTYPE html><html><body><ul id="stocks">' +
        '<li>浦发银行 600000</li>' +
        '<li>白云机场 600004</li>' +
        '<li>东风股份 600006</li>' +
        '<li>中国国贸 600007</li>' +
        '<li>首创环保 600008</li>' +
        '</ul></body></html>';
    const { dom } = await boot(html);
    try {
        const doc = dom.window.document;
        const list = doc.getElementById('stocks');

        list.insertAdjacentHTML('beforeend', '<li>上海机场 600009</li>');
        await new Promise((resolve) => setTimeout(resolve, 250));
        const newStock = doc.querySelector('stock-highlight[data-stock-code="600009"]');
        assert.ok(newStock);
        assert.equal(newStock.dataset.stockKey, 'f');

        list.insertAdjacentHTML('beforeend', '<li>浦发银行 600000</li>');
        await new Promise((resolve) => setTimeout(resolve, 250));
        const duplicates = Array.from(doc.querySelectorAll('stock-highlight[data-stock-code="600000"]'));
        assert.ok(duplicates.length >= 2);
        for (const el of duplicates) assert.equal(el.dataset.stockKey, 'a');
    } finally {
        dom.window.close();
    }
});
