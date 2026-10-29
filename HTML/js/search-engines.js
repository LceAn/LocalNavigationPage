/* search-engines.js — 搜索引擎管理（自 main.js 拆出，Phase 3）
 * 引擎列表增删改、默认引擎、测试搜索、首页搜索按钮渲染与执行。
 * 依赖 links-data.js / storage.js 全局函数；showMessage 经 window 桥接。 */
function showMessage(msg, type) { window.showMessage?.(msg, type); }


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
const searchEnginePrefixInput = document.getElementById('search-engine-prefix');
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
    if (searchEnginePrefixInput) searchEnginePrefixInput.value = '';
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
    if (searchEnginePrefixInput) searchEnginePrefixInput.value = engine.prefix || '';
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
    const prefix = searchEnginePrefixInput ? searchEnginePrefixInput.value.trim().toLowerCase() : '';
    
    if (!name || !url) {
        showMessage('请填写名称和搜索 URL', 'error');
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
        engines[Number(editIndex)] = { name, url, icon, ...(prefix ? { prefix } : {}) };
        showMessage('已更新搜索引擎');
    } else {
        engines.push({ name, url, icon, ...(prefix ? { prefix } : {}) });
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

    // ② 用户配置的 icon:iconify:集合:名称 → 官方 API(SVG,无需登录)
    if (engine.icon && /^iconify:[a-z0-9-]+:[a-z0-9-]+$/i.test(engine.icon.trim())) {
        const [, collection, name] = engine.icon.trim().split(':');
        return { src: `https://api.iconify.design/${collection}/${name}.svg?height=48`, builtin: false };
    }

    // ②b 用户配置的 icon URL
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

    // 标记默认引擎（回车搜索使用的引擎）
    const defaultName = getDefaultSearchEngine()?.name;
    buttonContainer.querySelectorAll('.search-button').forEach(b => {
        const idx = Number(b.getAttribute('data-engine-index'));
        if (engines[idx] && engines[idx].name === defaultName) b.classList.add('is-default');
    });

    buttonContainer.querySelectorAll('.search-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = Number(btn.getAttribute('data-engine-index'));
            const term = document.getElementById('search-input')?.value.trim();
            if (term) {
                performSearch(engines[index]);
            } else {
                // 空关键词：点击意图是切换引擎——设为默认并高亮，回车即用
                setSetting('defaultSearchEngine', engines[index].name);
                renderDefaultEngineSelect();
                updateSearchButtons();
                showMessage('已切换默认搜索引擎：' + engines[index].name);
                document.getElementById('search-input')?.focus();
            }
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
