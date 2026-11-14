/* 设置中的统一入口管理、分组筛选与排序。 */
let settingsLinkCategory = "";
function getLinksFilterState() {
    return {
        searchTerm: document.getElementById('links-search')?.value.trim().toLowerCase() || '',
        category: settingsLinkCategory,
        kind: document.getElementById('links-kind-filter')?.value || ''
    };
}

function getLinkSearchText(link) {
    const urls = getLinkUrls(link);
    return [
        link.name,
        link.category,
        link.tag,
        link.kind,
        link.remarks,
        link.copyValue,
        ...urls.flatMap(url => [url.address, url.label])
    ].filter(Boolean).join(' ').toLowerCase();
}

function linkMatchesSettingsFilters(link, filters) {
    const matchesCategory = !filters.category || (link.category || '未分类') === filters.category;
    const matchesSearch = !filters.searchTerm || getLinkSearchText(link).includes(filters.searchTerm);
    const matchesKind = !filters.kind || (link.kind || 'site') === filters.kind;
    return matchesCategory && matchesSearch && matchesKind;
}

function formatUrlForDisplay(url) {
    try {
        const parsed = new URL(url, window.location.href);
        const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
        return `${parsed.host}${path}`;
    } catch (error) {
        return url;
    }
}

function updateLinksEmptyState(linksEmpty, hasLinks, hasResults) {
    if (!linksEmpty) return;

    const emptyTitle = linksEmpty.querySelector('p');
    const emptyDescription = linksEmpty.querySelector('span');
    linksEmpty.style.display = hasResults ? 'none' : 'block';

    if (hasResults) return;

    if (emptyTitle) {
        emptyTitle.textContent = hasLinks ? '没有匹配的入口' : '暂无入口';
    }
    if (emptyDescription) {
        emptyDescription.textContent = hasLinks
            ? '换个关键词或切换分组试试'
            : '点击“添加入口”开始';
    }
}

function renderLinksInSettingsIfVisible(sourceLinks) {
    const settingsContainer = document.getElementById('settings-container');
    const linksTab = document.getElementById('links-tab');
    const settingsOpen = settingsContainer?.classList.contains('show');
    const linksTabActive = linksTab?.classList.contains('active');

    if (settingsOpen && linksTabActive) {
        renderLinksInSettings(sourceLinks);
    }
}

function updateLinksResultCount(filteredCount, totalCount) {
    const resultCount = document.getElementById('links-result-count');
    if (!resultCount) return;

    resultCount.textContent = filteredCount === totalCount
        ? `共 ${totalCount} 项`
        : `${filteredCount} / ${totalCount} 项`;
}

function renderSettingsGroupFilters(allLinks, categoryNames) {
    const rail = document.getElementById('settings-group-filters');
    if (!rail) return;
    rail.replaceChildren();
    ['', ...categoryNames].forEach(category => {
        const count = category ? allLinks.filter(link => (link.category || '未分类') === category).length : allLinks.length;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'settings-group-filter';
        button.setAttribute('aria-pressed', String(settingsLinkCategory === category));
        button.dataset.category = category;
        const name = document.createElement('span');
        name.textContent = category || '全部';
        const badge = document.createElement('small');
        badge.textContent = count;
        button.append(name, badge);
        button.addEventListener('click', () => {
            settingsLinkCategory = category;
            renderLinksInSettings(links);
            document.querySelectorAll('.settings-group-filter').forEach(item => {
                if (item.dataset.category === category) item.focus({ preventScroll: true });
            });
        });
        rail.append(button);
    });
}

function renderLinksInSettings(sourceLinks) {
    const list = document.getElementById('existing-links');
    if (!list) return;
    const allLinks = getNavigationItems(Array.isArray(sourceLinks) ? sourceLinks : links);
    const categoryNames = getAllCategoryNames(allLinks);
    if (!categoryNames.includes(settingsLinkCategory)) settingsLinkCategory = '';
    renderSettingsGroupFilters(allLinks, categoryNames);
    const filters = getLinksFilterState();
    const filteredLinks = allLinks.filter(link => linkMatchesSettingsFilters(link, filters));
    updateLinksResultCount(filteredLinks.length, allLinks.length);
    updateLinksEmptyState(document.getElementById('links-empty'), allLinks.length > 0, filteredLinks.length > 0);
    document.getElementById('links-collection-title').textContent = settingsLinkCategory || '所有入口';
    const summary = document.getElementById('links-filter-summary');
    if (summary) summary.textContent = filters.searchTerm ? `搜索“${filters.searchTerm}”` : '名称与访问地址';
    list.replaceChildren(...filteredLinks.map(createLinkItem));
    list.style.display = filteredLinks.length ? 'flex' : 'none';
    bindLinkListDrag();
}

// 扫描得到的目录项首次修改时保存为覆盖记录，后续扫描继续使用同一 catalogKey。
function assignSettingsLinkCategory(link, category) {
    const stored = links.find(item => item.ID === link.ID || (link.catalogKey && item.catalogKey === link.catalogKey));
    if (stored) stored.category = category;
    else {
        const nextId = Math.max(0, ...links.map(item => Number(item.ID) || 0)) + 1;
        links.push({ ...link, ID: nextId, category });
    }
}

function refreshSettingsLinkViews() {
    renderLinksByCategory(links);
    renderLinksInSettingsIfVisible(links);
    window.updateCategoryDatalist?.();
    window.updateStorageInfo?.();
}

function deleteSettingsLink(link) {
    if (!confirm(`删除「${link.name}」？`)) return;
    const index = links.findIndex(item => item.ID === link.ID);
    const hidden = getSetting('hiddenCatalogKeys', []);
    const wasHidden = hidden.includes(link.catalogKey);
    if (index >= 0) links.splice(index, 1);
    if (link.catalogKey) setSetting('hiddenCatalogKeys', [...new Set([...hidden, link.catalogKey])]);
    window.persistLinks?.();
    refreshSettingsLinkViews();
    window.__pendingDeletedLink = { link, index, wasHidden };
    window.showMessage?.(`已删除「${link.name}」 · 点击撤销`, 'warning', 8000);
    const message = document.getElementById('message-container');
    message?.classList.add('clickable-undo');
    message?.setAttribute('role', 'button');
    message?.setAttribute('tabindex', '0');
    clearTimeout(window.__undoTimer);
    window.__undoTimer = setTimeout(clearSettingsDeleteUndo, 8000);
}

function clearSettingsDeleteUndo() {
    window.__pendingDeletedLink = null;
    const message = document.getElementById('message-container');
    message?.classList.remove('clickable-undo');
    message?.removeAttribute('role');
    message?.removeAttribute('tabindex');
}

function undoSettingsLinkDelete() {
    const pending = window.__pendingDeletedLink;
    if (!pending) return;
    clearTimeout(window.__undoTimer);
    clearSettingsDeleteUndo();
    const alreadyRestored = pending.link.catalogKey && links.some(link => link.catalogKey === pending.link.catalogKey);
    if (pending.index >= 0 && !alreadyRestored) {
        const restored = { ...pending.link };
        if (links.some(link => link.ID === restored.ID)) {
            restored.ID = Math.max(0, ...links.map(link => Number(link.ID) || 0)) + 1;
        }
        links.splice(Math.min(pending.index, links.length), 0, restored);
    }
    if (pending.link.catalogKey && !pending.wasHidden) {
        setSetting('hiddenCatalogKeys', getSetting('hiddenCatalogKeys', []).filter(key => key !== pending.link.catalogKey));
    }
    window.persistLinks?.();
    refreshSettingsLinkViews();
    window.showMessage?.(`已撤销删除「${pending.link.name}」`);
}

// 绑定设置链接列表的拖拽排序（在分组内重排 links 数组顺序）
function bindLinkListDrag() {
    const list = document.getElementById('existing-links');
    if (!list) return;
    let draggingId = null;

    list.querySelectorAll('.settings-link-item[draggable="true"]').forEach(item => {
        item.addEventListener('dragstart', event => {
            draggingId = item.dataset.linkId;
            item.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggingId = null;
            list.querySelectorAll('.settings-link-item').forEach(el => el.classList.remove('drag-over'));
        });
        item.addEventListener('dragover', event => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            if (item.dataset.linkId !== draggingId) {
                item.classList.add('drag-over');
            }
        });
        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });
        item.addEventListener('drop', event => {
            event.preventDefault();
            item.classList.remove('drag-over');
            const targetId = item.dataset.linkId;
            if (!draggingId || draggingId === targetId) return;

            // 在 links 数组中：找到 dragging 和 target 的位置，移动 dragging 到 target 前
            const fromIdx = links.findIndex(l => String(l.ID) === draggingId);
            const toIdx = links.findIndex(l => String(l.ID) === targetId);
            if (fromIdx === -1 || toIdx === -1) return;
            const [moved] = links.splice(fromIdx, 1);
            // 移动后索引可能偏移，重新定位
            const newToIdx = links.findIndex(l => String(l.ID) === targetId);
            links.splice(newToIdx, 0, moved);
            persistLinks();
            renderLinksByCategory(links);
            renderRecentLinks(links);
            renderLinksInSettingsIfVisible(links);
            showMessage('已更新链接顺序');
        });
    });
}

function createLinkItem(link) {
    const row = document.createElement('div');
    row.className = 'settings-link-item';
    row.dataset.linkId = String(link.ID);
    row.dataset.category = link.category || '未分类';
    row.draggable = links.some(item => item.ID === link.ID);

    const drag = document.createElement('span');
    drag.className = 'link-drag-handle';
    drag.title = row.draggable ? '拖动排序' : '扫描目录项';
    drag.setAttribute('aria-hidden', 'true');
    drag.innerHTML = `<i class="${row.draggable ? 'ri-draggable' : 'ri-refresh-line'}"></i>`;

    const info = document.createElement('div');
    info.className = 'link-info';
    const favicon = document.createElement('div');
    favicon.className = 'link-favicon';
    favicon.setAttribute('aria-hidden', 'true');
    const thumbnail = sanitizeUrl(link.thumbnail, '', ['http:', 'https:']);
    if (thumbnail && getSetting('showThumbnails', true) !== false) {
        favicon.classList.add('has-image');
        favicon.style.backgroundImage = `url("${thumbnail}")`;
    } else favicon.textContent = String(link.name || '?').trim().charAt(0).toUpperCase() || '?';

    const details = document.createElement('div');
    details.className = 'link-details';
    const titleRow = document.createElement('div');
    titleRow.className = 'settings-link-title';
    const name = document.createElement('button');
    name.className = 'settings-link-name';
    name.type = 'button';
    name.textContent = link.name;
    name.setAttribute('aria-label', `编辑 ${link.name}`);
    name.addEventListener('click', () => window.openEditModal(link));
    const kind = document.createElement('span');
    kind.className = 'settings-link-kind';
    kind.textContent = { site: '网站', ai: 'AI', mcp: 'MCP', skill: 'Skill' }[link.kind || 'site'];
    titleRow.append(name, kind);
    if (link.tag && link.tag.toLowerCase() !== (link.kind || 'site')) {
        const tag = document.createElement('span');
        tag.className = 'settings-link-tag';
        tag.textContent = link.tag;
        titleRow.append(tag);
    }
    details.append(titleRow);

    const urls = getSafeLinkUrls(link);
    const addresses = document.createElement('div');
    addresses.className = 'settings-link-addresses';
    urls.forEach((url, index) => {
        const meta = getUrlChoiceMeta(url);
        const address = document.createElement('a');
        address.className = `settings-link-address ${meta.type}`;
        address.href = url.address;
        address.target = '_blank';
        address.rel = 'noopener noreferrer';
        address.title = url.address;
        const icon = document.createElement('i');
        icon.className = meta.icon;
        const text = document.createElement('span');
        text.textContent = urls.length === 1 ? formatUrlForDisplay(url.address) : getUrlDisplayLabel(url, index);
        address.append(icon, text);
        addresses.append(address);
    });
    if (!urls.length) {
        const copy = document.createElement('button');
        copy.className = 'settings-resource-copy';
        copy.type = 'button';
        copy.textContent = link.copyValue || link.remarks || '查看详情';
        copy.title = link.copyValue || link.remarks || link.name;
        copy.setAttribute('aria-label', `复制 ${link.name} 的命令或路径`);
        copy.addEventListener('click', async () => {
            const value = link.copyValue || link.remarks || link.name;
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(value);
                    window.showMessage?.('已复制');
                } else window.prompt('复制内容', value);
            } catch { window.prompt('复制内容', value); }
        });
        addresses.append(copy);
    }
    details.append(addresses);
    info.append(favicon, details);

    const category = document.createElement('select');
    category.className = 'settings-row-category';
    category.setAttribute('aria-label', `移动 ${link.name} 到分组`);
    getAllCategoryNames(getNavigationItems()).forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        category.append(option);
    });
    category.value = link.category || '未分类';
    category.addEventListener('change', () => {
        assignSettingsLinkCategory(link, category.value);
        window.persistLinks?.();
        refreshSettingsLinkViews();
        window.showMessage?.('已移动到「' + category.value + '」');
    });

    const actions = document.createElement('div');
    actions.className = 'link-actions';
    [['edit', 'ri-edit-line', '编辑', () => window.openEditModal(link)],
     ['delete', 'ri-delete-bin-line', '删除', () => deleteSettingsLink(link)]].forEach(([type, icon, label, action]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `link-action-btn ${type}`;
        button.setAttribute('aria-label', `${label} ${link.name}`);
        button.title = label;
        button.innerHTML = `<i class="${icon}" aria-hidden="true"></i>`;
        button.addEventListener('click', action);
        actions.append(button);
    });
    row.append(drag, info, category, actions);
    return row;
}

(() => {
    const message = document.getElementById('message-container');
    message?.addEventListener('click', undoSettingsLinkDelete);
    message?.addEventListener('keydown', event => {
        if (window.__pendingDeletedLink && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            undoSettingsLinkDelete();
        }
    });
})();
