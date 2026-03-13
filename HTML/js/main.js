/**
 * Local Navigation Page - Modern JavaScript 2026
 * 智能链接管理系统
 */

// 全局状态管理
const AppState = {
    links: [],
    categories: new Set(),
    searchEngine: '百度',
    darkMode: false,
    viewMode: 'grid' // grid | list
};

// DOM 元素缓存
const DOM = {};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    cacheDOM();
    bindEvents();
    loadLinks();
    initTheme();
    updateTime();
    setInterval(updateTime, 1000);
});

// 缓存 DOM 元素
function cacheDOM() {
    DOM.linkContainer = document.getElementById('link-container');
    DOM.searchInput = document.getElementById('search-input');
    DOM.engineBtns = document.querySelectorAll('.engine-btn');
    DOM.themeBtn = document.getElementById('toggle-theme');
    DOM.settingsBtn = document.getElementById('open-settings');
    DOM.settingsModal = document.getElementById('settings-modal');
    DOM.closeSettingsBtn = document.getElementById('close-settings');
    DOM.currentTime = document.getElementById('current-time');
    DOM.currentYear = document.getElementById('current-year');
}

// 绑定事件
function bindEvents() {
    // 搜索功能
    DOM.searchInput.addEventListener('input', debounce(handleSearch, 300));
    
    // 搜索引擎切换
    DOM.engineBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            DOM.engineBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            AppState.searchEngine = e.target.dataset.engine;
        });
    });
    
    // 主题切换
    DOM.themeBtn.addEventListener('click', toggleTheme);
    
    // 设置面板
    DOM.settingsBtn.addEventListener('click', () => {
        DOM.settingsModal.classList.add('active');
    });
    
    DOM.closeSettingsBtn.addEventListener('click', () => {
        DOM.settingsModal.classList.remove('active');
    });
    
    // 点击遮罩关闭
    DOM.settingsModal.addEventListener('click', (e) => {
        if (e.target === DOM.settingsModal) {
            DOM.settingsModal.classList.remove('active');
        }
    });
    
    // ESC 键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            DOM.settingsModal.classList.remove('active');
        }
    });
}

// 加载链接数据
async function loadLinks() {
    try {
        const response = await fetch('data/links.json');
        const data = await response.json();
        AppState.links = data.links || [];
        
        // 提取分类
        AppState.categories = new Set(
            AppState.links.map(link => link.category)
        );
        
        // 渲染卡片
        renderLinks(AppState.links);
        
        // 显示空状态（如果没有链接）
        if (AppState.links.length === 0) {
            showEmptyState();
        }
    } catch (error) {
        console.error('加载链接失败:', error);
        showError('加载链接失败，请检查数据文件');
    }
}

// 渲染链接卡片
function renderLinks(links) {
    if (!links || links.length === 0) {
        showEmptyState();
        return;
    }
    
    DOM.linkContainer.innerHTML = links.map((link, index) => `
        <div class="link-card" style="animation-delay: ${index * 50}ms" data-url="${link.url}">
            <div class="link-category">${escapeHtml(link.category)}</div>
            <div class="link-title">
                <span class="link-icon">🌐</span>
                <span class="link-name">${escapeHtml(link.name)}</span>
            </div>
            <div class="link-url">${escapeHtml(link.url)}</div>
        </div>
    `).join('');
    
    // 绑定点击事件
    document.querySelectorAll('.link-card').forEach(card => {
        card.addEventListener('click', () => {
            const url = card.dataset.url;
            if (url) {
                window.open(url, '_blank');
            }
        });
    });
}

// 搜索处理
function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
        renderLinks(AppState.links);
        return;
    }
    
    const filtered = AppState.links.filter(link => {
        return link.name.toLowerCase().includes(query) ||
               link.url.toLowerCase().includes(query) ||
               link.category.toLowerCase().includes(query);
    });
    
    renderLinks(filtered);
}

// 主题切换
function toggleTheme() {
    AppState.darkMode = !AppState.darkMode;
    document.body.classList.toggle('dark-mode', AppState.darkMode);
    
    // 更新图标
    const sunIcon = DOM.themeBtn.querySelector('.sun-icon');
    const moonIcon = DOM.themeBtn.querySelector('.moon-icon');
    
    if (AppState.darkMode) {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    }
    
    // 保存到本地存储
    localStorage.setItem('darkMode', AppState.darkMode);
}

// 初始化主题
function initTheme() {
    const savedTheme = localStorage.getItem('darkMode');
    if (savedTheme === 'true') {
        AppState.darkMode = true;
        document.body.classList.add('dark-mode');
        DOM.themeBtn.querySelector('.sun-icon').style.display = 'none';
        DOM.themeBtn.querySelector('.moon-icon').style.display = 'block';
    }
}

// 更新时间显示
function updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    const year = now.getFullYear();
    
    if (DOM.currentTime) {
        DOM.currentTime.textContent = timeStr;
        DOM.currentTime.dateTime = now.toISOString();
    }
    
    if (DOM.currentYear) {
        DOM.currentYear.textContent = year;
    }
}

// 显示空状态
function showEmptyState() {
    DOM.linkContainer.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">📭</div>
            <h2>暂无链接</h2>
            <p>点击设置按钮添加您的第一个链接</p>
        </div>
    `;
}

// 显示错误消息
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: #ef4444;
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 9999;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 3000);
}

// 工具函数：防抖
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 工具函数：HTML 转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 添加 CSS 动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);
