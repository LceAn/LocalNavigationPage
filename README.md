# Local Navigation Page

纯 HTML、CSS 和 JavaScript 实现的本地导航页，支持分类、多地址链接、搜索、主题切换、浏览器内编辑、导入导出、PWA 清单和 Docker 静态部署。

![日间模式](assets/day-mode.png)

## 快速开始

直接使用静态服务器：

```bash
git clone https://github.com/LceAn/LocalNavigationPage.git
cd LocalNavigationPage/HTML
python3 -m http.server 8080
```

访问 `http://127.0.0.1:8080`。不建议直接双击 `index.html`，浏览器可能阻止读取 `data/links.json`。

Docker Compose：

```bash
git clone https://github.com/LceAn/LocalNavigationPage.git
cd LocalNavigationPage
docker compose up -d --build
```

默认访问 `http://127.0.0.1:8080`。Compose 将 `HTML/data` 挂载到容器；首次启动缺少 `links.json` 时，入口脚本会从安全示例创建。

## 链接数据

`HTML/data/links.json.default` 是 Docker 初始化模板，`HTML/data/links.json` 是静态部署需要的公开示例。两者在仓库中必须保持一致，防止误把私人管理地址提交到 Git。

页面中的编辑结果主要保存在浏览器 `localStorage`。私有地址建议通过页面导入/导出管理，或放在仓库外的 Docker 数据卷中。提交前运行验证命令确认示例没有被替换。

一个链接可以使用单个 `url`，也可以使用多个带标签和优先级的 `urls`：

```json
{
  "ID": 2,
  "name": "NAS 管理",
  "category": "存储",
  "urls": [
    { "address": "http://192.168.1.100:5000", "label": "本地", "priority": 1 },
    { "address": "https://your-host.example.com", "label": "远程", "priority": 2 }
  ]
}
```

只允许 `http` 和 `https` 示例地址。页面打开链接前还会执行协议校验。

## 开发验证

需要 Node.js 18+，无需安装第三方包：

```bash
npm run validate
docker build --tag local-navigation-page:test .
```

验证范围包括：

- 两份链接 JSON 的格式、ID、必要字段和 URL 协议
- 公开运行配置与默认模板一致
- HTML 引用的本地资源存在且不越界
- JavaScript 和 Docker 初始化 Shell 脚本语法
- Docker 镜像可以构建

## 目录

- `HTML/index.html`：页面入口
- `HTML/js/main.js`：链接、搜索、设置、导入导出和状态探测
- `HTML/js/darkMode.js`：主题状态
- `HTML/CSS/`：页面样式
- `HTML/data/`：公开示例与 Docker 默认配置
- `docker/`：Nginx 配置和数据初始化脚本
- `docs/`：更新记录、交互说明和路线图

## 许可

本项目使用 [Apache License 2.0](LICENSE)。

<!-- repo-readme-standard:v1 -->
## 仓库维护信息

- 项目类型：静态网页工具
- 当前状态：维护中
- 可见性：public
- 维护节奏：按月检查浏览器兼容性、公开示例和 Docker 构建
- 相关仓库：与 `Navigation_Index` 都属于导航领域，但数据模型和产品边界不同，不建议直接合并
- 维护边界：公开前必须复核链接数据；归档、删除或历史重写需单独确认
