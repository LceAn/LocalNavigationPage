import { readFile, stat, readdir, realpath } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { inspectMcp, McpConnectionError } from './mcp-client.mjs';
import { maskArg, maskArgs, parseSkillMarkdown } from './scan-catalog.mjs';

const SENSITIVE = /token|secret|password|passwd|api[-_]?key|auth|credential/i;

function expandPath(value) {
  const path = String(value || '').replace(/\\/g, '/');
  return resolve(path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);
}

function interpolate(value) {
  return String(value).replace(/\$\{(?:env:)?([\w]+)\}/g, (_, key) => process.env[key] || '');
}

function interpolateMap(value) {
  return Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key, interpolate(item)]));
}

function safeConnection(entry, runtime) {
  const declared = runtime?.type || runtime?.transport || entry.transport;
  const transport = declared === 'sse' ? 'sse' : declared === 'stdio' || (runtime?.command && !runtime.url) ? 'stdio'
    : runtime?.url || entry.url || entry.urls?.length ? 'http' : 'stdio';
  const command = String(runtime?.command || entry.command || '');
  const args = maskArgs(runtime?.args || entry.args || []);
  const url = maskArg(runtime?.url || entry.url || entry.urls?.[0]?.address || '');
  const envKeys = [...new Set([...Object.keys(runtime?.env || {}), ...(entry.envKeys || [])])];
  const headerKeys = [...new Set([...Object.keys(runtime?.headers || {}), ...(entry.headerKeys || [])])];
  const configuration = transport === 'stdio' ? { command, args } : { type: transport, url };
  if (envKeys.length) configuration.env = Object.fromEntries(envKeys.map(key => [key, `<${key}>`]));
  if (headerKeys.length) configuration.headers = Object.fromEntries(headerKeys.map(key => [key, `<${key}>`]));
  return {
    transport, command, args, endpoint: url,
    credentials: [...envKeys.map(name => ({ name, location: 'env', configured: Boolean(runtime?.env?.[name] || process.env[name]) })),
      ...headerKeys.map(name => ({ name, location: 'header', configured: Boolean(runtime?.headers?.[name]) }))],
    clientConfig: { mcpServers: { [entry.name]: configuration } }
  };
}

function secretValues(runtime = {}) {
  const values = [];
  for (const [key, value] of Object.entries(runtime.headers || {})) {
    values.push(String(value), String(value).replace(/^Bearer\s+/i, ''));
  }
  for (const [key, value] of Object.entries(runtime.env || {})) if (SENSITIVE.test(key)) values.push(String(value));
  const args = runtime.args || [];
  const masked = maskArgs(args);
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index]);
    if (masked[index] === '***') values.push(arg);
    if (SENSITIVE.test(arg) && /^--?/.test(arg)) values.push(arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : String(args[index + 1] || ''));
  }
  try {
    const url = new URL(runtime.url);
    values.push(url.password);
    for (const [key, value] of url.searchParams) if (SENSITIVE.test(key)) values.push(value);
  } catch { /* stdio 没有 URL */ }
  return values.map(interpolate).filter(value => value.length >= 4).sort((a, b) => b.length - a.length);
}

function redact(value, secrets) {
  let source = JSON.stringify(value);
  for (const secret of secrets) source = source.replaceAll(JSON.stringify(secret).slice(1, -1), '***');
  return JSON.parse(source);
}

async function jsonFile(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function resourceKind(entry) {
  if (entry.kind) return entry.kind;
  if (String(entry.catalogKey).startsWith('mcp:')) return 'mcp';
  if (String(entry.catalogKey).startsWith('skill:')) return 'skill';
  return /mcp/i.test(entry.category || '') ? 'mcp' : /skills?|技能/i.test(entry.category || '') ? 'skill' : 'site';
}

export function createCatalogService({ dataRoot, defaultCatalogPath, mcpConfigPath = process.env.LNP_MCP_CONFIG, skillsDir = process.env.LNP_SKILLS_DIR, timeoutMs = Number(process.env.LNP_MCP_TIMEOUT_MS) || 20000 }) {
  const inspectionTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000;
  const cached = new Map();
  const running = new Map();
  const queue = [];
  let active = 0;
  async function limited(work) {
    if (active < 3) active += 1;
    else await new Promise(resolve => queue.push(resolve));
    try { return await work(); }
    finally {
      if (queue.length) queue.shift()();
      else active -= 1;
    }
  }
  async function readCatalog() {
    let catalog;
    try { catalog = await jsonFile(join(dataRoot, 'catalog.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; catalog = await jsonFile(defaultCatalogPath); }
    return { ...catalog, _meta: { ...catalog._meta, inspectionTimeoutMs } };
  }
  async function resolveEntry(query) {
    const catalog = await readCatalog();
    const document = await jsonFile(join(dataRoot, 'links.json'));
    const saved = query.linkId != null ? document.links?.find(item => String(item.ID) === String(query.linkId)) : null;
    const key = saved?.catalogKey || query.catalogKey;
    const sourceMcp = (catalog.mcpServers || []).find(item => 'mcp:' + item.name === key);
    const sourceSkill = (catalog.skills || []).find(item => 'skill:' + item.name === key);
    const original = sourceMcp || sourceSkill;
    const override = saved || document.links?.find(item => item.catalogKey === key);
    if (!override && !original) throw new McpConnectionError('目录条目已更新，请刷新页面', 'not_found');
    const entry = { ...original, ...override, kind: override?.kind || (sourceMcp ? 'mcp' : sourceSkill ? 'skill' : resourceKind(override)), catalogKey: key };
    if (!['mcp', 'skill'].includes(entry.kind)) throw new McpConnectionError('该条目使用网页访问方式', 'invalid_resource');
    return { entry, original, catalog };
  }
  async function runtimeConfig(catalog) {
    const candidates = [mcpConfigPath, catalog._meta?.mcpConfig, join(homedir(), '.workbuddy/mcp.json')].filter(Boolean);
    for (const candidate of [...new Set(candidates)]) {
      try { return await jsonFile(expandPath(candidate)); }
      catch (error) {
        if (error.code !== 'ENOENT') throw new McpConnectionError('服务器 MCP 配置读取失败', 'configuration');
      }
    }
    return { mcpServers: {} };
  }
  async function inspectServer(entry, original, catalog, query) {
    const registry = await runtimeConfig(catalog);
    const originalName = original?.name || String(entry.catalogKey || '').replace(/^mcp:/, '') || entry.name;
    const registered = registry.mcpServers?.[originalName];
    const runtime = registered && typeof registered === 'object' ? { ...registered } : null;
    const connection = safeConnection(entry, runtime);
    const result = { kind: 'mcp', name: entry.name, description: entry.remarks || entry.description || '', connection,
      catalogToolCount: Number(entry.tools) || null, tools: [], checkedAt: new Date().toISOString(), detectionLocation: '导航服务器' };
    if (runtime?.disabled === true || entry.enabled === false) return { ...result, status: { state: 'disabled', message: '服务已停用' } };
    const allowed = new Set([entry.url, ...(entry.urls || []).map(item => item.address), runtime?.url, maskArg(runtime?.url || '')].filter(Boolean));
    const selected = query.address || runtime?.url || entry.urls?.[0]?.address || entry.url;
    if (query.address && !allowed.has(query.address)) throw new McpConnectionError('访问地址已更新，请重新选择', 'invalid_address');
    let config;
    if (connection.transport === 'stdio') {
      if (!runtime?.command) return { ...result, status: { state: 'unconfigured', message: '在导航服务器的 MCP 配置中登记此命令后即可发现工具' } };
      config = { transport: 'stdio', command: interpolate(runtime.command), args: (runtime.args || []).map(interpolate), env: interpolateMap(runtime.env), cwd: runtime.cwd ? expandPath(runtime.cwd) : undefined };
    } else {
      let address = selected;
      if (runtime?.url && (selected === maskArg(runtime.url) || selected === entry.url && maskArg(runtime.url) === entry.url)) address = runtime.url;
      try { if (!['http:', 'https:'].includes(new URL(address).protocol)) throw new Error(); }
      catch { return { ...result, status: { state: 'unconfigured', message: '请配置 MCP HTTP 或 SSE 端点' } }; }
      config = { transport: connection.transport, url: interpolate(address), headers: interpolateMap(runtime?.headers) };
      const endpoint = new URL(config.url);
      if (endpoint.username || endpoint.password) {
        if (!config.headers.Authorization) config.headers.Authorization = 'Basic ' + Buffer.from(decodeURIComponent(endpoint.username) + ':' + decodeURIComponent(endpoint.password)).toString('base64');
        endpoint.username = ''; endpoint.password = '';
        config.url = endpoint.href;
      }
      result.connection.endpoint = maskArg(address);
      result.connection.clientConfig.mcpServers[entry.name].url = maskArg(address);
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(config)).digest('hex');
    for (const [key, value] of cached) if (value.expires <= Date.now()) cached.delete(key);
    if (!query.refresh && cached.get(fingerprint)?.expires > Date.now()) return { ...result, ...cached.get(fingerprint).value, cached: true };
    if (!running.has(fingerprint)) {
      const secrets = secretValues(runtime || {});
      const task = limited(async () => {
        try {
          const live = redact(await inspectMcp(config, { timeoutMs: inspectionTimeoutMs }), secrets);
          const value = { ...live, status: { state: 'available', message: '工具发现成功' }, protocolVersion: live.version };
          cached.set(fingerprint, { value, expires: Date.now() + 15000 });
          if (cached.size > 32) cached.delete(cached.keys().next().value);
          return value;
        } catch (error) {
          cached.delete(fingerprint);
          const state = error.code === 'authentication' ? 'authentication' : 'unavailable';
          return redact({ status: { state, code: String(error.code || 'connection'), message: String(error.message || '连接失败').slice(0, 500) }, tools: [], checkedAt: new Date().toISOString() }, secrets);
        }
      }).finally(() => running.delete(fingerprint));
      running.set(fingerprint, task);
    }
    return { ...result, ...await running.get(fingerprint) };
  }
  async function inspectSkill(entry) {
    const displayPath = String(entry.copyValue || entry.path || '');
    const normalized = displayPath.replace(/\\/g, '/').replace(/\/SKILL\.md$/i, '');
    const target = skillsDir ? join(expandPath(skillsDir), basename(normalized) || entry.name) : normalized ? expandPath(normalized) : '';
    const result = { kind: 'skill', name: entry.name, description: entry.remarks || entry.description || '', path: displayPath,
      enabled: entry.enabled !== false, markdown: '', sections: entry.sections || [], allowedTools: entry.allowedTools || [], files: [], checkedAt: new Date().toISOString(), detectionLocation: '导航服务器' };
    if (!target) return { ...result, status: { state: 'unconfigured', message: '请配置服务器上的技能目录' } };
    const skillFile = join(target, 'SKILL.md');
    try {
      const info = await stat(skillFile);
      if (!info.isFile() || info.size > 256 * 1024) throw new McpConnectionError('SKILL.md 超过读取容量限制', 'file_size');
      const source = (await readFile(skillFile, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
      const metadata = parseSkillMarkdown(source, entry.name, displayPath);
      const folder = await realpath(dirname(skillFile));
      const files = [];
      async function collect(directory, prefix = '', depth = 0) {
        for (const file of await readdir(directory, { withFileTypes: true })) {
          if (files.length >= 120 || file.name.startsWith('.')) continue;
          const relative = prefix + file.name;
          const path = join(directory, file.name);
          const directoryEntry = file.isDirectory();
          files.push({ path: relative, kind: directoryEntry ? 'directory' : file.isSymbolicLink() ? 'link' : 'file' });
          if (directoryEntry && depth < 1) await collect(path, relative + '/', depth + 1);
        }
      }
      await collect(folder);
      return { ...result, ...metadata, name: entry.name, description: entry.remarks || metadata.description || entry.description || '', enabled: entry.enabled !== false,
        markdown: source.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, ''), files: files.sort((a, b) => a.path.localeCompare(b.path)),
        status: { state: entry.enabled === false ? 'disabled' : 'available', message: entry.enabled === false ? '技能已停用' : '技能文件可读取' } };
    } catch (error) {
      return { ...result, status: { state: 'missing', code: error.code || 'read', message: error.code === 'ENOENT' ? '服务器尚未找到 SKILL.md' : error instanceof McpConnectionError ? error.message : '技能文件读取失败' } };
    }
  }
  return {
    readCatalog,
    async inspect(query) {
      const { entry, original, catalog } = await resolveEntry(query);
      return entry.kind === 'mcp' ? inspectServer(entry, original, catalog, query) : inspectSkill(entry);
    }
  };
}
