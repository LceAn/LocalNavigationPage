/* main.js — UI 与应用入口（设置面板、弹窗、启动器、事件绑定、分类手风琴）
 * 数据层: storage.js / links-data.js；渲染层: home-render.js；
 * 设置链接列表: settings-links.js。本文件必须最后加载。 */
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
                showMessage('提示：建议定期导出备份以防数据丢失（设置 → 数据）', 'warning');
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

    let messageHideTimer = null;
    function showMessage(message, type = 'success') {
        messageContainer.textContent = message;
        // 类型样式：success 保持默认渐变，warning/error 换色区分
        messageContainer.classList.toggle('type-warning', type === 'warning');
        messageContainer.classList.toggle('type-error', type === 'error');
        messageContainer.style.display = 'block';
        setTimeout(() => {
            messageContainer.style.opacity = '1';
        }, 10);
        // 清掉上一条消息的隐藏定时器，避免连续提示时被旧定时器提前藏掉
        clearTimeout(messageHideTimer);
        messageHideTimer = setTimeout(() => {
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
            return;
        }
        // "/" 快速聚焦搜索框（输入类元素内不抢键）
        if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const tag = (document.activeElement?.tagName || '').toLowerCase();
            if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
                event.preventDefault();
                document.getElementById('search-input')?.focus();
            }
        }
    });



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
            { el: document.getElementById('search-engine-modal'), close: () => closeSearchEngineModal() }
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
                    <button class="category-action-btn move" title="上移" data-action="up" data-category="${escapeHTML(name)}">
                        <i class="ri-arrow-up-line"></i>
                    </button>
                    <button class="category-action-btn move" title="下移" data-action="down" data-category="${escapeHTML(name)}">
                        <i class="ri-arrow-down-line"></i>
                    </button>
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
                } else if (action === 'up' || action === 'down') {
                    moveCategory(category, action === 'up' ? -1 : 1);
                }
            });
        });
    }
    
    // 手动排序:上移/下移分组,写入 customCategoryOrder 并即时生效
    function getCustomCategoryOrder() {
        const saved = getSetting('customCategoryOrder', []);
        return Array.isArray(saved) ? saved.filter(Boolean) : [];
    }

    function moveCategory(name, delta) {
        // 基于当前展示顺序建立完整序列(未记录的分组保持名称序附在后面)
        const current = getAllCategoryNames(links);
        const saved = getCustomCategoryOrder();
        const known = [...new Set([...saved.filter(c => current.includes(c)), ...current])];
        const idx = known.indexOf(name);
        const target = idx + delta;
        if (idx === -1 || target < 0 || target >= known.length) return;
        [known[idx], known[target]] = [known[target], known[idx]];
        setSetting('customCategoryOrder', known);
        setSetting('groupSortMode', 'custom');
        renderCategoriesList();
        renderLinksByCategory(links);
        const sortSel = document.getElementById('group-sort-select');
        if (sortSel) sortSel.value = 'custom';
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
            showMessage('请填写名称和至少一个 URL 地址', 'error');
            return;
        }

        if (validUrls.some(url => !isSafeUrl(url.address))) {
            showMessage('链接地址格式无效', 'error');
            return;
        }

        if (thumbnail && !isSafeUrl(thumbnail, ['http:', 'https:'])) {
            showMessage('缩略图地址只支持 HTTP 或 HTTPS', 'error');
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
            showMessage(`提示：该地址已存在于「${duplicate.name}」`, 'warning');
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
                    // 备份来自更新版本时提示（数据仍尝试导入，但不保证兼容）
                    if (data.appVersion && compareVersions(String(data.appVersion), currentVersion) > 0) {
                        showMessage(`注意：备份由更新版本 v${data.appVersion} 导出，可能存在不兼容字段`, 'warning');
                    }
                    const hasLinks = data.links && Array.isArray(data.links);
                    const hasSettings = data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings);

                    // 导入是覆盖式：任何写入发生前先确认，避免误点丢数据
                    if (hasLinks || hasSettings) {
                        const incomingCount = hasLinks ? normalizeLinks(data.links).length : 0;
                        const scope = [hasSettings && '全部设置', hasLinks && (incomingCount + ' 条链接')].filter(Boolean).join(' + ');
                        if (!confirm(`导入将替换${scope}，当前 ${links.length} 条链接会被覆盖，继续？`)) {
                            showMessage('已取消导入', 'warning');
                            importFileInput.value = '';
                            return;
                        }
                    }

                    if (hasSettings) {
                        restoreSettingsSnapshot(data.settings);
                    }

                    // 导入前自动备份当前配置（Flare 式安全网），失败不阻断导入
                    try {
                        const auto = JSON.stringify(createFullBackup(), null, 2);
                        const autoBlob = new Blob([auto], { type: 'application/json' });
                        const autoUrl = URL.createObjectURL(autoBlob);
                        const autoA = document.createElement('a');
                        autoA.href = autoUrl;
                        autoA.download = 'navigation-auto-backup-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19) + '.json';
                        autoA.click();
                        setTimeout(() => URL.revokeObjectURL(autoUrl), 2000);
                    } catch (e) { console.warn('自动备份失败', e); }

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
                        showMessage('无效的数据格式', 'error');
                    }
                } catch (err) {
                    showMessage('导入失败：' + err.message, 'error');
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
                showMessage('导入失败：文件格式无法解析', 'error');
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
    const currentVersion = '1.10.0';
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


    // 在线状态探测频率：变更即时生效（重启监控循环）
    {
        const probeSelect = document.getElementById('probe-interval-select');
        if (probeSelect) {
            probeSelect.value = String(getProbeIntervalMs());
            probeSelect.addEventListener('change', () => {
                setSetting('probeIntervalMs', Number(probeSelect.value));
                startStatusMonitor(links);
                showMessage(Number(probeSelect.value) === 0 ? '已关闭在线状态探测' : '探测频率已更新');
            });
        }
    }

    // 智能选路开关
    {
        const smartToggle = document.getElementById('smart-routing-toggle');
        if (smartToggle) {
            smartToggle.checked = getSetting('smartRouting', false) === true;
            smartToggle.addEventListener('change', () => {
                setSetting('smartRouting', smartToggle.checked);
                showMessage(smartToggle.checked ? '智能选路已开启' : '智能选路已关闭');
            });
        }
    }

    // 自定义 CSS：注入 <style>，实时生效并持久化
    function applyCustomCss(css) {
        let el = document.getElementById('custom-user-css');
        if (!el) {
            el = document.createElement('style');
            el.id = 'custom-user-css';
            document.head.appendChild(el);
        }
        el.textContent = String(css || '');
    }
    window.applyCustomCss = applyCustomCss;
    {
        const cssBox = document.getElementById('custom-css-input');
        if (cssBox) {
            cssBox.value = getSetting('customCss', '');
            applyCustomCss(cssBox.value);
            let cssDebounce = null;
            cssBox.addEventListener('input', () => {
                clearTimeout(cssDebounce);
                cssDebounce = setTimeout(() => {
                    applyCustomCss(cssBox.value);
                    setSetting('customCss', cssBox.value);
                }, 400);
            });
        } else {
            applyCustomCss(getSetting('customCss', ''));
        }
    }

    // 主题色板:预设主色,写 :root / .dark-mode 主色变量(color-mix 派生色自动联动)
    const PRIMARY_PRESETS = [
        { id: 'indigo',  name: '靛蓝', light: 'oklch(62% 0.19 268)', dark: 'oklch(73% 0.14 268)', rgbLight: '93 95 239',   rgbDark: '129 140 248' },
        { id: 'violet',  name: '紫',   light: 'oklch(60% 0.20 300)', dark: 'oklch(72% 0.15 300)', rgbLight: '124 77 255',  rgbDark: '167 139 250' },
        { id: 'teal',    name: '青',   light: 'oklch(64% 0.13 195)', dark: 'oklch(74% 0.11 195)', rgbLight: '13 148 166',  rgbDark: '103 198 212' },
        { id: 'green',   name: '绿',   light: 'oklch(64% 0.16 150)', dark: 'oklch(74% 0.13 150)', rgbLight: '34 160 94',   rgbDark: '110 200 150' },
        { id: 'orange',  name: '橙',   light: 'oklch(70% 0.16 55)',  dark: 'oklch(78% 0.13 55)',  rgbLight: '235 130 52',  rgbDark: '246 166 90' },
        { id: 'pink',    name: '粉',   light: 'oklch(66% 0.19 350)', dark: 'oklch(75% 0.15 350)', rgbLight: '225 60 130',  rgbDark: '240 130 170' },
        { id: 'red',     name: '红',   light: 'oklch(60% 0.20 25)',  dark: 'oklch(70% 0.16 25)',  rgbLight: '220 60 60',   rgbDark: '235 110 110' },
        { id: 'blue',    name: '蓝',   light: 'oklch(62% 0.18 245)', dark: 'oklch(73% 0.14 245)', rgbLight: '37 99 235',   rgbDark: '96 145 250' }
    ];

    function applyCustomPrimary(id) {
        const preset = PRIMARY_PRESETS.find(p => p.id === id);
        let el = document.getElementById('custom-primary-css');
        if (!preset) {
            el?.remove();
            return;
        }
        if (!el) {
            el = document.createElement('style');
            el.id = 'custom-primary-css';
            document.head.appendChild(el);
        }
        el.textContent = [
            ':root { --primary-color: ' + preset.light + '; --primary-rgb: ' + preset.rgbLight + '; --primary-dark: ' + preset.dark + '; }',
            '.dark-mode { --primary-color: ' + preset.dark + '; --primary-rgb: ' + preset.rgbDark + '; --primary-dark: ' + preset.light + '; }'
        ].join('\n');
    }

    {
        const swatches = document.getElementById('theme-swatches');
        if (swatches) {
            const saved = getSetting('customPrimary', 'indigo');
            swatches.innerHTML = PRIMARY_PRESETS.map(p =>
                '<button type="button" class="theme-swatch" data-preset="' + p.id + '" title="' + p.name +
                '" aria-label="主题色 ' + p.name + '"><span class="swatch-dot" style="background:' + p.light + '"></span><span class="swatch-name">' + p.name + '</span></button>'
            ).join('');
            applyCustomPrimary(saved);
            [...swatches.querySelectorAll('.theme-swatch')].forEach(btn => {
                btn.classList.toggle('active', btn.dataset.preset === saved);
                btn.addEventListener('click', () => {
                    const id = btn.dataset.preset;
                    applyCustomPrimary(id);
                    setSetting('customPrimary', id);
                    swatches.querySelectorAll('.theme-swatch').forEach(b => b.classList.toggle('active', b.dataset.preset === id));
                    showMessage('主题色已切换');
                });
            });
        }
    }

    // 自定义 JS:页面加载后执行一次（随设置备份导出）
    {
        const jsBox = document.getElementById('custom-js-input');
        const runCustomJs = (code) => {
            const safe = String(code || '').trim();
            if (!safe) return;
            try { new Function(safe)(); }
            catch (err) { console.warn('[lnp] 自定义 JS 执行失败', err); }
        };
        if (jsBox) {
            jsBox.value = getSetting('customJs', '');
            let jsDebounce = null;
            jsBox.addEventListener('input', () => {
                clearTimeout(jsDebounce);
                jsDebounce = setTimeout(() => {
                    setSetting('customJs', jsBox.value);
                    runCustomJs(jsBox.value);
                }, 600);
            });
        }
        runCustomJs(getSetting('customJs', ''));
    }

    // 分组排序：名称 / 链接数量（即时重渲染）
    {
        const sortSel = document.getElementById('group-sort-select');
        if (sortSel) {
            sortSel.value = getSetting('groupSortMode', 'name');
            sortSel.addEventListener('change', () => {
                setSetting('groupSortMode', sortSel.value);
                renderLinksByCategory(links);
                showMessage('分组排序已更新');
            });
        }
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
            showMessage('请填写按钮名称和地址', 'error');
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
    // （搜索引擎管理已拆出至 search-engines.js）
    // （显示设置：时间/日期/天气已拆出至 display.js）
    
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
            // 前缀搜索："/b 关键词" 用 b 开头的引擎搜索（匹配引擎名前缀或自定义 prefix 字段）
            const raw = searchInput.value.trim();
            const prefixMatch = raw.match(/^\/(\S+)\s+(.+)$/);
            if (prefixMatch) {
                const prefix = prefixMatch[1].toLowerCase();
                const term = prefixMatch[2];
                const engines = loadSearchEngines();
                const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
                const hit = engines.find(en => en.name.toLowerCase().startsWith(prefix))
                    ?? engines.find(en => (en.prefix || '').toLowerCase() === prefix)
                    ?? engines.find(en => hostOf(en.url).startsWith(prefix));
                if (hit) {
                    searchInput.value = term;
                    performSearch(hit, term);
                    return;
                }
            }
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

// Service Worker：离线缓存（仅 http/https 生效；file:// 打开时无此 API）
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(error => {
            console.info('[lnp] Service Worker 注册失败，离线缓存不可用', error);
        });
    });
}
