/**
 * Dark Mode Manager - 2026
 * 智能主题管理系统
 */

// 主题配置
const ThemeConfig = {
    storageKey: 'localnav-theme',
    systemPrefersDark: window.matchMedia('(prefers-color-scheme: dark)')
};

// 主题状态
let currentTheme = {
    isDark: false,
    auto: true // 是否跟随系统
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    applyTheme();
    watchSystemTheme();
});

// 加载主题设置
function loadTheme() {
    const saved = localStorage.getItem(ThemeConfig.storageKey);
    
    if (saved) {
        const config = JSON.parse(saved);
        currentTheme.isDark = config.isDark;
        currentTheme.auto = config.auto !== undefined ? config.auto : true;
    } else {
        // 首次访问，跟随系统
        currentTheme.isDark = ThemeConfig.systemPrefersDark.matches;
        currentTheme.auto = true;
    }
}

// 应用主题
function applyTheme() {
    if (currentTheme.isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    
    // 更新 meta theme-color
    const themeColor = currentTheme.isDark ? '#0f172a' : '#6366f1';
    document.querySelector('meta[name="theme-color"]').content = themeColor;
}

// 切换主题
function toggleTheme() {
    currentTheme.auto = false;
    currentTheme.isDark = !currentTheme.isDark;
    saveTheme();
    applyTheme();
    
    // 触发自定义事件
    window.dispatchEvent(new CustomEvent('themeChange', {
        detail: { isDark: currentTheme.isDark }
    }));
}

// 保存主题设置
function saveTheme() {
    localStorage.setItem(
        ThemeConfig.storageKey,
        JSON.stringify(currentTheme)
    );
}

// 监听系统主题变化
function watchSystemTheme() {
    ThemeConfig.systemPrefersDark.addEventListener('change', (e) => {
        if (currentTheme.auto) {
            currentTheme.isDark = e.matches;
            applyTheme();
        }
    });
}

// 设置为自动跟随系统
function setAutoTheme() {
    currentTheme.auto = true;
    currentTheme.isDark = ThemeConfig.systemPrefersDark.matches;
    saveTheme();
    applyTheme();
}

// 公开 API
window.ThemeManager = {
    toggle: toggleTheme,
    setDark: (isDark) => {
        currentTheme.auto = false;
        currentTheme.isDark = isDark;
        saveTheme();
        applyTheme();
    },
    setAuto: setAutoTheme,
    getState: () => ({ ...currentTheme }),
    isDark: () => currentTheme.isDark
};

// 控制台信息
console.log('🎨 Theme Manager initialized', ThemeManager.getState());
