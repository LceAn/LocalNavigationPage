/* storage.js — 设置存储层（自 main.js 拆出，加载顺序必须在 links-data.js / main.js 之前）
 * 职责：lnp:settings 容器读写、v1→v2 迁移、键重命名迁移、跨标签页同步。 */
const LINKS_STORAGE_KEY = 'navigationLinks';
const CUSTOM_CATEGORIES_KEY = 'customCategories';
const LAST_USED_LINK_URLS_KEY = 'lastUsedLinkUrls';
const HOME_LAYOUT_SETTINGS_KEY = 'homeLayoutSettings';
const HOME_FEATURE_SETTINGS_KEY = 'homeFeatureSettings';
const HOME_CATEGORY_TRAY_OPEN_KEY = 'homeCategoryTrayOpen';
const TOP_BUTTON_SETTINGS_KEY = 'topButtonSettings';
const STORAGE_KEY = 'lnp:settings';
const SETTINGS_SCHEMA_VERSION = 2;

// v1 时代的 key 名清单（迁移时需要逐个读取、复制、删除）
const V1_KEYS_TO_MIGRATE = [
    LINKS_STORAGE_KEY,
    CUSTOM_CATEGORIES_KEY,
    LAST_USED_LINK_URLS_KEY,
    HOME_LAYOUT_SETTINGS_KEY,
    HOME_FEATURE_SETTINGS_KEY,
    HOME_CATEGORY_TRAY_OPEN_KEY,
    TOP_BUTTON_SETTINGS_KEY,
    'homeVisualSettings',
    'displaySettings',
    'searchEngines',
    'theme',
    'darkMode',
    'siteTitle',
    'compactMode',
    'showThumbnails',
    'enableAnimations',
    'contentPosition',
    'defaultExpandFirst',
    'collapsedSections',
    'minimalMode',
    'minimalClockOrient',
    'minimalClockPosition',
    'searchButtonIconMode',
    'defaultSearchEngine',
    'expandedCategories',
    'showRecentLinks',
    'recentLinks',
    'linkStatusCache',
    'lastUpdate',
    'lastBackupTs',
    'backupReminderDismissTs',
    'versionCheckCache',
    'buttonVisibility',
    'showThemeBtn'
];

// 内存中的配置缓存（避免每次都 JSON.parse 整个容器）
let _settingsCache = null;
let _settingsLoaded = false;

function getAllSettings() {
    if (_settingsLoaded && _settingsCache) return _settingsCache;
    let raw;
    try {
        raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (error) {
        console.warn('解析 lnp:settings 失败，回退迁移', error);
        raw = null;
    }
    if (!raw || !raw.schemaVersion) {
        raw = migrateV1ToV2(raw);
    }
    _settingsCache = raw;
    _settingsLoaded = true;
    return _settingsCache;
}

function setAllSettings(settings) {
    settings.schemaVersion = SETTINGS_SCHEMA_VERSION;
    const ok = writeStorage(STORAGE_KEY, JSON.stringify(settings));
    if (ok) {
        _settingsCache = settings;
        _settingsLoaded = true;
    }
    return ok;
}

// 设置键重命名迁移：把旧键的值搬到新键（仅当新键不存在时），用于设置项命名规范化。
// 一次性运行（_renamedKeys 防重复执行），失败静默——最坏情况是该项恢复默认值。
renameSettingKeysOnce();
function renameSettingKeysOnce() {
    if (localStorage.getItem('lnp:keysRenamed') === '1') return;
    try {
        const renames = [
            ['defaultExpandAll', 'defaultExpandFirst'] // §3.5：展开首个分组的命名修正
        ];
        let changed = false;
        for (const [oldKey, newKey] of renames) {
            const all = getAllSettings();
            if (!(newKey in all) && (oldKey in all)) {
                all[newKey] = all[oldKey];
                setAllSettings(all);
                changed = true;
            }
        }
        localStorage.setItem('lnp:keysRenamed', '1');
        if (changed) console.info('[lnp] 设置键重命名迁移完成');
    } catch (e) { /* 静默 */ }
}

function getSetting(key, defaultValue) {
    const all = getAllSettings();
    return key in all ? all[key] : defaultValue;
}

function setSetting(key, value) {
    // 写前重新读取最新容器：多标签页场景下，内存缓存可能落后于其他标签页
    // 刚写入的设置，直接整体回写缓存会把它们覆盖掉。
    let latest = null;
    try {
        latest = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch { /* 解析失败则退回缓存 */ }
    const all = (latest && latest.schemaVersion) ? latest : getAllSettings();
    all[key] = value;
    return setAllSettings(all);
}

// 其他标签页修改设置时，同步刷新本页缓存，避免下次写入带回旧快照
window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
        const raw = JSON.parse(event.newValue);
        if (raw && raw.schemaVersion) {
            _settingsCache = raw;
        }
    } catch { /* 忽略异常数据 */ }
});

// 暴露给 darkMode.js 等其他脚本使用
window.getSetting = getSetting;
window.setSetting = setSetting;

// v1 → v2 一次性迁移：把旧 localStorage 散 key 全部读出、写入新容器、删除旧 key
function migrateV1ToV2(existing) {
    const merged = existing && typeof existing === 'object' ? { ...existing } : {};
    let migratedCount = 0;
    for (const key of V1_KEYS_TO_MIGRATE) {
        const value = localStorage.getItem(key);
        if (value === null) continue;
        // 数值/布尔/字符串/JSON 都接受；这里只判断是否存在
        if (!(key in merged)) {
            try {
                // 试一下能不能 parse，不能就当字符串存
                merged[key] = JSON.parse(value);
            } catch {
                merged[key] = value;
            }
            migratedCount += 1;
        }
    }
    merged.schemaVersion = SETTINGS_SCHEMA_VERSION;

    // 删掉所有 v1 散 key（即便没值也尝试一次，避免脏数据）
    for (const key of V1_KEYS_TO_MIGRATE) {
        try { localStorage.removeItem(key); } catch {}
    }

    console.info(`[lnp] 迁移 v1→v2 完成：合并 ${migratedCount} 个设置项`);
    // 立即持久化新容器
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (error) {
        console.error('[lnp] 迁移后写入失败', error);
    }
    return merged;
}

// 向后兼容：保留旧的 FULL_BACKUP_SETTINGS_KEYS（备份导入仍要识别）
// 但导出/导入都改为直接序列化 lnp:settings 容器。
const FULL_BACKUP_SETTINGS_KEYS = [
    STORAGE_KEY
];
