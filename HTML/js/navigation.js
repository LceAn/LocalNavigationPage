/* 搜索首页与同页快捷抽屉。地址选择沿用 links-data.js。 */
let navigationKind = '';
let navigationQuery = '';
let navigationLayoutAnimations = [];

function transitionNavigationLayout(updateLayout) {
    const elements = [...document.querySelectorAll('.home-header > .page-header, .home-header > .search-container-wrapper, .top-right-buttons')];
    const previous = elements.map(element => element.getBoundingClientRect());
    navigationLayoutAnimations.forEach(animation => animation.cancel());
    navigationLayoutAnimations = [];
    updateLayout();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    elements.forEach((element, index) => {
        const before = previous[index];
        const after = element.getBoundingClientRect();
        if (!before.width || !before.height || !after.width || !after.height || !element.animate) return;
        const animation = element.animate([
            { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})`, transformOrigin: 'top left' },
            { transform: 'none', transformOrigin: 'top left' }
        ], { duration: 520, easing: 'cubic-bezier(.22, 1, .36, 1)' });
        navigationLayoutAnimations.push(animation);
    });
}

function getNavigationItems(sourceLinks = links) {
    const hidden = getSetting('hiddenCatalogKeys', []);
    const overridden = new Set(sourceLinks.map(item => item.catalogKey).filter(Boolean));
    const catalog = (window.catalogEntries || []).filter(item => !hidden.includes(item.catalogKey) && !overridden.has(item.catalogKey));
    const hydrated = sourceLinks.map(item => {
        const original = (window.catalogEntries || []).find(entry => entry.catalogKey && entry.catalogKey === item.catalogKey);
        return original ? { ...original, ...item, catalog: false } : item;
    });
    return [...hydrated, ...catalog];
}

function getNavigationItemKind(item) {
    if (item.kind) return item.kind;
    const hint = [item.catalogKey, item.category].join(' ');
    return /mcp/i.test(hint) ? 'mcp' : /skills?|技能/i.test(hint) ? 'skill' : /ai|智能|大模型|gpt|llm/i.test(hint) ? 'ai' : 'site';
}

function openNavigation(kind = '') {
    navigationKind = kind;
    const drawer = document.getElementById('navigation-view');
    renderLinksByCategory(links);
    transitionNavigationLayout(() => {
        document.querySelector('.home-header').append(document.querySelector('.top-right-buttons'));
        drawer.hidden = false;
        document.body.classList.add('navigation-open');
    });
    document.getElementById('open-navigation').setAttribute('aria-expanded', 'true');
    document.getElementById('open-navigation').setAttribute('aria-label', '收起快捷方式');
    document.getElementById('open-navigation').title = '收起快捷方式';
    window.updateCategoryActionButtonState?.();
    window.refreshNavigationFromServer?.();
    if (typeof probeLinkStatuses === 'function') void probeLinkStatuses(getNavigationItems());
}

function closeNavigation() {
    transitionNavigationLayout(() => {
        document.body.insertBefore(document.querySelector('.top-right-buttons'), document.querySelector('main.container'));
        document.getElementById('navigation-view').hidden = true;
        document.body.classList.remove('navigation-open');
    });
    document.getElementById('open-navigation').setAttribute('aria-expanded', 'false');
    document.getElementById('open-navigation').setAttribute('aria-label', '打开快捷方式');
    document.getElementById('open-navigation').title = '打开快捷方式';
    window.updateCategoryActionButtonState?.();
    if (typeof closeRoutePopover === 'function') closeRoutePopover(false);
    if (document.getElementById('navigation-view').contains(document.activeElement)) {
        document.getElementById('open-navigation').focus({ preventScroll: true });
    }
}

function createCatalogTile(item) {
    if (getSafeLinkUrls(item).length) return createHomeLinkElement(item);
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-card catalog-resource';
    button.title = item.remarks || item.name;
    const icon = document.createElement('div');
    icon.className = 'link-card-thumbnail letter-avatar ' + tileHueClass(item.name);
    icon.textContent = item.name.slice(0, 1).toUpperCase();
    const content = document.createElement('div');
    content.className = 'link-card-content';
    const title = document.createElement('div');
    title.className = 'link-card-title';
    title.textContent = item.name;
    const subtitle = document.createElement('div');
    subtitle.className = 'link-card-subtitle';
    subtitle.textContent = item.enabled === false ? '已停用' : getNavigationItemKind(item) === 'skill' ? '使用指南与能力' : '连接与工具';
    content.append(title, subtitle);
    button.append(icon, content);
    if (['mcp', 'skill'].includes(getNavigationItemKind(item))) {
        button.setAttribute('aria-haspopup', 'dialog');
        button.addEventListener('click', () => openResourceDetails(item, button));
    } else {
        subtitle.textContent = '点击复制';
        button.addEventListener('click', async () => {
            const value = item.copyValue || item.remarks || item.name;
            try { await navigator.clipboard.writeText(value); window.showMessage?.('已复制'); }
            catch { window.prompt('复制内容', value); }
        });
    }
    li.append(button);
    return li;
}

document.addEventListener('DOMContentLoaded', () => {
    const drawer = document.getElementById('navigation-view');
    document.getElementById('open-navigation').addEventListener('click', () => {
        if (drawer.hidden) openNavigation();
        else closeNavigation();
    });
    document.body.append(document.getElementById('link-modal'), document.getElementById('category-modal'));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !event.defaultPrevented && !drawer.hidden && !document.querySelector('.modal-overlay.show, #settings-container.show, .launcher-overlay.show, .route-popover, #resource-detail-dialog[open], #position-dropdown:not([hidden])')) closeNavigation();
    });
    document.getElementById('navigation-search').addEventListener('input', event => {
        navigationQuery = event.target.value.trim().toLowerCase();
        renderLinksByCategory(links);
    });
    document.getElementById('network-mode').value = getSetting('networkMode', 'auto');
    document.getElementById('network-mode').addEventListener('change', event => {
        setSetting('networkMode', event.target.value);
        // 环境变化后重新选路，避免旧地址记忆把公司 LAN 带到家里。
        setSetting(LAST_USED_LINK_URLS_KEY, {});
        renderLinksByCategory(links);
        renderRecentLinks(links);
    });
    document.querySelector('.skip-link').addEventListener('click', event => {
        event.preventDefault();
        openNavigation();
    });
});
