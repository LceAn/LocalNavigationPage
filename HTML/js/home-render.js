/* home-render.js — 首页渲染层（自 main.js 拆出，Phase 2）
 * 链接按分组渲染、视图标签栏、最近使用、卡片构建、多地址下拉。
 * 依赖 storage.js / links-data.js（全局函数调用时解析）。 */
function renderRecentLinks(allLinks) {
    const container = document.getElementById('recent-links');
    if (!container) return;
    if (getSetting('showRecentLinks', true) === false) {
        container.hidden = true;
        return;
    }
    const recent = getRecentLinks();
    if (Object.keys(recent).length === 0) {
        container.hidden = true;
        container.innerHTML = '';
        return;
    }
    const byId = new Map(allLinks.map(l => [String(l.ID), l]));
    const items = Object.entries(recent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id]) => byId.get(id))
        .filter(Boolean);
    if (items.length === 0) {
        container.hidden = true;
        container.innerHTML = '';
        return;
    }
    container.hidden = false;
    container.innerHTML = items.map(link => {
        const firstUrl = getSafeLinkUrls(link)[0];
        const safeUrl = firstUrl?.address || '#';
        const name = escapeHTML(link.name || '未命名');
        const icon = isSafeUrl(link.thumbnail)
            ? `<img class="recent-link-icon" src="${sanitizeUrl(link.thumbnail, '', ['http:', 'https:'])}" alt="" loading="lazy" onerror="this.remove()">`
            : '';
        return `<a class="recent-link" href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer" title="${name}" data-link-id="${link.ID}">${icon}<span>${name}</span></a>`;
    }).join('');

    // 拦截点击：记录最近使用并复用统一的打开逻辑
    container.querySelectorAll('.recent-link').forEach(el => {
        el.addEventListener('click', event => {
            const link = byId.get(String(el.getAttribute('data-link-id')));
            if (!link) return;
            const firstUrl = getSafeLinkUrls(link)[0];
            if (!firstUrl) return;
            event.preventDefault();
            openLinkUrl(link, firstUrl.address);
        });
    });
}

// 渲染链接的函数（按照分类）- 修复版
// 渲染分组视图标签栏（多视图：全部 / 各分组）
function renderViewTabs(allLinks) {
    const tabsEl = document.getElementById('view-tabs');
    if (!tabsEl) return;
    const categories = getAllCategoryNames(allLinks);
    if (categories.length <= 1) {
        // 只有一个或没有分组时不显示标签栏
        tabsEl.hidden = true;
        tabsEl.innerHTML = '';
        return;
    }
    tabsEl.hidden = false;
    const all = ['全部', ...categories];
    tabsEl.innerHTML = all.map(name => {
        const isActive = (name === '全部' && !currentViewCategory) || name === currentViewCategory;
        return `<button type="button" class="view-tab ${isActive ? 'active' : ''}" data-view="${escapeHTML(name)}" aria-pressed="${isActive}">${escapeHTML(name)}</button>`;
    }).join('');
    tabsEl.querySelectorAll('.view-tab').forEach(btn => {
        btn.addEventListener('click', (event) => {
            // 重渲染会替换 #view-tabs 的 DOM，导致本节点脱离文档树，
            // 事件冒泡到 document 时 closest 失效会被误判为"点空白收起"。故阻止冒泡。
            event.stopPropagation();
            const name = btn.dataset.view;
            currentViewCategory = (name === '全部') ? '' : name;
            renderLinksByCategory(links);
        });
    });
}

// 当前视图筛选的分组（空 = 全部）
let currentViewCategory = '';

function renderLinksByCategory(allLinks) {
    const linkContainer = document.getElementById('link-container');
    document.querySelectorAll('.url-dropdown').forEach(dropdown => dropdown.remove());
    closeCategoryPanel(false);
    linkContainer.innerHTML = '';

    // 多视图：按选中的分组过滤（空=全部）
    const links = currentViewCategory
        ? allLinks.filter(l => (l.category || '未分类') === currentViewCategory)
        : allLinks;

    // 同步视图标签栏
    renderViewTabs(allLinks);

    const categories = {};
    links.forEach(link => {
        const category = link.category || '未分类';
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(link);
    });

    for (const category in categories) {
        // 组内链接按名称排序，便于按拼音定位
        categories[category].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
    }

    // 分组按名称排序，与顶部筛选标签栏（getAllCategoryNames）保持同一顺序
    const sortedCategories = Object.entries(categories)
        .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'));

    for (const [category, categoryLinks] of sortedCategories) {
        const categoryContainer = document.createElement('div');
        categoryContainer.className = 'category-container';
        categoryContainer.dataset.category = category;
        categoryContainer.dataset.linkCount = categoryLinks.length;

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';

        const categoryHeaderMain = document.createElement('div');
        categoryHeaderMain.className = 'category-header-main';

        const categoryTitle = document.createElement('h2');
        const categoryIcon = document.createElement('i');
        categoryIcon.className = 'ri-folder-2-line';
        categoryTitle.appendChild(categoryIcon);
        categoryTitle.appendChild(document.createTextNode(` ${category}`));

        // 摘要 chip：链接较多时显示「前 2 个 + +N」帮助预览；链接少（≤2）时
        // 不显示——否则会与下方卡片完全重复（如只有 1 个链接时就是重复显示那个名字）。
        categoryHeaderMain.appendChild(categoryTitle);
        const previewCount = 2;
        if (categoryLinks.length > previewCount) {
            const categoryPreview = document.createElement('div');
            categoryPreview.className = 'category-preview';
            categoryLinks.slice(0, previewCount).forEach(link => {
                const previewChip = document.createElement('span');
                previewChip.className = 'category-preview-chip';
                previewChip.textContent = link.name || '未命名';
                categoryPreview.appendChild(previewChip);
            });
            const moreChip = document.createElement('span');
            moreChip.className = 'category-preview-chip category-preview-more';
            moreChip.textContent = `+${categoryLinks.length - previewCount}`;
            categoryPreview.appendChild(moreChip);
            categoryHeaderMain.appendChild(categoryPreview);
        }

        const categoryHeaderActions = document.createElement('div');
        categoryHeaderActions.className = 'category-header-actions';

        const cardCount = document.createElement('span');
        cardCount.className = 'card-count';
        const cardCountIcon = document.createElement('i');
        cardCountIcon.className = 'ri-links-line';
        cardCount.appendChild(cardCountIcon);
        cardCount.appendChild(document.createTextNode(` ${categoryLinks.length}`));

        const toggleButton = document.createElement('button');
        toggleButton.className = 'toggle-button';
        toggleButton.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
        toggleButton.title = '打开分组';

        categoryHeaderActions.appendChild(cardCount);
        categoryHeaderActions.appendChild(toggleButton);
        categoryHeader.appendChild(categoryHeaderMain);
        categoryHeader.appendChild(categoryHeaderActions);
        categoryContainer.appendChild(categoryHeader);

        const linkList = document.createElement('ul');
        linkList.className = 'link-list';
        // 默认收起，由 CSS 的 collapsed 类控制
        linkList.style.cssText = 'margin: 0; border: none;';
        categoryContainer.appendChild(linkList);

        linkContainer.appendChild(categoryContainer);
    }

    // 空状态：没有任何分组时给出引导，而不是留白
    if (sortedCategories.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'home-empty';
        empty.innerHTML = `
            <i class="ri-compass-3-line"></i>
            <p>暂无链接</p>
            <span>打开右上角「设置 → 链接与分组」添加你的第一个链接</span>
        `;
        linkContainer.appendChild(empty);
    }

    if (getSetting('showThumbnails', true) === false) {
        linkContainer.querySelectorAll('.link-card-thumbnail').forEach(thumbnail => {
            thumbnail.style.display = 'none';
        });
    }

    updateHomeCategorySummary(links);
    applyHomeCategoryDisplayMode();
    
    // 在 DOM 加载完成后初始化展开状态（绑定事件并设置初始状态）
    requestAnimationFrame(() => {
        initCategoryToggles();
    });
}

// 刷新首页所有状态点（探测完成后调用）
function refreshLinkStatusDots() {
    document.querySelectorAll('.link-status-dot').forEach(dot => {
        const url = dot.dataset.probeUrl;
        if (!url) return;
        const status = getCachedStatusForUrl(url);
        dot.classList.remove('status-pending', 'status-online', 'status-offline');
        if (!status) {
            dot.classList.add('status-pending');
            dot.title = '检测中…';
        } else if (status.online) {
            dot.classList.add('status-online');
            dot.title = `在线 · ${status.ms ?? '?'}ms`;
        } else {
            dot.classList.add('status-offline');
            dot.title = '离线或不可达';
        }
    });
}

function createHomeLinkElement(link) {
    const listItem = document.createElement('li');
    const safeUrls = getSafeLinkUrls(link);
    const preferredUrlInfo = getPreferredUrlInfo(link, safeUrls);
    if (safeUrls.length > 1) {
        listItem.classList.add('multi-url-link-item');
    }

    const linkCard = document.createElement('a');
    linkCard.href = preferredUrlInfo.address;
    linkCard.className = 'link-card';
    linkCard.dataset.linkId = link.ID;
    linkCard.setAttribute('role', 'button');
    linkCard.setAttribute('tabindex', '0');
    linkCard.setAttribute('aria-label', `${link.name || '未命名'}，打开${preferredUrlInfo.label || '默认'}地址`);

    const thumbnail = document.createElement('div');
    thumbnail.className = 'link-card-thumbnail';
    const thumbnailUrl = sanitizeUrl(link.thumbnail, '', ['http:', 'https:']);
    // 外部截图服务访问不到内网地址，内网链接的 mshots 缩略图必然加载失败；
    // 直接跳过，省一次注定失败的请求。
    let thumbnailReachable = Boolean(thumbnailUrl);
    if (thumbnailReachable && getUrlChoiceMeta(preferredUrlInfo).type === 'local') {
        try {
            if (new URL(thumbnailUrl, window.location.href).hostname === 's0.wp.com') {
                thumbnailReachable = false;
            }
        } catch {
            thumbnailReachable = false;
        }
    }

    // 首字母方块作底，尝试叠加站点 favicon；favicon 加载失败则保留首字母
    const applyLetterAvatar = () => {
        const statusDot = thumbnail.querySelector('.link-status-dot');
        thumbnail.classList.add('placeholder', 'letter');
        thumbnail.textContent = String(link.name || '?').trim().charAt(0).toUpperCase() || '?';
        try {
            const host = new URL(preferredUrlInfo.address, window.location.href).hostname;
            if (host && host !== window.location.hostname) {
                const fav = document.createElement('img');
                fav.className = 'link-card-favicon';
                fav.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
                fav.alt = '';
                fav.loading = 'lazy';
                fav.decoding = 'async';
                // 加载失败：移除 img，露出底层首字母
                fav.addEventListener('error', () => fav.remove());
                thumbnail.appendChild(fav);
            }
        } catch (_) { /* 地址非法则只用首字母 */ }
        if (statusDot) thumbnail.appendChild(statusDot);
    };

    if (thumbnailReachable) {
        // 用 <img loading="lazy"> 替代 background-image：可被浏览器跳过屏外请求，
        // 并显式声明尺寸以避免加载时布局抖动。
        const img = document.createElement('img');
        img.src = thumbnailUrl;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.width = 48;
        img.height = 48;
        // 缩略图加载失败（服务不可达、离线等）回退首字母，避免裂图
        img.addEventListener('error', () => {
            img.remove();
            applyLetterAvatar();
        });
        thumbnail.appendChild(img);
    } else {
        applyLetterAvatar();
    }
    linkCard.appendChild(thumbnail);

    // 状态监控点：仅当首选 URL 是可探测类型（内网/隧道）时显示
    const probeableUrl = safeUrls.find(isProbingUrl);
    if (probeableUrl) {
        const statusDot = document.createElement('span');
        statusDot.className = 'link-status-dot status-pending';
        statusDot.dataset.probeUrl = getPreferredUrlInfo(link, safeUrls.filter(isProbingUrl)).address;
        statusDot.title = '检测中…';
        thumbnail.appendChild(statusDot);
    }

    const content = document.createElement('div');
    content.className = 'link-card-content';

    const title = document.createElement('div');
    title.className = 'link-card-title';
    title.textContent = link.name || '未命名';
    content.appendChild(title);

    if (safeUrls.length > 1) {
        const subtitle = document.createElement('div');
        subtitle.className = 'link-card-subtitle';
        subtitle.textContent = `最近使用：${preferredUrlInfo.label || '默认'}`;
        content.appendChild(subtitle);
    }

    // 内/外网路径角标：当链接配置了多种网络类型的 URL 时，标注当前走的是哪条路径
    const urlTypes = new Set(safeUrls.map(url => getUrlChoiceMeta(url).type));
    if (urlTypes.size > 1) {
        const preferredMeta = getUrlChoiceMeta(preferredUrlInfo);
        const routeBadge = document.createElement('span');
        routeBadge.className = `link-route-badge route-${preferredMeta.type}`;
        const labels = { local: '内网', tunnel: '隧道', remote: '公网' };
        routeBadge.textContent = labels[preferredMeta.type] || '公网';
        routeBadge.title = `当前访问路径：${labels[preferredMeta.type] || '公网'}（点击切换）`;
        // 点击角标：在可用路径间循环切换，并记住选择
        routeBadge.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const order = ['local', 'tunnel', 'remote'];
            const available = order.filter(t => urlTypes.has(t));
            const curIdx = available.indexOf(preferredMeta.type);
            const nextType = available[(curIdx + 1) % available.length];
            const nextUrl = safeUrls.find(u => getUrlChoiceMeta(u).type === nextType);
            if (nextUrl) {
                rememberLastUsedLinkUrl(link, nextUrl.address);
                // 更新角标显示 + 卡片 href
                const newMeta = getUrlChoiceMeta(nextUrl);
                routeBadge.className = `link-route-badge route-${newMeta.type}`;
                routeBadge.textContent = labels[newMeta.type] || '公网';
                routeBadge.title = `当前访问路径：${labels[newMeta.type] || '公网'}（点击切换）`;
                linkCard.href = nextUrl.address;
            }
        });
        linkCard.appendChild(routeBadge);
    }

    linkCard.appendChild(content);

    if (link.tag) {
        const tag = document.createElement('span');
        tag.className = 'link-card-tag';
        tag.textContent = link.tag;
        linkCard.appendChild(tag);
    }

    if (safeUrls.length > 1) {
        setupMultiUrlDropdown(linkCard, link, safeUrls);
    }

    function openPreferredUrl(event) {
        if (event.target.closest('.link-card-urls, .url-dropdown, button')) {
            return;
        }
        event.preventDefault();
        const currentPreferred = getPreferredUrlInfo(link, getSafeLinkUrls(link));
        openLinkUrl(link, currentPreferred.address);
    }

    linkCard.addEventListener('click', openPreferredUrl);
    linkCard.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            openPreferredUrl(event);
        }
    });

    listItem.appendChild(linkCard);
    return listItem;
}

// 获取链接的 URL 列表（支持新旧格式）
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

// 设置多 URL 快捷切换
function setupMultiUrlDropdown(linkCard, link, safeUrls) {
    if (safeUrls.length <= 1) return;
    linkCard.classList.add('has-multiple-urls');

    const urlsContainer = document.createElement('div');
    urlsContainer.className = 'link-card-urls';
    const visibleUrls = safeUrls.length <= 4 ? safeUrls : safeUrls.slice(0, 3);

    const urlsDropdown = document.createElement('div');
    urlsDropdown.className = 'url-dropdown';
    urlsDropdown.id = `url-dropdown-${link.ID}-${Date.now()}`;
    
    const dropdownHeader = document.createElement('div');
    dropdownHeader.className = 'url-dropdown-header';
    dropdownHeader.innerHTML = `
        <span>选择地址</span>
        <span class="url-count">${safeUrls.length}个</span>
    `;
    urlsDropdown.appendChild(dropdownHeader);

    function updateSelectedUrl(selectedUrl) {
        const currentUrl = selectedUrl || getPreferredUrlInfo(link, safeUrls).address;
        urlsContainer.querySelectorAll('.url-quick-choice').forEach(button => {
            const selected = button.dataset.url === currentUrl;
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
        urlsDropdown.querySelectorAll('.url-dropdown-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.url === currentUrl);
        });
        const subtitle = linkCard.querySelector('.link-card-subtitle');
        const selectedInfo = safeUrls.find(url => url.address === currentUrl);
        if (subtitle && selectedInfo) {
            subtitle.textContent = `最近使用：${selectedInfo.label}`;
        }
    }

    function openChoice(urlObj) {
        rememberLastUsedLinkUrl(link, urlObj.address);
        recordRecentLink(link);
        updateSelectedUrl(urlObj.address);
        openSafeUrl(urlObj.address);
    }

    visibleUrls.forEach((urlObj, index) => {
        const label = getUrlDisplayLabel(urlObj, index);
        const meta = getUrlChoiceMeta(urlObj);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `url-quick-choice ${meta.type}`;
        button.dataset.url = urlObj.address;
        button.title = `${label}：${urlObj.address}`;
        button.innerHTML = `<i class="${meta.icon}"></i><span>${escapeHTML(label)}</span>`;
        button.addEventListener('click', event => {
            event.stopPropagation();
            event.preventDefault();
            openChoice(urlObj);
        });
        urlsContainer.appendChild(button);
    });

    safeUrls.forEach((urlObj, idx) => {
        const urlItem = document.createElement('div');
        urlItem.className = 'url-dropdown-item';
        urlItem.dataset.url = urlObj.address;
        urlItem.dataset.index = idx;
        const label = getUrlDisplayLabel(urlObj, idx);
        const meta = getUrlChoiceMeta(urlObj);
        
        urlItem.innerHTML = `
            <div class="status-wrapper">
                <span class="url-type-icon ${meta.type}"><i class="${meta.icon}"></i></span>
            </div>
            <div class="url-info">
                <div class="url-label">${escapeHTML(label)}</div>
                <div class="url-address">${escapeHTML(urlObj.address)}</div>
            </div>
            <div class="url-meta">
                <span class="priority-badge">优先级${escapeHTML(urlObj.priority || idx + 1)}</span>
                <i class="ri-external-link-line external-link"></i>
            </div>
        `;
        urlsDropdown.appendChild(urlItem);
    });

    let urlsButton = null;
    if (safeUrls.length > visibleUrls.length) {
        urlsButton = document.createElement('button');
        urlsButton.type = 'button';
        urlsButton.className = 'url-overflow-btn';
        urlsButton.innerHTML = `<i class="ri-more-line"></i><span>更多</span>`;
        urlsButton.title = '选择更多地址';
        urlsContainer.appendChild(urlsButton);
    }

    urlsContainer.appendChild(urlsDropdown);
    linkCard.appendChild(urlsContainer);
    
    document.body.appendChild(urlsDropdown);
    
    function showDropdown(e, anchor = urlsButton || urlsContainer) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        
        // 关闭其他所有下拉菜单
        document.querySelectorAll('.url-dropdown.show').forEach(d => {
            if (d !== urlsDropdown) d.classList.remove('show');
        });
        
        const anchorRect = anchor.getBoundingClientRect();
        const dropdownHeight = Math.min(300, 48 + safeUrls.length * 58);
        const hasRoomBelow = anchorRect.bottom + dropdownHeight + 12 < window.innerHeight;
        
        urlsDropdown.style.position = 'fixed';
        urlsDropdown.style.left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 240)) + 'px';
        urlsDropdown.style.top = hasRoomBelow ? `${anchorRect.bottom + 8}px` : 'auto';
        urlsDropdown.style.bottom = hasRoomBelow ? 'auto' : `${window.innerHeight - anchorRect.top + 8}px`;
        urlsDropdown.style.zIndex = '9999';
        
        urlsDropdown.offsetHeight;
        urlsDropdown.classList.add('show');
    }
    
    if (urlsButton) {
        urlsButton.addEventListener('click', event => showDropdown(event, urlsButton));
    }
    
    urlsDropdown.querySelectorAll('.url-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const selectedUrl = safeUrls.find(url => url.address === item.dataset.url);
            if (selectedUrl) {
                openChoice(selectedUrl);
            }
            urlsDropdown.classList.remove('show');
        });
        
        const externalLink = item.querySelector('.external-link');
        if (externalLink) {
            externalLink.addEventListener('click', (e) => {
                e.stopPropagation();
                const selectedUrl = safeUrls.find(url => url.address === item.dataset.url);
                if (selectedUrl) {
                    openChoice(selectedUrl);
                }
                urlsDropdown.classList.remove('show');
            });
        }
    });

    updateSelectedUrl();
}

// ================================
