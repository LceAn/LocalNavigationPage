#!/usr/bin/env node
// scripts/scan-local.mjs — 本地服务自动发现与导入（产品级）
//
// 三层识别：Docker 容器名 → 知名服务库(端口) → 进程/端口段兜底
//
// 用法：
//   npm run scan                    扫描并生成 HTML/data/links-local.json
//   npm run scan -- --probe         HTTP 探测页面标题（更准确，稍慢）
//   npm run scan -- --merge         合并进 HTML/data/links.json（只增不改不删）
//   npm run scan -- --host <ip>     生成局域网地址（默认 127.0.0.1）
//   npm run scan -- --out <path>    自定义输出路径
//   npm run scan -- --list          只打印表格，不写文件
//   npm run scan -- --no-color      关闭彩色输出
//
// 零依赖；Windows(netstat+tasklist) / Linux(ss) / macOS(lsof)；WSL2 兼容。

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ================= 参数 =================
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined; };
const PROBE = has('--probe');
const MERGE = has('--merge');
const LIST_ONLY = has('--list');
const NO_COLOR = has('--no-color') || process.env.NO_COLOR || !process.stdout.isTTY;
const HOST = val('--host') || '127.0.0.1';
const OUT = val('--out') ? resolve(val('--out')) : join(root, 'HTML', 'data', 'links-local.json');
const LINKS_JSON = join(root, 'HTML', 'data', 'links.json');

// ================= 输出 =================
const C = NO_COLOR ? { g: '', y: '', b: '', r: '', dim: '', x: '' } : {
    g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[36m', r: '\x1b[31m', dim: '\x1b[2m', x: '\x1b[0m'
};
const log = (s = '') => console.log(s);

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

async function probeHttp(port, timeoutMs = 2500) {
    if (port === 443 || port === 8443 || port === 9443) return null;
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(`http://127.0.0.1:${port}/`, { signal: ctrl.signal, redirect: 'follow' });
        clearTimeout(timer);
        const server = res.headers.get('server') || '';
        const html = (await res.text()).slice(0, 20000);
        const title = html.match(/<title[^>]*>([^<]{1,100})<\/title>/i)?.[1]?.trim() || '';
        return { title, server };
    } catch { return null; }
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

const NON_HTTP_PORTS = new Set([22, 53, 3306, 5432, 6379, 27017, 5900, 5901, 5672, 9092, 1883, 6881, 22000, 9042, 3389]);

// ================= 主流程 =================
async function main() {
    log(`${C.b}🔍 本地服务自动发现${C.x}`);
    log(`${C.dim}   主机: ${HOST}  模式: ${PROBE ? '扫描+探测' : '扫描'}${MERGE ? ' + 合并' : ''}${C.x}\n`);

    const ports = collectPorts();
    log(`${C.dim}  · 监听端口 ${ports.size} 个（已排除系统端口）${C.x}`);

    const dockerMap = getDockerMap();
    if (dockerMap.size) log(`${C.dim}  · Docker 容器 ${dockerMap.size} 个发布端口${C.x}`);

    const services = [...ports.values()].map(p => ({ ...p, processName: getProcessName(p.pid) }));

    let probed = 0;
    if (PROBE) {
        const candidates = services.filter(s => !NON_HTTP_PORTS.has(s.port) && !dockerMap.has(String(s.port)));
        log(`${C.dim}  · HTTP 探测 ${candidates.length} 个候选…${C.x}`);
        // 并行探测（8 并发），速度提升约 8 倍
        const BATCH = 8;
        for (let i = 0; i < candidates.length; i += BATCH) {
            const batch = candidates.slice(i, i + BATCH);
            const results = await Promise.all(batch.map(s => probeHttp(s.port)));
            results.forEach((info, j) => {
                if (info) { batch[j].probe = info; probed++; }
            });
            process.stdout.write('\r    已探测 ' + Math.min(i + BATCH, candidates.length) + ' / ' + candidates.length);
        }
        process.stdout.write('\n');
        log(`${C.dim}  · 探测成功 ${probed} 个${C.x}\n`);
    }

    const identified = services.map(s => {
        const id = identify(s, dockerMap, s.probe);
        const scheme = s.port === 443 || s.port === 8443 ? 'https' : 'http';
        const hostPart = id.localOnly ? '127.0.0.1' : HOST;
        return {
            url: `${scheme}://${hostPart}:${s.port}`,
            port: s.port,
            name: id.name,
            category: id.category,
            tag: id.source === 'docker' ? 'Docker' : (s.processName ? s.processName.replace(/\.(exe|dll)$/i, '').slice(0, 14) : ''),
            source: id.source
        };
    });

    identified.sort((a, b) => a.category.localeCompare(b.category, 'zh-CN') || a.port - b.port);
    const byCategory = {};
    identified.forEach(l => (byCategory[l.category] ||= []).push(l));

    log(`${C.b}识别结果：${C.x}`);
    let lastCat = '';
    for (const svc of identified) {
        if (svc.category !== lastCat) {
            log(`${C.g}  ▸ ${svc.category}${C.x}`);
            lastCat = svc.category;
        }
        const src = { docker: `${C.g}docker${C.x}`, 'port-db': `${C.b}已知${C.x}`, 'http-title': `${C.y}探测${C.x}`, process: `${C.dim}进程${C.x}`, range: `${C.dim}推断${C.x}`, unknown: `${C.dim}未知${C.x}` }[svc.source];
        const flag = svc.url.includes('127.0.0.1') && HOST !== '127.0.0.1' ? `${C.r} 仅本机${C.x}` : '';
        log(`    ${String(svc.port).padEnd(6)} ${svc.name.padEnd(28)} ${src}${flag}`);
    }

    const links = identified.map((svc, i) => ({
        ID: i + 1,
        name: svc.name,
        url: svc.url,
        category: svc.category,
        tag: svc.tag,
        thumbnail: ''
    }));

    if (LIST_ONLY) {
        log(`\n${C.y}--list 模式：未写入任何文件${C.x}`);
        return;
    }

    const payload = { _meta: { scannedAt: new Date().toISOString(), host: HOST, total: links.length, tool: 'scan-local.mjs' }, links };

    if (MERGE) {
        let existing = { links: [] };
        if (existsSync(LINKS_JSON)) {
            try { existing = JSON.parse(readFileSync(LINKS_JSON, 'utf8')); } catch { /* 保留空 */ }
        }
        const existingUrls = new Set((existing.links || []).map(l => l.url || l.urls?.[0]?.address).filter(Boolean));
        let nextId = (existing.links || []).reduce((mx, l) => Math.max(mx, l.ID || 0), 0) + 1;
        let added = 0;
        for (const l of links) {
            if (existingUrls.has(l.url)) continue;
            existing.links ||= [];
            existing.links.push({ ...l, ID: nextId++ });
            existingUrls.add(l.url);
            added++;
        }
        writeFileSync(LINKS_JSON, JSON.stringify(existing, null, 4) + '\n');
        log(`\n${C.g}✅ 已合并进 ${C.x}${LINKS_JSON}`);
        log(`${C.g}   新增 ${added} 个、保留原有 ${(existing.links || []).length - added} 个（只增不改不删）${C.x}`);
    } else {
        writeFileSync(OUT, JSON.stringify(payload, null, 4) + '\n');
        log(`\n${C.g}✅ 已生成 ${C.x}${OUT}`);
        log(`${C.dim}   导入：设置 → 数据 → 导入完整配置（选择此文件）${C.x}`);
        log(`${C.dim}   或加 --merge 直接合并进 links.json${C.x}`);
    }

    if (existsSync(LINKS_JSON) && !MERGE) {
        try {
            const existing = JSON.parse(readFileSync(LINKS_JSON, 'utf8'));
            const urls = new Set((existing.links || []).map(l => l.url || l.urls?.[0]?.address).filter(Boolean));
            const fresh = links.filter(l => !urls.has(l.url));
            if (fresh.length) {
                log(`\n${C.y}💡 相比当前 links.json 有 ${fresh.length} 个新地址：${C.x}`);
                fresh.slice(0, 8).forEach(f => log(`   + ${f.url}  ${C.dim}${f.name}${C.x}`));
                if (fresh.length > 8) log(`   … 还有 ${fresh.length - 8} 个`);
            }
        } catch { /* 忽略 */ }
    }

    log('');
}

// 仅直接运行时执行（便于测试导入纯函数）
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch(e => { console.error(`${C.r}扫描失败: ${e.message}${C.x}`); process.exit(1); });

export { identify, isSystemPort, friendlyContainerName, titleRule, KNOWN_PORTS };
