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
// 安全：API 默认仅绑定 SERVE_HOST（默认 0.0.0.0）；部署到公网时建议
// 前置代理限制 /api/ 路径，或设 SERVE_HOST=127.0.0.1。
import { createServer } from 'node:http';
import { stat, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize, resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), 'HTML');
const linksJsonPath = join(root, 'data', 'links.json');
const port = Number.parseInt(process.argv[2], 10) || 8080;
const bindHost = process.env.SERVE_HOST || '0.0.0.0';

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
  } catch { return []; }
}

async function saveLinks(links) {
  const doc = { links };
  await writeFile(linksJsonPath, JSON.stringify(doc, null, 4) + '\n', 'utf8');
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
  const url = String(input.url || input.address || '').trim();
  if (!name || !url || !isValidUrl(url)) return null;
  return {
    name,
    url,
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
    const existingUrls = new Set(links.map(l => l.url));
    let nextId = links.length > 0 ? Math.max(...links.map(l => l.ID || 0)) + 1 : 1;
    let added = 0;
    const invalid = [];
    for (const raw of body.links) {
      const norm = normalizeLink(raw);
      if (!norm) { invalid.push(raw); continue; }
      if (existingUrls.has(norm.url)) continue; // 去重
      links.push({ ID: nextId++, ...norm });
      existingUrls.add(norm.url);
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
      const merged = { ...links[idx], ...normalizeLink({ ...links[idx], ...body }) };
      if (!merged.name || !isValidUrl(merged.url)) {
        json(res, 400, { error: '合并后字段无效' }); return true;
      }
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
  json(res, 404, { error: 'API 路径不存在', available: ['GET /api/links', 'POST /api/links', 'POST /api/links/import', 'PUT /api/links/:id', 'DELETE /api/links/:id'] });
  return true;
}

// ================= 静态文件服务器 =================
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // API 路由（/api/ 前缀不走静态文件）
    if (pathname.startsWith('/api/')) {
      try {
        const handled = await handleApi(req, res, pathname);
        if (handled) return;
      } catch (apiErr) {
        json(res, apiErr.message === 'invalid JSON' || apiErr.message === 'body too large' ? 400 : 500,
             { error: apiErr.message });
        return;
      }
    }

    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = normalize(join(root, pathname));

    // 目录穿越防护
    const rel = relative(root, resolve(target));
    if (rel.startsWith('..') || isAbsolute(rel)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let filePath = target;
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
