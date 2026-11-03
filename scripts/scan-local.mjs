#!/usr/bin/env node
// scripts/scan-local.mjs — 本地服务自动发现与导入
//
// 用法：
//   npm run scan              扫描并生成 HTML/data/links-local.json（不会覆盖 links.json）
//   npm run scan -- --probe   对 HTTP 端口做标题探测（更准确但更慢）
//   npm run scan -- --out ./my-links.json   自定义输出路径
//   npm run scan -- --host 192.168.1.100   用局域网 IP 代替 127.0.0.1
//
// 零依赖，跨平台（Windows: netstat + tasklist; Linux/macOS: ss/lsof + ps）

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
const PROBE = args.includes('--probe');
const hostIdx = args.indexOf('--host');
const HOST = hostIdx !== -1 ? args[hostIdx + 1] : '127.0.0.1';
const outIdx = args.indexOf('--out');
const OUT = outIdx !== -1 ? resolve(args[outIdx + 1]) : join(root, 'HTML', 'data', 'links-local.json');

// ---------- 常见端口分类 ----------
const PORT_CATEGORIES = {
    // Web / 代理
    80: 'Web 服务', 81: 'Web 服务', 443: 'Web 服务', 8080: 'Web 服务', 8000: 'Web 服务',
    8008: 'Web 服务', 8888: 'Web 服务', 9000: '管理面板', 9001: '管理面板',
    19000: '管理面板', 19001: '管理面板', 2019: 'Web 服务', 2015: 'Web 服务',
    8443: 'Web 服务', 10443: 'Web 服务', 10080: 'Web 服务', 8010: 'Web 服务',
    8011: 'Web 服务', 8085: 'Web 服务', 8091: 'Web 服务',
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
    5672: 'AMQP', 9090: 'Prometheus',
};

// 已知纯系统端口（不可能是用户服务）
const SYSTEM_PORTS = new Set([
    135,   // RPC
    139,   // NetBIOS
    445,   // SMB
    5040,  // Windows 服务
    5357,  // WSD
    7680,  // 传递优化
    49152, 49153, 49154, 49155, 49156, 49157, // 动态端口起始
]);

function isExcludedPort(port) {
    if (SYSTEM_PORTS.has(port)) return true;
    if (port >= 49152 && port <= 65535) return true; // 动态/临时端口段
    return false;
}

// ---------- 平台适配 ----------
function getListeningPorts() {
    const platform = process.platform;
    let output;
    try {
        if (platform === 'win32') {
            output = execSync('netstat -ano', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        } else {
            // Linux: ss, macOS: lsof
            try {
                output = execSync('ss -tlnp 2>/dev/null || lsof -i -P -n | grep LISTEN 2>/dev/null', {
                    encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, shell: '/bin/bash'
                });
            } catch {
                output = execSync('netstat -tlnp 2>/dev/null', {
                    encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
                });
            }
        }
    } catch (e) {
        console.error('无法获取端口列表:', e.message);
        process.exit(1);
    }

    const ports = new Map(); // key: `${addr}:${port}`, value: { port, pid, addr }

    for (const line of output.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let port = 0, pid = 0, addr = '0.0.0.0';
        const parts = trimmed.split(/\s+/);

        if (platform === 'win32') {
            // TCP  0.0.0.0:22  0.0.0.0:0  LISTENING  6000
            if (parts[0] !== 'TCP' || parts[3] !== 'LISTENING') continue;
            const local = parts[1] || '';
            const lastColon = local.lastIndexOf(':');
            if (lastColon === -1) continue;
            addr = local.slice(0, lastColon).replace(/^\[|\]$/g, '');
            port = parseInt(local.slice(lastColon + 1), 10);
            pid = parseInt(parts[4], 10) || 0;
        } else {
            // ss: LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=6000,fd=3))
            const ssMatch = trimmed.match(/LISTEN\s+\d+\s+\d+\s+(\S+):(\d+)\s+\S+.*pid=(\d+)/);
            if (ssMatch) {
                addr = ssMatch[1].replace(/^\[|\]$/g, '');
                port = parseInt(ssMatch[2], 10);
                pid = parseInt(ssMatch[3], 10) || 0;
            } else {
                // lsof: sshd 6000 root 3u IPv4 ... TCP *:22 (LISTEN)
                const lsofMatch = trimmed.match(/^(\S+)\s+(\d+)\s+\S+.*TCP\s+\S+:(\d+)\s+\(LISTEN\)/);
                if (lsofMatch) {
                    pid = parseInt(lsofMatch[2], 10);
                    port = parseInt(lsofMatch[3], 10);
                }
            }
        }

        if (port > 0 && port < 65536) {
            if (isExcludedPort(port)) continue;

            const key = `${port}`;
            if (!ports.has(key)) {
                ports.set(key, { port, pid, addr });
            }
        }
    }

    return [...ports.values()];
}

function getProcessName(pid) {
    if (!pid || pid === 0) return '';
    const platform = process.platform;
    try {
        if (platform === 'win32') {
            const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' });
            const name = out.split(',')[0]?.replace(/"/g, '').trim();
            return name && !name.includes('INFO') ? name : '';
        } else {
            const out = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' });
            return out.trim();
        }
    } catch { return ''; }
}

// ---------- HTTP 探测（可选） ----------
async function probeHttpTitle(port, timeout = 2000) {
    return new Promise((resolvePromise) => {
        const timer = setTimeout(() => resolvePromise(null), timeout);
        try {
            fetch(`http://127.0.0.1:${port}/`, {
                signal: AbortSignal.timeout(timeout),
                redirect: 'follow'
            })
                .then(r => r.text())
                .then(html => {
                    clearTimeout(timer);
                    const title = html.match(/<title[^>]*>([^<]{1,80})<\/title>/i)?.[1]?.trim();
                    resolvePromise(title || null);
                })
                .catch(() => { clearTimeout(timer); resolvePromise(null); });
        } catch { clearTimeout(timer); resolvePromise(null); }
    });
}

// ---------- 分类推断 ----------
function inferCategory(port, processName) {
    if (PORT_CATEGORIES[port]) return PORT_CATEGORIES[port];

    const pn = (processName || '').toLowerCase();
    if (/docker|containerd|podman/.test(pn)) return '容器';
    if (/node|deno|bun/.test(pn)) return '开发工具';
    if (/python|uvicorn|gunicorn|flask|django/.test(pn)) return '开发工具';
    if (/nginx|apache|httpd|caddy/.test(pn)) return 'Web 服务';
    if (/mysql|mariadb/.test(pn)) return '数据库';
    if (/postgres/.test(pn)) return '数据库';
    if (/redis/.test(pn)) return '数据库';
    if (/mongod/.test(pn)) return '数据库';
    if (/ssh|sshd/.test(pn)) return '远程访问';
    if (/transmission|qbittorrent|aria2/.test(pn)) return '下载';
    if (/jellyfin|emby|plex|kodi/.test(pn)) return '媒体';
    if (/prometheus|grafana|netdata/.test(pn)) return '监控';
    if (/syncthing/.test(pn)) return '同步';
    if (/git|gitea|gitlab|gogs/.test(pn)) return '版本控制';

    // 端口段推断
    if (port >= 3000 && port < 4000) return '开发工具';
    if (port >= 8000 && port < 9000) return 'Web 服务';
    if (port >= 9000 && port < 10000) return '管理面板';

    return '其他服务';
}

function inferName(port, processName, httpTitle) {
    if (httpTitle) return httpTitle;
    if (PORT_NAMES[port]) return PORT_NAMES[port];
    if (processName) {
        // 去掉 .exe 后缀，首字母大写
        const clean = processName.replace(/\.(exe|dll)$/i, '');
        return `${clean.charAt(0).toUpperCase()}${clean.slice(1)} :${port}`;
    }
    return `服务 :${port}`;
}

// ---------- 主流程 ----------
async function main() {
    console.log('🔍 扫描本地监听端口...\n');

    const rawPorts = getListeningPorts();
    if (!rawPorts.length) {
        console.log('未发现监听端口。');
        process.exit(0);
    }

    console.log(`  发现 ${rawPorts.length} 个候选端口，获取进程信息...`);

    // 获取进程名（仅供展示参考，不用于过滤——WSL2 端口转发经 svchost，
    // 按进程名排除会丢掉所有 WSL2 服务）
    const withProcess = rawPorts.map(p => ({
        ...p,
        processName: getProcessName(p.pid)
    }));

    console.log(`  收集到 ${withProcess.length} 个服务\n`);

    // 可选 HTTP 探测
    let probeCount = 0;
    if (PROBE) {
        console.log('🌐 探测 HTTP 标题（可能需要几秒）...\n');
        for (const svc of withProcess) {
            if (svc.port === 22 || svc.port === 3306 || svc.port === 5432 ||
                svc.port === 6379 || svc.port === 27017 || svc.port === 53) continue; // 非 HTTP 端口跳过
            svc.httpTitle = await probeHttpTitle(svc.port);
            if (svc.httpTitle) probeCount++;
        }
        console.log(`  ${probeCount} 个服务返回了页面标题\n`);
    }

    // 生成链接
    const links = withProcess.map((svc, i) => {
        const category = inferCategory(svc.port, svc.processName);
        const name = inferName(svc.port, svc.processName, svc.httpTitle);
        const isHttp = ![22, 3306, 5432, 6379, 27017, 53, 5900, 5901].includes(svc.port);
        const scheme = svc.port === 443 || svc.port === 8443 ? 'https' : 'http';

        return {
            ID: i + 1,
            name,
            url: isHttp ? `${scheme}://${HOST}:${svc.port}` : `${scheme}://${HOST}:${svc.port}`,
            category,
            tag: svc.processName ? svc.processName.replace(/\.(exe|dll)$/i, '') : '',
            thumbnail: ''
        };
    });

    // 按分组排序
    const byCategory = {};
    links.forEach(l => {
        (byCategory[l.category] ||= []).push(l);
    });
    let id = 1;
    const sortedLinks = [];
    Object.keys(byCategory).sort().forEach(cat => {
        byCategory[cat].forEach(l => { l.ID = id++; sortedLinks.push(l); });
    });

    const output = {
        _meta: {
            scannedAt: new Date().toISOString(),
            host: HOST,
            totalServices: sortedLinks.length,
            note: '由 scripts/scan-local.mjs 自动生成，可通过 设置 → 数据 → 导入 添加到导航页'
        },
        links: sortedLinks
    };

    // 写文件
    writeFileSync(OUT, JSON.stringify(output, null, 4) + '\n', 'utf8');

    // 输出摘要
    console.log('✅ 扫描完成！\n');
    console.log('  分组统计：');
    Object.entries(byCategory).sort().forEach(([cat, items]) => {
        console.log(`    ${cat}: ${items.length} 个`);
    });
    console.log(`\n  文件已保存: ${OUT}`);
    console.log(`  共 ${sortedLinks.length} 个服务\n`);

    // 提示导入方式
    console.log('📋 导入方式：');
    console.log('  方式一：打开导航页 → 设置 → 数据 → 导入数据 → 选择此文件');
    console.log('  方式二：直接将文件内容复制到 HTML/data/links.json（替换公开示例）');
    console.log('  方式三：浏览器 localStorage 手动导入\n');

    // 如果已有 links.json，提示对比
    const existingPath = join(root, 'HTML', 'data', 'links.json');
    if (existsSync(existingPath)) {
        try {
            const existing = JSON.parse(readFileSync(existingPath, 'utf8'));
            if (existing.links && existing.links.length > 0) {
                const existingUrls = new Set(existing.links.map(l => l.url || l.urls?.[0]?.address).filter(Boolean));
                const newUrls = sortedLinks.map(l => l.url).filter(u => !existingUrls.has(u));
                if (newUrls.length > 0) {
                    console.log(`  💡 与现有 links.json 对比：发现 ${newUrls.length} 个新地址`);
                    newUrls.slice(0, 5).forEach(u => console.log(`     + ${u}`));
                    if (newUrls.length > 5) console.log(`     ... 还有 ${newUrls.length - 5} 个`);
                }
            }
        } catch { /* 忽略 */ }
    }
}

main().catch(e => { console.error('扫描失败:', e); process.exit(1); });
