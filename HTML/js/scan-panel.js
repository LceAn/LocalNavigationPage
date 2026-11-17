/* scan-panel.js — 设置 → 数据 → 本机服务扫描（1.37.0）
 * npm run scan 的面板入口：POST /api/scan 由导航服务器执行扫描，
 * 结果勾选后经 /api/links/import 入库（任意地址重叠自动跳过）。
 * 依赖 storage.js（getSetting）；showMessage 经 window 桥接。 */
(function () {
    const button = document.getElementById('scan-local-btn');
    const probeToggle = document.getElementById('scan-probe-toggle');
    const container = document.getElementById('scan-results');
    if (!button || !container) return;
    let scanning = false;
    let lastServices = [];

    function escapeHTML(text) {
        return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function renderState(message, icon = 'ri-loader-4-line ri-spin') {
        container.replaceChildren();
        const block = document.createElement('div');
        block.className = 'scan-status';
        block.innerHTML = `<i class="${icon}" aria-hidden="true"></i><span>${escapeHTML(message)}</span>`;
        container.append(block);
    }

    function renderResults(lanAddresses, services) {
        container.replaceChildren();
        const fresh = services.filter(s => !s.exists);
        const known = services.length - fresh.length;
        const summary = document.createElement('div');
        summary.className = 'scan-summary';
        summary.innerHTML = `发现 <strong>${services.length}</strong> 个服务` +
            (lanAddresses.length ? `，地址标签：${lanAddresses.map(a => escapeHTML(a.label)).join(' / ')}` : '') +
            (known ? `（${known} 个已存在）` : '');
        container.append(summary);

        if (!services.length) {
            renderState('没有发现可导入的服务（系统端口已排除）', 'ri-inbox-line');
            return;
        }

        const list = document.createElement('div');
        list.className = 'scan-list';
        let lastCategory = '';
        services.forEach((service, index) => {
            if (service.category !== lastCategory) {
                const group = document.createElement('div');
                group.className = 'scan-group-title';
                group.textContent = service.category;
                list.append(group);
                lastCategory = service.category;
            }
            const row = document.createElement('label');
            row.className = 'scan-row' + (service.exists ? ' is-known' : '');
            const labels = [...new Set(service.urls.map(url => url.label))].join('·');
            const sourceBadge = { docker: 'Docker', 'port-db': '已知端口', 'http-title': '探测', process: '进程', range: '推断', unknown: '' }[service.source] || '';
            row.innerHTML =
                `<input type="checkbox" data-index="${index}" ${service.exists ? '' : 'checked'} ${service.exists ? 'disabled' : ''}>` +
                `<span class="scan-row-name">${escapeHTML(service.name)}</span>` +
                `<span class="scan-row-port">:${service.port}</span>` +
                (sourceBadge ? `<span class="scan-row-badge">${escapeHTML(sourceBadge)}</span>` : '') +
                `<span class="scan-row-labels">${escapeHTML(labels)}</span>` +
                (service.exists ? '<span class="scan-row-known">已存在</span>' : '');
            list.append(row);
        });
        container.append(list);

        const footer = document.createElement('div');
        footer.className = 'scan-footer';
        const importButton = document.createElement('button');
        importButton.type = 'button';
        importButton.className = 'btn-primary';
        importButton.id = 'scan-import-btn';
        importButton.innerHTML = '<i class="ri-download-2-line" aria-hidden="true"></i><span>导入选中</span>';
        importButton.disabled = !fresh.length;
        importButton.addEventListener('click', importSelected);
        const count = document.createElement('span');
        count.className = 'scan-import-count';
        list.addEventListener('change', () => {
            const checked = list.querySelectorAll('input:checked').length;
            importButton.disabled = checked === 0;
            count.textContent = checked ? `将导入 ${checked} 个` : '';
        });
        count.textContent = fresh.length ? `将导入 ${fresh.length} 个` : '全部已存在，无需导入';
        footer.append(importButton, count);
        container.append(footer);
    }

    async function scan() {
        if (scanning) return;
        scanning = true;
        button.disabled = true;
        renderState(probeToggle?.checked ? '正在扫描并探测服务名，约需半分钟…' : '正在扫描本机监听端口…');
        try {
            const response = await fetch('api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ probe: probeToggle?.checked === true })
            });
            if (response.status === 404) throw new Error('当前为静态部署：请用 npm run serve 启动导航服务后再扫描');
            if (!response.ok) {
                let error;
                try { error = await response.json(); } catch { /* 非 JSON */ }
                throw new Error(error?.error || `扫描请求返回 HTTP ${response.status}`);
            }
            const result = await response.json();
            lastServices = Array.isArray(result.services) ? result.services : [];
            renderResults(result.lanAddresses || [], lastServices);
        } catch (error) {
            renderState(error.message || '扫描失败', 'ri-error-warning-line');
        } finally {
            scanning = false;
            button.disabled = false;
        }
    }

    async function importSelected() {
        const checked = [...container.querySelectorAll('.scan-row input:checked')].map(input => Number(input.dataset.index));
        if (!checked.length) return;
        const links = checked.map(index => {
            const service = lastServices[index];
            return { name: service.name, kind: 'site', urls: service.urls, category: service.category, tag: service.tag, thumbnail: '' };
        });
        try {
            const response = await fetch('api/links/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ links })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            window.showMessage?.(`已导入 ${result.added} 个服务${result.skippedDuplicates ? `，跳过重复 ${result.skippedDuplicates} 个` : ''}`);
            // 拉取最新配置并刷新界面（抽屉与设置列表都由 server-sync 负责重渲染）
            await window.refreshNavigationFromServer?.();
            // 重扫一次刷新「已存在」标注
            scan();
        } catch (error) {
            window.showMessage?.('导入失败：' + (error.message || '未知错误'), 'error');
        }
    }

    button.addEventListener('click', scan);
})();
