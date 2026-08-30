/* main.js — UI 与应用入口（渲染、设置面板、弹窗、启动器、事件绑定）
 * 数据与存储层已拆分至 storage.js / links-data.js（经典脚本共享全局作用域，
 * 函数在调用时解析，无加载顺序约束；本文件必须最后加载）。 */
document.addEventListener("DOMContentLoaded", function () {
    // 触发 v1 → v2 一次性迁移（首次访问把分散的 localStorage key 合并到 lnp:settings 容器）
    try { getAllSettings(); } catch (e) { console.warn('初始化设置失败', e); }

    applyHomeFeatureSettings();

    // 装饰性图标（图标字体）对辅助技术隐藏，避免朗读无意义字形
    document.querySelectorAll('i[class*="ri-"]:not([aria-hidden])').forEach(icon => {
        icon.setAttribute('aria-hidden', 'true');
    });

    // 设置开关：把同 option-item 里的 <span> 文本作为 aria-label 关联到 checkbox，
    // 让读屏软件朗读开关用途（原本只念"switch"）。
    document.querySelectorAll('.option-item').forEach(item => {
        const input = item.querySelector('input[type="checkbox"], select, input[type="text"]');
        const labelSpan = item.querySelector('.option-header span');
        if (input && labelSpan && !input.getAttribute('aria-label') && !input.id) {
            input.setAttribute('aria-label', labelSpan.textContent.trim());
        }
    });

    // 主题选项原本是不可聚焦的 div，转为按钮语义并纳入 Tab 序列
    document.querySelectorAll('.theme-option').forEach(opt => {
        if (opt.tagName === 'BUTTON') return;
        opt.setAttribute('role', 'button');
        opt.setAttribute('tabindex', '0');
        const themeName = opt.getAttribute('data-theme') || '';
        opt.setAttribute('aria-label', '主题：' + themeName);
    });

    // 备份提醒：若有数据但超过 14 天未导出，温和提示一次（关闭后记 dismissTs，不再打扰）
    (function backupReminder() {
        const hasLinks = getSetting(LINKS_STORAGE_KEY);
        if (!hasLinks) return; // 没数据不提醒
        const last = Number(getSetting('lastBackupTs', 0) || 0);
        const dismissed = Number(getSetting('backupReminderDismissTs', 0) || 0);
        const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
        if (last && (Date.now() - last) < FOURTEEN_DAYS) return;      // 近期导出过
        if (dismissed && (Date.now() - dismissed) < FOURTEEN_DAYS) return; // 近期已忽略
        setTimeout(() => {
            if (typeof showMessage === 'function') {
                showMessage('提示：建议定期导出备份以防数据丢失（设置 → 数据）');
            }
            setSetting('backupReminderDismissTs', String(Date.now()));
        }, 1500);
    })();

    // 获取链接数据并渲染到页面
    fetch('data/links.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            bundledLinks = normalizeLinks(data.links);
            links = loadStoredLinks(bundledLinks);
            renderLinksByCategory(links);
            renderRecentLinks(links);
            renderLinksInSettingsIfVisible(links);
            updateCategoryDatalist();
            updateStorageInfo();
            startStatusMonitor(links); // 启动内网链接状态监控
        })
        .catch(error => {
            console.error('加载链接数据失败：', error);
            bundledLinks = normalizeLinks(fallbackLinks);
            links = loadStoredLinks(bundledLinks);
            renderLinksByCategory(links);
            renderRecentLinks(links);
            renderLinksInSettingsIfVisible(links);
            updateCategoryDatalist();
            updateStorageInfo();
            showMessage('未能读取配置，已使用默认示例');
        });

    // 全局消息容器
    const messageContainer = document.getElementById('message-container');

    function showMessage(message) {
        messageContainer.textContent = message;
        messageContainer.style.display = 'block';
        setTimeout(() => {
            messageContainer.style.opacity = '1';
        }, 10);
        setTimeout(() => {
            hideMessage();
        }, 2000);
    }
    window.showMessage = showMessage;
    window.persistLinks = persistLinks;

    function hideMessage() {
        messageContainer.style.opacity = '0';
        setTimeout(() => {
            messageContainer.style.display = 'none';
        }, 300);
    }
    // 搜索框滚动行为
    const searchContainer = document.querySelector('.search-container');
    const searchContainerWrapper = document.querySelector('.search-container-wrapper');
    let searchContainerOffset = searchContainerWrapper.offsetTop;
    let ticking = false;

    function initSearchContainerPosition() {
        searchContainerOffset = searchContainerWrapper.offsetTop;
        handleScroll();
    }

    function handleScroll() {
        const scrollY = window.scrollY || window.pageYOffset;
        const documentHeight = document.documentElement.scrollHeight;
        const windowHeight = window.innerHeight;
        const hasScrollableContent = documentHeight > windowHeight;

        if (hasScrollableContent) {
            if (scrollY > searchContainerOffset + 50) {
                if (!searchContainer.classList.contains('fixed')) {
                    searchContainer.classList.add('fixed');
                }
            } else {
                searchContainer.classList.remove('fixed');
            }
        } else {
            searchContainer.classList.remove('fixed');
        }
        ticking = false;
    }

    function requestScrollTick() {
        if (!ticking) {
            requestAnimationFrame(handleScroll);
            ticking = true;
        }
    }

    window.addEventListener('scroll', requestScrollTick);
    window.addEventListener('resize', initSearchContainerPosition);
    window.addEventListener('load', initSearchContainerPosition);

    // ================================
    // 设置界面功能
    // ================================
    
    // 标签页切换功能
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // 一次性赋予 tablist 语义（role / aria-selected / aria-controls）
    const tabsWrapper = document.querySelector('.settings-tabs');
    if (tabsWrapper) tabsWrapper.setAttribute('role', 'tablist');
    tabButtons.forEach(btn => {
        btn.setAttribute('role', 'tab');
        const tab = btn.getAttribute('data-tab');
        btn.setAttribute('aria-controls', `${tab}-tab`);
        btn.setAttribute('aria-selected', btn.classList.contains('active') ? 'true' : 'false');
        btn.id = btn.id || `tab-${tab}`;
    });
    tabContents.forEach(content => {
        content.setAttribute('role', 'tabpanel');
        const tabName = (content.id || '').replace('-tab', '');
        if (tabName) content.setAttribute('aria-labelledby', `tab-${tabName}`);
    });

    const settingsSearchbar = document.querySelector('.settings-searchbar');
    const settingsSearchInput = document.getElementById('settings-search-input');
    const clearSettingsSearchButton = document.getElementById('clear-settings-search');
    const settingsSearchCount = document.getElementById('settings-search-count');
    const settingsContent = document.querySelector('.settings-content');

    function getActiveSettingsTabName() {
        return document.querySelector('.tab-button.active')?.getAttribute('data-tab') || 'links';
    }

    function ensureSettingsSearchEmptyState(tabContent) {
        if (!tabContent) return null;
        let empty = tabContent.querySelector(':scope > .settings-search-empty');
        if (!empty) {
            empty = document.createElement('div');
            empty.className = 'settings-search-empty';
            empty.innerHTML = '<i class="ri-search-eye-line"></i><span>没有匹配的设置项</span>';
            tabContent.appendChild(empty);
        }
        return empty;
    }

    function getSettingsSearchTargets(tabContent) {
        if (!tabContent) return [];
        return [...tabContent.querySelectorAll(':scope > .settings-section, :scope > .about-content')];
    }

    function applySettingsSearch() {
        if (!settingsSearchInput || !settingsContent) return;

        const activeTabName = getActiveSettingsTabName();
        const shouldShowSearch = activeTabName !== 'links';
        const query = settingsSearchInput.value.trim().toLowerCase();

        if (settingsSearchbar) {
            settingsSearchbar.style.display = shouldShowSearch ? 'grid' : 'none';
        }

        // 先清掉所有隐藏标记与高亮标记
        tabContents.forEach(tabContent => {
            getSettingsSearchTargets(tabContent).forEach(target => {
                target.classList.remove('settings-search-hidden', 'settings-search-hit');
            });
        });

        if (!shouldShowSearch) {
            settingsContent.classList.remove('has-empty-search');
            if (settingsSearchCount) settingsSearchCount.textContent = '';
            if (clearSettingsSearchButton) clearSettingsSearchButton.style.display = 'none';
            return;
        }

        const query2 = query;
        if (!query2) {
            initSectionCollapseState();
        }

        // §3.1 全局匹配：在所有标签页（非 links）里搜，找出首个命中分区所在标签页
        const searchableTabs = [...tabContents].filter(t => t.id !== 'links-tab');
        let firstHitTab = null;
        let totalHits = 0;
        searchableTabs.forEach(tabContent => {
            const targets = getSettingsSearchTargets(tabContent);
            let tabHit = false;
            targets.forEach(target => {
                const matches = !query2 || target.textContent.toLowerCase().includes(query2);
                target.classList.toggle('settings-search-hidden', !matches);
                if (matches && query2) {
                    target.classList.add('settings-search-hit');
                    tabHit = true;
                    totalHits += 1;
                }
            });
            if (tabHit) {
                if (!firstHitTab) firstHitTab = tabContent;
            }
        });

        // 命中的分区若不在当前标签 → 自动切换到首个命中标签（避免用户以为"搜不到"）
        if (query2 && firstHitTab && !firstHitTab.classList.contains('active')) {
            const tabName = (firstHitTab.id || '').replace('-tab', '');
            if (tabName) {
                // 静默切换：不触发 applySettingsSearch 二次递归
                tabButtons.forEach(btn => { btn.classList.remove('active'); btn.setAttribute('aria-selected', 'false'); });
                tabContents.forEach(c => c.classList.remove('active'));
                const btn = document.querySelector(`.tab-button[data-tab="${tabName}"]`);
                if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
                firstHitTab.classList.add('active');
            }
        }

        // §3.1 命中分区自动展开：搜索时展开所有 .settings-search-hit 的分区，方便看到命中的项
        if (query2) {
            document.querySelectorAll('.settings-search-hit.settings-section').forEach(sec => {
                sec.classList.remove('collapsed');
                syncSectionTitleState(sec);
            });
        }

        const activeTab = document.querySelector('.tab-content.active');
        ensureSettingsSearchEmptyState(activeTab);
        settingsContent.classList.toggle('has-empty-search', Boolean(query2) && totalHits === 0);
        if (settingsSearchCount) {
            settingsSearchCount.textContent = query2 ? `${totalHits} 项` : '';
        }
        if (clearSettingsSearchButton) {
            clearSettingsSearchButton.style.display = query2 ? 'inline-flex' : 'none';
        }
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            activateSettingsTab(targetTab);
        });
    });

    // 激活某个设置标签页（供 tab 按钮与「关于」标题栏图标共用）
    function activateSettingsTab(targetTab) {
        // 移除所有激活状态
        tabButtons.forEach(btn => { btn.classList.remove('active'); btn.setAttribute('aria-selected', 'false'); });
        tabContents.forEach(content => content.classList.remove('active'));

        // 添加激活状态（about 无 tab 按钮，但 tab-content 仍存在）
        const matchingBtn = document.querySelector(`.tab-button[data-tab="${targetTab}"]`);
        if (matchingBtn) { matchingBtn.classList.add('active'); matchingBtn.setAttribute('aria-selected', 'true'); }
        const targetContent = document.getElementById(`${targetTab}-tab`);
        if (targetContent) targetContent.classList.add('active');

        // 如果切换到链接管理标签页，重新渲染链接
        if (targetTab === 'links') {
            renderLinksInSettingsIfVisible(links);
        }

        applySettingsSearch();
    }

    // 「关于」标题栏图标：打开关于面板（关于已从一级标签降级，由标题栏入口唤起）
    const openAboutBtn = document.getElementById('open-about');
    if (openAboutBtn) {
        openAboutBtn.addEventListener('click', () => activateSettingsTab('about'));
    }

    if (settingsSearchInput) {
        settingsSearchInput.addEventListener('input', applySettingsSearch);
    }

    if (clearSettingsSearchButton) {
        clearSettingsSearchButton.addEventListener('click', () => {
            settingsSearchInput.value = '';
            settingsSearchInput.focus();
            applySettingsSearch();
        });
    }

    function openSettingsPanel() {
        const settingsContainer = document.getElementById('settings-container');
        if (!settingsContainer) return;

        // 记录触发元素，关闭后恢复焦点
        settingsContainer._lastFocused = document.activeElement;

        settingsContainer.style.setProperty('display', 'flex', 'important');
        requestAnimationFrame(() => {
            settingsContainer.classList.add('show');
            renderLinksInSettingsIfVisible(links);
            updateStorageInfo();
            initSectionCollapseState();
            applySettingsSearch();
            // 打开后聚焦关闭按钮，便于键盘用户
            const closeBtn = document.getElementById('close-settings');
            closeBtn?.focus();
        });
        // §5.1：焦点陷阱——Tab 在面板内循环，不跑到背景元素
        document.addEventListener('keydown', trapSettingsFocus);
    }

    // §5.1：设置面板焦点陷阱（仅在面板打开时生效）
    function trapSettingsFocus(e) {
        if (e.key !== 'Tab') return;
        const settingsContainer = document.getElementById('settings-container');
        if (!settingsContainer || !settingsContainer.classList.contains('show')) return;
        const focusables = settingsContainer.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const visible = [...focusables].filter(el => el.offsetParent !== null || el === document.activeElement);
        if (!visible.length) return;
        const first = visible[0];
        const last = visible[visible.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    window.openSettingsPanel = openSettingsPanel;

    // 关闭设置面板：统一入口，负责恢复焦点 + 移除焦点陷阱
    function closeSettingsPanel() {
        const settingsContainer = document.getElementById('settings-container');
        if (!settingsContainer) return;
        settingsContainer.classList.remove('show');
        document.removeEventListener('keydown', trapSettingsFocus);
        setTimeout(() => {
            settingsContainer.style.display = 'none';
            // 恢复触发元素焦点
            if (settingsContainer._lastFocused && typeof settingsContainer._lastFocused.focus === 'function') {
                settingsContainer._lastFocused.focus();
            }
        }, 250);
    }
    window.closeSettingsPanel = closeSettingsPanel;

    // 打开设置按钮
    const openSettingsBtn = document.getElementById('open-settings');
    if (openSettingsBtn) {
        openSettingsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openSettingsPanel();
        });
    }

    document.addEventListener('keydown', event => {
        // Cmd/Ctrl + , 打开设置
        if ((event.ctrlKey || event.metaKey) && event.key === ',') {
            event.preventDefault();
            openSettingsPanel();
            return;
        }
        // Cmd/Ctrl + K 唤起键盘启动器
        if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
            event.preventDefault();
            openLauncher();
        }
    });

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
            pool = pool.filter(link => {
                const name = (link.name || '').toLowerCase();
                const cat = (link.category || '').toLowerCase();
                const tag = (link.tag || '').toLowerCase();
                const urls = (link.url || '') + ' ' + (link.urls || []).map(u => u.address || '').join(' ');
                return name.includes(q) || cat.includes(q) || tag.includes(q) || urls.toLowerCase().includes(q);
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

    if (new URLSearchParams(window.location.search).has('settings')) {
        requestAnimationFrame(openSettingsPanel);
    }

    // 关闭设置按钮
    const closeSettingsButton = document.getElementById('close-settings');
    if (closeSettingsButton) {
        closeSettingsButton.addEventListener('click', closeSettingsPanel);
    }

    // 点击设置容器背景关闭
    const settingsContainer = document.getElementById('settings-container');
    settingsContainer.addEventListener('click', function(e) {
        if (e.target === settingsContainer) {
            closeSettingsPanel();
        }
    });

    // Esc 关闭设置面板及各弹窗（之前只有 category-panel 有 Esc 处理）
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        // 优先关设置面板
        if (settingsContainer.classList.contains('show')) {
            e.preventDefault();
            closeSettingsPanel();
            return;
        }
        // 各编辑弹窗：按可见性依次关闭（display:flex 表示打开）
        const modals = [
            { el: linkModal, close: () => closeModal() },
            { el: categoryModal, close: () => closeCategoryModal() },
            { el: topButtonModal, close: () => closeTopButtonModal() },
            { el: searchEngineModal, close: () => closeSearchEngineModal() }
        ];
        for (const m of modals) {
            if (m.el && m.el.style.display === 'flex') {
                e.preventDefault();
                m.close();
                return;
            }
        }
    });

    // 弹窗相关元素
    const linkModal = document.getElementById('link-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const addLinkToolbarBtn = document.getElementById('add-link-toolbar-btn');
    const editForm = document.getElementById('edit-form');
    const urlsList = document.getElementById('urls-list');
    const addUrlBtn = document.getElementById('add-url-btn');
    
    // 当前编辑的 URL 列表
    let currentUrls = [];
    
    // 渲染 URL 列表
    function renderUrlsList() {
        if (!urlsList) return;
        
        if (currentUrls.length === 0) {
            urlsList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--text-tertiary);"><i class="ri-link" style="font-size: 24px; margin-bottom: 8px;"></i><p>暂无地址，点击"添加地址"按钮添加</p></div>';
            return;
        }
        
        urlsList.innerHTML = currentUrls.map((urlObj, index) => `
            <div class="url-item" data-index="${index}">
                <div class="url-input-wrapper">
                    <input type="text" class="url-label" placeholder="标签" value="${escapeHTML(urlObj.label || '')}" data-field="label" data-index="${index}">
                    <input type="text" class="url-address" placeholder="https://example.com" value="${escapeHTML(urlObj.address || '')}" data-field="address" data-index="${index}">
                    <input type="number" class="url-priority" placeholder="优先级" value="${escapeHTML(urlObj.priority || index + 1)}" min="1" data-field="priority" data-index="${index}" title="优先级">
                </div>
                <div class="url-actions">
                    <button type="button" class="url-action-btn move" data-action="move-up" data-index="${index}" title="上移" ${index === 0 ? 'disabled' : ''}>
                        <i class="ri-arrow-up-line"></i>
                    </button>
                    <button type="button" class="url-action-btn move" data-action="move-down" data-index="${index}" title="下移" ${index === currentUrls.length - 1 ? 'disabled' : ''}>
                        <i class="ri-arrow-down-line"></i>
                    </button>
                    <button type="button" class="url-action-btn delete" data-action="delete" data-index="${index}" title="删除">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // 绑定 URL 项的事件
        urlsList.querySelectorAll('.url-item input').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                const field = e.target.dataset.field;
                const value = e.target.value;
                currentUrls[index][field] = field === 'priority' ? parseInt(value) || 1 : value;
            });
        });
        
        urlsList.querySelectorAll('.url-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const index = parseInt(btn.dataset.index);
                
                if (action === 'move-up' && index > 0) {
                    [currentUrls[index - 1], currentUrls[index]] = [currentUrls[index], currentUrls[index - 1]];
                    renderUrlsList();
                } else if (action === 'move-down' && index < currentUrls.length - 1) {
                    [currentUrls[index], currentUrls[index + 1]] = [currentUrls[index + 1], currentUrls[index]];
                    renderUrlsList();
                } else if (action === 'delete') {
                    currentUrls.splice(index, 1);
                    renderUrlsList();
                }
            });
        });
    }
    
    // 添加 URL
    function addUrl() {
        currentUrls.push({ address: '', label: '', priority: currentUrls.length + 1 });
        renderUrlsList();
    }
    
    // 添加 URL 按钮事件
    if (addUrlBtn) {
        addUrlBtn.addEventListener('click', addUrl);
    }
    
    // 打开添加链接弹窗
    function openAddModal() {
        window.editingLinkId = null;
        // 清空表单
        document.getElementById('edit-name').value = '';
        document.getElementById('edit-category').value = '';
        document.getElementById('edit-tag').value = '';
        document.getElementById('edit-thumbnail').value = '';
        // URL 列表预置一行空地址，新链接可直接填写
        currentUrls = [{ address: '', label: '', priority: 1 }];
        renderUrlsList();
        // 清空预览
        renderThumbnailPreview('');
        // 更新标题
        modalTitle.innerHTML = '<i class="ri-add-circle-line"></i><span>添加链接</span>';
        // 显示弹窗
        linkModal.style.display = 'flex';
        requestAnimationFrame(() => {
            linkModal.classList.add('show');
        });
    }
    
    // 打开编辑链接弹窗
    window.openEditModal = function(link) {
        // 填充表单
        document.getElementById('edit-name').value = link.name;
        document.getElementById('edit-category').value = link.category;
        document.getElementById('edit-tag').value = link.tag || '';
        document.getElementById('edit-thumbnail').value = link.thumbnail || '';
        renderThumbnailPreview(link.thumbnail || '');
        
        // 填充 URL 列表 - 支持新旧格式兼容
        if (link.urls && Array.isArray(link.urls)) {
            // 新格式：多 URL
            currentUrls = link.urls.map(u => ({...u}));
        } else if (link.url) {
            // 旧格式：单 URL
            currentUrls = [{
                address: link.url,
                label: '默认',
                priority: 1
            }];
        } else {
            currentUrls = [];
        }
        renderUrlsList();
        
        // 更新标题
        modalTitle.innerHTML = '<i class="ri-edit-circle-line"></i><span>编辑链接</span>';
        // 显示弹窗
        linkModal.style.display = 'flex';
        requestAnimationFrame(() => {
            linkModal.classList.add('show');
        });
    }
    
    // 关闭弹窗
    function closeModal() {
        linkModal.classList.remove('show');
        setTimeout(() => {
            linkModal.style.display = 'none';
            window.editingLinkId = null;
        }, 250);
    }
    
    // 工具栏添加链接按钮
    if (addLinkToolbarBtn) {
        addLinkToolbarBtn.addEventListener('click', openAddModal);
    }
    
    // 关闭弹窗按钮
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }
    
    // 点击弹窗背景关闭
    if (linkModal) {
        linkModal.addEventListener('click', (e) => {
            if (e.target === linkModal) {
                closeModal();
            }
        });
    }

    // ================================
    // 分类管理功能
    // ================================
    const categoryModal = document.getElementById('category-modal');
    const manageCategoriesBtn = document.getElementById('manage-categories-btn');
    const categoryModalCloseBtn = document.getElementById('category-modal-close-btn');
    const newCategoryNameInput = document.getElementById('new-category-name');
    const addCategoryBtn = document.getElementById('add-category-btn');
    const categoriesList = document.getElementById('categories-list');
    
    // 打开分类管理弹窗
    function openCategoryModal() {
        renderCategoriesList();
        categoryModal.style.display = 'flex';
        requestAnimationFrame(() => {
            categoryModal.classList.add('show');
        });
    }
    
    // 关闭分类管理弹窗
    function closeCategoryModal() {
        categoryModal.classList.remove('show');
        setTimeout(() => {
            categoryModal.style.display = 'none';
        }, 250);
    }
    
    // 渲染分类列表
    function renderCategoriesList() {
        const categories = {};
        getAllCategoryNames(links).forEach(category => {
            categories[category] = 0;
        });

        links.forEach(link => {
            const category = link.category || '未分类';
            if (!categories[category]) {
                categories[category] = 0;
            }
            categories[category]++;
        });
        
        const categoryNames = Object.keys(categories);
        
        if (categoryNames.length === 0) {
            categoriesList.innerHTML = `
                <div class="categories-empty">
                    <i class="ri-folder-off-line"></i>
                    <p>暂无分组</p>
                </div>
            `;
            return;
        }
        
        categoriesList.innerHTML = categoryNames.map(name => `
            <div class="category-item" data-category="${escapeHTML(name)}">
                <div class="category-item-info">
                    <div class="category-item-icon">
                        <i class="ri-folder-line"></i>
                    </div>
                    <span class="category-item-name">${escapeHTML(name)}</span>
                    <span class="category-item-count">${categories[name]} 个链接</span>
                </div>
                <div class="category-item-actions">
                    <button class="category-action-btn edit" title="重命名" data-action="edit" data-category="${escapeHTML(name)}">
                        <i class="ri-edit-line"></i>
                    </button>
                    <button class="category-action-btn delete" title="删除" data-action="delete" data-category="${escapeHTML(name)}">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // 绑定分类项的事件
        categoriesList.querySelectorAll('.category-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const category = btn.dataset.category;
                if (action === 'edit') {
                    editCategory(category);
                } else if (action === 'delete') {
                    deleteCategory(category);
                }
            });
        });
    }
    
    // 添加分类
    function addCategory(name) {
        if (!name || !name.trim()) {
            showMessage('请输入分组名称');
            return;
        }
        name = name.trim();
        
        const categories = getAllCategoryNames(links);
        if (categories.includes(name)) {
            showMessage('分组已存在');
            return;
        }

        saveCustomCategories([...getCustomCategories(), name]);
        setSetting('lastUpdate', new Date().toISOString());
        showMessage('已添加分组：' + name);
        renderCategoriesList();
        updateCategoryDatalist();
        updateStorageInfo();
        newCategoryNameInput.value = '';
    }
    
    // 编辑分类（重命名）
    function editCategory(oldName) {
        const newName = prompt('请输入新的分组名称：', oldName);
        if (newName && newName.trim() && newName !== oldName) {
            const trimmedName = newName.trim();
            const customCategories = getCustomCategories()
                .map(category => category === oldName ? trimmedName : category);

            // 更新所有该分类的链接
            links.forEach(link => {
                if (link.category === oldName) {
                    link.category = trimmedName;
                }
            });
            saveCustomCategories(customCategories);
            persistLinks();
            showMessage('已重命名分组');
            renderCategoriesList();
            renderLinksInSettingsIfVisible(links);
            renderLinksByCategory(links);
            updateCategoryDatalist();
            updateStorageInfo();
        }
    }
    
    // 删除分类
    function deleteCategory(name) {
        const categoryLinks = links.filter(l => l.category === name);
        if (categoryLinks.length > 0) {
            if (!confirm(`分组"${name}"中有 ${categoryLinks.length} 个链接，删除后这些链接将被移动到"未分组"。确定要删除吗？`)) {
                return;
            }
            // 将该分类的所有链接移动到"未分组"
            links.forEach(link => {
                if (link.category === name) {
                    link.category = '未分类';
                }
            });
        } else {
            if (!confirm(`确定要删除空分组"${name}"吗？`)) {
                return;
            }
        }
        saveCustomCategories(getCustomCategories().filter(category => category !== name));
        persistLinks();
        showMessage('已删除分组');
        renderCategoriesList();
        renderLinksInSettingsIfVisible(links);
        renderLinksByCategory(links);
        updateCategoryDatalist();
        updateStorageInfo();
    }
    
    // 管理分类按钮
    if (manageCategoriesBtn) {
        manageCategoriesBtn.addEventListener('click', openCategoryModal);
    }
    
    // 关闭分类弹窗按钮
    if (categoryModalCloseBtn) {
        categoryModalCloseBtn.addEventListener('click', closeCategoryModal);
    }
    
    // 点击分类弹窗背景关闭
    if (categoryModal) {
        categoryModal.addEventListener('click', (e) => {
            if (e.target === categoryModal) {
                closeCategoryModal();
            }
        });
    }
    
    // 添加分类按钮
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', () => {
            addCategory(newCategoryNameInput.value);
        });
    }
    
    // 回车添加分类
    if (newCategoryNameInput) {
        newCategoryNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addCategory(newCategoryNameInput.value);
            }
        });
    }

    // 取消按钮
    const cancelButton = document.getElementById('cancel-button');
    cancelButton.addEventListener('click', closeModal);

    // 保存按钮
    const saveButton = document.getElementById('save-button');

    saveButton.addEventListener('click', () => {
        const name = document.getElementById('edit-name').value.trim();
        const category = document.getElementById('edit-category').value.trim();
        const tag = document.getElementById('edit-tag').value.trim();
        const thumbnail = document.getElementById('edit-thumbnail').value.trim();

        // 获取 URL 列表，过滤掉空地址
        const validUrls = currentUrls
            .map((url, index) => ({
                address: String(url.address || '').trim(),
                label: String(url.label || `地址 ${index + 1}`).trim(),
                priority: Number.parseInt(url.priority, 10) || index + 1
            }))
            .filter(url => url.address);
        
        if (!name || validUrls.length === 0) {
            showMessage('请填写名称和至少一个 URL 地址');
            return;
        }

        if (validUrls.some(url => !isSafeUrl(url.address))) {
            showMessage('链接地址格式无效');
            return;
        }

        if (thumbnail && !isSafeUrl(thumbnail, ['http:', 'https:'])) {
            showMessage('缩略图地址只支持 HTTP 或 HTTPS');
            return;
        }

        const editingLinkId = window.editingLinkId;
        // 获取第一个 URL 用于生成缩略图
        const firstUrl = validUrls[0]?.address || '';
        
        if (editingLinkId != null) {
            // 编辑现有链接
            const linkIndex = links.findIndex(l => l.ID === editingLinkId);
            if (linkIndex !== -1) {
                links[linkIndex].name = name;
                // 如果只有一个 URL，使用旧格式兼容
                if (validUrls.length === 1) {
                    links[linkIndex].url = validUrls[0].address;
                    delete links[linkIndex].urls;
                } else {
                    // 多 URL 格式
                    links[linkIndex].urls = validUrls;
                    delete links[linkIndex].url;
                }
                links[linkIndex].category = category || '未分类';
                links[linkIndex].tag = tag;
                links[linkIndex].thumbnail = thumbnail || defaultThumbnailFor(firstUrl);
            }
            showMessage('已更新链接');
        } else {
            // 添加新链接
            const newId = links.length > 0 ? Math.max(...links.map(l => l.ID)) + 1 : 1;
            const newLink = {
                ID: newId,
                name: name,
                category: category || '未分类',
                tag: tag,
                thumbnail: thumbnail || defaultThumbnailFor(firstUrl)
            };
            // 如果只有一个 URL，使用旧格式兼容
            if (validUrls.length === 1) {
                newLink.url = validUrls[0].address;
            } else {
                // 多 URL 格式
                newLink.urls = validUrls;
            }
            links.push(newLink);
            showMessage('已添加链接');
        }

        // 重复地址提醒：不阻止保存，仅提示（编辑自身不计入）
        const editingId = window.editingLinkId;
        const addresses = validUrls.map(u => u.address);
        const duplicate = links.find(l =>
            l.ID !== editingId && getLinkUrls(l).some(u => addresses.includes(u.address))
        );
        if (duplicate) {
            showMessage(`提示：该地址已存在于「${duplicate.name}」`);
        }

        persistLinks();
        // 关闭弹窗
        closeModal();
        // 重新渲染
        renderLinksByCategory(links);
        renderLinksInSettingsIfVisible(links);
        updateCategoryDatalist();
        updateStorageInfo();
    });

    // 缩略图预览功能
    const thumbnailInput = document.getElementById('edit-thumbnail');
    const thumbnailPreview = document.getElementById('thumbnail-preview');

    function renderThumbnailPreview(url) {
        if (!thumbnailPreview) return;

        thumbnailPreview.replaceChildren();
        const safeUrl = sanitizeUrl(url, '', ['http:', 'https:']);

        if (!safeUrl) {
            thumbnailPreview.innerHTML = '<i class="ri-image-add-line"></i><span>预览</span>';
            thumbnailPreview.classList.remove('has-image');
            return;
        }

        const img = document.createElement('img');
        img.src = safeUrl;
        img.alt = '预览';
        img.addEventListener('error', () => {
            thumbnailPreview.innerHTML = '<i class="ri-image-off-line"></i><span>图片加载失败</span>';
            thumbnailPreview.classList.remove('has-image');
        });
        thumbnailPreview.appendChild(img);
        thumbnailPreview.classList.add('has-image');
    }

    thumbnailInput.addEventListener('input', function() {
        renderThumbnailPreview(this.value.trim());
    });

    // 更新分类数据列表
    function updateCategoryDatalist() {
        const datalist = document.getElementById('category-list');
        const categories = getAllCategoryNames(links);
        datalist.innerHTML = categories.map(c => `<option value="${escapeHTML(c)}">`).join('');
    }
    window.updateCategoryDatalist = updateCategoryDatalist;

    function getPersistentSettingsSnapshot() {
        // 直接返回 lnp:settings 容器（去掉 navigationLinks，因为 links 字段单独导出）
        const all = getAllSettings();
        const copy = { ...all };
        delete copy[LINKS_STORAGE_KEY];
        return copy;
    }

    function createFullBackup() {
        return {
            // 配置文件说明（可纳入 git 版本管理 / 多机同步）
            schemaVersion: 2,
            appVersion: currentVersion,
            app: 'LocalNavigationPage',
            exportedAt: new Date().toISOString(),
            links: normalizeLinks(links),
            settings: getPersistentSettingsSnapshot()
        };
    }

    function formatBytes(size) {
        return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(size < 10240 ? 1 : 2)} KB`;
    }

    function restoreSettingsSnapshot(settings) {
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;

        const current = getAllSettings();
        // 新格式：settings 就是 lnp:settings 容器；老格式：key→rawString 散值
        // 这里一律按"已知 key 才合并"处理，避免脏数据写入
        const knownKeys = new Set(V1_KEYS_TO_MIGRATE);
        Object.entries(settings).forEach(([key, value]) => {
            if (!knownKeys.has(key) || value == null) return;
            // 老格式是字符串，尝试解析；新格式已是对象
            if (typeof value === 'string') {
                try { current[key] = JSON.parse(value); }
                catch { current[key] = value; }
            } else {
                current[key] = value;
            }
        });
        setAllSettings(current);
    }

    // 更新存储信息
    function updateStorageInfo() {
        const categories = getAllCategoryNames(links);
        const backupSize = new Blob([JSON.stringify(createFullBackup())]).size;
        
        // 更新统计卡片
        const totalLinksEl = document.getElementById('total-links');
        const totalCategoriesEl = document.getElementById('total-categories');
        if (totalLinksEl) totalLinksEl.textContent = links.length;
        if (totalCategoriesEl) totalCategoriesEl.textContent = categories.length;
        
        // 更新迷你统计卡片
        const storageSizeMini = document.getElementById('storage-size-mini');
        if (storageSizeMini) {
            storageSizeMini.textContent = formatBytes(backupSize);
        }

        // 更新存储信息面板的数据
        const storageLinksCount = document.getElementById('storage-links-count');
        const storageSize = document.getElementById('storage-size');
        const storageLastUpdate = document.getElementById('storage-last-update');
        
        if (storageLinksCount) storageLinksCount.textContent = links.length;
        
        if (storageSize) {
            storageSize.textContent = formatBytes(backupSize);
        }

        // 最后更新时间
        if (storageLastUpdate) {
            const lastUpdate = getSetting('lastUpdate', null);
            if (lastUpdate) {
                storageLastUpdate.textContent = new Date(lastUpdate).toLocaleString('zh-CN');
            } else {
                storageLastUpdate.textContent = '-';
            }
        }
    }
    window.updateStorageInfo = updateStorageInfo;

    // 搜索链接功能
    const linksSearch = document.getElementById('links-search');
    const clearLinksSearch = document.getElementById('clear-links-search');
    let linksSearchDebounce = null;
    if (linksSearch) {
        linksSearch.addEventListener('input', () => {
            // 输入防抖：避免每个按键都全量重建链接列表
            clearTimeout(linksSearchDebounce);
            linksSearchDebounce = setTimeout(() => {
                renderLinksInSettingsIfVisible(links);
            }, 180);
        });
    }
    if (clearLinksSearch) {
        clearLinksSearch.addEventListener('click', () => {
            if (!linksSearch) return;
            clearTimeout(linksSearchDebounce);
            linksSearch.value = '';
            linksSearch.focus();
            renderLinksInSettingsIfVisible(links);
        });
    }

    // 分类筛选功能
    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
            renderLinksInSettingsIfVisible(links);
        });
    }

    // 导出/导入数据功能
    const exportDataBtn = document.getElementById('export-data');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            const dataStr = JSON.stringify(createFullBackup(), null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `navigation-backup-v2-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setSetting('lastBackupTs', Date.now());
            showMessage('完整配置已导出');
        });
    }

    const importDataBtn = document.getElementById('import-data');
    const importFileInput = document.getElementById('import-file');
    if (importDataBtn && importFileInput) {
        importDataBtn.addEventListener('click', () => {
            importFileInput.click();
        });

        importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    const hasLinks = data.links && Array.isArray(data.links);
                    const hasSettings = data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings);

                    if (hasSettings) {
                        restoreSettingsSnapshot(data.settings);
                    }

                    if (hasLinks) {
                        links = normalizeLinks(data.links);
                        persistLinks();
                    }

                    if (hasLinks || hasSettings) {
                        renderLinksByCategory(links);
                        renderLinksInSettingsIfVisible(links);
                        updateCategoryDatalist();
                        updateStorageInfo();
                        showMessage(hasSettings ? '完整配置已导入，正在刷新' : '链接数据已导入');
                        if (hasSettings) {
                            setTimeout(() => window.location.reload(), 700);
                        }
                    } else {
                        showMessage('无效的数据格式');
                    }
                } catch (err) {
                    showMessage('导入失败：' + err.message);
                }
            };
            reader.readAsText(file);
            importFileInput.value = '';
        });
    }

    // ============ 书签导入（P1-4）：Netscape HTML + CSV ============
    const importBookmarksBtn = document.getElementById('import-bookmarks-btn');
    const importBookmarksFile = document.getElementById('import-bookmarks-file');
    if (importBookmarksBtn && importBookmarksFile) {
        importBookmarksBtn.addEventListener('click', () => importBookmarksFile.click());
        importBookmarksFile.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const isHtml = /\.html?$/i.test(file.name) || /^\s*<!DOCTYPE|<HTML/i.test(text);
                let imported;
                if (isHtml) imported = parseNetscapeBookmarks(text);
                else imported = parseCsvBookmarks(text);
                if (!imported.length) { showMessage('未在文件中找到可导入的书签'); importBookmarksFile.value = ''; return; }

                // 去重：按 URL 跳过已存在的链接
                const existingUrls = new Set(links.flatMap(l => getLinkUrls(l).map(u => u.address)));
                const newLinks = imported.filter(b => b.url && !existingUrls.has(b.url));
                const skipped = imported.length - newLinks.length;
                if (!newLinks.length) { showMessage(`导入完成：${skipped} 个已存在，跳过`); importBookmarksFile.value = ''; return; }

                // 追加到 links（分配新 ID）
                let maxId = links.reduce((m, l) => Math.max(m, Number(l.ID) || 0), 0);
                const toAdd = newLinks.map(b => normalizeLinks([{
                    name: b.name, url: b.url, category: b.category || '', tag: '', thumbnail: ''
                }])[0]).map(l => { l.ID = ++maxId; return l; });
                links = [...links, ...toAdd];
                persistLinks();
                renderLinksByCategory(links);
                renderRecentLinks(links);
                renderLinksInSettingsIfVisible(links);
                showMessage(`已导入 ${toAdd.length} 个书签${skipped ? `（${skipped} 个重复已跳过）` : ''}`);
            } catch (err) {
                console.error(err);
                showMessage('导入失败：文件格式无法解析');
            }
            importBookmarksFile.value = '';
        });
    }

    // 解析 Netscape 书签 HTML（浏览器通用导出格式）
    function parseNetscapeBookmarks(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const results = [];
        // 每个书签是 <DT><A HREF="..." ADD_DATE="...">名称</A>；所属分组由最近的 <H3> 或 <DL> 内的 <H1>/<H3> 决定
        // 简化：遍历 A 标签，向上找最近的 H3 作为分组
        const anchors = [...doc.querySelectorAll('a[href]')];
        for (const a of anchors) {
            const name = (a.textContent || '').trim();
            const url = a.getAttribute('href') || '';
            if (!name || !/^https?:/i.test(url)) continue;
            // 向上找最近的分组标题（H3）
            let node = a.parentElement;
            let category = '';
            while (node && !category) {
                const h3 = node.querySelector(':scope > h3, :scope > H3');
                // 注意：H3 通常是 DT 的子元素，与 A 同级
                node = node?.parentElement;
            }
            // 用更可靠方式：找最近的 H3 文本
            let walker = a;
            for (let i = 0; i < 10 && walker; i++) {
                const prev = walker.previousElementSibling;
                if (prev && /^H[1-3]$/i.test(prev.tagName)) { category = prev.textContent.trim(); break; }
                walker = walker.parentElement;
            }
            results.push({ name, url, category: category || '导入书签' });
        }
        return results;
    }

    // 解析 CSV：支持列 name,url,category(可选),tag(可选)；首行可为表头
    function parseCsvBookmarks(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (!lines.length) return [];
        const results = [];
        // 检测表头
        const first = parseCsvLine(lines[0]);
        const hasHeader = first.some(f => /^(name|url|category|tag|分组|标签)$/i.test(f));
        const startIdx = hasHeader ? 1 : 0;
        for (let i = startIdx; i < lines.length; i++) {
            const cols = parseCsvLine(lines[i]);
            const url = (cols[1] || '').trim();
            if (!url) continue;
            results.push({
                name: (cols[0] || url).trim(),
                url,
                category: (cols[2] || '').trim(),
                tag: (cols[3] || '').trim()
            });
        }
        return results;
    }
    // 简易 CSV 行解析（支持引号包裹）
    function parseCsvLine(line) {
        const out = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
            else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
            else cur += ch;
        }
        out.push(cur);
        return out;
    }

    // 清除缓存
    const clearCacheBtn = document.getElementById('clear-cache');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            if (confirm('确定要清除缓存吗？')) {
                localStorage.clear();
                showMessage('缓存已清除，即将刷新…');
                // 清缓存后主题/天气/显示设置全失效，刷新让页面恢复一致状态
                setTimeout(() => window.location.reload(), 600);
            }
        });
    }

    // 重置所有
    const resetAllBtn = document.getElementById('reset-all');
    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', () => {
            if (confirm('确定要重置所有设置和数据吗？此操作不可恢复！')) {
                localStorage.clear();
                links = normalizeLinks(bundledLinks.length ? bundledLinks : fallbackLinks);
                renderLinksByCategory(links);
                renderLinksInSettingsIfVisible(links);
                updateCategoryDatalist();
                updateStorageInfo();
                showMessage('已重置所有设置');
            }
        });
    }

    // 版本检测功能
    const currentVersion = '1.5.4';
    document.getElementById('current-version').textContent = currentVersion;
    
    function renderVersionStatus(latestVersion) {
        const statusEl = document.getElementById('version-check-status');
        if (!statusEl || !latestVersion) return;

        if (compareVersions(latestVersion, currentVersion) > 0) {
            statusEl.innerHTML = `
                <a href="https://github.com/LceAn/LocalNavigationPage/releases/latest" target="_blank"
                   style="color: var(--accent-color); text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="ri-arrow-up-line"></i>
                    <span>发现新版本 ${escapeHTML(latestVersion)}，点击更新</span>
                </a>
            `;
        } else {
            statusEl.innerHTML = '<span style="color: var(--text-tertiary);"><i class="ri-check-line"></i> 已是最新版本</span>';
        }
    }

    // 渲染「检测失败 / 暂时无法检查」状态，并提供手动重试按钮（§4.4 超时兜底）
    function renderVersionCheckFailed(message) {
        const statusEl = document.getElementById('version-check-status');
        if (!statusEl) return;
        statusEl.innerHTML =
            `<span style="color: var(--text-tertiary); display: inline-flex; align-items: center; gap: 6px;">` +
            `<i class="ri-error-warning-line"></i> ${escapeHTML(message)}` +
            `</span>` +
            `<button type="button" id="retry-version-check" style="margin-left: 8px; background: none; border: 1px solid var(--bg-tertiary); border-radius: var(--rounded-full); padding: 2px 10px; font-size: 12px; color: var(--primary-color); cursor: pointer;">重试</button>`;
        const retryBtn = document.getElementById('retry-version-check');
        if (retryBtn) retryBtn.addEventListener('click', runVersionCheckNow);
    }

    let versionCheckController = null;
    function runVersionCheckNow() {
        // 超时兜底：8 秒未返回则中止并提示，避免永久停留在"检查更新中..."
        if (versionCheckController) { try { versionCheckController.abort(); } catch (_) {} }
        versionCheckController = ('AbortController' in window) ? new AbortController() : null;
        const timeoutId = window.setTimeout(() => {
            if (versionCheckController) { try { versionCheckController.abort(); } catch (_) {} }
        }, 8000);

        fetch('https://api.github.com/repos/LceAn/LocalNavigationPage/releases/latest',
            versionCheckController ? { signal: versionCheckController.signal } : {})
            .then(response => response.json())
            .then(data => {
                const latestVersion = String(data.tag_name || '').replace(/^v/i, '');
                if (!latestVersion) throw new Error('版本数据为空');
                setSetting('versionCheckCache', {
                    latestVersion,
                    checkedAt: Date.now()
                });
                renderVersionStatus(latestVersion);
            })
            .catch(error => {
                console.error('版本检测失败:', error);
                const isTimeout = error && (error.name === 'AbortError');
                renderVersionCheckFailed(isTimeout ? '暂时无法检查更新' : '检测失败');
            })
            .finally(() => {
                window.clearTimeout(timeoutId);
                versionCheckController = null;
            });
    }

    function scheduleVersionCheck() {
        const cached = getSetting('versionCheckCache', null);
        const sixHours = 6 * 60 * 60 * 1000;
        if (cached?.latestVersion && Date.now() - cached.checkedAt < sixHours) {
            renderVersionStatus(cached.latestVersion);
            return;
        }

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(runVersionCheckNow, { timeout: 3000 });
        } else {
            window.setTimeout(runVersionCheckNow, 1200);
        }
    }

    scheduleVersionCheck();
    
    // 版本号比较函数
    function compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const num1 = parts1[i] || 0;
            const num2 = parts2[i] || 0;
            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }
        return 0;
    }

    // 主题选择功能
    const themeOptions = document.querySelectorAll('.theme-option');
    const savedTheme = getSetting('theme', 'light');

    themeOptions.forEach(option => {
        if (option.dataset.theme === savedTheme) {
            option.classList.add('selected');
        }
        // §5.3：自定义可点 div 补 ARIA + 可聚焦，便于屏幕阅读器与键盘
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.setAttribute('aria-pressed', option.classList.contains('selected') ? 'true' : 'false');
        option.addEventListener('click', () => applyThemeOption(option));
        // 键盘可达：Enter / Space 触发与点击相同的效果
        option.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                applyThemeOption(option);
            }
        });
    });

    function applyThemeOption(option) {
            themeOptions.forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            const theme = option.dataset.theme;
            setSetting('theme', theme);

            const body = document.body;
            if (theme === 'dark') {
                body.classList.add('dark-mode');
            } else if (theme === 'light') {
                body.classList.remove('dark-mode');
            } else if (theme === 'auto') {
                if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    body.classList.add('dark-mode');
                } else {
                    body.classList.remove('dark-mode');
                }
            }
            const isDark = body.classList.contains('dark-mode');
            setSetting('darkMode', isDark ? 'enabled' : 'disabled');
            const themeIcon = document.getElementById('theme-icon');
            if (themeIcon) {
                themeIcon.classList.toggle('ri-sun-line', !isDark);
                themeIcon.classList.toggle('ri-moon-line', isDark);
            }
            showMessage('主题已切换');
    }

    // 网站标题设置
    const siteTitleInput = document.getElementById('site-title-input');
    const savedTitle = getSetting('siteTitle', '我的导航');
    siteTitleInput.value = savedTitle;
    document.querySelector('.page-header h1').textContent = savedTitle;

    siteTitleInput.addEventListener('input', function() {
        const title = this.value.trim() || '我的导航';
        document.querySelector('.page-header h1').textContent = title;
        document.title = title;
        setSetting('siteTitle', title);
    });

    const showHomeTitleToggle = document.getElementById('show-home-title');
    const showHomeInfoToggle = document.getElementById('show-home-info');
    const showHomeSearchToggle = document.getElementById('show-home-search');

    function syncHomeFeatureControls(settings = loadHomeFeatureSettings()) {
        if (showHomeTitleToggle) showHomeTitleToggle.checked = settings.showTitle !== false;
        if (showHomeInfoToggle) showHomeInfoToggle.checked = settings.showInfoBar !== false;
        if (showHomeSearchToggle) showHomeSearchToggle.checked = settings.showSearch !== false;
    }

    function updateHomeFeatureSettings(patch, message) {
        const settings = { ...loadHomeFeatureSettings(), ...patch };
        saveHomeFeatureSettings(settings);
        applyHomeFeatureSettings(settings);
        syncHomeFeatureControls(settings);
        if (message) showMessage(message);
    }

    syncHomeFeatureControls();
    applyHomeFeatureSettings();

    if (showHomeTitleToggle) {
        showHomeTitleToggle.addEventListener('change', function() {
            updateHomeFeatureSettings(
                { showTitle: this.checked },
                this.checked ? '已显示首页标题' : '已隐藏首页标题'
            );
        });
    }

    if (showHomeInfoToggle) {
        showHomeInfoToggle.addEventListener('change', function() {
            updateHomeFeatureSettings(
                { showInfoBar: this.checked },
                this.checked ? '已显示首页信息条' : '已隐藏首页信息条'
            );
        });
    }

    if (showHomeSearchToggle) {
        showHomeSearchToggle.addEventListener('change', function() {
            updateHomeFeatureSettings(
                { showSearch: this.checked },
                this.checked ? '已显示搜索框' : '已隐藏搜索框'
            );
        });
    }

    // 首页视觉设置
    const homeBackgroundStyleSelect = document.getElementById('home-background-style');
    const homeGlassEffectToggle = document.getElementById('home-glass-effect');
    const homeLiquidEffectToggle = document.getElementById('home-liquid-effect');
    const homeDeepShadowToggle = document.getElementById('home-deep-shadow');
    const homeBlurStrengthInput = document.getElementById('home-blur-strength');
    const homeBlurValue = document.getElementById('home-blur-value');
    const homeVisualClassNames = [
        'homepage-background-clean',
        'homepage-background-soft',
        'homepage-background-mesh',
        'homepage-background-focus',
        'home-glass-enabled',
        'home-liquid-enabled',
        'home-shadow-deep'
    ];
    const defaultHomeVisualSettings = {
        backgroundStyle: 'soft',
        glassEffect: true,
        liquidEffect: false,
        deepShadow: false,
        blurStrength: 12
    };

    function loadHomeVisualSettings() {
        const saved = getSetting('homeVisualSettings', {}) || {};
        const settings = { ...defaultHomeVisualSettings, ...saved };
        if (!['clean', 'soft', 'mesh', 'focus'].includes(settings.backgroundStyle)) {
            settings.backgroundStyle = defaultHomeVisualSettings.backgroundStyle;
        }
        const blurStrength = Number.parseInt(settings.blurStrength, 10);
        settings.blurStrength = Number.isFinite(blurStrength)
            ? Math.min(24, Math.max(0, blurStrength))
            : defaultHomeVisualSettings.blurStrength;
        settings.glassEffect = settings.glassEffect !== false;
        settings.liquidEffect = Boolean(settings.liquidEffect);
        settings.deepShadow = Boolean(settings.deepShadow);
        return settings;
    }

    function saveHomeVisualSettings(settings) {
        setSetting('homeVisualSettings', settings);
    }

    function applyHomeVisualSettings(settings = loadHomeVisualSettings()) {
        const body = document.body;
        body.classList.remove(...homeVisualClassNames);
        body.classList.add(`homepage-background-${settings.backgroundStyle}`);
        body.classList.toggle('home-glass-enabled', settings.glassEffect);
        body.classList.toggle('home-liquid-enabled', settings.liquidEffect);
        body.classList.toggle('home-shadow-deep', settings.deepShadow);
        document.documentElement.style.setProperty('--home-glass-blur', `${settings.blurStrength}px`);
        if (homeBlurValue) {
            homeBlurValue.textContent = `${settings.blurStrength}px`;
        }
    }

    function syncHomeVisualControls(settings = loadHomeVisualSettings()) {
        if (homeBackgroundStyleSelect) homeBackgroundStyleSelect.value = settings.backgroundStyle;
        if (homeGlassEffectToggle) homeGlassEffectToggle.checked = settings.glassEffect;
        if (homeLiquidEffectToggle) homeLiquidEffectToggle.checked = settings.liquidEffect;
        if (homeDeepShadowToggle) homeDeepShadowToggle.checked = settings.deepShadow;
        if (homeBlurStrengthInput) homeBlurStrengthInput.value = settings.blurStrength;
        if (homeBlurValue) homeBlurValue.textContent = `${settings.blurStrength}px`;
    }

    function updateHomeVisualSettings(patch, message) {
        const settings = { ...loadHomeVisualSettings(), ...patch };
        saveHomeVisualSettings(settings);
        applyHomeVisualSettings(settings);
        syncHomeVisualControls(settings);
        if (message) showMessage(message);
    }

    applyHomeVisualSettings();
    syncHomeVisualControls();

    if (homeBackgroundStyleSelect) {
        homeBackgroundStyleSelect.addEventListener('change', function() {
            updateHomeVisualSettings({ backgroundStyle: this.value }, '已更新首页背景');
        });
    }

    if (homeGlassEffectToggle) {
        homeGlassEffectToggle.addEventListener('change', function() {
            updateHomeVisualSettings({ glassEffect: this.checked }, this.checked ? '已启用首页玻璃质感' : '已关闭首页玻璃质感');
        });
    }

    if (homeLiquidEffectToggle) {
        homeLiquidEffectToggle.addEventListener('change', function() {
            updateHomeVisualSettings({ liquidEffect: this.checked }, this.checked ? '已启用液态背景' : '已关闭液态背景');
        });
    }

    if (homeDeepShadowToggle) {
        homeDeepShadowToggle.addEventListener('change', function() {
            updateHomeVisualSettings({ deepShadow: this.checked }, this.checked ? '已增强首页阴影' : '已恢复柔和阴影');
        });
    }

    if (homeBlurStrengthInput) {
        homeBlurStrengthInput.addEventListener('input', function() {
            const blurStrength = Number.parseInt(this.value, 10) || 0;
            document.documentElement.style.setProperty('--home-glass-blur', `${blurStrength}px`);
            if (homeBlurValue) {
                homeBlurValue.textContent = `${blurStrength}px`;
            }
        });
        homeBlurStrengthInput.addEventListener('change', function() {
            updateHomeVisualSettings({ blurStrength: Number.parseInt(this.value, 10) || 0 }, '已更新玻璃模糊强度');
        });
    }

    // 布局选项功能
    const compactModeToggle = document.getElementById('compact-mode');
    const showThumbnailsToggle = document.getElementById('show-thumbnails');
    const enableAnimationsToggle = document.getElementById('enable-animations');

    function applyCompactMode(enabled) {
        document.body.classList.toggle('compact-mode', Boolean(enabled));
    }

    function applyAnimationSetting(enabled) {
        document.body.classList.toggle('animations-off', !enabled);
        document.body.style.setProperty('--transition-fast', enabled ? '0.15s' : '0s');
        document.body.style.setProperty('--transition-normal', enabled ? '0.25s' : '0s');
    }

    if (compactModeToggle) {
        compactModeToggle.checked = getSetting('compactMode', false) === true;
        applyCompactMode(compactModeToggle.checked);
        compactModeToggle.addEventListener('change', function() {
            applyCompactMode(this.checked);
            setSetting('compactMode', this.checked);
            showMessage(this.checked ? '已启用紧凑模式' : '已禁用紧凑模式');
        });
    }

    // 显示缩略图功能
    if (showThumbnailsToggle) {
        function applyThumbnailSetting(show) {
            const thumbnails = document.querySelectorAll('.link-card-thumbnail');
            thumbnails.forEach(thumb => {
                if (show) {
                    thumb.style.display = 'block';
                } else {
                    thumb.style.display = 'none';
                }
            });
        }

        showThumbnailsToggle.addEventListener('change', function() {
            setSetting('showThumbnails', this.checked);
            applyThumbnailSetting(this.checked);
            showMessage(this.checked ? '已显示缩略图' : '已隐藏缩略图');
        });
        showThumbnailsToggle.checked = getSetting('showThumbnails', true) !== false;
        // 初始化应用缩略图设置
        applyThumbnailSetting(showThumbnailsToggle.checked);
    }

    // 显示最近使用快捷行
    const showRecentLinksToggle = document.getElementById('show-recent-links');
    if (showRecentLinksToggle) {
        function applyRecentLinksSetting(show) {
            const container = document.getElementById('recent-links');
            if (container && !show) {
                container.hidden = true;
            } else if (container && show && typeof links !== 'undefined') {
                renderRecentLinks(links);
            }
        }
        showRecentLinksToggle.checked = getSetting('showRecentLinks', true) !== false;
        applyRecentLinksSetting(showRecentLinksToggle.checked);
        showRecentLinksToggle.addEventListener('change', function() {
            setSetting('showRecentLinks', this.checked);
            applyRecentLinksSetting(this.checked);
            showMessage(this.checked ? '已显示最近使用' : '已隐藏最近使用');
        });
    }

    // 搜索按钮图标模式（仅图标 / 图标+文字 / 仅文字）
    const searchButtonIconModeSelect = document.getElementById('search-button-icon-mode');
    if (searchButtonIconModeSelect) {
        searchButtonIconModeSelect.value = getSearchButtonIconMode();
        searchButtonIconModeSelect.addEventListener('change', function() {
            setSetting('searchButtonIconMode', this.value);
            updateSearchButtons();
            const labels = { 'text': '仅文字', 'logo': '仅图标', 'logo-text': '图标 + 文字' };
            showMessage('搜索按钮图标：' + (labels[this.value] || ''));
        });
    }

    if (enableAnimationsToggle) {
        enableAnimationsToggle.checked = getSetting('enableAnimations', true) !== false;
        applyAnimationSetting(enableAnimationsToggle.checked);
        enableAnimationsToggle.addEventListener('change', function() {
            applyAnimationSetting(this.checked);
            setSetting('enableAnimations', this.checked);
            showMessage(this.checked ? '已启用动画' : '已禁用动画');
        });
    }

    // ================================
    // 新增设置功能
    // ================================
    
    // 页面位置设置
    const pagePositionSelect = document.getElementById('page-position-select');
    if (pagePositionSelect) {
        const savedPosition = getSetting('contentPosition', 'default');
        pagePositionSelect.value = savedPosition;

        // 刷新时恢复布局位置（此前只设了 select 值，没给 .container 加类）
        const positionContainer = document.querySelector('.container');
        if (positionContainer) {
            positionContainer.classList.add(`content-position-${savedPosition}`);
        }

        pagePositionSelect.addEventListener('change', function() {
            const position = this.value;
            setSetting('contentPosition', position);
            
            const container = document.querySelector('.container');
            container.classList.remove('content-position-default', 'content-position-top', 'content-position-bottom');
            container.classList.add(`content-position-${position}`);
            
            let message = '';
            switch(position) {
                case 'top': message = '内容已切换为靠上布局'; break;
                case 'default': message = '内容已切换为标准布局'; break;
                case 'bottom': message = '内容已切换为靠下布局'; break;
            }
            showMessage(message);
        });
    }

    // 首页布局设置（密度 / 点击空白收起）
    const homeDensitySelect = document.getElementById('home-density-select');
    const homeClickBlankCollapseToggle = document.getElementById('home-click-blank-collapse');
    const homeCategoryToggle = document.getElementById('home-category-toggle');

    function syncHomeLayoutControls(settings = loadHomeLayoutSettings()) {
        if (homeDensitySelect) homeDensitySelect.value = settings.density;
        if (homeClickBlankCollapseToggle) homeClickBlankCollapseToggle.checked = settings.clickBlankToCollapse !== false;
    }

    // 初始化一次：把存储里的密度/展开状态应用到首页
    {
        const homeLayoutSettings = loadHomeLayoutSettings();
        syncHomeLayoutControls(homeLayoutSettings);
        applyHomeCategoryDisplayMode(homeLayoutSettings);
    }

    if (homeDensitySelect) {
        homeDensitySelect.addEventListener('change', function() {
            const settings = { ...loadHomeLayoutSettings(), density: this.value };
            saveHomeLayoutSettings(settings);
            applyHomeCategoryDisplayMode(settings);

            const densityMessages = {
                balanced: '首页已切换为均衡密度',
                compact: '首页已切换为紧凑密度',
                spacious: '首页已切换为舒展密度'
            };
            showMessage(densityMessages[this.value] || '已更新首页密度');
        });
    }

    if (homeClickBlankCollapseToggle) {
        homeClickBlankCollapseToggle.addEventListener('change', function() {
            const settings = { ...loadHomeLayoutSettings(), clickBlankToCollapse: this.checked };
            saveHomeLayoutSettings(settings);
            showMessage(this.checked ? '已启用空白区域收起分组' : '已关闭空白区域收起分组');
        });
    }

    // 极简模式：只保留左下角搜索图标 + 右上角设置按钮（悬停展开），其余元素隐藏
    const minimalModeToggle = document.getElementById('minimal-mode-toggle');
    const minimalSearchEl = document.getElementById('minimal-search');
    const minimalClockBg = document.getElementById('minimal-clock-bg');
    const minimalWave = document.getElementById('minimal-wave');
    const minimalClockOrientSel = document.getElementById('minimal-clock-orient');
    const minimalClockPosSel = document.getElementById('minimal-clock-position');

    // 把两位数字拆成单字符 span（逐字竖排时每字符独占一行）
    function glyphSpans(str) {
        return Array.from(str).map(ch => {
            const sp = document.createElement('span');
            sp.className = 'minimal-clock-glyph';
            sp.textContent = ch;
            return sp;
        });
    }
    // 小圆点分隔符（竖排时用时/分之间，比孤立的冒号优雅）
    function dotDivider() {
        const d = document.createElement('span');
        d.className = 'minimal-clock-dot';
        d.setAttribute('aria-hidden', 'true');
        return d;
    }

    // 重建极简时钟 DOM 结构以匹配方向：竖排两行 / 逐字竖排 / 横排
    let minimalClockTimer = null;
    function renderMinimalClock() {
        if (!minimalClockBg) return;
        const orient = getSetting('minimalClockOrient', 'vertical-two');
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        minimalClockBg.innerHTML = '';

        if (orient === 'horizontal') {
            // 横排：单行，数字等宽不跳动，冒号着色弱化
            const line = document.createElement('div');
            line.className = 'minimal-clock-line';
            line.innerHTML =
                `<span class="minimal-clock-seg">${h}</span>` +
                `<span class="minimal-clock-colon">:</span>` +
                `<span class="minimal-clock-seg">${m}</span>` +
                `<span class="minimal-clock-colon minimal-clock-colon--sec">:</span>` +
                `<span class="minimal-clock-seg minimal-clock-seg--sec">${s}</span>`;
            minimalClockBg.appendChild(line);
        } else if (orient === 'vertical-glyph') {
            // 逐字竖排：每位数字独占一行，时/分之间用小圆点分隔
            const wrap = document.createElement('div');
            wrap.className = 'minimal-clock-glyphs';
            glyphSpans(h).forEach(sp => wrap.appendChild(sp));
            wrap.appendChild(dotDivider());
            glyphSpans(m).forEach(sp => wrap.appendChild(sp));
            minimalClockBg.appendChild(wrap);
            const sec = document.createElement('div');
            sec.className = 'minimal-clock-seconds';
            sec.textContent = s;
            minimalClockBg.appendChild(sec);
        } else {
            // 竖排两行（默认）：HH 叠·点·MM 叠，秒数小号附在底部
            const wrap = document.createElement('div');
            wrap.className = 'minimal-clock-glyphs';
            glyphSpans(h).forEach(sp => wrap.appendChild(sp));
            wrap.appendChild(dotDivider());
            glyphSpans(m).forEach(sp => wrap.appendChild(sp));
            minimalClockBg.appendChild(wrap);
            const sec = document.createElement('div');
            sec.className = 'minimal-clock-seconds';
            sec.textContent = s;
            minimalClockBg.appendChild(sec);
        }
    }
    function updateMinimalClock() {
        // 仅在可见时刷新，方向切换时由 renderMinimalClock 重建 DOM
        if (!minimalClockBg || minimalClockBg.hidden) return;
        renderMinimalClock();
    }
    // 应用方向/位置到 body 的 data 属性（CSS 据此布局，且不会被 JS inline 样式覆盖）
    function applyMinimalClockStyle() {
        const orient = getSetting('minimalClockOrient', 'vertical-two');
        const pos = getSetting('minimalClockPosition', 'left-center');
        document.body.dataset.minClockOrient = orient;
        document.body.dataset.minClockPos = pos;
    }
    function applyMinimalMode(enabled) {
        document.body.classList.toggle('minimal-mode', enabled);
        if (minimalSearchEl) minimalSearchEl.hidden = !enabled;
        if (minimalClockBg) minimalClockBg.hidden = !enabled;
        if (minimalWave) minimalWave.hidden = !enabled;
        // §3.3：极简子项改为「禁用态」而非隐藏——由 body.minimal-mode 类驱动 CSS 的灰禁用/激活，
        // 此处只需同步子项控件的 disabled 属性，保证灰态下不可操作。
        document.querySelectorAll('.minimal-sub-option[data-gate="minimal-mode-toggle"]').forEach(el => {
            el.querySelectorAll('input, select, button').forEach(ctrl => { ctrl.disabled = !enabled; });
        });
        if (enabled) {
            applyMinimalClockStyle();
            renderMinimalClock();
            if (!minimalClockTimer) {
                minimalClockTimer = setInterval(updateMinimalClock, 1000);
            }
        } else if (minimalClockTimer) {
            clearInterval(minimalClockTimer);
            minimalClockTimer = null;
        }
    }
    if (minimalModeToggle) {
        // 恢复上次状态
        const minimalOn = getSetting('minimalMode', false) === true;
        minimalModeToggle.checked = minimalOn;
        applyMinimalMode(minimalOn);
        minimalModeToggle.addEventListener('change', function() {
            setSetting('minimalMode', this.checked);
            applyMinimalMode(this.checked);
            showMessage(this.checked ? '已开启极简模式' : '已关闭极简模式');
        });
    }
    // 时钟方向/位置选择
    if (minimalClockOrientSel) {
        minimalClockOrientSel.value = getSetting('minimalClockOrient', 'vertical-two');
        minimalClockOrientSel.addEventListener('change', function() {
            setSetting('minimalClockOrient', this.value);
            applyMinimalClockStyle();
            renderMinimalClock();
        });
    }
    if (minimalClockPosSel) {
        minimalClockPosSel.value = getSetting('minimalClockPosition', 'left-center');
        minimalClockPosSel.addEventListener('change', function() {
            setSetting('minimalClockPosition', this.value);
            applyMinimalClockStyle();
        });
    }

    // 极简模式：搜索表单提交 → 用设置里的默认搜索引擎搜索（在「搜索引擎」设置中切换默认引擎）
    const minimalSearchForm = document.getElementById('minimal-search-form');
    const minimalSearchInput = document.getElementById('minimal-search-input');
    if (minimalSearchForm) {
        minimalSearchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const query = minimalSearchInput.value.trim();
            if (!query) return;
            const engine = getDefaultSearchEngine();
            if (engine) {
                const searchInput = document.getElementById('search-input');
                if (searchInput) { searchInput.value = query; }
                performSearch(engine);
            } else {
                showMessage('暂无可用搜索引擎');
            }
        });
    }

    if (homeCategoryToggle) {
        homeCategoryToggle.addEventListener('click', function() {
            const nextOpen = !document.body.classList.contains('home-categories-open');
            setHomeCategoryTrayOpen(nextOpen);
            applyHomeCategoryDisplayMode();
            // 打开时若启用了「展开首个分类」，自动展开第一张手风琴卡
            if (nextOpen && getSetting('defaultExpandFirst', false) === true) {
                requestAnimationFrame(() => {
                    const firstCategory = document.querySelector('.category-container');
                    if (firstCategory && !firstCategory.classList.contains('expanded')) {
                        toggleCategoryAccordion(firstCategory);
                    }
                });
            }
            showMessage(nextOpen ? '已显示分组' : '已收起分组');
        });
    }

    function dismissHomeCategoryTray(options = {}) {
        const settings = loadHomeLayoutSettings();
        const canDismiss = settings.clickBlankToCollapse !== false
            && document.body.classList.contains('home-categories-open');

        if (!canDismiss) return false;

        closeCategoryPanel(false);
        collapseAllCategoryAccordions();
        setHomeCategoryTrayOpen(false);
        applyHomeCategoryDisplayMode(settings);

        if (options.message) {
            showMessage('已收起分组');
        }

        return true;
    }

    window.dismissHomeCategoryTray = dismissHomeCategoryTray;

    document.addEventListener('click', event => {
        const settings = loadHomeLayoutSettings();
        const canDismiss = settings.clickBlankToCollapse !== false
            && document.body.classList.contains('home-categories-open');

        if (!canDismiss || event.defaultPrevented) return;

        const interactiveArea = event.target.closest([
            '.category-container',
            '.category-panel',
            '.search-container-wrapper',
            '.view-tabs',
            '.recent-links',
            '#launcher',
            '.top-right-buttons',
            '#settings-container',
            '#message-container',
            '.dropdown-menu',
            '.url-dropdown'
        ].join(','));

        if (interactiveArea) return;

        dismissHomeCategoryTray();
    }, { passive: true });
    
    // 默认展开所有分类设置
    const defaultExpandFirstToggle = document.getElementById('default-expand-first');
    if (defaultExpandFirstToggle) {
        defaultExpandFirstToggle.checked = getSetting('defaultExpandFirst', false) === true;

        defaultExpandFirstToggle.addEventListener('change', function() {
            setSetting('defaultExpandFirst', this.checked);
            if (this.checked) {
                toggleAllCategories(true);
                showMessage('已打开第一个分组');
            } else {
                toggleAllCategories(false);
                showMessage('已收起分组');
            }
        });
    }
    
    // 右上角按钮管理
    const showToggleAllBtn = document.getElementById('show-toggle-all-btn');
    const showPositionBtn = document.getElementById('show-position-btn');
    const showThemeBtn = document.getElementById('show-theme-btn');
    const showBackToTopBtn = document.getElementById('show-back-to-top-btn');
    const showSettingsBtn = document.getElementById('show-settings-btn');
    const topButtonList = document.getElementById('top-button-list');
    const addTopButtonBtn = document.getElementById('add-top-button-btn');
    const topButtonModal = document.getElementById('top-button-modal');
    const topButtonModalTitle = document.getElementById('top-button-modal-title');
    const topButtonModalCloseBtn = document.getElementById('top-button-modal-close-btn');
    const topButtonCancelBtn = document.getElementById('top-button-cancel-btn');
    const topButtonSaveBtn = document.getElementById('top-button-save-btn');
    const topButtonLabelInput = document.getElementById('top-button-label');
    const topButtonUrlInput = document.getElementById('top-button-url');
    const topButtonIconInput = document.getElementById('top-button-icon');
    const defaultTopButtonSettings = {
        system: {
            toggleAll: true,
            position: true,
            theme: true,
            backToTop: true,
            settings: true
        },
        customButtons: []
    };

    function sanitizeIconClass(iconClass, fallback = 'ri-star-line') {
        const value = String(iconClass || '').trim();
        return /^ri-[a-z0-9-]+$/i.test(value) ? value : fallback;
    }

    function normalizeCustomTopButtons(buttons) {
        return (Array.isArray(buttons) ? buttons : [])
            .filter(button => button && String(button.label || '').trim() && String(button.url || '').trim())
            .map((button, index) => ({
                id: String(button.id || `top-button-${Date.now()}-${index}`),
                label: String(button.label).trim(),
                url: String(button.url).trim(),
                icon: sanitizeIconClass(button.icon),
                enabled: button.enabled !== false
            }));
    }

    function loadTopButtonSettings() {
        const saved = getSetting(TOP_BUTTON_SETTINGS_KEY, {}) || {};
        const legacyButtonVisibility = getSetting('buttonVisibility', null);
        const hasSavedSystem = saved?.system && typeof saved.system === 'object';
        const system = {
            ...defaultTopButtonSettings.system,
            ...(hasSavedSystem ? saved.system : {})
        };

        if (!hasSavedSystem && legacyButtonVisibility) {
            system.toggleAll = legacyButtonVisibility.toggleAll !== false;
            system.position = legacyButtonVisibility.position !== false;
        }

        const showThemeBtnLegacy = getSetting('showThemeBtn', null);
        if (!hasSavedSystem && showThemeBtnLegacy !== null && showThemeBtnLegacy !== undefined) {
            system.theme = showThemeBtnLegacy !== 'false';
        }

        return {
            system,
            customButtons: normalizeCustomTopButtons(saved?.customButtons)
        };
    }

    function saveTopButtonSettings(settings) {
        setSetting(TOP_BUTTON_SETTINGS_KEY, {
            system: {
                ...defaultTopButtonSettings.system,
                ...settings.system
            },
            customButtons: normalizeCustomTopButtons(settings.customButtons)
        });
    }

    function renderCustomTopButtons(settings = loadTopButtonSettings()) {
        const functionButtons = document.querySelector('.function-buttons');
        if (!functionButtons) return;

        functionButtons.querySelectorAll('.custom-top-button').forEach(button => button.remove());

        const visibleButtons = settings.customButtons.filter(button => button.enabled !== false);
        if (!visibleButtons.length) return;

        const fragment = document.createDocumentFragment();
        visibleButtons.forEach(buttonConfig => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'icon-button custom-top-button';
            button.title = buttonConfig.label;
            button.setAttribute('aria-label', buttonConfig.label);
            button.innerHTML = `<i class="${sanitizeIconClass(buttonConfig.icon)}"></i>`;
            button.addEventListener('click', () => openSafeUrl(buttonConfig.url));
            fragment.appendChild(button);
        });

        const firstSystemButton = document.getElementById('toggle-all-groups') || document.getElementById('position-button');
        functionButtons.insertBefore(fragment, firstSystemButton);
    }

    function updateTopButtonChrome() {
        const topRightButtons = document.querySelector('.top-right-buttons');
        const functionButtons = document.querySelector('.function-buttons');
        const settingsButtons = document.querySelector('.settings-buttons');
        const divider = document.querySelector('.button-divider');
        if (!topRightButtons || !functionButtons || !settingsButtons || !divider) return;

        const hasVisibleFunctionButton = [...functionButtons.children].some(button => {
            return window.getComputedStyle(button).display !== 'none';
        });
        const hasVisibleSettingsButton = [...settingsButtons.children].some(button => {
            return window.getComputedStyle(button).display !== 'none';
        });

        functionButtons.style.display = hasVisibleFunctionButton ? 'flex' : 'none';
        settingsButtons.style.display = hasVisibleSettingsButton ? 'flex' : 'none';
        divider.style.display = hasVisibleFunctionButton && hasVisibleSettingsButton ? 'block' : 'none';
        topRightButtons.style.display = hasVisibleFunctionButton || hasVisibleSettingsButton ? 'flex' : 'none';
    }

    function applyTopButtonSettings(settings = loadTopButtonSettings()) {
        renderCustomTopButtons(settings);

        const toggleAllBtn = document.getElementById('toggle-all-groups');
        const positionBtn = document.getElementById('position-button');
        const themeBtn = document.getElementById('toggle-mode');
        const settingsBtn = document.getElementById('open-settings');
        const backToTopBtn = document.getElementById('back-to-top');

        if (toggleAllBtn) toggleAllBtn.style.display = settings.system.toggleAll !== false ? 'flex' : 'none';
        if (positionBtn) positionBtn.style.display = settings.system.position !== false ? 'flex' : 'none';
        if (themeBtn) themeBtn.style.display = settings.system.theme !== false ? 'flex' : 'none';
        if (settingsBtn) settingsBtn.style.display = settings.system.settings !== false ? 'flex' : 'none';
        if (backToTopBtn) {
            backToTopBtn.style.display = settings.system.backToTop !== false ? 'flex' : 'none';
            if (settings.system.backToTop === false) {
                backToTopBtn.classList.remove('show');
            }
        }

        updateTopButtonChrome();
    }

    function syncTopButtonControls(settings = loadTopButtonSettings()) {
        if (showToggleAllBtn) showToggleAllBtn.checked = settings.system.toggleAll !== false;
        if (showPositionBtn) showPositionBtn.checked = settings.system.position !== false;
        if (showThemeBtn) showThemeBtn.checked = settings.system.theme !== false;
        if (showBackToTopBtn) showBackToTopBtn.checked = settings.system.backToTop !== false;
        if (showSettingsBtn) showSettingsBtn.checked = settings.system.settings !== false;
    }

    function renderTopButtonSettingsList(settings = loadTopButtonSettings()) {
        if (!topButtonList) return;

        const buttons = settings.customButtons;
        topButtonList.replaceChildren();

        if (!buttons.length) {
            const empty = document.createElement('div');
            empty.className = 'top-button-empty';
            empty.innerHTML = '<i class="ri-function-add-line"></i><span>暂无自定义按钮</span>';
            topButtonList.appendChild(empty);
            return;
        }

        buttons.forEach((buttonConfig, index) => {
            const item = document.createElement('div');
            item.className = 'top-button-item';
            item.dataset.id = buttonConfig.id;
            item.innerHTML = `
                <div class="top-button-preview">
                    <i class="${sanitizeIconClass(buttonConfig.icon)}"></i>
                </div>
                <div class="top-button-info">
                    <h4>${escapeHTML(buttonConfig.label)}</h4>
                    <p>${escapeHTML(formatUrlForDisplay(buttonConfig.url))}</p>
                </div>
                <div class="top-button-actions">
                    <label class="toggle-switch mini" title="显示按钮">
                        <input type="checkbox" class="top-button-enabled" data-id="${escapeHTML(buttonConfig.id)}" ${buttonConfig.enabled !== false ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <button type="button" class="top-button-action" data-action="up" data-id="${escapeHTML(buttonConfig.id)}" title="上移" ${index === 0 ? 'disabled' : ''}>
                        <i class="ri-arrow-up-line"></i>
                    </button>
                    <button type="button" class="top-button-action" data-action="down" data-id="${escapeHTML(buttonConfig.id)}" title="下移" ${index === buttons.length - 1 ? 'disabled' : ''}>
                        <i class="ri-arrow-down-line"></i>
                    </button>
                    <button type="button" class="top-button-action" data-action="edit" data-id="${escapeHTML(buttonConfig.id)}" title="编辑">
                        <i class="ri-edit-line"></i>
                    </button>
                    <button type="button" class="top-button-action danger" data-action="delete" data-id="${escapeHTML(buttonConfig.id)}" title="删除">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            `;
            topButtonList.appendChild(item);
        });

        topButtonList.querySelectorAll('.top-button-enabled').forEach(input => {
            input.addEventListener('change', function() {
                const nextSettings = loadTopButtonSettings();
                const target = nextSettings.customButtons.find(button => button.id === this.dataset.id);
                if (target) {
                    target.enabled = this.checked;
                    saveTopButtonSettings(nextSettings);
                    applyTopButtonSettings(nextSettings);
                    renderTopButtonSettingsList(nextSettings);
                    showMessage(this.checked ? '已显示自定义按钮' : '已隐藏自定义按钮');
                }
            });
        });

        topButtonList.querySelectorAll('.top-button-action').forEach(button => {
            button.addEventListener('click', function() {
                const nextSettings = loadTopButtonSettings();
                const index = nextSettings.customButtons.findIndex(item => item.id === this.dataset.id);
                if (index < 0) return;

                const action = this.dataset.action;
                if (action === 'edit') {
                    openEditTopButtonModal(nextSettings.customButtons[index]);
                    return;
                }
                if (action === 'delete') {
                    if (!confirm(`确定要删除 "${nextSettings.customButtons[index].label}" 吗？`)) return;
                    nextSettings.customButtons.splice(index, 1);
                    showMessage('已删除自定义按钮');
                }
                if (action === 'up' && index > 0) {
                    [nextSettings.customButtons[index - 1], nextSettings.customButtons[index]] = [nextSettings.customButtons[index], nextSettings.customButtons[index - 1]];
                    showMessage('已调整按钮顺序');
                }
                if (action === 'down' && index < nextSettings.customButtons.length - 1) {
                    [nextSettings.customButtons[index], nextSettings.customButtons[index + 1]] = [nextSettings.customButtons[index + 1], nextSettings.customButtons[index]];
                    showMessage('已调整按钮顺序');
                }

                saveTopButtonSettings(nextSettings);
                applyTopButtonSettings(nextSettings);
                renderTopButtonSettingsList(nextSettings);
            });
        });
    }

    function updateSystemTopButtonSetting(key, checked, message) {
        const settings = loadTopButtonSettings();
        settings.system[key] = checked;
        saveTopButtonSettings(settings);
        syncTopButtonControls(settings);
        applyTopButtonSettings(settings);
        showMessage(message);
    }

    const systemButtonControls = [
        { element: showToggleAllBtn, key: 'toggleAll', on: '已显示分组入口按钮', off: '已隐藏分组入口按钮' },
        { element: showPositionBtn, key: 'position', on: '已显示布局调整按钮', off: '已隐藏布局调整按钮' },
        { element: showThemeBtn, key: 'theme', on: '已显示昼夜模式按钮', off: '已隐藏昼夜模式按钮' },
        { element: showBackToTopBtn, key: 'backToTop', on: '已显示回到顶部按钮', off: '已隐藏回到顶部按钮' },
        { element: showSettingsBtn, key: 'settings', on: '已显示设置按钮', off: '已隐藏设置按钮，可按 Ctrl/Cmd + , 打开设置' }
    ];

    systemButtonControls.forEach(({ element, key, on, off }) => {
        if (!element) return;
        element.addEventListener('change', function() {
            updateSystemTopButtonSetting(key, this.checked, this.checked ? on : off);
        });
    });

    function openAddTopButtonModal() {
        if (!topButtonModal) return;
        window.editingTopButtonId = null;
        topButtonModalTitle.innerHTML = '<i class="ri-add-circle-line"></i><span>添加首页按钮</span>';
        topButtonLabelInput.value = '';
        topButtonUrlInput.value = '';
        topButtonIconInput.value = '';
        topButtonModal.style.display = 'flex';
        requestAnimationFrame(() => topButtonModal.classList.add('show'));
    }

    function openEditTopButtonModal(buttonConfig) {
        if (!topButtonModal || !buttonConfig) return;
        window.editingTopButtonId = buttonConfig.id;
        topButtonModalTitle.innerHTML = '<i class="ri-edit-circle-line"></i><span>编辑首页按钮</span>';
        topButtonLabelInput.value = buttonConfig.label;
        topButtonUrlInput.value = buttonConfig.url;
        topButtonIconInput.value = buttonConfig.icon;
        topButtonModal.style.display = 'flex';
        requestAnimationFrame(() => topButtonModal.classList.add('show'));
    }

    function closeTopButtonModal() {
        if (!topButtonModal) return;
        topButtonModal.classList.remove('show');
        setTimeout(() => {
            topButtonModal.style.display = 'none';
            window.editingTopButtonId = null;
        }, 250);
    }

    function saveTopButtonFromModal() {
        const label = topButtonLabelInput.value.trim();
        const url = topButtonUrlInput.value.trim();
        const icon = sanitizeIconClass(topButtonIconInput.value);

        if (!label || !url) {
            showMessage('请填写按钮名称和地址');
            return;
        }

        if (!isSafeUrl(url)) {
            showMessage('按钮地址格式无效');
            return;
        }

        const settings = loadTopButtonSettings();
        const editingId = window.editingTopButtonId;
        if (editingId) {
            const target = settings.customButtons.find(button => button.id === editingId);
            if (target) {
                target.label = label;
                target.url = url;
                target.icon = icon;
            }
            showMessage('已更新首页按钮');
        } else {
            settings.customButtons.push({
                id: `top-button-${Date.now()}`,
                label,
                url,
                icon,
                enabled: true
            });
            showMessage('已添加首页按钮');
        }

        saveTopButtonSettings(settings);
        closeTopButtonModal();
        syncTopButtonControls(settings);
        applyTopButtonSettings(settings);
        renderTopButtonSettingsList(settings);
    }

    if (addTopButtonBtn) addTopButtonBtn.addEventListener('click', openAddTopButtonModal);
    if (topButtonModalCloseBtn) topButtonModalCloseBtn.addEventListener('click', closeTopButtonModal);
    if (topButtonCancelBtn) topButtonCancelBtn.addEventListener('click', closeTopButtonModal);
    if (topButtonSaveBtn) topButtonSaveBtn.addEventListener('click', saveTopButtonFromModal);
    if (topButtonModal) {
        topButtonModal.addEventListener('click', event => {
            if (event.target === topButtonModal) closeTopButtonModal();
        });
    }

    syncTopButtonControls();
    renderTopButtonSettingsList();

    // ================================
    // 搜索引擎管理功能
    // ================================
    const searchEngineModal = document.getElementById('search-engine-modal');
    const searchEngineModalTitle = document.getElementById('search-engine-modal-title');
    const searchEngineModalCloseBtn = document.getElementById('search-engine-modal-close-btn');
    const addSearchEngineBtn = document.getElementById('add-search-engine-btn');
    const searchEngineSaveBtn = document.getElementById('search-engine-save-btn');
    const searchEngineCancelBtn = document.getElementById('search-engine-cancel-btn');
    const searchEngineNameInput = document.getElementById('search-engine-name');
    const searchEngineUrlInput = document.getElementById('search-engine-url');
    const searchEngineIconInput = document.getElementById('search-engine-icon');
    const searchEngineList = document.getElementById('search-engine-list');
    
    // 默认搜索引擎列表
    const defaultSearchEngines = [
        { name: '百度', url: 'https://www.baidu.com/s?wd=%s', icon: '' },
        { name: 'Google', url: 'https://www.google.com/search?q=%s', icon: '' },
        { name: '必应', url: 'https://www.bing.com/search?q=%s', icon: '' }
    ];
    
    // 加载搜索引擎
    function loadSearchEngines() {
        const saved = getSetting('searchEngines', null);
        const engines = Array.isArray(saved) ? saved : defaultSearchEngines;
        return engines
            .filter(engine => engine && engine.name && engine.url)
            .map(engine => ({
                name: String(engine.name).trim(),
                url: String(engine.url).trim(),
                icon: String(engine.icon || '').trim()
            }));
    }

    // 获取当前默认搜索引擎（按名称匹配，找不到则回退到第一个）
    function getDefaultSearchEngine() {
        const engines = loadSearchEngines();
        if (!engines.length) return null;
        const savedName = getSetting('defaultSearchEngine', '');
        if (savedName) {
            const found = engines.find(engine => engine.name === savedName);
            if (found) return found;
        }
        return engines[0];
    }

    // 渲染"默认引擎"下拉：选项=当前所有引擎
    function renderDefaultEngineSelect() {
        const select = document.getElementById('default-search-engine');
        if (!select) return;
        const engines = loadSearchEngines();
        const savedName = getSetting('defaultSearchEngine', '');
        const selectedName = (savedName && engines.some(e => e.name === savedName))
            ? savedName
            : (engines[0]?.name || '');

        select.innerHTML = engines.map(engine =>
            `<option value="${escapeHTML(engine.name)}"${engine.name === selectedName ? ' selected' : ''}>${escapeHTML(engine.name)}</option>`
        ).join('');

        updateTestUrlHint();
    }

    // 更新测试区下方的 URL 提示
    function updateTestUrlHint() {
        const hint = document.getElementById('search-engine-test-url');
        if (!hint) return;
        const engine = getDefaultSearchEngine();
        const keyword = document.getElementById('search-engine-test-input')?.value.trim() || 'test';
        if (!engine) {
            hint.textContent = '暂无可用搜索引擎';
            return;
        }
        const previewUrl = engine.url.replace('%s', encodeURIComponent(keyword));
        hint.textContent = `将打开：${previewUrl}`;
    }

    // 打开测试搜索
    function performTestSearch() {
        const engine = getDefaultSearchEngine();
        if (!engine) {
            showMessage('暂无可用搜索引擎');
            return;
        }
        const keyword = document.getElementById('search-engine-test-input')?.value.trim();
        if (!keyword) {
            showMessage('请输入测试关键词');
            return;
        }
        const searchURL = engine.url.replace('%s', encodeURIComponent(keyword));
        if (!isSafeUrl(searchURL, ['http:', 'https:'])) {
            showMessage('搜索地址无效');
            return;
        }
        window.open(searchURL, '_blank', 'noopener');
    }
    
    // 保存搜索引擎
    function saveSearchEngines(engines) {
        setSetting('searchEngines', engines);
    }
    
    // 渲染搜索引擎列表
    function renderSearchEngines() {
        const engines = loadSearchEngines();
        if (!searchEngineList) return;
        
        if (engines.length === 0) {
            searchEngineList.innerHTML = `
                <div class="categories-empty">
                    <i class="ri-search-off-line"></i>
                    <p>暂无搜索引擎</p>
                </div>
            `;
            return;
        }
        
        searchEngineList.innerHTML = engines.map((engine, index) => `
            <div class="search-engine-item" data-index="${index}" draggable="true">
                <div class="search-engine-drag-handle">
                    <i class="ri-draggable"></i>
                </div>
                <div class="search-engine-icon">
                    ${isSafeUrl(engine.icon, ['http:', 'https:']) ? `<img src="${escapeHTML(engine.icon)}" alt="${escapeHTML(engine.name)}">` : '<i class="ri-search-line"></i>'}
                </div>
                <div class="search-engine-info">
                    <h4 class="search-engine-name">${escapeHTML(engine.name)}</h4>
                    <p class="search-engine-url">${escapeHTML(engine.url)}</p>
                </div>
                <div class="search-engine-actions">
                    <button class="search-engine-action-btn edit" data-index="${index}">
                        <i class="ri-edit-line"></i>
                    </button>
                    <button class="search-engine-action-btn delete" data-index="${index}">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // 绑定编辑和删除事件
        searchEngineList.querySelectorAll('.search-engine-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = btn.dataset.index;
                if (btn.classList.contains('edit')) {
                    editSearchEngine(index);
                } else {
                    deleteSearchEngine(index);
                }
            });
        });

        bindSearchEngineDrag();
        renderDefaultEngineSelect();
    }

    function bindSearchEngineDrag() {
        let draggingIndex = null;

        searchEngineList.querySelectorAll('.search-engine-item').forEach(item => {
            item.addEventListener('dragstart', event => {
                draggingIndex = Number(item.dataset.index);
                item.classList.add('dragging');
                event.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', () => {
                draggingIndex = null;
                item.classList.remove('dragging');
            });

            item.addEventListener('dragover', event => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            });

            item.addEventListener('drop', event => {
                event.preventDefault();
                const targetIndex = Number(item.dataset.index);
                if (draggingIndex === null || draggingIndex === targetIndex) return;

                const engines = loadSearchEngines();
                const [movedEngine] = engines.splice(draggingIndex, 1);
                engines.splice(targetIndex, 0, movedEngine);
                saveSearchEngines(engines);
                renderSearchEngines();
                updateSearchButtons();
                showMessage('已更新搜索引擎顺序');
            });
        });
    }
    
    // 打开添加搜索引擎弹窗
    function openAddSearchEngineModal() {
        searchEngineModalTitle.innerHTML = '<i class="ri-add-circle-line"></i><span>添加搜索引擎</span>';
        searchEngineNameInput.value = '';
        searchEngineUrlInput.value = '';
        searchEngineIconInput.value = '';
        window.editingSearchEngineIndex = null;
        searchEngineModal.style.display = 'flex';
        requestAnimationFrame(() => {
            searchEngineModal.classList.add('show');
        });
    }
    
    // 打开编辑搜索引擎弹窗
    function openEditSearchEngineModal(index) {
        const engines = loadSearchEngines();
        const engine = engines[index];
        searchEngineModalTitle.innerHTML = '<i class="ri-edit-circle-line"></i><span>编辑搜索引擎</span>';
        searchEngineNameInput.value = engine.name;
        searchEngineUrlInput.value = engine.url;
        searchEngineIconInput.value = engine.icon || '';
        window.editingSearchEngineIndex = index;
        searchEngineModal.style.display = 'flex';
        requestAnimationFrame(() => {
            searchEngineModal.classList.add('show');
        });
    }
    
    // 关闭搜索引擎弹窗
    function closeSearchEngineModal() {
        searchEngineModal.classList.remove('show');
        setTimeout(() => {
            searchEngineModal.style.display = 'none';
        }, 250);
    }
    
    // 编辑搜索引擎
    function editSearchEngine(index) {
        openEditSearchEngineModal(index);
    }
    
    // 删除搜索引擎
    function deleteSearchEngine(index) {
        const engines = loadSearchEngines();
        if (engines.length <= 1) {
            showMessage('至少保留一个搜索引擎');
            return;
        }
        if (!confirm(`确定要删除 "${engines[index].name}" 吗？`)) return;
        engines.splice(index, 1);
        saveSearchEngines(engines);
        renderSearchEngines();
        updateSearchButtons();
        showMessage('已删除搜索引擎');
    }
    
    // 保存搜索引擎
    function saveSearchEngine() {
        const name = searchEngineNameInput.value.trim();
        const url = searchEngineUrlInput.value.trim();
        const icon = searchEngineIconInput.value.trim();
        
        if (!name || !url) {
            showMessage('请填写名称和搜索 URL');
            return;
        }
        
        // 验证 URL 格式
        if (!url.includes('%s')) {
            showMessage('搜索 URL 中必须包含 %s 作为搜索词占位符');
            return;
        }

        const previewSearchUrl = url.replace('%s', encodeURIComponent('test'));
        if (!isSafeUrl(previewSearchUrl, ['http:', 'https:'])) {
            showMessage('搜索 URL 只支持 HTTP 或 HTTPS');
            return;
        }

        if (icon && !isSafeUrl(icon, ['http:', 'https:'])) {
            showMessage('图标 URL 只支持 HTTP 或 HTTPS');
            return;
        }
        
        const engines = loadSearchEngines();
        const editIndex = window.editingSearchEngineIndex;
        
        if (editIndex !== null) {
            engines[Number(editIndex)] = { name, url, icon };
            showMessage('已更新搜索引擎');
        } else {
            engines.push({ name, url, icon });
            showMessage('已添加搜索引擎');
        }
        
        saveSearchEngines(engines);
        closeSearchEngineModal();
        renderSearchEngines();
        updateSearchButtons();
    }
    
    // 搜索引擎 logo 内置 SVG（按域名匹配；内联无外部依赖，清晰稳定）
    const builtinEngineIcons = {
        'baidu.com': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%232932E1' d='M15.5 2C13.6 2 12 3.9 12 6.3c0 1.4.5 2.6 1.4 3.4-1.1.9-1.8 2.4-1.8 4.1 0 2.9 2 5.2 4.5 5.2s4.5-2.3 4.5-5.2c0-1.9-.8-3.5-2.1-4.4 1-.8 1.6-2 1.6-3.5C20.1 3.9 17.4 2 15.5 2zM6.4 7.5c-2 0-3.6 1.9-3.6 4.3 0 1.5.6 2.8 1.6 3.6-.9.8-1.5 2-1.5 3.4 0 2.4 1.6 4.2 3.6 4.2s3.6-1.9 3.6-4.2c0-1.4-.6-2.6-1.5-3.4 1-.8 1.6-2.1 1.6-3.6C9.9 9.4 8.3 7.5 6.4 7.5z'/%3E%3C/svg%3E",
        'google.com': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%234285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'/%3E%3Cpath fill='%2334A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'/%3E%3Cpath fill='%23FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'/%3E%3Cpath fill='%23EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'/%3E%3C/svg%3E",
        'bing.com': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23008373' d='M5 3v15.5l4.7 2.5 6.3-3.6v-3.7L11 11l-2 1V6L5 3zm6 3v3.2l4.7 2.7 2.3-1.3V8L11 6z'/%3E%3C/svg%3E"
    };

    // 从 url 提取 host（用于内置 SVG 匹配 + favicon 兜底）
    function getHostFromUrl(url) {
        try {
            return new URL(url).host.toLowerCase();
        } catch {
            return '';
        }
    }

    // 分层解析引擎图标：内置 SVG → 用户 icon → 在线 favicon 兜底 → null（纯文字）
    // 返回 { src, builtin }，src 为图片地址，builtin=true 表示内置无需回退
    function getSearchEngineIcon(engine) {
        const host = getHostFromUrl(engine.url);

        // ① 内置 SVG（按域名匹配）
        const builtinKey = Object.keys(builtinEngineIcons).find(key => host.includes(key));
        if (builtinKey) {
            return { src: builtinEngineIcons[builtinKey], builtin: true };
        }

        // ② 用户配置的 icon URL
        if (engine.icon && isSafeUrl(engine.icon, ['http:', 'https:'])) {
            return { src: engine.icon, builtin: false };
        }

        // ③ 在线 favicon 兜底
        if (host) {
            return { src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`, builtin: false };
        }

        // ④ 无可用图标
        return null;
    }

    // 读取搜索按钮图标模式：text（仅文字）/ logo（仅图标）/ logo-text（图标+文字，默认）
    function getSearchButtonIconMode() {
        const mode = getSetting('searchButtonIconMode', 'logo-text');
        return ['text', 'logo', 'logo-text'].includes(mode) ? mode : 'logo-text';
    }

    // 更新搜索框按钮
    function updateSearchButtons() {
        const engines = loadSearchEngines();
        const buttonContainer = document.querySelector('.search-buttons');
        if (!buttonContainer) return;

        const iconMode = getSearchButtonIconMode();

        buttonContainer.innerHTML = engines.map((engine, index) => {
            const name = escapeHTML(engine.name);
            const icon = getSearchEngineIcon(engine);

            if (iconMode === 'text' || !icon) {
                // 仅文字，或无可用图标
                return `<button class="search-button" data-engine-index="${index}" title="${name}">${name}</button>`;
            }

            // 图标加载失败时隐藏 img 并回退到文字（错误处理在下方统一绑定，符合 CSP）
            const img = `<img class="search-button-icon" src="${icon.src}" alt="" loading="lazy">`;

            if (iconMode === 'logo') {
                return `<button class="search-button search-button-icon-only" data-engine-index="${index}" title="${name}" aria-label="${name}">${img}</button>`;
            }

            // logo-text
            return `<button class="search-button search-button-has-icon" data-engine-index="${index}" title="${name}">${img}<span class="search-button-text">${name}</span></button>`;
        }).join('');

        buttonContainer.querySelectorAll('.search-button').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = Number(btn.getAttribute('data-engine-index'));
                performSearch(engines[index]);
            });
            // 图标加载失败：隐藏 img，按钮回退显示文字（icon-only 模式靠 ::after 的 aria-label）
            const img = btn.querySelector('.search-button-icon');
            if (img) {
                img.addEventListener('error', () => {
                    img.style.display = 'none';
                    btn.classList.add('icon-failed');
                });
            }
        });
    }

    function performSearch(engine) {
        const searchTerm = document.getElementById('search-input')?.value.trim();
        if (!searchTerm || !engine) return;

        const searchURL = engine.url.replace('%s', encodeURIComponent(searchTerm));
        if (!isSafeUrl(searchURL, ['http:', 'https:'])) {
            showMessage('搜索地址无效');
            return;
        }

        window.open(searchURL, '_blank', 'noopener');
    }
    
    // 添加搜索引擎按钮
    if (addSearchEngineBtn) {
        addSearchEngineBtn.addEventListener('click', openAddSearchEngineModal);
    }
    
    // 关闭搜索引擎弹窗按钮
    if (searchEngineModalCloseBtn) {
        searchEngineModalCloseBtn.addEventListener('click', closeSearchEngineModal);
    }
    
    // 取消按钮
    if (searchEngineCancelBtn) {
        searchEngineCancelBtn.addEventListener('click', closeSearchEngineModal);
    }
    
    // 保存按钮
    if (searchEngineSaveBtn) {
        searchEngineSaveBtn.addEventListener('click', saveSearchEngine);
    }
    
    // 点击弹窗背景关闭
    if (searchEngineModal) {
        searchEngineModal.addEventListener('click', (e) => {
            if (e.target === searchEngineModal) {
                closeSearchEngineModal();
            }
        });
    }

    // 默认引擎下拉 + 测试按钮
    const defaultEngineSelect = document.getElementById('default-search-engine');
    if (defaultEngineSelect) {
        defaultEngineSelect.addEventListener('change', function() {
            setSetting('defaultSearchEngine', this.value);
            showMessage('默认引擎：' + this.value);
            updateTestUrlHint();
        });
    }
    const testInput = document.getElementById('search-engine-test-input');
    if (testInput) {
        testInput.addEventListener('input', updateTestUrlHint);
    }
    const testBtn = document.getElementById('search-engine-test-btn');
    if (testBtn) {
        testBtn.addEventListener('click', performTestSearch);
    }

    // 初始化搜索引擎列表
    renderSearchEngines();
    renderDefaultEngineSelect();
    updateSearchButtons();

    // ================================
    // 显示设置功能（时间、日期、天气）
    // ================================
    
    // 显示设置相关元素
    const showTimeToggle = document.getElementById('show-time-toggle');
    const showDateToggle = document.getElementById('show-date-toggle');
    const showSecondsToggle = document.getElementById('show-seconds-toggle');
    const show24HourToggle = document.getElementById('24hour-toggle');
    const dateFormatSelect = document.getElementById('date-format-select');
    const showWeatherToggle = document.getElementById('show-weather-toggle');
    const weatherCityInput = document.getElementById('weather-city-input');
    const weatherUnitSelect = document.getElementById('weather-unit-select');
    
    // 时间日期显示设置默认值
    const defaultDisplaySettings = {
        showTime: true,
        showDate: true,
        showSeconds: true,
        use24Hour: true,
        dateFormat: 'cn',
        showWeather: true,
        weatherCity: 'shanghai',
        weatherUnit: 'C'
    };
    
    // 加载显示设置
    function loadDisplaySettings() {
        return {
            ...defaultDisplaySettings,
            ...(getSetting('displaySettings', {}) || {})
        };
    }

    // 显示设置缓存：避免时钟每秒 tick 都触发 localStorage + JSON.parse
    let cachedDisplaySettings = null;
    function getCachedDisplaySettings() {
        if (!cachedDisplaySettings) {
            cachedDisplaySettings = loadDisplaySettings();
        }
        return cachedDisplaySettings;
    }

    // 保存显示设置
    function saveDisplaySettings(settings) {
        setSetting('displaySettings', settings);
        cachedDisplaySettings = settings; // 失效缓存，下次取最新
    }
    
    // 格式化日期
    function formatDate(date, format) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekDay = weekDays[date.getDay()];
        
        switch(format) {
            case 'cn':
                return `${year}年${month}月${day}日`;
            case 'cn-short':
                return `${month}月${day}日`;
            case 'us':
                return `${month}/${day}/${year}`;
            case 'eu':
                return `${day}/${month}/${year}`;
            case 'iso':
                return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            case 'cn-week':
                return `${year}年${month}月${day}日 星期${weekDay}`;
            default:
                return `${year}年${month}月${day}日`;
        }
    }
    
    const timeDisplayCache = {
        timeElement: document.getElementById('current-time'),
        dateElement: document.getElementById('current-date'),
        weatherInfo: document.getElementById('weather-info'),
        lastTimeText: '',
        lastDateText: '',
        lastVisibilityKey: ''
    };

    function setElementDisplay(element, value) {
        if (element && element.style.display !== value) {
            element.style.display = value;
        }
    }

    // 更新时间显示
    function updateTimeDisplay(force = false) {
        const settings = getCachedDisplaySettings();
        const now = new Date();
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        
        if (!settings.use24Hour) {
            hours = hours % 12 || 12;
        }
        hours = settings.use24Hour ? String(hours).padStart(2, '0') : String(hours);
        
        let timeText = settings.use24Hour
            ? `${hours}:${minutes}`
            : `${hours}:${minutes} ${ampm}`;
        
        if (settings.showSeconds) {
            timeText = settings.use24Hour
                ? `${hours}:${minutes}:${seconds}`
                : `${hours}:${minutes}:${seconds} ${ampm}`;
        }

        const dateText = formatDate(now, settings.dateFormat);
        const visibilityKey = [
            settings.showTime,
            settings.showDate,
            settings.showWeather
        ].join('|');

        if (timeDisplayCache.timeElement && (force || timeDisplayCache.lastTimeText !== timeText)) {
            timeDisplayCache.timeElement.textContent = timeText;
            timeDisplayCache.lastTimeText = timeText;
        }

        if (timeDisplayCache.dateElement && (force || timeDisplayCache.lastDateText !== dateText)) {
            timeDisplayCache.dateElement.textContent = dateText;
            timeDisplayCache.lastDateText = dateText;
        }

        if (force || timeDisplayCache.lastVisibilityKey !== visibilityKey) {
            setElementDisplay(timeDisplayCache.timeElement, settings.showTime ? 'inline-flex' : 'none');
            setElementDisplay(timeDisplayCache.dateElement, settings.showDate ? 'inline-flex' : 'none');
            setElementDisplay(timeDisplayCache.weatherInfo, settings.showWeather ? 'inline-flex' : 'none');
            timeDisplayCache.lastVisibilityKey = visibilityKey;
        }
    }
    
    // 初始化显示设置 UI
    function initDisplaySettings() {
        const settings = loadDisplaySettings();
        
        if (showTimeToggle) showTimeToggle.checked = settings.showTime;
        if (showDateToggle) showDateToggle.checked = settings.showDate;
        if (showSecondsToggle) showSecondsToggle.checked = settings.showSeconds;
        if (show24HourToggle) show24HourToggle.checked = settings.use24Hour;
        if (dateFormatSelect) dateFormatSelect.value = settings.dateFormat;
        if (showWeatherToggle) showWeatherToggle.checked = settings.showWeather;
        if (weatherCityInput) weatherCityInput.value = settings.weatherCity;
        if (weatherUnitSelect) weatherUnitSelect.value = settings.weatherUnit;
        
        // 绑定事件
        if (showTimeToggle) {
            showTimeToggle.addEventListener('change', function() {
                const settings = loadDisplaySettings();
                settings.showTime = this.checked;
                saveDisplaySettings(settings);
                updateTimeDisplay();
                showMessage(this.checked ? '已显示时间' : '已隐藏时间');
            });
        }
        
        if (showDateToggle) {
            showDateToggle.addEventListener('change', function() {
                const settings = loadDisplaySettings();
                settings.showDate = this.checked;
                saveDisplaySettings(settings);
                updateTimeDisplay();
                showMessage(this.checked ? '已显示日期' : '已隐藏日期');
            });
        }
        
        if (showSecondsToggle) {
            showSecondsToggle.addEventListener('change', function() {
                const settings = loadDisplaySettings();
                settings.showSeconds = this.checked;
                saveDisplaySettings(settings);
                updateTimeDisplay();
                showMessage(this.checked ? '已显示秒数' : '已隐藏秒数');
            });
        }
        
        if (show24HourToggle) {
            show24HourToggle.addEventListener('change', function() {
                const settings = loadDisplaySettings();
                settings.use24Hour = this.checked;
                saveDisplaySettings(settings);
                updateTimeDisplay();
                showMessage(this.checked ? '已使用 24 小时制' : '已使用 12 小时制');
            });
        }
        
        if (dateFormatSelect) {
            dateFormatSelect.addEventListener('change', function() {
                const settings = loadDisplaySettings();
                settings.dateFormat = this.value;
                saveDisplaySettings(settings);
                updateTimeDisplay();
                showMessage('已更新日期格式');
            });
        }
        
        if (showWeatherToggle) {
            showWeatherToggle.addEventListener('change', function() {
                const settings = loadDisplaySettings();
                settings.showWeather = this.checked;
                saveDisplaySettings(settings);
                updateTimeDisplay();
                showMessage(this.checked ? '已显示天气' : '已隐藏天气');
            });
        }
        
        if (weatherCityInput) {
            weatherCityInput.addEventListener('change', function() {
                const settings = loadDisplaySettings();
                settings.weatherCity = this.value.trim() || 'shanghai';
                saveDisplaySettings(settings);
                updateWeather();
                showMessage('已更新城市设置');
            });
        }
        
        if (weatherUnitSelect) {
            weatherUnitSelect.addEventListener('change', function() {
                const settings = loadDisplaySettings();
                settings.weatherUnit = this.value;
                saveDisplaySettings(settings);
                updateWeather();
                showMessage(`已更新温度单位为${this.value === 'C' ? '摄氏度' : '华氏度'}`);
            });
        }
    }
    
    // 更新天气功能（支持多地区）
    function updateWeather() {
        const settings = loadDisplaySettings();
        const cities = settings.weatherCity.split(',').map(c => c.trim()).filter(c => c);
        const unit = settings.weatherUnit === 'F' ? 'F' : 'C';
        const weatherLocationsEl = document.getElementById('weather-locations');
        const weatherLocationText = document.getElementById('weather-location-text');
        
        if (cities.length === 0) {
            if (weatherLocationsEl) weatherLocationsEl.style.display = 'none';
            return;
        }
        
        // 如果只有一个城市，不显示地区名称
        if (cities.length === 1) {
            if (weatherLocationsEl) weatherLocationsEl.style.display = 'none';
            fetchWeatherForCity(cities[0], unit, 'weather-text');
        } else {
            // 多城市：显示第一个城市的天气，并在后面显示所有城市名称
            if (weatherLocationsEl) {
                weatherLocationsEl.style.display = 'inline-flex';
                weatherLocationText.textContent = cities.join(' / ');
            }
            fetchWeatherForCity(cities[0], unit, 'weather-text');
        }
    }
    
    // 获取指定城市的天气
    function fetchWeatherForCity(city, unit, elementId) {
        const weatherText = document.getElementById(elementId);
        if (weatherText) {
            weatherText.textContent = '加载中...';
            weatherText.classList.add('loading');
            weatherText.classList.remove('loaded');
        }

        const shortTextParams = new URLSearchParams({
            format: '%C %t',
            [unit === 'F' ? 'u' : 'm']: ''
        });
        const jsonParams = new URLSearchParams({
            format: 'j1',
            [unit === 'F' ? 'u' : 'm']: ''
        });

        const jsonUrl = `https://wttr.in/${encodeURIComponent(city)}?${jsonParams.toString()}`;
        const shortTextUrl = `https://wttr.in/${encodeURIComponent(city)}?${shortTextParams.toString()}`;

        function renderWeatherText(text) {
            let cleanedText = text.trim().replace(/\s+/g, ' ');
            cleanedText = translateWeatherText(cleanedText);
            const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(cleanedText) || cleanedText.includes('<!DOCTYPE');
            // 正常短文本由 %C %t 组成，必然包含温度符号 °；
            // wttr.in 偶尔把气象警报文本塞进 %C 字段，识别后按不可用处理
            const looksLikeAlert = !cleanedText.includes('°');
            if (weatherText) {
                weatherText.textContent = looksLikeHtml || looksLikeAlert || cleanedText.length > 48
                    ? '天气暂不可用'
                    : cleanedText;
                weatherText.classList.remove('loading');
                weatherText.classList.add('loaded');
            }
        }

        // hover 天气胶囊时显示详细数据（湿度/风/体感/能见度等）
        function attachWeatherDetail(detail, unit) {
            const weatherInfo = document.getElementById('weather-info');
            if (!weatherInfo || !detail) return;
            // 翻译风向
            const dirMap = { N:'北', NNE:'北偏东', NE:'东北', ENE:'东偏北', E:'东', ESE:'东偏南', SE:'东南', SSE:'南偏东', S:'南', SSW:'南偏西', SW:'西南', WSW:'西偏南', W:'西', WNW:'西偏北', NW:'西北', NNW:'北偏西' };
            const uvDesc = (uv) => uv < 3 ? '低' : uv < 6 ? '中等' : uv < 8 ? '高' : uv < 11 ? '很高' : '极强';
            const rows = [];
            if (detail.city) rows.push(['城市', detail.city]);
            if (detail.feelsLike !== undefined) rows.push(['体感', `${detail.feelsLike}°${unit}`]);
            if (detail.humidity) rows.push(['湿度', `${detail.humidity}%`]);
            if (detail.windSpeed) rows.push(['风力', `${detail.windSpeed} ${unit==='F'?'mph':'km/h'}${detail.windDir ? ' ' + (dirMap[detail.windDir] || detail.windDir) : ''}`]);
            if (detail.visibility) rows.push(['能见度', `${detail.visibility} km`]);
            if (detail.pressure) rows.push(['气压', `${detail.pressure} hPa`]);
            if (detail.uvIndex !== undefined) rows.push(['紫外线', `${detail.uvIndex}（${uvDesc(Number(detail.uvIndex))}）`]);

            if (!rows.length) return;
            // 构建详情浮层（移除旧的）
            let popover = weatherInfo.querySelector('.weather-detail');
            if (popover) popover.remove();
            popover = document.createElement('div');
            popover.className = 'weather-detail';
            popover.innerHTML = rows.map(([k, v]) =>
                `<div class="weather-detail-row"><span class="weather-detail-label">${k}</span><span class="weather-detail-value">${escapeHTML(String(v))}</span></div>`
            ).join('');
            weatherInfo.appendChild(popover);
            weatherInfo.classList.add('has-detail');
        }

        // wttr.in 返回的天气描述是英文，这里翻译成中文（覆盖常见词组 + 整句兜底）
        function translateWeatherText(text) {
            // wttr.in 短文本常见整句（如 "Partly cloudy, 25°C"）按词组逐个替换
            const phrases = [
                [/sunny/i, '晴'], [/clear/i, '晴'],
                [/partly cloudy/i, '多云'], [/partly clear/i, '多云'],
                [/cloudy/i, '阴'], [/overcast/i, '阴'],
                [/mist/i, '薄雾'], [/fog/i, '雾'], [/foggy/i, '雾'],
                [/drizzle/i, '小雨'], [/light rain/i, '小雨'], [/light shower/i, '小雨'],
                [/heavy rain/i, '大雨'], [/heavy shower/i, '大雨'],
                [/moderate rain/i, '中雨'], [/rain/i, '雨'], [/shower/i, '阵雨'],
                [/thunder/i, '雷'], [/thunderstorm/i, '雷阵雨'],
                [/light snow/i, '小雪'], [/heavy snow/i, '大雪'], [/moderate snow/i, '中雪'],
                [/snow/i, '雪'], [/blizzard/i, '暴风雪'], [/sleet/i, '雨夹雪'],
                [/hail/i, '冰雹'], [/ice/i, '冰'],
                [/wind/i, '大风'], [/breezy/i, '微风'], [/gust/i, '阵风'],
                [/haze/i, '霾'], [/hazy/i, '霾'], [/dust/i, '沙尘'],
                [/hot/i, '炎热'], [/cold/i, '寒冷'], [/warm/i, '温暖'],
                [/humid/i, '潮湿'], [/freezing/i, '严寒'],
                [/patchy/i, '局部'], [/nearby/i, '附近'], [/occasional/i, '偶有'],
                [/light/i, '小'], [/heavy/i, '大'], [/moderate/i, '中']
            ];
            // 先尝试整词替换（按短语长度从长到短，避免短词先命中）
            phrases.sort((a, b) => b[0].source.length - a[0].source.length);
            let translated = text;
            for (const [re, cn] of phrases) {
                translated = translated.replace(re, cn);
            }
            // 处理重复词（如两个"多云"）
            translated = translated.replace(/(多云|阴|晴|雾|雪|雷|雨)\1+/g, '$1');
            // 合并相邻的"强度词+降水词"：小雨 阵雨→小阵雨，大雪 雪→大雪，小雨 雨→小雨
            translated = translated.replace(/(小|大|中)\s*(阵雨|雷阵雨|雨|雪|冰雹)/g, '$1$2');
            // 多个降水词相邻只留最有信息量的（阵雨/雷阵雨 > 雨 > 雪）
            translated = translated.replace(/(阵雨|雷阵雨|小雨|中雨|大雨|雨)\s*(阵雨|雷阵雨|小雨|中雨|大雨|雨)/g, (m, a, b) => {
                const order = ['雷阵雨','阵雨','小雨','中雨','大雨','雨'];
                return order.includes(a) ? a : b;
            });
            translated = translated.replace(/(小|大|中)(小|大|中)+/g, '$1');
            // 清理多余空格（"局部 小雪"→"局部小雪"）
            translated = translated.replace(/(?<=[\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '').replace(/\s{2,}/g, ' ').trim();
            return translated;
        }

        function fetchShortTextWeather() {
            return fetch(shortTextUrl, {
                headers: {
                    Accept: 'text/plain'
                }
            })
                .then(res => {
                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}`);
                    }
                    return res.text();
                })
                .then(renderWeatherText);
        }

        fetch(jsonUrl, {
            headers: {
                Accept: 'application/json'
            }
        })
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                return res.json();
            })
            .then(data => {
                const current = data?.current_condition?.[0];
                const description = current?.weatherDesc?.[0]?.value || '';
                const temp = unit === 'F' ? current?.temp_F : current?.temp_C;
                if (!description || temp === undefined) {
                    throw new Error('天气数据不完整');
                }
                renderWeatherText(`${description} ${temp}°${unit}`);

                // 保存详细数据，供 hover 详情显示
                const detail = {
                    humidity: current?.humidity,          // 湿度 %
                    windSpeed: unit === 'F' ? current?.windspeedMiles : current?.windspeedKmph, // 风速
                    windDir: current?.winddir16Point,      // 风向
                    feelsLike: unit === 'F' ? current?.FeelsLikeF : current?.FeelsLikeC,        // 体感温度
                    visibility: current?.visibility,       // 能见度 km
                    pressure: current?.pressure,           // 气压 hPa
                    uvIndex: current?.uvIndex,              // 紫外线指数
                    city: data?.nearest_area?.[0]?.areaName?.[0]?.value || city // 城市名
                };
                attachWeatherDetail(detail, unit);
            })
            .catch(() => fetchShortTextWeather())
            .catch(() => {
                if (weatherText) {
                    weatherText.textContent = '获取失败';
                    weatherText.classList.remove('loading');
                    weatherText.classList.add('loaded');
                }
            });
    }

    // 初始化显示设置
    initDisplaySettings();
    updateTimeDisplay();
    updateWeather();
    
    // 每秒更新一次时间和日期（含极简模式大时钟）
    setInterval(() => {
        updateTimeDisplay();
        if (document.body.classList.contains('minimal-mode')) updateMinimalClock();
    }, 1000);
    
    // ================================
    // 设置折叠面板功能
    // ================================
    function syncSectionTitleState(section) {
        const sectionTitle = section?.querySelector(':scope > .section-title');
        if (!sectionTitle || sectionTitle.classList.contains('section-title-static')) return;
        sectionTitle.setAttribute('aria-expanded', section.classList.contains('collapsed') ? 'false' : 'true');
    }

    window.toggleSection = function(sectionTitle) {
        const section = sectionTitle.closest('.settings-section');
        if (section) {
            // §3.2：仅用稳定的 data-section-id 作为折叠持久化键，不再回退中文文案（文案改动会让旧态失效）
            const sectionId = section.dataset.sectionId || '';
            if (!sectionId) return;
            section.classList.toggle('collapsed');

            const collapsedSections = getSetting('collapsedSections', []) || [];

            if (section.classList.contains('collapsed')) {
                if (!collapsedSections.includes(sectionId)) {
                    collapsedSections.push(sectionId);
                }
            } else {
                const index = collapsedSections.indexOf(sectionId);
                if (index > -1) {
                    collapsedSections.splice(index, 1);
                }
            }

            setSetting('collapsedSections', collapsedSections);
            syncSectionTitleState(section);
        }
    };

    document.querySelectorAll('.settings-section .section-title').forEach(sectionTitle => {
        const section = sectionTitle.closest('.settings-section');
        if (!section?.querySelector(':scope > .section-content')) return;

        // §5.2：可折叠分区标题补 ARIA + 键盘支持；不可折叠（section-title-static）跳过
        const isStatic = sectionTitle.classList.contains('section-title-static');
        if (!isStatic) {
            sectionTitle.setAttribute('role', 'button');
            sectionTitle.setAttribute('tabindex', '0');
            syncSectionTitleState(section);
            sectionTitle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    window.toggleSection(sectionTitle);
                }
            });
        }

        sectionTitle.addEventListener('click', () => {
            if (isStatic) return; // 不可折叠分区不响应点击
            window.toggleSection(sectionTitle);
        });
    });

    // 初始化折叠状态
    function initSectionCollapseState() {
        const collapsedSections = getSetting('collapsedSections', []) || [];
        // §3.2：仅按 data-section-id 匹配，无 id 的分区（如 .section-title-static）不参与折叠
        document.querySelectorAll('.settings-section[data-section-id]').forEach(section => {
            const sectionId = section.dataset.sectionId;
            const sectionTitle = section.querySelector(':scope > .section-title');
            const canCollapse = sectionTitle && !sectionTitle.classList.contains('section-title-static');
            section.classList.toggle('collapsed', Boolean(canCollapse && sectionId && collapsedSections.includes(sectionId)));
            syncSectionTitleState(section);
        });
    }
    
    // 在设置打开时初始化折叠状态
    const openSettingsBtnOrig = document.getElementById('open-settings');
    if (openSettingsBtnOrig) {
        openSettingsBtnOrig.addEventListener('click', function() {
            setTimeout(() => {
                initSectionCollapseState();
            }, 100);
        });
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            performSearch(getDefaultSearchEngine());
        });
    }

    // 置顶按钮功能（rAF 节流，避免滚动时高频触发）
    const backToTopBtn = document.getElementById('back-to-top');
    let backToTopTicking = false;
    window.addEventListener('scroll', () => {
        if (backToTopTicking) return;
        backToTopTicking = true;
        requestAnimationFrame(() => {
            backToTopBtn?.classList.toggle('show', window.scrollY > 200);
            backToTopTicking = false;
        });
    }, { passive: true });
    backToTopBtn?.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 创建一键收起/展开按钮
    const toggleAllGroupsBtn = document.createElement('button');
    toggleAllGroupsBtn.id = 'toggle-all-groups';
    toggleAllGroupsBtn.className = 'icon-button';
    toggleAllGroupsBtn.title = '打开分组入口';
    toggleAllGroupsBtn.setAttribute('aria-label', '打开分组入口');
    toggleAllGroupsBtn.innerHTML = '<i class="ri-folder-open-line"></i>';

    const functionButtons = document.querySelector('.function-buttons');
    functionButtons.appendChild(toggleAllGroupsBtn);

    function getFirstCategoryContainer() {
        return document.querySelector('.category-container');
    }

    function updateCategoryActionButtonState() {
        const icon = toggleAllGroupsBtn.querySelector('i');
        const categoriesVisible = document.body.classList.contains('home-categories-open');
        const anyExpanded = Boolean(document.querySelector('.category-container.expanded'));

        toggleAllGroupsBtn.classList.toggle('active', anyExpanded && categoriesVisible);

        if (!categoriesVisible) {
            toggleAllGroupsBtn.title = '显示分组并展开首个';
            toggleAllGroupsBtn.setAttribute('aria-label', '显示分组并展开首个');
            if (icon) icon.className = 'ri-folder-open-line';
            return;
        }

        if (anyExpanded) {
            toggleAllGroupsBtn.title = '收起所有分组';
            toggleAllGroupsBtn.setAttribute('aria-label', '收起所有分组');
            if (icon) icon.className = 'ri-close-line';
            return;
        }

        toggleAllGroupsBtn.title = '展开首个分组';
        toggleAllGroupsBtn.setAttribute('aria-label', '展开首个分组');
        if (icon) icon.className = 'ri-folder-open-line';
    }

    window.updateCategoryActionButtonState = updateCategoryActionButtonState;

    function revealCategoriesForToolbar() {
        setHomeCategoryTrayOpen(true);
        applyHomeCategoryDisplayMode();
        return loadHomeLayoutSettings();
    }

    function runCategoryToolbarAction() {
        // 列表未展开 → 打开列表并展开首个分类（手风琴就地展开）
        if (!document.body.classList.contains('home-categories-open')) {
            revealCategoriesForToolbar();
            const firstCategory = getFirstCategoryContainer();
            if (!firstCategory) {
                showMessage('暂无分组可打开');
                return;
            }
            requestAnimationFrame(() => {
                if (!firstCategory.classList.contains('expanded')) {
                    toggleCategoryAccordion(firstCategory);
                }
                updateCategoryActionButtonState();
                firstCategory.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            showMessage('已打开分组');
            return;
        }

        // 列表已展开且有分类展开 → 收起所有分类
        if (document.querySelector('.category-container.expanded')) {
            collapseAllCategoryAccordions();
            updateCategoryActionButtonState();
            showMessage('已收起分组');
            return;
        }

        // 列表已展开但无分类展开 → 展开首个分类
        const firstCategory = getFirstCategoryContainer();
        if (firstCategory) {
            toggleCategoryAccordion(firstCategory);
            updateCategoryActionButtonState();
            firstCategory.scrollIntoView({ behavior: 'smooth', block: 'start' });
            showMessage('已展开首个分组');
        }
    }

    toggleAllGroupsBtn.addEventListener('click', () => {
        runCategoryToolbarAction();
    });
    
    // 创建垂直位置调整按钮
    const createVerticalPositionControls = () => {
        const functionButtons = document.querySelector('.function-buttons');
        const positionButton = document.createElement('button');
        positionButton.className = 'icon-button';
        positionButton.title = '页面布局与密度';
        positionButton.setAttribute('aria-label', '页面布局与密度');
        positionButton.id = 'position-button';
        positionButton.innerHTML = '<i class="ri-layout-line"></i>';

        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'dropdown-menu';
        dropdownMenu.id = 'position-dropdown';
        dropdownMenu.style.display = 'none';

        const options = [
            { type: 'label', text: '内容位置' },
            { text: '靠上布局', icon: 'ri-arrow-up-line', action: 'top' },
            { text: '标准布局', icon: 'ri-align-center', action: 'default' },
            { text: '靠下布局', icon: 'ri-arrow-down-line', action: 'bottom' },
            { type: 'divider' },
            { type: 'label', text: '显示密度' },
            { text: '紧凑', icon: 'ri-contract-left-right-line', density: 'compact' },
            { text: '均衡', icon: 'ri-dashboard-line', density: 'balanced' },
            { text: '舒展', icon: 'ri-expand-left-right-line', density: 'spacious' }
        ];

        options.forEach(option => {
            if (option.type === 'label') {
                const label = document.createElement('div');
                label.className = 'dropdown-section-title';
                label.textContent = option.text;
                dropdownMenu.appendChild(label);
                return;
            }

            if (option.type === 'divider') {
                const divider = document.createElement('div');
                divider.className = 'dropdown-divider';
                dropdownMenu.appendChild(divider);
                return;
            }

            const menuItem = document.createElement('div');
            menuItem.className = 'dropdown-item';
            menuItem.innerHTML = `<i class="${option.icon}"></i> ${option.text}`;
            if (option.action) menuItem.dataset.action = option.action;
            if (option.density) menuItem.dataset.density = option.density;
            dropdownMenu.appendChild(menuItem);
        });

        functionButtons.appendChild(positionButton);
        document.body.appendChild(dropdownMenu);

        const container = document.querySelector('.container');

        function updateLayoutMenuState() {
            const savedPosition = getSetting('contentPosition', 'default');
            const { density } = loadHomeLayoutSettings();
            dropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
                const selected = item.dataset.action === savedPosition || item.dataset.density === density;
                item.classList.toggle('active', selected);
            });
        }

        positionButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdownMenu.style.display === 'block';

            if (isVisible) {
                dropdownMenu.style.display = 'none';
            } else {
                updateLayoutMenuState();
                const rect = positionButton.getBoundingClientRect();
                let menuTop = rect.bottom + 5;
                let menuLeft = rect.left - dropdownMenu.offsetWidth;

                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;

                if (menuLeft < 10) {
                    menuLeft = rect.right;
                }

                if (menuLeft + dropdownMenu.offsetWidth > windowWidth - 10) {
                    menuLeft = windowWidth - dropdownMenu.offsetWidth - 10;
                }

                dropdownMenu.style.opacity = '0';
                dropdownMenu.style.display = 'block';

                const menuHeight = dropdownMenu.offsetHeight;

                if (menuTop + menuHeight > windowHeight - 10) {
                    menuTop = rect.top - menuHeight - 5;
                }

                dropdownMenu.style.top = menuTop + 'px';
                dropdownMenu.style.left = menuLeft + 'px';
                dropdownMenu.style.opacity = '1';
            }
        });

        document.addEventListener('click', () => {
            dropdownMenu.style.display = 'none';
        });

        dropdownMenu.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.dropdown-item');
            if (!menuItem) return;

            const action = menuItem.dataset.action;
            const density = menuItem.dataset.density;

            if (action) {
                container.classList.remove('content-position-default', 'content-position-top', 'content-position-bottom');
                container.classList.add(`content-position-${action}`);
                setSetting('contentPosition', action);
                let message = '';
                switch(action) {
                    case 'top': message = '内容已切换为靠上布局'; break;
                    case 'default': message = '内容已切换为标准布局'; break;
                    case 'bottom': message = '内容已切换为靠下布局'; break;
                }
                showMessage(message);
            }

            if (density) {
                const settings = { ...loadHomeLayoutSettings(), density };
                saveHomeLayoutSettings(settings);
                applyHomeCategoryDisplayMode(settings);
                syncHomeLayoutControls(settings);

                const densityMessages = {
                    balanced: '首页已切换为均衡密度',
                    compact: '首页已切换为紧凑密度',
                    spacious: '首页已切换为舒展密度'
                };
                showMessage(densityMessages[density] || '已更新首页密度');
            }

            updateLayoutMenuState();
            dropdownMenu.style.display = 'none';
        });

        const savedPosition = getSetting('contentPosition', null);
        if (savedPosition) {
            switch (savedPosition) {
                case 'top':
                    container.classList.add('content-position-top');
                    break;
                case 'bottom':
                    container.classList.add('content-position-bottom');
                    break;
                default:
                    container.classList.add('content-position-default');
            }
        } else {
            container.classList.add('content-position-default');
        }

        updateLayoutMenuState();
    };

    createVerticalPositionControls();
    applyTopButtonSettings();
    syncTopButtonControls();
    renderTopButtonSettingsList();

    document.addEventListener('click', event => {
        if (event.target.closest('.link-card-urls') || event.target.closest('.url-dropdown')) {
            return;
        }
        document.querySelectorAll('.url-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    });
});

// 渲染「最近使用」快捷行：按访问时间倒序，最多 6 个，点击直达首选 URL
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
// 全局分类展开/收缩功能
// ================================

let activeCategoryContainer = null;
let categoryPanelElements = null;

function resetCategoryContainer(container) {
    if (!container) return;
    const toggleButton = container.querySelector('.toggle-button');
    const categoryHeader = container.querySelector('.category-header');

    container.classList.add('collapsed');
    container.classList.remove('expanded');
    if (toggleButton) {
        toggleButton.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
        toggleButton.title = '打开分组';
        toggleButton.setAttribute('aria-expanded', 'false');
    }
    if (categoryHeader) {
        categoryHeader.setAttribute('aria-expanded', 'false');
    }
}

function setCategoryContainerActive(container) {
    if (!container) return;
    const toggleButton = container.querySelector('.toggle-button');
    const categoryHeader = container.querySelector('.category-header');

    container.classList.add('collapsed', 'expanded');
    if (toggleButton) {
        toggleButton.innerHTML = '<i class="ri-close-line"></i>';
        toggleButton.title = '关闭分组';
        toggleButton.setAttribute('aria-expanded', 'true');
    }
    if (categoryHeader) {
        categoryHeader.setAttribute('aria-expanded', 'true');
    }
}

function ensureCategoryPanel() {
    if (categoryPanelElements) {
        return categoryPanelElements;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'category-panel-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('aside');
    panel.className = 'category-panel';
    panel.id = 'category-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-hidden', 'true');

    panel.innerHTML = `
        <div class="category-panel-header">
            <div class="category-panel-title">
                <span class="category-panel-icon"><i class="ri-folder-open-line"></i></span>
                <div>
                    <h3></h3>
                    <p></p>
                </div>
            </div>
            <button class="category-panel-close" type="button" aria-label="关闭分组">
                <i class="ri-close-line"></i>
            </button>
        </div>
        <ul class="category-panel-list"></ul>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    const closeButton = panel.querySelector('.category-panel-close');
    backdrop.addEventListener('click', () => {
        if (!window.dismissHomeCategoryTray?.({ message: false })) {
            closeCategoryPanel(true);
        }
    });
    closeButton.addEventListener('click', () => closeCategoryPanel(true));

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && activeCategoryContainer) {
            closeCategoryPanel(true);
        }
    });

    window.addEventListener('resize', () => {
        if (activeCategoryContainer) {
            positionCategoryPanel(activeCategoryContainer);
        }
    });

    window.addEventListener('scroll', () => {
        if (activeCategoryContainer && window.innerWidth > 768) {
            positionCategoryPanel(activeCategoryContainer);
        }
    }, { passive: true });

    categoryPanelElements = {
        backdrop,
        panel,
        title: panel.querySelector('.category-panel-title h3'),
        meta: panel.querySelector('.category-panel-title p'),
        list: panel.querySelector('.category-panel-list')
    };
    return categoryPanelElements;
}

function getCategoryPanelLinks(category) {
    return links
        .filter(link => (link.category || '未分类') === category)
        .sort((a, b) => b.ID - a.ID);
}

function positionCategoryPanel(container) {
    const { panel } = ensureCategoryPanel();
    const isMobile = window.innerWidth <= 768;
    panel.classList.toggle('mobile', isMobile);

    if (isMobile) {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.bottom = '';
        panel.style.width = '';
        return;
    }

    const rect = container.getBoundingClientRect();
    const viewportPadding = 16;
    const panelWidth = Math.min(560, window.innerWidth - viewportPadding * 2);
    const panelHeight = Math.min(panel.scrollHeight || 520, window.innerHeight - viewportPadding * 2);

    let left = rect.left + rect.width / 2 - panelWidth / 2;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - panelWidth - viewportPadding));

    const belowTop = rect.bottom + 12;
    const aboveTop = rect.top - panelHeight - 12;
    const top = belowTop + panelHeight <= window.innerHeight - viewportPadding
        ? belowTop
        : Math.max(viewportPadding, aboveTop);

    panel.style.width = `${panelWidth}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.bottom = 'auto';
}

function openCategoryPanel(container, saveState = true) {
    const category = container.dataset.category;
    const categoryLinks = getCategoryPanelLinks(category);
    const { backdrop, panel, title, meta, list } = ensureCategoryPanel();

    document.querySelectorAll('.category-container.expanded').forEach(resetCategoryContainer);
    activeCategoryContainer = container;
    setCategoryContainerActive(container);

    title.textContent = category || '未分类';
    meta.textContent = `${categoryLinks.length} 个链接`;
    list.replaceChildren();
    categoryLinks.forEach(link => {
        list.appendChild(createHomeLinkElement(link));
    });

    if (getSetting('showThumbnails', true) === false) {
        list.querySelectorAll('.link-card-thumbnail').forEach(thumbnail => {
            thumbnail.style.display = 'none';
        });
    }

    positionCategoryPanel(container);
    requestAnimationFrame(() => {
        backdrop.classList.add('show');
        panel.classList.add('show');
        panel.setAttribute('aria-hidden', 'false');
    });

    window.updateCategoryActionButtonState?.();
}

function closeCategoryPanel(saveState = true) {
    if (!categoryPanelElements) {
        activeCategoryContainer = null;
        return;
    }

    if (activeCategoryContainer) {
        resetCategoryContainer(activeCategoryContainer);
    }
    activeCategoryContainer = null;

    document.querySelectorAll('.url-dropdown.show').forEach(dropdown => {
        dropdown.classList.remove('show');
    });

    categoryPanelElements.backdrop.classList.remove('show');
    categoryPanelElements.panel.classList.remove('show', 'mobile');
    categoryPanelElements.panel.setAttribute('aria-hidden', 'true');

    window.updateCategoryActionButtonState?.();
}

// 手风琴：就地展开某张分类卡，把该分类的链接填进它的 .link-list（按需渲染）
function toggleCategoryAccordion(container) {
    if (!container) return;

    const isExpanded = container.classList.contains('expanded');
    const linkList = container.querySelector('.link-list');
    const toggleButton = container.querySelector('.toggle-button');
    const categoryHeader = container.querySelector('.category-header');

    if (isExpanded) {
        // 收起：清空已渲染的链接以释放 DOM
        container.classList.remove('expanded');
        if (linkList) linkList.replaceChildren();
        if (toggleButton) {
            toggleButton.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
            toggleButton.title = '展开分组';
        }
        if (categoryHeader) categoryHeader.setAttribute('aria-expanded', 'false');
        return;
    }

    // 展开：按需填充链接（首次展开才渲染，避免空闪）
    const category = container.dataset.category;
    const categoryLinks = getCategoryPanelLinks(category);
    if (linkList) {
        linkList.replaceChildren(...categoryLinks.map(createHomeLinkElement));
        if (getSetting('showThumbnails', true) === false) {
            linkList.querySelectorAll('.link-card-thumbnail').forEach(thumbnail => {
                thumbnail.style.display = 'none';
            });
        }
    }
    container.classList.add('expanded');
    if (toggleButton) {
        toggleButton.innerHTML = '<i class="ri-arrow-down-s-line"></i>';
        toggleButton.title = '收起分组';
    }
    if (categoryHeader) categoryHeader.setAttribute('aria-expanded', 'true');
}

// 收起所有手风琴卡（清空 DOM）
function collapseAllCategoryAccordions() {
    document.querySelectorAll('.category-container.expanded').forEach(container => {
        container.classList.remove('expanded');
        const linkList = container.querySelector('.link-list');
        if (linkList) linkList.replaceChildren();
        const toggleButton = container.querySelector('.toggle-button');
        if (toggleButton) {
            toggleButton.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
            toggleButton.title = '展开分组';
        }
        const categoryHeader = container.querySelector('.category-header');
        if (categoryHeader) categoryHeader.setAttribute('aria-expanded', 'false');
    });
}

// 切换分类展开状态（手风琴就地展开，不再走浮层 panel）
function toggleCategory(container) {
    if (!container) return;
    toggleCategoryAccordion(container);
}

    // 初始化分类展开状态
    function initCategoryToggles() {
    const categoryContainers = document.querySelectorAll('.category-container');

    categoryContainers.forEach(container => {
        const linkList = container.querySelector('.link-list');
        const toggleButton = container.querySelector('.toggle-button');
        const categoryHeader = container.querySelector('.category-header');
        
        if (!linkList || !toggleButton) return;
        
        resetCategoryContainer(container);
        if (categoryHeader) {
            categoryHeader.setAttribute('role', 'button');
            categoryHeader.setAttribute('tabindex', '0');
            categoryHeader.setAttribute('aria-expanded', 'false');
        }
        
        // 点击标题切换展开状态
        if (categoryHeader) {
            categoryHeader.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleCategory(container, true);
            });

            categoryHeader.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleCategory(container, true);
                }
            });
        }
        
        // 点击按钮切换展开状态
        if (toggleButton) {
            toggleButton.addEventListener('click', function(event) {
                event.stopPropagation();
                event.preventDefault();
                toggleCategory(container, true);
            });
        }
    });

    if (
        getSetting('defaultExpandFirst', false) === true
        && document.body.classList.contains('home-categories-open')
    ) {
        const firstCategory = categoryContainers[0];
        if (firstCategory && !firstCategory.classList.contains('expanded')) {
            toggleCategoryAccordion(firstCategory);
        }
    }
}

// 一键展开/收起所有分类（手风琴）
window.toggleAllCategories = function(expand) {
    const categoryContainers = document.querySelectorAll('.category-container');

    if (expand) {
        if (!ensureHomeCategoriesVisibleForAction()) return;
        const firstCategory = categoryContainers[0];
        if (firstCategory && !firstCategory.classList.contains('expanded')) {
            toggleCategoryAccordion(firstCategory);
        }
        window.updateCategoryActionButtonState?.();
        return;
    }

    collapseAllCategoryAccordions();
    closeCategoryPanel(false);
    window.updateCategoryActionButtonState?.();
};

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

// Service Worker：离线缓存（仅 http/https 生效；file:// 打开时无此 API）
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(error => {
            console.info('[lnp] Service Worker 注册失败，离线缓存不可用', error);
        });
    });
}
