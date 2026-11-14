import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadDataLayer } from './data-harness.mjs';

function settingsApi(saved = [], catalog = [], confirmed = true) {
  const { api } = loadDataLayer();
  const settings = {};
  const message = {
    classList: { add() {}, remove() {} },
    setAttribute() {}, removeAttribute() {}, addEventListener() {}
  };
  const context = vm.createContext({
    ...api, links: structuredClone(saved), catalogEntries: structuredClone(catalog),
    document: { addEventListener() {}, getElementById: id => id === 'message-container' ? message : null },
    getSetting: (key, fallback) => settings[key] ?? fallback,
    setSetting: (key, value) => { settings[key] = value; },
    setTimeout() {}, clearTimeout() {}, confirm: () => confirmed,
    persistLinks() {}, renderLinksByCategory() {}, showMessage() {}
  });
  context.window = context;
  for (const file of ['navigation', 'settings-links']) {
    vm.runInContext(readFileSync(new URL(`../../HTML/js/${file}.js`, import.meta.url), 'utf8'), context);
  }
  return { api: context, settings };
}

const website = { ID: 1, name: 'NAS', category: '设备', urls: [
  { address: 'http://192.168.1.100:5000', label: '公司', priority: 1 },
  { address: 'http://100.90.1.2:5000', label: 'Tailscale', priority: 2 }
] };
const resource = { ID: 'mcp-0', catalogKey: 'mcp:files', name: 'Files', kind: 'mcp', category: 'MCP', urls: [], copyValue: 'npx files --root /workspace' };

test('已保存的目录覆盖继续携带连接元信息，旧分类可识别资源类型', () => {
  const original = { ...resource, transport: 'stdio', command: 'npx', args: ['files'], envKeys: ['API_KEY'] };
  const saved = { ID: 8, catalogKey: original.catalogKey, name: '本地文件', kind: 'mcp', category: '常用', urls: [], copyValue: original.copyValue };
  const { api } = settingsApi([saved], [original]);
  const result = api.getNavigationItems()[0];
  assert.equal(result.ID, 8);
  assert.equal(result.command, 'npx');
  assert.deepEqual(Array.from(result.args), ['files']);
  assert.equal(result.catalog, false);
  assert.equal(api.getNavigationItemKind({ catalogKey: 'mcp:legacy', category: '工具' }), 'mcp');
});

test('设置列表与首页共用网站、AI、MCP、Skill 合并规则', () => {
  const { api, settings } = settingsApi([website], [resource]);
  assert.equal(api.getNavigationItems().length, 2);
  api.assignSettingsLinkCategory(resource, '工具');
  assert.equal(api.getNavigationItems().length, 2);
  assert.equal(api.getNavigationItems()[1].category, '工具');
  settings.hiddenCatalogKeys = ['mcp:files'];
  assert.equal(api.getNavigationItems([]).length, 0);
});

test('设置搜索同时匹配地址标签、端口、资源命令与入口类型', () => {
  const { api } = settingsApi();
  const matches = (link, searchTerm, kind = '') => api.linkMatchesSettingsFilters(link, { searchTerm, kind, category: '' });
  assert.equal(matches(website, 'tailscale'), true);
  assert.equal(matches(website, '5000', 'site'), true);
  assert.equal(matches(resource, '/workspace', 'mcp'), true);
  assert.equal(matches(resource, 'files', 'skill'), false);
});

test('移动已有入口保留多地址、标签与优先级', () => {
  const { api } = settingsApi([website]);
  api.assignSettingsLinkCategory(website, '家里');
  assert.equal(api.links[0].category, '家里');
  assert.equal(JSON.stringify(api.links[0].urls), JSON.stringify(website.urls));
});

test('移动扫描目录项创建稳定覆盖，重复移动只更新同一记录', () => {
  const { api } = settingsApi([website], [resource]);
  api.assignSettingsLinkCategory(resource, '工具');
  api.assignSettingsLinkCategory(resource, '开发');
  assert.equal(api.links.length, 2);
  assert.equal(api.links[1].ID, 2);
  assert.equal(api.links[1].catalogKey, resource.catalogKey);
  assert.equal(api.links[1].copyValue, resource.copyValue);
  assert.equal(api.links[1].category, '开发');
});

test('扫描资源覆盖在服务器回读和规范化后保留命令及分组', () => {
  const { api } = settingsApi([], [resource]);
  api.assignSettingsLinkCategory({ ...resource, url: '' }, '协议服务');
  const restored = api.normalizeLinks(JSON.parse(JSON.stringify(api.links)));
  assert.equal(restored.length, 1);
  assert.equal(restored[0].category, '协议服务');
  assert.equal(restored[0].copyValue, resource.copyValue);
  assert.equal(restored[0].url, undefined);
});

test('删除扫描目录项后保持隐藏，撤销恢复原目录项', () => {
  const { api, settings } = settingsApi([], [resource]);
  api.deleteSettingsLink(resource);
  assert.equal(api.getNavigationItems().length, 0);
  assert.equal(settings.hiddenCatalogKeys[0], resource.catalogKey);
  api.undoSettingsLinkDelete();
  assert.equal(api.getNavigationItems().length, 1);
  assert.equal(api.links.length, 0);
});

test('删除自定义覆盖不会重新露出扫描原项，撤销恢复覆盖', () => {
  const override = { ...resource, ID: 5, name: '我的文件服务' };
  const { api } = settingsApi([website, override], [resource]);
  api.deleteSettingsLink(override);
  assert.equal(api.getNavigationItems().length, 1);
  api.undoSettingsLinkDelete();
  assert.equal(api.getNavigationItems().length, 2);
  assert.equal(api.links[1].name, override.name);
});

test('取消删除保留条目，撤销普通链接保留原始排序', () => {
  const cancelled = settingsApi([website], [], false).api;
  cancelled.deleteSettingsLink(website);
  assert.equal(cancelled.links.length, 1);
  const { api } = settingsApi([website, { ...website, ID: 3, name: 'Other' }]);
  api.deleteSettingsLink(website);
  api.undoSettingsLinkDelete();
  assert.equal(api.links[0].ID, website.ID);
  assert.equal(api.links.length, 2);
});

test('地址摘要保留服务端口和路径', () => {
  const { api } = settingsApi();
  assert.equal(api.formatUrlForDisplay('http://192.168.1.100:5000/admin'), '192.168.1.100:5000/admin');
});

test('撤销期间新增入口占用旧 ID 时，恢复条目使用新 ID', () => {
  const { api } = settingsApi([website]);
  api.deleteSettingsLink(website);
  api.links.push({ ...website, name: '刚新增的入口' });
  api.undoSettingsLinkDelete();
  assert.equal(api.links.length, 2);
  assert.equal(new Set(api.links.map(link => link.ID)).size, 2);
  assert.equal(api.links[0].name, website.name);
});
