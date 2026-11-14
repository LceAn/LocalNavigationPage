import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { loadDataLayer } from './data-harness.mjs';

function interactionFixture() {
  const listeners = {};
  const nodes = new Map();
  const state = { popupVisible: true, drawerOpen: true };
  const document = {
    addEventListener(name, callback) { (listeners[name] ||= []).push(callback); },
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { hidden: id !== 'navigation-view', addEventListener() {}, setAttribute() {}, contains: () => false });
      return nodes.get(id);
    },
    querySelector: () => state.popupVisible ? {} : null,
    querySelectorAll: () => [],
    body: {
      append() {}, insertBefore() {},
      classList: { remove() { state.drawerOpen = false; } }
    }
  };
  const context = vm.createContext({
    document, links: [],
    addEventListener() {},
    matchMedia: () => ({ matches: true }),
    getSetting: (key, fallback) => fallback,
    LAST_USED_LINK_URLS_KEY: 'lastUsedLinkUrls',
    popup: { remove() { state.popupVisible = false; } },
    anchor: { setAttribute() {}, focus() {}, isConnected: true }
  });
  context.window = context;
  vm.runInContext(readFileSync(new URL('../../HTML/js/home-render.js', import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('../../HTML/js/navigation.js', import.meta.url), 'utf8'), context);
  document.querySelector = selector => selector === '.skip-link' ? { addEventListener() {} } : state.popupVisible ? {} : null;
  for (const callback of listeners.DOMContentLoaded) callback();
  return { context, document, listeners, state };
}

test('Escape 按注册顺序先关闭地址菜单，保留快捷抽屉', () => {
  const { context, listeners, state, document } = interactionFixture();
  vm.runInContext('routePopover = popup; routePopoverAnchor = anchor;', context);
  const event = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  for (const callback of listeners.keydown) callback(event);
  assert.equal(state.popupVisible, false);
  assert.equal(document.getElementById('navigation-view').hidden, false);
  assert.equal(state.drawerOpen, true);
});

test('卡片增加外层后，向下箭头仍按网格列数移动', () => {
  const { context, listeners, document } = interactionFixture();
  const grid = { clientWidth: 960 };
  const item = { offsetWidth: 231 };
  const cards = Array.from({ length: 8 }, (_, index) => ({
    index, tagName: 'A',
    classList: { contains: name => name === 'link-card' },
    closest: selector => selector === '.navigation-grid' ? grid : item,
    focus() { document.activeElement = this; }
  }));
  context.getComputedStyle = () => ({ columnGap: '12px' });
  document.activeElement = cards[0];
  document.querySelectorAll = () => cards;
  const event = { key: 'ArrowDown', preventDefault() {} };
  for (const callback of listeners.keydown) callback(event);
  assert.equal(document.activeElement.index, 4);
});

test('气泡区分 Tailscale、其他穿透地址及非网页协议', () => {
  const { context } = interactionFixture();
  const { api } = loadDataLayer();
  context.URL = URL;
  context.location = { href: 'http://localhost/' };
  context.getUrlChoiceMeta = api.getUrlChoiceMeta;
  context.isTunnelHost = api.isTunnelHost;
  for (const [address, label, expected] of [
    ['http://100.90.1.2', '', 'Tailscale'],
    ['https://service.ts.net', '', 'Tailscale'],
    ['https://public.example.com', 'FRP', '内网穿透'],
    ['http://192.168.1.2', '公司', '局域网'],
    ['https://example.com', '', '公网'],
    ['mailto:test@example.com', '', '邮件']
  ]) {
    const url = { address, label };
    assert.equal(context.getRouteChipLabel(url, [url]), expected);
  }
});
