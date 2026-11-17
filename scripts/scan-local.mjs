#!/usr/bin/env node
// scripts/scan-local.mjs — 本地服务自动发现（产品级 v2）
//
// 五层管线：端口扫描 → 系统过滤 → 服务识别 → 去重合并 → 深度探测(AI/MCP)
//
// 用法：
//   npm run scan                          基础扫描
//   npm run scan -- --probe               HTTP 标题探测
//   npm run scan -- --deep                深度探测（AI 模型 / MCP / Skills）
//   npm run scan -- --probe --deep        全量探测
//   npm run scan -- --merge               合并进 links.json
//   npm run scan -- --host 192.168.1.100  生成局域网地址
//   npm run scan -- --json                纯 JSON 输出
//   npm run scan -- --list                仅预览
//   npm run scan -- --exclude 53,135      排除端口
//   npm run scan -- --limit 30            截断
//   npm run scan -- --keep-system         保留系统服务（默认过滤）
//
// 零依赖；Windows(netstat+tasklist) / Linux(ss) / macOS(lsof)；WSL2 兼容。

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ================= 参数 =================
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined; };
const JSON_OUT = has('--json');
const PROBE = has('--probe');
const DEEP = has('--deep');
const MERGE = has('--merge');
const LIST_ONLY = has('--list');
const KEEP_SYSTEM = has('--keep-system');
const NO_COLOR = has('--no-color') || process.env.NO_COLOR || !process.stdout.isTTY;
const HOST = val('--host') || '127.0.0.1';
const OUT = val('--out') ? resolve(val('--out')) : join(root, 'HTML', 'data', 'links-local.json');
const LINKS_JSON = join(root, 'HTML', 'data', 'links.json');
const EXCLUDE = (val('--exclude') || '').split(',').map(x => parseInt(x, 10)).filter(Number.isInteger);
const LIMIT = parseInt(val('--limit'), 10) || Infinity;
const PROBE_CONCURRENCY = Math.max(1, parseInt(val('--probe-concurrency'), 10) || 8);
const PROBE_TIMEOUT = Math.max(500, parseInt(val('--probe-timeout'), 10) || 2500);

const C = NO_COLOR ? { g: '', y: '', b: '', r: '', dim: '', c: '', x: '' } : {
    g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[36m', r: '\x1b[31m', dim: '\x1b[2m', c: '\x1b[35m', x: '\x1b[0m'
};
const log = (s = '') => { if (!JSON_OUT) console.log(s); };

// ================= 系统服务过滤 =================
// OS 级系统端口（无论什么进程占用都排除——它们不是用户部署的服务）
const OS_SYSTEM_PORTS = new Set([
    // Windows
    135,    // RPC Endpoint Mapper
    139,    // NetBIOS Session Service
    445,    // SMB
    5040,   // Windows Delivery Optimization
    5357,   // WSD (Web Services for Devices)
    7680,   // Windows Update Delivery Optimization
    // Linux/macOS 系统守护进程
    111,    // rpcbind
    546,    // DHCPv6 Client
    547,    // DHCPv6 Server
]);

// 进程名 + 端口组合 = 系统服务（例如 svchost.exe:53 是 Windows DNS 客户端）
const SYSTEM_PROCESS_PORTS = new Set([
    'svchost.exe:53',     // DNS Client
    'svchost.exe:5353',   // LLMNR
    'svchost.exe:5355',   // NRBT
    'System:445',          // SMB Server
    'System:139',          // NetBIOS
    'lsass.exe:49664',     // LSASS
    'services.exe:49665',  // Service Control Manager
    'wininit.exe:49666',   // Windows Initialization
    'smss.exe:49667',     // Session Manager
    'csrss.exe:49668',    // Client/Server Runtime
    // Linux
    'systemd-resolved:53',
    'dnsmasq:53',
    'avahi-daemon:5353',
    'cupsd:631',
    'sshd:22',             // 系统自带 SSH 是基础设施,但用户可能自定义了部署——保留给用户判断
]);

// 已知非 HTTP 端口（跳过 HTTP 探测与 AI/MCP 探测）
const NON_HTTP_PORTS = new Set([
    22, 53, 111, 139, 445, 546, 547, 631,
    3306, 5432, 6379, 27017,   // 数据库
    5900, 5901,                 // VNC
    5672, 9092, 1883, 6881,    // 消息队列 / BT
    22000, 9042, 3389,          // Syncthing P2P / Cassandra / RDP
]);

function isSystemService(port, processName) {
    if (OS_SYSTEM_PORTS.has(port)) return true;
    if (processName) {
        const key = `${processName.replace(/\.(exe|dll)$/i, '')}:${port}`;
        if (SYSTEM_PROCESS_PORTS.has(key)) return true;
    }
    // Windows 动态端口段
    if (port >= 49152 && port <= 65535) return true;
    return false;
}

// ================= 服务知识库 =================
const KNOWN_PORTS = new Map([
    // 媒体
    [8096, ['Jellyfin', '媒体']], [8920, ['Jellyfin', '媒体']],
    [32400, ['Plex', '媒体']], [4533, ['Navidrome', '媒体']],
    [13378, ['Audiobookshelf', '媒体']], [2342, ['PhotoPrism', '媒体']],
    [2283, ['Immich', '媒体']],
    // 下载
    [9091, ['Transmission', '下载']], [6789, ['NZBGet', '下载']],
    [8112, ['Deluge', '下载']], [6881, ['qBittorrent', '下载']],
    // 监控
    [9090, ['Prometheus', '监控']], [9093, ['Alertmanager', '监控']],
    [19999, ['Netdata', '监控']], [3001, ['Uptime Kuma', '监控']],
    [3005, ['Grafana', '监控']], [10051, ['Zabbix', '监控']],
    // 管理面板
    [9000, ['Portainer', '管理面板']], [9001, ['Portainer', '管理面板']],
    [9443, ['Portainer', '管理面板']], [10000, ['Webmin', '管理面板']],
    [81, ['Nginx Proxy Manager', '管理面板']], [18080, ['Nginx UI', '管理面板']],
    [8086, ['Adminer', '管理面板']], [9002, ['MinIO Console', '管理面板']],
    // 智能家居 / 自动化
    [8123, ['Home Assistant', '智能家居']], [1880, ['Node-RED', '自动化']],
    [6052, ['ESPHome', '智能家居']], [5678, ['n8n', '自动化']],
    // 开发
    [3002, ['Dev Server', '开发工具']], [3003, ['Dev Server', '开发工具']],
    [3004, ['Dev Server', '开发工具']], [4200, ['Angular', '开发工具']],
    [5173, ['Vite', '开发工具']], [5230, ['Memos', '开发工具']],
    [8010, ['CyberChef', '开发工具']], [6006, ['TensorBoard', '开发工具']],
    [8888, ['Jupyter', '开发工具']], [8889, ['Jupyter', '开发工具']],
    // AI
    [11434, ['Ollama', 'AI 工具']], [1234, ['LM Studio', 'AI 工具']],
    [5006, ['One API', 'AI 工具']], [8081, ['Chartbrew', 'AI 工具']],
    // 文件 / 同步
    [8384, ['Syncthing', '文件同步']], [22000, ['Syncthing', '文件同步']],
    [5244, ['AList', '文件共享']], [5212, ['Cloudreve', '文件共享']],
    [8083, ['Cloudreve', '文件共享']],
    // 数据库
    [3306, ['MySQL', '数据库']], [5432, ['PostgreSQL', '数据库']],
    [6379, ['Redis', '数据库']], [27017, ['MongoDB', '数据库']],
    [9042, ['Cassandra', '数据库']], [8529, ['ArangoDB', '数据库']],
    [9200, ['Elasticsearch', '数据库']],
    // 消息队列
    [5672, ['AMQP', '消息队列']], [15672, ['RabbitMQ 管理', '消息队列']],
    [1883, ['MQTT', '消息队列']], [9092, ['Kafka', '消息队列']],
    // 密码管理
    [8222, ['Vaultwarden', '密码管理']],
    // 远程
    [22, ['SSH', '远程访问']], [3389, ['远程桌面', '远程访问']],
    [5900, ['VNC', '远程访问']],
    // 下载工具
    [9080, ['DownloadSDK', '下载工具']], [9081, ['Thunder', '下载工具']],
    // 文档
    [8089, ['Calibre-Web', '阅读器']], [9783, ['Stirling PDF', '文档知识']],
    [8484, ['Stirling PDF', '文档知识']], [4321, ['Astro', '文档知识']],
    [14004, ['Outline', '文档知识']],
    // 已知特定
    [3300, ['Grafana', '监控']], [10080, ['Web 服务', 'Web 服务']],
    [10443, ['Web 服务', 'Web 服务']],
]);

const CONTAINER_CATEGORY_RULES = [
    [/jellyfin|emby|plex|navidrome|audiobook|immich|photoprism|photo|finamp/i, '媒体'],
    [/uptime|prometheus|grafana|netdata|glances|zabbix|gatus|speedtest/i, '监控'],
    [/mysql|mariadb|postgres|mongo|redis|clickhouse|influx|elastic/i, '数据库'],
    [/n8n|node-?red|automation|workflow|home.?assistant|zigbee|esphome/i, '自动化'],
    [/portainer|cockpit|webmin|dozzle|adminer/i, '管理面板'],
    [/nginx|npm|traefik|caddy|proxy|haproxy/i, '管理面板'],
    [/gitea|gitlab|gogs/i, '版本控制'],
    [/qbittorrent|transmission|aria2|deluge|download|thunder/i, '下载'],
    [/vault|bitwarden|password/i, '密码管理'],
    [/wiki|bookstack|outline|paperless|doc|calibre/i, '文档知识'],
    [/dify|openai|oneapi|ollama|webui|chatgpt|llm|ai[-_]|one-api|lm.?studio|vllm|openrouter/i, 'AI 工具'],
    [/nextcloud|seafile|filebrowser|webdav|dufs|minio|alist|cloudreve/i, '文件共享'],
    [/freshrss|miniflux|rss|ttrss/i, '阅读器'],
    [/matrix|mattermost|rocket|chat/i, '通信协作'],
    [/syncthing/i, '文件同步'],
    [/cyberchef|it-?tools|navigator/i, '开发工具'],
    [/misp|security|wazuh/i, '安全工具'],
];

const TITLE_RULES = [
    [/^jellyfin$/i, 'Jellyfin', '媒体'], [/^emby$/i, 'Emby', '媒体'],
    [/plex/i, 'Plex', '媒体'], [/portainer/i, 'Portainer', '管理面板'],
    [/home assistant/i, 'Home Assistant', '智能家居'],
    [/uptime kuma/i, 'Uptime Kuma', '监控'], [/grafana/i, 'Grafana', '监控'],
    [/gitea/i, 'Gitea', '版本控制'], [/gitlab/i, 'GitLab', '版本控制'],
    [/n8n/i, 'n8n', '自动化'], [/dify/i, 'Dify', 'AI 工具'],
    [/open ?webui/i, 'Open WebUI', 'AI 工具'], [/one ?api/i, 'One API', 'AI 工具'],
    [/nextcloud/i, 'Nextcloud', '文件共享'], [/syncthing/i, 'Syncthing', '文件同步'],
    [/minio/i, 'MinIO', '文件共享'], [/vaultwarden/i, 'Vaultwarden', '密码管理'],
    [/paperless/i, 'Paperless', '文档知识'], [/pi-?hole/i, 'Pi-hole', '网络服务'],
    [/adguard/i, 'AdGuard Home', '网络服务'], [/immich/i, 'Immich', '媒体'],
    [/navidrome/i, 'Navidrome', '媒体'], [/freshrss/i, 'FreshRSS', '阅读器'],
    [/firefly/i, 'Firefly III', '财务'], [/cockpit/i, 'Cockpit', '管理面板'],
    [/cyberchef/i, 'CyberChef', '开发工具'], [/alist/i, 'AList', '文件共享'],
    [/ollama/i, 'Ollama', 'AI 工具'],
];

// ================= 工具函数 =================
function sh(cmd, timeoutMs = 8000) {
    try {
        return execSync(cmd, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return ''; }
}

function friendlyContainerName(raw) {
    let n = raw.replace(/[-_][0-9a-f]{6,}$/i, '').replace(/[-_](1|2|3)$/, '');
    n = n.replace(/[_-]+/g, ' ').trim();
    if (/[A-Z]/.test(n)) return n;
    return n.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function titleRule(title) {
    for (const [re, name, cat] of TITLE_RULES) {
        if (re.test(title)) return { name, category: cat };
    }
    return null;
}

// ================= 端口收集 =================
function collectPorts() {
    const platform = process.platform;
    const ports = new Map();
    if (platform === 'win32') {
        const output = sh('netstat -ano', 10000);
        for (const line of output.split('\n')) {
            const parts = line.trim().split(/\s+/);
            if (parts[0] !== 'TCP' || parts[3] !== 'LISTENING') continue;
            const local = parts[1] || '';
            const c = local.lastIndexOf(':');
            if (c === -1) continue;
            const port = parseInt(local.slice(c + 1), 10);
            const pid = parseInt(parts[4], 10) || 0;
            if (!port || port >= 65536) continue;
            const addr = local.slice(0, c);
            if (!ports.has(port)) ports.set(port, { port, pid, addrs: new Set() });
            ports.get(port).addrs.add(addr);
        }
    } else {
        const output = sh('ss -tlnp 2>/dev/null || netstat -an -p tcp 2>/dev/null || lsof -i -P -n 2>/dev/null', 10000);
        for (const line of output.split('\n')) {
            const ss = line.match(/LISTEN\s+\d+\s+\d+\s+(\[?[^\s\]]+\]?):(\d+)\s/i);
            if (ss) {
                const port = parseInt(ss[2], 10);
                if (!port) continue;
                const pidM = line.match(/pid=(\d+)/);
                if (!ports.has(port)) ports.set(port, { port, pid: pidM ? parseInt(pidM[1], 10) : 0, addrs: new Set() });
                ports.get(port).addrs.add(ss[1]);
                continue;
            }
            const lf = line.match(/^(?:\S+)\s+(\d+)\s+.*TCP\s+\[?([^\s\]]+)\]?:(\d+)\s+\(LISTEN\)/);
            if (lf) {
                const port = parseInt(lf[3], 10);
                if (!port) continue;
                if (!ports.has(port)) ports.set(port, { port, pid: parseInt(lf[1], 10), addrs: new Set() });
                ports.get(port).addrs.add(lf[2]);
            }
        }
    }
    return ports;
}

function getProcessName(pid) {
    if (!pid) return '';
    if (process.platform === 'win32') {
        const out = sh(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, 3000);
        const name = out.split(',')[0]?.replace(/"/g, '').trim();
        return name && !name.includes('INFO') ? name : '';
    }
    return sh(`ps -p ${pid} -o comm=`, 3000).trim();
}

function getDockerMap() {
    const map = new Map();
    for (const cmd of ['docker', 'wsl docker']) {
        const names = sh(cmd + ' ps --format "{{.Names}}"', 20000);
        const portStrs = sh(cmd + ' ps --format "{{.Ports}}"', 20000);
        if (!names.trim() || !portStrs.trim()) continue;
        const nameLines = names.trim().split('\n');
        const portLines = portStrs.trim().split('\n');
        if (nameLines.length !== portLines.length) continue;
        for (let i = 0; i < nameLines.length; i++) {
            const name = nameLines[i].trim();
            const ps = portLines[i] || '';
            if (!name || !ps) continue;
            for (const mm of ps.matchAll(/([0-9.]+|\[::\]):(\d+)(?:-(\d+))?->/g)) {
                const start = parseInt(mm[2], 10);
                const endP = mm[3] ? parseInt(mm[3], 10) : start;
                if (endP - start > 64) continue;
                for (let p = start; p <= endP; p++) {
                    if (!map.has(p)) map.set(p, { name, host: mm[1] || '0.0.0.0' });
                }
            }
        }
        if (map.size) return map;
    }
    return map;
}

// ================= HTTP / AI / MCP 探测 =================
async function probeHttp(port, timeoutMs = PROBE_TIMEOUT, target = '127.0.0.1') {
    for (const scheme of ['http', 'https']) {
        if (scheme === 'https' && ![443, 8443, 9443, 10443].includes(port)) continue;
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), timeoutMs);
            const res = await fetch(`${scheme}://${target}:${port}/`, { signal: ctrl.signal, redirect: 'follow' });
            clearTimeout(timer);
            const html = (await res.text()).slice(0, 20000);
            const title = html.match(/<title[^>]*>([^<]{1,100})<\/title>/i)?.[1]?.trim() || '';
            return { title, server: res.headers.get('server') || '', scheme };
        } catch { /* next scheme */ }
    }
    return null;
}

// AI 模型探测:Ollama /api/tags 与 OpenAI 兼容 /v1/models
async function probeAiModels(port, timeoutMs = PROBE_TIMEOUT) {
    const endpoints = [
        { path: '/api/tags', type: 'ollama' },
        { path: '/v1/models', type: 'openai' },
    ];
    for (const ep of endpoints) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), timeoutMs);
            const res = await fetch(`http://127.0.0.1:${port}${ep.path}`, { signal: ctrl.signal });
            clearTimeout(timer);
            if (!res.ok) continue;
            const data = await res.json();
            if (ep.type === 'ollama' && Array.isArray(data?.models)) {
                return { type: 'ollama', models: data.models.map(m => m.name || m.id).filter(Boolean) };
            }
            if (ep.type === 'openai' && Array.isArray(data?.data)) {
                return { type: 'openai-compatible', models: data.data.map(m => m.id).filter(Boolean) };
            }
        } catch { /* next endpoint */ }
    }
    return null;
}

// MCP 端点探测:常见路径模式
async function probeMcp(port, timeoutMs = PROBE_TIMEOUT) {
    const paths = ['/mcp', '/sse', '/api/mcp'];
    for (const p of paths) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, 1500));
            const res = await fetch(`http://127.0.0.1:${port}${p}`, {
                signal: ctrl.signal,
                headers: { 'Accept': 'application/json, text/event-stream' }
            });
            clearTimeout(timer);
            if (res.status === 200 || res.status === 405) {
                const ct = res.headers.get('content-type') || '';
                if (ct.includes('json') || ct.includes('event-stream') || ct.includes('text')) {
                    return { path: p, status: res.status, contentType: ct.split(';')[0] };
                }
            }
        } catch { /* next path */ }
    }
    return null;
}

// ================= 服务识别 =================
function identify(svc, dockerMap, probeInfo) {
    const container = dockerMap.get(svc.port);
    if (container) {
        const friendly = friendlyContainerName(container.name);
        const cat = CONTAINER_CATEGORY_RULES.find(([re]) => re.test(container.name))?.[1];
        return { name: friendly, category: cat || 'Docker 服务', source: 'docker', containerName: container.name };
    }
    const known = KNOWN_PORTS.get(svc.port);
    if (known) return { name: known[0], category: known[1], source: 'port-db' };
    if (probeInfo?.title) {
        const rule = titleRule(probeInfo.title);
        if (rule) return { name: rule.name, category: rule.category, source: 'http-title' };
    }
    if (svc.processName) {
        const clean = svc.processName.replace(/\.(exe|dll)$/i, '');
        const cat = CONTAINER_CATEGORY_RULES.find(([re]) => re.test(clean))?.[1];
        if (cat) return { name: clean.charAt(0).toUpperCase() + clean.slice(1), category: cat, source: 'process' };
        return { name: clean.charAt(0).toUpperCase() + clean.slice(1) + ' :' + svc.port, category: '其他服务', source: 'process' };
    }
    if (svc.port >= 3000 && svc.port < 4000) return { name: `服务 :${svc.port}`, category: '开发工具', source: 'range' };
    if (svc.port >= 8000 && svc.port < 9000) return { name: `服务 :${svc.port}`, category: 'Web 服务', source: 'range' };
    return { name: `服务 :${svc.port}`, category: '其他服务', source: 'unknown' };
}

// ================= 服务去重(核心改进) =================
// 同一 Docker 容器的多个端口 → 一个服务多地址
// 同一进程的非 Docker 多端口 → 一个服务多地址(进程名相同且端口在常见 companion 范围内)
function groupServices(identified) {
    const groups = new Map(); // key → { name, category, ports[], urls[], ... }

    for (const svc of identified) {
        // Docker 容器:按 containerName 分组
        const groupKey = svc.containerName || `${svc.name}|${svc.processName || ''}`;

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                name: svc.name,
                category: svc.category,
                source: svc.source,
                containerName: svc.containerName || null,
                ports: [],
                urls: [],
                tags: new Set(),
                probe: svc.probe || null,
            });
        }
        const g = groups.get(groupKey);
        g.ports.push(svc.port);
        g.urls.push(...(Array.isArray(svc.urls) ? svc.urls : [svc.url].filter(Boolean)));
        if (svc.tag) g.tags.add(svc.tag);
        if (svc.probe && !g.probe) g.probe = svc.probe;
    }

    // 排序:每组内端口升序;主端口取最小(通常是 Web UI)
    return [...groups.values()].map(g => ({
        ...g,
        ports: g.ports.sort((a, b) => a - b),
        primaryPort: g.ports[0],
        tags: [...g.tags],
    }));
}

// ================= 地址构建 =================
function pickLanAddresses(interfaces) {
    const out = [];
    for (const [name, addrs] of Object.entries(interfaces || {})) {
        for (const a of addrs || []) {
            if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
            if (a.address.startsWith('100.')) out.push({ label: 'Tailscale', address: a.address });
            else out.push({ label: name, address: a.address });
        }
    }
    return out.slice(0, 3);
}

function buildUrls(port, scheme, lanAddrs, hostOverride, loopbackOnly) {
    const urls = [];
    const s = scheme || 'http';
    if (hostOverride) {
        urls.push({ address: `${s}://${hostOverride}:${port}`, label: '指定主机', priority: 1 });
    } else {
        urls.push({ address: `${s}://127.0.0.1:${port}`, label: '本机', priority: 1 });
        if (!loopbackOnly) {
            lanAddrs.forEach((a, i) => {
                urls.push({ address: `${s}://${a.address}:${port}`, label: a.label, priority: 2 + i });
            });
        }
    }
    return urls;
}

// ================= 主扫描流程 =================
async function scanLocalServices(options = {}) {
    const probe = options.probe === true;
    const deep = options.deep === true;
    const exclude = options.exclude || [];
    const hostOverride = options.hostOverride || null;
    const keepSystem = options.keepSystem === true;

    const ports = collectPorts();
    const dockerMap = getDockerMap();
    const lanAddrs = hostOverride ? [] : pickLanAddresses(networkInterfaces());

    // 获取进程名
    const pidSet = new Set([...ports.values()].map(p => p.pid).filter(Boolean));
    const processNames = new Map();
    for (const pid of pidSet) processNames.set(pid, getProcessName(pid));

    // 系统服务过滤
    let services = [];
    let systemFiltered = 0;
    for (const p of ports.values()) {
        const processName = processNames.get(p.pid) || '';
        if (!keepSystem && isSystemService(p.port, processName)) {
            systemFiltered++;
            continue;
        }
        if (exclude.includes(p.port)) continue;
        services.push({ ...p, processName });
    }

    // HTTP 标题探测
    if (probe) {
        const candidates = services.filter(s => !NON_HTTP_PORTS.has(s.port));
        for (let i = 0; i < candidates.length; i += PROBE_CONCURRENCY) {
            const batch = candidates.slice(i, i + PROBE_CONCURRENCY);
            const results = await Promise.all(batch.map(s => probeHttp(s.port)));
            results.forEach((info, j) => { if (info) batch[j].probe = info; });
            options.onProgress?.(Math.min(i + PROBE_CONCURRENCY, candidates.length), candidates.length);
        }
    }

    // 识别
    const identified = services.map(s => {
        const id = identify(s, dockerMap, s.probe);
        const loopbackOnly = dockerMap.get(s.port)?.host === '127.0.0.1';
        const urls = buildUrls(s.port, s.probe?.scheme, lanAddrs, hostOverride, loopbackOnly);
        return {
            port: s.port,
            name: id.name,
            category: id.category,
            source: id.source,
            containerName: id.containerName || null,
            processName: s.processName,
            tag: id.source === 'docker' ? 'Docker' : (s.processName ? s.processName.replace(/\.(exe|dll)$/i, '').slice(0, 14) : ''),
            probe: s.probe || null,
            urls,
        };
    });

    // 去重合并
    const grouped = groupServices(identified);

    // 深度探测(AI 模型 / MCP)——只对分组的 primaryPort 探测
    if (deep) {
        // 只对 AI/管理面板/Web/开发工具 类候选进行,数据库/SSH 等跳过;最多 20 个防超时
        const deepCategories = new Set(['AI 工具', '管理面板', 'Web 服务', '开发工具', 'Docker 服务', '其他服务']);
        const candidates = grouped.filter(g =>
            deepCategories.has(g.category) && !NON_HTTP_PORTS.has(g.primaryPort) && g.primaryPort < 20000
        ).slice(0, 20);
        // 4 并发,AI + MCP 同时探测
        for (let i = 0; i < candidates.length; i += 4) {
            const batch = candidates.slice(i, i + 4);
            await Promise.all(batch.map(async g => {
                const [ai, mcp] = await Promise.all([
                    probeAiModels(g.primaryPort),
                    probeMcp(g.primaryPort)
                ]);
                g.ai = ai; g.mcp = mcp;
                if (ai) g.category = 'AI 工具';
                if (mcp && !ai) g.tags.push('MCP');
            }));
        }
    }

    // 排序
    grouped.sort((a, b) => a.category.localeCompare(b.category, 'zh-CN') || a.primaryPort - b.primaryPort);
    const finalList = Number.isFinite(options.limit) ? grouped.slice(0, options.limit) : grouped;

    return { lanAddresses: lanAddrs, services: finalList, systemFiltered, totalRaw: ports.size };
}

// ================= 输出 =================
function formatConsoleTable(groups) {
    const lines = [];
    let lastCat = '';
    for (const g of groups) {
        if (g.category !== lastCat) {
            lines.push(`${C.g}  ▸ ${g.category}${C.x}`);
            lastCat = g.category;
        }
        const ports = g.ports.length > 1 ? `${g.ports.join(',')}` : String(g.primaryPort);
        const src = { docker: `${C.g}docker${C.x}`, 'port-db': `${C.b}已知${C.x}`, 'http-title': `${C.y}探测${C.x}`, process: `${C.dim}进程${C.x}`, range: `${C.dim}推断${C.x}`, unknown: `${C.dim}未知${C.x}` }[g.source] || '';
        const ai = g.ai ? ` ${C.c}[${g.ai.type}:${g.ai.models.length}模型]${C.x}` : '';
        const mcp = g.mcp ? ` ${C.c}[MCP${g.mcp.path}]${C.x}` : '';
        const multi = g.ports.length > 1 ? ` ${C.dim}(${g.ports.length}端口)${C.x}` : '';
        lines.push(`    ${ports.padEnd(18)} ${g.name.padEnd(28)} ${src}${ai}${mcp}${multi}`);
    }
    return lines.join('\n');
}

function groupsToLinks(groups, host) {
    return groups.map((g, i) => {
        // 多端口服务 → urls 数组;单端口 → url 字符串
        const primaryUrl = g.urls[0]?.address || `http://${host}:${g.primaryPort}`;
        const link = {
            ID: i + 1,
            name: g.name,
            category: g.category,
            tag: g.tags.filter(Boolean).join(',').slice(0, 20) || '',
            thumbnail: '',
        };
        if (g.urls.length > 1) {
            link.urls = g.urls.map(u => ({ address: u.address, label: u.label, priority: u.priority }));
        } else {
            link.url = primaryUrl;
        }
        if (g.ai && g.ai.models.length) {
            link.remarks = `AI: ${g.ai.type}, ${g.ai.models.length} 个模型`;
        }
        return link;
    });
}

// ================= CLI 主入口 =================
async function main() {
    log(`${C.b}🔍 本地服务自动发现 v2${C.x}`);
    const modes = [PROBE ? '标题探测' : '', DEEP ? `${C.c}深度(AI/MCP)${C.x}` : '', MERGE ? '合并' : ''].filter(Boolean);
    log(`${C.dim}   模式: ${modes.join(' + ') || '基础扫描'}  主机: ${HOST}${C.x}\n`);

    const start = Date.now();
    const { lanAddresses, services, systemFiltered, totalRaw } = await scanLocalServices({
        probe: PROBE,
        deep: DEEP,
        exclude: EXCLUDE,
        limit: LIMIT,
        hostOverride: val('--host'),
        keepSystem: KEEP_SYSTEM,
        onProgress(done, total) { if (!JSON_OUT) process.stdout.write(`\r    探测 ${done}/${total}`); },
    });
    if (PROBE && !JSON_OUT) process.stdout.write('\n');

    log(`${C.dim}  · 端口 ${totalRaw} → 过滤系统 ${systemFiltered} → 去重后 ${services.length} 个服务 (${((Date.now()-start)/1000).toFixed(1)}s)${C.x}`);
    if (lanAddresses.length) log(`${C.dim}  · 网卡: ${lanAddresses.map(a => a.address).join(', ')}${C.x}`);
    log('');

    // 控制台表格
    log(formatConsoleTable(services));
    log('');

    // 统计
    const aiCount = services.filter(s => s.ai).length;
    const mcpCount = services.filter(s => s.mcp).length;
    const multiPort = services.filter(s => s.ports.length > 1).length;
    if (aiCount || mcpCount || multiPort) {
        log(`${C.dim}  去重: ${multiPort} 个多端口服务合并  |  AI: ${aiCount} 个  |  MCP: ${mcpCount} 个${C.x}\n`);
    }

    if (LIST_ONLY) { log(`${C.y}--list 模式${C.x}`); return; }
    if (JSON_OUT) { console.log(JSON.stringify({ services }, null, 2)); return; }

    // 生成链接
    const links = groupsToLinks(services, HOST);
    const payload = { _meta: { scannedAt: new Date().toISOString(), host: HOST, total: links.length, tool: 'scan-local v2' }, links };

    if (MERGE) {
        let existing = { links: [] };
        if (existsSync(LINKS_JSON)) {
            try { existing = JSON.parse(readFileSync(LINKS_JSON, 'utf8')); } catch { }
        }
        const existingUrls = new Set((existing.links || []).flatMap(l => l.urls?.map(u => u.address) || [l.url]).filter(Boolean));
        let nextId = (existing.links || []).reduce((m, l) => Math.max(m, l.ID || 0), 0) + 1;
        let added = 0;
        for (const l of links) {
            const thisUrls = l.urls?.map(u => u.address) || [l.url];
            if (thisUrls.some(u => existingUrls.has(u))) continue;
            existing.links ||= [];
            existing.links.push({ ...l, ID: nextId++ });
            thisUrls.forEach(u => existingUrls.add(u));
            added++;
        }
        writeFileSync(LINKS_JSON, JSON.stringify(existing, null, 4) + '\n');
        log(`${C.g}✅ 合并进 links.json: 新增 ${added} (去重后)${C.x}`);
    } else {
        writeFileSync(OUT, JSON.stringify(payload, null, 4) + '\n');
        log(`${C.g}✅ 已生成 ${OUT}${C.x} (${links.length} 个服务)`);
        log(`${C.dim}   多端口服务自动合并为单条多地址链接${C.x}`);
    }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(e => { console.error('扫描失败:', e.message); process.exit(1); });

export { scanLocalServices, groupServices, isSystemService, identify, probeAiModels, probeMcp, KNOWN_PORTS };
