#!/usr/bin/env node
// scripts/mcp-server.mjs — MCP(Model Context Protocol)服务器
// 零依赖，通过 stdio JSON-RPC 与 MCP 客户端(Claude Desktop 等)通信。
//
// 用法（Claude Desktop / 其他 MCP 客户端配置示例）：
// {
//   "mcpServers": {
//     "local-navigation-page": {
//       "command": "node",
//       "args": ["C:/path/to/LocalNavigationPage/scripts/mcp-server.mjs"]
//     }
//   }
// }
//
// 工具列表：
//   list_links    — 列出全部导航链接
//   add_link      — 新增链接（name, url, category, tag）
//   update_link   — 按 ID 更新链接
//   remove_link   — 按 ID 删除链接
//   import_links  — 批量导入（只增不删，自动去重）
//   get_stats     — 分组统计

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const linksJsonPath = join(root, 'HTML', 'data', 'links.json');

// ================= 数据操作 =================
async function loadLinks() {
  try {
    const data = JSON.parse(await readFile(linksJsonPath, 'utf8'));
    return Array.isArray(data.links) ? data.links : [];
  } catch { return []; }
}

async function saveLinks(links) {
  await writeFile(linksJsonPath, JSON.stringify({ links }, null, 4) + '\n', 'utf8');
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
    name, url,
    category: String(input.category || '未分类').trim() || '未分类',
    tag: String(input.tag || '').trim(),
    thumbnail: String(input.thumbnail || '').trim()
  };
}

// ================= MCP 工具定义 =================
const TOOLS = [
  {
    name: 'list_links',
    description: '列出导航页的全部链接，可选按分组过滤',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '按分组名过滤（可选）' }
      }
    }
  },
  {
    name: 'add_link',
    description: '添加一个新链接到导航页',
    inputSchema: {
      type: 'object',
      properties: {
        name:     { type: 'string', description: '链接名称（必填）' },
        url:      { type: 'string', description: 'http/https 地址（必填）' },
        category: { type: 'string', description: '分组名（默认「未分类」）' },
        tag:      { type: 'string', description: '标签（可选）' }
      },
      required: ['name', 'url']
    }
  },
  {
    name: 'update_link',
    description: '按 ID 更新已有链接的字段',
    inputSchema: {
      type: 'object',
      properties: {
        id:       { type: 'number', description: '链接 ID（必填）' },
        name:     { type: 'string' },
        url:      { type: 'string' },
        category: { type: 'string' },
        tag:      { type: 'string' }
      },
      required: ['id']
    }
  },
  {
    name: 'remove_link',
    description: '按 ID 删除链接',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: '要删除的链接 ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'import_links',
    description: '批量导入链接（自动去重，只增不删）',
    inputSchema: {
      type: 'object',
      properties: {
        links: {
          type: 'array',
          description: '链接数组 [{name, url, category, tag}, ...]',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' }, url: { type: 'string' },
              category: { type: 'string' }, tag: { type: 'string' }
            },
            required: ['name', 'url']
          }
        }
      },
      required: ['links']
    }
  },
  {
    name: 'get_stats',
    description: '获取导航页的分组统计信息',
    inputSchema: { type: 'object', properties: {} }
  }
];

// ================= 工具执行 =================
async function executeTool(name, args) {
  switch (name) {
    case 'list_links': {
      let links = await loadLinks();
      if (args.category) links = links.filter(l => l.category === args.category);
      return {
        total: links.length,
        links: links.map(l => ({ ID: l.ID, name: l.name, url: l.url || l.urls?.[0]?.address, category: l.category, tag: l.tag }))
      };
    }

    case 'add_link': {
      const link = normalizeLink(args);
      if (!link) throw new Error('name 和合法的 http/https url 必填');
      const links = await loadLinks();
      const newId = links.length > 0 ? Math.max(...links.map(l => l.ID || 0)) + 1 : 1;
      const created = { ID: newId, ...link };
      links.push(created);
      await saveLinks(links);
      return { success: true, created };
    }

    case 'update_link': {
      const links = await loadLinks();
      const idx = links.findIndex(l => l.ID === args.id);
      if (idx === -1) throw new Error(`链接 ID=${args.id} 不存在`);
      const merged = { ...links[idx] };
      if (args.name) merged.name = args.name;
      if (args.url) {
        if (!isValidUrl(args.url)) throw new Error('url 必须是 http/https');
        merged.url = args.url;
      }
      if (args.category) merged.category = args.category;
      if (args.tag !== undefined) merged.tag = args.tag;
      links[idx] = merged;
      await saveLinks(links);
      return { success: true, updated: merged };
    }

    case 'remove_link': {
      const links = await loadLinks();
      const idx = links.findIndex(l => l.ID === args.id);
      if (idx === -1) throw new Error(`链接 ID=${args.id} 不存在`);
      const removed = links.splice(idx, 1)[0];
      await saveLinks(links);
      return { success: true, deleted: removed };
    }

    case 'import_links': {
      if (!Array.isArray(args.links)) throw new Error('links 需为数组');
      const links = await loadLinks();
      const existingUrls = new Set(links.map(l => l.url));
      let nextId = links.length > 0 ? Math.max(...links.map(l => l.ID || 0)) + 1 : 1;
      let added = 0;
      const invalid = [];
      for (const raw of args.links) {
        const norm = normalizeLink(raw);
        if (!norm) { invalid.push(raw); continue; }
        if (existingUrls.has(norm.url)) continue;
        links.push({ ID: nextId++, ...norm });
        existingUrls.add(norm.url);
        added++;
      }
      await saveLinks(links);
      return { added, duplicatesSkipped: args.links.length - added - invalid.length, invalid };
    }

    case 'get_stats': {
      const links = await loadLinks();
      const byCategory = {};
      links.forEach(l => { byCategory[l.category || '未分类'] = (byCategory[l.category || '未分类'] || 0) + 1; });
      return { total: links.length, categories: byCategory };
    }

    default:
      throw new Error(`未知工具: ${name}`);
  }
}

// ================= MCP 协议(stdio JSON-RPC) =================
const serverInfo = {
  protocolVersion: '2024-11-05',
  capabilities: { tools: {} },
  serverInfo: { name: 'local-navigation-page', version: '1.16.0' }
};

const rl = createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }

  const { id, method, params } = msg;
  if (method === 'notifications/initialized') return;

  pending++;
  try {
    let result;
    switch (method) {
      case 'initialize':
        result = serverInfo;
        break;
      case 'tools/list':
        result = { tools: TOOLS };
        break;
      case 'tools/call': {
        const { name, arguments: args } = params || {};
        const toolResult = await executeTool(name, args || {});
        result = {
          content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }]
        };
        break;
      }
      case 'ping':
        result = {};
        break;
      default:
        if (id !== undefined) {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0', id,
            error: { code: -32601, message: `Method not found: ${method}` }
          }) + '\n');
          return;
        }
        return;
    }
    if (id !== undefined) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
    }
  } catch (err) {
    if (id !== undefined) {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0', id,
        error: { code: -32000, message: err.message }
      }) + '\n');
    }
  } finally {
    pending--;
  }
});

// 跟踪进行中的请求;stdin 关闭后等全部完成再退出
let pending = 0;
rl.on('close', () => {
  const check = () => (pending === 0 ? process.exit(0) : setTimeout(check, 10));
  check();
});
process.stderr.write('[lnp-mcp] MCP server ready on stdio (tools: list/add/update/remove/import/stats)\n');
