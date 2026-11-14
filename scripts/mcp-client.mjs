import { spawn, execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join, delimiter } from 'node:path';
import { once } from 'node:events';

const MODERN_VERSION = '2026-07-28';
const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const CLIENT_INFO = { name: 'LocalNavigationPage', version: '1.0.0' };
const MAX_BYTES = 8 * 1024 * 1024;

export class McpConnectionError extends Error {
  constructor(message, code = 'connection', data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

function requestMessage(id, method, params, version) {
  const metadata = version === MODERN_VERSION ? {
    'io.modelcontextprotocol/protocolVersion': version,
    'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
    'io.modelcontextprotocol/clientCapabilities': {}
  } : null;
  return { jsonrpc: '2.0', id, method, params: metadata ? { ...params, _meta: metadata } : params };
}

function rpcChannel(write, shutdown, signal, timeoutMs) {
  let nextId = 1;
  let closed = false;
  let closedError;
  const pending = new Map();
  function receive(message) {
    if (message?.method && message.id != null) {
      void write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Client capability unavailable' } }).catch(() => {});
      return;
    }
    const waiting = pending.get(message?.id);
    if (!waiting) return;
    pending.delete(message.id);
    clearTimeout(waiting.timer);
    if (message.error) waiting.reject(new McpConnectionError(String(message.error.message || 'MCP 请求失败'), message.error.code, message.error.data));
    else waiting.resolve(message.result);
  }
  function fail(error) {
    closed = true;
    closedError ||= error;
    for (const waiting of pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    pending.clear();
  }
  signal.addEventListener('abort', () => fail(new McpConnectionError('连接超时', 'timeout')), { once: true });
  return {
    receive, fail,
    async request(method, params = {}, version = MODERN_VERSION, requestTimeout = timeoutMs) {
      if (closed || signal.aborted) throw closedError || new McpConnectionError('连接超时', 'timeout');
      const id = nextId++;
      const response = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new McpConnectionError('连接超时', 'timeout'));
        }, requestTimeout);
        pending.set(id, { resolve, reject, timer });
      });
      void write(requestMessage(id, method, params, version), version).then(message => {
        if (message) receive(message);
      }, error => {
        const waiting = pending.get(id);
        if (waiting) {
          pending.delete(id);
          clearTimeout(waiting.timer);
          waiting.reject(error);
        }
      });
      return response;
    },
    async notify(method, version) {
      await write({ jsonrpc: '2.0', method }, version);
    },
    async close() {
      fail(new McpConnectionError('连接已结束', 'closed'));
      await shutdown();
    }
  };
}

// Streamable HTTP 与旧 SSE 共用按空行分隔的事件解析器。
async function readEvents(response, onEvent) {
  const reader = response.body?.getReader();
  if (!reader) throw new McpConnectionError('服务未返回事件流', 'protocol');
  const decoder = new TextDecoder();
  let buffer = '';
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new McpConnectionError('响应超过容量限制', 'response_size');
      buffer += decoder.decode(value, { stream: true });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const lines = block.split(/\r?\n/);
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
        const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message';
        if (data && await onEvent({ event, data })) return;
      }
    }
    if (buffer.trim()) {
      const lines = buffer.split(/\r?\n/);
      const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
      if (data) await onEvent({ event: 'message', data });
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function fetchEndpoint(address, options, credentialsOrigin) {
  let current = new URL(address);
  for (let count = 0; count < 6; count += 1) {
    if (!['http:', 'https:'].includes(current.protocol)) throw new McpConnectionError('连接地址需要 HTTP 或 HTTPS', 'endpoint');
    const headers = { ...options.headers };
    if (current.origin !== credentialsOrigin) {
      for (const name of Object.keys(headers)) {
        if (!['accept', 'content-type', 'mcp-method', 'mcp-protocol-version'].includes(name.toLowerCase())) delete headers[name];
      }
    }
    const response = await fetch(current, { ...options, headers, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status) || !response.headers.get('location')) return response;
    const next = new URL(response.headers.get('location'), current);
    await response.body?.cancel();
    current = next;
  }
  throw new McpConnectionError('端点重定向次数过多', 'redirect');
}

async function readRpcResponse(response, id, receive) {
  const contentType = response.headers.get('content-type') || '';
  if (response.status === 202 || response.status === 204) {
    await response.body?.cancel();
    return null;
  }
  if (contentType.includes('text/event-stream') && response.ok) {
    let result;
    await readEvents(response, ({ data }) => {
      let message;
      try { message = JSON.parse(data); }
      catch { throw new McpConnectionError('事件流包含无效 JSON', 'protocol'); }
      if (message.error && message.id == null) throw new McpConnectionError(String(message.error.message || 'MCP 请求失败'), message.error.code, message.error.data);
      if (message.id === id && !message.method) { result = message; return true; }
      receive?.(message);
      return false;
    });
    if (!result) throw new McpConnectionError('事件流结束时缺少请求结果', 'protocol');
    return result;
  }
  const declaredSize = Number(response.headers.get('content-length'));
  if (declaredSize > MAX_BYTES) { await response.body?.cancel(); throw new McpConnectionError('响应超过容量限制', 'response_size'); }
  let bytes = 0;
  const chunks = [];
  for await (const chunk of response.body || []) {
    bytes += chunk.byteLength;
    if (bytes > MAX_BYTES) throw new McpConnectionError('响应超过容量限制', 'response_size');
    chunks.push(chunk);
  }
  let message;
  try { message = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* HTTP 状态在下方处理 */ }
  if (response.status === 401 || response.status === 403) throw new McpConnectionError('服务要求认证，请检查服务器连接配置', 'authentication');
  if (message?.error && message.id == null) throw new McpConnectionError(String(message.error.message || 'MCP 请求失败'), message.error.code, message.error.data);
  if ((message?.error && message.id === id) || (message?.jsonrpc === '2.0' && message.id === id && Object.hasOwn(message, 'result'))) return message;
  if (!response.ok) throw new McpConnectionError(`端点返回 HTTP ${response.status}`, 'http_' + response.status);
  throw new McpConnectionError('端点未返回 MCP JSON-RPC 响应', 'protocol');
}

async function httpChannel(config, signal, timeoutMs) {
  const origin = new URL(config.url).origin;
  let sessionId = '';
  let lastVersion = '';
  let channel;
  const write = async (message, version) => {
    const headers = { ...config.headers, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (version) headers['MCP-Protocol-Version'] = version;
    if (message.method) headers['Mcp-Method'] = message.method;
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    lastVersion = version || lastVersion;
    const response = await fetchEndpoint(config.url, { method: 'POST', headers, body: JSON.stringify(message), signal }, origin);
    sessionId = response.headers.get('mcp-session-id') || sessionId;
    return readRpcResponse(response, message.id, value => channel.receive(value));
  };
  channel = rpcChannel(write, async () => {
    if (sessionId) {
      try {
        const response = await fetchEndpoint(config.url, {
          method: 'DELETE', headers: { ...config.headers, 'Mcp-Session-Id': sessionId, 'MCP-Protocol-Version': lastVersion },
          signal: AbortSignal.timeout(1000)
        }, origin);
        await response.body?.cancel();
      } catch { /* 会话由服务端超时回收 */ }
    }
  }, signal, timeoutMs);
  return channel;
}

async function sseChannel(config, signal, timeoutMs) {
  const origin = new URL(config.url).origin;
  const response = await fetchEndpoint(config.url, { headers: { ...config.headers, Accept: 'text/event-stream' }, signal }, origin);
  if (response.status === 401 || response.status === 403) throw new McpConnectionError('服务要求认证，请检查服务器连接配置', 'authentication');
  if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
    await response.body?.cancel();
    throw new McpConnectionError('服务未提供 SSE 连接端点', 'protocol');
  }
  let resolveEndpoint;
  let rejectEndpoint;
  const endpoint = new Promise((resolve, reject) => { resolveEndpoint = resolve; rejectEndpoint = reject; });
  const channel = rpcChannel(async (message, version) => {
    const target = await endpoint;
    const headers = { ...config.headers, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': version };
    const reply = await fetchEndpoint(target, { method: 'POST', headers, body: JSON.stringify(message), signal }, origin);
    return readRpcResponse(reply, message.id);
  }, async () => {}, signal, timeoutMs);
  void readEvents(response, ({ event, data }) => {
    if (event === 'endpoint') resolveEndpoint(new URL(data, config.url).href);
    else {
      try { channel.receive(JSON.parse(data)); }
      catch { throw new McpConnectionError('SSE 返回无效 JSON', 'protocol'); }
    }
    return false;
  }).catch(error => { rejectEndpoint(error); channel.fail(error); });
  signal.addEventListener('abort', () => rejectEndpoint(new McpConnectionError('连接超时', 'timeout')), { once: true });
  await endpoint;
  return channel;
}

async function resolveStdioCommand(config) {
  const command = config.command;
  if (process.platform !== 'win32' || !/^(npm|npx)(\.cmd)?$/i.test(command)) return { command, args: config.args || [] };
  const name = command.toLowerCase().replace(/\.cmd$/, '');
  for (const directory of [dirname(process.execPath), ...(process.env.PATH || '').split(delimiter)]) {
    const cli = join(directory, 'node_modules/npm/bin', name === 'npx' ? 'npx-cli.js' : 'npm-cli.js');
    try { await access(cli); return { command: process.execPath, args: [cli, ...(config.args || [])] }; } catch { /* 继续查询 PATH */ }
  }
  return { command, args: config.args || [] };
}

async function stdioChannel(config, signal, timeoutMs) {
  const launch = await resolveStdioCommand(config);
  const child = spawn(launch.command, launch.args, {
    env: { ...process.env, ...config.env }, cwd: config.cwd || undefined, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32'
  });
  let channel;
  let exited = false;
  let buffer = '';
  let bytes = 0;
  const shutdown = async () => {
    child.stdin.end();
    if (exited || !child.pid || child.exitCode != null || child.signalCode) return;
    const closed = once(child, 'close').catch(() => {});
    const terminate = signalName => {
      if (exited) return;
      if (process.platform === 'win32') execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
      else { try { process.kill(-child.pid, signalName); } catch { /* 进程组已退出 */ } }
    };
    const stop = setTimeout(() => terminate('SIGTERM'), 300);
    const force = setTimeout(() => terminate('SIGKILL'), 1300);
    await closed;
    clearTimeout(stop);
    clearTimeout(force);
  };
  channel = rpcChannel(message => new Promise((resolve, reject) => {
    child.stdin.write(JSON.stringify(message) + '\n', error => error ? reject(error) : resolve(null));
  }), shutdown, signal, timeoutMs);
  child.stdin.on('error', error => channel.fail(error));
  child.on('error', () => channel.fail(new McpConnectionError('MCP 命令启动失败，请检查服务器运行环境', 'spawn')));
  child.on('close', () => { exited = true; });
  child.on('exit', code => channel.fail(new McpConnectionError(`MCP 进程已退出（${code ?? 'signal'}）`, 'process_exit')));
  child.stderr.resume();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_BYTES) { channel.fail(new McpConnectionError('响应超过容量限制', 'response_size')); child.kill(); return; }
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      try { channel.receive(JSON.parse(line)); } catch { /* 兼容启动日志 */ }
    }
  });
  return channel;
}

function modernError(error) {
  return typeof error.code === 'number' && error.code <= -32020 && error.code >= -32029;
}

async function discover(channel, transport, timeoutMs) {
  if (transport !== 'sse') {
    try {
      let info;
      try { info = await channel.request('server/discover', {}, MODERN_VERSION, Math.min(timeoutMs, 10000)); }
      catch (error) {
        if (error.code === -32022 && error.data?.supported?.includes(MODERN_VERSION)) info = await channel.request('server/discover');
        else throw error;
      }
      if (info.resultType === 'input_required') throw new McpConnectionError('发现工具需要额外授权', 'authentication');
      if (!Array.isArray(info.supportedVersions) || !info.supportedVersions.includes(MODERN_VERSION)) throw new McpConnectionError('服务发现结果缺少兼容版本', 'version');
      return { version: MODERN_VERSION, serverInfo: info._meta?.['io.modelcontextprotocol/serverInfo'] || {}, capabilities: info.capabilities || {}, instructions: info.instructions || '' };
    } catch (error) {
      if (modernError(error) && !(error.code === -32022 && error.data?.supported?.some(version => LEGACY_VERSIONS.includes(version)))) throw error;
      if (error.code === 'authentication') throw error;
    }
  }
  const info = await channel.request('initialize', { protocolVersion: LEGACY_VERSIONS[0], capabilities: {}, clientInfo: CLIENT_INFO }, LEGACY_VERSIONS[0]);
  if (!LEGACY_VERSIONS.includes(info.protocolVersion)) throw new McpConnectionError('服务器协商了尚未支持的协议版本', 'version');
  await channel.notify('notifications/initialized', info.protocolVersion);
  return { version: info.protocolVersion, serverInfo: info.serverInfo || {}, capabilities: info.capabilities || {}, instructions: info.instructions || '' };
}

export async function inspectMcp(config, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let channel;
  let transport = config.transport || (config.url ? 'http' : 'stdio');
  try {
    channel = transport === 'stdio' ? await stdioChannel(config, controller.signal, timeoutMs)
      : transport === 'sse' ? await sseChannel(config, controller.signal, timeoutMs)
        : await httpChannel(config, controller.signal, timeoutMs);
    let info;
    try { info = await discover(channel, transport, timeoutMs); }
    catch (error) {
      if (transport !== 'http' || !['http_400', 'http_404', 'http_405'].includes(error.code)) throw error;
      await channel.close();
      channel = await sseChannel(config, controller.signal, timeoutMs);
      transport = 'sse';
      info = await discover(channel, transport, timeoutMs);
    }
    const tools = [];
    let cursor;
    const seen = new Set();
    if (info.capabilities.tools) {
      do {
        const page = await channel.request('tools/list', cursor ? { cursor } : {}, info.version);
        if (page.resultType === 'input_required') throw new McpConnectionError('工具发现需要额外授权', 'authentication');
        if (!Array.isArray(page.tools)) throw new McpConnectionError('工具列表格式异常', 'protocol');
        tools.push(...page.tools.filter(tool => tool && typeof tool.name === 'string'));
        cursor = page.nextCursor;
        if (cursor && seen.has(cursor)) throw new McpConnectionError('工具列表分页游标重复', 'pagination');
        if (cursor) seen.add(cursor);
        if (seen.size > 50 || tools.length > 5000) throw new McpConnectionError('工具列表超过容量限制', 'response_size');
      } while (cursor);
    }
    return { ...info, transport, tools, checkedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
    await channel?.close();
    controller.abort();
  }
}
