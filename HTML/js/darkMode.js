// darkMode.js

// 检查用户首选的主题模式
const isDarkMode = localStorage.getItem('darkMode') === 'enabled';

// 设置初始主题模式
function setInitialTheme() {
    const themeIcon = document.getElementById('theme-icon');
    
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        if (themeIcon) {
            themeIcon.classList.remove('ri-sun-line');
            themeIcon.classList.add('ri-moon-line');
        }
    } else {
        if (themeIcon) {
            themeIcon.classList.remove('ri-moon-line');
            themeIcon.classList.add('ri-sun-line');
        }
    }
}

// 切换主题模式
function toggleDarkMode() {
    const themeIcon = document.getElementById('theme-icon');
    
    if (document.body.classList.contains('dark-mode')) {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('darkMode', 'disabled');
        if (themeIcon) {
            themeIcon.classList.remove('ri-moon-line');
            themeIcon.classList.add('ri-sun-line');
        }
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'enabled');
        if (themeIcon) {
            themeIcon.classList.remove('ri-sun-line');
            themeIcon.classList.add('ri-moon-line');
        }
    }
}

// 在页面加载时设置初始主题并绑定切换主题模式的事件处理程序
document.addEventListener("DOMContentLoaded", function () {
    setInitialTheme();
    const toggleButton = document.getElementById('toggle-mode');
    toggleButton.addEventListener('click', toggleDarkMode);
});
