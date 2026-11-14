import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function toolbarFixture() {
    let document;
    class Node {
        constructor(tag = 'div', id = '', className = '') {
            this.tagName = tag.toUpperCase();
            this.nodeType = 1;
            this.id = id;
            this.className = className;
            this.children = [];
            this.attributes = {};
            this.dataset = {};
            this.style = {};
            this.events = {};
            this.hidden = false;
            this.classList = {
                contains: name => this.className.split(' ').includes(name),
                add: (...names) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' '); },
                remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
                toggle: (name, on) => { if (on ?? !this.classList.contains(name)) this.classList.add(name); else this.classList.remove(name); }
            };
        }
        append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
        contains(node) { return node === this || this.children.some(child => child.contains(node)); }
        matches(selectors) {
            return selectors.split(',').some(selector => {
                selector = selector.trim();
                if (selector === ':focus-visible') return this.focusVisible === true;
                if (selector.startsWith('#')) return this.id === selector.slice(1);
                if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
                const attribute = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
                if (attribute) return this.getAttribute(attribute[1]) === attribute[2];
                if (selector === 'main.container') return this.tagName === 'MAIN' && this.classList.contains('container');
                return this.tagName.toLowerCase() === selector;
            });
        }
        closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
        querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        setAttribute(name, value) { this.attributes[name] = String(value); }
        getAttribute(name) { return this.attributes[name] ?? null; }
        removeAttribute(name) { delete this.attributes[name]; }
        addEventListener(name, callback, capture = false) { (this.events[name] ||= []).push({ callback, capture }); }
        focus() { document.activeElement = this; }
        getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
        getBoundingClientRect() { return { left: 700, top: 30, right: 734, bottom: 64, width: 34, height: 34 }; }
    }
    const body = new Node('body');
    const toolbar = new Node('div', '', 'top-right-buttons');
    const extras = new Node('div', 'toolbar-extras', 'toolbar-extras');
    const setting = new Node('button', 'open-settings', 'icon-button');
    setting.setAttribute('title', '设置');
    const position = new Node('button', 'position-button', 'icon-button');
    position.setAttribute('aria-label', '页面布局与密度');
    const network = new Node('button', 'network-environment-button');
    extras.append(position);
    toolbar.append(extras, network, setting);
    const container = new Node('main', '', 'container content-position-default');
    const select = new Node('select', 'page-position-select');
    const density = new Node('select', 'home-density-select');
    const minimal = new Node('input', 'minimal-mode-toggle');
    const minimalChanges = [];
    minimal.dispatchEvent = event => { minimalChanges.push(event); body.classList.remove('minimal-mode'); };
    body.append(toolbar, container, select, density, minimal);
    const listeners = {};
    document = {
        body, documentElement: { clientWidth: 1024 },
        createElement: tag => new Node(tag),
        createTextNode: text => Object.assign(new Node('#text'), { textContent: text }),
        querySelector: selector => body.querySelector(selector),
        getElementById: id => body.querySelector('#' + id),
        addEventListener: (name, callback) => { (listeners[name] ||= []).push(callback); }
    };
    const settings = new Map();
    const timers = new Map();
    const windowEvents = {};
    let timerId = 0;
    const context = vm.createContext({
        document, innerHeight: 768, HOME_LAYOUT_SETTINGS_KEY: 'homeLayoutSettings', Event,
        getSetting: (key, fallback) => settings.get(key) ?? fallback,
        setSetting: (key, value) => settings.set(key, value),
        setTimeout: (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId; },
        clearTimeout: id => timers.delete(id),
        getComputedStyle: () => ({ visibility: 'visible' }),
        addEventListener: (name, callback) => { (windowEvents[name] ||= []).push(callback); },
        openNavigation: () => body.classList.add('navigation-open'),
        closeNavigation: () => body.classList.remove('navigation-open'),
        closeNetworkEnvironmentPopover() {}
    });
    context.window = context;
    vm.runInContext(readFileSync(new URL('../../HTML/js/links-data.js', import.meta.url), 'utf8'), context);
    vm.runInContext(readFileSync(new URL('../../HTML/js/toolbar.js', import.meta.url), 'utf8'), context);
    listeners.DOMContentLoaded.forEach(callback => callback());
    function emit(node, name, values = {}) {
        const event = {
            target: node, defaultPrevented: false,
            preventDefault() { this.defaultPrevented = true; },
            stopImmediatePropagation() { this.stopped = true; },
            ...values
        };
        const callbacks = [...(node.events[name] || [])].sort((a, b) => Number(b.capture) - Number(a.capture));
        for (const { callback } of callbacks) { callback(event); if (event.stopped) break; }
        return event;
    }
    return { api: context, document, toolbar, extras, setting, position, network, container, select, density, minimal, minimalChanges, settings, timers, listeners, windowEvents, emit };
}

test('设置缺少 aria-label 的旧按钮恢复文字提示，提示框独立于工具栏裁剪', () => {
    const fixture = toolbarFixture();
    assert.equal(fixture.setting.getAttribute('aria-label'), '设置');
    assert.equal(fixture.setting.getAttribute('title'), null);
    fixture.emit(fixture.toolbar, 'pointerover', { target: fixture.setting, pointerType: 'mouse' });
    const tooltip = fixture.document.getElementById('toolbar-tooltip');
    assert.equal(tooltip.textContent, '设置');
    assert.equal(tooltip.hidden, false);
    assert.equal(tooltip.parent, fixture.document.body);
    fixture.emit(fixture.toolbar, 'pointerout', { relatedTarget: null });
    assert.equal(tooltip.hidden, true);
    assert.equal(fixture.setting.getAttribute('aria-describedby'), null);
});

test('位置应用清理旧类、同步设置控件，并兼容无效旧值', () => {
    const fixture = toolbarFixture();
    fixture.api.applyContentPosition('bottom');
    assert.equal(fixture.container.className, 'container content-position-bottom');
    assert.equal(fixture.select.value, 'bottom');
    fixture.api.applyContentPosition('old-value');
    assert.equal(fixture.container.className, 'container content-position-default');
    assert.equal(fixture.select.value, 'default');
});

test('展开动画首帧仍将设置提示定位在下方工具面板之外', () => {
    const fixture = toolbarFixture();
    fixture.toolbar.getBoundingClientRect = () => ({ top: 26 });
    fixture.setting.getBoundingClientRect = () => ({ top: 34, bottom: 68, right: 734 });
    fixture.extras.getBoundingClientRect = () => ({ top: 78, bottom: 126, height: 48 });
    fixture.extras.offsetHeight = 50;
    fixture.api.getComputedStyle = () => ({ visibility: 'hidden', top: '59px' });
    fixture.emit(fixture.toolbar, 'pointerover', { target: fixture.setting, pointerType: 'mouse' });
    assert.equal(fixture.document.getElementById('toolbar-tooltip').style.top, '143px');
});

test('布局菜单保持展开状态，位置变更回到首页即时预览', () => {
    const fixture = toolbarFixture();
    fixture.emit(fixture.position, 'click');
    const menu = fixture.document.getElementById('position-dropdown');
    assert.equal(menu.hidden, false);
    assert.equal(fixture.toolbar.dataset.openMenu, 'layout');
    fixture.document.body.classList.add('navigation-open');
    const choice = menu.querySelectorAll('.dropdown-item').find(button => button.dataset.action === 'bottom');
    fixture.emit(menu, 'click', { target: choice });
    assert.equal(menu.hidden, true);
    assert.equal(fixture.settings.get('contentPosition'), 'bottom');
    assert.equal(fixture.select.value, 'bottom');
    assert.equal(fixture.document.body.classList.contains('navigation-open'), false);
    assert.equal(fixture.document.activeElement, fixture.position);
});

test('密度变更同步设置并打开快捷网格预览，Escape 关闭菜单', () => {
    const fixture = toolbarFixture();
    fixture.emit(fixture.position, 'click');
    const menu = fixture.document.getElementById('position-dropdown');
    const choice = menu.querySelectorAll('.dropdown-item').find(button => button.dataset.density === 'compact');
    fixture.emit(menu, 'click', { target: choice });
    assert.equal(fixture.api.loadHomeLayoutSettings().density, 'compact');
    assert.equal(fixture.density.value, 'compact');
    assert.equal(fixture.document.body.classList.contains('navigation-open'), true);
    fixture.emit(fixture.position, 'click');
    const event = { key: 'Escape', preventDefault() { this.prevented = true; } };
    fixture.listeners.keydown.forEach(callback => callback(event));
    assert.equal(menu.hidden, true);
    assert.equal(event.prevented, true);
    assert.equal(fixture.document.body.classList.contains('navigation-open'), true);
});

test('极简模式选择首页位置时通过原设置入口退出并预览布局', () => {
    const fixture = toolbarFixture();
    fixture.document.body.classList.add('minimal-mode');
    fixture.minimal.checked = true;
    fixture.emit(fixture.position, 'click');
    const menu = fixture.document.getElementById('position-dropdown');
    const choice = menu.querySelectorAll('.dropdown-item').find(button => button.dataset.action === 'top');
    fixture.emit(menu, 'click', { target: choice });
    assert.equal(fixture.minimal.checked, false);
    assert.equal(fixture.minimalChanges[0].type, 'change');
    assert.equal(fixture.document.body.classList.contains('minimal-mode'), false);
    assert.equal(fixture.select.value, 'top');
});

test('触屏长按展开工具并抑制该次设置点击，普通点击保持原行为', () => {
    const fixture = toolbarFixture();
    fixture.emit(fixture.toolbar, 'pointerdown', { target: fixture.setting, pointerType: 'touch', clientX: 10, clientY: 10 });
    [...fixture.timers.values()].find(timer => timer.ms === 450).callback();
    assert.equal(fixture.toolbar.classList.contains('tools-expanded'), true);
    fixture.emit(fixture.toolbar, 'pointerup');
    const heldClick = fixture.emit(fixture.toolbar, 'click', { target: fixture.setting });
    assert.equal(heldClick.defaultPrevented, true);
    assert.equal(heldClick.stopped, true);
    const normalClick = fixture.emit(fixture.toolbar, 'click', { target: fixture.setting });
    assert.equal(normalClick.defaultPrevented, false);
});

test('触屏滑动与取消手势结束长按计时，菜单内部滚动保持可用', () => {
    const fixture = toolbarFixture();
    fixture.emit(fixture.toolbar, 'pointerdown', { target: fixture.network, pointerType: 'touch', clientX: 10, clientY: 10 });
    fixture.emit(fixture.toolbar, 'pointermove', { clientX: 35, clientY: 10 });
    assert.equal([...fixture.timers.values()].some(timer => timer.ms === 450), false);
    fixture.emit(fixture.toolbar, 'pointercancel');
    fixture.emit(fixture.position, 'click');
    const menu = fixture.document.getElementById('position-dropdown');
    fixture.windowEvents.scroll.forEach(callback => callback({ target: menu }));
    assert.equal(menu.hidden, false);
    fixture.windowEvents.scroll.forEach(callback => callback({ target: fixture.container }));
    assert.equal(menu.hidden, true);
});

test('设置关闭动画结束时保留后续焦点，快速重新打开时保持可见', () => {
    const fixture = toolbarFixture();
    const panel = fixture.document.createElement('div');
    panel.id = 'settings-container';
    panel.className = 'show';
    panel.style.display = 'flex';
    panel._lastFocused = fixture.setting;
    fixture.document.body.append(panel);
    fixture.document.removeEventListener = () => {};
    fixture.api.trapSettingsFocus = () => {};
    const source = readFileSync(new URL('../../HTML/js/main.js', import.meta.url), 'utf8');
    const start = source.indexOf('function closeSettingsPanel()');
    const end = source.indexOf('window.closeSettingsPanel =', start);
    vm.runInContext(source.slice(start, end), fixture.api);
    fixture.api.closeSettingsPanel();
    fixture.network.focus();
    fixture.timers.get(panel._closeTimer).callback();
    assert.equal(fixture.document.activeElement, fixture.network);
    assert.equal(panel.style.display, 'none');
    panel.style.display = 'flex';
    panel.classList.add('show');
    fixture.api.closeSettingsPanel();
    panel.classList.add('show');
    fixture.timers.get(panel._closeTimer).callback();
    assert.equal(panel.style.display, 'flex');
});

test('常驻路线与设置，悬停和键盘聚焦展开，并提供液态界面的位置覆盖', () => {
    const css = readFileSync(new URL('../../HTML/CSS/toolbar.css', import.meta.url), 'utf8');
    assert.match(css, /top-right-buttons:hover \.toolbar-extras/);
    assert.match(css, /top-right-buttons:has\(:focus-visible\)/);
    assert.match(css, /container\.content-position-top/);
    assert.match(css, /container\.content-position-bottom/);
    assert.match(css, /toolbar-extras[\s\S]+visibility: hidden/);
    const gridCss = readFileSync(new URL('../../HTML/CSS/navigation.css', import.meta.url), 'utf8');
    assert.match(gridCss, /home-density-compact[^\n]+--shortcut-height: 94px/);
    assert.match(gridCss, /home-density-spacious[^\n]+--shortcut-height: 148px/);
});
