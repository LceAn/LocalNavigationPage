/* 在线共享配置。保留本机草稿，使用版本检查合并不同设备的修改。 */
function mergeNavigationConfig(base, local, remote) {
    const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    function mergeFields(before, ours, theirs, label) {
        const merged = { ...theirs };
        for (const key of new Set([...Object.keys(before), ...Object.keys(ours)])) {
            if (equal(before[key], ours[key])) continue;
            if (!equal(before[key], theirs[key]) && !equal(ours[key], theirs[key])) {
                throw new Error('「' + label + '」已在其他设备修改，请保留草稿后刷新合并');
            }
            if (key in ours) merged[key] = ours[key];
            else delete merged[key];
        }
        return merged;
    }
    const before = new Map(base.links.map(item => [item.ID, item]));
    const ours = new Map(local.links.map(item => [item.ID, item]));
    const result = new Map(remote.links.map(item => [item.ID, item]));
    let nextId = Math.max(0, ...local.links.map(item => item.ID), ...remote.links.map(item => item.ID)) + 1;
    for (const id of new Set([...before.keys(), ...ours.keys()])) {
        const previous = before.get(id);
        const current = ours.get(id);
        const latest = result.get(id);
        if (equal(previous, current)) continue;
        if (!previous && latest && !equal(current, latest)) {
            result.set(nextId, { ...current, ID: nextId });
            nextId += 1;
        } else if (!latest || !current) {
            if (previous && latest && !equal(previous, latest)) throw new Error('「' + previous.name + '」已有更新，删除操作已保留为草稿');
            if (previous && !latest && current) throw new Error('「' + previous.name + '」已被其他设备删除，修改已保留为草稿');
            if (current) result.set(id, current);
            else result.delete(id);
        } else {
            result.set(id, mergeFields(previous || {}, current, latest, current.name));
        }
    }
    return {
        links: [...result.values()],
        settings: mergeFields(base.settings || {}, local.settings || {}, remote.settings || {}, '分类设置')
    };
}

(function () {
    const sharedKeys = ['customCategories', 'customCategoryIcons', 'customCategoryOrder', 'customTileOrder', 'hiddenCatalogKeys', 'networkEnvironments'];
    let base = null;
    let busy = false;
    let applying = false;
    let generation = 0;
    let timer = null;
    let dirty = false;
    const clone = value => JSON.parse(JSON.stringify(value));
    function status(text, state = 'online') {
        const element = document.getElementById('server-sync-status');
        element.textContent = text;
        element.dataset.state = state;
        document.getElementById('server-retry').hidden = !['error', 'offline'].includes(state);
    }
    function defaultSharedSetting(key) {
        if (key === 'networkEnvironments') return getDefaultNetworkEnvironments();
        return ['customCategories', 'customCategoryOrder', 'hiddenCatalogKeys'].includes(key) ? [] : {};
    }
    function snapshot() {
        return clone({ links, settings: Object.fromEntries(sharedKeys.map(key => [key, getSetting(key, defaultSharedSetting(key))])) });
    }
    function rememberBase(data) {
        base = clone(data);
        setSetting('navigationServerBase', base);
        setSetting('serverSyncedRevision', data.revision);
    }
    function applySnapshot(data) {
        applying = true;
        try {
            for (const key of sharedKeys) setSetting(key, data.settings?.[key] ?? defaultSharedSetting(key));
            links = normalizeLinks(data.links);
            setSetting(LINKS_STORAGE_KEY, { links });
        } finally { applying = false; }
        window.dispatchEvent(new Event('navigation-config-applied'));
    }
    function render() {
        renderLinksByCategory(links);
        renderRecentLinks(links);
        renderLinksInSettingsIfVisible(links);
        window.updateCategoryDatalist?.();
        window.updateStorageInfo?.();
        restartStatusMonitor();
    }
    async function readConfig() {
        const response = await fetch('api/config', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error('服务连接失败');
        const data = await response.json();
        if (!Array.isArray(data.links) || !data.revision) throw new Error('服务器配置格式异常');
        return data;
    }
    async function writeConfig(data, revision) {
        return fetch('api/config', {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revision },
            body: JSON.stringify(data), signal: AbortSignal.timeout(10000)
        });
    }
    async function flush() {
        clearTimeout(timer);
        if (busy || !dirty) return;
        busy = true;
        const saveGeneration = generation;
        const local = snapshot();
        try {
            status('正在保存', 'saving');
            let payload = local;
            let revision = base?.revision;
            if (!revision) {
                const remote = await readConfig();
                payload = mergeNavigationConfig(base || remote, local, remote);
                revision = remote.revision;
            }
            let response = await writeConfig(payload, revision);
            if (response.status === 409) {
                const remote = await readConfig();
                payload = mergeNavigationConfig(base, local, remote);
                response = await writeConfig(payload, remote.revision);
            }
            if (!response.ok) throw new Error(response.status === 409 ? '其他设备正在更新，草稿已保留，请重试' : '保存暂未完成，草稿已保留，请重试');
            const saved = await response.json();
            const persisted = { ...payload, revision: saved.revision };
            if (generation === saveGeneration) {
                applySnapshot(persisted);
                dirty = false;
            } else {
                applySnapshot(mergeNavigationConfig(local, snapshot(), persisted));
            }
            rememberBase(persisted);
            setSetting('navigationDirty', dirty);
            render();
            status(dirty ? '正在保存新的修改' : '已保存到服务器', dirty ? 'saving' : 'online');
        } catch (error) {
            status(error.message.includes('草稿') || error.message.includes('其他设备') ? error.message : '连接中断，修改已暂存 · 恢复后自动重试', 'error');
            setSetting('navigationDirty', true);
        } finally {
            busy = false;
            if (dirty && generation !== saveGeneration) timer = setTimeout(flush, 350);
        }
    }
    window.flushNavigationChanges = flush;
    window.serverConfigLoaded = false;
    window.loadNavigationSource = async () => {
        const stored = getSetting(LINKS_STORAGE_KEY, null);
        const storedBase = getSetting('navigationServerBase', null);
        dirty = Boolean(getSetting('navigationDirty', false));
        try {
            const remote = await readConfig();
            if (dirty && stored && storedBase) {
                base = storedBase;
                status('正在同步本机草稿', 'saving');
                timer = setTimeout(flush, 400);
            } else {
                if (stored && (!getSetting('serverSyncedRevision', '') || dirty)) {
                    setSetting('navigationRecovery', { links: Array.isArray(stored) ? stored : stored.links, settings: snapshot().settings });
                }
                applySnapshot(remote);
                rememberBase(remote);
                dirty = false;
                setSetting('navigationDirty', false);
                window.serverConfigLoaded = true;
                status('已连接 · 修改自动保存');
            }
            document.getElementById('server-recover').hidden = !getSetting('navigationRecovery', null);
            return { ok: true, json: async () => remote };
        } catch {
            status('当前为本机模式 · 使用 npm run serve 启动在线管理', 'offline');
            for (const path of ['data/links.json', 'data/links.json.default']) {
                try {
                    const response = await fetch(path, { cache: 'no-store' });
                    if (!response.ok) continue;
                    const data = await response.json();
                    if (!Array.isArray(data.links)) continue;
                    base = { links: normalizeLinks(data.links), settings: snapshot().settings };
                    return { ok: true, json: async () => data };
                } catch { /* 继续读取兼容模板 */ }
            }
            base = { links: normalizeLinks(fallbackLinks), settings: snapshot().settings };
            return { ok: true, json: async () => base };
        }
    };
    window.markNavigationDirty = () => {
        if (applying) return;
        dirty = true;
        generation += 1;
        setSetting('navigationDirty', true);
        status('正在保存', 'saving');
        clearTimeout(timer);
        timer = setTimeout(flush, 350);
    };
    window.navigationSettingChanged = key => {
        if (sharedKeys.includes(key)) window.markNavigationDirty();
    };
    window.refreshNavigationFromServer = async (force = false) => {
        if (busy || (dirty && !force) || document.querySelector('.modal-overlay.show, #resource-detail-dialog[open]')) return;
        if (force && dirty && !confirm('读取服务器版本会替换当前未保存的修改，继续？')) return;
        busy = true;
        const refreshGeneration = generation;
        try {
            const remote = await readConfig();
            if (generation !== refreshGeneration) return;
            if (remote.revision !== base?.revision || force) {
                applySnapshot(remote);
                rememberBase(remote);
                dirty = false;
                setSetting('navigationDirty', false);
                render();
            }
            status('已同步 · 修改自动保存');
        } catch { status('服务暂未连接 · 本机配置已保留', 'offline'); }
        finally {
            busy = false;
            if (dirty && generation !== refreshGeneration) timer = setTimeout(flush, 350);
        }
    };
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('server-retry').addEventListener('click', () => dirty ? flush() : window.refreshNavigationFromServer());
        document.getElementById('server-pull').addEventListener('click', () => window.refreshNavigationFromServer(true));
        document.getElementById('server-recover').addEventListener('click', () => {
            const recovery = getSetting('navigationRecovery', null);
            if (!recovery || !confirm('将保留的本机草稿恢复为当前配置并自动保存到服务器？')) return;
            applySnapshot(recovery);
            window.markNavigationDirty();
            render();
        });
        window.addEventListener('online', () => dirty ? flush() : window.refreshNavigationFromServer());
        window.addEventListener('focus', () => { if (!document.hidden) dirty ? flush() : window.refreshNavigationFromServer(); });
        setInterval(() => { if (!document.hidden) dirty ? flush() : window.refreshNavigationFromServer(); }, 15000);
    });
})();
