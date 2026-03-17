# Local Navigation Page - 未来更新规划

**文档版本：** v1.0.0  
**创建时间：** 2026-03-18  
**维护者：** G (@TG_orz) & OpenClaw Assistant  
**关联 Issue:** #待创建

---

## 📋 目录

1. [需求背景](#-需求背景)
2. [功能规划](#-功能规划)
3. [技术实现方案](#-技术实现方案)
4. [可行性分析](#-可行性分析)
5. [开发优先级](#-开发优先级)
6. [时间规划](#-时间规划)

---

## 🎯 需求背景

### 当前痛点

1. **配置修改繁琐** - 需要手动编辑 `data/links.json` 文件
2. **多网段访问不便** - 同一服务可能有多个地址（192.168.x.x / 100.x.x.x / 172.x.x.x）
3. **无法快速判断可用性** - 不知道哪个 URL 当前可访问
4. **缺少可视化配置** - 没有 Web 界面的配置管理

### 用户场景

**场景 1：多网段环境**
```
群晖 NAS:
- 本地网络：192.168.2.100
- Tailscale: 100.64.0.5
- 向日葵穿透：172.16.0.50
```

**场景 2：网络切换**
```
在家：192.168.2.* 网段 → 访问本地地址
在公司：100.*.*.* 网段 → 访问 Tailscale 地址
外出：172.*.*.* 网段 → 访问向日葵地址
```

**场景 3：配置管理**
```
现状：手动编辑 JSON 文件
期望：Web 界面可视化配置
```

---

## ✨ 功能规划

### 功能 1：Web 可视化配置管理 ⭐⭐⭐⭐⭐

#### 需求描述
在不引入后端数据库的前提下，实现 Web 页面编辑链接配置，**用户操作最简单**。

#### 实现方案

**方案 A：LocalStorage + 引导式保存**

```javascript
// 1. 配置存储在浏览器 LocalStorage
localStorage.setItem('navConfig', JSON.stringify(config));

// 2. 引导式保存流程
function saveConfigGuide() {
    // 自动生成带版本信息的配置文件
    const config = {
        version: getAppVersion(),
        updated: new Date().toISOString(),
        links: getCurrentLinks()
    };
    
    // 下载配置文件
    downloadFile(JSON.stringify(config, null, 2), 'links.json');
    
    // 显示保存指引弹窗
    showSaveGuideModal();
}
```

**保存指引弹窗 UI：**
```
┌─────────────────────────────────────────┐
│  💾 保存配置                            │
├─────────────────────────────────────────┤
│  1️⃣ 配置文件已下载：links.json          │
│     📁 文件已保存到下载文件夹            │
├─────────────────────────────────────────┤
│  2️⃣ 打开项目文件夹：                    │
│     [📋 复制路径] [📂 打开文件夹]       │
│     /xxx/LocalNavigationPage/HTML/data/│
├─────────────────────────────────────────┤
│  3️⃣ 将 links.json 拖拽到上述文件夹      │
│     🖱️ 或点击此处上传替换               │
├─────────────────────────────────────────┤
│          [✅ 已完成，刷新页面]          │
└─────────────────────────────────────────┘
```

**优点：**
- ✅ 纯前端实现，无需后端
- ✅ 引导式操作，用户友好
- ✅ 支持拖拽上传替换
- ✅ 配置版本管理
- ✅ 自动检测配置变化

**缺点：**
- ❌ 仍需用户手动替换文件（但已最简单）
- ❌ 换设备需要重新导入

**完整部署流程：**
```
1. 首次访问 → 读取 data/links.json
2. 修改配置 → 保存到 LocalStorage（即时生效）
3. 点击保存 → 自动下载 links.json
4. 跟随指引 → 3 步完成文件替换
5. 刷新页面 → 应用新配置
```

**详细 UX 设计：** 参见 [docs/CONFIG_SAVE_UX.md](docs/CONFIG_SAVE_UX.md)

---

### 功能 2：特性路线详细规划

#### 2.1 拖拽排序

**实现方案：** HTML5 Drag and Drop API + Sortable.js（可选）

**工作量：** 2-3 小时

---

#### 2.2 导入导出配置

**实现方案：** File API + Blob

**工作量：** 1-2 小时

---

#### 2.3 自定义搜索引擎

**实现方案：** LocalStorage 存储用户自定义引擎

**工作量：** 2 小时

---

#### 2.4 多语言切换

**实现方案：** i18n 方案，支持 zh-CN/en-US/zh-TW

**工作量：** 4-6 小时（含翻译）

---

#### 2.5 网站缩略图预览

**实现方案：** 使用第三方 API（Google/thum.io）

**工作量：** 1-2 小时

---

#### 2.6 Favicon 自动获取

**实现方案：** Google Favicon API

**工作量：** 0.5 小时

---

#### 2.7 快捷键操作

**实现方案：** Keyboard API 监听快捷键

**工作量：** 2-3 小时

---

### 功能 3：多 URL 支持 + 在线状态检测 ⭐⭐⭐⭐⭐

#### 需求描述
一个网站配置多个 URL 地址，前端显示在线状态，自动选择可访问的地址。

#### 实现方案

**数据结构设计：**
```json
{
    "links": [
        {
            "ID": 1,
            "name": "群晖 NAS",
            "urls": [
                {
                    "address": "https://192.168.2.100:5000",
                    "label": "本地网络",
                    "priority": 1
                },
                {
                    "address": "https://100.64.0.5:5000",
                    "label": "Tailscale",
                    "priority": 2
                },
                {
                    "address": "https://172.16.0.50:5000",
                    "label": "向日葵",
                    "priority": 3
                }
            ],
            "category": "云服务"
        }
    ]
}
```

**在线检测方案对比：**

| 方案 | 可行性 | 优点 | 缺点 |
|------|--------|------|------|
| **Ping** | ❌ | 快速准确 | 浏览器不支持 ICMP |
| **Fetch HEAD** | ⭐⭐⭐⭐⭐ | 简单可靠 | 需要 CORS 支持 |
| **Image 加载** | ⭐⭐⭐ | 无需 CORS | 只能检测图片资源 |
| **WebSocket** | ⭐⭐ | 实时 | 需要服务端支持 |
| **iframe** | ⭐ | 通用 | 性能差，有延迟 |

**推荐方案：Fetch HEAD + Image 降级**

**可配置参数：**
```javascript
// 默认配置（用户可在设置中修改）
const defaultConfig = {
    urlCheck: {
        enabled: true,        // 是否启用检测
        interval: 30000,      // 检测频率（毫秒）默认 30 秒
        timeout: 3000,        // 超时时间（毫秒）默认 3 秒
        maxConcurrent: 5      // 最大并发检测数
    }
};

// 用户配置界面
<div class="settings-section">
    <h4>🔍 在线状态检测</h4>
    
    <div class="setting-item">
        <label>启用检测</label>
        <input type="checkbox" id="check-enabled" checked>
    </div>
    
    <div class="setting-item">
        <label>检测频率（秒）</label>
        <input type="range" id="check-interval" 
               min="10" max="300" step="10" value="30">
        <span id="interval-display">30 秒</span>
        <p class="hint">建议 10-300 秒，过短可能影响性能</p>
    </div>
    
    <div class="setting-item">
        <label>超时时间（秒）</label>
        <input type="number" id="check-timeout" 
               min="1" max="10" value="3">
    </div>
</div>

// 保存到 LocalStorage
function saveCheckConfig() {
    const config = {
        enabled: document.getElementById('check-enabled').checked,
        interval: parseInt(document.getElementById('check-interval').value) * 1000,
        timeout: parseInt(document.getElementById('check-timeout').value) * 1000
    };
    localStorage.setItem('urlCheckConfig', JSON.stringify(config));
    applyCheckConfig();
}
```

**呼吸灯效果：**
```css
.status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 5px;
}

.status-indicator.online {
    background-color: #52c41a;
    box-shadow: 0 0 0 0 rgba(82, 196, 26, 0.7);
    animation: pulse-green 2s infinite;
}

.status-indicator.offline {
    background-color: #ff4d4f;
    box-shadow: 0 0 0 0 rgba(255, 77, 79, 0.7);
    animation: pulse-red 2s infinite;
}
```

**UI 设计：**
```
┌─────────────────────────────────────┐
│ 群晖 NAS                    [访问▼] │
│ ├─ 🟢 本地网络  (192.168.2.100)    │
│ ├─ 🟢 Tailscale   (100.64.0.5)     │
│ └─ 🔴 向日葵      (172.16.0.50)    │
└─────────────────────────────────────┘

状态说明：
🟢 在线（绿色呼吸灯）
🔴 离线（红色呼吸灯）
🟡 检测中（黄色闪烁）
```

**工作量：** 6-8 小时

---

## 📊 可行性分析

### 技术可行性

| 功能 | 技术难度 | 实现周期 | 依赖 |
|------|---------|---------|------|
| Web 可视化配置 | ⭐⭐ | 4-6 小时 | LocalStorage API |
| 拖拽排序 | ⭐ | 2-3 小时 | HTML5 Drag API |
| 导入导出配置 | ⭐ | 1-2 小时 | File API |
| 自定义搜索引擎 | ⭐ | 2 小时 | LocalStorage |
| 多语言切换 | ⭐⭐ | 4-6 小时 | i18n 框架 |
| 缩略图预览 | ⭐ | 1-2 小时 | 第三方 API |
| Favicon 获取 | ⭐ | 0.5 小时 | Google API |
| 快捷键操作 | ⭐⭐ | 2-3 小时 | Keyboard API |
| **多 URL+ 状态检测** | ⭐⭐⭐ | 6-8 小时 | Fetch API |

### 总体评估

**推荐优先级：**
1. ⭐⭐⭐⭐⭐ Web 可视化配置 + 导入导出
2. ⭐⭐⭐⭐⭐ 多 URL 支持 + 在线状态检测
3. ⭐⭐⭐⭐ Favicon 自动获取
4. ⭐⭐⭐ 快捷键操作
5. ⭐⭐ 自定义搜索引擎
6. ⭐⭐ 多语言切换
7. ⭐ 拖拽排序
8. ⭐ 缩略图预览

---

## 🎯 开发优先级

### Phase 1：核心功能（P0）
- [ ] Web 可视化配置管理（引导式保存）
- [ ] 导入导出配置
- [ ] 多 URL 支持
- [ ] 在线状态检测（可配置频率）
- [ ] 配置界面（检测频率/超时等设置）

**预计工时：** 14-18 小时  
**版本目标：** v1.1.0

---

### Phase 2：体验优化（P1）
- [ ] Favicon 自动获取
- [ ] 快捷键操作
- [ ] 自定义搜索引擎

**预计工时：** 5-7 小时  
**版本目标：** v1.2.0

---

### Phase 3：国际化（P2）
- [ ] 多语言切换（zh-CN/en-US）
- [ ] 拖拽排序
- [ ] 缩略图预览

**预计工时：** 7-10 小时  
**版本目标：** v1.3.0

---

## 📅 时间规划

### 短期（2026-03）
- [x] 需求分析和规划
- [ ] Phase 1 开发
- [ ] v1.1.0 发布

### 中期（2026-04）
- [ ] Phase 2 开发
- [ ] v1.2.0 发布
- [ ] 用户反馈收集

### 长期（2026-05+）
- [ ] Phase 3 开发
- [ ] v1.3.0 发布
- [ ] 性能优化
- [ ] 新功能规划

---

## 🔧 技术栈建议

### 保持现有架构
- **核心：** 纯 HTML/CSS/JavaScript
- **UI 库：** Bootstrap 4.3（现有）
- **图标：** Remix Icon（现有）
- **jQuery：** 保持使用（现有）

### 可选增强
- **Sortable.js** - 拖拽排序（可选）
- **i18next** - 国际化（可选）
- **CodeMirror** - JSON 编辑器（可选）

### 不建议引入
- ❌ 后端框架（PHP/Node.js）
- ❌ 数据库（MySQL/MongoDB）
- ❌ 构建工具（Webpack/Vite）

### 新增部署方式
- ✅ **Docker** - 容器化部署（规划中）

**Docker 部署方案：**
```dockerfile
# Dockerfile
FROM nginx:alpine
COPY HTML/ /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  navigation:
    build: .
    ports:
      - "8080:80"
    volumes:
      - ./HTML/data:/usr/share/nginx/html/data
    restart: unless-stopped
```

---

## 📝 待讨论事项

### 1. 配置持久化策略 ✅ 已确定
- [x] 使用 LocalStorage + 引导式保存
- [x] 提供下载替换原文件功能
- [ ] 考虑 GitHub Gist 同步（可选）

### 2. 在线检测频率 ✅ 已确定
- [x] 默认 30 秒
- [x] 用户可配置（10-300 秒）
- [ ] 后台标签页暂停检测（节省资源）

### 3. 多 URL 优先级 ✅ 已确定
- [x] 手动设置优先级
- [ ] 自动选择最快响应（可选）
- [ ] 记忆用户选择偏好（可选）

---

## 📞 下一步行动

1. **确认需求优先级** - 与 G 讨论 Phase 1 功能
2. **技术方案评审** - 确认实现细节
3. **开始开发** - Phase 1 核心功能
4. **测试验证** - 多网段环境测试
5. **发布 v1.1.0** - 包含新功能

---

## 📚 相关文档

- [配置保存 UX 设计](docs/CONFIG_SAVE_UX.md) - 详细的用户引导流程设计
- [README.md](README.md) - 项目主文档
- [LICENSE](LICENSE) - Apache-2.0 许可证

---

**最后更新：** 2026-03-18  
**下次评审：** Phase 1 开发前

---

## 🏷️ 标签

#roadmap #features #planning #v1.1.0 #web-config #multi-url #status-check
