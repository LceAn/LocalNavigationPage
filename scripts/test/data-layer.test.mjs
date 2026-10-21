// scripts/test/data-layer.test.mjs — 数据层单元测试(node:test,零依赖)
// 覆盖:URL 协议白名单、链接规范化、地址分类、设置存取与迁移。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDataLayer } from './data-harness.mjs';

function fresh(storage) {
  const ctx = loadDataLayer({ storage });
  return ctx.api;
}

// ---------- URL 安全 ----------
test('isSafeUrl:协议白名单放行 http/https/mailto/tel/ftp/file', () => {
  const api = fresh();
  for (const url of ['http://a.com', 'https://a.com', 'mailto:a@b.c', 'tel:123', 'ftp://f.com', 'file:///x']) {
    assert.equal(api.isSafeUrl(url), true, url);
  }
});

test('isSafeUrl:javascript/data/vbscript 一律拒绝;相对路径按当前页解析后放行', () => {
  const api = fresh();
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'jAvAsCrIpT:alert(1)', '']) {
    assert.equal(api.isSafeUrl(url), false, url);
  }
  // 相对 URL 会以 window.location.href 为基准解析(同源相对链接是特性)
  assert.equal(api.isSafeUrl('not a url'), true);
});

test('sanitizeUrl:非法协议回退 #,可指定协议子集', () => {
  const api = fresh();
  assert.equal(api.sanitizeUrl('javascript:x'), '#');
  assert.equal(api.sanitizeUrl('http://ok.com'), 'http://ok.com');
  assert.equal(api.sanitizeUrl('ftp://x', '#', ['http:', 'https:']), '#');
});

// ---------- 链接规范化 ----------
test('normalizeLinks:丢弃全部地址非法的链接', () => {
  const api = fresh();
  const out = api.normalizeLinks([
    { ID: 1, name: 'evil', url: 'javascript:alert(1)' },
    { ID: 2, name: 'ok', url: 'https://ok.example' }
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'ok');
});

test('normalizeLinks:urls 数组内非法地址被剔除,合法地址保留', () => {
  const api = fresh();
  const out = api.normalizeLinks([{
    ID: 1, name: 'multi',
    urls: [
      { address: 'javascript:x', label: 'bad' },
      { address: 'http://good.example', label: 'good', priority: 1 }
    ]
  }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'http://good.example'); // 剩单地址收敛为 url 字段
});

test('normalizeLinks:重复/非法 ID 自动重排,不丢链接', () => {
  const api = fresh();
  const out = api.normalizeLinks([
    { ID: 5, name: 'a', url: 'http://a.example' },
    { ID: 5, name: 'b', url: 'http://b.example' },
    { ID: -1, name: 'c', url: 'http://c.example' }
  ]);
  assert.equal(out.length, 3);
  // 实现为顺延 nextId:首个 5 保留,冲突的 5→6,非法 -1→7
  assert.deepEqual(out.map(l => l.ID).sort((a, b) => a - b), [5, 6, 7]);
});

test('normalizeLinks:多地址收敛为 urls,单地址收敛为 url 字段', () => {
  const api = fresh();
  const [multi] = api.normalizeLinks([{ ID: 1, name: 'm', urls: [
    { address: 'http://a.example' }, { address: 'http://b.example' }
  ]}]);
  assert.ok(Array.isArray(multi.urls) && multi.url === undefined);
  const [single] = api.normalizeLinks([{ ID: 2, name: 's', urls: [{ address: 'http://c.example' }] }]);
  assert.equal(single.url, 'http://c.example');
  assert.ok(!Array.isArray(single.urls));
});

test('normalizeLinks:缺 name/category 填默认值', () => {
  const api = fresh();
  const [out] = api.normalizeLinks([{ ID: 1, url: 'http://x.example' }]);
  assert.equal(out.name, '未命名');
  assert.equal(out.category, '未分类');
});

// ---------- 地址分类 ----------
test('getUrlChoiceMeta:私网 IP / 内网标记 → local', () => {
  const api = fresh();
  assert.equal(api.getUrlChoiceMeta({ address: 'http://192.168.1.10:8080' }).type, 'local');
  assert.equal(api.getUrlChoiceMeta({ address: 'http://10.0.0.5' }).type, 'local');
  assert.equal(api.getUrlChoiceMeta({ address: 'http://172.16.0.1' }).type, 'local');
  assert.equal(api.getUrlChoiceMeta({ address: 'http://x.com', label: '本地' }).type, 'local');
});

test('getUrlChoiceMeta:tailscale 标记 → tunnel,其余 → remote', () => {
  const api = fresh();
  assert.equal(api.getUrlChoiceMeta({ address: 'https://x.ts.net', label: 'Tailscale' }).type, 'tunnel');
  assert.equal(api.getUrlChoiceMeta({ address: 'https://public.example' }).type, 'remote');
});

// ---------- 渲染前过滤 ----------
test('getSafeLinkUrls:非法地址返回 # 并被过滤', () => {
  const api = fresh();
  const out = api.getSafeLinkUrls({ urls: [
    { address: 'javascript:x' }, { address: 'http://ok.example' }
  ]});
  assert.equal(out.length, 1);
  assert.equal(out[0].address, 'http://ok.example');
});

// ---------- 设置存取与迁移 ----------
test('设置容器:getSetting/setSetting 往返一致,默认值生效', () => {
  const api = fresh();
  assert.equal(api.getSetting('not-exist', 'fallback'), 'fallback');
  api.setSetting('theme', 'dark');
  assert.equal(api.getSetting('theme', null), 'dark');
});

test('v1 散 key 迁移:旧 theme 键并入 lnp:settings 容器', () => {
  const api = fresh({ theme: '"dark"', navigationLinks: '[{"ID":1,"name":"x","url":"http://a.example"}]' });
  assert.equal(api.getSetting('theme', null), 'dark');
});

test('损坏的容器 JSON:回退迁移路径而不崩溃', () => {
  const api = fresh({ 'lnp:settings': '{broken json!!' });
  assert.equal(api.getSetting('anything', 'def'), 'def');
});

// ---------- 探测频率 ----------
test('getProbeIntervalMs:默认 60s,设置可覆盖,0 表示关闭', () => {
  const api = fresh();
  assert.equal(api.getProbeIntervalMs(), 60000);
  api.setSetting('probeIntervalMs', 300000);
  assert.equal(api.getProbeIntervalMs(), 300000);
  api.setSetting('probeIntervalMs', 0);
  assert.equal(api.getProbeIntervalMs(), 0);
});

test('getProbeIntervalMs:非法输入回退默认值', () => {
  const api = fresh();
  api.setSetting('probeIntervalMs', 'abc');
  assert.equal(api.getProbeIntervalMs(), 60000);
});

// ---------- 转义与主机分类补充 ----------
test('escapeHTML:转义全部 HTML 元字符', () => {
  const api = fresh();
  assert.equal(api.escapeHTML('<img src=x onerror=alert(1)>"\''),
    '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;');
  // null/undefined 统一输出空串(比渲染 'null' 字符串更干净)
  assert.equal(api.escapeHTML(null), '');
  assert.equal(api.escapeHTML(undefined), '');
});

test('isPrivateHost:覆盖环回/链路本地/IPv6/边界网段', () => {
  const api = fresh();
  const privates = ['localhost', 'nas.local', 'router.lan', '127.0.0.1', '127.255.255.255',
    '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255',
    '192.168.0.1', '192.168.255.255', '169.254.1.1', '::1', 'fe80::1'];
  for (const h of privates) assert.equal(api.isPrivateHost(h), true, h);
  const publics = ['example.com', '8.8.8.8', '11.0.0.1', '172.32.0.1', '172.15.255.255',
    '192.169.0.1', '169.255.0.1', '2001:db8::1'];
  for (const h of publics) assert.equal(api.isPrivateHost(h), false, h);
});

test('getPreferredUrlInfo:记住上次选择的地址优先', () => {
  const api = fresh();
  const link = { ID: 9, urls: [
    { address: 'http://lan.example', label: '内网', priority: 1 },
    { address: 'https://wan.example', label: '公网', priority: 2 }
  ]};
  // 无记忆:按 priority 取第一个
  assert.equal(api.getPreferredUrlInfo(link).address, 'http://lan.example');
  // 记住公网后:优先公网
  api.rememberLastUsedLinkUrl(link, 'https://wan.example');
  assert.equal(api.getPreferredUrlInfo(link).address, 'https://wan.example');
});

test('getSafeLinkUrls:多地址按 priority 升序', () => {
  const api = fresh();
  const out = api.getSafeLinkUrls({ urls: [
    { address: 'http://b.example', priority: 2 },
    { address: 'http://a.example', priority: 1 }
  ]});
  assert.deepEqual(out.map(u => u.address), ['http://a.example', 'http://b.example']);
});
