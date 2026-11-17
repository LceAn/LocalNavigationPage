// scripts/test/ai-models.test.mjs — AI 模型看板：数据层 + 服务器探测
// 覆盖：OpenAI / Ollama 响应规范化、容量格式化、客户端配置、浏览器直连降级与缓存、
//       catalog-service inspectAi（OpenAI 兼容、Ollama 原生、/v1 基址、鉴权、失败态）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCatalogService } from '../catalog-service.mjs';

// ---------- 前端数据层（经典脚本，经 new Function 沙箱求值） ----------
const source = readFileSync(new URL('../../HTML/js/ai-models.js', import.meta.url), 'utf8');
function aiApi({ fetchImpl } = {}) {
    const window = {};
    const calls = [];
    const sandboxFetch = fetchImpl || (async () => { throw new Error('no fetch'); });
    const api = new Function('window', 'getSafeLinkUrls', 'getPreferredUrlInfo', 'isSafeUrl', 'fetch', 'AbortSignal',
        source + '\nreturn { normalizeAiModels, formatModelBytes, buildAiClientConfig, fetchAiModelsDirect, probeAiModelCount, AI_PROBE_CACHE };'
    )(window,
        link => link.urls || [],
        (link, urls) => (urls || link.urls)[0],
        (url, protocols) => /^https?:\/\//.test(url) && (!protocols || protocols.some(p => url.startsWith(p.split(':')[0]))),
        (...args) => { calls.push(args[0]); return sandboxFetch(...args); },
        { timeout: () => undefined });
    return { api, window, calls };
}

test('normalizeAiModels: OpenAI 兼容与 Ollama 原生响应统一为模型列表', () => {
    const { api } = aiApi();
    const openai = api.normalizeAiModels('openai', { object: 'list', data: [
        { id: 'qwen2.5:7b', object: 'model', owned_by: 'ollama' },
        { id: '', object: 'model' }
    ] });
    assert.deepEqual(openai, [{ id: 'qwen2.5:7b', ownedBy: 'ollama', createdAt: null }]); // 空 id 剔除
    const ollama = api.normalizeAiModels('ollama', { models: [
        { name: 'llama3.2:3b', size: 2019393189, modified_at: '2026-11-01T08:00:00Z',
          details: { family: 'llama', parameter_size: '3.2B', quantization_level: 'Q4_K_M', format: 'gguf' } }
    ] });
    assert.equal(ollama[0].id, 'llama3.2:3b');
    assert.equal(ollama[0].size, 2019393189);
    assert.equal(ollama[0].parameterSize, '3.2B');
    assert.equal(ollama[0].quantization, 'Q4_K_M');
});

test('formatModelBytes: GB/MB 阈值与无效值', () => {
    const { api } = aiApi();
    assert.equal(api.formatModelBytes(2_019_393_189), '2.0 GB');
    assert.equal(api.formatModelBytes(14_689_846_000), '15 GB');
    assert.equal(api.formatModelBytes(460_000_000), '460 MB');
    assert.equal(api.formatModelBytes(0), '');
    assert.equal(api.formatModelBytes(null), '');
});

test('buildAiClientConfig: base_url 拼接 /v1、Key 脱敏、默认模型', () => {
    const { api } = aiApi();
    assert.deepEqual(api.buildAiClientConfig('http://127.0.0.1:11434/', '', 'llama3.2:3b'), {
        base_url: 'http://127.0.0.1:11434/v1', api_key: 'ollama', model: 'llama3.2:3b'
    });
    assert.equal(api.buildAiClientConfig('http://10.0.0.5:3000', 'sk-test', '').api_key, '<API Key>');
    assert.equal(api.buildAiClientConfig('http://10.0.0.5:3000', '', '').model, '<模型名>');
});

test('fetchAiModelsDirect: OpenAI 端点失败后回退 Ollama 原生端点', async () => {
    const { api } = aiApi({ fetchImpl: async url => {
        if (url.includes('/v1/models')) throw new Error('ECONNREFUSED');
        return { ok: true, json: async () => ({ models: [{ name: 'llama3.2:3b', size: 1 }, { name: 'qwen2.5:7b' }] }) };
    } });
    const result = await api.fetchAiModelsDirect('http://127.0.0.1:11434', '');
    assert.equal(result.api, 'ollama');
    assert.equal(result.models.length, 2);
});

test('probeAiModelCount: 60s 内存缓存避免重复探测', async () => {
    let hits = 0;
    const { api } = aiApi({ fetchImpl: async () => {
        hits += 1;
        return { ok: true, json: async () => ({ data: [{ id: 'a' }, { id: 'b' }] }) };
    } });
    const link = { ID: 1, urls: [{ address: 'http://127.0.0.1:11434', label: '本地', priority: 1 }] };
    assert.equal(await api.probeAiModelCount(link), 2);
    assert.equal(await api.probeAiModelCount(link), 2); // 命中缓存
    assert.equal(hits, 1);
    api.AI_PROBE_CACHE.clear();
    assert.equal(await api.probeAiModelCount(link), 2); // 缓存清空后重新探测
    assert.equal(hits, 2);
});

// ---------- 服务器探测（catalog-service inspectAi） ----------

async function aiHttpFixture(t, respond) {
    const requests = [];
    const server = createServer(async (request, response) => {
        requests.push({ url: request.url, headers: request.headers });
        await respond({ url: request.url, headers: request.headers, request, response });
    });
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    t.after(() => new Promise(done => server.close(done)));
    return { base: `http://127.0.0.1:${server.address().port}`, requests };
}

async function serviceFixture(t, links) {
    const dataRoot = await mkdtemp(join(tmpdir(), 'lnp-ai-'));
    await writeFile(join(dataRoot, 'links.json'), JSON.stringify({ links }));
    await writeFile(join(dataRoot, 'catalog.json'), JSON.stringify({ mcpServers: [], skills: [] }));
    t.after(() => import('node:fs/promises').then(fs => fs.rm(dataRoot, { recursive: true, force: true })));
    return createCatalogService({ dataRoot, defaultCatalogPath: join(dataRoot, 'catalog.json'), timeoutMs: 3000 });
}

test('inspectAi: OpenAI 兼容端点发现模型，透传 API Key', async t => {
    const fixture = await aiHttpFixture(t, ({ url, headers, response }) => {
        if (url === '/v1/models') {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ data: [{ id: 'qwen2.5-coder:7b' }, { id: 'deepseek-r1:8b' }] }));
            return;
        }
        response.writeHead(404); response.end('{}');
    });
    const service = await serviceFixture(t, [{ ID: 7, name: 'Ollama', kind: 'ai', urls: [{ address: fixture.base, label: '本地', priority: 1 }] }]);
    const result = await service.inspect({ linkId: 7, apiKey: 'sk-demo' });
    assert.equal(result.kind, 'ai');
    assert.equal(result.status.state, 'available');
    assert.equal(result.api, 'openai');
    assert.match(result.status.message, /2 个模型/);
    assert.equal(fixture.requests[0].headers.authorization, 'Bearer sk-demo');
    assert.equal(result.data.data.length, 2); // 原始响应保留，前端统一规范化
});

test('inspectAi: 地址以 /v1 结尾时端点只补 /models，不再重复拼接 /v1', async t => {
    const fixture = await aiHttpFixture(t, ({ url, response }) => {
        if (url === '/v1/models') { // 基址 http://host/v1 → http://host/v1/models
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ data: [{ id: 'llama3.2:3b' }] }));
            return;
        }
        response.writeHead(404); response.end('{}');
    });
    const service = await serviceFixture(t, [{ ID: 8, name: 'One API', kind: 'ai', url: fixture.base + '/v1' }]);
    const result = await service.inspect({ linkId: 8 });
    assert.equal(result.status.state, 'available');
    assert.equal(result.api, 'openai');
    assert.equal(result.data.data[0].id, 'llama3.2:3b');
});

test('inspectAi: 两个端点都不可用时给出明确失败态；address 不在入口地址列表时拒绝', async t => {
    const fixture = await aiHttpFixture(t, ({ response }) => { response.writeHead(500); response.end('x'); });
    const service = await serviceFixture(t, [{ ID: 9, name: '坏服务', kind: 'ai', urls: [{ address: fixture.base, label: '本地', priority: 1 }] }]);
    const failed = await service.inspect({ linkId: 9 });
    assert.equal(failed.status.state, 'unavailable');
    assert.match(failed.status.message, /无法读取模型列表/);
    await assert.rejects(() => service.inspect({ linkId: 9, address: 'http://127.0.0.1:1/' }), /访问地址已更新/);
});
