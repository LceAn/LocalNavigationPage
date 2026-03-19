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
                    <input type="text" class="url-label" placeholder="标签" value="${urlObj.label || ''}" data-field="label" data-index="${index}">
                    <input type="text" class="url-address" placeholder="https://example.com" value="${urlObj.address || ''}" data-field="address" data-index="${index}">
                    <input type="number" class="url-priority" placeholder="优先级" value="${urlObj.priority || index + 1}" min="1" data-field="priority" data-index="${index}" title="优先级">
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
        // 清空表单
        document.getElementById('edit-name').value = '';
        document.getElementById('edit-category').value = '';
        document.getElementById('edit-tag').value = '';
        document.getElementById('edit-thumbnail').value = '';
        // 清空 URL 列表
        currentUrls = [];
        renderUrlsList();
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
    window.openEditModal = function(link) {
        // 填充表单
        document.getElementById('edit-name').value = link.name;
        document.getElementById('edit-category').value = link.category;
        document.getElementById('edit-tag').value = link.tag || '';
        document.getElementById('edit-thumbnail').value = link.thumbnail || '';
        
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
        const category = document.getElementById('edit-category').value.trim();
        const tag = document.getElementById('edit-tag').value.trim();
        const thumbnail = document.getElementById('edit-thumbnail').value.trim();

        // 获取 URL 列表，过滤掉空地址
        const validUrls = currentUrls.filter(u => u.address && u.address.trim());
        
        if (!name || validUrls.length === 0) {
            showMessage('请填写名称和至少一个 URL 地址');
            return;
        }

        const editingLinkId = window.editingLinkId;
        // 获取第一个 URL 用于生成缩略图
        const firstUrl = validUrls[0]?.address || '';
        
        if (editingLinkId !== null) {
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
                links[linkIndex].category = category;
                links[linkIndex].tag = tag;
                links[linkIndex].thumbnail = thumbnail || `https://s0.wp.com/mshots/v1/${encodeURIComponent(firstUrl)}?w=240&h=240`;
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
                thumbnail: thumbnail || `https://s0.wp.com/mshots/v1/${encodeURIComponent(firstUrl)}?w=240&h=240`
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
        
        // 更新统计卡片
        const totalLinksEl = document.getElementById('total-links');
        const totalCategoriesEl = document.getElementById('total-categories');
        if (totalLinksEl) totalLinksEl.textContent = links.length;
        if (totalCategoriesEl) totalCategoriesEl.textContent = categories.length;
        
        // 更新迷你统计卡片
        const storageSizeMini = document.getElementById('storage-size-mini');
        if (storageSizeMini) {
            const dataSize = new Blob([JSON.stringify(links)]).size;
            const sizeText = dataSize < 1024 ? `${dataSize} B` : `${(dataSize / 1024).toFixed(1)} KB`;
            storageSizeMini.textContent = sizeText;
        }

        // 更新存储信息面板的数据
        const storageLinksCount = document.getElementById('storage-links-count');
        const storageSize = document.getElementById('storage-size');
        const storageLastUpdate = document.getElementById('storage-last-update');
        
        if (storageLinksCount) storageLinksCount.textContent = links.length;
        
        if (storageSize) {
            const dataSize = new Blob([JSON.stringify(links)]).size;
            const sizeText = dataSize < 1024 ? `${dataSize} B` : `${(dataSize / 1024).toFixed(2)} KB`;
            storageSize.textContent = sizeText;
        }

        // 最后更新时间
        if (storageLastUpdate) {
            const lastUpdate = localStorage.getItem('lastUpdate');
            if (lastUpdate) {
                storageLastUpdate.textContent = new Date(lastUpdate).toLocaleString('zh-CN');
            } else {
                storageLastUpdate.textContent = '-';
            }
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
        const saved = localStorage.getItem('searchEngines');
        return saved ? JSON.parse(saved) : defaultSearchEngines;
    }
    
    // 保存搜索引擎
    function saveSearchEngines(engines) {
        localStorage.setItem('searchEngines', JSON.stringify(engines));
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
            <div class="search-engine-item" data-index="${index}">
                <div class="search-engine-drag-handle">
                    <i class="ri-draggable"></i>
                </div>
                <div class="search-engine-icon">
                    ${engine.icon ? `<img src="${engine.icon}" alt="${engine.name}">` : '<i class="ri-search-line"></i>'}
                </div>
                <div class="search-engine-info">
                    <h4 class="search-engine-name">${engine.name}</h4>
                    <p class="search-engine-url">${engine.url}</p>
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
        
        const engines = loadSearchEngines();
        const editIndex = window.editingSearchEngineIndex;
        
        if (editIndex !== null) {
            engines[editIndex] = { name, url, icon };
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
    
    // 更新搜索框按钮
    function updateSearchButtons() {
        const engines = loadSearchEngines();
        const buttons = document.querySelectorAll('.search-button');
        const buttonContainer = document.querySelector('.search-buttons');
        if (!buttonContainer) return;
        
        // 如果按钮数量不匹配，重新生成
        if (buttons.length !== engines.length) {
            buttonContainer.innerHTML = engines.map(engine => 
                `<button class="search-button" data-engine="${engine.name}">${engine.name}</button>`
            ).join('');
            
            // 重新绑定事件
            document.querySelectorAll('.search-button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const searchTerm = document.getElementById('search-input').value;
                    const engineName = btn.getAttribute('data-engine');
                    const engine = engines.find(e => e.name === engineName);
                    if (searchTerm && engine) {
                        const searchURL = engine.url.replace('%s', encodeURIComponent(searchTerm));
                        window.open(searchURL, '_blank');
                    }
                });
            });
        }
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
    
    // 初始化搜索引擎列表
    renderSearchEngines();
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
        const saved = localStorage.getItem('displaySettings');
        return saved ? JSON.parse(saved) : defaultDisplaySettings;
    }
    
    // 保存显示设置
    function saveDisplaySettings(settings) {
        localStorage.setItem('displaySettings', JSON.stringify(settings));
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
    
    // 更新时间显示
    function updateTimeDisplay() {
        const settings = loadDisplaySettings();
        const now = new Date();
        
        const timeElement = document.getElementById('current-time');
        const dateElement = document.getElementById('current-date');
        const weatherInfo = document.getElementById('weather-info');
        const dateSeparator = document.querySelectorAll('.date-separator');
        
        // 更新时间
        if (timeElement) {
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
            
            timeElement.textContent = timeText;
            timeElement.style.display = settings.showTime ? 'inline' : 'none';
        }
        
        // 更新日期
        if (dateElement) {
            dateElement.textContent = formatDate(now, settings.dateFormat);
            dateElement.style.display = settings.showDate ? 'inline' : 'none';
        }
        
        // 更新天气显示
        if (weatherInfo) {
            weatherInfo.style.display = settings.showWeather ? 'inline-flex' : 'none';
        }
        
        // 更新分隔符显示
        dateSeparator.forEach(sep => {
            const prevElement = sep.previousElementSibling;
            const nextElement = sep.nextElementSibling;
            const prevVisible = prevElement && prevElement.style.display !== 'none';
            const nextVisible = nextElement && nextElement.style.display !== 'none';
            sep.style.display = (prevVisible && nextVisible) ? 'inline' : 'none';
        });
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
                weatherLocationsEl.style.display = 'inline';
                weatherLocationText.textContent = cities.join(' / ');
            }
            fetchWeatherForCity(cities[0], unit, 'weather-text');
        }
    }
    
    // 获取指定城市的天气
    function fetchWeatherForCity(city, unit, elementId) {
        fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t&${unit === 'F' ? 'u' : 'm'}`)
            .then(res => res.text())
            .then(text => {
                const weatherText = document.getElementById(elementId);
                if (weatherText) {
                    weatherText.textContent = text.trim();
                }
            })
            .catch(() => {
                const weatherText = document.getElementById(elementId);
                if (weatherText) {
                    weatherText.textContent = '获取失败';
                }
            });
    }

    // 初始化显示设置
    initDisplaySettings();
    updateTimeDisplay();
    updateWeather();
    
    // 每秒更新一次时间和日期
    setInterval(() => {
        updateTimeDisplay();
    }, 1000);

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
            const linkCard = document.createElement('div');
            linkCard.setAttribute('class', 'link-card');
            linkCard.style.cssText = 'position: relative;';
            
            // 获取要显示的 URL（优先显示第一个）
            const urls = getLinkUrls(link);
            const displayUrl = urls[0]?.address || link.url || '#';

            if (link.thumbnail) {
                const thumbnailDiv = document.createElement('div');
                thumbnailDiv.className = 'link-card-thumbnail';
                thumbnailDiv.style.backgroundImage = `url(${link.thumbnail})`;
                linkCard.appendChild(thumbnailDiv);
            } else {
                const thumbnailDiv = document.createElement('div');
                const thumbnailUrl = `https://s0.wp.com/mshots/v1/${encodeURIComponent(displayUrl)}?w=240&h=240`;
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
            
            // 如果有多 URL，添加下拉菜单
            if (urls.length > 1) {
                const urlsContainer = document.createElement('div');
                urlsContainer.className = 'link-card-urls';
                
                // 地址数量标签（带呼吸灯效果）
                const urlCountBadge = document.createElement('div');
                urlCountBadge.className = 'url-count-badge';
                urlCountBadge.innerHTML = `
                    <span class="badge-dot"></span>
                    <span>${urls.length}个地址</span>
                `;
                urlCountBadge.title = '点击选择地址';
                
                const urlsButton = document.createElement('button');
                urlsButton.className = 'icon-button';
                urlsButton.innerHTML = '<i class="ri-arrow-down-s-line"></i>';
                urlsButton.title = '选择地址';
                urlsButton.style.cssText = 'position: absolute; top: 8px; right: 45px; width: 28px; height: 28px; background: rgba(0,0,0,0.5); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;';
                
                const urlsDropdown = document.createElement('div');
                urlsDropdown.className = 'url-dropdown';
                
                // 下拉菜单头部
                const dropdownHeader = document.createElement('div');
                dropdownHeader.className = 'url-dropdown-header';
                dropdownHeader.innerHTML = `
                    <span>选择地址</span>
                    <span class="url-count">${urls.length}个</span>
                `;
                urlsDropdown.appendChild(dropdownHeader);
                
                // URL 列表项
                urls.forEach((urlObj, idx) => {
                    const urlItem = document.createElement('div');
                    urlItem.className = 'url-dropdown-item';
                    urlItem.dataset.url = urlObj.address;
                    urlItem.dataset.index = idx;
                    
                    // 状态指示器（预留在线检测功能）
                    const statusClass = idx === 0 ? 'online' : 'checking';
                    const statusText = idx === 0 ? '在线' : '检测中';
                    
                    urlItem.innerHTML = `
                        <div class="status-wrapper">
                            <span class="status-dot ${statusClass}" title="${statusText}"></span>
                        </div>
                        <div class="url-info">
                            <div class="url-label">${urlObj.label || '地址' + (idx + 1)}</div>
                            <div class="url-address">${urlObj.address}</div>
                        </div>
                        <div class="url-meta">
                            ${idx === 0 ? '<span class="check-icon selected"><i class="ri-check-line"></i></span>' : ''}
                            <span class="priority-badge">优先级${urlObj.priority || idx + 1}</span>
                            <i class="ri-external-link-line external-link"></i>
                        </div>
                    `;
                    urlsDropdown.appendChild(urlItem);
                });
                
                urlsContainer.appendChild(urlCountBadge);
                urlsContainer.appendChild(urlsButton);
                urlsContainer.appendChild(urlsDropdown);
                linkCard.appendChild(urlsContainer);
                
                // 鼠标悬停显示下拉按钮
                linkCard.addEventListener('mouseenter', () => {
                    urlsButton.style.opacity = '1';
                });
                linkCard.addEventListener('mouseleave', () => {
                    urlsButton.style.opacity = '0';
                });
                
                // 绑定下拉按钮事件
                urlsButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    urlsDropdown.classList.toggle('show');
                });
                
                // 绑定地址数量标签点击事件
                urlCountBadge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    urlsDropdown.classList.toggle('show');
                });
                
                // 绑定 URL 选择事件
                urlsDropdown.querySelectorAll('.url-dropdown-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const url = item.dataset.url;
                        window.open(url, '_blank');
                        urlsDropdown.classList.remove('show');
                    });
                    
                    // 外部链接图标点击
                    const externalLink = item.querySelector('.external-link');
                    if (externalLink) {
                        externalLink.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const url = item.dataset.url;
                            window.open(url, '_blank');
                        });
                    }
                });
                
                // 点击外部关闭下拉菜单
                document.addEventListener('click', function closeDropdown(e) {
                    if (!urlsContainer.contains(e.target)) {
                        urlsDropdown.classList.remove('show');
                    }
                });
            }
            
            // 点击卡片跳转
            linkCard.addEventListener('click', (e) => {
                if (!e.target.closest('.url-dropdown-item') && !e.target.closest('.icon-button')) {
                    window.open(displayUrl, '_blank');
                }
            });
            
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

    // 获取 URL 列表（支持多 URL）
    const urls = getLinkUrls(link);
    const mainUrl = urls[0]?.address || link.url || '#';
    
    const linkUrl = document.createElement('a');
    linkUrl.href = mainUrl;
    linkUrl.target = '_blank';
    
    // 显示 URL 信息
    if (urls.length > 1) {
        // 多 URL：显示数量和第一个 URL
        linkUrl.textContent = `${urls[0]?.label || '地址 1'}: ${mainUrl} (+${urls.length - 1} 个地址)`;
    } else {
        linkUrl.textContent = mainUrl;
    }
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
