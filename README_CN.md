# 本地导航页 Local Navigation Page

[![Version](https://img.shields.io/badge/Version-1.46.0-blue)]()
[![License](https://img.shields.io/badge/License-Apache--2.0-green)]()
[![Tests](https://img.shields.io/badge/Tests-172-brightgreen)]()
[![Dependencies](https://img.shields.io/badge/Dependencies-0-success)]()

**AI 时代的局域网主页。** 零依赖、零构建——网站、AI 模型、MCP 服务器、Skills,全部收进一个导航页。

[English](README.md) | [文档目录](docs/) | [API 与 MCP](docs/API.md)

---

## 为什么做这个项目

AI 时代改变了"主页"的定义。你不再只有网站——本机跑着 Ollama 模型、AI 助手连着 MCP 服务器、Skills 目录里存着技能、局域网里还有十几个服务。这个页面把它们统一收纳,并赋予智能。

### 与主流导航页对比

| 功能 | Homepage / Homarr / Dashy | 本项目 |
|------|:---:|:---:|
| **AI 模型看板** — 自动发现 Ollama / LM Studio / vLLM 模型,查看规格,复制 SDK 配置 | – | ✅ |
| **MCP & Skills 目录** — MCP 服务器和 Skills 作为磁贴展示,点击查看详情 | – | ✅ |
| **智能多线路** — 每条链接可配局域网/公网/隧道地址,主线路断开自动切换 | – | ✅ 全自动 |
| **本地服务扫描** — `npm run scan` 一条命令发现机器上所有服务 | – | ✅ 含 Docker 集成 |
| **REST API + MCP Server** — 通过 API 或 AI 助手管理链接 | – | ✅ |
| **多端同步** — 基于服务器的配置共享 | – | ✅ |
| **零依赖** — 无 npm install、无构建步骤 | – | ✅ |
| **完全离线** — 字体、图标、PWA 缓存全部本地化 | – | 部分 |

## 快速开始

```bash
git clone https://github.com/LceAn/LocalNavigationPage.git
cd LocalNavigationPage
npm run serve
```

打开 `http://127.0.0.1:8080` 即可。

**首次部署?一键扫描本机所有服务:**

```bash
npm run scan -- --deep        # 发现服务 + AI 模型 + MCP 端点
npm run scan -- --merge       # 合并进导航页
```

### 一键安装（免 Docker）

**Linux / macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/LceAn/LocalNavigationPage/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/LceAn/LocalNavigationPage/main/install.ps1 | iex
```

自动检测操作系统、检查 Node.js、注册系统服务（systemd / launchd / 开机自启）。支持指定端口和离线安装。

**离线安装**（内网环境）:
```bash
# 在有网的机器上下载项目打包,拷贝到目标机器后:
bash install.sh   # 自动检测当前目录的离线包
```

### 服务生命周期管理

```bash
node scripts/manage.mjs install     # 安装为系统服务
node scripts/manage.mjs status      # 查看运行状态
node scripts/manage.mjs start      # 启动
node scripts/manage.mjs stop       # 停止
node scripts/manage.mjs restart    # 重启
node scripts/manage.mjs update     # 更新 + 重启
node scripts/manage.mjs logs       # 查看日志
node scripts/manage.mjs uninstall  # 卸载（保留数据）
```

### Docker

```bash
docker compose up -d --build
```

## AI 时代功能

### AI 模型看板

指向本地 AI 服务,自动发现正在运行的模型:

- **Ollama** — 列出所有已拉取的模型(大小/家族/参数量/量化等级)
- **OpenAI 兼容** (LM Studio / vLLM / One API / OpenRouter) — 枚举 `/v1/models`
- 点击任意模型查看完整规格,一键复制 OpenAI SDK 配置(`base_url` + `model`)或 `curl` 测试命令

### MCP & Skills 一等公民

MCP 服务器和 Skills 不是普通书签,而是结构化的目录条目:

- **统一磁贴** — MCP、Skills、网站并排展示在导航抽屉中
- **类型筛选** — 一键筛选 网站 / AI / MCP / Skills
- **详情视图** — 点击 MCP 服务器查看工具列表、连接信息、配置
- **自动发现** — `npm run catalog` 扫描 MCP 配置与 Skills 目录
- **统一搜索** — 启动器(`Ctrl+K`)跨所有类型同时搜索

### 智能多线路

每条链接可配置多个地址,自动路由:

```json
{
  "name": "NAS 管理",
  "urls": [
    { "address": "http://192.168.1.100:5000", "label": "内网", "priority": 1 },
    { "address": "https://nas.tailnet.ts.net", "label": "Tailscale", "priority": 2 }
  ]
}
```

主地址不可达时,智能选路自动切换到最快的可用线路。彩色徽标(绿 = 内网,蓝 = 公网,紫 = 隧道)标识当前路由。

### REST API + MCP Server

```bash
curl http://127.0.0.1:8080/api/links
curl -X POST http://127.0.0.1:8080/api/links \
  -H "Content-Type: application/json" \
  -d '{"name":"Grafana","url":"http://192.168.1.100:3000","category":"监控"}'
```

或直接接入 AI 助手:

```json
{
  "mcpServers": {
    "local-navigation-page": {
      "command": "node",
      "args": ["path/to/LocalNavigationPage/scripts/mcp-server.mjs"]
    }
  }
}
```

然后说:*"添加一个 Kibana 链接,端口 5601,分组是监控"*——完成了。

详见 [docs/API.md](docs/API.md)。

## 核心功能

<details>
<summary><b>导航与链接</b></summary>

- 紧凑网格磁贴(图标 + 名称 + 标签),悬浮显示完整信息
- 拖拽排序;分组支持名称/数量/手动三种排序模式
- 右键菜单(复制地址/小窗打开/按线路直达/编辑)
- 键盘操作:`Ctrl+K` 启动器、`/` 聚焦搜索、方向键导航磁贴;所有键位均可自定义(录制/清除/还原)
- 内网/公网视觉区分(色环 + 徽标)
- 在线状态探测(可配频率,悬停显示延迟)

</details>

<details>
<summary><b>搜索</b></summary>

- 多引擎(百度/Google/必应开箱即用,完全自定义)
- 引擎按钮三种形态:全部显示 / 只显示当前(点击展开)/ 隐藏(回车用默认)
- `/前缀 关键词` 直达(`/g 词` → Google)
- 启动器跨链接、分组、标签、URL、搜索历史统一搜索

</details>

<details>
<summary><b>外观</b></summary>

- 日/夜模式,8 组预设主题色,自定义 CSS & JS
- 6 种时钟布局、6 种搜索框布局 + 5 种外观(玻璃/纯色/描边/下划线/方角)、3 档密度
- 天气动画(雨/雪/云,强度与实际天气匹配)
- PWA 可安装,完全离线(字体与图标全本地化)
- 空白区域手势:默认单击展开/收起快捷方式,单击与双击动作均可配置

</details>

<details>
<summary><b>数据与同步</b></summary>

- 浏览器本地存储(无需服务器)
- 可选多端同步(`npm run serve`)
- 导入/导出完整备份;导入前自动下载当前配置
- 书签 HTML 导入/导出(Chrome/Firefox/Edge 兼容)
- 9 项一键数据管理操作

</details>

<details>
<summary><b>服务扫描器</b></summary>

- `npm run scan` 发现所有监听端口
- Docker 集成(容器名直接成为服务名)
- 多端口去重(一个服务一条链接,不是一个端口一条)
- AI 模型发现(`--deep`)—— Ollama & OpenAI 端点
- MCP 端点探测(`/mcp`、`/sse`、`/api/mcp`)
- 系统服务过滤;`--merge`、`--json`、`--host` 参数

</details>

## 开发

```bash
npm test               # 172 项单元测试
npm run validate       # JSON / 资源 / 语法 / 版本一致性校验
npm run serve          # 开发服务器 + REST API
npm run scan -- --deep # 服务扫描(含 AI/MCP 发现)
npm run catalog        # MCP/Skills 目录扫描
npm run mcp            # MCP 服务器(stdio JSON-RPC)
```

## 文档

| 文档 | 说明 |
|---|---|
| [更新日志](docs/CHANGELOG.md) | 完整版本历史 |
| [API 与 MCP](docs/API.md) | REST 接口 + MCP 服务器配置 |
| [数据格式](docs/SCHEMA.md) | 数据结构说明 |
| [部署指南](docs/DEPLOY.md) | 认证、HTTPS、部署加固 |
| [安全策略](SECURITY.md) | 私有数据保护 |
| [English](README.md) | 英文文档 |

## 许可

[Apache License 2.0](LICENSE)
