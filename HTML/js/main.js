const LINKS_STORAGE_KEY = 'navigationLinks';
const CUSTOM_CATEGORIES_KEY = 'customCategories';
const LAST_USED_LINK_URLS_KEY = 'lastUsedLinkUrls';
let links = [];
let bundledLinks = [];

const fallbackLinks = [
    {
        ID: 1,
        name: '路由器管理',
        url: 'http://192.168.1.1',
        category: '网络设备',
        tag: '本地',
        thumbnail: 'https://s0.wp.com/mshots/v1/192.168.1.1?w=240&h=240'
    },
    {
        ID: 2,
        name: 'NAS 管理',
        urls: [
            { address: 'http://192.168.1.100:5000', label: '本地网络', priority: 1 },
            { address: 'https://your-nas.tailnet.ts.net', label: 'Tailscale', priority: 2 }
        ],
        category: '云服务',
        tag: '存储',
        thumbnail: 'https://s0.wp.com/mshots/v1/example.com?w=240&h=240'
    },
    {
        ID: 3,
        name: 'Google',
        url: 'https://www.google.com',
        category: '常用网站',
        tag: '搜索',
        thumbnail: 'https://s0.wp.com/mshots/v1/www.google.com?w=240&h=240'
    }
];

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function readJSONStorage(key, fallbackValue) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallbackValue;
    } catch (error) {
        console.warn(`读取本地配置失败：${key}`, error);
        return fallbackValue;
    }
}

function isSafeUrl(value, allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'ftp:', 'file:']) {
    const url = String(value ?? '').trim();
    if (!url) return false;

    try {
        const parsed = new URL(url, window.location.href);
        return allowedProtocols.includes(parsed.protocol);
    } catch (error) {
        return false;
    }
}

function sanitizeUrl(value, fallback = '#', allowedProtocols) {
    const url = String(value ?? '').trim();
    return isSafeUrl(url, allowedProtocols) ? url : fallback;
}

function openSafeUrl(url) {
    const safeUrl = sanitizeUrl(url);
    if (safeUrl === '#') {
        window.showMessage?.('链接地址无效');
        return;
    }
    window.open(safeUrl, '_blank', 'noopener');
}

function getLastUsedLinkUrls() {
    const saved = readJSONStorage(LAST_USED_LINK_URLS_KEY, {});
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
}

function rememberLastUsedLinkUrl(link, url) {
    if (!link?.ID || !isSafeUrl(url)) return;
    const saved = getLastUsedLinkUrls();
    saved[String(link.ID)] = url;
    localStorage.setItem(LAST_USED_LINK_URLS_KEY, JSON.stringify(saved));
}

function getSafeLinkUrls(link) {
    return getLinkUrls(link)
        .map((url, index) => ({
            ...url,
            address: sanitizeUrl(url.address),
            label: String(url.label || `地址 ${index + 1}`).trim()
        }))
        .filter(url => url.address !== '#');
}

function getPreferredUrlInfo(link, safeUrls = getSafeLinkUrls(link)) {
    if (!safeUrls.length) return { address: '#', label: '默认' };
    const savedUrl = getLastUsedLinkUrls()[String(link?.ID)];
    return safeUrls.find(url => url.address === savedUrl) || safeUrls[0];
}

function getUrlDisplayLabel(urlObj, index) {
    return String(urlObj?.label || `地址 ${index + 1}`).trim();
}

function isPrivateHost(hostname) {
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan')) return true;
    const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) return false;
    const parts = match.slice(1).map(Number);
    if (parts.some(part => part < 0 || part > 255)) return false;
    return parts[0] === 10
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 168)
        || (parts[0] === 127);
}

function getUrlChoiceMeta(urlObj) {
    const label = String(urlObj?.label || '').toLowerCase();
    let hostname = '';
    try {
        hostname = new URL(urlObj.address, window.location.href).hostname;
    } catch (error) {
        hostname = '';
    }

    const isLocal = isPrivateHost(hostname) || /内网|本地|局域|local|lan/.test(label);
    if (isLocal) {
        return { icon: 'ri-home-wifi-line', type: 'local' };
    }

    const isTunnel = /tailscale|zerotier|wireguard|vpn|隧道/.test(label);
    if (isTunnel) {
        return { icon: 'ri-shield-keyhole-line', type: 'tunnel' };
    }

    return { icon: 'ri-global-line', type: 'remote' };
}

function openLinkUrl(link, url) {
    const safeUrl = sanitizeUrl(url);
    if (safeUrl === '#') {
        openSafeUrl(safeUrl);
        return;
    }
    rememberLastUsedLinkUrl(link, safeUrl);
    openSafeUrl(safeUrl);
}

function normalizeLinks(rawLinks) {
    const usedIds = new Set();
    let nextId = 1;

    return (Array.isArray(rawLinks) ? rawLinks : []).map(link => {
        let id = Number(link?.ID);
        if (!Number.isInteger(id) || id <= 0 || usedIds.has(id)) {
            while (usedIds.has(nextId)) nextId += 1;
            id = nextId;
        }

        usedIds.add(id);
        nextId = Math.max(nextId, id + 1);

        const normalized = {
            ...link,
            ID: id,
            name: String(link?.name || '未命名'),
            category: String(link?.category || '未分类'),
            tag: String(link?.tag || '')
        };

        if (Array.isArray(link?.urls)) {
            normalized.urls = link.urls
                .filter(url => url && String(url.address || '').trim())
                .map((url, index) => ({
                    address: String(url.address).trim(),
                    label: String(url.label || `地址 ${index + 1}`),
                    priority: Number.parseInt(url.priority, 10) || index + 1
                }));
            if (normalized.urls.length > 1) {
                delete normalized.url;
            } else if (normalized.urls.length === 1) {
                normalized.url = normalized.urls[0].address;
                delete normalized.urls;
            }
        } else if (link?.url) {
            normalized.url = String(link.url).trim();
        }

        if (link?.thumbnail) {
            normalized.thumbnail = String(link.thumbnail).trim();
        }

        return normalized;
    });
}

function loadStoredLinks(defaultLinks) {
    const stored = readJSONStorage(LINKS_STORAGE_KEY, null);
    const storedLinks = Array.isArray(stored) ? stored : stored?.links;
    return normalizeLinks(storedLinks || defaultLinks);
}

function persistLinks() {
    localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify({ links }));
    localStorage.setItem('lastUpdate', new Date().toISOString());
}

function getCustomCategories() {
    const categories = readJSONStorage(CUSTOM_CATEGORIES_KEY, []);
    return Array.isArray(categories)
        ? categories.map(category => String(category).trim()).filter(Boolean)
        : [];
}

function saveCustomCategories(categories) {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify([...new Set(categories.filter(Boolean))]));
}

function getAllCategoryNames(sourceLinks = links) {
    return [...new Set([
        ...sourceLinks.map(link => link.category || '未分类'),
        ...getCustomCategories()
    ])].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

document.addEventListener("DOMContentLoaded", function () {

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
            renderLinksInSettingsIfVisible(links);
            updateCategoryDatalist();
            updateStorageInfo();
        })
        .catch(error => {
            console.error('加载链接数据失败：', error);
            bundledLinks = normalizeLinks(fallbackLinks);
            links = loadStoredLinks(bundledLinks);
            renderLinksByCategory(links);
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
                renderLinksInSettingsIfVisible(links);
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
                    renderLinksInSettingsIfVisible(links);
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
        // 清空 URL 列表
        currentUrls = [];
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
                    <p>暂无分类</p>
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
            showMessage('请输入分类名称');
            return;
        }
        name = name.trim();
        
        const categories = getAllCategoryNames(links);
        if (categories.includes(name)) {
            showMessage('分类已存在');
            return;
        }

        saveCustomCategories([...getCustomCategories(), name]);
        localStorage.setItem('lastUpdate', new Date().toISOString());
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
            showMessage('已重命名分类');
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
        saveCustomCategories(getCustomCategories().filter(category => category !== name));
        persistLinks();
        showMessage('已删除分类');
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

    // 更新存储信息
    function updateStorageInfo() {
        const categories = getAllCategoryNames(links);
        
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
    window.updateStorageInfo = updateStorageInfo;

    // 搜索链接功能
    const linksSearch = document.getElementById('links-search');
    const clearLinksSearch = document.getElementById('clear-links-search');
    if (linksSearch) {
        linksSearch.addEventListener('input', () => {
            renderLinksInSettingsIfVisible(links);
        });
    }
    if (clearLinksSearch) {
        clearLinksSearch.addEventListener('click', () => {
            if (!linksSearch) return;
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
                        links = normalizeLinks(data.links);
                        persistLinks();
                        renderLinksByCategory(links);
                        renderLinksInSettingsIfVisible(links);
                        updateCategoryDatalist();
                        updateStorageInfo();
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
    const currentVersion = '1.2.0';
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

    function scheduleVersionCheck() {
        const cached = readJSONStorage('versionCheckCache', null);
        const sixHours = 6 * 60 * 60 * 1000;
        if (cached?.latestVersion && Date.now() - cached.checkedAt < sixHours) {
            renderVersionStatus(cached.latestVersion);
            return;
        }

        const runCheck = () => {
            fetch('https://api.github.com/repos/LceAn/LocalNavigationPage/releases/latest')
                .then(response => response.json())
                .then(data => {
                    const latestVersion = String(data.tag_name || '').replace(/^v/i, '');
                    if (!latestVersion) throw new Error('版本数据为空');
                    localStorage.setItem('versionCheckCache', JSON.stringify({
                        latestVersion,
                        checkedAt: Date.now()
                    }));
                    renderVersionStatus(latestVersion);
                })
                .catch(error => {
                    console.error('版本检测失败:', error);
                    const statusEl = document.getElementById('version-check-status');
                    if (statusEl) {
                        statusEl.innerHTML = '<span style="color: var(--text-tertiary);"><i class="ri-error-warning-line"></i> 检测失败</span>';
                    }
                });
        };

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(runCheck, { timeout: 3000 });
        } else {
            window.setTimeout(runCheck, 1200);
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
            const isDark = body.classList.contains('dark-mode');
            localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
            const themeIcon = document.getElementById('theme-icon');
            if (themeIcon) {
                themeIcon.classList.toggle('ri-sun-line', !isDark);
                themeIcon.classList.toggle('ri-moon-line', isDark);
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
        backgroundStyle: 'clean',
        glassEffect: false,
        liquidEffect: false,
        deepShadow: false,
        blurStrength: 8
    };

    function loadHomeVisualSettings() {
        const saved = readJSONStorage('homeVisualSettings', {});
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
        localStorage.setItem('homeVisualSettings', JSON.stringify(settings));
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
        compactModeToggle.checked = localStorage.getItem('compactMode') === 'true';
        applyCompactMode(compactModeToggle.checked);
        compactModeToggle.addEventListener('change', function() {
            applyCompactMode(this.checked);
            localStorage.setItem('compactMode', this.checked);
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
            localStorage.setItem('showThumbnails', this.checked);
            applyThumbnailSetting(this.checked);
            showMessage(this.checked ? '已显示缩略图' : '已隐藏缩略图');
        });
        showThumbnailsToggle.checked = localStorage.getItem('showThumbnails') !== 'false';
        // 初始化应用缩略图设置
        applyThumbnailSetting(showThumbnailsToggle.checked);
    }

    if (enableAnimationsToggle) {
        enableAnimationsToggle.checked = localStorage.getItem('enableAnimations') !== 'false';
        applyAnimationSetting(enableAnimationsToggle.checked);
        enableAnimationsToggle.addEventListener('change', function() {
            applyAnimationSetting(this.checked);
            localStorage.setItem('enableAnimations', this.checked);
            showMessage(this.checked ? '已启用动画' : '已禁用动画');
        });
    }

    // ================================
    // 新增设置功能
    // ================================
    
    // 页面位置设置
    const pagePositionSelect = document.getElementById('page-position-select');
    if (pagePositionSelect) {
        const savedPosition = localStorage.getItem('contentPosition') || 'default';
        pagePositionSelect.value = savedPosition;
        
        pagePositionSelect.addEventListener('change', function() {
            const position = this.value;
            localStorage.setItem('contentPosition', position);
            
            const container = document.querySelector('.container');
            container.classList.remove('content-position-default', 'content-position-top', 'content-position-bottom');
            container.classList.add(`content-position-${position}`);
            
            let message = '';
            switch(position) {
                case 'top': message = '内容已向上移动'; break;
                case 'default': message = '内容已居中'; break;
                case 'bottom': message = '内容已向下移动'; break;
            }
            showMessage(message);
        });
    }
    
    // 默认展开所有分类设置
    const defaultExpandAllToggle = document.getElementById('default-expand-all');
    if (defaultExpandAllToggle) {
        defaultExpandAllToggle.checked = localStorage.getItem('defaultExpandAll') === 'true';
        
        defaultExpandAllToggle.addEventListener('change', function() {
            localStorage.setItem('defaultExpandAll', this.checked);
            if (this.checked) {
                toggleAllCategories(true);
                showMessage('已打开第一个分类面板');
            } else {
                toggleAllCategories(false);
                showMessage('已关闭分类面板');
            }
        });
    }
    
    // 右上角按钮管理
    const showToggleAllBtn = document.getElementById('show-toggle-all-btn');
    const showPositionBtn = document.getElementById('show-position-btn');
    const showThemeBtn = document.getElementById('show-theme-btn');
    
    // 加载按钮显示设置
    function loadButtonVisibility() {
        const saved = readJSONStorage('buttonVisibility', { toggleAll: true, position: true });
        if (showToggleAllBtn) showToggleAllBtn.checked = saved.toggleAll !== false;
        if (showPositionBtn) showPositionBtn.checked = saved.position !== false;
        updateButtonVisibility(saved);
    }
    
    // 更新按钮显示
    function updateButtonVisibility(saved) {
        const toggleAllBtn = document.getElementById('toggle-all-groups');
        const positionBtn = document.getElementById('position-button');
        
        if (toggleAllBtn) toggleAllBtn.style.display = saved.toggleAll !== false ? 'flex' : 'none';
        if (positionBtn) positionBtn.style.display = saved.position !== false ? 'flex' : 'none';
        // 昼夜模式按钮始终显示（由主题设置中的开关控制）
    }
    
    if (showToggleAllBtn) {
        showToggleAllBtn.addEventListener('change', function() {
            const saved = readJSONStorage('buttonVisibility', { toggleAll: true, position: true });
            saved.toggleAll = this.checked;
            localStorage.setItem('buttonVisibility', JSON.stringify(saved));
            updateButtonVisibility(saved);
            showMessage(this.checked ? '已显示展开/收起按钮' : '已隐藏展开/收起按钮');
        });
    }
    
    if (showPositionBtn) {
        showPositionBtn.addEventListener('change', function() {
            const saved = readJSONStorage('buttonVisibility', { toggleAll: true, position: true });
            saved.position = this.checked;
            localStorage.setItem('buttonVisibility', JSON.stringify(saved));
            updateButtonVisibility(saved);
            showMessage(this.checked ? '已显示布局调整按钮' : '已隐藏布局调整按钮');
        });
    }
    
    if (showThemeBtn) {
        showThemeBtn.addEventListener('change', function() {
            localStorage.setItem('showThemeBtn', this.checked);
            const themeBtn = document.getElementById('toggle-mode');
            if (themeBtn) {
                themeBtn.style.display = this.checked ? 'flex' : 'none';
            }
            showMessage(this.checked ? '已显示昼夜模式按钮' : '已隐藏昼夜模式按钮');
        });
        // 初始化昼夜模式按钮显示状态
        const savedThemeBtn = localStorage.getItem('showThemeBtn');
        showThemeBtn.checked = savedThemeBtn !== 'false';
        const themeBtn = document.getElementById('toggle-mode');
        if (themeBtn) {
            themeBtn.style.display = showThemeBtn.checked ? 'flex' : 'none';
        }
    }
    
    // 初始化按钮可见性
    loadButtonVisibility();

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
        const saved = readJSONStorage('searchEngines', null);
        const engines = Array.isArray(saved) ? saved : defaultSearchEngines;
        return engines
            .filter(engine => engine && engine.name && engine.url)
            .map(engine => ({
                name: String(engine.name).trim(),
                url: String(engine.url).trim(),
                icon: String(engine.icon || '').trim()
            }));
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
    
    // 更新搜索框按钮
    function updateSearchButtons() {
        const engines = loadSearchEngines();
        const buttonContainer = document.querySelector('.search-buttons');
        if (!buttonContainer) return;

        buttonContainer.innerHTML = engines.map((engine, index) =>
            `<button class="search-button" data-engine-index="${index}">${escapeHTML(engine.name)}</button>`
        ).join('');

        buttonContainer.querySelectorAll('.search-button').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = Number(btn.getAttribute('data-engine-index'));
                performSearch(engines[index]);
            });
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
        return {
            ...defaultDisplaySettings,
            ...readJSONStorage('displaySettings', {})
        };
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
    
    const timeDisplayCache = {
        timeElement: document.getElementById('current-time'),
        dateElement: document.getElementById('current-date'),
        weatherInfo: document.getElementById('weather-info'),
        separators: [...document.querySelectorAll('.datetime-display > .date-separator')],
        lastTimeText: '',
        lastDateText: '',
        lastVisibilityKey: ''
    };

    function setElementDisplay(element, value) {
        if (element && element.style.display !== value) {
            element.style.display = value;
        }
    }

    function syncDateSeparators(settings) {
        const visibility = [
            Boolean(settings.showTime),
            Boolean(settings.showDate),
            Boolean(settings.showWeather)
        ];
        timeDisplayCache.separators.forEach((separator, index) => {
            setElementDisplay(separator, visibility[index] && visibility[index + 1] ? 'inline' : 'none');
        });
    }

    // 更新时间显示
    function updateTimeDisplay(force = false) {
        const settings = loadDisplaySettings();
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
            setElementDisplay(timeDisplayCache.timeElement, settings.showTime ? 'inline' : 'none');
            setElementDisplay(timeDisplayCache.dateElement, settings.showDate ? 'inline' : 'none');
            setElementDisplay(timeDisplayCache.weatherInfo, settings.showWeather ? 'inline-flex' : 'none');
            syncDateSeparators(settings);
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
                weatherLocationsEl.style.display = 'inline';
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
            const cleanedText = text.trim().replace(/\s+/g, ' ');
            const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(cleanedText) || cleanedText.includes('<!DOCTYPE');
            if (weatherText) {
                weatherText.textContent = looksLikeHtml || cleanedText.length > 48
                    ? '天气暂不可用'
                    : cleanedText;
                weatherText.classList.remove('loading');
                weatherText.classList.add('loaded');
            }
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
    
    // 每秒更新一次时间和日期
    setInterval(() => {
        updateTimeDisplay();
    }, 1000);
    
    // ================================
    // 设置折叠面板功能
    // ================================
    window.toggleSection = function(sectionTitle) {
        const section = sectionTitle.closest('.settings-section');
        if (section) {
            section.classList.toggle('collapsed');
            
            // 保存折叠状态
            const sectionId = section.querySelector('.section-title-left span')?.textContent || '';
            const collapsedSections = readJSONStorage('collapsedSections', []);
            
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
            
            localStorage.setItem('collapsedSections', JSON.stringify(collapsedSections));
        }
    };

    document.querySelectorAll('.settings-section .section-title').forEach(sectionTitle => {
        const section = sectionTitle.closest('.settings-section');
        if (!section?.querySelector(':scope > .section-content')) return;

        sectionTitle.addEventListener('click', () => {
            window.toggleSection(sectionTitle);
        });
    });
    
    // 初始化折叠状态
    function initSectionCollapseState() {
        const collapsedSections = readJSONStorage('collapsedSections', []);
        document.querySelectorAll('.settings-section').forEach(section => {
            const sectionId = section.querySelector('.section-title-left span')?.textContent || '';
            if (collapsedSections.includes(sectionId)) {
                section.classList.add('collapsed');
            }
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
            const [firstEngine] = loadSearchEngines();
            performSearch(firstEngine);
        });
    }

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

    // 创建一键收起/展开按钮
    const toggleAllGroupsBtn = document.createElement('button');
    toggleAllGroupsBtn.id = 'toggle-all-groups';
    toggleAllGroupsBtn.className = 'icon-button';
    toggleAllGroupsBtn.title = '一键收起/展开分组';
    toggleAllGroupsBtn.innerHTML = '<i class="ri-arrow-up-down-line"></i>';

    const functionButtons = document.querySelector('.function-buttons');
    functionButtons.appendChild(toggleAllGroupsBtn);

    toggleAllGroupsBtn.addEventListener('click', () => {
        const hasExpandedCategory = Boolean(document.querySelector('.category-container.expanded'));
        const shouldExpand = !hasExpandedCategory;
        window.toggleAllCategories(shouldExpand);
        showMessage(shouldExpand ? '已打开分类面板' : '已关闭分类面板');
    });
    
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

    document.addEventListener('click', event => {
        if (event.target.closest('.link-card-urls') || event.target.closest('.url-dropdown')) {
            return;
        }
        document.querySelectorAll('.url-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    });
});

// 渲染链接的函数（按照分类）- 修复版
function renderLinksByCategory(links) {
    const linkContainer = document.getElementById('link-container');
    document.querySelectorAll('.url-dropdown').forEach(dropdown => dropdown.remove());
    closeCategoryPanel(false);
    linkContainer.innerHTML = '';

    const categories = {};
    links.forEach(link => {
        const category = link.category || '未分类';
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
        categoryContainer.className = 'category-container';
        categoryContainer.dataset.category = category;

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';

        const categoryTitle = document.createElement('h2');
        const categoryIcon = document.createElement('i');
        categoryIcon.className = 'ri-folder-2-line';
        categoryTitle.appendChild(categoryIcon);
        categoryTitle.appendChild(document.createTextNode(` ${category}`));

        const cardCount = document.createElement('span');
        cardCount.className = 'card-count';
        const cardCountIcon = document.createElement('i');
        cardCountIcon.className = 'ri-links-line';
        cardCount.appendChild(cardCountIcon);
        cardCount.appendChild(document.createTextNode(` ${categoryLinks.length}`));

        const toggleButton = document.createElement('button');
        toggleButton.className = 'toggle-button';
        toggleButton.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
        toggleButton.title = '打开分类';

        categoryHeader.appendChild(categoryTitle);
        categoryHeader.appendChild(cardCount);
        categoryHeader.appendChild(toggleButton);
        categoryContainer.appendChild(categoryHeader);

        const linkList = document.createElement('ul');
        linkList.className = 'link-list';
        // 默认收起，由 CSS 的 collapsed 类控制
        linkList.style.cssText = 'margin: 0; border: none;';
        categoryContainer.appendChild(linkList);

        linkContainer.appendChild(categoryContainer);
    }

    if (localStorage.getItem('showThumbnails') === 'false') {
        linkContainer.querySelectorAll('.link-card-thumbnail').forEach(thumbnail => {
            thumbnail.style.display = 'none';
        });
    }
    
    // 在 DOM 加载完成后初始化展开状态（绑定事件并设置初始状态）
    requestAnimationFrame(() => {
        initCategoryToggles();
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
    if (thumbnailUrl) {
        thumbnail.style.backgroundImage = `url("${thumbnailUrl.replace(/"/g, '\\"')}")`;
    } else {
        thumbnail.classList.add('placeholder');
        thumbnail.innerHTML = '<i class="ri-links-line"></i>';
    }
    linkCard.appendChild(thumbnail);

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

// 存储展开状态的键
const EXPANDED_CATEGORIES_KEY = 'expandedCategories';
let activeCategoryContainer = null;
let categoryPanelElements = null;

// 获取已展开的分类列表
function getExpandedCategories() {
    const stored = readJSONStorage(EXPANDED_CATEGORIES_KEY, []);
    return Array.isArray(stored) ? stored : [];
}

// 保存展开状态
function saveExpandedCategories(categories) {
    localStorage.setItem(EXPANDED_CATEGORIES_KEY, JSON.stringify(categories));
}

function resetCategoryContainer(container) {
    if (!container) return;
    const toggleButton = container.querySelector('.toggle-button');
    const categoryHeader = container.querySelector('.category-header');

    container.classList.add('collapsed');
    container.classList.remove('expanded');
    if (toggleButton) {
        toggleButton.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
        toggleButton.title = '打开分类';
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
        toggleButton.title = '关闭分类';
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
            <button class="category-panel-close" type="button" aria-label="关闭分类">
                <i class="ri-close-line"></i>
            </button>
        </div>
        <ul class="category-panel-list"></ul>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    const closeButton = panel.querySelector('.category-panel-close');
    backdrop.addEventListener('click', () => closeCategoryPanel(true));
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

    if (localStorage.getItem('showThumbnails') === 'false') {
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

    if (saveState) {
        saveExpandedCategories([]);
    }
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

    if (saveState) {
        saveExpandedCategories([]);
    }
}

// 切换分类展开状态
function toggleCategory(container, saveState = true) {
    if (!container) return;

    if (activeCategoryContainer === container) {
        closeCategoryPanel(saveState);
        return;
    }

    openCategoryPanel(container, saveState);
}

// 初始化分类展开状态
function initCategoryToggles() {
    const categoryContainers = document.querySelectorAll('.category-container');
    saveExpandedCategories([]);
    
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
}

// 一键展开/收起所有分类
window.toggleAllCategories = function(expand) {
    const categoryContainers = document.querySelectorAll('.category-container');

    if (expand) {
        const firstCategory = categoryContainers[0];
        if (firstCategory) {
            openCategoryPanel(firstCategory, false);
        }
        return;
    }

    categoryContainers.forEach(resetCategoryContainer);
    closeCategoryPanel(false);
    saveExpandedCategories([]);
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
            ? '换个关键词或切换分类试试'
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
        categoryFilter.innerHTML = '<option value="">全部分类</option>';
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
}

// 创建链接列表项
function createLinkItem(link) {
    const linkItem = document.createElement('div');
    linkItem.className = 'settings-link-item';
    linkItem.setAttribute('role', 'button');
    linkItem.setAttribute('tabindex', '0');
    linkItem.setAttribute('aria-label', `编辑 ${link.name || '链接'}`);

    const linkInfo = document.createElement('div');
    linkInfo.className = 'link-info';

    const favicon = document.createElement('div');
    favicon.className = 'link-favicon';
    const safeThumbnail = sanitizeUrl(link.thumbnail, '', ['http:', 'https:']);
    if (safeThumbnail && localStorage.getItem('showThumbnails') !== 'false') {
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
