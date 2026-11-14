/* links-data.js — 链接数据层（自 main.js 拆出，加载顺序：storage.js 之后、main.js 之前）
 * 职责：链接数据模型与规范化、URL 协议白名单、多地址选择、状态探测缓存、
 *       分类与首页布局设置、escapeHTML 等基础工具。 */
let links = [];
let bundledLinks = [];

const fallbackLinks = [
    {
        ID: 1,
        name: '路由器管理',
        url: 'http://192.168.1.1',
        category: '网络设备',
        tag: '本地',
        thumbnail: 'https://s0.wp.com/mshots/v1/192.168.1.1?w=240&h=240'
    },
    {
        ID: 2,
        name: 'NAS 管理',
        urls: [
            { address: 'http://192.168.1.100:5000', label: '本地网络', priority: 1 },
            { address: 'https://your-nas.tailnet.ts.net', label: 'Tailscale', priority: 2 }
        ],
        category: '云服务',
        tag: '存储',
        thumbnail: 'https://s0.wp.com/mshots/v1/example.com?w=240&h=240'
    },
    {
        ID: 3,
        name: 'Google',
        url: 'https://www.google.com',
        category: '常用网站',
        tag: '搜索',
        thumbnail: 'https://s0.wp.com/mshots/v1/www.google.com?w=240&h=240'
    }
];

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}


function isSafeUrl(value, allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'ftp:', 'file:']) {
    const url = String(value ?? '').trim();
    if (!url) return false;

    try {
        const parsed = new URL(url, window.location.href);
        return allowedProtocols.includes(parsed.protocol);
    } catch (error) {
        return false;
    }
}

function sanitizeUrl(value, fallback = '#', allowedProtocols) {
    const url = String(value ?? '').trim();
    return isSafeUrl(url, allowedProtocols) ? url : fallback;
}

function openSafeUrl(url) {
    const safeUrl = sanitizeUrl(url);
    if (safeUrl === '#') {
        window.showMessage?.('链接地址无效');
        return;
    }
    window.open(safeUrl, '_blank', 'noopener');
}

function getLastUsedLinkUrls() {
    const saved = getSetting(LAST_USED_LINK_URLS_KEY, {});
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
}

function rememberLastUsedLinkUrl(link, url) {
    if (!link?.ID || !isSafeUrl(url)) return;
    const saved = getLastUsedLinkUrls();
    saved[String(link.ID)] = url;
    setSetting(LAST_USED_LINK_URLS_KEY, saved);
}

// 最近使用记录：每个链接按 ID 记录最近访问时间戳，用于首页「最近使用」行
const RECENT_LINKS_KEY = 'recentLinks';
const LINK_VISIT_COUNTS_KEY = 'linkVisitCounts';

function recordVisitCount(linkId) {
    if (!linkId) return;
    const counts = getSetting(LINK_VISIT_COUNTS_KEY, {}) || {};
    counts[String(linkId)] = (counts[String(linkId)] || 0) + 1;
    // 只保留前 50,防止无限增长
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 50);
    setSetting(LINK_VISIT_COUNTS_KEY, Object.fromEntries(top));
}

const SEARCH_HISTORY_KEY = 'searchHistory';
const SEARCH_HISTORY_MAX = 8;

function recordSearchTerm(term) {
    const t = String(term || '').trim();
    if (!t || t.startsWith('/')) return; // 前缀搜索不入历史
    const list = getSetting(SEARCH_HISTORY_KEY, []) || [];
    const next = [t, ...list.filter(x => x !== t)].slice(0, SEARCH_HISTORY_MAX);
    setSetting(SEARCH_HISTORY_KEY, next);
}

function getSearchHistory() {
    return getSetting(SEARCH_HISTORY_KEY, []) || [];
}

function getVisitCounts() {
    return getSetting(LINK_VISIT_COUNTS_KEY, {}) || {};
}

function recordRecentLink(link) {
    if (!link?.ID) return;
    const recent = { ...getSetting(RECENT_LINKS_KEY, {}) };
    recent[String(link.ID)] = Date.now();
    // 只保留最近 8 条，避免无限增长
    const sorted = Object.entries(recent).sort((a, b) => b[1] - a[1]).slice(0, 8);
    setSetting(RECENT_LINKS_KEY, Object.fromEntries(sorted));
}
function getRecentLinks() {
    return getSetting(RECENT_LINKS_KEY, {}) || {};
}

// ============ 链接状态监控（P0-2）============
// 从当前浏览器探测每个 HTTP(S) 地址的可达性，结果按 URL 独立缓存。
const LINK_STATUS_CACHE_KEY = 'linkStatusCache';
const LINK_STATUS_PROBE_VERSION = 2;
const PROBE_TIMEOUT_MS = 3000;
const PROBE_INTERVAL_MS = 60000;

function getLinkStatusCache() {
    return getSetting(LINK_STATUS_CACHE_KEY, {}) || {};
}
function setLinkStatus(url, status) {
    const cache = getLinkStatusCache();
    cache[url] = { ...status, probeVersion: LINK_STATUS_PROBE_VERSION, ts: Date.now() };
    setSetting(LINK_STATUS_CACHE_KEY, cache);
}

// 探测单个 URL：online=可达, ms=响应毫秒, 仅对 http(s) 有效
async function probeUrl(url) {
    if (!isSafeUrl(url, ['http:', 'https:'])) return { online: false, ms: null };
    const clock = window.performance || performance;
    let start = clock.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        const options = { cache: 'no-store', credentials: 'omit', signal: controller.signal, redirect: 'follow' };
        let response;
        try {
            response = await window.fetch(url, { ...options, mode: 'cors' });
        } catch (error) {
            if (controller.signal.aborted) throw error;
            start = clock.now();
            response = await window.fetch(url, { ...options, mode: 'no-cors' });
        }
        const ms = Math.max(1, Math.round(clock.now() - start));
        void response.body?.cancel().catch(() => {});
        // 跨域不透明响应无法读取 HTTP 状态，独立展示为未确认。
        if (response.type === 'opaque' || response.type === 'opaqueredirect') return { online: null, ms };
        const httpStatus = response.status;
        const online = (httpStatus >= 200 && httpStatus < 400) || httpStatus === 401 || httpStatus === 403;
        return { online, ms, httpStatus };
    } catch (error) {
        return { online: false, ms: null };
    } finally {
        clearTimeout(timer);
    }
}

function isProbingUrl(urlObj) {
    return isSafeUrl(urlObj?.address, ['http:', 'https:']);
}

let probeTimer = null;
let initialProbeTimer = null;
const pendingUrlProbes = new Map();
const urlProbeQueue = [];
let activeUrlProbes = 0;

function getUrlProbeState(address) {
    if (!isProbingUrl({ address })) return { state: 'unsupported', text: '不支持探测' };
    if (getProbeIntervalMs() === 0) return { state: 'off', text: '探测已关闭' };
    if (pendingUrlProbes.has(address)) return { state: 'checking', text: '检测中' };
    const cached = getCachedStatusForUrl(address);
    if (!cached) return { state: 'unknown', text: '未检测' };
    if (cached.online === null) return { state: 'unconfirmed', text: '有响应 · 未确认' + (cached.ms == null ? '' : ' · ' + cached.ms + 'ms'), ms: cached.ms };
    if (cached.online) {
        const text = cached.httpStatus === 401 || cached.httpStatus === 403 ? `需认证 · HTTP ${cached.httpStatus}` : '可达';
        return { state: 'online', text: text + (cached.ms == null ? '' : ' · ' + cached.ms + 'ms'), ms: cached.ms };
    }
    return { state: 'unreachable', text: cached.httpStatus ? `HTTP ${cached.httpStatus}` : '未响应' };
}

// 所有刷新入口共用最多六个探测任务，重复 URL 共用同一个结果。
function startQueuedUrlProbes() {
    while (activeUrlProbes < 6 && urlProbeQueue.length) {
        const { address, resolve, reject } = urlProbeQueue.shift();
        if (getProbeIntervalMs() === 0) {
            pendingUrlProbes.delete(address);
            resolve();
            continue;
        }
        activeUrlProbes += 1;
        probeUrl(address).then(result => {
            setLinkStatus(address, result);
        }).finally(() => {
            pendingUrlProbes.delete(address);
            activeUrlProbes -= 1;
            window.refreshLinkStatusDots?.();
            startQueuedUrlProbes();
        }).then(resolve, reject);
    }
}

function queueUrlProbe(address) {
    if (pendingUrlProbes.has(address)) return pendingUrlProbes.get(address);
    const task = new Promise((resolve, reject) => urlProbeQueue.push({ address, resolve, reject }));
    pendingUrlProbes.set(address, task);
    window.refreshLinkStatusDots?.();
    startQueuedUrlProbes();
    return task;
}

async function probeLinkStatuses(allLinks) {
    if (getProbeIntervalMs() === 0) return;
    const targets = [...new Set(allLinks.flatMap(link => getSafeLinkUrls(link).filter(isProbingUrl).map(url => url.address)))];
    await Promise.all(targets.map(queueUrlProbe));
    window.refreshAutomaticRoutes?.();
    window.refreshNetworkEnvironmentIndicator?.();
}

// 探测频率（毫秒）：从设置读取，0 = 关闭探测，默认 60s
function getProbeIntervalMs() {
    const saved = Number(getSetting('probeIntervalMs', PROBE_INTERVAL_MS));
    return Number.isFinite(saved) && saved >= 0 ? saved : PROBE_INTERVAL_MS;
}

// 状态缓存有效期：跟随用户配置的探测间隔（至少按 30s 计），
// 关闭探测时旧缓存立即失效（返回 0 表示不再信任）
function getStatusCacheTtlMs() {
    const interval = getProbeIntervalMs();
    if (interval === 0) return 0;
    return Math.max(interval, 30000) * 2.5;
}

// 启动定期轮询
function startStatusMonitor(allLinks) {
    if (probeTimer) clearInterval(probeTimer);
    if (initialProbeTimer) clearTimeout(initialProbeTimer);
    window.refreshLinkStatusDots?.();
    window.refreshNetworkEnvironmentIndicator?.();
    window.refreshAutomaticRoutes?.();
    const interval = getProbeIntervalMs();
    if (interval === 0) return;
    const run = () => {
        void probeLinkStatuses(typeof getNavigationItems === 'function' ? getNavigationItems() : allLinks);
        void window.checkNetworkEnvironments?.();
    };
    initialProbeTimer = setTimeout(run, 0);
    probeTimer = setInterval(() => {
        if (!document.hidden) run();
    }, interval);
}

// 链接数组被整体替换后（导入 / 重置 / 书签导入）重启探测循环，
// 否则计时器闭包里仍持有旧数组，新链接不会被探测
function restartStatusMonitor() {
    startStatusMonitor(links);
}

// 读取某个 URL 的缓存状态（供卡片显示）
function getCachedStatusForUrl(url) {
    if (getProbeIntervalMs() === 0) return null;
    const cache = getLinkStatusCache();
    const entry = cache[url];
    if (!entry || entry.probeVersion !== LINK_STATUS_PROBE_VERSION) return null;
    // 过期阈值跟随探测间隔，避免 5 分钟档位下一半时间显示「检测中…」
    if (Date.now() - (entry.ts || 0) > getStatusCacheTtlMs()) return null;
    return entry;
}

function getFastestMeasuredUrl(urls) {
    return urls.map(url => ({ url, status: getCachedStatusForUrl(url.address) }))
        .filter(({ url, status }) => isProbingUrl(url) && status && (status.online === true || status.online === null) && typeof status.ms === 'number' && Number.isFinite(status.ms) && status.ms >= 0)
        .sort((a, b) => a.status.ms - b.status.ms)[0]?.url || null;
}

function getLinkUrls(link) {
    if (link.urls && Array.isArray(link.urls)) {
        // 新格式：多 URL，按优先级排序
        return [...link.urls].sort((a, b) => (a.priority || 999) - (b.priority || 999));
    } else if (link.url) {
        // 旧格式：单 URL
        return [{ address: link.url, label: '默认', priority: 1 }];
    }
    return [];
}

function getSafeLinkUrls(link) {
    return getLinkUrls(link)
        .map((url, index) => ({
            ...url,
            address: sanitizeUrl(url.address),
            label: String(url.label || `地址 ${index + 1}`).trim()
        }))
        .filter(url => url.address !== '#');
}

const LINK_DEFAULT_URLS_KEY = 'linkDefaultUrls';

function getDefaultLinkUrls() {
    const saved = getSetting(LINK_DEFAULT_URLS_KEY, {});
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
}

function getLinkRoutePreferenceKey(link) {
    return String(link.catalogKey || link.ID);
}

function getPinnedLinkUrl(link, safeUrls = getSafeLinkUrls(link)) {
    const saved = getDefaultLinkUrls();
    return safeUrls.find(url => url.address === saved[getLinkRoutePreferenceKey(link)])?.address || '';
}

function setDefaultLinkUrl(link, address) {
    if (address && !getSafeLinkUrls(link).some(url => url.address === address)) return false;
    const saved = { ...getDefaultLinkUrls() };
    saved[getLinkRoutePreferenceKey(link)] = address;
    setSetting(LINK_DEFAULT_URLS_KEY, saved);
    return true;
}

function getPreferredUrlInfo(link, safeUrls = getSafeLinkUrls(link)) {
    if (!safeUrls.length) return { address: '#', label: '默认' };

    const pinned = getPinnedLinkUrl(link, safeUrls);
    if (pinned) return safeUrls.find(url => url.address === pinned);

    const mode = getSetting('networkMode', 'auto');
    if (['local', 'tunnel', 'remote'].includes(mode)) {
        const candidates = safeUrls.filter(url => getUrlChoiceMeta(url).type === mode && getCachedStatusForUrl(url.address)?.online !== false);
        const match = getFastestMeasuredUrl(candidates) || candidates[0];
        if (match) return match;
    }

    const fastest = getFastestMeasuredUrl(safeUrls);
    if (fastest) return fastest;

    const remaining = safeUrls.filter(url => getCachedStatusForUrl(url.address)?.online !== false);
    const candidates = remaining.length ? remaining : safeUrls;

    // 用户手动选过的地址优先（记住上次选择）
    const savedUrl = getLastUsedLinkUrls()[String(link?.ID)];
    const savedMatch = candidates.find(url => url.address === savedUrl);
    const defaults = getDefaultLinkUrls();
    if (savedMatch && !Object.hasOwn(defaults, getLinkRoutePreferenceKey(link))) return savedMatch;

    return candidates[0];
}

function getUrlDisplayLabel(urlObj, index) {
    return String(urlObj?.label || `地址 ${index + 1}`).trim();
}

function isPrivateHost(hostname) {
    // URL.hostname 对 IPv6 会带方括号（[::1]），先剥掉再判断
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return false;
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.home.arpa')) return true;
    // IPv6：环回 ::1、链路本地 fe80::/10、唯一本地地址 fc00::/7
    if (host === '::1' || host.startsWith('fe80:') || /^f[cd][0-9a-f]{0,2}:/.test(host)) return true;
    // IPv4-mapped IPv6（::ffff:192.168.1.5）
    if (host.startsWith('::ffff:')) return isPrivateHost(host.slice('::ffff:'.length));
    const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) return false;
    const parts = match.slice(1).map(Number);
    if (parts.some(part => part < 0 || part > 255)) return false;
    return parts[0] === 10
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 168)
        || (parts[0] === 127)
        || (parts[0] === 169 && parts[1] === 254); // IPv4 链路本地
}

// Tailscale：MagicDNS 域名 + 100.64.0.0/10 CGNAT 段。
// 这些地址用公网 IP 段承载内网服务，必须归到「隧道」而不是「公网」。
function isTunnelHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return false;
    if (host.endsWith('.ts.net') || host.endsWith('.tailscale.net')) return true;
    // Tailscale 的 IPv6 ULA 段（fd7a:115c:a1e0::/48），否则会被当成普通私网
    if (host.startsWith('fd7a:115c:a1e0:')) return true;
    const match = host.match(/^(\d{1,3})\.(\d{1,3})\./);
    if (!match) return false;
    return Number(match[1]) === 100 && Number(match[2]) >= 64 && Number(match[2]) <= 127;
}

// 标签是人工补充：只在主机名无法判断时使用。
// "lan" 加边界，避免 "Landing page" 这类标签被误判成内网。
const LOCAL_LABEL_PATTERN = /内网|本地|局域|local|(?:^|[^a-z])lan(?:[^a-z]|$)/i;
const TUNNEL_LABEL_PATTERN = /tailscale|zerotier|wireguard|vpn|隧道|内网穿透|frp/i;

function getUrlChoiceMeta(urlObj) {
    const label = String(urlObj?.label || '');
    let hostname = '';
    try {
        hostname = new URL(urlObj.address, window.location.href).hostname;
    } catch (error) {
        hostname = '';
    }

    // 主机名优先：私网地址恒为内网，Tailscale 域名/CGNAT 恒为隧道。
    // 这样即使标签写成「Tailscale」，192.168.x 也不会被误标成隧道。
    if (isTunnelHost(hostname)) {
        return { icon: 'ri-shield-keyhole-line', type: 'tunnel' };
    }
    if (isPrivateHost(hostname)) {
        return { icon: 'ri-home-wifi-line', type: 'local' };
    }
    if (TUNNEL_LABEL_PATTERN.test(label)) {
        return { icon: 'ri-shield-keyhole-line', type: 'tunnel' };
    }
    if (LOCAL_LABEL_PATTERN.test(label)) {
        return { icon: 'ri-home-wifi-line', type: 'local' };
    }

    return { icon: 'ri-global-line', type: 'remote' };
}

// 新链接的默认缩略图：外部截图服务访问不到内网/Tailscale 地址，
// 这两类留空走首字母 + favicon 兜底，避免注定失败的请求
function defaultThumbnailFor(address) {
    return getUrlChoiceMeta({ address }).type === 'remote'
        ? `https://s0.wp.com/mshots/v1/${encodeURIComponent(address)}?w=240&h=240`
        : '';
}

function openLinkUrl(link, url, { direct = false } = {}) {
    let chosen = url;
    if (!direct && !getPinnedLinkUrl(link) && getSetting('networkMode', 'auto') === 'auto') {
        chosen = getPreferredUrlInfo(link).address;
    }
    const safeUrl = sanitizeUrl(chosen);
    if (safeUrl === '#') {
        openSafeUrl(safeUrl);
        return;
    }
    if (!direct) rememberLastUsedLinkUrl(link, safeUrl);
    recordRecentLink(link);
    recordVisitCount(link.ID);
    openSafeUrl(safeUrl);
}

function normalizeLinks(rawLinks) {
    const usedIds = new Set();
    let nextId = 1;

    return (Array.isArray(rawLinks) ? rawLinks : []).map(link => {
        let id = Number(link?.ID);
        if (!Number.isInteger(id) || id <= 0 || usedIds.has(id)) {
            while (usedIds.has(nextId)) nextId += 1;
            id = nextId;
        }

        usedIds.add(id);
        nextId = Math.max(nextId, id + 1);

        const normalized = {
            ...link,
            ID: id,
            name: String(link?.name || '未命名'),
            category: String(link?.category || '未分类'),
            tag: String(link?.tag || '')
        };

        if (Array.isArray(link?.urls)) {
            normalized.urls = link.urls
                .filter(url => url && String(url.address || '').trim() && isSafeUrl(String(url.address).trim()))
                .map((url, index) => ({
                    address: String(url.address).trim(),
                    label: String(url.label || `地址 ${index + 1}`),
                    priority: Number.parseInt(url.priority, 10) || index + 1
                }));
            if (normalized.urls.length) delete normalized.url;
        } else if (link?.url) {
            normalized.url = String(link.url).trim();
        }

        // 扫描目录的资源会携带空 url，命令与路径仍属于有效入口。
        if (normalized.url !== undefined && !String(normalized.url).trim()) delete normalized.url;

        // 单地址旧格式同样过协议白名单；地址全部非法的链接直接丢弃
        if (normalized.url !== undefined) {
            if (!isSafeUrl(normalized.url)) {
                return null;
            }
        } else if (!Array.isArray(normalized.urls) || normalized.urls.length === 0) {
            if (!['mcp', 'skill'].includes(normalized.kind) || !String(normalized.copyValue || '').trim()) return null;
        }

        if (link?.thumbnail) {
            normalized.thumbnail = String(link.thumbnail).trim();
        }

        return normalized;
    }).filter(Boolean);
}

function loadStoredLinks(defaultLinks) {
    const stored = getSetting(LINKS_STORAGE_KEY, null);
    const storedLinks = Array.isArray(stored) ? stored : stored?.links;
    return normalizeLinks(storedLinks || defaultLinks);
}

function persistLinks() {
    setSetting(LINKS_STORAGE_KEY, { links });
    setSetting('lastUpdate', new Date().toISOString());
    window.markNavigationDirty?.();
}

function getCustomCategoryIcons() {
    const map = getSetting('customCategoryIcons', {});
    return map && typeof map === 'object' ? map : {};
}

function setCategoryIcon(category, iconClass) {
    const map = getCustomCategoryIcons();
    if (iconClass && /^ri-[a-z0-9-]+$/i.test(iconClass)) {
        map[category] = iconClass;
    } else {
        delete map[category]; // 清空 = 回退自动推断
    }
    setSetting('customCategoryIcons', map);
}

function getCustomCategories() {
    const categories = getSetting(CUSTOM_CATEGORIES_KEY, []);
    return Array.isArray(categories)
        ? categories.map(category => String(category).trim()).filter(Boolean)
        : [];
}

function saveCustomCategories(categories) {
    setSetting(CUSTOM_CATEGORIES_KEY, [...new Set(categories.filter(Boolean))]);
}

function getAllCategoryNames(sourceLinks = links) {
    const names = [...new Set([
        ...sourceLinks.map(link => link.category || '未分类'),
        ...getCustomCategories()
    ])].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    // 手动排序模式下按 customCategoryOrder 排列(与首页分组卡片同序)
    if (getSetting('groupSortMode', 'name') === 'custom') {
        const order = getSetting('customCategoryOrder', []);
        const rank = new Map((Array.isArray(order) ? order : []).map((name, i) => [name, i]));
        names.sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || a.localeCompare(b, 'zh-CN'));
    }
    return names;
}

const defaultHomeLayoutSettings = {
    density: 'balanced'
};

function applyContentPosition(position = getSetting('contentPosition', 'default')) {
    const value = ['top', 'default', 'bottom'].includes(position) ? position : 'default';
    const container = document.querySelector('main.container');
    container.classList.remove('content-position-default', 'content-position-top', 'content-position-bottom');
    container.classList.add('content-position-' + value);
    const select = document.getElementById('page-position-select');
    if (select) select.value = value;
    return value;
}

function loadHomeLayoutSettings() {
    const saved = getSetting(HOME_LAYOUT_SETTINGS_KEY, {}) || {};
    const density = ['balanced', 'compact', 'spacious'].includes(saved?.density)
        ? saved.density
        : defaultHomeLayoutSettings.density;
    return { density };
}

function saveHomeLayoutSettings(settings) {
    setSetting(HOME_LAYOUT_SETTINGS_KEY, {
        ...defaultHomeLayoutSettings,
        ...settings
    });
}

// 所有分组常显，不再有收起/展开托盘
function applyHomeCategoryDisplayMode(settings = loadHomeLayoutSettings()) {
    const body = document.body;
    if (!body) return;

    const density = settings.density || defaultHomeLayoutSettings.density;
    body.classList.remove('home-density-balanced', 'home-density-compact', 'home-density-spacious');
    body.classList.add(`home-density-${density}`);
    body.classList.remove('home-categories-open');

    window.updateCategoryActionButtonState?.();
}

const defaultHomeFeatureSettings = {
    showTitle: false,
    showInfoBar: true,
    showSearch: true
};

function loadHomeFeatureSettings() {
    const saved = getSetting(HOME_FEATURE_SETTINGS_KEY, {}) || {};
    return {
        showTitle: saved?.showTitle ?? false,
        showInfoBar: saved?.showInfoBar ?? true,
        showSearch: saved?.showSearch !== false
    };
}

function saveHomeFeatureSettings(settings) {
    setSetting(HOME_FEATURE_SETTINGS_KEY, {
        ...defaultHomeFeatureSettings,
        ...settings
    });
}

function applyHomeFeatureSettings(settings = loadHomeFeatureSettings()) {
    document.body.classList.toggle('home-title-hidden', settings.showTitle === false);
    document.body.classList.toggle('home-info-hidden', settings.showInfoBar === false);
    document.body.classList.toggle('home-search-hidden', settings.showSearch === false);
}

