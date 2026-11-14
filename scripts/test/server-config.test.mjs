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
