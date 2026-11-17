// 零依赖静态服务器 + REST API：npm run serve 后访问 http://127.0.0.1:8080
// 用法：node scripts/serve.mjs [端口]，默认 8080，根目录为 HTML/
//
// REST API（/api/links）：
//   GET    /api/links          列出全部链接
//   POST   /api/links          新增链接（JSON body: {name, url, category, tag}）
//   PUT    /api/links/:id      更新链接（JSON body: 同上，部分字段可省略）
//   DELETE /api/links/:id      删除链接
//   POST   /api/links/import   批量导入（JSON body: {links: [...]}，只增不删）
//
// 安全：API 默认绑定 SERVE_HOST（默认 :: 双栈）；部署到公网时建议
// 前置代理限制 /api/ 路径，或设 SERVE_HOST=127.0.0.1。
import { configRevision, readConfigFile, writeConfigFile, validateSharedConfig } from './config-store.mjs';
import { createCatalogService } from './catalog-service.mjs';
import { scanLocalServices } from './scan-local.mjs';
import { networkInterfaces } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { mkdir, copyFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize, resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), 'HTML');
const dataRoot = resolve(process.env.LNP_DATA_DIR || join(root, 'data'));
const linksJsonPath = join(dataRoot, 'links.json');
const blockedIpsPath = join(dataRoot, 'blocked-ips.json');
const catalogService = createCatalogService({ dataRoot, defaultCatalogPath: join(root, 'data/catalog.json.default') });
await mkdir(dataRoot, { recursive: true });
try { await copyFile(join(root, 'data', 'links.json.default'), linksJsonPath, 1); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
const port = Number.parseInt(process.argv[2], 10) || 8080;
const bindHost = process.env.SERVE_HOST || '::';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// ================= 链接数据操作 =================
async function loadLinks() {
  try {
    const data = JSON.parse(await readFile(linksJsonPath, 'utf8'));
    return Array.isArray(data.links) ? data.links : [];
  } catch (error) { throw new Error('读取链接配置失败: ' + error.message); }
}

async function saveLinks(links) {
  const doc = await readConfigFile(linksJsonPath);
  await writeConfigFile(linksJsonPath, { ...doc, links });
}

function isValidUrl(u) {
  try {
    const parsed = new URL(u);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch { return false; }
}

function normalizeLink(input) {
  if (!input || typeof input !== 'object') return null;
  const name = String(input.name || '').trim();
  const urls = Array.isArray(input.urls) ? input.urls : null;
  if (urls && urls.some(item => !item || !isValidUrl(item.address))) return null;
  const url = String(input.url || input.address || urls?.[0]?.address || '').trim();
  const resource = ['mcp', 'skill'].includes(input.kind) && String(input.copyValue || '').trim();
  if (!name || (!resource && (!url || !isValidUrl(url))) || (url && !isValidUrl(url))) return null;
  return {
    name,
    ...(urls ? { urls: urls.map((item, index) => ({ ...item, priority: Number(item.priority) || index + 1 })) } : url ? { url } : { urls: [] }),
    ...(input.copyValue !== undefined ? { copyValue: String(input.copyValue) } : {}),
    ...(input.catalogKey !== undefined ? { catalogKey: String(input.catalogKey) } : {}),
    ...(input.remarks !== undefined ? { remarks: String(input.remarks) } : {}),
    ...(input.kind !== undefined ? { kind: String(input.kind) } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled !== false } : {}),
    category: String(input.category || '未分类').trim() || '未分类',
    tag: String(input.tag || '').trim(),
    thumbnail: String(input.thumbnail || '').trim()
  };
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1024 * 1024) { req.destroy(); reject(new Error('body too large')); } });
    req.on('end', () => { try { resolvePromise(JSON.parse(data)); } catch { reject(new Error('invalid JSON')); } });
    req.on('error', reject);
  });
}

// ================= API 路由 =================
async function handleApi(req, res, pathname) {
  if (pathname === '/api/config') {
    const doc = await readConfigFile(linksJsonPath);
    const revision = configRevision(doc);
    if (req.method === 'GET') {
      json(res, 200, { ...doc, revision });
      return true;
    }
    if (req.method === 'PUT') {
      if (req.headers['if-match'] !== revision) {
        json(res, 409, { error: '服务器配置已变化，请重新读取', revision });
        return true;
      }
      let config;
      try { config = validateSharedConfig(await readBody(req)); }
      catch (error) { json(res, 400, { error: error.message }); return true; }
      const next = { ...doc, ...config };
      await writeConfigFile(linksJsonPath, next);
      json(res, 200, { revision: configRevision(next), total: next.links.length });
      return true;
    }
  }
  if (req.method === 'GET' && pathname === '/api/catalog') {
    json(res, 200, await catalogService.readCatalog());
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/catalog/scan') {
    try { json(res, 200, await catalogService.scanCatalog()); }
    catch (error) { json(res, 500, { error: error.message || '扫描失败' }); }
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/catalog/inspect') {
    const query = await readBody(req);
    try { json(res, 200, await catalogService.inspect(query)); }
    catch (error) { json(res, error.code === 'not_found' ? 404 : 400, { error: error.message, code: error.code || 'inspection' }); }
    return true;
  }
  // POST /api/scan —— 设置面板「本机服务扫描」按钮的服务端执行入口。
  // 只读扫描（netstat/tasklist/docker），返回服务清单并标注哪些地址已存在；入库走 /api/links/import。
  if (req.method === 'POST' && pathname === '/api/scan') {
    const body = await readBody(req).catch(() => ({}));
    try {
      const { lanAddresses, services } = await scanLocalServices({
        probe: body?.probe === true,
        exclude: Array.isArray(body?.exclude) ? body.exclude.map(Number) : [],
        limit: Number.isFinite(Number(body?.limit)) ? Number(body.limit) : undefined
      });
      const links = await loadLinks();
      const addressesOf = link => (link.urls || [{ address: link.url }]).map(item => item.address).filter(Boolean);
      const existing = new Set(links.flatMap(addressesOf));
      json(res, 200, {
        lanAddresses,
        services: services.map(service => ({ ...service, exists: service.urls.some(url => existing.has(url.address)) }))
      });
    } catch (error) { json(res, 500, { error: error.message || '扫描失败' }); }
    return true;
  }
  // ---- 服务管理（设置 → 服务）：监听地址 / 在线会话 / IP 黑名单 ----
  if (req.method === 'GET' && pathname === '/api/server/status') {
    json(res, 200, {
      version: (JSON.parse(await readFile(join(root, '..', 'package.json'), 'utf8'))).version,
      startedAt: new Date(startedAt).toISOString(),
      uptimeMs: Date.now() - startedAt,
      bindHost,
      listening: listeningAddresses()
    });
    return true;
  }
  if (req.method === 'GET' && pathname === '/api/server/sessions') {
    json(res, 200, { sessions: sessionListFor(normalizeIp(req.socket.remoteAddress)), blacklist: blockedMeta });
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/server/sessions/kick') {
    const body = await readBody(req);
    const ip = normalizeIp(body?.ip);
    if (!ip) { json(res, 400, { error: '需要 ip' }); return true; }
    const targets = [...(openSockets.get(ip) || [])].filter(socket => socket !== req.socket && !socket.destroyed);
    targets.forEach(socket => socket.destroy());
    json(res, 200, { kicked: targets.length, ip });
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/server/blacklist') {
    const body = await readBody(req);
    const ip = normalizeIp(body?.ip);
    if (!ip || !/^[0-9a-f.:]+$/i.test(ip)) { json(res, 400, { error: 'IP 格式无效' }); return true; }
    if (isLoopbackIp(ip)) { json(res, 400, { error: '不能屏蔽本机回环地址，否则会把管理入口锁死' }); return true; }
    if (!blockedIps.has(ip)) {
      blockedIps.add(ip);
      blockedMeta.push({ ip, note: String(body?.note || '').slice(0, 80), blockedAt: new Date().toISOString() });
      await persistBlockedIps();
    }
    // 立即断开该 IP 的现有连接
    [...(openSockets.get(ip) || [])].forEach(socket => !socket.destroyed && socket.destroy());
    json(res, 200, { blocked: blockedMeta.length, ip });
    return true;
  }
  const unblockMatch = pathname.match(/^\/api\/server\/blacklist\/([\w:.]+)$/);
  if (req.method === 'DELETE' && unblockMatch) {
    const ip = normalizeIp(decodeURIComponent(unblockMatch[1]));
    if (!blockedIps.has(ip)) { json(res, 404, { error: `IP ${ip} 不在黑名单` }); return true; }
    blockedIps.delete(ip);
    blockedMeta = blockedMeta.filter(item => normalizeIp(item.ip) !== ip);
    await persistBlockedIps();
    json(res, 200, { blocked: blockedMeta.length, ip });
    return true;
  }

  // GET /api/links
  if (req.method === 'GET' && pathname === '/api/links') {
    const links = await loadLinks();
    json(res, 200, { total: links.length, links });
    return true;
  }

  // POST /api/links
  if (req.method === 'POST' && pathname === '/api/links') {
    const body = await readBody(req);
    const link = normalizeLink(body);
    if (!link) { json(res, 400, { error: '需要 name 和合法的 http/https url' }); return true; }
    const links = await loadLinks();
    const newId = links.length > 0 ? Math.max(...links.map(l => l.ID || 0)) + 1 : 1;
    const newLink = { ID: newId, ...link };
    links.push(newLink);
    await saveLinks(links);
    json(res, 201, { created: newLink });
    return true;
  }

  // POST /api/links/import (批量)
  if (req.method === 'POST' && pathname === '/api/links/import') {
    const body = await readBody(req);
    if (!Array.isArray(body.links)) { json(res, 400, { error: 'body 需 {links: [...]}' }); return true; }
    const links = await loadLinks();
    const addresses = link => (link.urls || [{ address: link.url }]).map(item => item.address).filter(Boolean);
    const existingUrls = new Set(links.flatMap(addresses));
    let nextId = links.length > 0 ? Math.max(...links.map(l => l.ID || 0)) + 1 : 1;
    let added = 0;
    const invalid = [];
    for (const raw of body.links) {
      const norm = normalizeLink(raw);
      if (!norm) { invalid.push(raw); continue; }
      if (addresses(norm).some(address => existingUrls.has(address))) continue; // 去重
      links.push({ ID: nextId++, ...norm });
      addresses(norm).forEach(address => existingUrls.add(address));
      added++;
    }
    await saveLinks(links);
    json(res, 200, { added, skippedDuplicates: body.links.length - added - invalid.length, invalid });
    return true;
  }

  // PUT /api/links/:id 或 DELETE /api/links/:id
  const idMatch = pathname.match(/^\/api\/links\/(\d+)$/);
  if (idMatch) {
    const id = parseInt(idMatch[1], 10);
    const links = await loadLinks();
    const idx = links.findIndex(l => l.ID === id);
    if (idx === -1) { json(res, 404, { error: `链接 ID=${id} 不存在` }); return true; }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      const input = { ...links[idx], ...body };
      if (body.url && !body.urls) delete input.urls;
      const normalized = normalizeLink(input);
      if (!normalized) { json(res, 400, { error: '链接字段无效' }); return true; }
      const merged = { ...links[idx], ...normalized };
      if (normalized.urls) delete merged.url;
      else delete merged.urls;
      links[idx] = merged;
      await saveLinks(links);
      json(res, 200, { updated: merged });
      return true;
    }

    if (req.method === 'DELETE') {
      const removed = links.splice(idx, 1)[0];
      await saveLinks(links);
      json(res, 200, { deleted: removed });
      return true;
    }
  }

  // 未匹配的 /api/ 路径
  json(res, 404, { error: 'API 路径不存在', available: ['GET /api/config', 'PUT /api/config', 'GET /api/catalog', 'POST /api/catalog/scan', 'POST /api/catalog/inspect', 'POST /api/scan', 'GET /api/server/status', 'GET /api/server/sessions', 'POST /api/server/sessions/kick', 'POST /api/server/blacklist', 'DELETE /api/server/blacklist/:ip', 'GET /api/links', 'POST /api/links', 'POST /api/links/import', 'PUT /api/links/:id', 'DELETE /api/links/:id'] });
  return true;
}

// ================= 在线会话与 IP 黑名单（设置 → 服务） =================
// 会话 = 最近 90 秒内有请求的客户端 IP（HTTP 无状态，以活跃度近似在线）。
const SESSION_ONLINE_MS = 90 * 1000;
const startedAt = Date.now();
const sessions = new Map();   // ip → { ip, firstSeen, lastSeen, requests, userAgent, paths }
const openSockets = new Map(); // ip → Set<net.Socket>（踢下线用）
let blockedIps = new Set();   // 规范化 IP
let blockedMeta = [];         // [{ ip, note, blockedAt }]

function normalizeIp(raw) {
  const value = String(raw || '').toLowerCase();
  return value.startsWith('::ffff:') ? value.slice(7) : value;
}
function isLoopbackIp(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

try {
  const stored = JSON.parse(await readFile(blockedIpsPath, 'utf8'));
  if (Array.isArray(stored?.ips)) {
    blockedMeta = stored.ips.filter(item => item && typeof item.ip === 'string');
    blockedIps = new Set(blockedMeta.map(item => normalizeIp(item.ip)));
  }
} catch { /* 首次启动无文件 */ }

async function persistBlockedIps() {
  await writeFile(blockedIpsPath, JSON.stringify({ ips: blockedMeta }, null, 2) + '\n', 'utf8');
}

function recordSession(ip, req, pathname) {
  const now = Date.now();
  const entry = sessions.get(ip) || { ip, firstSeen: now, requests: 0, userAgent: '', paths: [] };
  entry.lastSeen = now;
  entry.requests += 1;
  const ua = req.headers['user-agent'];
  if (ua) entry.userAgent = String(ua).slice(0, 160);
  if (!entry.paths.includes(pathname) && entry.paths.length < 8) entry.paths.push(pathname);
  sessions.set(ip, entry);
  // 顺带清理过期会话（低成本摊销）
  if (sessions.size > 64) {
    for (const [key, value] of sessions) if (now - value.lastSeen > SESSION_ONLINE_MS * 20) sessions.delete(key);
  }
}

const VIRTUAL_IFACE_PATTERN = /vethernet|wsl|vmware|virtualbox|hyper-?v|loopback|docker|veth|tap|bridge/i;
function listeningAddresses() {
  const list = [];
  for (const [ifaceName, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of addrs || []) {
      if (addr.internal) continue;
      if (addr.family === 'IPv6' && addr.address.startsWith('fe80:')) continue; // IPv6 链路本地不可路由
      const parts = addr.address.split('.').map(Number);
      if (addr.family === 'IPv4' && parts[0] === 169 && parts[1] === 254) continue; // IPv4 链路本地不可路由
      const isV4 = addr.family === 'IPv4';
      let label = '其他网络';
      if (isV4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) label = 'Tailscale';
      else if (isV4 && (parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)) label = VIRTUAL_IFACE_PATTERN.test(ifaceName) ? '虚拟网卡' : '局域网';
      else if (/tailscale/i.test(ifaceName)) label = 'Tailscale';
      const display = addr.family === 'IPv6' ? `[${addr.address}]` : addr.address;
      list.push({ iface: ifaceName, family: addr.family, address: display, url: `http://${display}:${port}`, label });
    }
  }
  return list;
}

function sessionListFor(ip) {
  const now = Date.now();
  return [...sessions.values()]
    .map(entry => ({
      ...entry,
      online: now - entry.lastSeen < SESSION_ONLINE_MS,
      self: entry.ip === ip
    }))
    .sort((a, b) => (b.online - a.online) || (b.lastSeen - a.lastSeen));
}

// ================= 静态文件服务器 =================
let apiWriteQueue = Promise.resolve();
const server = createServer(async (req, res) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const clientIp = normalizeIp(req.socket.remoteAddress);
  if (blockedIps.has(clientIp)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'IP 已被管理员屏蔽' }));
    return;
  }
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/HTML' || pathname.startsWith('/HTML/')) {
      res.writeHead(308, { Location: (pathname.slice(5) || '/') + url.search }).end();
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    recordSession(clientIp, req, pathname);

    // API 路由（/api/ 前缀不走静态文件）
    if (pathname.startsWith('/api/')) {
      try {
        const mutation = !['GET', 'HEAD'].includes(req.method);
        if (mutation && (req.headers['sec-fetch-site'] === 'cross-site' ||
            (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host))) {
          json(res, 403, { error: '需要同源请求' });
          return;
        }
        let handled;
        if (mutation && pathname !== '/api/catalog/inspect') {
          const operation = apiWriteQueue.then(() => handleApi(req, res, pathname));
          apiWriteQueue = operation.catch(() => {});
          handled = await operation;
        } else handled = await handleApi(req, res, pathname);
        if (handled) return;
      } catch (apiErr) {
        json(res, apiErr.message === 'invalid JSON' || apiErr.message === 'body too large' ? 400 : 500,
             { error: apiErr.message });
        return;
      }
    }

    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = pathname.startsWith('/data/')
      ? normalize(join(dataRoot, pathname.slice('/data/'.length)))
      : normalize(join(root, pathname));

    // 目录穿越防护
    const rel = relative(pathname.startsWith('/data/') ? dataRoot : root, resolve(target));
    if (rel.startsWith('..') || isAbsolute(rel)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let filePath = target;
    if (['/data/catalog.json.default', '/data/links.json.default'].includes(pathname)) filePath = join(root, pathname.slice(1));
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, 'index.html');
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }

    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    const etag = 'W"' + createHash('sha1').update(data).digest('hex') + '"';
    if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag });
        res.end();
        return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: etag });
    res.end(data);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('500 Internal Server Error');
  }
});

server.on('connection', socket => {
  const ip = normalizeIp(socket.remoteAddress);
  if (!openSockets.has(ip)) openSockets.set(ip, new Set());
  openSockets.get(ip).add(socket);
  socket.on('close', () => {
    const set = openSockets.get(ip);
    if (!set) return;
    set.delete(socket);
    if (!set.size) openSockets.delete(ip);
  });
});

server.listen(port, bindHost, () => {
  console.log(`导航页已启动: http://127.0.0.1:${port}/  (绑定: ${bindHost})`);
  console.log(`REST API: http://127.0.0.1:${port}/api/links  (GET/POST/PUT/DELETE)`);
});
