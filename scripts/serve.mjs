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
import { mkdir, copyFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize, resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), 'HTML');
const dataRoot = resolve(process.env.LNP_DATA_DIR || join(root, 'data'));
const linksJsonPath = join(dataRoot, 'links.json');
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
  if (req.method === 'POST' && pathname === '/api/catalog/inspect') {
    const query = await readBody(req);
    try { json(res, 200, await catalogService.inspect(query)); }
    catch (error) { json(res, error.code === 'not_found' ? 404 : 400, { error: error.message, code: error.code || 'inspection' }); }
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
  json(res, 404, { error: 'API 路径不存在', available: ['GET /api/config', 'PUT /api/config', 'GET /api/catalog', 'GET /api/links', 'POST /api/links', 'POST /api/links/import', 'PUT /api/links/:id', 'DELETE /api/links/:id'] });
  return true;
}

// ================= 静态文件服务器 =================
let apiWriteQueue = Promise.resolve();
const server = createServer(async (req, res) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/HTML' || pathname.startsWith('/HTML/')) {
      res.writeHead(308, { Location: (pathname.slice(5) || '/') + url.search }).end();
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';

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

server.listen(port, bindHost, () => {
  console.log(`导航页已启动: http://127.0.0.1:${port}/  (绑定: ${bindHost})`);
  console.log(`REST API: http://127.0.0.1:${port}/api/links  (GET/POST/PUT/DELETE)`);
});
