console.log('[EasyLink] content-script.js 已加载');

(function() {
    'use strict';

    const ATTR = 'data-wzs-linker';
    const SKIP_WORDS = new Set(['机器人']);

    const keyUtils = window.EasyLinkKeyUtils;
    if (!keyUtils) {
        console.error('[EasyLink] key-utils.js 未加载');
        return;
    }
    const { KeyRegistry, isEditableElement } = keyUtils;

    class StockRecognizer {
        constructor() {
            this.stockData = {};
            this.codeToName = {};
            this.processedNodes = new WeakSet();
            this.scanCount = 0;
            this.nameRegex = null;
            this.stockCodeRegex = /(00[0-9]{4}|30[0-9]{4}|60[0-9]{4}|68[0-9]{4}|92[0-9]{4})/g;
            this._retryCount = 0;
            this.keys = new KeyRegistry();
            this._keyWarned = false;
        }

        async init() {
            console.log('[EasyLink] 开始初始化...');
            await this.loadStockDict();
            const count = Object.keys(this.stockData).length;
            console.log(`[EasyLink] 已加载 ${count} 只股票`);
            if (count === 0) return;

            this.buildNameRegex();
            this.processPage();
            this.observeChanges();
            this.bindGlobalClick();
            this.bindKeyboardShortcuts();
            console.log('[EasyLink] 初始化完成');
        }

        async loadStockDict() {
            try {
                const response = await chrome.runtime.sendMessage({ type: 'GET_STOCK_DICT' });
                if (response && response.data && typeof response.data === 'object') {
                    this.stockData = response.data;
                    this.buildCodeToName();
                    console.log('[EasyLink] 词典已加载: ' + Object.keys(response.data).length + ' 只');
                    return;
                }
            } catch (e) {
                console.warn('[EasyLink] 消息获取词典失败:', e.message);
            }
            try {
                const resp = await fetch('http://127.0.0.1:3000/api/stock-dict');
                const data = await resp.json();
                if (data && typeof data === 'object' && Object.keys(data).length > 100) {
                    this.stockData = data;
                    this.buildCodeToName();
                    console.log('[EasyLink] 直连API加载词典: ' + Object.keys(data).length + ' 只');
                    return;
                }
            } catch (e) {
                console.warn('[EasyLink] 直连API失败:', e.message);
            }
            console.warn('[EasyLink] 所有加载方式失败，使用内置词典(110只)');
            this.stockData = this.getBuiltInDict();
            this.buildCodeToName();
        }

        buildCodeToName() {
            this.codeToName = {};
            for (const [name, code] of Object.entries(this.stockData)) {
                const clean = code.includes(':') ? code.split(':')[1] : code;
                if (!this.codeToName[clean]) this.codeToName[clean] = name;
            }
        }

        getBuiltInDict() {
            return {"平安银行":"000001","万科A":"000002","ST国华":"000004","深振业A":"000006","神州高铁":"000008","中国宝安":"000009","深物业A":"000011","深康佳A":"000016","深华发A":"000020","深科技":"000021","特力A":"000025","飞亚达":"000026","深圳能源":"000027","国药一致":"000028","深深房A":"000029","中集集团":"000039","深纺织A":"000045","德赛电池":"000049","深天马A":"000050","深赛格":"000058","中金岭南":"000060","农产品":"000061","深圳华强":"000062","中兴通讯":"000063","华侨城A":"000069","盐田港":"000088","深圳机场":"000089","中信海直":"000099","TCL科技":"000100","中联重科":"000157","申万宏源":"000166","美的集团":"000338","许继电气":"000400","格力电器":"000651","云南白药":"000538","泸州老窖":"000568","长安汽车":"000625","铜陵有色":"000630","京东方A":"000725","燕京啤酒":"000729","中航西飞":"000768","广发证券":"000776","新兴铸管":"000778","长江证券":"000783","盐湖股份":"000792","一汽解放":"000800","云铝股份":"000807","太钢不锈":"000825","五粮液":"000858","双汇发展":"000895","鞍钢股份":"000898","浪潮信息":"000977","紫光股份":"000938","华东医药":"000963","新大陆":"000997","大族激光":"002008","宁波银行":"002142","海康威视":"002415","科大讯飞":"002230","歌尔股份":"002241","立讯精密":"002475","比亚迪":"002594","洋河股份":"002304","顺丰控股":"002352","牧原股份":"002714","东方财富":"300059","同花顺":"300033","爱尔眼科":"300015","迈瑞医疗":"300760","宁德时代":"300750","阳光电源":"300274","汇川技术":"300124","智飞生物":"300122","贵州茅台":"600519","中国平安":"601318","招商银行":"600036","隆基绿能":"601012","万华化学":"600309","恒瑞医药":"600276","中信证券":"600030","海螺水泥":"600585","三一重工":"600031","中国中免":"601888","通威股份":"600438","药明康德":"603259","紫金矿业":"601899","长江电力":"600900","中国神华":"601088","工商银行":"601398","农业银行":"601288","中国银行":"601988","建设银行":"601939","中国人寿":"601628","中国石油":"601857","中国石化":"600028","中国建筑":"601668","中国铁建":"601186","中国交建":"601800","中国中铁":"601390","中国中车":"601766","中国重工":"601989","中国铝业":"601600","中国国航":"601111","南方航空":"600029","东方航空":"600115","国泰君安":"601211","华泰证券":"601688","海通证券":"600837","招商证券":"600999","兴业银行":"601166","浦发银行":"600000","民生银行":"600016","光大银行":"601818","北京银行":"601169","南京银行":"601009","交通银行":"601328","华夏银行":"600015","中国电建":"601669","中国化学":"601117","中国中冶":"601618","中国核电":"601985","七匹狼":"002029","艾艾精工":"603580","双成药业":"002693"};
        }

        buildNameRegex() {
            const names = Object.keys(this.stockData)
                .filter(n => n.length >= 2 && n.length <= 8)
                .sort((a, b) => b.length - a.length)
                .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            this.nameRegex = new RegExp('(' + names.join('|') + ')', 'g');
        }

        isExcludedContext(text, index) {
            if (index > 0 && /\d/.test(text[index - 1])) return true;
            if (index + 6 < text.length && /\d/.test(text[index + 6])) return true;
            const start = Math.max(0, index - 20);
            const end = Math.min(text.length, index + 25);
            const ctx = text.substring(start, end);
            if (/\d{4}[年\-\/]\d{1,2}[月\-\/]/.test(ctx)) return true;
            if (/[月日号第楼]\s*\d{6}/.test(ctx)) return true;
            if (/\d{6}\s*[元块¥￥]/.test(ctx)) return true;
            if (/\d{6}[-.\/]/.test(ctx)) return true;
            if (/[-.\/]\d{6}/.test(ctx)) return true;
            if (/^[A-Za-z]\d{6}/.test(ctx.substring(index - start))) return true;
            return false;
        }

        createHighlight(text, code, name) {
            const wrapper = document.createElement('stock-highlight');
            wrapper.textContent = text;
            wrapper.setAttribute(ATTR, code);
            wrapper.dataset.stockCode = code;
            wrapper.dataset.stockName = name;
            const key = this.assignKey(code, name);
            if (key) {
                wrapper.dataset.stockKey = key;
                wrapper.title = name + '(' + code + ') · 按 ' + key + ' 联动';
            }
            wrapper.style.cssText = 'display:inline;padding:1px 3px;border-radius:3px;cursor:pointer;font-weight:bold;color:#ff6600;background:rgba(255,102,0,0.12);border-bottom:2px solid #ff6600;';
            const self = this;
            wrapper.addEventListener('mouseenter', function() {
                this.style.background = '#ff6600';
                this.style.color = '#fff';
                this.dataset.hoverTimer = setTimeout(function(el, c, n) {
                    el.style.borderBottomColor = '#fff';
                    self.sendToDesktop(c, n);
                }, 3000, this, code, name);
            });
            wrapper.addEventListener('mouseleave', function() {
                this.style.background = 'rgba(255,102,0,0.12)';
                this.style.color = '#ff6600';
                if (this.dataset.hoverTimer) {
                    clearTimeout(Number(this.dataset.hoverTimer));
                    delete this.dataset.hoverTimer;
                }
            });
            return wrapper;
        }

        processNode(node) {
            if (this.processedNodes.has(node)) return;
            if (node.nodeType !== Node.TEXT_NODE) return;

            const text = node.textContent;
            if (!text || text.trim().length === 0) return;

            const parent = node.parentElement;
            if (!parent) return;
            if (parent.hasAttribute(ATTR)) return;

            const tag = parent.tagName;
            if (['SCRIPT', 'STYLE', 'CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'TEXTAREA', 'INPUT', 'STOCK-HIGHLIGHT'].includes(tag)) return;
            if (parent.closest('stock-highlight')) return;
            if (parent.isContentEditable) return;

            const matches = [];

            this.nameRegex.lastIndex = 0;
            let match;
            while ((match = this.nameRegex.exec(text)) !== null) {
                const name = match[1];
                const index = match.index;
                const code = this.stockData[name];
                if (!code) continue;
                if (SKIP_WORDS.has(name)) continue;
                if (index > 0 && index + name.length < text.length &&
                    /[\u4e00-\u9fa5]/.test(text[index - 1]) &&
                    /[\u4e00-\u9fa5]/.test(text[index + name.length])) continue;
                matches.push({ start: index, end: index + name.length, code, label: name, name });
            }

            this.stockCodeRegex.lastIndex = 0;
            while ((match = this.stockCodeRegex.exec(text)) !== null) {
                const code = match[1];
                const index = match.index;
                if (this.isExcludedContext(text, index)) continue;
                const stockName = this.codeToName[code];
                if (!stockName) continue;
                matches.push({ start: index, end: index + 6, code, label: code, name: stockName });
            }

            matches.sort((a, b) => a.start - b.start);

            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            let hasMatch = false;
            for (const m of matches) {
                if (m.start < lastIndex) continue;   // 与已高亮区间重叠，跳过
                if (m.start > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex, m.start)));
                }
                fragment.appendChild(this.createHighlight(m.label, m.code, m.name));
                lastIndex = m.end;
                hasMatch = true;
                this.scanCount++;
            }

            if (hasMatch) {
                if (lastIndex < text.length) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                }
                this.processedNodes.add(node);
                parent.replaceChild(fragment, node);
            } else {
                this.processedNodes.add(node);
            }
        }

        bindGlobalClick() {
            const self = this;
            document.addEventListener('click', function(e) {
                const target = e.target.closest('stock-highlight');
                if (!target) return;

                e.preventDefault();
                e.stopPropagation();

                const code = target.dataset.stockCode;
                const name = target.dataset.stockName;
                console.log('[EasyLink] 点击:', name, code);
                self.sendToDesktop(code, name);
            }, true);
            console.log('[EasyLink] 全局点击监听已绑定');
        }

        assignKey(code, name) {
            const key = this.keys.assign(code, name);
            if (!key && !this._keyWarned) {
                this._keyWarned = true;
                console.warn('[EasyLink] 本页唯一股票超过 26 个，超出部分不分配字母键');
            }
            return key;
        }

        bindKeyboardShortcuts() {
            const self = this;
            window.addEventListener('keydown', function(e) {
                if (e.defaultPrevented || e.repeat) return;
                if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
                if (e.isComposing || e.keyCode === 229) return;
                if (!/^[a-zA-Z]$/.test(e.key)) return;
                if (isEditableElement(e.target) || isEditableElement(document.activeElement)) return;

                const key = e.key.toLowerCase();
                const stock = self.keys.get(key);
                if (!stock) return;

                e.preventDefault();
                e.stopPropagation();
                console.log('[EasyLink] 按键联动:', key, stock.name, stock.code);
                self.sendToDesktop(stock.code, stock.name);
            }, true);
            console.log('[EasyLink] 键盘监听已绑定');
        }

        async sendToDesktop(code, name) {
            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'LINK_STOCK', code, name
                });
                console.log('[EasyLink] 联动结果:', response);
                this.showToast(code, name, response.data || { tongdaxin: { success: false } });
            } catch (e) {
                console.error('[EasyLink] 联动请求失败:', e.message);
                this.showToast(code, name, { tongdaxin: { success: false } });
            }
        }

        showToast(code, name, result) {
            const old = document.getElementById('wzslinker-toast');
            if (old) old.remove();

            const ok = result.tongdaxin && result.tongdaxin.success;
            const toast = document.createElement('div');
            toast.id = 'wzslinker-toast';
            toast.textContent = ok ? '✓ 已联动: ' + name + '(' + code + ')' : '✗ 联动失败: ' + name + '(' + code + ')';
            toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;padding:10px 20px;border-radius:6px;font-size:14px;color:#fff;background:' + (ok ? '#28a745' : '#dc3545') + ';box-shadow:0 2px 10px rgba(0,0,0,0.3);font-family:Microsoft YaHei,sans-serif;';
            document.body.appendChild(toast);
            setTimeout(function() { toast.remove(); }, 3000);
        }

        processPage() {
            if (!document.body) {
                console.log('[EasyLink] body未就绪，500ms后重试');
                setTimeout(() => this.processPage(), 500);
                return;
            }

            this._collectTextNodes(document.body);

            if (this.scanCount === 0 && this._retryCount < 2) {
                this._retryCount++;
                console.log('[EasyLink] 未高亮任何股票，' + (this._retryCount * 800) + 'ms后重试');
                setTimeout(() => {
                    this.scanCount = 0;
                    this._collectTextNodes(document.body);
                    console.log('[EasyLink] 第' + this._retryCount + '次重试完成，高亮', this.scanCount, '个股票');
                }, this._retryCount * 800);
            } else {
                this._retryCount = 0;
                console.log('[EasyLink] 扫描完成，高亮', this.scanCount, '个股票');
            }
        }

        _collectTextNodes(root) {
            const textNodes = [];
            try {
                const walker = document.createTreeWalker(
                    root,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode: function(node) {
                            const parent = node.parentElement;
                            if (!parent) return NodeFilter.FILTER_REJECT;
                            if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
                                return NodeFilter.FILTER_REJECT;
                            }
                            return NodeFilter.FILTER_ACCEPT;
                        }
                    }
                );
                while (walker.nextNode()) {
                    textNodes.push(walker.currentNode);
                }
            } catch (e) {}

            textNodes.forEach(function(node) { this.processNode(node); }.bind(this));

            if (textNodes.length === 0) {
                const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
                for (let i = 0; i < all.length; i++) {
                    if (all[i].shadowRoot) {
                        this._collectTextNodes(all[i].shadowRoot);
                    }
                }
            }
        }

        observeChanges() {
            const self = this;
            let timeout = null;
            const observer = new MutationObserver(function(mutations) {
                if (timeout) clearTimeout(timeout);
                timeout = setTimeout(function() {
                    timeout = null;
                    let found = 0;
                    for (const mutation of mutations) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.TEXT_NODE) {
                                if (!node.parentElement || node.parentElement.hasAttribute(ATTR)) continue;
                                if (node.parentElement.closest('stock-highlight')) continue;
                                self.processNode(node);
                                found++;
                            } else if (node.nodeType === Node.ELEMENT_NODE && node !== document.body && !node.hasAttribute(ATTR) && !node.closest('stock-highlight') && node.querySelectorAll) {
                                const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
                                while (tw.nextNode()) {
                                    self.processNode(tw.currentNode);
                                    found++;
                                }
                            }
                        }
                    }
                    if (found > 0) console.log('[EasyLink] 观察器处理', found, '个新节点');
                }, 100);
            });
            observer.observe(document.body, { childList: true, subtree: true, characterData: true });

            let rescans = 0;
            const interval = setInterval(function() {
                const prev = self.scanCount;
                self._collectTextNodes(document.body);
                if (self.scanCount > prev) {
                    console.log('[EasyLink] 定时扫描新增', self.scanCount - prev, '个股票');
                }
                rescans++;
                if (rescans >= 6) clearInterval(interval);
            }, 1500);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            new StockRecognizer().init();
        });
    } else {
        new StockRecognizer().init();
    }
})();
