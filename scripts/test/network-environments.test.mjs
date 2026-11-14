import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDataLayer } from './data-harness.mjs';
import { validateSharedConfig } from '../config-store.mjs';
const source = readFileSync(new URL('../../HTML/js/network-environments.js', import.meta.url), 'utf8');
function networkApi(settings = {}) {
  const { api } = loadDataLayer();
  const window = { navigator: { onLine: true } };
  const result = new Function('window', 'document', 'getSetting', 'getCachedStatusForUrl', 'getUrlProbeState', source + '\nreturn {getDefaultNetworkEnvironments,getNetworkEnvironments,getCurrentNetworkLabel,getNetworkEnvironmentMeasurement};')(window, {addEventListener(){}}, (key, fallback) => key in settings ? settings[key] : fallback, api.getCachedStatusForUrl, api.getUrlProbeState);
  return { ...result, data: api, window };
}
test('默认环境包含家里、公司、Tailscale 与公网，并保留独立标识', () => {
  const profiles = networkApi().getDefaultNetworkEnvironments();
  assert.deepEqual(profiles.map(profile => profile.name), ['家里', '公司', 'Tailscale', '公网']);
  assert.equal(new Set(profiles.map(profile => profile.id)).size, 4);
});
test('网络气泡显示手动环境或逐服务自动选路状态', () => {
  const api = networkApi();
  const profiles = api.getDefaultNetworkEnvironments();
  assert.equal(api.getCurrentNetworkLabel(profiles, 'work'), '公司');
  assert.equal(api.getCurrentNetworkLabel(profiles, 'auto'), '自动选路');
  assert.equal(api.getCurrentNetworkLabel(profiles, 'auto', true, 'tunnel'), '内网穿透优先');
  assert.equal(api.getCurrentNetworkLabel(profiles, 'home', false), '离线');
});
test('旧配置缺少环境时使用默认值，用户空列表与有效自定义环境得到保留', () => {
  assert.equal(networkApi().getNetworkEnvironments().length, 4);
  assert.deepEqual(networkApi({networkEnvironments:[]}).getNetworkEnvironments(), []);
  assert.equal(networkApi({networkEnvironments:[null,{id:'x',name:'实验室',route:'tunnel',probeUrl:''}]}).getNetworkEnvironments().length, 1);
});
test('服务器保留网络环境配置，拒绝无效检测协议与重复标识', () => {
  const profiles = networkApi().getDefaultNetworkEnvironments();
  assert.deepEqual(validateSharedConfig({links:[],settings:{networkEnvironments:profiles}}).settings.networkEnvironments, profiles);
  assert.throws(() => validateSharedConfig({links:[],settings:{networkEnvironments:[{...profiles[0],probeUrl:'javascript:alert(1)'}]}}), /HTTP/);
  assert.throws(() => validateSharedConfig({links:[],settings:{networkEnvironments:[profiles[0],profiles[0]]}}), /唯一标识/);
});

test('环境延迟逐项显示，手动名称与自动选路状态独立于最快探针', () => {
  const profiles = [
    { id: 'home', name: '家里', route: 'local', probeUrl: 'http://192.168.1.1' },
    { id: 'work', name: '公司', route: 'local', probeUrl: 'http://192.168.2.1' },
    { id: 'tunnel', name: 'Tailscale', route: 'tunnel', probeUrl: 'http://100.90.1.2' }
  ];
  const api = networkApi({ networkEnvironments: profiles });
  api.data.setLinkStatus(profiles[0].probeUrl, { online: true, ms: 65 });
  api.data.setLinkStatus(profiles[1].probeUrl, { online: null, ms: 17 });
  api.data.setLinkStatus(profiles[2].probeUrl, { online: false, ms: 2, httpStatus: 502 });
  assert.equal(api.getCurrentNetworkLabel(profiles, 'auto'), '自动选路');
  assert.equal(api.getCurrentNetworkLabel(profiles, 'home'), '家里');
  assert.equal(api.getNetworkEnvironmentMeasurement(profiles[1]).ms, 17);
  assert.match(api.getNetworkEnvironmentMeasurement(profiles[1]).text, /17ms/);
  assert.equal(api.getNetworkEnvironmentMeasurement(profiles[2]).state, 'unreachable');
});

test('修改检测 URL 后丢弃原地址延迟，离线与关闭探测不使用旧结果', () => {
  const profile = { id: 'home', name: '家里', route: 'local', probeUrl: 'http://192.168.1.1' };
  const api = networkApi({ networkEnvironments: [profile] });
  api.data.setLinkStatus(profile.probeUrl, { online: true, ms: 8 });
  assert.equal(api.getNetworkEnvironmentMeasurement({ ...profile, probeUrl: 'http://192.168.1.2' }).ms, null);
  api.window.navigator.onLine = false;
  assert.equal(api.getNetworkEnvironmentMeasurement(profile).ms, null);
  api.window.navigator.onLine = true;
  api.data.setSetting('probeIntervalMs', 0);
  assert.equal(api.getNetworkEnvironmentMeasurement(profile).state, 'off');
});
