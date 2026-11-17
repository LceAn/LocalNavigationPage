// scripts/test/scan-local.test.mjs — 扫描器识别管线单元测试
// 覆盖：五层识别优先级、系统端口边界、容器名清洗、标题规则、知识库完整性、
//       批量进程表解析、多地址生成（局域网/Tailscale/回环绑定）、任意地址去重
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    identify, isSystemPort, friendlyContainerName, titleRule, KNOWN_PORTS,
    parseProcessTable, pickLanAddresses, isLoopbackOnlyBinding,
    buildServiceUrls, linkAddresses, probeTargetFor, NON_HTTP_PORTS
} from '../scan-local.mjs';

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
        '下载工具', '文档知识', 'Web 服务', '文件共享', '阅读器', '版本控制', '认证', '财务', '通信协作', 'Docker 服务'
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

// ---------- 批量进程表解析 ----------
test('parseProcessTable: CSV 引号内逗号、pid 映射、脏行忽略', () => {
    const csv = [
        '"nginx.exe","1234","Console","1","12,345 K"',
        '"My App, Service.exe","5678","Console","1","999 K"',
        '"node.exe","0","Services","0","1 K"',
        'INFO: No tasks are running.',
        ''
    ].join('\r\n');
    const map = parseProcessTable(csv);
    assert.equal(map.get(1234), 'nginx.exe');
    assert.equal(map.get(5678), 'My App, Service.exe'); // 引号内逗号不能截断
    assert.equal(map.size, 2); // PID 0 与 INFO 行不计
});

// ---------- 网卡地址挑选 ----------
test('pickLanAddresses: 真实局域网优先、虚拟网卡排除、Tailscale 识别、上限 2', () => {
    const ifaces = {
        'Loopback Pseudo-Interface 1': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
        '以太网': [{ family: 'IPv4', address: '10.0.0.5', internal: false }],
        'vEthernet (WSL)': [{ family: 'IPv4', address: '172.25.208.1', internal: false }],
        'Tailscale': [{ family: 'IPv4', address: '100.119.168.108', internal: false }],
        'WLAN-自动': [{ family: 'IPv4', address: '169.254.77.9', internal: false }], // 链路本地
        'en0': [{ family: 'IPv6', address: 'fe80::1', internal: false }] // IPv6 不参与
    };
    const picked = pickLanAddresses(ifaces);
    assert.deepEqual(picked.map(a => a.address), ['10.0.0.5', '100.119.168.108']);
    assert.deepEqual(picked.map(a => a.label), ['局域网', 'Tailscale']);
});

test('pickLanAddresses: 无真实网卡时保留一个虚拟地址，不空手而归', () => {
    const picked = pickLanAddresses({ 'vEthernet (WSL)': [{ family: 'IPv4', address: '172.25.208.1', internal: false }] });
    assert.equal(picked.length, 1);
    assert.equal(picked[0].address, '172.25.208.1');
});

test('pickLanAddresses: 两个真实局域网 + Tailscale 时合计封顶 2（局域网优先）', () => {
    const ifaces = {
        '以太网': [{ family: 'IPv4', address: '192.168.2.10', internal: false }],
        'WLAN': [{ family: 'IPv4', address: '192.168.3.20', internal: false }],
        'Tailscale': [{ family: 'IPv4', address: '100.64.1.2', internal: false }]
    };
    const picked = pickLanAddresses(ifaces);
    assert.equal(picked.length, 2);
    assert.ok(picked.every(a => a.label === '局域网'));
});

// ---------- 回环绑定分析 ----------
test('isLoopbackOnlyBinding: 全回环才算仅本机', () => {
    assert.equal(isLoopbackOnlyBinding(new Set(['127.0.0.1'])), true);
    assert.equal(isLoopbackOnlyBinding(new Set(['127.0.0.1', '[::1]'])), true);
    assert.equal(isLoopbackOnlyBinding(new Set(['[::1]'])), true);
    assert.equal(isLoopbackOnlyBinding(new Set(['0.0.0.0'])), false);
    assert.equal(isLoopbackOnlyBinding(new Set(['127.0.0.1', '0.0.0.0'])), false);
    assert.equal(isLoopbackOnlyBinding(new Set(['192.168.2.125'])), false);
    assert.equal(isLoopbackOnlyBinding(new Set()), false); // 空绑定信息不臆断
});

// ---------- 多地址构建 ----------
test('buildServiceUrls: 本地 + 局域网 + Tailscale 依次编号', () => {
    const urls = buildServiceUrls({
        port: 8096,
        lanAddresses: [{ address: '10.0.0.5', label: '局域网' }, { address: '100.119.168.108', label: 'Tailscale' }]
    });
    assert.deepEqual(urls, [
        { address: 'http://127.0.0.1:8096', label: '本地', priority: 1 },
        { address: 'http://10.0.0.5:8096', label: '局域网', priority: 2 },
        { address: 'http://100.119.168.108:8096', label: 'Tailscale', priority: 3 }
    ]);
});

test('buildServiceUrls: 回环绑定 / --host 覆盖 / 探测到 https / TLS 端口', () => {
    assert.deepEqual(
        buildServiceUrls({ port: 8080, loopbackOnly: true, lanAddresses: [{ address: '10.0.0.5', label: '局域网' }] }),
        [{ address: 'http://127.0.0.1:8080', label: '本地', priority: 1 }]
    );
    assert.deepEqual(
        buildServiceUrls({ port: 8080, hostOverride: '192.168.1.100', lanAddresses: [{ address: '10.0.0.5', label: '局域网' }] }),
        [{ address: 'http://192.168.1.100:8080', label: '默认', priority: 1 }]
    );
    assert.equal(buildServiceUrls({ port: 9000, scheme: 'https' })[0].address, 'https://127.0.0.1:9000');
    assert.equal(buildServiceUrls({ port: 9443 })[0].address, 'https://127.0.0.1:9443'); // 无探测时端口启发
});

// ---------- 探测目标 ----------
test('probeTargetFor: 仅 IPv6 回环绑定时选 [::1]', () => {
    assert.equal(probeTargetFor(new Set(['[::1]'])), '[::1]');
    assert.equal(probeTargetFor(new Set(['0.0.0.0', '[::]'])), '127.0.0.1');
    assert.equal(probeTargetFor(new Set()), '127.0.0.1');
});

// ---------- 任意地址去重 ----------
test('linkAddresses: 单 url 与 urls 数组全部展开，供 merge 重叠判断', () => {
    assert.deepEqual(linkAddresses({ url: 'http://192.168.1.5:8096' }), ['http://192.168.1.5:8096']);
    assert.deepEqual(
        linkAddresses({ urls: [{ address: 'http://127.0.0.1:8096' }, { address: 'http://10.0.0.5:8096' }] }),
        ['http://127.0.0.1:8096', 'http://10.0.0.5:8096']
    );
    assert.deepEqual(linkAddresses({ url: 'http://a:1', urls: [{ address: 'http://b:2' }] }), ['http://a:1', 'http://b:2']);
    assert.deepEqual(linkAddresses({}), []);
});

// ---------- 非 HTTP 端口推导 ----------
test('NON_HTTP_PORTS: 从知识库推导纯协议端口，Web UI 端口保留探测', () => {
    for (const p of [3306, 5432, 6379, 27017, 5672, 1883, 22, 3389, 5900]) {
        assert.equal(NON_HTTP_PORTS.has(p), true, `端口 ${p} 应为非 HTTP`);
    }
    // Web UI 端口：同类别下的 HTTP 面板与「文件同步/下载」类必须可探测
    for (const p of [15672, 8384, 9091, 8112, 6789, 8096, 8080, 3000]) {
        assert.equal(NON_HTTP_PORTS.has(p), false, `端口 ${p} 不应被排除出探测`);
    }
});
