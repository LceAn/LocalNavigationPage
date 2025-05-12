// darkMode.js

// 检查用户首选的主题模式
const isDarkMode = localStorage.getItem('darkMode') === 'enabled';

// 设置初始主题模式
if (isDarkMode) {
    document.body.classList.add('dark-mode');
}

// 切换主题模式
function toggleDarkMode() {
    if (document.body.classList.contains('dark-mode')) {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('darkMode', 'disabled');
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'enabled');
    }
}

// 在页面加载时绑定切换主题模式的事件处理程序
document.addEventListener("DOMContentLoaded", function () {
    const toggleButton = document.getElementById('toggle-mode');
    toggleButton.addEventListener('click', toggleDarkMode);
});
