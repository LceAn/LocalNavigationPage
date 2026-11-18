/* interaction-settings.js — 空白点击手势 + 可自定义键盘快捷键
 *
 * 之前快捷键是硬编码在 main.js 里的，关于页只做展示。现在：
 *   1. 空白区域单击 / 双击行为可配置（默认单击展开或收起快捷方式）；
 *   2. 键盘组合可录制、清除、还原默认，冲突会被拒绝；
 *   3. 速查面板（?）直接读取当前键位。
 *
 * 依赖 settings 的 getSetting / setSetting，以及 main.js / navigation.js 暴露的全局动作。
 */
(() => {
    // ================================
    // 动作表
    // ================================
    const ACTION_DEFS = [
        { id: 'launcher', label: '打开启动器', hint: '跨分组搜索链接', def: 'mod+k' },
        { id: 'settings', label: '打开设置', hint: '', def: 'mod+,' },
        { id: 'focus-search', label: '聚焦搜索框', hint: '', def: '/' },
        { id: 'shortcut-sheet', label: '快捷键速查', hint: '弹出当前键位表', def: '?' },
        { id: 'toggle-drawer', label: '展开 / 收起快捷方式', hint: '', def: '' },
        { id: 'toggle-theme', label: '切换昼夜模式', hint: '', def: '' }
    ];

    const BLANK_ACTIONS = [
        ['toggle-drawer', '展开 / 收起快捷方式'],
        ['none', '不响应'],
        ['open-drawer', '展开快捷方式'],
        ['focus-search', '聚焦搜索框'],
        ['launcher', '打开启动器'],
        ['toggle-theme', '切换昼夜模式'],
        ['scroll-top', '回到顶部']
    ];

    const BLANK_DEFAULT_SINGLE = 'toggle-drawer';
    const BLANK_DEFAULT_DOUBLE = 'none';
    const DOUBLE_CLICK_DELAY = 260;

    // 浏览器自己占用的组合，注册了也拦不住，直接拒绝
    const RESERVED_COMBOS = new Set(['mod+r', 'mod+w', 'mod+t', 'mod+n', 'mod+l', 'mod+shift+i', 'mod+shift+j', 'mod+shift+c', 'mod+shift+r', 'mod+shift+n']);

    const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
    let recording = null;
    let blankClickTimer = 0;

    // ================================
    // 组合键：规范化 / 显示 / 匹配
    // ================================
    function normalizeKey(key) {
        const map = {
            ' ': 'space',
            Spacebar: 'space',
            ArrowUp: 'arrowup',
            ArrowDown: 'arrowdown',
            ArrowLeft: 'arrowleft',
            ArrowRight: 'arrowright',
            Esc: 'escape',
            Enter: 'enter',
            Tab: 'tab',
            Backspace: 'backspace',
            Delete: 'delete'
        };
        return map[key] || key;
    }

    function comboFromEvent(event) {
        const raw = normalizeKey(event.key);
        if (!raw) return '';
        const isLetter = /^[a-zA-Z]$/.test(raw);
        const printable = raw.length === 1;
        const tokens = [];
        if (event.ctrlKey || event.metaKey) tokens.push('mod');
        if (event.altKey) tokens.push('alt');
        // 字母保留 Shift（Shift+K 与 K 不同）；标点如 ? 本身已含 Shift，不再重复
        if (event.shiftKey && (isLetter || !printable)) tokens.push('shift');
        tokens.push(isLetter ? raw.toLowerCase() : raw);
        return tokens.join('+');
    }

    function formatCombo(combo) {
        if (!combo) return '未设置';
        return combo.split('+').map(token => {
            if (token === 'mod') return isMac ? '⌘' : 'Ctrl';
            if (token === 'alt') return isMac ? '⌥' : 'Alt';
            if (token === 'shift') return isMac ? '⇧' : 'Shift';
            if (token === 'space') return 'Space';
            if (token === 'escape') return 'Esc';
            if (token === 'arrowup') return '↑';
            if (token === 'arrowdown') return '↓';
            if (token === 'arrowleft') return '←';
            if (token === 'arrowright') return '→';
            if (token.length === 1) return token.toUpperCase();
            return token.charAt(0).toUpperCase() + token.slice(1);
        }).join(isMac ? ' ' : ' + ');
    }

    function isTypingContext() {
        const el = document.activeElement;
        if (!el) return false;
        const tag = (el.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    }

    // ================================
    // 读写设置
    // ================================
    function getShortcutMap() {
        const saved = getSetting('shortcuts', {});
        const source = saved && typeof saved === 'object' ? saved : {};
        const map = {};
        ACTION_DEFS.forEach(action => {
            map[action.id] = typeof source[action.id] === 'string' ? source[action.id] : action.def;
        });
        return map;
    }

    function persistShortcut(id, combo) {
        const map = getShortcutMap();
        if (combo) {
            const conflict = ACTION_DEFS.find(action => action.id !== id && map[action.id] === combo);
            if (conflict) {
                window.showMessage?.(`这个组合已被「${conflict.label}」占用`, 'error');
                return false;
            }
            if (RESERVED_COMBOS.has(combo)) {
                window.showMessage?.('这个组合被浏览器占用，换一个试试', 'error');
                return false;
            }
        }
        map[id] = combo;
        const sparse = {};
        ACTION_DEFS.forEach(action => {
            if (map[action.id] !== action.def) sparse[action.id] = map[action.id];
        });
        setSetting('shortcuts', sparse);
        return true;
    }

    // ================================
    // 执行动作
    // ================================
    function focusSearchBox() {
        if (document.body.classList.contains('navigation-open')) {
            window.closeNavigation?.();
        }
        const input = document.getElementById('search-input');
        input?.focus({ preventScroll: false });
        input?.select?.();
    }

    function runAction(id) {
        switch (id) {
            case 'launcher':
                window.openLauncher?.();
                break;
            case 'settings':
                window.openSettingsPanel?.();
                break;
            case 'focus-search':
                focusSearchBox();
                break;
            case 'shortcut-sheet':
                window.toggleShortcutCheatSheet?.();
                break;
            case 'toggle-drawer': {
                const drawer = document.getElementById('navigation-view');
                if (!drawer) break;
                if (drawer.hidden) window.openNavigation?.();
                else window.closeNavigation?.();
                break;
            }
            case 'toggle-theme':
                document.getElementById('toggle-mode')?.click();
                break;
            case 'scroll-top':
                window.scrollTo({ top: 0, behavior: 'smooth' });
                break;
            case 'open-drawer':
                window.openNavigation?.();
                break;
            default:
                break;
        }
    }

    // ================================
    // 键盘分发（替代 main.js 里的硬编码）
    // ================================
    document.addEventListener('keydown', event => {
        if (event.defaultPrevented || recording) return;
        const combo = comboFromEvent(event);
        if (!combo) return;
        const map = getShortcutMap();
        const action = ACTION_DEFS.find(item => map[item.id] && map[item.id] === combo);
        if (!action) return;
        // 输入框里只认带修饰键的组合，避免抢走正常输入
        const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
        if (isTypingContext() && !hasModifier) return;
        event.preventDefault();
        runAction(action.id);
    });

    // ================================
    // 空白区域单击 / 双击
    // ================================
    const BLANK_IGNORE = [
        'a', 'button', 'input', 'textarea', 'select', 'label', 'kbd', 'summary',
        '[role="button"]', '[contenteditable="true"]', '[data-no-blank-click]',
        '.home-header', '.search-container-wrapper', '.top-right-buttons',
        '#navigation-view', '#settings-container', '.modal-overlay', '.launcher-overlay',
        '.route-popover', '.search-engine-menu', '#shortcut-cheatsheet', '.ctx-menu',
        '#message-container', '.back-to-top', '.datetime-display',
        '#resource-detail-dialog', '.network-environment-popover'
    ].join(',');

    function overlayOpen() {
        if (document.getElementById('settings-container')?.classList.contains('show')) return true;
        if (document.querySelector('.modal-overlay.show, #resource-detail-dialog[open], #shortcut-cheatsheet')) return true;
        const launcher = document.getElementById('launcher');
        if (launcher && !launcher.hidden) return true;
        return false;
    }

    function getBlankAction(key, fallback) {
        const value = getSetting(key, fallback);
        return BLANK_ACTIONS.some(([id]) => id === value) ? value : fallback;
    }

    function handleBlankClick(event) {
        if (event.defaultPrevented || event.button !== 0) return;
        if (!event.target?.closest) return;
        if (event.target.closest(BLANK_IGNORE)) return;
        if (overlayOpen()) return;

        const single = getBlankAction('homeBlankClick', BLANK_DEFAULT_SINGLE);
        const double = getBlankAction('homeBlankDblClick', BLANK_DEFAULT_DOUBLE);
        const drawerOpen = document.body.classList.contains('navigation-open');

        if (drawerOpen) {
            if (single === 'toggle-drawer') {
                window.closeNavigation?.();
                return;
            }
            if (single === 'none' || single === 'open-drawer') return;
            runAction(single);
            return;
        }

        if (!double || double === 'none') {
            if (single !== 'none') runAction(single);
            return;
        }

        // 配了双击就延迟单击，等第二下
        if (blankClickTimer) {
            window.clearTimeout(blankClickTimer);
            blankClickTimer = 0;
            runAction(double);
            return;
        }
        blankClickTimer = window.setTimeout(() => {
            blankClickTimer = 0;
            if (single !== 'none') runAction(single);
        }, DOUBLE_CLICK_DELAY);
    }

    document.addEventListener('click', handleBlankClick);

    // ================================
    // 设置页：空白点击下拉
    // ================================
    function fillSelect(select, options, value) {
        if (!select) return;
        select.innerHTML = options.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
        select.value = options.some(([id]) => id === value) ? value : options[0][0];
    }

    function initBlankControls() {
        const single = document.getElementById('blank-click-action');
        const double = document.getElementById('blank-dblclick-action');
        if (!single && !double) return;

        fillSelect(single, BLANK_ACTIONS, getBlankAction('homeBlankClick', BLANK_DEFAULT_SINGLE));
        fillSelect(double, [['none', '不响应'], ...BLANK_ACTIONS.filter(([id]) => id !== 'none')],
            getBlankAction('homeBlankDblClick', BLANK_DEFAULT_DOUBLE));

        single?.addEventListener('change', function () {
            setSetting('homeBlankClick', this.value);
            const label = BLANK_ACTIONS.find(([id]) => id === this.value)?.[1] || '';
            window.showMessage?.('单击空白：' + label);
        });
        double?.addEventListener('change', function () {
            setSetting('homeBlankDblClick', this.value);
            const label = BLANK_ACTIONS.find(([id]) => id === this.value)?.[1] || '不响应';
            window.showMessage?.('双击空白：' + label);
        });
    }

    // ================================
    // 设置页：快捷键列表
    // ================================
    function renderShortcutRows() {
        const host = document.getElementById('shortcut-rows');
        if (!host) return;
        const map = getShortcutMap();
        host.innerHTML = ACTION_DEFS.map(action => {
            const combo = map[action.id];
            return `<div class="shortcut-row" data-action="${action.id}">
                <div class="shortcut-row-text">
                    <span>${action.label}</span>
                    ${action.hint ? `<small>${action.hint}</small>` : ''}
                </div>
                <kbd class="shortcut-kbd">${formatCombo(combo)}</kbd>
                <div class="shortcut-row-buttons">
                    <button type="button" class="shortcut-btn shortcut-record-btn">修改</button>
                    <button type="button" class="shortcut-btn shortcut-reset-btn" title="还原默认"${combo === action.def ? ' disabled' : ''}>默认</button>
                </div>
            </div>`;
        }).join('');

        host.querySelectorAll('.shortcut-row').forEach(row => {
            const id = row.dataset.action;
            row.querySelector('.shortcut-record-btn')?.addEventListener('click', event => {
                event.stopPropagation();
                if (recording?.id === id) stopRecording();
                else startRecording(id);
            });
            row.querySelector('.shortcut-reset-btn')?.addEventListener('click', event => {
                event.stopPropagation();
                const action = ACTION_DEFS.find(item => item.id === id);
                if (!action) return;
                if (persistShortcut(id, action.def)) {
                    stopRecording();
                    renderShortcutRows();
                    window.showMessage?.(`「${action.label}」已还原默认`);
                }
            });
        });
    }

    function startRecording(id) {
        stopRecording();
        // stopRecording 会重建列表，这里必须重新查询，不能沿用点击时那一行的旧引用
        const row = document.querySelector(`.shortcut-row[data-action="${id}"]`);
        if (!row) return;
        recording = { id, row };
        row.classList.add('is-recording');
        const kbd = row.querySelector('.shortcut-kbd');
        if (kbd) kbd.textContent = '按下组合键…';
        const btn = row.querySelector('.shortcut-record-btn');
        if (btn) btn.textContent = '取消';
    }

    function stopRecording() {
        if (!recording) return;
        const row = recording.row;
        recording = null;
        row?.classList.remove('is-recording');
        renderShortcutRows();
    }

    document.addEventListener('keydown', event => {
        if (!recording) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') {
            stopRecording();
            return;
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
            if (persistShortcut(recording.id, '')) {
                stopRecording();
                window.showMessage?.('已清除该快捷键');
            }
            return;
        }
        if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(event.key)) return;

        const combo = comboFromEvent(event);
        if (!combo) return;
        const parts = combo.split('+');
        const key = parts[parts.length - 1];
        const modifier = parts.some(token => token === 'mod' || token === 'alt');
        if (!modifier && /^[a-z0-9]$/i.test(key)) {
            window.showMessage?.('字母或数字快捷键需要配合 Ctrl / ⌘ 或 Alt', 'error');
            return;
        }
        if (persistShortcut(recording.id, combo)) {
            stopRecording();
            window.showMessage?.('快捷键已更新');
        }
    }, true);

    // ================================
    // 关于页入口 + 速查面板数据
    // ================================
    document.getElementById('about-open-shortcuts')?.addEventListener('click', () => {
        window.openSettingsPanel?.();
        window.activateSettingsTab?.('shortcuts');
    });

    window.getShortcutCheatRows = () => {
        const map = getShortcutMap();
        return ACTION_DEFS
            .filter(action => map[action.id])
            .map(action => [formatCombo(map[action.id]), action.label]);
    };
    window.getShortcutMap = getShortcutMap;
    window.getShortcutActions = () => ACTION_DEFS.map(action => ({ ...action }));

    initBlankControls();
    renderShortcutRows();
})();
