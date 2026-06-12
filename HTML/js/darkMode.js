// darkMode.js

function getSavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme;
    return localStorage.getItem('darkMode') === 'enabled' ? 'dark' : 'light';
}

function shouldUseDarkMode(theme) {
    if (theme === 'auto') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return theme === 'dark';
}

function updateThemeIcon(isDark) {
    const themeIcon = document.getElementById('theme-icon');
    if (!themeIcon) return;

    themeIcon.classList.toggle('ri-sun-line', !isDark);
    themeIcon.classList.toggle('ri-moon-line', isDark);
}

// 设置初始主题模式
function setInitialTheme() {
    const theme = getSavedTheme();
    const isDark = shouldUseDarkMode(theme);
    document.body.classList.toggle('dark-mode', isDark);
    updateThemeIcon(isDark);
}

// 切换主题模式
function toggleDarkMode() {
    const isDark = !document.body.classList.contains('dark-mode');
    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
    updateThemeIcon(isDark);
}

// 在页面加载时设置初始主题并绑定切换主题模式的事件处理程序
document.addEventListener("DOMContentLoaded", function () {
    setInitialTheme();
    const toggleButton = document.getElementById('toggle-mode');
    if (toggleButton) {
        toggleButton.addEventListener('click', toggleDarkMode);
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getSavedTheme() === 'auto') {
            setInitialTheme();
        }
    });
});
