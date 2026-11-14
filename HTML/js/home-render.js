/* home-render.js — 首页渲染层（自 main.js 拆出，Phase 2）
 * 链接按分组渲染、视图标签栏、最近使用、卡片构建、多地址下拉。
 * 依赖 storage.js / links-data.js（全局函数调用时解析）。 */
// 分类图标:按名称关键词推断,未命中回退文件夹
const CATEGORY_ICON_RULES = [
  [/系统|管理|运维|监控/, 'ri-server-line'],
  [/媒体|电影|音乐|视频|影音/, 'ri-film-line'],
  [/下载|种子|bt/i, 'ri-download-cloud-2-line'],
  [/ai|智能|大模型|gpt|llm/i, 'ri-robot-2-line'],
  [/网络|路由|交换|设备/, 'ri-router-line'],
  [/云|cloud|存储|nas/i, 'ri-cloud-line'],
  [/自动|工作流|流程|workflow/i, 'ri-flow-chart'],
  [/常用|常用网站|收藏/, 'ri-star-smile-line'],
  [/开发|工具|编程|代码/, 'ri-code-s-slash-line'],
  [/文档|知识|笔记|wiki/i, 'ri-book-2-line'],
  [/面板|管理页|入口/, 'ri-dashboard-3-line'],
  [/测试/, 'ri-flask-line'],
];
function categoryIconFor(name) {
  const n = String(name || '');
  for (const [re, icon] of CATEGORY_ICON_RULES) {
    if (re.test(n)) return icon;
  }
  return 'ri-folder-2-line';
}

// 磁贴着色:按名称哈希取一组和谐色相,避免满屏同色
const TILE_HUES = [268, 212, 160, 25, 340, 292, 180, 45];
function tileHueClass(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return 'tile-hue-' + TILE_HUES[h % TILE_HUES.length];
}

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
        const firstUrl = getPreferredUrlInfo(link);
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
            const firstUrl = getPreferredUrlInfo(link);
            if (!firstUrl) return;
            event.preventDefault();
            openLinkUrl(link, firstUrl.address);
        });
    });
}

// 统一入口类型筛选，分组在设置中管理。
function renderViewTabs() {
    const tabs = document.getElementById('view-tabs');
    const kinds = [['', '全部'], ['site', '网站与服务'], ['ai', 'AI'], ['mcp', 'MCP'], ['skill', 'Skills']];
    tabs.hidden = false;
    tabs.innerHTML = kinds.map(([kind, label]) => `<button type="button" class="view-tab ${navigationKind === kind ? 'active' : ''}" data-kind="${kind}" aria-pressed="${navigationKind === kind}">${label}</button>`).join('');
    tabs.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
        navigationKind = button.dataset.kind;
        renderLinksByCategory(links);
    }));
}

let currentViewType = '';

function renderLinksByCategory(allLinks) {
    const container = document.getElementById('link-container');
    if (!container) return;
    closeRoutePopover(false);
    const all = getNavigationItems();
    const filtered = all.filter(item => {
        if (navigationKind && getNavigationItemKind(item) !== navigationKind) return false;
        const text = [item.name, item.category, item.tag, item.remarks, ...getSafeLinkUrls(item).map(url => url.address)].join(' ').toLowerCase();
        return navigationQuery.split(/\s+/).filter(Boolean).every(term => text.includes(term));
    });
    renderViewTabs();
    const list = document.createElement('ul');
    list.className = 'link-list navigation-grid';
    filtered.forEach(item => {
        const tile = getSafeLinkUrls(item).length ? createHomeLinkElement(item) : createCatalogTile(item);
        list.appendChild(tile);
    });
    container.replaceChildren(list);
    if (getSetting('showThumbnails', true) === false) {
        container.querySelectorAll('.link-card-thumbnail').forEach(thumbnail => { thumbnail.style.display = 'none'; });
    }
    if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'home-empty';
        empty.textContent = all.length ? '没有匹配的入口，试试其他关键词或类型' : '在设置中添加你的第一个快捷方式';
        container.append(empty);
    }
    applyHomeCategoryDisplayMode();
    refreshLinkStatusDots();
}

// 每个状态点绑定自己的 URL，检测结果同步到气泡与默认地址菜单。
function refreshLinkStatusDots() {
    document.querySelectorAll('.url-state[data-probe-url]').forEach(dot => {
        const status = getUrlProbeState(dot.dataset.probeUrl);
        dot.dataset.state = status.state;
        dot.title = status.text;
        const text = dot.parentElement.querySelector('.route-status-text');
        if (text) text.textContent = status.text;
        const chip = dot.closest('.route-chip');
        if (chip) {
            const label = chip.dataset.routeLabel;
            const suffix = chip.classList.contains('is-default') ? '，默认访问' : '';
            chip.title = `${label} · ${status.text}\n${chip.href}`;
            chip.setAttribute('aria-label', `${chip.dataset.linkName}，${label}，${status.text}${suffix}，点击打开`);
        }
    });
}

// 更新现有卡片的默认线路，保留当前焦点和已打开的地址菜单。
function refreshAutomaticRoutes() {
    const entries = new Map(getNavigationItems().map(item => [String(item.ID), item]));
    document.querySelectorAll('.navigation-grid .shortcut-item[data-link-id]').forEach(card => {
        const link = entries.get(card.dataset.linkId);
        if (!link) return;
        const preferred = getPreferredUrlInfo(link);
        const main = card.querySelector('.link-card');
        main.href = preferred.address;
        main.title = [link.remarks, link.name, preferred.address].filter(Boolean).join('\n');
        if (!['mcp', 'skill'].includes(getNavigationItemKind(link))) {
            main.setAttribute('aria-label', `${link.name}，默认访问 ${getRouteChipLabel(preferred, getSafeLinkUrls(link))}`);
        }
        card.querySelectorAll('.route-chip').forEach(chip => {
            const selected = chip.getAttribute('href') === preferred.address;
            chip.classList.toggle('is-default', selected);
            const star = chip.querySelector('.ri-star-fill');
            if (!selected) star?.remove();
            else if (!star && getSafeLinkUrls(link).length > 1) {
                const icon = document.createElement('i');
                icon.className = 'ri-star-fill';
                icon.setAttribute('aria-hidden', 'true');
                chip.append(icon);
            }
        });
    });
    refreshLinkStatusDots();
}

function createUrlStatusIndicator(address) {
    const dot = document.createElement('span');
    dot.className = 'url-state';
    dot.dataset.probeUrl = address;
    dot.setAttribute('aria-hidden', 'true');
    return dot;
}

function getRouteChipLabel(url, safeUrls) {
    const type = getUrlChoiceMeta(url).type;
    const parsed = new URL(url.address, window.location.href);
    const protocol = parsed.protocol;
    const host = parsed.hostname;
    const tunnelName = isTunnelHost(host) || /tailscale/i.test(url.label || '') ? 'Tailscale' : '内网穿透';
    const name = { 'file:': '本地文件', 'mailto:': '邮件', 'tel:': '电话', 'ftp:': 'FTP' }[protocol] || { local: '局域网', tunnel: tunnelName, remote: '公网' }[type];
    const peers = safeUrls.filter(item => getUrlChoiceMeta(item).type === type);
    return peers.length > 1 ? `${name} · ${url.label || peers.indexOf(url) + 1}` : name;
}

function createHomeLinkElement(link, preferredType = '') {
    const listItem = document.createElement('li');
    listItem.className = 'shortcut-item';
    listItem.draggable = true;
    listItem.dataset.linkId = link.ID;
    const safeUrls = getSafeLinkUrls(link);
    let preferredUrlInfo = safeUrls.find(url => preferredType && getUrlChoiceMeta(url).type === preferredType) || getPreferredUrlInfo(link, safeUrls);
    const preferredMeta = getUrlChoiceMeta(preferredUrlInfo);
    const shell = document.createElement('div');
    shell.className = 'shortcut-card';
    const linkCard = document.createElement('a');
    linkCard.href = preferredUrlInfo.address;
    linkCard.className = 'link-card';
    linkCard.dataset.linkId = link.ID;
    linkCard.setAttribute('aria-label', `${link.name}，默认访问 ${getRouteChipLabel(preferredUrlInfo, safeUrls)}`);
    linkCard.title = [link.remarks, link.name, preferredUrlInfo.address].filter(Boolean).join('\n');
    const thumbnail = document.createElement('div');
    thumbnail.className = 'link-card-thumbnail';
    const thumbnailUrl = sanitizeUrl(link.thumbnail, '', ['http:', 'https:']);
    // 外部截图服务访问不到内网/隧道地址，mshots 缩略图必然加载失败；直接跳过
    let thumbnailReachable = Boolean(thumbnailUrl);
    if (thumbnailReachable && preferredMeta.type !== 'remote') {
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
        thumbnail.classList.add('placeholder', 'letter', tileHueClass(link.name));
        thumbnail.textContent = String(link.name || '?').trim().charAt(0).toUpperCase() || '?';
        try {
            const host = new URL(preferredUrlInfo.address, window.location.href).hostname;
            // 内网/隧道主机名不发给第三方 favicon 服务：既取不到，也白白泄露内网拓扑
            if (host && host !== window.location.hostname && preferredMeta.type === 'remote') {
                const fav = document.createElement('img');
                fav.className = 'link-card-favicon';
                const provider = getSetting('faviconProvider', 'google');
                fav.src = provider === 'duckduckgo'
                    ? `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`
                    : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
                fav.alt = '';
                fav.loading = 'lazy';
                fav.decoding = 'async';
                // 加载失败：移除 img，露出底层首字母
                fav.addEventListener('error', () => fav.remove());
                thumbnail.appendChild(fav);
            }
        } catch (_) { /* 地址非法则只用首字母 */ }
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


    const content = document.createElement('div');
    content.className = 'link-card-content';
    const title = document.createElement('div');
    title.className = 'link-card-title';
    title.textContent = link.name || '未命名';
    content.append(title);
    linkCard.append(thumbnail, content);

    function openPreferredUrl(event) {
        preferredUrlInfo = safeUrls.find(url => preferredType && getUrlChoiceMeta(url).type === preferredType) || getPreferredUrlInfo(link, safeUrls);
        if (['mcp', 'skill'].includes(getNavigationItemKind(link))) {
            event.preventDefault();
            openResourceDetails(link, linkCard);
            return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        if (event.shiftKey) {
            const opened = window.open(preferredUrlInfo.address, '_blank', 'noopener,width=1100,height=780');
            if (opened) recordRecentLink(link);
            return;
        }
        openLinkUrl(link, preferredUrlInfo.address);
    }
    linkCard.addEventListener('click', openPreferredUrl);
    if (['mcp', 'skill'].includes(getNavigationItemKind(link))) {
        linkCard.setAttribute('aria-haspopup', 'dialog');
        linkCard.setAttribute('aria-label', `${link.name}，查看${getNavigationItemKind(link) === 'mcp' ? '连接与工具' : '使用指南与能力'}`);
    }
    linkCard.addEventListener('keydown', event => {
        if (event.key === ' ') openPreferredUrl(event);
    });
    shell.append(linkCard);

    if (safeUrls.length) {
        shell.classList.add('has-route-options');
        const options = document.createElement('button');
        options.type = 'button';
        options.className = 'route-settings-button';
        options.dataset.linkId = link.ID;
        options.title = '默认访问与状态';
        options.setAttribute('aria-label', `${link.name} 的默认访问地址`);
        options.setAttribute('aria-expanded', 'false');
        options.setAttribute('aria-controls', 'route-popover');
        options.innerHTML = '<i class="ri-more-line" aria-hidden="true"></i>';
        options.addEventListener('click', event => {
            event.stopPropagation();
            openRoutePopover(link, options);
        });
        shell.append(options);
    }

    const routes = document.createElement('div');
    routes.className = 'route-chips';
    routes.setAttribute('aria-label', `${link.name} 的访问地址`);
    safeUrls.forEach(url => {
        const chip = document.createElement('a');
        chip.className = 'route-chip route-' + getUrlChoiceMeta(url).type;
        chip.href = url.address;
        chip.target = '_blank';
        chip.rel = 'noopener noreferrer';
        chip.dataset.routeLabel = getRouteChipLabel(url, safeUrls);
        chip.dataset.linkName = link.name;
        const isDefault = url.address === preferredUrlInfo.address;
        chip.classList.toggle('is-default', isDefault);
        const text = document.createElement('span');
        text.className = 'route-chip-label';
        text.textContent = chip.dataset.routeLabel;
        chip.append(createUrlStatusIndicator(url.address), text);
        if (isDefault && safeUrls.length > 1) {
            const star = document.createElement('i');
            star.className = 'ri-star-fill';
            star.setAttribute('aria-hidden', 'true');
            chip.append(star);
        }
        chip.addEventListener('click', () => {
            recordRecentLink(link);
            recordVisitCount(link.ID);
        });
        routes.append(chip);
    });
    shell.append(routes);
    listItem.append(shell);
    return listItem;
}

let routePopover = null;
let routePopoverAnchor = null;

function closeRoutePopover(restoreFocus = true) {
    const anchor = routePopoverAnchor;
    routePopover?.remove();
    routePopover = null;
    routePopoverAnchor = null;
    anchor?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
}

function openRoutePopover(link, anchor) {
    if (routePopoverAnchor === anchor) {
        closeRoutePopover();
        return;
    }
    closeRoutePopover(false);
    const safeUrls = getSafeLinkUrls(link);
    const pinned = getPinnedLinkUrl(link, safeUrls);
    routePopoverAnchor = anchor;
    routePopover = document.createElement('section');
    routePopover.id = 'route-popover';
    routePopover.className = 'route-popover';
    routePopover.setAttribute('role', 'dialog');
    routePopover.setAttribute('aria-label', `${link.name} 的默认访问地址`);
    const heading = document.createElement('header');
    heading.className = 'route-popover-heading';
    const headingText = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = '默认访问';
    const context = document.createElement('small');
    context.textContent = `${link.name} · 当前设备`;
    headingText.append(title, context);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'icon-button';
    close.setAttribute('aria-label', '关闭默认地址菜单');
    close.innerHTML = '<i class="ri-close-line" aria-hidden="true"></i>';
    close.addEventListener('click', () => closeRoutePopover());
    heading.append(headingText, close);
    const choices = document.createElement('div');
    choices.className = 'route-default-choices';
    choices.setAttribute('role', 'radiogroup');
    choices.setAttribute('aria-label', '默认访问地址');

    function addChoice(url) {
        const selected = url ? pinned === url.address : !pinned;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'route-default-choice';
        button.dataset.defaultUrl = url?.address || '';
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', String(selected));
        const info = document.createElement('div');
        info.className = 'route-choice-info';
        const name = document.createElement('span');
        const routeLabel = url ? getRouteChipLabel(url, safeUrls) : '';
        name.textContent = url ? routeLabel + (url.label && !routeLabel.includes(url.label) ? ' · ' + url.label : '') : '跟随全局线路';
        const address = document.createElement('small');
        address.textContent = url?.address || ({ auto: '自动选择', local: '局域网优先', tunnel: '内网穿透优先', remote: '公网优先' }[getSetting('networkMode', 'auto')]);
        const titleRow = document.createElement('div');
        titleRow.className = 'route-choice-top';
        titleRow.append(name);
        info.append(titleRow, address);
        const check = document.createElement('i');
        check.className = selected ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line';
        check.setAttribute('aria-hidden', 'true');
        button.append(info, check);
        if (url) {
            const status = document.createElement('div');
            status.className = 'route-choice-status';
            const text = document.createElement('span');
            text.className = 'route-status-text';
            status.append(createUrlStatusIndicator(url.address), text);
            titleRow.append(status);
        }
        button.addEventListener('click', () => {
            setDefaultLinkUrl(link, url?.address || '');
            closeRoutePopover(false);
            renderLinksByCategory(links);
            renderRecentLinks(links);
            [...document.querySelectorAll('.route-settings-button')].find(button => button.dataset.linkId === String(link.ID))?.focus({ preventScroll: true });
            window.showMessage?.(url ? '已设置此设备的默认地址' : '已跟随全局线路');
        });
        choices.append(button);
    }
    addChoice(null);
    safeUrls.forEach(addChoice);
    choices.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...choices.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement);
        const next = (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
        buttons[next].focus();
    });
    const footer = document.createElement('footer');
    footer.className = 'route-popover-footer';
    const scope = document.createElement('span');
    scope.textContent = '从当前浏览器检测';
    const recheck = document.createElement('button');
    recheck.type = 'button';
    recheck.textContent = getProbeIntervalMs() ? '重新检测' : '探测已关闭';
    recheck.disabled = getProbeIntervalMs() === 0;
    recheck.addEventListener('click', async () => {
        recheck.disabled = true;
        recheck.textContent = '检测中';
        try { await probeLinkStatuses([link]); }
        finally {
            recheck.disabled = getProbeIntervalMs() === 0;
            recheck.textContent = getProbeIntervalMs() ? '重新检测' : '探测已关闭';
        }
    });
    footer.append(scope, recheck);
    routePopover.append(heading, choices, footer);
    document.body.append(routePopover);
    refreshLinkStatusDots();
    const bounds = anchor.getBoundingClientRect();
    const popup = routePopover.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    let left = Math.max(12, Math.min(bounds.right - popup.width, viewportWidth - popup.width - 12));
    let top = bounds.bottom + 8;
    if (top + popup.height > viewportHeight - 12) {
        if (bounds.top - popup.height - 8 >= 12) top = bounds.top - popup.height - 8;
        else {
            top = Math.max(12, Math.min(bounds.top, viewportHeight - popup.height - 12));
            if (bounds.right + popup.width + 8 <= viewportWidth - 12) left = bounds.right + 8;
            else if (bounds.left - popup.width - 8 >= 12) left = bounds.left - popup.width - 8;
        }
    }
    routePopover.style.left = left + 'px';
    routePopover.style.top = top + 'px';
    anchor.setAttribute('aria-expanded', 'true');
    choices.querySelector('[aria-checked="true"]').focus({ preventScroll: true });
}

document.addEventListener('click', event => {
    if (routePopover && !routePopover.contains(event.target) && !routePopoverAnchor.contains(event.target)) closeRoutePopover(false);
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && routePopover) {
        event.preventDefault();
        closeRoutePopover();
    }
});
document.addEventListener('focusin', event => {
    if (routePopover && !routePopover.contains(event.target) && event.target !== routePopoverAnchor) closeRoutePopover(false);
});
window.addEventListener('resize', () => closeRoutePopover(false));
window.addEventListener('scroll', event => {
    if (routePopover && !routePopover.contains(event.target)) closeRoutePopover(false);
}, { capture: true, passive: true });

// ================================

// 展开分组内方向键在磁贴间导航(左右换位、上下换行、Enter 打开)
document.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    const cards = [...document.querySelectorAll('.navigation-grid .link-card')];
    if (!cards.length) return;
    const current = document.activeElement?.classList?.contains('link-card')
        ? document.activeElement
        : null;

    // Enter:打开当前聚焦的磁贴
    if (event.key === 'Enter') {
        if (current) {
            event.preventDefault();
            current.click();
        }
        return;
    }

    if (!current) return;
    event.preventDefault();
    const grid = current.closest('.navigation-grid');
    const item = current.closest('li');
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
    const columns = Math.max(1, Math.round((grid.clientWidth + gap) / (item.offsetWidth + gap)));
    const idx = cards.indexOf(current);
    let next = idx;
    if (event.key === 'Home') { next = 0; }
    if (event.key === 'End') { next = cards.length - 1; }
    if (event.key === 'ArrowRight') next = idx + 1;
    if (event.key === 'ArrowLeft') next = idx - 1;
    if (event.key === 'ArrowDown') next = idx + columns;
    if (event.key === 'ArrowUp') next = idx - columns;
    next = Math.max(0, Math.min(cards.length - 1, next));
    cards[next]?.focus();
});


// ============ 磁贴右键上下文菜单 ============
// 动作:复制地址 / 小窗打开 / 在设置中编辑;多地址链接列出每个地址直达
(() => {
    let menu = null;

    function ensureMenu() {
        if (menu) return menu;
        menu = document.createElement('div');
        menu.id = 'link-context-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;
        document.getElementById('navigation-view').appendChild(menu);
        // 点击其他位置/Escape 关闭
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) hide();
        });
        let ctxSelected = -1;
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { hide(); return; }
            if (menu.hidden || menu.querySelectorAll('.ctx-menu-item').length === 0) return;
            const items = [...menu.querySelectorAll('.ctx-menu-item')];
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                ctxSelected = (ctxSelected + 1) % items.length; // 循环
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                ctxSelected = (ctxSelected - 1 + items.length) % items.length; // 循环
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (ctxSelected >= 0 && items[ctxSelected]) items[ctxSelected].click();
                return;
            } else return;
            items.forEach((it, i) => it.classList.toggle('selected', i === ctxSelected));
            items[ctxSelected]?.scrollIntoView({ block: 'nearest' });
        });
        window.addEventListener('blur', hide);
        return menu;
    }

    function hide() {
        if (menu) {
            menu.hidden = true;
            menu.innerHTML = '';
        }
    }

    function item(label, icon, action) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ctx-menu-item';
        b.setAttribute('role', 'menuitem');
        b.innerHTML = '<i class="' + icon + '"></i>' + label;
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            hide();
            action();
        });
        return b;
    }

    function separator() {
        const s = document.createElement('div');
        s.className = 'ctx-menu-sep';
        return s;
    }

    document.addEventListener('contextmenu', (e) => {
        const card = e.target.closest('.link-card');
        if (!card) return;
        e.preventDefault();
        const linkId = card.dataset.linkId;
        const link = getNavigationItems().find(item => String(item.ID) === linkId);
        if (!link) return;
        const safeUrls = getSafeLinkUrls(link);
        const preferred = getPreferredUrlInfo(link, safeUrls);
        const m = ensureMenu();
        m.innerHTML = '';
        m.appendChild(item('打开「' + (link.name || '未命名') + '」', 'ri-external-link-line', () => openLinkUrl(link, preferred.address)));
        m.appendChild(item('小窗打开', 'ri-picture-in-picture-line', () => {
            window.open(preferred.address, '_blank', 'noopener,width=1100,height=780');
            recordRecentLink(link);
            rememberLastUsedLinkUrl(link, preferred.address);
        }));
        m.appendChild(item('复制名称', 'ri-text', () => {
            navigator.clipboard?.writeText(link.name || '')
                .then(() => window.showMessage?.('名称已复制', 'success'))
                .catch(() => window.showMessage?.('复制失败', 'error'));
        }));
        m.appendChild(item('复制地址', 'ri-file-copy-line', () => {
            navigator.clipboard?.writeText(preferred.address)
                .then(() => window.showMessage?.('地址已复制', 'success'))
                .catch(() => window.showMessage?.('复制失败', 'error'));
        }));
        if (safeUrls.length > 1) {
            m.appendChild(separator());
            safeUrls.forEach(u => {
                const meta = getUrlChoiceMeta(u);
                const label = { local: '内网', tunnel: '隧道', remote: '公网' }[meta.type] || '公网';
                m.appendChild(item('直达' + label + '：' + (u.label || u.address), meta.icon, () => openLinkUrl(link, u.address, { direct: true })));
            });
        }
        m.appendChild(separator());
        m.appendChild(item('在设置中编辑', 'ri-edit-line', () => {
            closeNavigation();
            window.openSettingsPanel?.();
            setTimeout(() => window.openEditModal?.(link), 150);
        }));

        // 定位:光标处,防溢出
        m.hidden = false;
        const mw = m.offsetWidth || 220, mh = m.offsetHeight || 160;
        m.style.left = Math.min(e.clientX, window.innerWidth - mw - 8) + 'px';
        m.style.top = Math.min(e.clientY, window.innerHeight - mh - 8) + 'px';
    });
})();
