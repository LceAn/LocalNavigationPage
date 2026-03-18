document.addEventListener("DOMContentLoaded", function () {
    // 存储链接数据的全局变量
    let links = [];

    // 更新时间和日期
    function updateDateTime() {
        const now = new Date();
        const timeElement = document.getElementById('current-time');
        const dateElement = document.getElementById('current-date');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        timeElement.textContent = `${hours}:${minutes}:${seconds}`;
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        dateElement.textContent = `${year}年${month}月${day}日`;
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // 获取链接数据并渲染到页面
    fetch('data/links.json')
        .then(response => response.json())
        .then(data => {
            links = data.links;
            renderLinksByCategory(links);
            renderLinksInSettings(links);
            updateCategoryDatalist();
            updateStorageInfo();
        })
        .catch(error => console.error('加载链接数据失败：', error));

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

    function hideMessage() {
        messageContainer.style.opacity = '0';
        setTimeout(() => {
            messageContainer.style.display = 'none';
        }, 300);
    }
    showMessage('欢迎');

    // 搜索框滚动行为
    const searchContainer = document.querySelector('.search-container');
    const searchContainerWrapper = document.querySelector('.search-container-wrapper');
    let searchContainerHeight = searchContainerWrapper.offsetHeight;
    let searchContainerOffset = searchContainerWrapper.offsetTop;
    let ticking = false;

    function initSearchContainerPosition() {
        searchContainerHeight = searchContainerWrapper.offsetHeight;
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

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // 移除所有激活状态
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // 添加激活状态
            button.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');

            // 如果切换到链接管理标签页，重新渲染链接
            if (targetTab === 'links') {
                renderLinksInSettings(links);
            }
        });
    });

    // 打开设置按钮
    const openSettingsBtn = document.getElementById('open-settings');
    if (openSettingsBtn) {
        openSettingsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const settingsContainer = document.getElementById('settings-container');
            if (settingsContainer) {
                // 先设置 display 为 flex，再添加 show 类
                settingsContainer.style.setProperty('display', 'flex', 'important');
                // 使用 setTimeout 确保浏览器先渲染 display
                requestAnimationFrame(() => {
                    settingsContainer.classList.add('show');
                    renderLinksInSettings(links);
                    updateStorageInfo();
                });
            }
        });
    }

    // 关闭设置按钮
    const closeSettingsButton = document.getElementById('close-settings');
    closeSettingsButton.addEventListener('click', function () {
        const settingsContainer = document.getElementById('settings-container');
        settingsContainer.classList.remove('show');
        setTimeout(() => {
            settingsContainer.style.display = 'none';
        }, 250);
    });

    // 点击设置容器背景关闭
    const settingsContainer = document.getElementById('settings-container');
    settingsContainer.addEventListener('click', function(e) {
        if (e.target === settingsContainer) {
            settingsContainer.classList.remove('show');
            setTimeout(() => {
                settingsContainer.style.display = 'none';
            }, 250);
        }
    });

    // 弹窗相关元素
    const linkModal = document.getElementById('link-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const addLinkToolbarBtn = document.getElementById('add-link-toolbar-btn');
    const editForm = document.getElementById('edit-form');
    
    // 打开添加链接弹窗
    function openAddModal() {
        // 清空表单
        document.getElementById('edit-name').value = '';
        document.getElementById('edit-url').value = '';
        document.getElementById('edit-category').value = '';
        document.getElementById('edit-tag').value = '';
        document.getElementById('edit-thumbnail').value = '';
        // 清空预览
        const thumbnailPreview = document.getElementById('thumbnail-preview');
        thumbnailPreview.innerHTML = '<i class="ri-image-add-line"></i><span>预览</span>';
        thumbnailPreview.classList.remove('has-image');
        // 更新标题
        modalTitle.innerHTML = '<i class="ri-add-circle-line"></i><span>添加链接</span>';
        // 显示弹窗
        linkModal.style.display = 'flex';
        requestAnimationFrame(() => {
            linkModal.classList.add('show');
        });
    }
    
    // 打开编辑链接弹窗
    function openEditModal(link) {
        // 填充表单
        document.getElementById('edit-name').value = link.name;
        document.getElementById('edit-url').value = link.url;
        document.getElementById('edit-category').value = link.category;
        document.getElementById('edit-tag').value = link.tag || '';
        document.getElementById('edit-thumbnail').value = link.thumbnail || '';
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
        links.forEach(link => {
            const category = link.category;
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
                    <p>暂无分类</p>
                </div>
            `;
            return;
        }
        
        categoriesList.innerHTML = categoryNames.map(name => `
            <div class="category-item" data-category="${name}">
                <div class="category-item-info">
                    <div class="category-item-icon">
                        <i class="ri-folder-line"></i>
                    </div>
                    <span class="category-item-name">${name}</span>
                    <span class="category-item-count">${categories[name]} 个链接</span>
                </div>
                <div class="category-item-actions">
                    <button class="category-action-btn edit" title="重命名" data-action="edit" data-category="${name}">
                        <i class="ri-edit-line"></i>
                    </button>
                    <button class="category-action-btn delete" title="删除" data-action="delete" data-category="${name}">
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
            showMessage('请输入分类名称');
            return;
        }
        name = name.trim();
        
        const categories = [...new Set(links.map(l => l.category))];
        if (categories.includes(name)) {
            showMessage('分类已存在');
            return;
        }
        
        showMessage('已添加分类：' + name);
        renderCategoriesList();
        updateCategoryDatalist();
        updateStorageInfo();
        newCategoryNameInput.value = '';
    }
    
    // 编辑分类（重命名）
    function editCategory(oldName) {
        const newName = prompt('请输入新的分类名称：', oldName);
        if (newName && newName.trim() && newName !== oldName) {
            const trimmedName = newName.trim();
            // 更新所有该分类的链接
            links.forEach(link => {
                if (link.category === oldName) {
                    link.category = trimmedName;
                }
            });
            showMessage('已重命名分类');
            renderCategoriesList();
            renderLinksInSettings(links);
            renderLinksByCategory(links);
            updateCategoryDatalist();
        }
    }
    
    // 删除分类
    function deleteCategory(name) {
        const categoryLinks = links.filter(l => l.category === name);
        if (categoryLinks.length > 0) {
            if (!confirm(`分类"${name}"中有 ${categoryLinks.length} 个链接，删除后这些链接将被移动到"未分类"。确定要删除吗？`)) {
                return;
            }
            // 将该分类的所有链接移动到"未分类"
            links.forEach(link => {
                if (link.category === name) {
                    link.category = '未分类';
                }
            });
        } else {
            if (!confirm(`确定要删除空分类"${name}"吗？`)) {
                return;
            }
        }
        showMessage('已删除分类');
        renderCategoriesList();
        renderLinksInSettings(links);
        renderLinksByCategory(links);
        updateCategoryDatalist();
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
        const url = document.getElementById('edit-url').value.trim();
        const category = document.getElementById('edit-category').value.trim();
        const tag = document.getElementById('edit-tag').value.trim();
        const thumbnail = document.getElementById('edit-thumbnail').value.trim();

        if (!name || !url) {
            showMessage('请填写名称和 URL');
            return;
        }

        const editingLinkId = window.editingLinkId;
        if (editingLinkId !== null) {
            // 编辑现有链接
            const linkIndex = links.findIndex(l => l.ID === editingLinkId);
            if (linkIndex !== -1) {
                links[linkIndex].name = name;
                links[linkIndex].url = url;
                links[linkIndex].category = category;
                links[linkIndex].tag = tag;
                links[linkIndex].thumbnail = thumbnail || `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=240&h=240`;
            }
            showMessage('已更新链接');
        } else {
            // 添加新链接
            const newId = links.length > 0 ? Math.max(...links.map(l => l.ID)) + 1 : 1;
            const newLink = {
                ID: newId,
                name: name,
                url: url,
                category: category || '未分类',
                tag: tag,
                thumbnail: thumbnail || `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=240&h=240`
            };
            links.push(newLink);
            showMessage('已添加链接');
        }

        // 关闭弹窗
        closeModal();
        // 重新渲染
        renderLinksByCategory(links);
        renderLinksInSettings(links);
        updateCategoryDatalist();
        updateStorageInfo();
    });

    // 缩略图预览功能
    const thumbnailInput = document.getElementById('edit-thumbnail');
    const thumbnailPreview = document.getElementById('thumbnail-preview');

    thumbnailInput.addEventListener('input', function() {
        const url = this.value.trim();
        if (url) {
            thumbnailPreview.innerHTML = `<img src="${url}" alt="预览" onerror="this.parentElement.innerHTML='<i class=ri-image-off-line></i><span>图片加载失败</span>'">`;
            thumbnailPreview.classList.add('has-image');
        } else {
            thumbnailPreview.innerHTML = '<i class="ri-image-add-line"></i><span>预览</span>';
            thumbnailPreview.classList.remove('has-image');
        }
    });

    // 更新分类数据列表
    function updateCategoryDatalist() {
        const datalist = document.getElementById('category-list');
        const categories = [...new Set(links.map(l => l.category))];
        datalist.innerHTML = categories.map(c => `<option value="${c}">`).join('');
    }

    // 更新存储信息
    function updateStorageInfo() {
        const categories = [...new Set(links.map(l => l.category))];
        document.getElementById('total-links').textContent = links.length;
        document.getElementById('total-categories').textContent = categories.length;
        
        // 更新迷你统计卡片
        const storageSizeMini = document.getElementById('storage-size-mini');
        if (storageSizeMini) {
            const dataSize = new Blob([JSON.stringify(links)]).size;
            const sizeText = dataSize < 1024 ? `${dataSize} B` : `${(dataSize / 1024).toFixed(1)} KB`;
            storageSizeMini.textContent = sizeText;
        }

        // 计算数据大小
        const dataSize = new Blob([JSON.stringify(links)]).size;
        const sizeText = dataSize < 1024 ? `${dataSize} B` : `${(dataSize / 1024).toFixed(2)} KB`;
        document.getElementById('storage-size').textContent = sizeText;

        // 最后更新时间
        const lastUpdate = localStorage.getItem('lastUpdate');
        if (lastUpdate) {
            document.getElementById('storage-last-update').textContent = new Date(lastUpdate).toLocaleString('zh-CN');
        } else {
            document.getElementById('storage-last-update').textContent = '-';
        }
    }

    // 搜索链接功能
    const linksSearch = document.getElementById('links-search');
    if (linksSearch) {
        linksSearch.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const linkItems = document.querySelectorAll('#existing-links li[data-link-id]');
            linkItems.forEach(item => {
                const name = item.querySelector('.link-details h4').textContent.toLowerCase();
                const url = item.querySelector('.link-details a').textContent.toLowerCase();
                if (name.includes(searchTerm) || url.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    // 分类筛选功能
    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', function() {
            const selectedCategory = this.value;
            const linkItems = document.querySelectorAll('#existing-links li[data-link-id]');
            linkItems.forEach(item => {
                const itemCategory = item.dataset.category;
                if (!selectedCategory || itemCategory === selectedCategory) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    // 导出/导入数据功能
    const exportDataBtn = document.getElementById('export-data');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            const dataStr = JSON.stringify({ links }, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `navigation-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showMessage('数据已导出');
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
                    if (data.links && Array.isArray(data.links)) {
                        links = data.links;
                        renderLinksByCategory(links);
                        renderLinksInSettings(links);
                        updateCategoryDatalist();
                        updateStorageInfo();
                        localStorage.setItem('lastUpdate', new Date().toISOString());
                        showMessage('数据已导入');
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

    // 清除缓存
    const clearCacheBtn = document.getElementById('clear-cache');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            if (confirm('确定要清除缓存吗？')) {
                localStorage.clear();
                showMessage('缓存已清除');
            }
        });
    }

    // 重置所有
    const resetAllBtn = document.getElementById('reset-all');
    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', () => {
            if (confirm('确定要重置所有设置和数据吗？此操作不可恢复！')) {
                localStorage.clear();
                links = [];
                renderLinksByCategory(links);
                renderLinksInSettings(links);
                showMessage('已重置所有设置');
            }
        });
    }

    // 版本检测功能
    const currentVersion = '1.0.0';
    document.getElementById('current-version').textContent = currentVersion;
    
    // 检查 GitHub 最新版本
    fetch('https://api.github.com/repos/LceAn/LocalNavigationPage/releases/latest')
        .then(response => response.json())
        .then(data => {
            const latestVersion = data.tag_name.replace('v', '');
            const statusEl = document.getElementById('version-check-status');
            
            if (compareVersions(latestVersion, currentVersion) > 0) {
                statusEl.innerHTML = `
                    <a href="https://github.com/LceAn/LocalNavigationPage/releases/latest" target="_blank" 
                       style="color: var(--accent-color); text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="ri-arrow-up-line"></i>
                        <span>发现新版本 ${latestVersion}，点击更新</span>
                    </a>
                `;
            } else {
                statusEl.innerHTML = '<span style="color: var(--text-tertiary);"><i class="ri-check-line"></i> 已是最新版本</span>';
            }
        })
        .catch(error => {
            console.error('版本检测失败:', error);
            const statusEl = document.getElementById('version-check-status');
            statusEl.innerHTML = '<span style="color: var(--text-tertiary);"><i class="ri-error-warning-line"></i> 检测失败</span>';
        });
    
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
    const savedTheme = localStorage.getItem('theme') || 'light';

    themeOptions.forEach(option => {
        if (option.dataset.theme === savedTheme) {
            option.classList.add('selected');
        }
        option.addEventListener('click', () => {
            themeOptions.forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            const theme = option.dataset.theme;
            localStorage.setItem('theme', theme);

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
            showMessage('主题已切换');
        });
    });

    // 网站标题设置
    const siteTitleInput = document.getElementById('site-title-input');
    const savedTitle = localStorage.getItem('siteTitle') || '我的导航';
    siteTitleInput.value = savedTitle;
    document.querySelector('.page-header h1').textContent = savedTitle;
    
    siteTitleInput.addEventListener('input', function() {
        const title = this.value.trim() || '我的导航';
        document.querySelector('.page-header h1').textContent = title;
        document.title = title;
        localStorage.setItem('siteTitle', title);
    });

    // 布局选项功能
    const compactModeToggle = document.getElementById('compact-mode');
    const showThumbnailsToggle = document.getElementById('show-thumbnails');
    const enableAnimationsToggle = document.getElementById('enable-animations');

    if (compactModeToggle) {
        compactModeToggle.addEventListener('change', function() {
            if (this.checked) {
                document.body.classList.add('compact-mode');
            } else {
                document.body.classList.remove('compact-mode');
            }
            localStorage.setItem('compactMode', this.checked);
            showMessage(this.checked ? '已启用紧凑模式' : '已禁用紧凑模式');
        });
        compactModeToggle.checked = localStorage.getItem('compactMode') === 'true';
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
            localStorage.setItem('showThumbnails', this.checked);
            applyThumbnailSetting(this.checked);
            showMessage(this.checked ? '已显示缩略图' : '已隐藏缩略图');
        });
        showThumbnailsToggle.checked = localStorage.getItem('showThumbnails') !== 'false';
        // 初始化应用缩略图设置
        applyThumbnailSetting(showThumbnailsToggle.checked);
    }

    if (enableAnimationsToggle) {
        enableAnimationsToggle.addEventListener('change', function() {
            if (this.checked) {
                document.body.style.setProperty('--transition-fast', '0.15s');
                document.body.style.setProperty('--transition-normal', '0.25s');
            } else {
                document.body.style.setProperty('--transition-fast', '0s');
                document.body.style.setProperty('--transition-normal', '0s');
            }
            localStorage.setItem('enableAnimations', this.checked);
            showMessage(this.checked ? '已启用动画' : '已禁用动画');
        });
        enableAnimationsToggle.checked = localStorage.getItem('enableAnimations') !== 'false';
    }

    // 控制搜索框在滚动时的行为
    const searchButtons = document.querySelectorAll('.search-button');
    const searchInput = document.getElementById('search-input');

    searchButtons.forEach(button => {
        button.addEventListener('click', () => {
            const searchTerm = searchInput.value;
            const searchEngine = button.getAttribute('data-engine');
            if (searchTerm && searchEngine) {
                let searchURL = '';
                switch (searchEngine) {
                    case '百度':
                        searchURL = `https://www.baidu.com/s?wd=${encodeURIComponent(searchTerm)}`;
                        break;
                    case 'Google':
                        searchURL = `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;
                        break;
                    case '必应':
                        searchURL = `https://www.bing.com/search?q=${encodeURIComponent(searchTerm)}`;
                        break;
                }
                if (searchURL) {
                    window.open(searchURL, '_blank');
                }
            }
        });
    });

    // 置顶按钮功能
    const backToTopBtn = document.getElementById('back-to-top');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 200) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    });
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 一键收起/展开分组按钮功能
    const toggleAllGroupsBtn = document.createElement('button');
    toggleAllGroupsBtn.id = 'toggle-all-groups';
    toggleAllGroupsBtn.className = 'icon-button';
    toggleAllGroupsBtn.title = '一键收起/展开分组';
    toggleAllGroupsBtn.innerHTML = '<i class="ri-arrow-up-down-line"></i>';

    const functionButtons = document.querySelector('.function-buttons');
    functionButtons.appendChild(toggleAllGroupsBtn);

    let allCollapsed = false;
    toggleAllGroupsBtn.addEventListener('click', () => {
        const groupContainers = document.querySelectorAll('.category-container');
        groupContainers.forEach(container => {
            const linkList = container.querySelector('.link-list');
            const toggleBtn = container.querySelector('.toggle-button');
            if (!allCollapsed) {
                linkList.style.display = 'none';
                toggleBtn.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
                container.classList.add('collapsed');
            } else {
                linkList.style.display = 'flex';
                toggleBtn.innerHTML = '<i class="ri-arrow-down-s-line"></i>';
                container.classList.remove('collapsed');
            }
        });
        allCollapsed = !allCollapsed;
        showMessage(allCollapsed ? '已收起所有分组' : '已展开所有分组');
    });

    // 天气功能
    function updateWeather() {
        fetch('https://wttr.in/shanghai?format=%C+%t&m')
            .then(res => res.text())
            .then(text => {
                document.getElementById('weather-text').textContent = text.trim();
            })
            .catch(() => {
                document.getElementById('weather-text').textContent = '获取失败';
            });
    }
    updateWeather();
    setInterval(updateWeather, 1800000);

    // 分类展开/收缩功能
    function setupCategoryToggle() {
        const categoryContainers = document.querySelectorAll('.category-container');
        categoryContainers.forEach(container => {
            container.classList.add('collapsed');
            const categoryHeader = container.querySelector('.category-header');
            categoryHeader.addEventListener('click', function() {
                container.classList.toggle('collapsed');
            });
            const toggleButton = container.querySelector('.toggle-button');
            if (toggleButton) {
                toggleButton.addEventListener('click', function(event) {
                    event.stopPropagation();
                    container.classList.toggle('collapsed');
                });
            }
        });
    }
    setupCategoryToggle();

    // 创建垂直位置调整按钮
    const createVerticalPositionControls = () => {
        const functionButtons = document.querySelector('.function-buttons');
        const positionButton = document.createElement('button');
        positionButton.className = 'icon-button';
        positionButton.title = '页面位置调整';
        positionButton.id = 'position-button';
        positionButton.innerHTML = '<i class="ri-layout-line"></i>';

        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'dropdown-menu';
        dropdownMenu.id = 'position-dropdown';
        dropdownMenu.style.display = 'none';

        const options = [
            { text: '向上移动内容', icon: 'ri-arrow-up-line', action: 'top' },
            { text: '居中内容', icon: 'ri-align-center', action: 'default' },
            { text: '向下移动内容', icon: 'ri-arrow-down-line', action: 'bottom' }
        ];

        options.forEach(option => {
            const menuItem = document.createElement('div');
            menuItem.className = 'dropdown-item';
            menuItem.innerHTML = `<i class="${option.icon}"></i> ${option.text}`;
            menuItem.dataset.action = option.action;
            dropdownMenu.appendChild(menuItem);
        });

        functionButtons.appendChild(positionButton);
        document.body.appendChild(dropdownMenu);

        const container = document.querySelector('.container');

        positionButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdownMenu.style.display === 'block';

            if (isVisible) {
                dropdownMenu.style.display = 'none';
            } else {
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
            container.classList.remove('content-position-default', 'content-position-top', 'content-position-bottom');

            if (action) {
                container.classList.add(`content-position-${action}`);
                localStorage.setItem('contentPosition', action);
                let message = '';
                switch(action) {
                    case 'top': message = '内容已向上移动'; break;
                    case 'default': message = '内容已居中'; break;
                    case 'bottom': message = '内容已向下移动'; break;
                }
                showMessage(message);
            }

            dropdownMenu.style.display = 'none';
        });

        const savedPosition = localStorage.getItem('contentPosition');
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
    };

    createVerticalPositionControls();
});

// 渲染链接的函数（按照分类）
function renderLinksByCategory(links) {
    const linkContainer = document.getElementById('link-container');
    linkContainer.innerHTML = '';

    const categories = {};
    links.forEach(link => {
        const category = link.category;
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(link);
    });

    for (const category in categories) {
        categories[category].sort((a, b) => b.ID - a.ID);
    }

    const sortedCategories = Object.entries(categories)
        .sort((a, b) => {
            const maxA = Math.max(...a[1].map(link => link.ID));
            const maxB = Math.max(...b[1].map(link => link.ID));
            return maxB - maxA;
        });

    for (const [category, categoryLinks] of sortedCategories) {
        const categoryContainer = document.createElement('div');
        categoryContainer.className = 'category-container collapsed';
        categoryContainer.dataset.category = category;

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';

        const categoryTitle = document.createElement('h2');
        categoryTitle.textContent = category;

        const cardCount = document.createElement('span');
        cardCount.className = 'card-count';
        cardCount.textContent = categoryLinks.length;

        const toggleButton = document.createElement('button');
        toggleButton.className = 'toggle-button';
        toggleButton.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
        toggleButton.title = '展开/折叠';

        categoryHeader.appendChild(categoryTitle);
        categoryHeader.appendChild(cardCount);
        categoryHeader.appendChild(toggleButton);
        categoryContainer.appendChild(categoryHeader);

        const linkList = document.createElement('ul');
        linkList.className = 'link-list';
        linkList.style.display = 'none';
        categoryContainer.appendChild(linkList);

        categoryLinks.forEach(link => {
            const linkElement = document.createElement('li');
            const linkCard = document.createElement('a');
            linkCard.setAttribute('class', 'link-card');
            linkCard.setAttribute('href', link.url);
            linkCard.setAttribute('target', '_blank');

            if (link.thumbnail) {
                const thumbnailDiv = document.createElement('div');
                thumbnailDiv.className = 'link-card-thumbnail';
                thumbnailDiv.style.backgroundImage = `url(${link.thumbnail})`;
                linkCard.appendChild(thumbnailDiv);
            } else {
                const thumbnailDiv = document.createElement('div');
                const thumbnailUrl = `https://s0.wp.com/mshots/v1/${encodeURIComponent(link.url)}?w=240&h=240`;
                thumbnailDiv.className = 'link-card-thumbnail';
                thumbnailDiv.style.backgroundImage = `url(${thumbnailUrl})`;
                linkCard.appendChild(thumbnailDiv);
            }

            const cardContent = document.createElement('div');
            cardContent.setAttribute('class', 'link-card-content');

            const cardTitle = document.createElement('h3');
            cardTitle.setAttribute('class', 'link-card-title');
            cardTitle.textContent = link.name;

            const cardTag = document.createElement('span');
            cardTag.setAttribute('class', 'link-card-tag');
            cardTag.textContent = link.tag || '';

            cardContent.appendChild(cardTitle);
            linkCard.appendChild(cardContent);
            linkCard.appendChild(cardTag);
            linkElement.appendChild(linkCard);
            linkList.appendChild(linkElement);
        });

        categoryHeader.addEventListener('click', (event) => {
            const isExpanded = linkList.style.display !== 'none';
            toggleCategoryDisplay(categoryContainer, linkList, toggleButton, !isExpanded);
        });

        toggleButton.addEventListener('click', (event) => {
            event.stopPropagation();
            const isExpanded = linkList.style.display !== 'none';
            toggleCategoryDisplay(categoryContainer, linkList, toggleButton, !isExpanded);
        });

        linkContainer.appendChild(categoryContainer);
    }
}

function toggleCategoryDisplay(container, linkList, toggleButton, isExpand) {
    if (isExpand) {
        linkList.style.display = 'flex';
        toggleButton.innerHTML = '<i class="ri-arrow-down-s-line"></i>';
        container.classList.remove('collapsed');
    } else {
        linkList.style.display = 'none';
        toggleButton.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
        container.classList.add('collapsed');
    }
}

// 渲染链接到设置界面
function renderLinksInSettings(links) {
    const existingLinksList = document.getElementById('existing-links');
    const linksEmpty = document.getElementById('links-empty');

    if (!existingLinksList) return;

    existingLinksList.innerHTML = '';

    if (!links || links.length === 0) {
        if (linksEmpty) linksEmpty.style.display = 'block';
        return;
    }

    if (linksEmpty) linksEmpty.style.display = 'none';

    const categories = {};
    links.forEach(link => {
        const category = link.category;
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(link);
    });

    // 更新分类筛选下拉框
    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
        categoryFilter.innerHTML = '<option value="">全部分类</option>';
        Object.keys(categories).forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
    }

    for (const category in categories) {
        if (categories.hasOwnProperty(category)) {
            const categoryLinks = categories[category];

            const categoryTitle = document.createElement('h4');
            categoryTitle.textContent = category;
            categoryTitle.style.cssText = 'margin: 16px 0 8px 0; font-size: 13px; color: var(--text-secondary); font-weight: 600;';
            existingLinksList.appendChild(categoryTitle);

            const linkList = document.createElement('div');
            linkList.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
            existingLinksList.appendChild(linkList);

            categoryLinks.forEach(link => {
                const linkItem = createLinkItem(link);
                linkItem.dataset.linkId = link.ID;
                linkItem.dataset.category = category;
                linkList.appendChild(linkItem);
            });
        }
    }
}

// 创建链接列表项
function createLinkItem(link) {
    const linkItem = document.createElement('li');
    linkItem.style.cssText = 'display: flex; align-items: center; padding: 12px 14px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid rgba(0,0,0,0.04); transition: all 0.15s ease;';

    const linkInfo = document.createElement('div');
    linkInfo.className = 'link-info';
    linkInfo.style.cssText = 'flex: 1; display: flex; align-items: center; gap: 12px; min-width: 0;';

    const favicon = document.createElement('div');
    favicon.className = 'link-favicon';
    favicon.innerHTML = '<i class="ri-global-line"></i>';

    const linkDetails = document.createElement('div');
    linkDetails.className = 'link-details';

    const linkName = document.createElement('h4');
    linkName.textContent = link.name;
    linkName.style.cssText = 'margin: 0; font-size: 14px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';

    const linkUrl = document.createElement('a');
    linkUrl.href = link.url;
    linkUrl.target = '_blank';
    linkUrl.textContent = link.url;
    linkUrl.style.cssText = 'font-size: 12px; color: var(--text-tertiary); text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;';
    linkUrl.addEventListener('click', (e) => e.stopPropagation());

    linkDetails.appendChild(linkName);
    linkDetails.appendChild(linkUrl);
    linkInfo.appendChild(favicon);
    linkInfo.appendChild(linkDetails);
    linkItem.appendChild(linkInfo);

    const linkActions = document.createElement('div');
    linkActions.className = 'link-actions';
    linkActions.style.cssText = 'display: flex; gap: 8px; flex-shrink: 0;';

    const editButton = document.createElement('button');
    editButton.className = 'link-action-btn edit';
    editButton.innerHTML = '<i class="ri-edit-line"></i>';
    editButton.title = '编辑';
    editButton.addEventListener('click', (e) => {
        e.stopPropagation();
        // 设置编辑状态并打开弹窗
        window.editingLinkId = link.ID;
        openEditModal(link);
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'link-action-btn delete';
    deleteButton.innerHTML = '<i class="ri-delete-bin-line"></i>';
    deleteButton.title = '删除';
    deleteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`确定要删除 "${link.name}" 吗？`)) {
            const index = links.findIndex(l => l.ID === link.ID);
            if (index !== -1) {
                links.splice(index, 1);
                renderLinksByCategory(links);
                renderLinksInSettings(links);
                updateStorageInfo();
                showMessage('已删除链接');
            }
        }
    });

    linkActions.appendChild(editButton);
    linkActions.appendChild(deleteButton);
    linkItem.appendChild(linkActions);

    return linkItem;
}