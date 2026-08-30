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

function readJSONStorage(key, fallbackValue) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallbackValue;
    } catch (error) {
        console.warn(`读取本地配置失败：${key}`, error);
        return fallbackValue;
    }
}

// 统一的安全写入：捕获配额超限（QuotaExceededError），避免静默丢数据。
// 失败时延迟提示一次（用 showMessage，若尚未定义则仅 console）。
function writeStorage(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.error(`写入本地配置失败：${key}`, error);
        const notify = window.showMessage;
        if (typeof notify === 'function') {
            notify('本地存储已满，请导出备份后清理再操作');
        }
        return false;
    }
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
// 纯前端可达性探测：用 no-cors fetch + 超时判断内网服务是否在线。
// 仅探测 local/tunnel 类型（公网不探，避免 CORS 误判）。状态缓存供卡片读取。
const LINK_STATUS_CACHE_KEY = 'linkStatusCache';
const PROBE_TIMEOUT_MS = 3000;
const PROBE_INTERVAL_MS = 60000;

function getLinkStatusCache() {
    return getSetting(LINK_STATUS_CACHE_KEY, {}) || {};
}
function setLinkStatus(url, status) {
    const cache = getLinkStatusCache();
    cache[url] = { ...status, ts: Date.now() };
    setSetting(LINK_STATUS_CACHE_KEY, cache);
}

// 探测单个 URL：online=可达, ms=响应毫秒, 仅对 http(s) 有效
async function probeUrl(url) {
    if (!isSafeUrl(url)) return { online: false, ms: null };
    const start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        // no-cors：拿不到响应体，但能 resolve 即认为可达（opaque response）
        await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal, redirect: 'follow' });
        clearTimeout(timer);
        return { online: true, ms: Math.round(performance.now() - start) };
    } catch (err) {
        clearTimeout(timer);
        // abort=超时；TypeError=网络不可达/CORS拒绝。两者都视为离线
        const ms = Math.round(performance.now() - start);
        return { online: false, ms: ms > PROBE_TIMEOUT_MS ? null : ms };
    }
}

// 判断一个 URL 是否值得探测（仅内网/隧道地址）
function isProbingUrl(urlObj) {
    const meta = getUrlChoiceMeta(urlObj);
    return meta.type === 'local' || meta.type === 'tunnel';
}

// 批量探测所有链接的首选可探测 URL，更新缓存 + 刷新卡片状态点
let probeTimer = null;
async function probeLinkStatuses(allLinks) {
    const targets = [];
    for (const link of allLinks) {
        const safeUrls = getSafeLinkUrls(link);
        const probeable = safeUrls.filter(isProbingUrl);
        if (!probeable.length) continue;
        const preferred = getPreferredUrlInfo(link, probeable);
        targets.push({ linkId: link.ID, url: preferred.address });
    }
    // 并行探测（限制并发，避免一次打太多）
    const CONCURRENCY = 6;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const batch = targets.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async t => {
            const result = await probeUrl(t.url);
            setLinkStatus(t.url, result);
        }));
    }
    // 探测完成后刷新首页卡片状态点
    if (typeof refreshLinkStatusDots === 'function') refreshLinkStatusDots();
}

// 启动定期轮询
function startStatusMonitor(allLinks) {
    if (probeTimer) clearTimeout(probeTimer);
    // 首次延迟 2s 探测（等首屏渲染完）
    setTimeout(() => probeLinkStatuses(allLinks), 2000);
    probeTimer = setInterval(() => {
        if (document.hidden) return;
        probeLinkStatuses(allLinks);
    }, PROBE_INTERVAL_MS);
}

// 读取某个 URL 的缓存状态（供卡片显示）
function getCachedStatusForUrl(url) {
    const cache = getLinkStatusCache();
    const entry = cache[url];
    if (!entry) return null;
    // 缓存超过 2 倍轮询间隔视为过期
    if (Date.now() - (entry.ts || 0) > PROBE_INTERVAL_MS * 2.5) return null;
    return entry;
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

function getPreferredUrlInfo(link, safeUrls = getSafeLinkUrls(link)) {
    if (!safeUrls.length) return { address: '#', label: '默认' };

    // 用户手动选过的地址优先（记住上次选择）
    const savedUrl = getLastUsedLinkUrls()[String(link?.ID)];
    const savedMatch = safeUrls.find(url => url.address === savedUrl);
    if (savedMatch) return savedMatch;

    // 否则按当前网络环境智能选择：内网访问→优先内网 URL；公网访问→优先公网 URL
    const currentIsLocal = isLocalNetworkContext();
    const typed = safeUrls.map(url => ({ url, type: getUrlChoiceMeta(url).type }));
    const preferred = currentIsLocal
        ? typed.find(t => t.type === 'local') || typed.find(t => t.type === 'tunnel') || typed.find(t => t.type === 'remote')
        : typed.find(t => t.type === 'remote') || typed.find(t => t.type === 'tunnel') || typed.find(t => t.type === 'local');
    return preferred ? preferred.url : safeUrls[0];
}

// 当前页面是通过内网还是公网访问（用于智能选择链接首选 URL）
let _cachedNetworkContext = null;
function isLocalNetworkContext() {
    if (_cachedNetworkContext !== null) return _cachedNetworkContext;
    try {
        _cachedNetworkContext = isPrivateHost(window.location.hostname) ||
            /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(window.location.hostname);
    } catch {
        _cachedNetworkContext = false;
    }
    return _cachedNetworkContext;
}

function getUrlDisplayLabel(urlObj, index) {
    return String(urlObj?.label || `地址 ${index + 1}`).trim();
}

function isPrivateHost(hostname) {
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan')) return true;
    const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) return false;
    const parts = match.slice(1).map(Number);
    if (parts.some(part => part < 0 || part > 255)) return false;
    return parts[0] === 10
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 168)
        || (parts[0] === 127);
}

function getUrlChoiceMeta(urlObj) {
    const label = String(urlObj?.label || '').toLowerCase();
    let hostname = '';
    try {
        hostname = new URL(urlObj.address, window.location.href).hostname;
    } catch (error) {
        hostname = '';
    }

    const isLocal = isPrivateHost(hostname) || /内网|本地|局域|local|lan/.test(label);
    if (isLocal) {
        return { icon: 'ri-home-wifi-line', type: 'local' };
    }

    const isTunnel = /tailscale|zerotier|wireguard|vpn|隧道/.test(label);
    if (isTunnel) {
        return { icon: 'ri-shield-keyhole-line', type: 'tunnel' };
    }

    return { icon: 'ri-global-line', type: 'remote' };
}

// 新链接的默认缩略图：内网地址外部截图服务无法访问，留空走首字母 + favicon 兜底
function defaultThumbnailFor(address) {
    return getUrlChoiceMeta({ address }).type === 'local'
        ? ''
        : `https://s0.wp.com/mshots/v1/${encodeURIComponent(address)}?w=240&h=240`;
}

function openLinkUrl(link, url) {
    const safeUrl = sanitizeUrl(url);
    if (safeUrl === '#') {
        openSafeUrl(safeUrl);
        return;
    }
    rememberLastUsedLinkUrl(link, safeUrl);
    recordRecentLink(link);
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
            if (normalized.urls.length > 1) {
                delete normalized.url;
            } else if (normalized.urls.length === 1) {
                normalized.url = normalized.urls[0].address;
                delete normalized.urls;
            }
        } else if (link?.url) {
            normalized.url = String(link.url).trim();
        }

        // 单地址旧格式同样过协议白名单；地址全部非法的链接直接丢弃
        if (normalized.url !== undefined) {
            if (!isSafeUrl(normalized.url)) {
                return null;
            }
        } else if (!Array.isArray(normalized.urls) || normalized.urls.length === 0) {
            return null;
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
    return [...new Set([
        ...sourceLinks.map(link => link.category || '未分类'),
        ...getCustomCategories()
    ])].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

const defaultHomeLayoutSettings = {
    density: 'balanced',
    clickBlankToCollapse: true
};

function loadHomeLayoutSettings() {
    const saved = getSetting(HOME_LAYOUT_SETTINGS_KEY, {}) || {};
    const density = ['balanced', 'compact', 'spacious'].includes(saved?.density)
        ? saved.density
        : defaultHomeLayoutSettings.density;
    return {
        density,
        clickBlankToCollapse: saved?.clickBlankToCollapse !== false
    };
}

function saveHomeLayoutSettings(settings) {
    setSetting(HOME_LAYOUT_SETTINGS_KEY, {
        ...defaultHomeLayoutSettings,
        ...settings
    });
}

function isHomeCategoryTrayOpen() {
    return getSetting(HOME_CATEGORY_TRAY_OPEN_KEY, false) === true;
}

function setHomeCategoryTrayOpen(open) {
    setSetting(HOME_CATEGORY_TRAY_OPEN_KEY, Boolean(open));
}

function ensureHomeCategoriesVisibleForAction() {
    // 分类列表未展开时，先展开（底部小标始终可见，故不再有 hidden 模式）
    if (!document.body.classList.contains('home-categories-open')) {
        setHomeCategoryTrayOpen(true);
        applyHomeCategoryDisplayMode(loadHomeLayoutSettings());
    }
    return true;
}

function updateHomeCategorySummary(sourceLinks = links) {
    const summary = document.getElementById('home-category-summary');
    if (!summary) return;

    const categories = getAllCategoryNames(sourceLinks);
    const linkCount = Array.isArray(sourceLinks) ? sourceLinks.length : 0;
    summary.textContent = `${categories.length} 个分组 · ${linkCount} 个链接`;
}

function applyHomeCategoryDisplayMode(settings = loadHomeLayoutSettings()) {
    const body = document.body;
    const toggle = document.getElementById('home-category-toggle');
    if (!body) return;

    const density = settings.density || defaultHomeLayoutSettings.density;
    const shouldShowCategories = isHomeCategoryTrayOpen();

    body.classList.remove('home-density-balanced', 'home-density-compact', 'home-density-spacious');
    body.classList.add(`home-density-${density}`);
    body.classList.toggle('home-categories-open', shouldShowCategories);

    if (toggle) {
        toggle.setAttribute('aria-expanded', String(shouldShowCategories));
        toggle.title = shouldShowCategories ? '收起分组' : '显示分组';
    }

    if (!shouldShowCategories && typeof closeCategoryPanel === 'function') {
        closeCategoryPanel(false);
    }

    window.updateCategoryActionButtonState?.();
}

const defaultHomeFeatureSettings = {
    showTitle: true,
    showInfoBar: true,
    showSearch: true
};

function loadHomeFeatureSettings() {
    const saved = getSetting(HOME_FEATURE_SETTINGS_KEY, {}) || {};
    return {
        showTitle: saved?.showTitle !== false,
        showInfoBar: saved?.showInfoBar !== false,
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

