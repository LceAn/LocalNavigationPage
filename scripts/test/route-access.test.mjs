import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDataLayer } from './data-harness.mjs';

const service = { ID: 10, name: 'NAS', urls: [
  { address: 'http://192.168.1.20:5000', label: '公司', priority: 1 },
  { address: 'http://100.90.1.2:5000', label: 'Tailscale', priority: 2 },
  { address: 'https://nas.example.com', label: '公网', priority: 3 }
] };

test('自动模式按最新延迟选路，覆盖旧访问记忆并忽略旧智能选路开关', () => {
  const { api } = loadDataLayer();
  api.setSetting('smartRouting', false);
  api.rememberLastUsedLinkUrl(service, service.urls[0].address);
  api.setLinkStatus(service.urls[0].address, { online: true, ms: 90 });
  api.setLinkStatus(service.urls[1].address, { online: true, ms: 25 });
  api.setLinkStatus(service.urls[2].address, { online: true, ms: 50 });
  assert.equal(api.getPreferredUrlInfo(service).address, service.urls[1].address);
  const opened = [];
  api.open = address => opened.push(address);
  api.setLinkStatus(service.urls[2].address, { online: true, ms: 10 });
  api.openLinkUrl(service, service.urls[0].address);
  assert.deepEqual(opened, [service.urls[2].address]);
  assert.equal(api.getPreferredUrlInfo(service).address, service.urls[2].address);
});

test('测速时保留固定默认和手动线路，同一线路内优先最快地址', () => {
  const { api } = loadDataLayer();
  api.setLinkStatus(service.urls[0].address, { online: true, ms: 30 });
  api.setLinkStatus(service.urls[1].address, { online: true, ms: 3 });
  api.setDefaultLinkUrl(service, service.urls[0].address);
  assert.equal(api.getPreferredUrlInfo(service).address, service.urls[0].address);
  api.setDefaultLinkUrl(service, '');
  api.setSetting('networkMode', 'local');
  assert.equal(api.getPreferredUrlInfo(service).address, service.urls[0].address);
  const second = { address: 'http://192.168.2.20', label: '家里', priority: 5 };
  api.setLinkStatus(second.address, { online: true, ms: 5 });
  assert.equal(api.getPreferredUrlInfo({ ...service, urls: [...service.urls, second] }).address, second.address);
});

test('最低延迟选择排除失效、过期与异常缓存，未检测时沿用配置优先级', () => {
  const { api } = loadDataLayer();
  api.setLinkStatus(service.urls[0].address, { online: false, ms: 1, httpStatus: 500 });
  api.setLinkStatus(service.urls[1].address, { online: true, ms: null });
  api.setLinkStatus(service.urls[2].address, { online: null, ms: 40 });
  assert.equal(api.getPreferredUrlInfo(service).address, service.urls[2].address);
  api.setSetting('linkStatusCache', { [service.urls[2].address]: { online: true, ms: 1, ts: Date.now() - 1000000, probeVersion: 2 } });
  assert.equal(api.getPreferredUrlInfo(service).address, service.urls[0].address);
  api.setLinkStatus(service.urls[0].address, { online: undefined, ms: -1 });
  api.setLinkStatus(service.urls[1].address, { online: true, ms: Infinity });
  assert.equal(api.getFastestMeasuredUrl(service.urls), null);
});

test('公司导航从家中访问时，家中服务走 LAN、公司服务走 Tailscale', () => {
  const { api } = loadDataLayer();
  api.location = { hostname: 'office.tailnet.ts.net', href: 'https://office.tailnet.ts.net/' };
  const home = { ID: 21, name: '家中 NAS', urls: [
    { address: 'http://192.168.1.10:5000', label: '家中局域网', priority: 1 },
    { address: 'http://100.90.1.10:5000', label: 'Tailscale', priority: 2 }
  ] };
  const office = { ID: 22, name: '公司知识库', urls: [
    { address: 'http://192.168.3.20:3000', label: '公司局域网', priority: 1 },
    { address: 'http://100.90.3.20:3000', label: 'Tailscale', priority: 2 }
  ] };
  api.setLinkStatus(home.urls[0].address, { online: true, ms: 3 });
  api.setLinkStatus(home.urls[1].address, { online: true, ms: 60 });
  api.setLinkStatus(office.urls[0].address, { online: false, ms: null });
  api.setLinkStatus(office.urls[1].address, { online: true, ms: 38 });
  assert.equal(api.getPreferredUrlInfo(home).address, home.urls[0].address);
  assert.equal(api.getPreferredUrlInfo(office).address, office.urls[1].address);
  api.setSetting('networkMode', 'local');
  assert.equal(api.getPreferredUrlInfo(home).address, home.urls[0].address);
  assert.equal(api.getPreferredUrlInfo(office).address, office.urls[1].address);
});

test('导航服务的公网或 Tailscale 主机名均不改变无测量时的配置优先级', () => {
  for (const hostname of ['office.example.com', 'office.tailnet.ts.net', '192.168.3.2']) {
    const { api } = loadDataLayer();
    api.location = { hostname, href: 'https://' + hostname + '/' };
    assert.equal(api.getPreferredUrlInfo(service).address, service.urls[0].address);
  }
});

test('跨域重试单独计时，响应释放后保留毫秒数供显示和选路', async () => {
  const { api } = loadDataLayer();
  let time = 0;
  let cancelled = false;
  api.performance = { now: () => time };
  api.fetch = async (address, options) => {
    if (options.mode === 'cors') { time = 600; throw new Error('CORS'); }
    time = 617;
    return { type: 'opaque', status: 0, body: { cancel: async () => { cancelled = true; } } };
  };
  await api.probeLinkStatuses([service]);
  assert.equal(api.getCachedStatusForUrl(service.urls[0].address).ms, 17);
  assert.match(api.getUrlProbeState(service.urls[0].address).text, /17ms/);
  assert.equal(cancelled, true);
});

test('单项默认地址覆盖全局线路，取消固定后重新跟随全局', () => {
  const { api } = loadDataLayer();
  api.setSetting('networkMode', 'local');
  api.setDefaultLinkUrl(service, service.urls[1].address);
  assert.equal(api.getPreferredUrlInfo(service).address, service.urls[1].address);
  api.rememberLastUsedLinkUrl(service, service.urls[2].address);
  api.setDefaultLinkUrl(service, '');
  assert.equal(api.getPreferredUrlInfo(service).address, service.urls[0].address);
  api.setSetting('networkMode', 'auto');
  assert.equal(api.getPreferredUrlInfo(service).address, service.urls[0].address);
});

test('目录项默认设置使用稳定 catalogKey，URL 删除后回退有效地址', () => {
  const { api } = loadDataLayer();
  const catalog = { ...service, ID: 'mcp-1', catalogKey: 'mcp:files' };
  api.setDefaultLinkUrl(catalog, service.urls[1].address);
  assert.equal(api.getPinnedLinkUrl({ ...catalog, ID: 'mcp-8' }), service.urls[1].address);
  assert.equal(api.setDefaultLinkUrl(catalog, 'javascript:alert(1)'), false);
  const edited = { ...catalog, urls: [service.urls[0]] };
  assert.equal(api.getPinnedLinkUrl(edited), '');
  assert.equal(api.getPreferredUrlInfo(edited).address, service.urls[0].address);
});

test('显式直达指定 URL，保留已有默认选择并跳过智能回退', () => {
  const { api } = loadDataLayer();
  const opened = [];
  api.open = url => opened.push(url);
  api.setSetting('smartRouting', true);
  api.setDefaultLinkUrl(service, service.urls[1].address);
  api.setLinkStatus(service.urls[0].address, { online: false, ms: null });
  api.setLinkStatus(service.urls[2].address, { online: true, ms: 1 });
  api.openLinkUrl(service, service.urls[0].address, { direct: true });
  assert.deepEqual(opened, [service.urls[0].address]);
  assert.equal(api.getPreferredUrlInfo(service).address, service.urls[1].address);
  assert.deepEqual(api.getSetting(api.LAST_USED_LINK_URLS_KEY, {}), {});
});

test('固定默认地址保持明确选择，自动模式继续支持智能回退', () => {
  const { api } = loadDataLayer();
  const opened = [];
  api.open = url => opened.push(url);
  api.setSetting('smartRouting', true);
  api.setLinkStatus(service.urls[0].address, { online: false, ms: null });
  api.setLinkStatus(service.urls[2].address, { online: true, ms: 5 });
  api.openLinkUrl(service, service.urls[0].address);
  assert.equal(opened[0], service.urls[2].address);
  api.setDefaultLinkUrl(service, service.urls[0].address);
  api.openLinkUrl(service, service.urls[0].address);
  assert.equal(opened[1], service.urls[0].address);
});

test('每个 HTTP(S) URL 独立检测，覆盖局域网、Tailscale 与公网', async () => {
  const { api } = loadDataLayer();
  const requested = [];
  api.fetch = async address => {
    requested.push(address);
    if (address === service.urls[1].address) throw new Error('offline');
    return { status: 200, type: 'basic' };
  };
  await api.probeLinkStatuses([service, { ...service, ID: 20 }]);
  assert.deepEqual([...new Set(requested)], service.urls.map(url => url.address));
  assert.equal(requested.filter(address => address === service.urls[1].address).length, 2);
  assert.equal(api.getUrlProbeState(service.urls[0].address).state, 'online');
  assert.equal(api.getUrlProbeState(service.urls[1].address).state, 'unreachable');
  assert.equal(api.getUrlProbeState(service.urls[2].address).state, 'online');
});

test('并发刷新共享同一 URL 的检测任务，检测中状态独立可读', async () => {
  const { api } = loadDataLayer();
  let requested = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  api.fetch = () => { requested += 1; return pending; };
  const entry = { ID: 1, url: service.urls[0].address };
  const first = api.probeLinkStatuses([entry]);
  const second = api.probeLinkStatuses([entry]);
  assert.equal(requested, 1);
  assert.equal(api.getUrlProbeState(entry.url).state, 'checking');
  release({ status: 200, type: 'basic' });
  await Promise.all([first, second]);
  assert.equal(api.getUrlProbeState(entry.url).state, 'online');
});

test('检测限制为最多六个并发请求', async () => {
  const { api } = loadDataLayer();
  let active = 0;
  let maximum = 0;
  api.fetch = async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active -= 1;
    return { status: 200, type: 'basic' };
  };
  await api.probeLinkStatuses(Array.from({ length: 14 }, (_, index) => ({ ID: index + 1, url: `http://192.168.1.${index + 1}` })));
  assert.equal(maximum, 6);
  assert.equal(Object.keys(api.getLinkStatusCache()).length, 14);
});

test('未知、过期、关闭与不支持检测使用独立状态', async () => {
  const { api } = loadDataLayer();
  const address = service.urls[0].address;
  assert.equal(api.getUrlProbeState(address).state, 'unknown');
  api.setSetting('linkStatusCache', { [address]: { online: true, ms: 10, probeVersion: 2, ts: Date.now() - 1000000 } });
  assert.equal(api.getUrlProbeState(address).state, 'unknown');
  assert.equal(api.getUrlProbeState('mailto:test@example.com').state, 'unsupported');
  api.setSetting('probeIntervalMs', 0);
  api.fetch = () => { throw new Error('should not request'); };
  await api.probeLinkStatuses([service]);
  assert.equal(api.getUrlProbeState(address).state, 'off');
});

test('不同批次同时刷新也共用六个并发名额', async () => {
  const { api } = loadDataLayer();
  let active = 0;
  let maximum = 0;
  api.fetch = async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active -= 1;
    return { status: 200, type: 'basic' };
  };
  const entries = Array.from({ length: 18 }, (_, index) => ({ ID: index + 1, url: `http://192.168.2.${index + 1}` }));
  await Promise.all([api.probeLinkStatuses(entries.slice(0, 10)), api.probeLinkStatuses(entries.slice(10))]);
  assert.equal(maximum, 6);
  assert.equal(Object.keys(api.getLinkStatusCache()).length, 18);
});

test('关闭探测时取消尚未发出的队列请求', async () => {
  const { api } = loadDataLayer();
  let requested = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  api.fetch = () => { requested += 1; return pending; };
  const entries = Array.from({ length: 10 }, (_, index) => ({ ID: index + 1, url: `http://192.168.2.${index + 1}` }));
  const run = api.probeLinkStatuses(entries);
  assert.equal(requested, 6);
  api.setSetting('probeIntervalMs', 0);
  release({ status: 200, type: 'basic' });
  await run;
  assert.equal(requested, 6);
});

test('无效旧偏好值回到默认设置', () => {
  const { api } = loadDataLayer();
  for (const value of [null, [], 'invalid']) {
    api.setSetting('linkDefaultUrls', value);
    assert.equal(api.getPinnedLinkUrl(service), '');
    assert.equal(api.getPreferredUrlInfo(service).address, service.urls[0].address);
  }
});

test('跨域不透明响应标记为未确认，保留独立状态', async () => {
  const { api } = loadDataLayer();
  const modes = [];
  api.fetch = async (address, options) => {
    modes.push(options.mode);
    if (options.mode === 'cors') throw new Error('CORS');
    return { type: 'opaque', status: 0 };
  };
  await api.probeLinkStatuses([{ ID: 1, url: service.urls[2].address }]);
  assert.deepEqual(modes, ['cors', 'no-cors']);
  assert.equal(api.getUrlProbeState(service.urls[2].address).state, 'unconfirmed');
});

test('可读的 HTTP 错误保留状态码，认证响应显示为需认证', async () => {
  const { api } = loadDataLayer();
  for (const httpStatus of [404, 502, 401, 403]) {
    api.fetch = async () => ({ type: 'basic', status: httpStatus });
    await api.probeLinkStatuses([{ ID: 1, url: service.urls[0].address }]);
    const state = api.getUrlProbeState(service.urls[0].address);
    assert.equal(state.state, httpStatus >= 400 && ![401, 403].includes(httpStatus) ? 'unreachable' : 'online');
    assert.ok(state.text.includes(String(httpStatus)));
  }
});

test('旧版不透明响应产生的在线缓存重新检测后再使用', () => {
  const { api } = loadDataLayer();
  const address = service.urls[0].address;
  api.setSetting('linkStatusCache', { [address]: { online: true, ms: 1, ts: Date.now() } });
  assert.equal(api.getUrlProbeState(address).state, 'unknown');
  api.setLinkStatus(address, { online: true, ms: 2, httpStatus: 200 });
  assert.equal(api.getUrlProbeState(address).state, 'online');
});

test('关闭监控后立即刷新可见状态', () => {
  const { api } = loadDataLayer();
  let refreshed = 0;
  api.refreshLinkStatusDots = () => { refreshed += 1; };
  api.setSetting('probeIntervalMs', 0);
  api.startStatusMonitor([]);
  assert.equal(refreshed, 1);
});
