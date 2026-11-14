# API 与 MCP 接口文档

本文档描述导航页的两种程序化链接维护方式：REST API 和 MCP（Model Context Protocol）。

## REST API

`npm run serve` 启动的开发服务器自带 REST API（默认端口 8080）。

### 列出全部链接

```bash
curl http://127.0.0.1:8080/api/links
```

### 新增链接

```bash
curl -X POST http://127.0.0.1:8080/api/links \
  -H "Content-Type: application/json" \
  -d '{"name": "Grafana", "url": "http://192.168.1.100:3000", "category": "监控", "tag": "grafana"}'
```

### 更新链接

```bash
curl -X PUT http://127.0.0.1:8080/api/links/5 \
  -H "Content-Type: application/json" \
  -d '{"tag": "已更新"}'
```

### 删除链接

```bash
curl -X DELETE http://127.0.0.1:8080/api/links/5
```

### 批量导入

```bash
curl -X POST http://127.0.0.1:8080/api/links/import \
  -H "Content-Type: application/json" \
  -d '{"links": [{"name": "A", "url": "http://a.com"}, {"name": "B", "url": "http://b.com"}]}'
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | ✓ | 链接名称 |
| `url` | string | ✓ | http/https 地址 |
| `category` | string | – | 分组名（默认「未分类」） |
| `tag` | string | – | 标签 |
| `thumbnail` | string | – | 缩略图 URL |

### 安全提示

API 直接操作 `HTML/data/links.json`。部署到公网时：
- 设置 `SERVE_HOST=127.0.0.1` 仅绑定本机
- 或在前置 Nginx 中限制 `/api/` 路径的访问

---

## MCP Server

MCP（Model Context Protocol）允许 AI 助手（Claude Desktop 等）直接管理导航页链接。

### 启动

```bash
npm run mcp
# 或
node scripts/mcp-server.mjs
```

### Claude Desktop 配置

在 Claude Desktop 的配置文件（`claude_desktop_config.json`）中添加：

```json
{
  "mcpServers": {
    "local-navigation-page": {
      "command": "node",
      "args": ["C:/path/to/LocalNavigationPage/scripts/mcp-server.mjs"]
    }
  }
}
```

> Windows 路径用正斜杠或双反斜杠。macOS/Linux 用绝对路径。

### 可用工具（6 个）

| 工具 | 说明 | 参数 |
|---|---|---|
| `list_links` | 列出全部链接 | `category`（可选，按分组过滤） |
| `add_link` | 新增链接 | `name`*, `url`*, `category`, `tag` |
| `update_link` | 按 ID 更新 | `id`*, `name`, `url`, `category`, `tag` |
| `remove_link` | 按 ID 删除 | `id`* |
| `import_links` | 批量导入 | `links`*（数组，自动去重） |
| `get_stats` | 分组统计 | 无 |

*必填

### 使用示例

配置完成后，在 Claude Desktop 中直接对话：

> "帮我列出导航页里所有的数据库服务"
> "添加一个新链接：名字叫 Kibana，地址 http://192.168.1.100:5601，分组是监控"
> "把 ID 为 3 的链接标签改成 '已迁移'"
> "删除 ID 为 7 的链接"

### 与 REST API 的关系

两者操作同一份数据文件（`HTML/data/links.json`），互不冲突：
- REST API：适合脚本、CI/CD 管道、curl 调试
- MCP：适合 AI 助手自然语言操作、交互式对话

---

## Docker 部署注意事项

Docker 镜像从 1.18.0 起运行 Node.js 服务，包含 REST API 与共享配置接口。持久化目录为 `/data`，已有 `HTML/data` 挂载方式继续沿用。具体启动与 Tailscale 访问方式见 [部署指南](DEPLOY.md)。

## 共享配置（1.18.0）

`GET /api/config` 返回 `{links, settings, revision}`。`settings` 包含分类、分类图标和排序，`revision` 是当前文件内容的 SHA-256 版本标识。

`PUT /api/config` 请求体为 `{links, settings}`，请求头 `If-Match` 使用最近读取的 `revision`。成功返回 `{revision, total}`。版本冲突返回 409，无效输入返回 400，跨源写入返回 403。写入通过单进程队列和同目录临时文件重命名完成。运行环境通过 `LNP_DATA_DIR` 指定持久化目录。

现有 `/api/links` 接口保留，同时支持多地址 `urls` 数组，更新时保留其他配置字段。


## 在线编辑与目录（1.19.0）

浏览器编辑自动调用 `PUT /api/config`，沿用 `If-Match` 版本检查。客户端在 409 时尝试三方合并，同一字段冲突保留本机草稿。共享设置新增 `hiddenCatalogKeys` 字符串数组，用于隐藏已删除的扫描目录入口。

`GET /api/catalog` 读取持久化目录中的 `catalog.json`，文件缺失时返回公开示例，响应格式包含 `mcpServers` 和 `skills`。编辑扫描入口后，覆盖项作为普通 `links` 记录保存，`catalogKey` 关联原扫描条目。

普通链接支持 `kind` 为 `site` / `ai` / `mcp` / `skill`。MCP 和 Skill 可使用 `copyValue` 保存命令或路径，此时 `urls` 可为空数组。`POST /api/links`、`PUT /api/links/:id` 和共享配置接口均支持该格式。


## 网络环境配置（1.20.0）

共享配置 `settings.networkEnvironments` 为对象数组，各项包含唯一 `id`、显示名称 `name`、访问线路 `route` 和可选检测地址 `probeUrl`。`route` 支持 `auto` / `local` / `tunnel` / `remote`。检测地址支持 HTTP 与 HTTPS，检测由浏览器执行。服务器验证标识唯一性、线路枚举和地址协议，并通过现有配置版本机制保存。

浏览器的 `activeNetworkEnvironment` 保存当前所选环境，随该环境设置当前设备的 `networkMode`，两个字段均按设备维护。

## 资源详情（1.24.0）

`POST /api/catalog/inspect` 接收 `{catalogKey, linkId, address?, refresh?}`。扫描条目传 `catalogKey`，自建或覆盖项传 `linkId`。`address` 从已保存地址中选择。`refresh: true` 强制重新检测。接口沿用同源写入检查，检测独立于配置写入队列。

MCP 返回 `kind`、`connection`（协议、端点或命令、凭据键配置状态、脱敏 `clientConfig`）、`status`、`serverInfo`、`protocolVersion`、`tools`、`checkedAt`、`detectionLocation`。工具包含服务发布的描述、输入及输出 Schema。支持 2026-07-28 按请求发现协议与 2025/2024 握手协议。检测依次进行发现/握手及 `tools/list`，处理分页并清理会话或子进程。

每个连接结果缓存 15 秒，同配置的并发请求合并，全局最多三个活动检测，默认超时 20 秒。认证失败、超时、普通网页响应与异常工具分页返回相应状态。状态 `available` 表示本次成功读取服务发布的工具清单。

Skill 返回 `status`、`markdown`、`sections`、`allowedTools`、`compatibility`、`version`、`license`、`files`、`checkedAt`。最多读取 256 KiB 的 `SKILL.md`，文件清单展示根目录与下一层，共最多 120 项。`available` 表示技能已启用且文件可读取，另有 `disabled`、`missing`、`unconfigured` 状态。

请求以已保存目录为资源来源。STDIO 的实际命令从服务器 MCP 配置读取，HTTP 的凭据也从该配置读取。环境变量 `LNP_MCP_CONFIG` 指定配置文件，`LNP_SKILLS_DIR` 可将目录项映射到服务器技能根目录，`LNP_MCP_TIMEOUT_MS` 调整检测超时。
