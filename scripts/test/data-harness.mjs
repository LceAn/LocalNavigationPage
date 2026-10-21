// scripts/test/data-harness.mjs — 经典脚本测试执行器
// 用 Node 直接执行 storage.js / links-data.js(无构建、无依赖),
// 通过 stub 的 window/localStorage 提供浏览器环境。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function createSandbox({ storage = {} } = {}) {
  const store = new Map(Object.entries(storage));
  const listeners = {};
  const sandbox = {
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear: () => store.clear()
    },
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
    console,
    URL,
    navigator: {},
    location: { href: 'http://127.0.0.1:8080/index.html', hostname: '127.0.0.1' },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  return { sandbox, store, listeners };
}

function runScript(sandbox, relativePath, exportNames = [], bridge = {}) {
  const src = readFileSync(join(root, relativePath), 'utf8');
  // 经典脚本的函数声明停留在脚本作用域;追加导出段把需要测试的绑定挂到 window
  const exports = exportNames.length
    ? `\n;Object.assign(window,{${exportNames.join(',')}});`
    : '';
  // bridge:浏览器中跨经典脚本共享的全局,在沙箱里以参数形式显式传入
  // (storage.js 的 getSetting 被 links-data.js 引用,而两个脚本在各自
  // 独立的 Function 作用域中执行)
  const bridgeNames = Object.keys(bridge);
  const body = `return (function(${bridgeNames.join(',')}){\n${src}\n${exports}\n});`;
  const factory = new Function(
    'window', 'self', 'localStorage', 'navigator', 'location', 'addEventListener', 'console',
    body
  ).call(
    sandbox,
    sandbox, sandbox, sandbox.localStorage, sandbox.navigator, sandbox.location,
    sandbox.addEventListener, sandbox.console
  );
  factory(...bridgeNames.map(name => bridge[name]));
}

// 载入数据层,返回沙箱(window 上挂着全部全局函数)
export function loadDataLayer({ storage } = {}) {
  const ctx = createSandbox({ storage });
  runScript(ctx.sandbox, 'HTML/js/storage.js');
  // 桥接 storage 层到数据层(对应浏览器全局作用域的跨脚本共享)
  const bridge = {
    getSetting: ctx.sandbox.getSetting,
    setSetting: ctx.sandbox.setSetting,
    getAllSettings: ctx.sandbox.getAllSettings,
    setAllSettings: ctx.sandbox.setAllSettings,
    readJSONStorage: ctx.sandbox.readJSONStorage,
    writeStorage: ctx.sandbox.writeStorage
  };
  runScript(ctx.sandbox, 'HTML/js/links-data.js', [
    'escapeHTML', 'isSafeUrl', 'sanitizeUrl', 'openSafeUrl', 'getLinkUrls',
    'normalizeLinks', 'loadStoredLinks', 'persistLinks',
    'getSafeLinkUrls', 'getPreferredUrlInfo', 'getUrlChoiceMeta',
    'isPrivateHost', 'defaultThumbnailFor', 'getAllCategoryNames',
    'getLinkStatusCache', 'startStatusMonitor', 'getProbeIntervalMs'
  ], bridge);
  return { ...ctx, api: ctx.sandbox };
}
