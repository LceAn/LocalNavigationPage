import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const htmlRoot = join(root, 'HTML');
const errors = [];
const warnings = [];

function readJSON(relativePath) {
  try {
    return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
  } catch (error) {
    errors.push(`${relativePath}: JSON 无效 (${error.message})`);
    return null;
  }
}

function validateLinks(relativePath) {
  const document = readJSON(relativePath);
  const links = document?.links;
  if (!Array.isArray(links)) {
    errors.push(`${relativePath}: links 必须是数组`);
    return document;
  }

  const ids = new Set();
  for (const [index, link] of links.entries()) {
    const label = `${relativePath}: links[${index}]`;
    if (!Number.isInteger(link.ID) || link.ID <= 0 || ids.has(link.ID)) {
      errors.push(`${label}: ID 必须是唯一正整数`);
    }
    ids.add(link.ID);
    if (!String(link.name || '').trim()) errors.push(`${label}: 缺少 name`);
    if (!String(link.category || '').trim()) errors.push(`${label}: 缺少 category`);

    const addresses = Array.isArray(link.urls)
      ? link.urls.map(item => item?.address)
      : [link.url];
    if (!addresses.some(Boolean)) errors.push(`${label}: 缺少 url 或 urls`);
    for (const address of addresses.filter(Boolean)) {
      try {
        const parsed = new URL(address);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push(`${label}: 不允许的 URL 协议 ${parsed.protocol}`);
        }
      } catch {
        errors.push(`${label}: URL 无效 ${address}`);
      }
    }
  }
  return document;
}

const runtimeLinks = validateLinks('HTML/data/links.json');
const defaultLinks = validateLinks('HTML/data/links.json.default');
if (runtimeLinks && defaultLinks && JSON.stringify(runtimeLinks) !== JSON.stringify(defaultLinks)) {
  // 本地开发可将 links.json 替换为私有数据，并设置 LNP_ALLOW_PRIVATE_LINKS=1 跳过该检查；
  // CI 与默认环境保持严格：公开仓库绝不允许出现私有地址。
  if (process.env.LNP_ALLOW_PRIVATE_LINKS === '1') {
    warnings.push('HTML/data/links.json 与公开示例不一致（已按 LNP_ALLOW_PRIVATE_LINKS=1 跳过，切勿提交）');
  } else {
    errors.push('HTML/data/links.json 必须保持为公开示例；私有地址请保存在浏览器或部署卷中');
  }
}

readJSON('HTML/manifest.webmanifest');

const html = readFileSync(join(htmlRoot, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
for (const reference of references) {
  if (/^(?:https?:|data:|#|mailto:|tel:)/i.test(reference)) continue;
  const cleanReference = reference.split(/[?#]/, 1)[0];
  if (!cleanReference) continue;
  const target = normalize(join(htmlRoot, cleanReference));
  const relFromRoot = relative(htmlRoot, target);
  if (relFromRoot.startsWith('..') || isAbsolute(relFromRoot)) {
    errors.push(`HTML/index.html: 资源路径越界 ${reference}`);
    continue;
  }
  try {
    if (!statSync(target).isFile()) errors.push(`HTML/index.html: 资源不是文件 ${reference}`);
  } catch {
    errors.push(`HTML/index.html: 资源不存在 ${reference}`);
  }
}

for (const relativePath of ['HTML/js/main.js', 'HTML/js/darkMode.js']) {
  const result = spawnSync(process.execPath, ['--check', join(root, relativePath)], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`${relativePath}: JavaScript 语法检查失败\n${result.stderr.trim()}`);
}

const shellCheck = spawnSync('sh', ['-n', join(root, 'docker/10-init-links-json.sh')], { encoding: 'utf8' });
if (shellCheck.status !== 0) errors.push(`docker/10-init-links-json.sh: ${shellCheck.stderr.trim()}`);

if (warnings.length > 0) console.warn(warnings.join('\n'));

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`验证通过：${runtimeLinks.links.length} 个公开示例链接，${references.length} 个 HTML 资源引用。`);
