/* launcher.js — 键盘启动器（自 main.js 拆出，Phase 3）
 * Ctrl/Cmd+K 唤起；名称/分组/标签/地址多关键词匹配，最近使用优先。
 * defer 脚本执行时 DOM 已解析完成，可直接顶层绑定。
 * 依赖 links-data.js 的全局函数。 */
// ============ 键盘启动器（P1-3）============
const launcherEl = document.getElementById('launcher');
const launcherInput = document.getElementById('launcher-input');
const launcherResults = document.getElementById('launcher-results');
let launcherItems = [];      // 当前结果集（{link, preferredUrl, el}）
let launcherSelected = -1;   // 当前选中索引

function openLauncher() {
    if (!launcherEl) return;
    launcherEl.hidden = false;
    requestAnimationFrame(() => {
        launcherEl.classList.add('show');
        launcherInput.value = '';
        renderLauncherResults('');
        launcherInput.focus();
    });
}
function closeLauncher() {
    if (!launcherEl) return;
    launcherEl.classList.remove('show');
    setTimeout(() => { launcherEl.hidden = true; }, 180);
}
window.closeLauncher = closeLauncher;

// 搜索并渲染结果：跨所有分组匹配名称/URL/分组/标签，最近使用优先
function renderLauncherResults(query) {
    const q = query.trim().toLowerCase();
    // 按"最近使用"排序，无访问记录的按原顺序
    const recent = getRecentLinks();
    let pool = [...links].sort((a, b) => {
        const ta = recent[String(a.ID)] || 0;
        const tb = recent[String(b.ID)] || 0;
        return tb - ta;
    });
    if (q) {
        // 空格分词，全部词都命中（任一字段）才保留：“nas 管理”可命中「NAS 管理」
        const terms = q.split(/\s+/).filter(Boolean);
        pool = pool.filter(link => {
            const name = (link.name || '').toLowerCase();
            const cat = (link.category || '').toLowerCase();
            const tag = (link.tag || '').toLowerCase();
            const urls = ((link.url || '') + ' ' + (link.urls || []).map(u => u.address || '').join(' ')).toLowerCase();
            return terms.every(term =>
                name.includes(term) || cat.includes(term) || tag.includes(term) || urls.includes(term)
            );
        });
    }
    const top = pool.slice(0, 8);
    launcherItems = top.map(link => {
        const preferred = getPreferredUrlInfo(link);
        return { link, preferredUrl: preferred };
    });
    launcherSelected = q ? 0 : (launcherItems.length ? 0 : -1);
    if (!launcherItems.length) {
        launcherResults.innerHTML = `<li class="launcher-empty">没有匹配的链接</li>`;
        return;
    }
    launcherResults.innerHTML = launcherItems.map((item, idx) => {
        const link = item.link;
        const name = escapeHTML(link.name || '未命名');
        const cat = escapeHTML(link.category || '未分组');
        const meta = getUrlChoiceMeta(item.preferredUrl);
        const routeLabel = { local: '内网', tunnel: '隧道', remote: '公网' }[meta.type] || '';
        const icon = isSafeUrl(link.thumbnail) ? `<img class="launcher-item-icon" src="${sanitizeUrl(link.thumbnail,'',['http:','https:'])}" alt="" loading="lazy">` : `<i class="ri-links-line launcher-item-icon" aria-hidden="true"></i>`;
        return `<li class="launcher-item ${idx === launcherSelected ? 'selected' : ''}" role="option" data-idx="${idx}" tabindex="-1">
            ${icon}
            <div class="launcher-item-main"><span class="launcher-item-name">${name}</span><span class="launcher-item-meta">${cat}${routeLabel ? ' · ' + routeLabel : ''}</span></div>
            <kbd class="launcher-item-route route-${meta.type}">${routeLabel}</kbd>
        </li>`;
    }).join('');
}

function selectLauncherItem(idx) {
    if (idx < 0 || idx >= launcherItems.length) return;
    launcherSelected = idx;
    launcherResults.querySelectorAll('.launcher-item').forEach((el, i) => {
        el.classList.toggle('selected', i === idx);
    });
    const sel = launcherResults.querySelector('.launcher-item.selected');
    sel?.scrollIntoView({ block: 'nearest' });
}
function launchSelectedItem() {
    const item = launcherItems[launcherSelected];
    if (!item) return;
    closeLauncher();
    openLinkUrl(item.link, item.preferredUrl.address);
}

if (launcherInput) {
    launcherInput.addEventListener('input', () => renderLauncherResults(launcherInput.value));
}
if (launcherResults) {
    launcherResults.addEventListener('click', e => {
        const li = e.target.closest('.launcher-item');
        if (!li) return;
        selectLauncherItem(Number(li.dataset.idx));
        launchSelectedItem();
    });
    // 鼠标悬停预选（不立即启动）
    launcherResults.addEventListener('mousemove', e => {
        const li = e.target.closest('.launcher-item');
        if (li && !li.classList.contains('selected')) selectLauncherItem(Number(li.dataset.idx));
    });
}
if (launcherEl) {
    launcherEl.addEventListener('click', e => { if (e.target === launcherEl) closeLauncher(); });
    launcherEl.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); closeLauncher(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); selectLauncherItem(Math.min(launcherSelected + 1, launcherItems.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); selectLauncherItem(Math.max(launcherSelected - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); launchSelectedItem(); }
    });
}

// URL 参数直达：?q=关键词 打开启动器并预填搜索（可设为浏览器自定义搜索）
(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q && typeof openLauncher === 'function') {
        openLauncher();
        const input = document.getElementById('launcher-input');
        if (input) {
            input.value = q;
            if (typeof renderLauncherResults === 'function') renderLauncherResults(q);
        }
    }
})();
