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

Docker 版本（Nginx）**不含** API——Nginx 仅服务静态文件。需要 API 时：
1. 在宿主机运行 `npm run serve` 替代 Docker
2. 或在宿主机运行 `node scripts/mcp-server.mjs`（挂载同一数据卷）
