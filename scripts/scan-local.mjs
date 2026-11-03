#!/usr/bin/env node
// scripts/scan-local.mjs — 本地服务自动发现与导入
//
// 用法：
//   npm run scan              扫描并生成 HTML/data/links-local.json（不会覆盖 links.json）
//   npm run scan -- --probe   对 HTTP 端口做标题探测（更准确但更慢）
//   npm run scan -- --out ./my-links.json   自定义输出路径
//   npm run scan -- --host 192.168.1.100   用局域网 IP 代替 127.0.0.1
//
// 零依赖，跨平台（Windows: netstat + tasklist; Linux/macOS: ss/netstat/lsof + ps）
// 非 HTTP 端口（SSH/MySQL/Redis…）不会生成链接：导航页只接受 http/https，
// 写进去也是打不开的死链，扫描结束会汇总提示。

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 常见端口分类 ----------
const PORT_CATEGORIES = {
    // Web / 代理
    80: 'Web 服务', 81: 'Web 服务', 443: 'Web 服务', 8080: 'Web 服务', 8000: 'Web 服务',
    8008: 'Web 服务', 8888: 'Web 服务', 9000: '管理面板', 9001: '管理面板',
    19000: '管理面板', 19001: '管理面板', 2019: 'Web 服务', 2015: 'Web 服务',
    8443: 'Web 服务', 10443: 'Web 服务', 10080: 'Web 服务', 8010: 'Web 服务',
    8011: 'Web 服务', 8085: 'Web 服务', 8091: 'Web 服务',
    // 代理
    7890: '代理', 7891: '代理', 7892: '代理', 1080: '代理', 1081: '代理',
    10808: '代理', 10809: '代理',
    // 开发
    3000: '开发工具', 3001: '开发工具', 3002: '开发工具', 3003: '开发工具',
    3004: '开发工具', 3005: '开发工具', 4000: '开发工具', 5000: '开发工具',
    5173: '开发工具', 8081: 'Web 服务', 8090: '开发工具', 9229: '开发工具',
    4533: '开发工具', 5230: '开发工具', 7000: '开发工具',
    // 数据库
    3306: '数据库', 5432: '数据库', 6379: '数据库', 27017: '数据库',
    9042: '数据库', 8529: '数据库', 9200: '数据库', 28317: '数据库',
    // 容器/编排
    2375: '容器', 2376: '容器', 10250: '容器', 10255: '容器', 11434: '容器',
    // 媒体
    8096: '媒体', 8920: '媒体', 32400: '媒体', 1900: '媒体', 8200: '媒体',
    // 下载
    9091: '下载', 51413: '下载', 6881: '下载', 9094: '下载',
    // 监控
    9090: '监控', 9093: '监控', 19999: '监控',
    // 文件共享
    2049: '文件共享',
    // DNS / 网络
    53: '网络服务',
    // 通信
    22: '远程访问', 3389: '远程访问', 5900: '远程访问', 5901: '远程访问',
    2222: '远程访问', 2224: '远程访问',
    // 消息队列
    5672: '消息队列', 15672: '消息队列', 1883: '消息队列', 8883: '消息队列',
    2181: '消息队列', 9092: '消息队列', 5678: '消息队列',
    // 同步
    8384: '同步', 22000: '同步', 21027: '同步',
    // 智能家居
    8123: '智能家居',
    // 其他已知服务
    5001: 'Web 服务', 5003: 'Web 服务', 5005: 'Web 服务', 5006: 'Web 服务',
    3050: '开发工具', 3080: '开发工具', 8787: '其他服务', 9080: '下载工具',
    9081: '下载工具', 2100: '其他服务', 17680: '其他服务', 19798: '其他服务',
};

// 端口名称映射（更友好的显示名）
const PORT_NAMES = {
    80: 'HTTP 服务', 443: 'HTTPS 服务', 22: 'SSH',
    3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis', 27017: 'MongoDB',
    8080: 'HTTP :8080', 3000: 'Dev :3000', 3389: '远程桌面',
    8384: 'Syncthing', 8096: 'Jellyfin', 9000: 'Portainer / MinIO',
    5672: 'AMQP', 9090: 'Prometheus', 7890: 'Clash / Mihomo 代理',
};

// 非 HTTP 端口：浏览器打不开，生成链接只会得到死磁贴
const NON_HTTP_PORTS = new Set([
    22,    // SSH
    53,    // DNS
    2049,  // NFS
    3306,  // MySQL
    3389,  // RDP
    5432,  // PostgreSQL
    5672,  // AMQP
    5900, 5901, // VNC
    6379,  // Redis
    6881,  // BitTorrent
    9042,  // Cassandra
    9092,  // Kafka
    1883, 8883, // MQTT
    2181,  // ZooKeeper
    27017, // MongoDB
    21027, 22000, // Syncthing
    51413, // Transmission
]);

// 已知走 HTTPS 的端口（其余按 http）
const HTTPS_PORTS = new Set([443, 8443, 8920, 9443, 10443]);

// 已知纯系统端口（不可能是用户服务）
const SYSTEM_PORTS = new Set([
    135,   // RPC
    139,   // NetBIOS
    445,   // SMB
    5040,  // Windows 服务
    5357,  // WSD
    7680,  // 传递优化
]);

export function isExcludedPort(port) {
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return true;
    if (SYSTEM_PORTS.has(port)) return true;
    if (port >= 49152 && port <= 65535) return true; // 动态/临时端口段
    return false;
}

export function isNonHttpPort(port) {
    return NON_HTTP_PORTS.has(port);
}

export function schemeForPort(port) {
    return HTTPS_PORTS.has(port) ? 'https' : 'http';
}

// ---------- 输出解析（纯函数，便于测试） ----------
export function parseListeningOutput(output, platform = process.platform) {
    const ports = new Map(); // key: port，value: { port, pid, addr }

    for (const line of String(output || '').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let port = 0, pid = 0, addr = '';
        const cols = trimmed.split(/\s+/);

        if (platform === 'win32') {
            // TCP  0.0.0.0:22  0.0.0.0:0  LISTENING  6000
            if (cols[0] !== 'TCP' || cols[3] !== 'LISTENING') continue;
            const local = cols[1] || '';
            const colon = local.lastIndexOf(':');
            if (colon === -1) continue;
            addr = local.slice(0, colon).replace(/^\[|\]$/g, '');
            port = parseInt(local.slice(colon + 1), 10);
            pid = parseInt(cols[4], 10) || 0;
        } else if (trimmed.startsWith('LISTEN')) {
            // ss -tlnp：普通用户看不到他人进程，users:(...pid=) 可能整段缺失
            // LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=6000,fd=3))
            const local = cols[3] || '';
            const colon = local.lastIndexOf(':');
            if (colon === -1) continue;
            addr = local.slice(0, colon).replace(/^\[|\]$/g, '');
            port = parseInt(local.slice(colon + 1), 10);
            pid = parseInt(trimmed.match(/pid=(\d+)/)?.[1] || '0', 10);
        } else if (/^(tcp|tcp6)$/i.test(cols[0]) && trimmed.includes('LISTEN')) {
            // netstat -tlnp：tcp 0 0 0.0.0.0:22 0.0.0.0:* LISTEN 1234/sshd
            const local = cols[3] || '';
            const colon = local.lastIndexOf(':');
            if (colon === -1) continue;
            addr = local.slice(0, colon).replace(/^\[|\]$/g, '');
            port = parseInt(local.slice(colon + 1), 10);
            pid = parseInt((cols[6] || '').split('/')[0], 10) || 0;
        } else {
            // lsof：sshd 6000 root 3u IPv4 12345 0t0 TCP *:22 (LISTEN)
            const match = trimmed.match(/^(\S+)\s+(\d+)\s+\S+.*TCP\s+\S*:(\d+)\s+\(LISTEN\)/);
            if (!match) continue;
            pid = parseInt(match[2], 10);
            port = parseInt(match[3], 10);
        }

        if (isExcludedPort(port)) continue;
        if (!ports.has(port)) ports.set(port, { port, pid: pid || 0, addr });
    }

    return [...ports.values()].sort((a, b) => a.port - b.port);
}

export function parseWindowsTasklist(output) {
    const map = new Map();
    for (const line of String(output || '').split('\n')) {
        // "chrome.exe","1234","Console","1","120,000 K"
        const match = line.match(/^"([^"]+)","(\d+)"/);
        if (match) map.set(Number(match[2]), match[1]);
    }
    return map;
}

// ---------- 平台适配 ----------
function runCommand(command, options = {}) {
    return execSync(command, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
        ...options
    });
}

function getListeningPorts() {
    const platform = process.platform;
    const attempts = platform === 'win32'
        ? ['netstat -ano']
        : ['ss -tlnp', 'netstat -tlnp', 'lsof -i -P -n'];

    let lastError = null;
    for (const command of attempts) {
        try {
            const parsed = parseListeningOutput(runCommand(command), platform);
            if (parsed.length) return parsed;
        } catch (error) {
            lastError = error;
        }
    }
    if (lastError && platform !== 'win32') throw lastError;
    return [];
}

// 批量取进程名：Windows 一次 tasklist，Linux/macOS 一次 ps（旧实现每个端口调用一次）
function getProcessMap(pids) {
    const unique = [...new Set(pids.filter(pid => pid > 0))];
    if (!unique.length) return new Map();

    if (process.platform === 'win32') {
        try {
            const all = parseWindowsTasklist(runCommand('tasklist /FO CSV /NH'));
            // 只保留本次扫描的 PID：PID 0 在 tasklist 里是 System Idle Process，
            // 但 netstat 对受保护进程也报 0，直接用会得到误导性的进程名
            const map = new Map();
            for (const pid of unique) {
                const name = all.get(pid);
                if (name) map.set(pid, name);
            }
            return map;
        } catch {
            return new Map();
        }
    }

    const map = new Map();
    try {
        const output = runCommand(`ps -p ${unique.join(',')} -o pid=,comm=`);
        for (const line of output.split('\n')) {
            const match = line.trim().match(/^(\d+)\s+(.+)$/);
            if (match) map.set(Number(match[1]), match[2].split('/').pop());
        }
    } catch { /* 进程名只是展示信息，失败不影响扫描 */ }
    return map;
}

// ---------- HTTP 探测（可选） ----------
function decodeEntities(text) {
    return String(text)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

async function probeHttpTitle(port, timeout = 2000) {
    try {
        const response = await fetch(`http://127.0.0.1:${port}/`, {
            signal: AbortSignal.timeout(timeout),
            redirect: 'follow'
        });
        const contentType = response.headers.get('content-type') || '';
        // 只读 HTML，避免把流媒体/大文件整个读进内存
        if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) return null;
        const html = (await response.text()).slice(0, 65536);
        const title = html.match(/<title[^>]*>([^<]{1,80})<\/title>/i)?.[1]?.trim();
        return title ? decodeEntities(title) : null;
    } catch {
        return null;
    }
}

// ---------- 分类推断 ----------
export function inferCategory(port, processName) {
    if (PORT_CATEGORIES[port]) return PORT_CATEGORIES[port];

    const pn = String(processName || '').toLowerCase();
    if (/docker|containerd|podman/.test(pn)) return '容器';
    if (/clash|mihomo|v2ray|xray|sing-box|shadowsocks/.test(pn)) return '代理';
    if (/node|deno|bun/.test(pn)) return '开发工具';
    if (/python|uvicorn|gunicorn|flask|django/.test(pn)) return '开发工具';
    if (/nginx|apache|httpd|caddy/.test(pn)) return 'Web 服务';
    if (/mysql|mariadb/.test(pn)) return '数据库';
    if (/postgres/.test(pn)) return '数据库';
    if (/redis/.test(pn)) return '数据库';
    if (/mongod/.test(pn)) return '数据库';
    if (/ssh|sshd/.test(pn)) return '远程访问';
    if (/transmission|qbittorrent|aria2|thunder|xunlei/.test(pn)) return '下载';
    if (/jellyfin|emby|plex|kodi/.test(pn)) return '媒体';
    if (/prometheus|grafana|netdata/.test(pn)) return '监控';
    if (/syncthing/.test(pn)) return '同步';
    if (/git|gitea|gitlab|gogs/.test(pn)) return '版本控制';

    // 端口段推断（仅在进程名无法判断时兜底）
    if (port >= 3000 && port < 4000) return '开发工具';
    if (port >= 8000 && port < 9000) return 'Web 服务';
    if (port >= 9000 && port < 10000) return '管理面板';

    return '其他服务';
}

export function inferName(port, processName, httpTitle) {
    if (httpTitle) return httpTitle;
    if (PORT_NAMES[port]) return PORT_NAMES[port];
    if (processName) {
        const clean = processName.replace(/\.(exe|dll)$/i, '');
        return `${clean.charAt(0).toUpperCase()}${clean.slice(1)} :${port}`;
    }
    return `服务 :${port}`;
}

export function classifyService(port, processName = '', httpTitle = '') {
    return {
        port,
        name: inferName(port, processName, httpTitle),
        category: inferCategory(port, processName),
        scheme: schemeForPort(port),
        linkable: !isNonHttpPort(port)
    };
}

// ---------- 参数 ----------
export function parseArgs(argv) {
    const args = argv.slice(2);
    const valueAfter = (flag) => {
        const index = args.indexOf(flag);
        if (index === -1) return null;
        const value = args[index + 1];
        if (!value || value.startsWith('--')) return '';
        return value;
    };

    const host = valueAfter('--host');
    const out = valueAfter('--out');
    if (host === '') throw new Error('--host 需要一个主机名或 IP');
    if (out === '') throw new Error('--out 需要一个文件路径');
    if (host && !/^[a-zA-Z0-9._:-]+$|^\[[0-9a-fA-F:]+\]$/.test(host)) {
        throw new Error(`--host 不是合法的主机名/IP：${host}`);
    }

    return {
        probe: args.includes('--probe'),
        host: host && host.includes(':') && !host.startsWith('[') ? `[${host}]` : (host || '127.0.0.1'),
        out: out ? resolve(out) : join(root, 'HTML', 'data', 'links-local.json')
    };
}

// ---------- 主流程 ----------
async function main() {
    const { probe, host: HOST, out: OUT } = parseArgs(process.argv);

    console.log('🔍 扫描本地监听端口...\n');

    const rawPorts = getListeningPorts();
    if (!rawPorts.length) {
        console.log('未发现监听端口。');
        return;
    }

    console.log(`  发现 ${rawPorts.length} 个候选端口，获取进程信息...`);

    // 进程名仅用于分类/展示，不用于过滤——WSL2 端口转发经 svchost，
    // 按进程名排除会丢掉所有 WSL2 服务
    const processMap = getProcessMap(rawPorts.map(item => item.pid));
    const services = rawPorts.map(item => ({
        ...item,
        processName: processMap.get(item.pid) || ''
    }));

    const linkable = services.filter(item => !isNonHttpPort(item.port));
    const skipped = services.filter(item => isNonHttpPort(item.port));
    console.log(`  收集到 ${services.length} 个服务（${linkable.length} 个可生成链接）\n`);

    // 可选 HTTP 探测
    if (probe) {
        console.log('🌐 探测 HTTP 标题（可能需要几秒）...\n');
        let probeCount = 0;
        for (const service of linkable) {
            service.httpTitle = await probeHttpTitle(service.port);
            if (service.httpTitle) probeCount += 1;
        }
        console.log(`  ${probeCount} 个服务返回了页面标题\n`);
    }

    // 生成链接（按分类分组后重新编号）
    const byCategory = {};
    for (const service of linkable) {
        const { name, category, scheme } = classifyService(service.port, service.processName, service.httpTitle);
        (byCategory[category] ||= []).push({
            name,
            url: `${scheme}://${HOST}:${service.port}`,
            category,
            tag: service.processName ? service.processName.replace(/\.(exe|dll)$/i, '') : '',
            thumbnail: ''
        });
    }

    let id = 1;
    const sortedLinks = [];
    Object.keys(byCategory).sort().forEach(category => {
        for (const link of byCategory[category]) {
            link.ID = id;
            id += 1;
            sortedLinks.push(link);
        }
    });

    const output = {
        _meta: {
            scannedAt: new Date().toISOString(),
            host: HOST,
            totalServices: sortedLinks.length,
            skippedPorts: skipped.map(item => item.port),
            note: '由 scripts/scan-local.mjs 自动生成，可通过 设置 → 数据 → 导入 添加到导航页'
        },
        links: sortedLinks
    };

    writeFileSync(OUT, JSON.stringify(output, null, 4) + '\n', 'utf8');

    console.log('✅ 扫描完成！\n');
    console.log('  分组统计：');
    Object.keys(byCategory).sort().forEach(category => {
        console.log(`    ${category}: ${byCategory[category].length} 个`);
    });
    if (skipped.length) {
        console.log(`\n  ⏭ 跳过 ${skipped.length} 个非 HTTP 端口（浏览器打不开）：`);
        console.log(`     ${skipped.map(item => item.port + (item.processName ? ` ${item.processName}` : '')).join(', ')}`);
    }
    console.log(`\n  文件已保存: ${OUT}`);
    console.log(`  共 ${sortedLinks.length} 个可访问服务\n`);

    console.log('📋 导入方式：');
    console.log('  方式一：打开导航页 → 设置 → 数据 → 导入数据 → 选择此文件（覆盖式导入，会先自动备份）');
    console.log('  方式二：本地部署时复制到 HTML/data/links.json（仅限自己机器，切勿提交到公开仓库）\n');

    // 如果已有 links.json，提示对比
    const existingPath = join(root, 'HTML', 'data', 'links.json');
    if (existsSync(existingPath)) {
        try {
            const existing = JSON.parse(readFileSync(existingPath, 'utf8'));
            if (Array.isArray(existing.links) && existing.links.length > 0) {
                const existingUrls = new Set(existing.links.map(link => link.url || link.urls?.[0]?.address).filter(Boolean));
                const newUrls = sortedLinks.map(link => link.url).filter(url => !existingUrls.has(url));
                if (newUrls.length > 0) {
                    console.log(`  💡 与现有 links.json 对比：发现 ${newUrls.length} 个新地址`);
                    newUrls.slice(0, 5).forEach(url => console.log(`     + ${url}`));
                    if (newUrls.length > 5) console.log(`     ... 还有 ${newUrls.length - 5} 个`);
                }
            }
        } catch { /* 忽略无法解析的 links.json */ }
    }
}

// 仅在直接执行时跑主流程；被测试 import 时不产生副作用
const isDirectRun = process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
    main().catch(error => {
        console.error('扫描失败:', error.message);
        process.exit(1);
    });
}
