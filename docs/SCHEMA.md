# 数据格式说明(SCHEMA)

本项目全部用户数据存于浏览器 `localStorage` 的单一容器 **`lnp:settings`**(JSON 对象,`schemaVersion: 2`),随「设置 → 数据 → 导出完整配置」导出为带元数据的备份文件。本文档描述各字段的含义与格式,供手工编辑备份或程序化迁移参考。

## links(链接数组)

链接可存于 `lnp:settings.navigationLinks`(页面运行格式)或备份文件的顶层 `links` 字段(导出格式),结构相同。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `ID` | number | ✓ | 唯一正整数;重复/非法时自动顺延 |
| `name` | string | ✓ | 显示名称(缺省「未命名」) |
| `category` | string | ✓ | 所属分组(缺省「未分类」) |
| `tag` | string | – | 标签小签(磁贴名称下方) |
| `url` | string | 二选一 | 单地址(与 `urls` 互斥,单地址时自动使用此字段) |
| `urls` | array | 二选一 | 多地址,按 `priority` 升序选择首选 |
| `urls[].address` | string | ✓ | 地址,强制 http/https/mailto/tel/ftp/file 白名单 |
| `urls[].label` | string | – | 地址标签(如「内网」「公网」;含关键词会参与网络类型判定) |
| `urls[].priority` | number | – | 优先级,小的为首选 |
| `thumbnail` | string | – | 缩略图 URL;内网地址留空走首字母 + favicon |

### 网络类型判定(getUrlChoiceMeta)

`urls[].address` 的主机名或 `label` 决定路线类型:

- **local(内网,绿)**:主机名为 localhost / `.local` / `.lan` / `127.x` / `10.x` / `172.16-31.x` / `192.168.x` / `169.254.x` / `::1` / `fe80::`,或 label 含「内网/本地/局域/local/lan」
- **tunnel(隧道,紫)**:label 含 tailscale / zerotier / wireguard / vpn / 隧道
- **remote(公网,灰蓝)**:其余

## settings(设置容器,导出文件顶层 `settings` 字段)

即 `lnp:settings` 的快照。常用键(均为可选,缺省走默认值):

| 键 | 类型 | 说明 |
|---|---|---|
| `theme` / `darkMode` | string | `light/dark/auto` / `enabled/disabled`(旧键,兼容) |
| `customPrimary` | string | 主题色预设 id(indigo/violet/teal/green/orange/pink/red/blue) |
| `customCss` / `customJs` | string | 自定义 CSS / JS(页面加载时注入/执行) |
| `navigationLinks` | array | 见上 `links` |
| `customCategories` | array | 自定义分组名(无链接的空分组) |
| `groupSortMode` | string | `name` / `count` / `custom` |
| `customCategoryOrder` | array | 手动排序时的分组名顺序 |
| `probeIntervalMs` | number | 状态探测间隔毫秒(0 = 关闭,默认 60000) |
| `smartRouting` | boolean | 智能选路开关 |
| `defaultSearchEngine` | string | 默认搜索引擎名 |
| `weatherCity` / 单位键 | string | 天气城市与 °C/°F |
| `collapsedSections` | array | 设置面板已折叠的 section id |
| `collapsedCategories` 相关 | mixed | 首页分组折叠状态 |
| `recentLinks` / `linkVisitCounts` | object | 最近使用时间戳 / 访问计数 |
| `lastUsedLinkUrls` | object | 多地址链接「记住的地址」 |

未知键在导入时被忽略(白名单合并),因此手工加入的自定义键不会破坏兼容性,但也不会被恢复。

## 安全约定

- 公开仓库中的 `HTML/data/links.json` 只含虚构示例;真实内网地址仅存浏览器或部署卷
- 协议白名单在数据规范化与渲染两层强制执行,详见 [SECURITY.md](../SECURITY.md)
