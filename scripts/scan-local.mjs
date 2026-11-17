#!/usr/bin/env node
// scripts/scan-local.mjs — 本地服务自动发现与导入（产品级）
//
// 三层识别：Docker 容器名 → 知名服务库(端口) → 进程/端口段兜底
//
// 用法：
//   npm run scan                    扫描并生成 HTML/data/links-local.json
//   npm run scan -- --probe         HTTP 探测页面标题（更准确，稍慢；自动识别 https）
//   npm run scan -- --merge         合并进 HTML/data/links.json（只增不改不删，任意地址重叠跳过）
//   npm run scan -- --host <ip>     手动指定唯一主机（单地址模式，默认自动多地址）
//   npm run scan -- --local-only    只生成 127.0.0.1 地址（关闭局域网/Tailscale 地址）
//   npm run scan -- --out <path>    自定义输出路径
//   npm run scan -- --list          只打印表格，不写文件
//   npm run scan -- --json          纯 JSON 输出到 stdout（管道友好）
//   npm run scan -- --probe-concurrency N   探测并发数（默认 8）
//   npm run scan -- --probe-timeout ms      探测超时（默认 2500）
//   npm run scan -- --exclude 135,9000   排除指定端口
//   npm run scan -- --limit 30           只取前 N 个服务
//   npm run scan -- --no-color      关闭彩色输出
//
// 零依赖；Windows(netstat+tasklist) / Linux(ss) / macOS(lsof)；WSL2 兼容。

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 探测自签 HTTPS 时放宽证书校验（仅本 CLI 进程；探测目标是拿标题，不是建立信任）
if (process.argv.includes('--probe')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ================= 参数 =================
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined; };
const JSON_OUT = has('--json');
const PROBE = has('--probe');
const MERGE = has('--merge');
const LIST_ONLY = has('--list');
const LOCAL_ONLY = has('--local-only');
const HOST_OVERRIDE = val('--host'); // 指定后回退单地址模式（脚本化兼容）
const NO_COLOR = has('--no-color') || process.env.NO_COLOR || !process.stdout.isTTY;
const EXCLUDE = (val('--exclude') || '').split(',').map(x => parseInt(x, 10)).filter(Number.isInteger);
const LIMIT = parseInt(val('--limit'), 10) || Infinity;
const PROBE_CONCURRENCY = Math.max(1, parseInt(val('--probe-concurrency'), 10) || 16);
const PROBE_TIMEOUT = Math.max(500, parseInt(val('--probe-timeout'), 10) || 2500);
const HOST = HOST_OVERRIDE || '127.0.0.1';
const OUT = val('--out') ? resolve(val('--out')) : join(root, 'HTML', 'data', 'links-local.json');
const LINKS_JSON = join(root, 'HTML', 'data', 'links.json');

// ================= 输出 =================
const C = NO_COLOR ? { g: '', y: '', b: '', r: '', dim: '', x: '' } : {
    g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[36m', r: '\x1b[31m', dim: '\x1b[2m', x: '\x1b[0m'
};
const log = (s = '') => { if (!JSON_OUT) console.log(s); };  // --json 模式静默

// ================= 服务知识库 =================
const KNOWN_PORTS = new Map([
    [8096, ['Jellyfin', '媒体']], [8920, ['Jellyfin', '媒体']], [32400, ['Plex', '媒体']],
    [4533, ['Navidrome', '媒体']], [13378, ['Audiobookshelf', '媒体']],
    [2342, ['PhotoPrism', '媒体']], [2283, ['Immich', '媒体']],
    [9091, ['Transmission', '下载']], [6789, ['NZBGet', '下载']], [8112, ['Deluge', '下载']],
    [6881, ['qBittorrent', '下载']],
    [9090, ['Prometheus', '监控']], [9093, ['Alertmanager', '监控']], [19999, ['Netdata', '监控']],
    [10051, ['Zabbix', '监控']],
    [9000, ['Portainer / MinIO', '管理面板']], [9001, ['Portainer / MinIO', '管理面板']],
    [9002, ['MinIO Console', '管理面板']],
    [9443, ['Portainer', '管理面板']], [10000, ['Webmin', '管理面板']],
    [81, ['Nginx Proxy Manager', '管理面板']],
    [8123, ['Home Assistant', '智能家居']], [1880, ['Node-RED', '自动化']],
    [6052, ['ESPHome', '自动化']], [5678, ['n8n', '自动化']],
    [3002, ['Dev Server', '开发工具']], [3003, ['Dev Server', '开发工具']],
    [3004, ['Dev Server', '开发工具']], [3005, ['Dev Server', '开发工具']],
    [4200, ['Angular', '开发工具']], [5173, ['Vite', '开发工具']],
    [5230, ['Memos', '开发工具']], [4321, ['Astro', '文档知识']],
    [11434, ['Ollama', 'AI 工具']], [1234, ['LM Studio', 'AI 工具']],
    [5006, ['One API', 'AI 工具']],
    [8384, ['Syncthing', '文件同步']], [22000, ['Syncthing', '文件同步']],
    [3306, ['MySQL', '数据库']], [5432, ['PostgreSQL', '数据库']],
    [6379, ['Redis', '数据库']], [27017, ['MongoDB', '数据库']],
    [9042, ['Cassandra', '数据库']], [8529, ['ArangoDB', '数据库']],
    [9200, ['Elasticsearch', '数据库']], [8086, ['InfluxDB', '数据库']],
    [5672, ['AMQP', '消息队列']], [15672, ['RabbitMQ 管理', '消息队列']],
    [1883, ['MQTT', '消息队列']], [9092, ['Kafka', '消息队列']],
    [8222, ['Vaultwarden', '密码管理']],
    [22, ['SSH', '远程访问']], [3389, ['远程桌面', '远程访问']],
    [5900, ['VNC', '远程访问']],
    [9080, ['DownloadSDK', '下载工具']], [9081, ['Thunder', '下载工具']],
    // 自托管主流服务补充
    [3300, ['Grafana', '监控']],
    [8083, ['Cloudreve', '文件共享']], [5244, ['AList', '文件共享']],
    [5240, ['AList', '文件共享']], [5212, ['Cloudreve', '文件共享']],
    [8089, ['Calibre-Web', '阅读器']], [9783, ['Stirling PDF', '文档知识']],
    [8484, ['Stirling PDF', '文档知识']], [8086, ['Adminer', '管理面板']],
    [8010, ['CyberChef', '开发工具']], [18080, ['Nginx UI', '管理面板']],
    [9002, ['MinIO Console', '管理面板']], [9003, ['MinIO Console', '管理面板']],
    [6006, ['TensorBoard', '开发工具']], [8888, ['Jupyter', '开发工具']],
    [8889, ['Jupyter', '开发工具']], [8087, ['Fider', 'Web 服务']],
    [14004, ['Outline', '文档知识']], [9899, ['AList HTTPS', '文件共享']],
    [3001, ['Gitea / Uptime Kuma', '监控']], [4000, ['爬虫服务', '开发工具']],
]);

const CONTAINER_CATEGORY_RULES = [
    [/jellyfin|emby|plex|navidrome|audiobook|immich|photoprism|finamp|photo/i, '媒体'],
    [/uptime|prometheus|grafana|netdata|glances|zabbix|gatus|speedtest/i, '监控'],
    [/mysql|mariadb|postgres|mongo|redis|clickhouse|influx|elastic/i, '数据库'],
    [/n8n|node-?red|automation|workflow|home.?assistant|zigbee|esphome/i, '自动化'],
    [/portainer|cockpit|webmin|dozzle/i, '管理面板'],
    [/nginx|npm|traefik|caddy|proxy|haproxy|misp/i, '管理面板'],
    [/gitea|gitlab|gogs|git/i, '版本控制'],
    [/qbittorrent|transmission|aria2|sab|nzb|deluge|download|thunder/i, '下载'],
    [/vault|bitwarden|password/i, '密码管理'],
    [/wiki|bookstack|outline|paperless|doc/i, '文档知识'],
    [/dify|openai|oneapi|ollama|webui|chatgpt|llm|ai[-_]|one-api/i, 'AI 工具'],
    [/nextcloud|seafile|filebrowser|webdav|dufs|minio/i, '文件共享'],
    [/freshrss|miniflux|rss|ttrss/i, '阅读器'],
    [/matrix|mattermost|rocket|chat/i, '通信协作'],
    [/firefly|invoice|finance/i, '财务'],
    [/syncthing/i, '文件同步'],
    [/auth|sso|keycloak|ldap/i, '认证'],
    [/cyberchef|it-?tools|navigator|light/i, '开发工具'],
];

const TITLE_RULES = [
    [/^jellyfin$/i, 'Jellyfin', '媒体'],
    [/^emby$/i, 'Emby', '媒体'],
    [/plex/i, 'Plex', '媒体'],
    [/portainer/i, 'Portainer', '管理面板'],
    [/home assistant/i, 'Home Assistant', '智能家居'],
    [/uptime kuma/i, 'Uptime Kuma', '监控'],
    [/grafana/i, 'Grafana', '监控'],
    [/prometheus/i, 'Prometheus', '监控'],
    [/gitea/i, 'Gitea', '版本控制'],
    [/gitlab/i, 'GitLab', '版本控制'],
    [/n8n/i, 'n8n', '自动化'],
    [/node-?red/i, 'Node-RED', '自动化'],
    [/dify/i, 'Dify', 'AI 工具'],
    [/open ?webui/i, 'Open WebUI', 'AI 工具'],
    [/one ?api/i, 'One API', 'AI 工具'],
    [/nextcloud/i, 'Nextcloud', '文件共享'],
    [/syncthing/i, 'Syncthing', '文件同步'],
    [/minio( console)?/i, 'MinIO Console', '文件共享'],
    [/vaultwarden|bitwarden/i, 'Vaultwarden', '密码管理'],
    [/paperless/i, 'Paperless', '文档知识'],
    [/pi-?hole/i, 'Pi-hole', '网络服务'],
    [/adguard/i, 'AdGuard Home', '网络服务'],
    [/nginx proxy manager/i, 'Nginx Proxy Manager', '管理面板'],
    [/immich/i, 'Immich', '媒体'],
    [/photoprism/i, 'PhotoPrism', '媒体'],
    [/navidrome/i, 'Navidrome', '媒体'],
    [/freshrss/i, 'FreshRSS', '阅读器'],
    [/miniflux/i, 'Miniflux', '阅读器'],
    [/firefly/i, 'Firefly III', '财务'],
    [/cockpit/i, 'Cockpit', '管理面板'],
    [/cyberchef/i, 'CyberChef', '开发工具'],
    [/it-?tools/i, 'IT Tools', '开发工具'],
];

// ================= 工具 =================
function sh(cmd, timeoutMs = 8000) {
    try {
        return execSync(cmd, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return ''; }
}

const SYSTEM_PORTS = new Set([135, 139, 445, 5040, 5357, 7680]);
function isSystemPort(p) {
    return SYSTEM_PORTS.has(p) || (p >= 49152 && p <= 65535);
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

// ================= 收集器 =================
function collectPorts() {
    const platform = process.platform;
    const ports = new Map();
    let output = '';

    if (platform === 'win32') {
        output = sh('netstat -ano', 10000);
        for (const line of output.split('\n')) {
            const parts = line.trim().split(/\s+/);
            if (parts[0] !== 'TCP' || parts[3] !== 'LISTENING') continue;
            const local = parts[1] || '';
            const c = local.lastIndexOf(':');
            if (c === -1) continue;
            const port = parseInt(local.slice(c + 1), 10);
            const pid = parseInt(parts[4], 10) || 0;
            if (!port || isSystemPort(port)) continue;
            const addr = local.slice(0, c);
            if (!ports.has(port)) ports.set(port, { port, pid, addrs: new Set() });
            ports.get(port).addrs.add(addr);
        }
    } else {
        output = sh('ss -tlnp 2>/dev/null || netstat -an -p tcp 2>/dev/null || lsof -i -P -n 2>/dev/null', 10000);
        for (const line of output.split('\n')) {
            const ss = line.match(/LISTEN\s+\d+\s+\d+\s+(\[?[^\s\]]+\]?):(\d+)\s/i);
            if (ss) {
                const port = parseInt(ss[2], 10);
                if (!port || isSystemPort(port)) continue;
                const pidM = line.match(/pid=(\d+)/);
                const pid = pidM ? parseInt(pidM[1], 10) : 0;
                if (!ports.has(port)) ports.set(port, { port, pid, addrs: new Set() });
                ports.get(port).addrs.add(ss[1]);
                continue;
            }
            const lf = line.match(/^(?:\S+)\s+(\d+)\s+.*TCP\s+\[?([^\s\]]+)\]?:(\d+)\s+\(LISTEN\)/);
            if (lf) {
                const port = parseInt(lf[3], 10);
                if (!port || isSystemPort(port)) continue;
                if (!ports.has(port)) ports.set(port, { port, pid: parseInt(lf[1], 10), addrs: new Set() });
                ports.get(port).addrs.add(lf[2]);
            }
        }
    }
    return ports;
}

// ---- 进程表批量解析（一次系统调用拿到全部 pid→名称，替代逐 pid 查询） ----

// 解析 `tasklist /FO CSV /NH` 输出：`"nginx.exe","1234","Console",...` → Map(pid → name)
// CSV 引号内的逗号（进程名本身含逗号）需要逐字符状态机处理，不能简单 split(',')
function parseProcessTable(output) {
    const map = new Map();
    for (const line of String(output || '').split('\n')) {
        if (!line.includes('"')) continue;
        const cols = [];
        let cur = '', inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; continue; }
            if (ch === ',' && !inQ) { cols.push(cur); cur = ''; continue; }
            cur += ch;
        }
        cols.push(cur);
        const name = (cols[0] || '').trim();
        const pid = parseInt(cols[1], 10);
        if (name && Number.isInteger(pid) && pid > 0) map.set(pid, name);
    }
    return map;
}

// 一次性进程表：Windows 用 tasklist CSV，*nix 用 ps；失败回退空表（进程名仅用于兜底识别）
function buildProcessMap() {
    if (process.platform === 'win32') {
        return parseProcessTable(sh('tasklist /FO CSV /NH', 10000));
    }
    const out = sh('ps -eo pid=,comm=', 10000);
    const map = new Map();
    for (const line of out.split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(.+)$/);
        if (m) map.set(parseInt(m[1], 10), m[2].trim());
    }
    return map;
}

// ---- 网络地址分析：多地址生成（本地 / 局域网 / Tailscale） ----

const LOOPBACK_BINDINGS = new Set(['127.0.0.1', '[::1]']);
// 绑定地址全部是回环 → 服务只在本机可访问，不该生成局域网地址
function isLoopbackOnlyBinding(addrs) {
    const list = [...(addrs || [])].filter(Boolean);
    return list.length > 0 && list.every(a => LOOPBACK_BINDINGS.has(a));
}

function ipv4Class(ip, ifaceName = '') {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    if (parts[0] === 169 && parts[1] === 254) return 'link-local';       // 未连接/自动分配
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return 'cgnat'; // Tailscale 段
    if (/tailscale/i.test(ifaceName)) return 'cgnat';                    // 接口名兜底
    if (parts[0] === 10 || parts[0] === 192 && parts[1] === 168 ||
        parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return 'lan';
    return null;                                                          // 公网/虚拟网等不自动生成
}

// 虚拟网卡特征：WSL / Hyper-V / VMware / VirtualBox / 容器 —— 这些地址对外不可达，不该生成
const VIRTUAL_IFACE = /vethernet|wsl|vmware|virtualbox|hyper-?v|loopback|docker|veth|zerotier|tap|bridge/i;

// 从 os.networkInterfaces() 结果挑选可生成的地址：局域网优先于 Tailscale，合计最多 2 个。
// 虚拟网卡（WSL 等）默认排除；若机器只有虚拟网卡则保留一个，避免空手而归。
function pickLanAddresses(ifaces) {
    const lan = [], virtual = [], ts = [];
    for (const [ifaceName, addrs] of Object.entries(ifaces || {})) {
        for (const a of addrs || []) {
            if (a.internal || a.family !== 'IPv4') continue;
            const kind = ipv4Class(a.address, ifaceName);
            if (kind === 'lan') {
                (VIRTUAL_IFACE.test(ifaceName) ? virtual : lan).push({ address: a.address, label: '局域网' });
            } else if (kind === 'cgnat') {
                ts.push({ address: a.address, label: 'Tailscale' });
            }
        }
    }
    const dedup = list => {
        const seen = new Set();
        return list.filter(x => (seen.has(x.address) ? false : (seen.add(x.address), true)));
    };
    const realLan = dedup(lan);
    const lanPick = realLan.length ? realLan : dedup(virtual).slice(0, 1);
    return [...lanPick.slice(0, 2), ...dedup(ts).slice(0, 1)].slice(0, 2);
}

// 构建多地址 urls：本地恒为 priority 1；--host 覆盖时退化为单地址；loopback-only 不加局域网
function buildServiceUrls({ port, scheme = 'http', addrs = new Set(), lanAddresses = [], hostOverride = null, loopbackOnly = false }) {
    const schemeFor = p => (scheme === 'https' || p === 443 || p === 8443 || p === 9443 ? 'https' : 'http');
    if (hostOverride) {
        return [{ address: `${schemeFor(port)}://${hostOverride}:${port}`, label: '默认', priority: 1 }];
    }
    const urls = [{ address: `${schemeFor(port)}://127.0.0.1:${port}`, label: '本地', priority: 1 }];
    if (loopbackOnly) return urls;
    for (const lan of lanAddresses) {
        urls.push({ address: `${schemeFor(port)}://${lan.address}:${port}`, label: lan.label, priority: urls.length + 1 });
    }
    return urls;
}

// 展开一个链接条目的全部地址（单 url 字段 + urls 数组），用于 --merge 任意地址去重
function linkAddresses(link) {
    const out = [];
    if (link?.url) out.push(link.url);
    for (const u of link?.urls || []) {
        if (u?.address) out.push(u.address);
    }
    return out;
}

function getDockerMap() {
    // 多重回退:PATH 中的 docker → WSL 内 docker。
    // Names/Ports 分两次调用，规避格式串被 shell 转发时引号吞噬。
    const map = new Map(); // hostPort → { name, host }
    const candidates = ['docker', 'wsl docker'];

    for (const cmd of candidates) {
        const names = sh(cmd + ' ps --format "{{.Names}}"', 20000);
        const ports = sh(cmd + ' ps --format "{{.Ports}}"', 20000);
        if (!names.trim() || !ports.trim()) continue;

        const nameLines = names.trim().split('\n');
        const portLines = ports.trim().split('\n');
        if (nameLines.length !== portLines.length) continue;

        for (let i = 0; i < nameLines.length; i++) {
            const name = nameLines[i].trim();
            const ps = portLines[i] || '';
            if (!name || !ps) continue;
            // 已发布端口: [ip:]hostPort[-end]->container/proto（未发布与 udp 跳过）
            for (const mm of ps.matchAll(/([0-9.]+|\[::\]):(\d+)(?:-(\d+))?->/g)) {
                const host = mm[1] || '0.0.0.0';
                const start = parseInt(mm[2], 10);
                const endP = mm[3] ? parseInt(mm[3], 10) : start;
                if (endP - start > 64) continue;
                for (let p = start; p <= endP; p++) {
                    if (!map.has(p)) map.set(p, { name, host });
                }
            }
        }
        if (map.size) return map;
    }
    return map;
}

async function probeHttp(port, timeoutMs = PROBE_TIMEOUT, target = '127.0.0.1') {
    // TLS 嫌疑端口先 https；其余先 http，连接失败再试 https（覆盖任意端口上的自签 TLS 服务）
    const tlsSuspect = port === 443 || port === 8443 || port === 9443;
    const schemes = tlsSuspect ? ['https', 'http'] : ['http', 'https'];
    for (const [attempt, scheme] of schemes.entries()) {
        // 超时必须覆盖到响应体读取：SSE / 长连接服务永远不发完整 body，
        // res.text() 会无限等待——先关 timer 再读 body 是旧版卡死 60s 的根因。
        // 第二次尝试（协议回退）减半超时：本地 TLS 握手 <100ms，1.2s 已足够慷慨
        const attemptTimeout = attempt === 0 ? timeoutMs : Math.min(timeoutMs, 1500);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), attemptTimeout);
        try {
            const res = await fetch(scheme + '://' + target + ':' + port + '/', {
                signal: ctrl.signal,
                redirect: 'follow'
                // 仅探测用途：自签证书也接受（进程启动时已放宽本 CLI 的 TLS 校验）
            });
            const server = res.headers.get('server') || '';
            // 只读前 20KB（拿 <title> 足够），够了立即断开，不等长响应结束
            const reader = res.body?.getReader();
            let received = 0; const chunks = [];
            while (reader && received < 20000) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.length;
            }
            reader?.cancel().catch(() => {});
            clearTimeout(timer);
            const html = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
            const title = html.match(/<title[^>]*>([^<]{1,100})<\/title>/i)?.[1]?.trim() || '';
            return { title, server, scheme };
        } catch {
            clearTimeout(timer);
            /* 下一个 scheme */
        }
    }
    return null;
}

// 探测目标按实际绑定选择：仅 [::1] 绑定的服务探测 127.0.0.1 必失败
function probeTargetFor(addrs) {
    const list = [...(addrs || [])];
    if (list.includes('[::1]')) return '[::1]';
    return '127.0.0.1';
}

// ================= 识别管线 =================
function identify(svc, dockerMap, probeInfo) {
    // ① Docker 容器名（最高置信度）
    const container = dockerMap.get(svc.port);
    if (container) {
        const friendly = friendlyContainerName(container.name);
        const cat = CONTAINER_CATEGORY_RULES.find(([re]) => re.test(container.name))?.[1];
        return {
            name: friendly,
            category: cat || 'Docker 服务',
            source: 'docker',
            localOnly: container.host === '127.0.0.1'
        };
    }
    // ② 知名端口库
    const known = KNOWN_PORTS.get(svc.port);
    if (known) return { name: known[0], category: known[1], source: 'port-db' };
    // ③ HTTP 标题
    if (probeInfo && probeInfo.title) {
        const rule = titleRule(probeInfo.title);
        if (rule) return { name: rule.name, category: rule.category, source: 'http-title' };
    }
    // ④ 进程名
    if (svc.processName) {
        const clean = svc.processName.replace(/\.(exe|dll)$/i, '');
        const cat = CONTAINER_CATEGORY_RULES.find(([re]) => re.test(clean))?.[1];
        if (cat) return { name: clean.charAt(0).toUpperCase() + clean.slice(1), category: cat, source: 'process' };
        return { name: clean.charAt(0).toUpperCase() + clean.slice(1) + ' :' + svc.port, category: '其他服务', source: 'process' };
    }
    // ⑤ 端口段兜底
    if (svc.port >= 3000 && svc.port < 4000) return { name: `服务 :${svc.port}`, category: '开发工具', source: 'range' };
    if (svc.port >= 8000 && svc.port < 9000) return { name: `服务 :${svc.port}`, category: 'Web 服务', source: 'range' };
    return { name: `服务 :${svc.port}`, category: '其他服务', source: 'unknown' };
}

// 非浏览器可打开的端口：基础集 + 从知识库推导纯协议类（数据库/消息队列/远程访问）。
// 注意「文件同步」「下载」类不整类排除——8384/9091 等是 Web UI；协议类中也有例外
// （15672 RabbitMQ 管理面板、9200/8086 是 HTTP API），统一走例外白名单。
const NON_HTTP_CATEGORIES = new Set(['数据库', '消息队列', '远程访问']);
const NON_HTTP_EXCEPTIONS = new Set([15672, 9200, 8086]);
const NON_HTTP_PORTS = (() => {
    const base = new Set([22, 53, 5901, 6881, 22000]);
    for (const [port, [, category]] of KNOWN_PORTS) {
        if (NON_HTTP_CATEGORIES.has(category) && !NON_HTTP_EXCEPTIONS.has(port)) base.add(port);
    }
    return base;
})();

// ================= 扫描核心（CLI 与导航服务器 /api/scan 共用） =================

// options: { probe, probeConcurrency, probeTimeout, exclude, limit, localOnly, hostOverride, onProgress }
// 返回 { lanAddresses, services }；services 已按分组排序并应用 exclude/limit
async function scanLocalServices(options = {}) {
    const probe = options.probe === true;
    const probeConcurrency = Math.max(1, options.probeConcurrency || 16);
    const probeTimeout = Math.max(500, options.probeTimeout || 2500);
    const exclude = (options.exclude || []).filter(Number.isInteger);
    const limit = Number.isFinite(options.limit) ? options.limit : Infinity;
    const hostOverride = options.hostOverride || null;

    const ports = collectPorts();
    const dockerMap = getDockerMap();
    const processMap = buildProcessMap();
    const services = [...ports.values()].map(p => ({ ...p, processName: processMap.get(p.pid) || '' }));

    const lanAddresses = (!hostOverride && !options.localOnly) ? pickLanAddresses(networkInterfaces()) : [];

    if (probe) {
        const candidates = services.filter(s =>
            !NON_HTTP_PORTS.has(s.port) && !dockerMap.has(s.port) && !exclude.includes(s.port));
        for (let i = 0; i < candidates.length; i += probeConcurrency) {
            const batch = candidates.slice(i, i + probeConcurrency);
            const results = await Promise.all(batch.map(s => probeHttp(s.port, probeTimeout, probeTargetFor(s.addrs))));
            results.forEach((info, j) => { if (info) batch[j].probe = info; });
            options.onProgress?.(Math.min(i + probeConcurrency, candidates.length), candidates.length);
        }
    }

    const identified = services.map(s => {
        const id = identify(s, dockerMap, s.probe);
        const urls = buildServiceUrls({
            port: s.port,
            scheme: s.probe?.scheme,
            addrs: s.addrs,
            lanAddresses,
            hostOverride,
            loopbackOnly: Boolean(id.localOnly) || isLoopbackOnlyBinding(s.addrs)
        });
        return {
            urls,
            port: s.port,
            name: id.name,
            category: id.category,
            tag: id.source === 'docker' ? 'Docker' : (s.processName ? s.processName.replace(/\.(exe|dll)$/i, '').slice(0, 14) : ''),
            source: id.source
        };
    });

    const filteredList = exclude.length ? identified.filter(svc => !exclude.includes(svc.port)) : identified;
    const finalList = Number.isFinite(limit) ? filteredList.slice(0, limit) : filteredList;
    finalList.sort((a, b) => a.category.localeCompare(b.category, 'zh-CN') || a.port - b.port);
    return { lanAddresses, services: finalList };
}

// ================= 主流程 =================
async function main() {
    log(`${C.b}🔍 本地服务自动发现${C.x}`);
    const modeParts = [PROBE ? '扫描+探测' : '扫描'];
    if (MERGE) modeParts.push('合并');
    if (HOST_OVERRIDE) modeParts.push(`单主机 ${HOST_OVERRIDE}`);
    else if (LOCAL_ONLY) modeParts.push('仅本机地址');
    else modeParts.push('多地址');
    log(`${C.dim}   模式: ${modeParts.join(' + ')}${C.x}\n`);

    const scanStart = Date.now();
    const { lanAddresses, services: finalList } = await scanLocalServices({
        probe: PROBE,
        probeConcurrency: PROBE_CONCURRENCY,
        probeTimeout: PROBE_TIMEOUT,
        exclude: EXCLUDE,
        limit: LIMIT,
        localOnly: LOCAL_ONLY,
        hostOverride: HOST_OVERRIDE,
        onProgress(done, total) {
            process.stdout.write('\r    已探测 ' + done + ' / ' + total);
        }
    });
    if (PROBE) process.stdout.write('\n');
    log(`${C.dim}  · 扫描完成，耗时 ${((Date.now() - scanStart) / 1000).toFixed(1)}s${C.x}`);
    if (lanAddresses.length) {
        log(`${C.dim}  · 网卡地址 ${lanAddresses.map(a => `${a.label} ${a.address}`).join('，')}${C.x}`);
    }
    const identified = finalList;

    finalList.sort((a, b) => a.category.localeCompare(b.category, 'zh-CN') || a.port - b.port);
    const byCategory = {};
    identified.forEach(l => (byCategory[l.category] ||= []).push(l));

    log(`${C.b}识别结果：${C.x}`);
    let lastCat = '';
    for (const svc of finalList) {
        if (svc.category !== lastCat) {
            log(`${C.g}  ▸ ${svc.category}${C.x}`);
            lastCat = svc.category;
        }
        const src = { docker: `${C.g}docker${C.x}`, 'port-db': `${C.b}已知${C.x}`, 'http-title': `${C.y}探测${C.x}`, process: `${C.dim}进程${C.x}`, range: `${C.dim}推断${C.x}`, unknown: `${C.dim}未知${C.x}` }[svc.source];
        const labels = [...new Set(svc.urls.map(u => u.label))].join('·');
        const onlyLocal = !HOST_OVERRIDE && svc.urls.length === 1 && svc.urls[0].address.includes('127.0.0.1');
        const flag = onlyLocal ? ` ${C.r}仅本机${C.x}` : '';
        const schemeBadge = svc.urls[0].address.startsWith('https://') ? `${C.b}[https]${C.x}` : '';
        log(`    ${String(svc.port).padEnd(6)} ${svc.name.padEnd(28)} ${schemeBadge}${src} ${C.dim}${labels}${C.x}${flag}`);
    }

    const links = finalList.map((svc, i) => ({
        ID: i + 1,
        name: svc.name,
        kind: 'site',
        urls: svc.urls,
        category: svc.category,
        tag: svc.tag,
        thumbnail: ''
    }));

    if (LIST_ONLY) {
        log(`\n${C.y}--list 模式：未写入任何文件${C.x}`);
        return;
    }

    const payload = {
        _meta: {
            scannedAt: new Date().toISOString(),
            host: HOST_OVERRIDE || '127.0.0.1',
            lanAddresses,
            total: links.length,
            tool: 'scan-local.mjs'
        },
        links
    };

    if (JSON_OUT) {
        // 管道友好：纯 JSON 到 stdout,无表格无颜色
        console.log(JSON.stringify({ scannedAt: payload._meta.scannedAt, host: payload._meta.host, lanAddresses, links }, null, 2));
        return;
    }
    if (MERGE) {
        let existing = { links: [] };
        if (existsSync(LINKS_JSON)) {
            try { existing = JSON.parse(readFileSync(LINKS_JSON, 'utf8')); } catch { /* 保留空 */ }
        }
        // 任意地址重叠即视为已存在（兼容旧单 url 条目与新多地址条目）
        const existingAddrs = new Set((existing.links || []).flatMap(l => linkAddresses(l)));
        let nextId = (existing.links || []).reduce((mx, l) => Math.max(mx, l.ID || 0), 0) + 1;
        let added = 0;
        for (const l of links) {
            const overlap = linkAddresses(l).some(a => existingAddrs.has(a));
            if (overlap) continue;
            existing.links ||= [];
            existing.links.push({ ...l, ID: nextId++ });
            linkAddresses(l).forEach(a => existingAddrs.add(a));
            added++;
        }
        writeFileSync(LINKS_JSON, JSON.stringify(existing, null, 4) + '\n');
        log(`\n${C.g}✅ 已合并进 ${C.x}${LINKS_JSON}`);
        log(`${C.g}   新增 ${added} 个、保留原有 ${(existing.links || []).length - added} 个（只增不改不删，地址重叠跳过）${C.x}`);
    } else {
        writeFileSync(OUT, JSON.stringify(payload, null, 4) + '\n');
        log(`\n${C.g}✅ 已生成 ${C.x}${OUT}`);
        log(`${C.dim}   导入：设置 → 数据 → 导入完整配置（选择此文件）${C.x}`);
        log(`${C.dim}   或加 --merge 直接合并进 links.json${C.x}`);
    }

    if (existsSync(LINKS_JSON) && !MERGE) {
        try {
            const existing = JSON.parse(readFileSync(LINKS_JSON, 'utf8'));
            const urls = new Set((existing.links || []).flatMap(l => linkAddresses(l)));
            const fresh = links.filter(l => !linkAddresses(l).some(a => urls.has(a)));
            if (fresh.length) {
                log(`\n${C.y}💡 相比当前 links.json 有 ${fresh.length} 个新服务：${C.x}`);
                fresh.slice(0, 8).forEach(f => log(`   + ${f.urls[0].address}  ${C.dim}${f.name}${C.x}`));
                if (fresh.length > 8) log(`   … 还有 ${fresh.length - 8} 个`);
            }
        } catch { /* 忽略 */ }
    }

    log('');
}

// 仅直接运行时执行（便于测试导入纯函数）
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(e => { console.error(`${C.r}扫描失败: ${e.message}${C.x}`); process.exit(1); });

export {
    identify, isSystemPort, friendlyContainerName, titleRule, KNOWN_PORTS,
    parseProcessTable, pickLanAddresses, isLoopbackOnlyBinding,
    buildServiceUrls, linkAddresses, probeTargetFor, NON_HTTP_PORTS,
    scanLocalServices
};
