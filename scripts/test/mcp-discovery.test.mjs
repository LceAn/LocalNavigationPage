import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inspectMcp } from '../mcp-client.mjs';
import { createCatalogService } from '../catalog-service.mjs';
import { maskArgs, maskArg, parseSkillMarkdown } from '../scan-catalog.mjs';

const tool = { name: 'search_notes', title: '搜索笔记', description: '在知识库中搜索', inputSchema: { type: 'object', properties: { query: { type: 'string', description: '搜索词' } }, required: ['query'] } };
const modern = { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: { tools: {} }, _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'test-mcp', version: '2.0' } } };

async function httpFixture(t, respond) {
    const requests = [];
    const server = createServer(async (request, response) => {
        let raw = '';
        for await (const chunk of request) raw += chunk;
        const message = raw ? JSON.parse(raw) : {};
        requests.push({ method: request.method, headers: request.headers, message });
        const reply = (result, status = 200, headers = {}) => {
            response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
            response.end(JSON.stringify(result));
        };
        await respond({ request, response, message, reply });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
    return { url: `http://127.0.0.1:${server.address().port}/mcp`, requests };
}

function modernReply({ message, reply }) {
    reply({ jsonrpc: '2.0', id: message.id, result: message.method === 'server/discover' ? modern : { resultType: 'complete', tools: [tool] } });
}

test('现代 HTTP MCP 按请求携带协议与客户端元信息，只发现工具', async t => {
    const fixture = await httpFixture(t, modernReply);
    const result = await inspectMcp({ url: fixture.url }, { timeoutMs: 2000 });
    assert.equal(result.version, '2026-07-28');
    assert.deepEqual(result.tools, [tool]);
    assert.deepEqual(fixture.requests.map(value => value.message.method), ['server/discover', 'tools/list']);
    assert.equal(fixture.requests[0].headers['mcp-method'], 'server/discover');
    assert.equal(fixture.requests[0].message.params._meta['io.modelcontextprotocol/protocolVersion'], '2026-07-28');
});

test('旧 HTTP MCP 完成握手、会话清理与工具分页，支持 SSE 响应', async t => {
    const fixture = await httpFixture(t, ({ request, response, message, reply }) => {
        if (request.method === 'DELETE' || message.method === 'notifications/initialized') { response.writeHead(204); response.end(); return; }
        if (message.method === 'server/discover') { reply({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'unknown method' } }); return; }
        if (message.method === 'initialize') { reply({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'old' }, capabilities: { tools: {} } } }, 200, { 'Mcp-Session-Id': 'test-session' }); return; }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: message.id, result: message.params.cursor ? { tools: [{ ...tool, name: 'second' }] } : { tools: [tool], nextCursor: 'next' } }) + '\n\n');
    });
    const result = await inspectMcp({ url: fixture.url }, { timeoutMs: 2000 });
    assert.equal(result.version, '2025-06-18');
    assert.equal(result.tools.length, 2);
    assert.equal(fixture.requests.at(-1).method, 'DELETE');
    assert.equal(fixture.requests.at(-1).headers['mcp-session-id'], 'test-session');
    assert.ok(fixture.requests.some(value => value.message.method === 'notifications/initialized'));
});

test('旧 SSE MCP 连接端点、通知与流式工具响应可以完成发现', async t => {
    let stream;
    const fixture = await httpFixture(t, ({ request, response, message }) => {
        if (request.method === 'GET') {
            stream = response;
            response.writeHead(200, { 'Content-Type': 'text/event-stream' });
            response.write('event: endpoint\ndata: /messages\n\n');
            return;
        }
        response.writeHead(202); response.end();
        if (message.id == null) return;
        const result = message.method === 'initialize' ? { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'sse' } } : { tools: [tool] };
        stream.write('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n\n');
    });
    const result = await inspectMcp({ transport: 'sse', url: fixture.url }, { timeoutMs: 2000 });
    assert.equal(result.transport, 'sse');
    assert.equal(result.tools[0].name, tool.name);
});

test('HTTP 200 普通网页与认证失败不会标记为可用 MCP', async t => {
    const html = await httpFixture(t, ({ response }) => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<html>ok</html>'); });
    await assert.rejects(inspectMcp({ url: html.url }, { timeoutMs: 1000 }), error => error.code === 'protocol');
    const auth = await httpFixture(t, ({ reply }) => reply({ error: 'auth' }, 401));
    await assert.rejects(inspectMcp({ url: auth.url }, { timeoutMs: 1000 }), error => error.code === 'authentication');
});

test('重复分页与无响应连接会结束并给出真实失败状态', async t => {
    const fixture = await httpFixture(t, ({ message, reply }) => reply({ jsonrpc: '2.0', id: message.id, result: message.method === 'server/discover' ? modern : { tools: [tool], nextCursor: 'repeat' } }));
    await assert.rejects(inspectMcp({ url: fixture.url }, { timeoutMs: 1000 }), error => error.code === 'pagination');
    const stalled = await httpFixture(t, () => {});
    await assert.rejects(inspectMcp({ url: stalled.url }, { timeoutMs: 100 }), /超时|abort/i);
});

test('STDIO 可以发现项目自带 MCP 的六个工具，启动失败可以收尾', async () => {
    const result = await inspectMcp({ transport: 'stdio', command: process.execPath, args: [resolve('scripts/mcp-server.mjs')] }, { timeoutMs: 3000 });
    assert.equal(result.tools.length, 6);
    assert.ok(result.tools.some(value => value.name === 'list_links'));
    await assert.rejects(inspectMcp({ transport: 'stdio', command: 'lnp-command-does-not-exist' }, { timeoutMs: 1000 }), /启动失败/);
});

test('STDIO 超时回收本次启动的进程', async t => {
    const root = await mkdtemp(join(tmpdir(), 'lnp-stdio-timeout-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const pidFile = join(root, 'pid.txt');
    const script = join(root, 'stall.mjs');
    await writeFile(script, "import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[2], String(process.pid)); setInterval(()=>{}, 1000);");
    await assert.rejects(inspectMcp({ transport: 'stdio', command: process.execPath, args: [script, pidFile] }, { timeoutMs: 500 }), /超时/);
    const pid = Number(await readFile(pidFile, 'utf8'));
    assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
});

async function catalogFixture(t, catalog, links = []) {
    const root = await mkdtemp(join(tmpdir(), 'lnp-resources-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const data = join(root, 'data');
    await mkdir(data);
    await writeFile(join(data, 'links.json'), JSON.stringify({ links }));
    await writeFile(join(data, 'catalog.json'), JSON.stringify(catalog));
    const registry = join(root, 'mcp.json');
    await writeFile(registry, JSON.stringify({ mcpServers: {} }));
    return { root, data, registry, service: options => createCatalogService({ dataRoot: data, mcpConfigPath: registry, timeoutMs: 2000, ...options }) };
}

test('连接凭据透传到上游，详情与配置模板保持脱敏，失败清除旧缓存', async t => {
    let failed = false;
    const upstream = await httpFixture(t, args => {
        assert.equal(args.request.headers.authorization, 'Bearer fixture-secret-123');
        if (failed) args.reply({ error: 'failed' }, 401);
        else modernReply(args);
    });
    const fixture = await catalogFixture(t, { mcpServers: [{ name: 'notes', url: upstream.url, transport: 'http', headerKeys: ['Authorization'] }] });
    await writeFile(fixture.registry, JSON.stringify({ mcpServers: { notes: { url: upstream.url, headers: { Authorization: 'Bearer fixture-secret-123' } } } }));
    const service = fixture.service();
    const first = await service.inspect({ catalogKey: 'mcp:notes' });
    assert.equal(first.status.state, 'available');
    assert.equal(first.connection.credentials[0].configured, true);
    assert.equal(first.connection.clientConfig.mcpServers.notes.headers.Authorization, '<Authorization>');
    assert.ok(!JSON.stringify(first).includes('fixture-secret-123'));
    assert.equal((await service.inspect({ catalogKey: 'mcp:notes' })).cached, true);
    failed = true;
    assert.equal((await service.inspect({ catalogKey: 'mcp:notes', refresh: true })).status.state, 'authentication');
    assert.equal((await service.inspect({ catalogKey: 'mcp:notes' })).status.state, 'authentication');
});

test('仅按已登记条目解析资源，命令发现使用服务器登记配置', async t => {
    const fixture = await catalogFixture(t, { mcpServers: [{ name: 'commands', command: 'public-command', args: ['public-arg'], transport: 'stdio' }] });
    const service = fixture.service();
    await assert.rejects(service.inspect({ catalogKey: 'mcp:missing', command: process.execPath }), error => error.code === 'not_found');
    assert.equal((await service.inspect({ catalogKey: 'mcp:commands' })).status.state, 'unconfigured');
    await writeFile(fixture.registry, JSON.stringify({ mcpServers: { commands: { command: process.execPath, args: [resolve('scripts/mcp-server.mjs')] } } }));
    const result = await service.inspect({ catalogKey: 'mcp:commands' });
    assert.equal(result.status.state, 'available');
    assert.equal(result.tools.length, 6);
    await assert.rejects(service.inspect({ catalogKey: 'mcp:commands', address: 'http://example.invalid' }), error => error.code === 'invalid_address');
});

test('Skill 展示指南、工具声明、依赖和文件，保存的覆盖保留目录来源', async t => {
    const fixture = await catalogFixture(t, { skills: [{ name: 'research', path: 'C:\\old\\research', description: '原描述' }] }, [{ ID: 12, name: '研究助手', kind: 'skill', catalogKey: 'skill:research', remarks: '自定义描述' }]);
    const skills = join(fixture.root, 'skills');
    const folder = join(skills, 'research');
    await mkdir(join(folder, 'scripts'), { recursive: true });
    await writeFile(join(folder, 'SKILL.md'), '---\nname: research\ndescription: >\n  第一行\n  第二行\nallowed-tools: [Read, Bash]\ncompatibility: Python 3\nlicense: MIT\n---\n# 研究助手\n\n## 收集资料\n使用 **关键词**。\n\n```sh\npython scripts/research.py\n```\n');
    await writeFile(join(folder, 'scripts/research.py'), '# fixture');
    const service = fixture.service({ skillsDir: skills });
    const result = await service.inspect({ linkId: 12 });
    assert.equal(result.status.state, 'available');
    assert.equal(result.name, '研究助手');
    assert.equal(result.description, '自定义描述');
    assert.equal(result.compatibility, 'Python 3');
    assert.deepEqual(result.allowedTools, ['Read', 'Bash']);
    assert.ok(result.markdown.startsWith('# 研究助手'));
    assert.ok(result.files.some(file => file.path === 'scripts/research.py'));
    assert.deepEqual(result.sections, ['研究助手', '收集资料']);
});

test('缺失与停用 Skill 状态明确，敏感 URL 和分离式参数脱敏', async t => {
    const fixture = await catalogFixture(t, { skills: [{ name: 'missing', path: join(tmpdir(), 'lnp-missing-skill-123') }] });
    assert.equal((await fixture.service().inspect({ catalogKey: 'skill:missing' })).status.state, 'missing');
    assert.deepEqual(maskArgs(['--token', 'abc123', '--port', '8080']), ['--token', '***', '--port', '8080']);
    assert.equal(maskArg('https://user:password@example.com/mcp?token=abc&mode=read'), 'https://***@example.com/mcp?token=***&mode=read');
    assert.equal(parseSkillMarkdown('---\ndescription: >\n  第一行\n  第二行\n---\n').description, '第一行 第二行');
    const windows = parseSkillMarkdown('\uFEFF---\r\nname: windows\r\nversion: 1.2.0\r\ncompatibility: Python 3\r\nallowed-tools: [Read, Bash]\r\n---\r\n# 指南\r\n');
    assert.equal(windows.version, '1.2.0');
    assert.equal(windows.compatibility, 'Python 3');
    assert.deepEqual(windows.allowedTools, ['Read', 'Bash']);
});
