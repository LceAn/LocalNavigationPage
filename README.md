# Local Navigation Page

[![HTML](https://img.shields.io/badge/HTML-5-e34c26)]()
[![CSS](https://img.shields.io/badge/CSS-3-563d7c)]()
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6-f7df1e)]()
[![Bootstrap](https://img.shields.io/badge/Bootstrap-4.3-7952b3)]()
[![License](https://img.shields.io/badge/License-Apache--2.0-green)]()
[![Version](https://img.shields.io/badge/Version-1.0.3-blue)]()

**本地静态导航页 | Local Static Navigation Page**

一个基于本地/局域网的轻量级导航页应用，无需数据库和后端服务，完全静态化部署，安全、简单、快速。

A lightweight navigation page application based on local/LAN, no database or backend service required, fully static deployment, secure, simple and fast.

---

## 📸 页面预览 | Preview

### ☀️ 日间模式 | Day Mode

![日间模式](https://github.com/LceAn/LocalNavigationPage/assets/63484787/2b6853dc-da8a-4462-8e07-460f2c53e963)

### 🌙 夜间模式 | Night Mode

![夜间模式](https://github.com/LceAn/LocalNavigationPage/assets/63484787/7b5b748f-a3e2-427e-b12b-e2bbf2f98ce2)

---

## ✨ 特性 | Features

### 🔒 安全隐私
- **本地存储** - 所有数据存储在本地，无需云服务
- **静态页面** - 纯 HTML/CSS/JS，无后端依赖
- **隐私保护** - 不收集任何用户数据

### 🎨 现代化 UI
- **昼夜模式** - 一键切换日间/夜间主题
- **响应式设计** - 自适应桌面和移动设备
- **流畅动画** - 卡片悬停、折叠展开等动效
- **Remix 图标** - 现代化图标库

### 🚀 功能丰富
- **多搜索引擎** - 支持百度、Google、必应切换
- **分类管理** - 支持多个链接分类，可折叠展开
- **智能排序** - 按 ID 自动排序，分组按最大 ID 排序
- **实时时钟** - 显示日期、时间（时分秒）、天气
- **快速搜索** - 内置搜索框，快速查找链接
- **布局调整** - 支持上移/居中/下移布局
- **置顶按钮** - 右下角快速回到顶部

### 📱 响应式支持
- ✅ 桌面浏览器（Chrome/Firefox/Safari/Edge）
- ✅ 移动设备（iOS/Android）
- ✅ 平板设备（iPad/Android Tablet）

---

## 🛠️ 技术栈 | Tech Stack

| 技术 | 版本 | 用途 |
|------|------|------|
| **HTML** | HTML5 | 页面结构 |
| **CSS** | CSS3 | 样式和动画 |
| **JavaScript** | ES6 | 交互逻辑 |
| **Bootstrap** | 4.3 | UI 框架 |
| **jQuery** | 3.3.1 | DOM 操作 |
| **Remix Icon** | 4.1.0 | 图标库 |
| **Google Fonts** | Inter | 字体 |

---

## 📦 项目结构 | Project Structure

```
LocalNavigationPage/
├── HTML/                           # 前端文件目录
│   ├── index.html                  # 主页面
│   ├── CSS/                        # 样式文件
│   │   ├── styles.css              # 主样式
│   │   ├── search_input.css        # 搜索框样式
│   │   └── settings_box.css        # 设置框样式
│   ├── js/                         # JavaScript 文件
│   │   ├── jquery-3.3.1.slim.min.js  # jQuery
│   │   ├── bootstrap.min.js        # Bootstrap
│   │   ├── darkMode.js             # 夜间模式
│   │   └── main.js                 # 主逻辑
│   └── data/                       # 数据文件
│       └── links.json              # 链接配置
├── README.md                       # 项目文档
└── LICENSE                         # Apache-2.0 许可证
```

---

## 🚀 快速开始 | Quick Start

### 方式一：直接打开 | Direct Open

```bash
# 1. 克隆项目
git clone https://github.com/LceAn/LocalNavigationPage.git

# 2. 进入目录
cd LocalNavigationPage/HTML

# 3. 直接用浏览器打开
open index.html
```

### 方式二：本地服务器 | Local Server

```bash
# 使用 Python 启动本地服务器
cd LocalNavigationPage/HTML
python3 -m http.server 8080

# 访问 http://localhost:8080
```

### 方式三：GitHub Pages | GitHub Pages

1. Fork 本项目
2. 启用 GitHub Pages（Settings → Pages）
3. 选择 `main` 分支，目录选择 `/HTML`
4. 访问 `https://yourusername.github.io/LocalNavigationPage/HTML/`

---

## ⚙️ 配置说明 | Configuration

### 添加/编辑链接

编辑 `data/links.json` 文件：

```json
{
    "links": [
        {
            "ID": 4,
            "url": "https://www.lcean.com",
            "name": "LceAn",
            "category": "云上"
        },
        {
            "ID": 3,
            "url": "https://example.com",
            "name": "示例网站",
            "category": "分类 1"
        }
    ]
}
```

**字段说明：**
- `ID` - 排序 ID（数字越小越靠前）
- `url` - 网站地址
- `name` - 网站名称
- `category` - 所属分类

### 自定义主题颜色

编辑 `CSS/styles.css`：

```css
:root {
    --primary-color: #4f6ef5;      /* 主色调 */
    --background-color: #f5f7fa;   /* 背景色 */
    --text-color: #333333;         /* 文字颜色 */
    --card-bg: #ffffff;            /* 卡片背景 */
}
```

### 修改搜索引擎

编辑 `index.html` 中的搜索配置：

```javascript
const searchEngines = {
    baidu: 'https://www.baidu.com/s?wd=',
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q='
};
```

---

## 🎨 功能演示 | Features Demo

### 昼夜模式切换
点击右上角 🌙/☀️ 按钮即可切换主题

### 分类折叠/展开
- 点击分类卡片右侧箭头可展开/收起
- 左下角按钮可一键展开/收起所有分类
- 同一行其他分类会自动收起

### 布局调整
右上角功能按钮 → 布局调整 → 选择上移/居中/下移

### 快速搜索
1. 在搜索框输入关键词
2. 选择搜索引擎（百度/Google/必应）
3. 按回车或点击搜索按钮

---

## 📝 更新日志 | Changelog

### v1.0.3 (2025-05-15)
**✨ 新增功能**
- ✅ 卡片悬停效果优化
- ✅ 分类展开逻辑优化（同行自动收起）
- ✅ 垂直位置调整功能（上移/居中/下移）
- ✅ 右下角置顶按钮
- ✅ 左下角分组一键收起/展开按钮

**🎨 视觉优化**
- ✅ CSS 变量系统更新
- ✅ 主题色彩和过渡效果改进
- ✅ 标题添加渐变色和动画
- ✅ 分类卡片、标签、按钮细节优化
- ✅ 深色模式对比度提升

**🐛 Bug 修复**
- ✅ 修复时钟显示异常
- ✅ 修复分类数量不显示
- ✅ 修复布局调整下拉菜单显示问题
- ✅ 修复设置界面显示问题

**⚙️ 交互优化**
- ✅ 布局控制按钮合并（下拉菜单）
- ✅ 功能按钮位置重新布局
- ✅ 增加按钮操作反馈提示
- ✅ 分类内按 ID 排序
- ✅ 分组按最大 ID 排序

### v1.0.2 (2025-05-14)
- ✅ 优化分类，支持折叠
- ✅ 分类标题旁新增链接数量标签
- ✅ 时钟支持显示时分秒，数字宽度固定
- ✅ 分类折叠动画与按钮优化
- ✅ 页面整体风格微调

### v1.0.1 (2025-05-13)
- ✅ 初始版本发布
- ✅ 昼夜模式切换
- ✅ 多搜索引擎支持
- ✅ 本地 JSON 配置

---

## 🤝 贡献指南 | Contributing

### 开发环境设置

```bash
# 1. Fork 本项目
# 2. 克隆到本地
git clone https://github.com/your-username/LocalNavigationPage.git

# 3. 创建分支
git checkout -b feature/your-feature

# 4. 开发完成后提交
git commit -m "feat: add your feature"
git push origin feature/your-feature

# 5. 提交 Pull Request
```

### 代码规范
- 使用 ES6+ 语法
- CSS 使用 BEM 命名规范
- 注释使用英文或中文
- 保持代码整洁和可读性

---

## 📄 许可证 | License

Apache-2.0 License - 详见 [LICENSE](LICENSE) 文件

---

## 📞 联系方式 | Contact

- **GitHub:** [@LceAn](https://github.com/LceAn)
- **Repository:** [LocalNavigationPage](https://github.com/LceAn/LocalNavigationPage)
- **Issues:** [问题反馈](https://github.com/LceAn/LocalNavigationPage/issues)

---

## 🌟 特性路线图 | Roadmap

- [ ] 支持拖拽排序
- [ ] 支持导入/导出配置
- [ ] 支持自定义搜索引擎
- [ ] 支持多语言切换
- [ ] 支持网站缩略图预览
- [ ] 支持网站 favicon 自动获取
- [ ] 支持快捷键操作

---

**最后更新 | Last Updated:** 2026-03-18  
**当前版本 | Current Version:** 1.0.3

---

[English](#local-navigation-page) | [中文](#local-navigation-page)
