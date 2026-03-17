# 配置保存引导流程 - UX 设计文档

**版本：** v1.0  
**创建时间：** 2026-03-18  
**用途：** 让用户以最简单的方式保存配置

---

## 🎯 设计目标

让用户在 **3 步内** 完成配置保存，无需技术背景。

---

## 📱 用户操作流程

### 步骤 1：修改配置

```
用户在 Web 界面：
1. 点击"设置"按钮
2. 进入"链接管理"
3. 添加/编辑/删除链接
4. 点击"保存配置"按钮
```

### 步骤 2：跟随引导

**弹窗显示：**

```
┌──────────────────────────────────────────────┐
│  💾 保存配置                         [✕]    │
├──────────────────────────────────────────────┤
│                                              │
│  ✅ 步骤 1/3 - 配置文件已下载                │
│  ─────────────────────────────────────       │
│  📄 links.json 已保存到下载文件夹            │
│  ⏱️  完成时间：2 秒                          │
│                                              │
│  📂 步骤 2/3 - 打开项目文件夹                │
│  ─────────────────────────────────────       │
│  路径：/xxx/LocalNavigationPage/HTML/data/  │
│  [📋 复制路径]     [📂 尝试打开]            │
│                                              │
│  🖱️ 步骤 3/3 - 替换原文件                    │
│  ─────────────────────────────────────       │
│  将下载的 links.json 拖拽到上方文件夹        │
│  或直接拖拽到此处 ⬇️                         │
│  ┌────────────────────────────────────┐     │
│  │                                    │     │
│  │      📥 拖拽文件到此处替换         │     │
│  │                                    │     │
│  └────────────────────────────────────┘     │
│                                              │
│            [✅ 已完成，刷新页面]             │
│                                              │
└──────────────────────────────────────────────┘
```

### 步骤 3：完成保存

```
用户操作：
1. 点击"复制路径"或"尝试打开"
2. 文件管理器打开
3. 拖拽 links.json 到文件夹
4. 确认替换原文件
5. 点击"已完成，刷新页面"
6. 页面刷新，新配置生效
```

---

## 🎨 UI 组件设计

### 1. 进度指示器

```css
.step-indicator {
    display: flex;
    justify-content: space-between;
    margin-bottom: 20px;
}

.step {
    flex: 1;
    text-align: center;
    padding: 10px;
    border-radius: 8px;
    background: #f5f5f5;
    margin: 0 5px;
}

.step.active {
    background: #4f6ef5;
    color: white;
}

.step.completed {
    background: #52c41a;
    color: white;
}
```

### 2. 拖拽区域

```css
.drag-zone {
    border: 2px dashed #d9d9d9;
    border-radius: 8px;
    padding: 40px 20px;
    text-align: center;
    transition: all 0.3s;
}

.drag-zone.drag-over {
    border-color: #4f6ef5;
    background: rgba(79, 110, 245, 0.1);
    transform: scale(1.02);
}

.drag-zone.success {
    border-color: #52c41a;
    background: rgba(82, 196, 26, 0.1);
}
```

### 3. 操作按钮

```css
.btn-primary {
    background: #4f6ef5;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.3s;
}

.btn-primary:hover {
    background: #3d58e8;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(79, 110, 245, 0.3);
}

.btn-secondary {
    background: white;
    color: #666;
    border: 1px solid #d9d9d9;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
}
```

---

## 🔧 技术实现

### 1. 文件下载

```javascript
function downloadConfig() {
    const config = {
        version: getAppVersion(),
        updated: new Date().toISOString(),
        links: getCurrentLinks()
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], {
        type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `links-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return config;
}
```

### 2. 路径复制

```javascript
function copyPath() {
    const path = getProjectPath();
    navigator.clipboard.writeText(path).then(() => {
        showToast('✅ 路径已复制到剪贴板');
    }).catch(() => {
        showToast('❌ 复制失败，请手动复制');
    });
}
```

### 3. 打开文件夹

```javascript
function openFolder() {
    const path = getProjectPath();
    
    // 尝试使用 file:// 协议
    try {
        window.location.href = `file://${path}`;
        
        // 3 秒后检查是否成功
        setTimeout(() => {
            if (document.hidden) {
                // 用户已切换到文件管理器
                showSuccess('文件夹已打开');
            } else {
                // 仍然在当前页面
                showToast('无法自动打开，请手动复制路径');
            }
        }, 3000);
    } catch (e) {
        showToast('请手动复制路径打开');
    }
}
```

### 4. 拖拽上传

```javascript
const dropZone = document.querySelector('.drag-zone');

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    
    const file = e.dataTransfer.files[0];
    
    if (file && file.name === 'links.json') {
        // 验证文件
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const config = JSON.parse(event.target.result);
                if (validateConfig(config)) {
                    dropZone.classList.add('success');
                    dropZone.innerHTML = '✅ 文件验证成功，点击"已完成"刷新页面';
                    enableFinishButton();
                }
            } catch (e) {
                showError('文件格式错误');
            }
        };
        reader.readAsText(file);
    } else {
        showError('请拖拽 links.json 文件');
    }
});
```

### 5. 配置验证

```javascript
function validateConfig(config) {
    // 检查必要字段
    if (!config.version || !config.links) {
        return false;
    }
    
    // 检查链接格式
    for (const link of config.links) {
        if (!link.ID || !link.url || !link.name) {
            return false;
        }
    }
    
    return true;
}
```

---

## 📊 用户体验优化

### 1. 实时反馈

```javascript
// 下载进度
function downloadWithProgress() {
    showProgress('正在生成配置文件...', 0);
    
    setTimeout(() => {
        updateProgress(50, '正在下载...');
        downloadConfig();
    }, 500);
    
    setTimeout(() => {
        updateProgress(100, '下载完成！');
        nextStep();
    }, 1500);
}
```

### 2. 错误处理

```javascript
// 常见错误提示
const errorMessages = {
    fileNotFound: '❌ 未找到 links.json 文件',
    invalidFormat: '❌ 文件格式错误，请检查 JSON 格式',
    permissionDenied: '❌ 无权限写入，请以管理员身份运行',
    networkError: '❌ 网络错误，请检查网络连接'
};

function showError(type) {
    const message = errorMessages[type] || '❌ 发生未知错误';
    showNotification(message, 'error');
}
```

### 3. 成功提示

```javascript
function showSuccess(message) {
    showNotification(message, 'success', {
        icon: '✅',
        duration: 3000,
        position: 'top-right'
    });
}
```

---

## 🎯 测试场景

### 场景 1：首次保存

```
用户：新手用户，第一次修改配置
预期：跟随引导，3 步完成
验证：配置生效，无错误
```

### 场景 2：重复保存

```
用户：熟练用户，多次修改配置
预期：快速操作，支持快捷键
验证：配置正确更新
```

### 场景 3：错误处理

```
用户：拖拽错误文件
预期：友好提示，指导正确操作
验证：用户能纠正错误
```

---

## 📈 数据指标

### 成功率指标

- **目标：** 95% 用户能独立完成保存
- **测量：** 用户完成保存流程的比例
- **优化：** 根据失败点优化引导

### 时间指标

- **目标：** 平均 60 秒内完成保存
- **测量：** 从点击下载到刷新页面
- **优化：** 减少等待时间

---

## 🔄 版本迭代

### v1.0（当前）
- [x] 基础引导流程
- [x] 拖拽上传
- [x] 路径复制

### v1.1（规划）
- [ ] 自动检测文件变化
- [ ] 一键刷新
- [ ] 保存历史版本

### v1.2（愿景）
- [ ] 云端同步配置
- [ ] 多设备共享
- [ ] 配置模板市场

---

**最后更新：** 2026-03-18  
**下次评审：** v1.1.0 开发前
