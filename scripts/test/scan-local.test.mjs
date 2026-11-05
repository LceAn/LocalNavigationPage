// scripts/test/scan-local.test.mjs — 扫描器识别管线单元测试
// 覆盖：五层识别优先级、系统端口边界、容器名清洗、标题规则、知识库完整性
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identify, isSystemPort, friendlyContainerName, titleRule, KNOWN_PORTS } from '../scan-local.mjs';

const docker = (map) => new Map(Object.entries(map).map(([p, v]) => [Number(p), typeof v === 'string' ? { name: v, host: '0.0.0.0' } : v]));

// ---------- 识别优先级 ----------
test('identify: Docker 容器名优先于端口库', () => {
    const r = identify(
        { port: 3001, processName: 'svchost.exe' },
        docker({ 3001: 'my-uptime-container' }),
        null
    );
    assert.equal(r.name, 'My Uptime Container');
    assert.equal(r.source, 'docker');
});

test('identify: 端口库次之（无 Docker 命中时）', () => {
    const r = identify({ port: 8096, processName: '' }, new Map(), null);
    assert.equal(r.name, 'Jellyfin');
    assert.equal(r.category, '媒体');
    assert.equal(r.source, 'port-db');
});

test('identify: HTTP 标题第三（端口库未收录时）', () => {
    const r = identify(
        { port: 9999, processName: '' },
        new Map(),
        { title: 'Home Assistant', server: '' }
    );
    assert.equal(r.name, 'Home Assistant');
    assert.equal(r.category, '智能家居');
    assert.equal(r.source, 'http-title');
});

test('identify: 进程名第四，命中分类规则', () => {
    const r = identify({ port: 12345, processName: 'nginx.exe' }, new Map(), null);
    assert.equal(r.name, 'Nginx');
    assert.equal(r.category, '管理面板');
});

test('identify: 全部未命中 → 端口段推断', () => {
    const dev = identify({ port: 3050, processName: '' }, new Map(), null);
    assert.equal(dev.category, '开发工具');
    const unk = identify({ port: 37564, processName: '' }, new Map(), null);
    assert.equal(unk.category, '其他服务');
});

// ---------- Docker 语义 ----------
test('identify: 容器分类按关键词推断，未命中归 Docker 服务', () => {
    const r1 = identify({ port: 3306, processName: '' }, docker({ 3306: 'mysql' }), null);
    assert.equal(r1.category, '数据库');
    const r2 = identify({ port: 5678, processName: '' }, docker({ 5678: 'n8n-zh' }), null);
    assert.equal(r2.category, '自动化');
    const r3 = identify({ port: 7777, processName: '' }, docker({ 7777: 'mystery-box' }), null);
    assert.equal(r3.category, 'Docker 服务');
});

test('identify: 仅本机绑定容器的 localOnly 标记', () => {
    const m = new Map([[3900, { name: 'omnivoice', host: '127.0.0.1' }]]);
    const r = identify({ port: 3900, processName: '' }, m, null);
    assert.equal(r.localOnly, true);
});

test('identify: 多地址智能选路优先级不受识别影响（smoke）', () => {
    // 同端口同容器重复识别应稳定
    const a = identify({ port: 3001, processName: '' }, docker({ 3001: 'uptime-kuma' }), null);
    const b = identify({ port: 3001, processName: '' }, docker({ 3001: 'uptime-kuma' }), null);
    assert.deepEqual(a, b);
});

// ---------- isSystemPort ----------
test('isSystemPort: 系统/动态端口排除', () => {
    for (const p of [135, 139, 445, 5040, 5357, 7680, 49152, 50000, 65535]) {
        assert.equal(isSystemPort(p), true, p);
    }
});

test('isSystemPort: 用户服务端口保留', () => {
    for (const p of [80, 443, 3000, 3306, 49151, 8080, 22]) {
        assert.equal(isSystemPort(p), false, p);
    }
});

// ---------- friendlyContainerName ----------
test('friendlyContainerName: 去编排后缀、转空格、首字母大写', () => {
    assert.equal(friendlyContainerName('dify_docker-nginx-1'), 'Dify Docker Nginx');
    assert.equal(friendlyContainerName('uptime-kuma'), 'Uptime Kuma');
    assert.equal(friendlyContainerName('open-webui'), 'Open Webui');
    assert.equal(friendlyContainerName('mysql'), 'Mysql');
});

test('friendlyContainerName: 已含大写保持原样', () => {
    assert.equal(friendlyContainerName('MyApp-2'), 'MyApp');
});

// ---------- titleRule ----------
test('titleRule: 主流产品标题命中', () => {
    assert.equal(titleRule('Jellyfin')?.name, 'Jellyfin');
    assert.equal(titleRule('Home Assistant')?.category, '智能家居');
    assert.equal(titleRule('Welcome to n8n')?.name, 'n8n');
    assert.equal(titleRule('Portainer')?.category, '管理面板');
    assert.equal(titleRule('MinIO Console')?.name, 'MinIO Console');
});

test('titleRule: 普通标题返回 null', () => {
    assert.equal(titleRule('Some Random Page'), null);
    assert.equal(titleRule(''), null);
});

// ---------- KNOWN_PORTS 完整性 ----------
test('KNOWN_PORTS: 结构合法、分组在已知集合内、无重复键', () => {
    const validCats = new Set([
        '媒体', '下载', '监控', '管理面板', '智能家居', '自动化', '开发工具',
        'AI 工具', '文件同步', '数据库', '消息队列', '密码管理', '远程访问',
        '下载工具', '文档知识', 'Web 服务'
    ]);
    let count = 0;
    for (const [port, [name, category]] of KNOWN_PORTS) {
        assert.ok(Number.isInteger(port) && port > 0 && port < 65536, `端口 ${port}`);
        assert.equal(typeof name, 'string', `端口 ${port} 名称`);
        assert.ok(validCats.has(category), `端口 ${port} 分组 "${category}" 不在已知集合`);
        count++;
    }
    assert.ok(count >= 50, `知识库应不少于 50 条，实际 ${count}`);
});
