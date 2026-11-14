import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../HTML/js/server-sync.js', import.meta.url), 'utf8');
const merge = new Function('window', 'document', source + '\nreturn mergeNavigationConfig;')({}, { addEventListener() {} });
const entry = (ID, name) => ({ ID, name, url: 'https://example.com/' + ID });
const config = links => ({ links, settings: {} });

test('自动保存合并不同设备修改的不同链接', () => {
  const base = config([entry(1, 'A'), entry(2, 'B')]);
  const local = config([entry(1, '本机 A'), entry(2, 'B')]);
  const remote = config([entry(1, 'A'), entry(2, '远程 B')]);
  assert.deepEqual(merge(base, local, remote).links.map(item => item.name), ['本机 A', '远程 B']);
});
test('同时新增发生 ID 冲突时保留两条链接', () => {
  const result = merge(config([]), config([entry(1, '本机')]), config([entry(1, '远程')]));
  assert.equal(result.links.length, 2);
  assert.equal(new Set(result.links.map(item => item.ID)).size, 2);
});
test('同一链接不同字段的修改可以合并', () => {
  const base = config([entry(1, 'A')]);
  const local = config([{ ...base.links[0], name: '本机名称' }]);
  const remote = config([{ ...base.links[0], category: 'AI' }]);
  assert.deepEqual(merge(base, local, remote).links[0], { ...local.links[0], category: 'AI' });
});
test('同一字段并发修改保留冲突并要求合并', () => {
  assert.throws(() => merge(config([entry(1, 'A')]), config([entry(1, '本机')]), config([entry(1, '远程')])), /其他设备修改/);
});
test('删除与远程编辑冲突时保留服务器数据', () => {
  assert.throws(() => merge(config([entry(1, 'A')]), config([]), config([entry(1, '远程')])), /删除操作已保留为草稿/);
  assert.throws(() => merge(config([entry(1, 'A')]), config([entry(1, '本机')]), config([])), /已被其他设备删除/);
});
test('正常删除与新增保留远程新增项', () => {
  const result = merge(config([entry(1, 'A')]), config([entry(2, '本机新建')]), config([entry(1, 'A'), entry(3, '远程新建')]));
  assert.deepEqual(result.links.map(item => item.ID), [3, 2]);
});
test('共享分类的修改保留其他设备新增的设置', () => {
  const result = merge({ ...config([]), settings: { customCategories: [] } }, { ...config([]), settings: { customCategories: ['AI'] } }, { ...config([]), settings: { customCategories: [], customCategoryIcons: { AI: 'ri-robot-line' } } });
  assert.deepEqual(result.settings, { customCategories: ['AI'], customCategoryIcons: { AI: 'ri-robot-line' } });
});
