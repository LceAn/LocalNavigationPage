// 零依赖静态服务器：npm run serve 后访问 http://127.0.0.1:8080
// 用法：node scripts/serve.mjs [端口]，默认 8080，根目录为 HTML/
import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { join, normalize, resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), 'HTML');
const port = Number.parseInt(process.argv[2], 10) || 8080;

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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const target = normalize(join(root, pathname));
    // 目录穿越防护：解析后必须仍在根目录内
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
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('500 Internal Server Error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`导航页已启动: http://127.0.0.1:${port}/  (根目录: ${root})`);
});
