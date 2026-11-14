/* 环境配置共享，当前环境选择和可达性检测由当前浏览器维护。 */
function getDefaultNetworkEnvironments() {
    return [
        { id: 'home', name: '家里', route: 'local', probeUrl: '' },
        { id: 'work', name: '公司', route: 'local', probeUrl: '' },
        { id: 'tailscale', name: 'Tailscale', route: 'tunnel', probeUrl: '' },
        { id: 'public', name: '公网', route: 'remote', probeUrl: '' }
    ];
}
function getNetworkEnvironments() {
    const saved = getSetting('networkEnvironments', null);
    return Array.isArray(saved) ? saved.filter(profile => profile && typeof profile.id === 'string' && typeof profile.name === 'string' && ['auto', 'local', 'tunnel', 'remote'].includes(profile.route)) : getDefaultNetworkEnvironments();
}
function getCurrentNetworkLabel(profiles, selectedId, online = true, mode = 'auto') {
    if (!online) return '离线';
    const selected = profiles.find(profile => profile.id === selectedId);
    if (selected) return selected.name;
    return { local: '局域网优先', tunnel: '内网穿透优先', remote: '公网优先' }[mode] || '自动选路';
}

function getNetworkEnvironmentMeasurement(profile) {
    if (!profile?.probeUrl) return { state: 'unknown', text: '待设置检测地址', ms: null };
    if (window.navigator?.onLine === false) return { state: 'unreachable', text: '离线', ms: null };
    const state = getUrlProbeState(profile.probeUrl);
    const cached = getCachedStatusForUrl(profile.probeUrl);
    const ms = state.ms ?? cached?.ms;
    return { ...state, ms: typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? ms : null };
}

(function () {
    let checking = false;
    let settingsTimer = null;
    const routes = [['local', '本地网络优先'], ['tunnel', '内网穿透优先'], ['remote', '公网优先'], ['auto', '自动选择']];
    function navigationProbeUrl() { return new URL('.', location.href).href; }
    function renderIndicator() {
        const profiles = getNetworkEnvironments();
        let selected = getSetting('activeNetworkEnvironment', 'auto');
        const activeProfile = profiles.find(profile => profile.id === selected);
        if (selected !== 'auto' && !activeProfile) {
            selected = 'auto';
            setSetting('activeNetworkEnvironment', 'auto');
            setSetting('networkMode', 'auto');
            document.getElementById('network-mode').value = 'auto';
        }
        if (activeProfile && getSetting('networkMode', 'auto') !== activeProfile.route) {
            setSetting('networkMode', activeProfile.route);
            setSetting(LAST_USED_LINK_URLS_KEY, {});
            document.getElementById('network-mode').value = activeProfile.route;
            renderLinksByCategory(links);
            renderRecentLinks(links);
        }
        const button = document.getElementById('network-environment-button');
        const navigationMeasurement = getNetworkEnvironmentMeasurement({ probeUrl: navigationProbeUrl() });
        const measurement = activeProfile ? getNetworkEnvironmentMeasurement(activeProfile) : navigationMeasurement;
        const mode = getSetting('networkMode', 'auto');
        const name = getCurrentNetworkLabel(profiles, selected, navigator.onLine, mode);
        document.getElementById('network-environment-label').textContent = name;
        const latency = document.getElementById('network-environment-latency');
        latency.hidden = measurement.ms === null;
        latency.textContent = measurement.ms === null ? '' : measurement.ms + 'ms';
        const connectionDescription = selected === 'auto' ? '各服务独立选路，此数值为当前导航连接的延迟' : '手动选择的网络环境';
        button.title = connectionDescription + ' · 当前电脑 HTTP 往返延迟';
        button.setAttribute('aria-label', `${name}${measurement.ms === null ? '' : '，' + measurement.ms + 'ms'}，${selected === 'auto' && mode === 'auto' ? '自动选择' : '手动选择'}，查看网络环境`);
        button.dataset.offline = String(!navigator.onLine);
        button.dataset.state = measurement.state;
        document.getElementById('browser-network-state').textContent = navigator.onLine ? 'HTTP 往返延迟' : '浏览器离线';
        const list = document.getElementById('network-environment-list');
        const focusedId = list.contains(document.activeElement) ? document.activeElement.dataset.environmentId : null;
        list.replaceChildren();
        function addChoice(id, name, detail, state) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'environment-choice';
            row.dataset.environmentId = id;
            row.dataset.state = state;
            row.setAttribute('aria-pressed', String(selected === id && (id !== 'auto' || mode === 'auto')));
            const label = document.createElement('span');
            label.textContent = name;
            const meta = document.createElement('small');
            meta.textContent = detail;
            row.append(label, meta);
            row.addEventListener('click', () => {
                const profile = profiles.find(item => item.id === id);
                setSetting('activeNetworkEnvironment', id);
                setSetting('networkMode', profile?.route || 'auto');
                setSetting(LAST_USED_LINK_URLS_KEY, {});
                document.getElementById('network-mode').value = profile?.route || 'auto';
                renderLinksByCategory(links);
                renderRecentLinks(links);
                renderIndicator();
                closePopover();
            });
            list.append(row);
        }
        addChoice('auto', '自动选择', '各服务独立测速', 'auto');
        profiles.forEach(profile => {
            const current = getNetworkEnvironmentMeasurement(profile);
            addChoice(profile.id, profile.name, current.text, current.state);
        });
        if (focusedId) [...list.children].find(row => row.dataset.environmentId === focusedId)?.focus({ preventScroll: true });
        document.getElementById('network-recheck').disabled = checking || getProbeIntervalMs() === 0 || !navigator.onLine;
    }
    function closePopover() {
        document.getElementById('network-environment-popover').hidden = true;
        document.getElementById('network-environment-button').setAttribute('aria-expanded', 'false');
        window.setToolbarMenuOpen?.('network', false);
    }
    async function checkEnvironments() {
        if (checking) return;
        if (getProbeIntervalMs() === 0 || !navigator.onLine) { renderIndicator(); return; }
        checking = true;
        const profiles = getNetworkEnvironments().filter(profile => profile.probeUrl);
        const signature = JSON.stringify(profiles.map(profile => [profile.id, profile.probeUrl]));
        renderIndicator();
        try { await probeLinkStatuses([...profiles.map(profile => ({ url: profile.probeUrl })), { url: navigationProbeUrl() }]); }
        finally {
            checking = false;
            renderIndicator();
            const latest = getNetworkEnvironments().filter(profile => profile.probeUrl);
            if (JSON.stringify(latest.map(profile => [profile.id, profile.probeUrl])) !== signature) void checkEnvironments();
        }
    }
    function saveProfiles() {
        clearTimeout(settingsTimer);
        const rows = [...document.querySelectorAll('.environment-editor-row')];
        const profiles = rows.map(row => ({
            id: row.dataset.id,
            name: row.querySelector('.environment-name').value.trim(),
            route: row.querySelector('select').value,
            probeUrl: row.querySelector('.environment-probe').value.trim()
        }));
        const error = document.getElementById('network-environment-error');
        if (profiles.some(profile => !profile.name)) { error.textContent = '请填写环境名称'; return; }
        if (profiles.some(profile => profile.probeUrl && !/^https?:\/\//i.test(profile.probeUrl))) { error.textContent = '检测地址请填写完整 HTTP 或 HTTPS 地址'; return; }
        if (profiles.some(profile => profile.probeUrl && !isSafeUrl(profile.probeUrl, ['http:', 'https:']))) { error.textContent = '检测地址格式无效'; return; }
        error.textContent = '';
        setSetting('networkEnvironments', profiles);
        renderIndicator();
        void checkEnvironments();
    }
    window.checkNetworkEnvironments = checkEnvironments;
    window.refreshNetworkEnvironmentIndicator = renderIndicator;
    window.closeNetworkEnvironmentPopover = closePopover;

    function refreshMeasurements() {
        if (document.hidden) return;
        void checkEnvironments();
        void probeLinkStatuses(getNavigationItems());
    }
    function renderEditor() {
        const container = document.getElementById('network-environment-editor');
        container.replaceChildren();
        getNetworkEnvironments().forEach((profile, index) => {
            const row = document.createElement('div');
            row.className = 'environment-editor-row';
            row.dataset.id = profile.id;
            const name = document.createElement('input');
            name.className = 'environment-name';
            name.value = profile.name;
            name.setAttribute('aria-label', '环境名称 ' + (index + 1));
            const route = document.createElement('select');
            route.setAttribute('aria-label', profile.name + ' 的访问线路');
            route.append(...routes.map(([value, label]) => new Option(label, value)));
            route.value = profile.route;
            const probe = document.createElement('input');
            probe.className = 'environment-probe';
            probe.value = profile.probeUrl;
            probe.placeholder = '检测地址（可选）';
            probe.setAttribute('aria-label', profile.name + ' 的检测地址');
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'icon-button';
            remove.innerHTML = '<i class="ri-close-line" aria-hidden="true"></i>';
            remove.setAttribute('aria-label', '移除环境 ' + profile.name);
            remove.addEventListener('click', () => { row.remove(); saveProfiles(); });
            row.append(name, route, probe, remove);
            row.addEventListener('input', () => { clearTimeout(settingsTimer); settingsTimer = setTimeout(saveProfiles, 400); });
            row.addEventListener('change', saveProfiles);
            container.append(row);
        });
    }
    document.addEventListener('DOMContentLoaded', () => {
        const error = document.createElement('p');
        error.id = 'network-environment-error';
        error.className = 'form-hint';
        error.setAttribute('role', 'status');
        document.getElementById('network-environment-editor').after(error);
        const popover = document.getElementById('network-environment-popover');
        document.getElementById('network-environment-button').addEventListener('click', () => {
            popover.hidden = !popover.hidden;
            if (!popover.hidden) window.closeLayoutMenu?.(false);
            document.getElementById('network-environment-button').setAttribute('aria-expanded', String(!popover.hidden));
            window.setToolbarMenuOpen?.('network', !popover.hidden);
            if (!popover.hidden) checkEnvironments();
        });
        document.getElementById('network-recheck').addEventListener('click', checkEnvironments);
        document.getElementById('network-configure').addEventListener('click', () => {
            closePopover();
            window.openSettingsPanel();
            window.activateSettingsTab('homecontent');
            document.querySelector('[data-section-id="homecontent.network"]').scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
        document.getElementById('network-environment-add').addEventListener('click', () => {
            saveProfiles();
            const profiles = getNetworkEnvironments();
            setSetting('networkEnvironments', [...profiles, { id: 'env-' + Date.now(), name: '新环境', route: 'auto', probeUrl: '' }]);
            renderEditor();
            renderIndicator();
        });
        document.addEventListener('click', event => { if (!event.target.closest('.network-indicator')) closePopover(); });
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && !popover.hidden) { event.preventDefault(); closePopover(); document.getElementById('network-environment-button').focus(); } });
        document.getElementById('network-mode').addEventListener('change', () => { setSetting('activeNetworkEnvironment', 'auto'); renderIndicator(); });
        window.addEventListener('online', refreshMeasurements);
        window.addEventListener('offline', renderIndicator);
        window.addEventListener('focus', refreshMeasurements);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshMeasurements(); });
        window.addEventListener('navigation-config-applied', () => {
            renderIndicator();
            if (!document.getElementById('network-environment-editor').contains(document.activeElement)) renderEditor();
            void checkEnvironments();
        });
        renderIndicator();
        renderEditor();
        void checkEnvironments();
    });
})();
