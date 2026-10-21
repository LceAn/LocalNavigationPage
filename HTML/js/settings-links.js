/* settings-links.js — 设置面板链接列表（自 main.js 拆出，Phase 2）
 * 设置内链接的筛选、分组渲染、拖拽排序、条目构建。 */
function getLinksFilterState() {
    return {
        searchTerm: document.getElementById('links-search')?.value.trim().toLowerCase() || '',
        category: document.getElementById('category-filter')?.value || ''
    };
}

function getLinkSearchText(link) {
    const urls = getLinkUrls(link);
    return [
        link.name,
        link.category,
        link.tag,
        ...urls.flatMap(url => [url.address, url.label])
    ].filter(Boolean).join(' ').toLowerCase();
}

function linkMatchesSettingsFilters(link, filters) {
    const matchesCategory = !filters.category || (link.category || '未分类') === filters.category;
    const matchesSearch = !filters.searchTerm || getLinkSearchText(link).includes(filters.searchTerm);
    return matchesCategory && matchesSearch;
}

function formatUrlForDisplay(url) {
    try {
        const parsed = new URL(url, window.location.href);
        const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
        return `${parsed.hostname}${path}`;
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
        emptyTitle.textContent = hasLinks ? '没有匹配的链接' : '暂无链接';
    }
    if (emptyDescription) {
        emptyDescription.textContent = hasLinks
            ? '换个关键词或切换分组试试'
            : '点击“添加链接”开始管理您的导航';
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
        ? `显示全部 ${totalCount} 个链接`
        : `找到 ${filteredCount} / ${totalCount} 个链接`;
}

// 渲染链接到设置界面
function renderLinksInSettings(sourceLinks) {
    const existingLinksList = document.getElementById('existing-links');
    const linksEmpty = document.getElementById('links-empty');
    const clearLinksSearch = document.getElementById('clear-links-search');

    if (!existingLinksList) return;

    existingLinksList.innerHTML = '';

    const allLinks = Array.isArray(sourceLinks) ? sourceLinks : [];

    // 更新分类筛选下拉框
    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
        const selectedCategory = categoryFilter.value;
        const categoryNames = getAllCategoryNames(allLinks);
        categoryFilter.innerHTML = '<option value="">全部分组</option>';
        categoryNames.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
        categoryFilter.value = categoryNames.includes(selectedCategory) ? selectedCategory : '';
    }

    const filters = getLinksFilterState();
    const filteredLinks = allLinks.filter(link => linkMatchesSettingsFilters(link, filters));
    if (clearLinksSearch) {
        clearLinksSearch.classList.toggle('visible', Boolean(filters.searchTerm));
    }
    updateLinksResultCount(filteredLinks.length, allLinks.length);
    updateLinksEmptyState(linksEmpty, allLinks.length > 0, filteredLinks.length > 0);
    existingLinksList.style.display = filteredLinks.length > 0 ? 'flex' : 'none';

    const categories = {};
    filteredLinks.forEach(link => {
        const category = link.category || '未分类';
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(link);
    });

    Object.keys(categories)
        .sort((a, b) => a.localeCompare(b, 'zh-CN'))
        .forEach(category => {
            const group = document.createElement('section');
            group.className = 'settings-link-group';

            const groupHeader = document.createElement('div');
            groupHeader.className = 'settings-link-group-header';

            const groupTitle = document.createElement('h4');
            const groupIcon = document.createElement('i');
            groupIcon.className = 'ri-folder-2-line';
            groupTitle.appendChild(groupIcon);
            groupTitle.appendChild(document.createTextNode(category));

            const groupCount = document.createElement('span');
            groupCount.textContent = `${categories[category].length} 个`;

            groupHeader.appendChild(groupTitle);
            groupHeader.appendChild(groupCount);
            group.appendChild(groupHeader);

            const groupList = document.createElement('div');
            groupList.className = 'settings-link-group-list';

            categories[category].forEach(link => {
                const linkItem = createLinkItem(link);
                linkItem.dataset.linkId = link.ID;
                linkItem.dataset.category = category;
                groupList.appendChild(linkItem);
            });

            group.appendChild(groupList);
            existingLinksList.appendChild(group);
        });

    bindLinkListDrag();
}

// 绑定设置链接列表的拖拽排序（在分组内重排 links 数组顺序）
function bindLinkListDrag() {
    const list = document.getElementById('existing-links');
    if (!list) return;
    let draggingId = null;

    list.querySelectorAll('.settings-link-item').forEach(item => {
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

// 创建链接列表项
function createLinkItem(link) {
    const linkItem = document.createElement('div');
    linkItem.className = 'settings-link-item';
    linkItem.setAttribute('role', 'button');
    linkItem.setAttribute('tabindex', '0');
    linkItem.setAttribute('aria-label', `编辑 ${link.name || '链接'}`);
    linkItem.setAttribute('draggable', 'true');
    linkItem.dataset.linkId = String(link.ID);

    // 拖拽手柄
    const dragHandle = document.createElement('div');
    dragHandle.className = 'link-drag-handle';
    dragHandle.setAttribute('aria-hidden', 'true');
    dragHandle.innerHTML = '<i class="ri-draggable"></i>';
    linkItem.appendChild(dragHandle);

    const linkInfo = document.createElement('div');
    linkInfo.className = 'link-info';

    const favicon = document.createElement('div');
    favicon.className = 'link-favicon';
    const safeThumbnail = sanitizeUrl(link.thumbnail, '', ['http:', 'https:']);
    if (safeThumbnail && getSetting('showThumbnails', true) !== false) {
        favicon.classList.add('has-image');
        favicon.style.backgroundImage = `url("${safeThumbnail}")`;
    } else {
        favicon.textContent = String(link.name || '?').trim().charAt(0).toUpperCase() || '?';
    }

    const linkDetails = document.createElement('div');
    linkDetails.className = 'link-details';

    const linkName = document.createElement('h4');
    linkName.textContent = link.name;

    // 获取 URL 列表（支持多 URL）
    const urls = getSafeLinkUrls(link);
    const mainUrl = sanitizeUrl(urls[0]?.address || link.url || '#');
    
    const linkUrl = document.createElement('a');
    linkUrl.href = mainUrl;
    linkUrl.target = '_blank';
    linkUrl.rel = 'noopener noreferrer';
    linkUrl.textContent = formatUrlForDisplay(mainUrl);
    linkUrl.title = mainUrl;
    linkUrl.addEventListener('click', (e) => e.stopPropagation());

    const linkMeta = document.createElement('div');
    linkMeta.className = 'link-meta-row';

    [
        { type: 'category', icon: 'ri-folder-line', text: link.category || '未分类' },
        link.tag ? { type: 'tag', icon: 'ri-price-tag-3-line', text: link.tag } : null,
        urls.length > 1 ? { type: 'count', icon: 'ri-links-line', text: `${urls.length} 个地址` } : null
    ].filter(Boolean).forEach(item => {
        const chip = document.createElement('span');
        chip.className = `link-meta-chip ${item.type}`;
        const icon = document.createElement('i');
        icon.className = item.icon;
        chip.appendChild(icon);
        chip.appendChild(document.createTextNode(item.text));
        linkMeta.appendChild(chip);
    });

    linkDetails.appendChild(linkName);
    linkDetails.appendChild(linkUrl);
    linkDetails.appendChild(linkMeta);

    if (urls.length > 1) {
        const urlChips = document.createElement('div');
        urlChips.className = 'settings-url-chips';
        urls.slice(0, 3).forEach((urlObj, index) => {
            const meta = getUrlChoiceMeta(urlObj);
            const chip = document.createElement('span');
            chip.className = `settings-url-chip ${meta.type}`;
            chip.title = urlObj.address;
            const icon = document.createElement('i');
            icon.className = meta.icon;
            const text = document.createElement('span');
            text.textContent = getUrlDisplayLabel(urlObj, index);
            chip.appendChild(icon);
            chip.appendChild(text);
            urlChips.appendChild(chip);
        });
        if (urls.length > 3) {
            const moreChip = document.createElement('span');
            moreChip.className = 'settings-url-chip more';
            moreChip.textContent = `+${urls.length - 3}`;
            urlChips.appendChild(moreChip);
        }
        linkDetails.appendChild(urlChips);
    }

    linkInfo.appendChild(favicon);
    linkInfo.appendChild(linkDetails);
    linkItem.appendChild(linkInfo);

    const linkActions = document.createElement('div');
    linkActions.className = 'link-actions';

    function createActionButton(type, iconClass, title) {
        const button = document.createElement('button');
        button.className = `link-action-btn ${type}`;
        button.innerHTML = `<i class="${iconClass}"></i>`;
        button.title = title;
        button.type = 'button';
        return button;
    }

    const openButton = createActionButton('open', 'ri-external-link-line', '打开');
    openButton.addEventListener('click', (e) => {
        e.stopPropagation();
        openSafeUrl(mainUrl);
    });

    const editButton = createActionButton('edit', 'ri-edit-line', '编辑');
    editButton.addEventListener('click', (e) => {
        e.stopPropagation();
        // 设置编辑状态并打开弹窗
        window.editingLinkId = link.ID;
        openEditModal(link);
    });

    const deleteButton = createActionButton('delete', 'ri-delete-bin-line', '删除');
    deleteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`确定要删除 "${link.name}" 吗？`)) {
            const index = links.findIndex(l => l.ID === link.ID);
            if (index !== -1) {
                links.splice(index, 1);
                window.persistLinks?.();
                renderLinksByCategory(links);
                renderLinksInSettingsIfVisible(links);
                window.updateCategoryDatalist?.();
                window.updateStorageInfo?.();
                window.showMessage?.('已删除链接');
            }
        }
    });

    linkItem.addEventListener('click', () => {
        window.editingLinkId = link.ID;
        openEditModal(link);
    });
    linkItem.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            window.editingLinkId = link.ID;
            openEditModal(link);
        }
    });

    linkActions.appendChild(openButton);
    linkActions.appendChild(editButton);
    linkActions.appendChild(deleteButton);
    linkItem.appendChild(linkActions);

    return linkItem;
}

