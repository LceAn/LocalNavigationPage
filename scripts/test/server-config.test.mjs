import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

test('共享配置保留多地址，拒绝陈旧版本、无效输入与跨源写入，并在重启后持久化', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lnp-config-'));
  const portServer = createServer();
  await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let processHandle;
  async function start() {
    processHandle = spawn(process.execPath, ['scripts/serve.mjs', String(port)], {
      env: { ...process.env, LNP_DATA_DIR: directory, SERVE_HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    await Promise.race([
      once(processHandle.stdout, 'data'),
      once(processHandle, 'exit').then(([code]) => { throw new Error('server exit ' + code); })
    ]);
  }
  async function stop() {
    const exited = once(processHandle, 'exit');
    processHandle.kill();
    await exited;
    processHandle = null;
  }
  try {
    await start();
    const original = await (await fetch(base + '/api/config')).json();
    const urls = [
      { address: 'http://192.168.2.50:3000', label: '公司', priority: 1 },
      { address: 'http://100.90.1.2:3000', label: '内网穿透', priority: 2 },
      { address: 'https://example.com', label: '公网', priority: 3 }
    ];
    const config = { links: [{ ID: 1, name: 'AI 服务', category: 'AI', urls }], settings: { customCategories: ['AI', '空分类'], networkEnvironments: [{id:'home',name:'家里',route:'local',probeUrl:'http://127.0.0.1:8080'}] } };
    const put = (revision, body = config, headers = {}) => fetch(base + '/api/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revision, ...headers }, body: JSON.stringify(body)
    });
    const results = await Promise.all([put(original.revision), put(original.revision)]);
    assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
    const saved = await (await fetch(base + '/api/config')).json();
    assert.deepEqual(saved.links[0].urls, urls);
    assert.deepEqual(saved.settings.customCategories, ['AI', '空分类']);
    assert.equal((await put(saved.revision, { links: [{ ID: 1, name: 'bad', url: 'javascript:alert(1)' }] })).status, 400);
    assert.equal((await put(saved.revision, config, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await put(saved.revision, config, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    const apiUpdate = await fetch(base + '/api/links/1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '更新 AI' }) });
    assert.equal(apiUpdate.status, 200);
    assert.deepEqual((await apiUpdate.json()).updated.urls, urls);
    const invalidUpdate = await fetch(base + '/api/links/1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'javascript:x' }) });
    assert.equal(invalidUpdate.status, 400);
    await stop();
    await start();
    const restored = await (await fetch(base + '/api/config')).json();
    assert.equal(restored.links[0].name, '更新 AI');
    assert.deepEqual(restored.settings.networkEnvironments, config.settings.networkEnvironments);
    assert.deepEqual(restored.settings.customCategories, ['AI', '空分类']);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'links.json'), 'utf8')).links, restored.links);
    assert.equal((await fetch(base + '/data/catalog.json.default')).status, 200);
    assert.equal((await fetch(base + '/data/links.json.default')).status, 200);
    const catalog = await fetch(base + '/api/catalog');
    assert.equal(catalog.status, 200);
    assert.ok(Array.isArray((await catalog.json()).skills));
    const legacy = await fetch(base + '/HTML/index.html', { redirect: 'manual' });
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get('location'), '/index.html');
    const resource = await fetch(base + '/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '命令入口', kind: 'mcp', copyValue: 'node /data/server.mjs', urls: [] }) });
    assert.equal(resource.status, 201);
    const resourceId = (await resource.json()).created.ID;
    const resourceUpdate = await fetch(base + '/api/links/' + resourceId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copyValue: 'node /data/new.mjs' }) });
    assert.equal(resourceUpdate.status, 200);
    assert.equal((await resourceUpdate.json()).updated.copyValue, 'node /data/new.mjs');
    assert.equal((await fetch(base + '/api/links/' + resourceId, { method: 'DELETE' })).status, 200);
    const home = await fetch(base + '/');
    assert.equal(home.status, 200);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('x-frame-options'), 'SAMEORIGIN');
  } finally {
    if (processHandle) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('/api/scan 返回服务清单并标注已存在的地址，导入端点按任意地址去重', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lnp-scan-'));
  // 临时端口落在 49152+ 动态段会被 isSystemPort 按设计过滤，改用低位随机端口保证能被扫到
  const portServer = createServer();
  let port = 0;
  for (let attempt = 0; attempt < 8 && !port; attempt += 1) {
    const candidate = 21000 + Math.floor(Math.random() * 8000);
    try {
      await new Promise((resolve, reject) => { portServer.once('error', reject); portServer.listen(candidate, '127.0.0.1', resolve); });
      port = candidate;
    } catch { portServer.removeAllListeners('error'); }
  }
  await new Promise(resolve => portServer.close(resolve));
  assert.ok(port, '未能分配测试端口');
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['scripts/serve.mjs', String(port)], {
    env: { ...process.env, LNP_DATA_DIR: directory, SERVE_HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(([code]) => { throw new Error('server exit ' + code); })]);
    const scanned = await (await fetch(base + '/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    assert.ok(Array.isArray(scanned.services) && scanned.services.length >= 1, '至少发现自身监听端口');
    const self = scanned.services.find(s => s.port === port);
    assert.ok(self, '扫描结果应包含导航服务器自身端口');
    assert.ok(self.urls.length >= 1 && self.urls[0].address.includes(':' + port));
    assert.equal(self.exists, false); // 尚未导入
    // 导入 → 重扫 → exists 变 true
    const imported = await (await fetch(base + '/api/links/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ links: [{ name: self.name, kind: 'site', urls: self.urls, category: self.category }] }) })).json();
    assert.equal(imported.added, 1);
    const rescanned = await (await fetch(base + '/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    assert.equal(rescanned.services.find(s => s.port === port).exists, true);
  } finally {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});

test('/api/server：监听地址与会话自我标记、踢下线保护当前连接、黑名单增删与回环保护', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lnp-server-'));
  const portServer = createServer();
  let port = 0;
  for (let attempt = 0; attempt < 8 && !port; attempt += 1) {
    const candidate = 23000 + Math.floor(Math.random() * 8000);
    try {
      await new Promise((resolve, reject) => { portServer.once('error', reject); portServer.listen(candidate, '127.0.0.1', resolve); });
      port = candidate;
    } catch { portServer.removeAllListeners('error'); }
  }
  await new Promise(resolve => portServer.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['scripts/serve.mjs', String(port)], {
    env: { ...process.env, LNP_DATA_DIR: directory, SERVE_HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(([code]) => { throw new Error('server exit ' + code); })]);
    // 状态：监听地址至少含回环可达信息、版本号
    const status = await (await fetch(base + '/api/server/status')).json();
    assert.ok(status.listening.length >= 1 || process.platform === 'win32');
    assert.ok(status.uptimeMs >= 0);
    // 会话：自己发请求 → 出现在列表且 self 标记
    const sessions = await (await fetch(base + '/api/server/sessions')).json();
    const self = sessions.sessions.find(s => s.ip === '127.0.0.1');
    assert.ok(self, '会话列表应包含本机 IP');
    assert.equal(self.self, true);
    assert.equal(self.online, true);
    assert.ok(self.requests >= 2);
    // 踢下线：可对自己执行但不断当前连接（响应可正常完成）
    const kick = await (await fetch(base + '/api/server/sessions/kick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: '127.0.0.1' }) })).json();
    assert.ok(Number.isInteger(kick.kicked) && kick.kicked >= 0);
    // 拉黑回环被拒绝（防止把自己锁死）
    const loopbackBlock = await fetch(base + '/api/server/blacklist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: '127.0.0.1' }) });
    assert.equal(loopbackBlock.status, 400);
    // 拉黑普通 IP：列表出现并持久化，解除后消失
    const blocked = await (await fetch(base + '/api/server/blacklist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: '203.0.113.99', note: '测试' }) })).json();
    assert.equal(blocked.ip, '203.0.113.99');
    const afterBlock = await (await fetch(base + '/api/server/sessions')).json();
    assert.ok(afterBlock.blacklist.some(item => item.ip === '203.0.113.99' && item.note === '测试'));
    const unblocked = await fetch(base + '/api/server/blacklist/203.0.113.99', { method: 'DELETE' });
    assert.equal(unblocked.status, 200);
    const afterUnblock = await (await fetch(base + '/api/server/sessions')).json();
    assert.ok(!afterUnblock.blacklist.some(item => item.ip === '203.0.113.99'));
    // 解除不存在的 IP → 404
    assert.equal((await fetch(base + '/api/server/blacklist/203.0.113.99', { method: 'DELETE' })).status, 404);
  } finally {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
