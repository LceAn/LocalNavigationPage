/* server-panel.js — 设置 → 服务：监听地址 / 在线会话 / IP 黑名单（1.38.0）
 * 数据来自 /api/server/*；纯静态部署给出提示。
 * 全部节点用 createElement/textContent 构建，User-Agent 等外部字符串不进 innerHTML。 */
(function () {
    const tabButton = document.querySelector('.tab-button[data-tab="server"]');
    const listeningBox = document.getElementById('server-listening');
    const sessionsBox = document.getElementById('server-sessions');
    const blacklistBox = document.getElementById('server-blacklist-list');
    const blacklistInput = document.getElementById('server-blacklist-input');
    const blacklistAdd = document.getElementById('server-blacklist-add');
    if (!tabButton || !listeningBox || !sessionsBox) return;
    let timer = null;
    let loading = false;

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function relativeTime(iso) {
        const ms = Date.now() - new Date(iso).getTime();
        if (!Number.isFinite(ms)) return '';
        if (ms < 15 * 1000) return '刚刚';
        if (ms < 60 * 1000) return Math.round(ms / 1000) + ' 秒前';
        if (ms < 60 * 60 * 1000) return Math.round(ms / 60 * 1000) + ' 分钟前';
        return Math.round(ms / 3600 / 1000) + ' 小时前';
    }

    function classifyIp(ip) {
        if (ip === '::1' || ip.startsWith('127.')) return { label: '本机', cls: 'local' };
        const parts = ip.split('.');
        if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
            const [a, b] = parts.map(Number);
            if (a === 100 && b >= 64 && b <= 127) return { label: 'Tailscale', cls: 'tunnel' };
            if (a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31) return { label: '局域网', cls: 'local' };
        }
        return { label: '外部', cls: 'remote' };
    }

    function offline(message) {
        [listeningBox, sessionsBox, blacklistBox].forEach(box => {
            box.replaceChildren();
            const hint = element('div', 'scan-status');
            const icon = element('i', 'ri-server-line');
            icon.setAttribute('aria-hidden', 'true');
            hint.append(icon, element('span', '', message));
            box.append(hint);
        });
    }

    function renderListening(status) {
        listeningBox.replaceChildren();
        for (const item of status.listening || []) {
            const row = element('div', 'server-address-row');
            const cls = { 局域网: 'local', Tailscale: 'tunnel' }[item.label] || 'remote';
            const chip = element('span', 'route-chip route-' + cls, item.label + ' · ' + (item.iface || item.family));
            const link = element('a', 'server-address-url', item.url);
            link.href = item.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            row.append(link, chip);
            listeningBox.append(row);
        }
        if (!listeningBox.children.length) {
            listeningBox.append(element('p', 'form-hint', '没有发现对外可达的网卡地址（仅回环绑定）。'));
        }
    }

    function sessionRow(session) {
        const row = element('div', 'server-session-row' + (session.online ? ' is-online' : ''));
        const left = element('div', 'server-session-info');
        const head = element('div', 'server-session-head');
        const state = element('span', 'server-session-state');
        state.dataset.state = session.online ? 'online' : 'offline';
        state.append(element('span', 'server-session-dot'), element('span', '', session.online ? '在线' : '离线'));
        const ipLabel = classifyIp(session.ip);
        head.append(element('code', '', session.ip),
            element('span', 'server-session-badge route-' + ipLabel.cls, ipLabel.label),
            state,
            session.self ? element('span', 'server-session-badge is-self', '本会话') : null);
        const meta = element('div', 'server-session-meta');
        meta.append(element('span', '', `${session.requests} 次请求 · 最近 ${relativeTime(new Date(session.lastSeen).toISOString())}`));
        if (session.userAgent) {
            meta.append(element('span', 'server-session-ua', session.userAgent));
        }
        left.append(head, meta);
        const actions = element('div', 'server-session-actions');
        const kick = element('button', 'btn-secondary btn-sm', '踢下线');
        kick.type = 'button';
        const block = element('button', 'btn-secondary btn-sm is-danger', '拉黑');
        block.type = 'button';
        if (session.self) {
            // 本会话：服务端也会拒绝（回环保护），这里直接禁用并说明，避免误操作
            kick.disabled = true;
            block.disabled = true;
            kick.title = block.title = '不能对当前管理会话操作';
        } else {
            kick.addEventListener('click', () => act('api/server/sessions/kick', { ip: session.ip }, `断开 ${session.ip} 的现有连接？对方下次请求仍可重连。`));
            block.addEventListener('click', () => act('api/server/blacklist', { ip: session.ip }, `拉黑 ${session.ip}？对方将无法访问本导航页，直到解除。`));
        }
        actions.append(kick, block);
        row.append(left, actions);
        return row;
    }

    function renderSessions(payload) {
        sessionsBox.replaceChildren();
        const list = payload.sessions || [];
        const online = list.filter(s => s.online).length;
        const summary = element('p', 'form-hint', `共 ${list.length} 个会话（在线 ${online}），每 10 秒自动刷新`);
        sessionsBox.append(summary);
        if (!list.length) {
            sessionsBox.append(element('p', 'form-hint', '暂无会话记录'));
            return;
        }
        list.forEach(session => sessionsBox.append(sessionRow(session)));
    }

    function renderBlacklist(payload) {
        blacklistBox.replaceChildren();
        const list = payload.blacklist || [];
        if (!list.length) {
            blacklistBox.append(element('p', 'form-hint', '黑名单为空'));
            return;
        }
        list.forEach(item => {
            const row = element('div', 'server-blacklist-row');
            const info = element('div', 'server-session-info');
            const head = element('div', 'server-session-head');
            head.append(element('code', '', item.ip), element('span', 'server-session-badge route-remote', '已屏蔽'));
            info.append(head, element('div', 'server-session-meta',
                (item.blockedAt ? new Date(item.blockedAt).toLocaleString() : '') + (item.note ? ' · ' + item.note : '')));
            const unblock = element('button', 'btn-secondary btn-sm', '解除');
            unblock.type = 'button';
            unblock.addEventListener('click', () => {
                if (!window.confirm(`解除 ${item.ip} 的屏蔽？`)) return;
                fetch('api/server/blacklist/' + encodeURIComponent(item.ip), { method: 'DELETE' })
                    .then(() => { window.showMessage?.('已解除 ' + item.ip); refresh(); })
                    .catch(() => window.showMessage?.('操作失败', 'error'));
            });
            row.append(info, unblock);
            blacklistBox.append(row);
        });
    }

    async function refresh() {
        if (loading) return;
        loading = true;
        try {
            const response = await fetch('api/server/sessions');
            if (response.status === 404) { offline('当前为静态部署：会话与黑名单需要 npm run serve 启动导航服务'); return; }
            const [sessionsRes, statusRes] = await Promise.all([
                response,
                fetch('api/server/status').then(r => r.ok ? r.json() : null).catch(() => null)
            ]);
            const payload = await sessionsRes.json();
            if (statusRes) renderListening(statusRes);
            renderSessions(payload);
            renderBlacklist(payload);
        } catch {
            offline('无法连接导航服务器');
        } finally {
            loading = false;
        }
    }

    async function act(path, body, confirmText) {
        if (confirmText && !window.confirm(confirmText)) return;
        try {
            const response = await fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
            if (path.endsWith('kick')) window.showMessage?.(`已断开 ${result.ip} 的 ${result.kicked} 个连接`);
            else window.showMessage?.(`已拉黑 ${result.ip}`);
            refresh();
        } catch (error) {
            window.showMessage?.(error.message || '操作失败', 'error');
        }
    }

    blacklistAdd?.addEventListener('click', () => {
        const ip = (blacklistInput.value || '').trim();
        if (!ip) { window.showMessage?.('请输入 IP 地址', 'error'); return; }
        act('api/server/blacklist', { ip }, `拉黑 ${ip}？对方将无法访问本导航页，直到解除。`).then(() => { blacklistInput.value = ''; });
    });
    blacklistInput?.addEventListener('keydown', event => {
        if (event.key === 'Enter') blacklistAdd?.click();
    });

    // 仅当设置面板打开且服务 tab 激活时轮询，切走即停
    const settingsPanel = document.getElementById('settings-box');
    function syncPolling() {
        const active = settingsPanel?.classList.contains('active') || document.getElementById('settings-box')?.style.display !== 'none';
        const tabActive = tabButton.classList.contains('active');
        const shouldRun = tabActive && !document.hidden;
        if (shouldRun && !timer) { refresh(); timer = setInterval(() => { if (!document.hidden) refresh(); }, 10000); }
        else if (!shouldRun && timer) { clearInterval(timer); timer = null; }
    }
    tabButton.addEventListener('click', syncPolling);
    document.addEventListener('click', event => {
        if (event.target.closest('.tab-button')) setTimeout(syncPolling, 50);
    });
    document.addEventListener('visibilitychange', syncPolling);
})();
