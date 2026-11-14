import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export function configRevision(doc) {
  return createHash('sha256').update(JSON.stringify(doc)).digest('hex');
}

export async function readConfigFile(path) {
  const doc = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(doc.links)) throw new Error('links 必须是数组');
  return doc;
}

export async function writeConfigFile(path, doc) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(doc, null, 4) + '\n', 'utf8');
  await rename(temporary, path);
}

export function validateSharedConfig(body) {
  if (!body || !Array.isArray(body.links)) throw new Error('links 必须是数组');
  const ids = new Set();
  for (const link of body.links) {
    if (!link || !Number.isInteger(link.ID) || link.ID < 1 || ids.has(link.ID) || !String(link.name || '').trim()) {
      throw new Error('链接需要名称与唯一正整数 ID');
    }
    ids.add(link.ID);
    const urls = Array.isArray(link.urls) ? link.urls.map(item => item?.address) : link.url ? [link.url] : [];
    const resource = ['mcp', 'skill'].includes(link.kind) && String(link.copyValue || '').trim();
    if ((!urls.length && !resource) || urls.some(address => {
      try { return !['http:', 'https:', 'mailto:', 'tel:', 'ftp:', 'file:'].includes(new URL(address).protocol); }
      catch { return true; }
    })) throw new Error('链接地址无效');
  }
  const source = body.settings || {};
  const settings = {};
  for (const key of ['customCategories', 'customCategoryOrder', 'hiddenCatalogKeys']) {
    if (source[key] !== undefined && (!Array.isArray(source[key]) || source[key].some(item => typeof item !== 'string'))) throw new Error(key + ' 必须是字符串数组');
    settings[key] = source[key] || [];
  }
  for (const key of ['customCategoryIcons', 'customTileOrder']) {
    if (source[key] !== undefined && (!source[key] || typeof source[key] !== 'object' || Array.isArray(source[key]))) throw new Error(key + ' 必须是对象');
    settings[key] = source[key] || {};
  }
  if (source.networkEnvironments !== undefined) {
    if (!Array.isArray(source.networkEnvironments)) throw new Error('networkEnvironments 必须是数组');
    const environmentIds = new Set();
    settings.networkEnvironments = source.networkEnvironments.map(profile => {
      if (!profile || typeof profile.id !== 'string' || !profile.id.trim() || profile.id === 'auto' || environmentIds.has(profile.id) || typeof profile.name !== 'string' || !profile.name.trim() || !['auto', 'local', 'tunnel', 'remote'].includes(profile.route)) throw new Error('网络环境需要唯一标识、名称与有效线路');
      environmentIds.add(profile.id);
      const probeUrl = String(profile.probeUrl || '').trim();
      if (probeUrl) {
        let parsed;
        try { parsed = new URL(probeUrl); } catch { throw new Error('网络检测地址格式无效'); }
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('网络检测地址只支持 HTTP 或 HTTPS');
      }
      return { id: profile.id, name: profile.name.trim(), route: profile.route, probeUrl };
    });
  }
  return { links: body.links, settings };
}
