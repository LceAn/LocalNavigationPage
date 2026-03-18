/**
 * Local Navigation Page - 设置面板模块 v1.1.0
 * 功能：配置管理界面、引导式保存、导入导出
 */

class SettingsPanel {
    constructor() {
        this.modal = null;
        this.init();
    }

    /**
     * 初始化设置面板
     */
    init() {
        this.createSettingsButton();
        this.createSettingsModal();
        this.bindEvents();
    }

    /**
     * 创建设置按钮
     */
    createSettingsButton() {
        const button = document.createElement('button');
        button.id = 'open-settings';
        button.className = 'icon-button';
        button.title = '打开设置';
        button.innerHTML = '<i class="ri-settings-3-line"></i>';
        
        // 添加到右上角按钮容器
        const container = document.querySelector('.settings-buttons');
        if (container) {
            container.appendChild(button);
        }
    }

    /**
     * 创建设置模态框
     */
    createSettingsModal() {
        const modalHTML = `
            <div id="settings-modal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2><i class="ri-settings-3-line"></i> 设置</h2>
                        <button class="modal-close" id="close-settings">
                            <i class="ri-close-line"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <!-- 在线状态检测设置 -->
                        <div class="settings-section">
                            <h4><i class="ri-wifi-line"></i> 在线状态检测</h4>
                            
                            <div class="setting-item">
                                <label for="check-enabled">启用检测</label>
                                <input type="checkbox" id="check-enabled" checked>
                            </div>
                            
                            <div class="setting-item">
                                <label for="check-interval">检测频率（秒）</label>
                                <input type="range" id="check-interval" 
                                       min="10" max="300" step="10" value="30">
                                <span id="interval-display">30 秒</span>
                                <p class="hint">建议 10-300 秒，过短可能影响性能</p>
                            </div>
                            
                            <div class="setting-item">
                                <label for="check-timeout">超时时间（秒）</label>
                                <input type="number" id="check-timeout" 
                                       min="1" max="10" value="3">
                            </div>
                        </div>

                        <!-- 配置管理 -->
                        <div class="settings-section">
                            <h4><i class="ri-database-2-line"></i> 配置管理</h4>
                            
                            <div class="setting-actions">
                                <button id="save-config" class="btn-primary">
                                    <i class="ri-save-line"></i> 保存配置
                                </button>
                                <button id="export-config" class="btn-secondary">
                                    <i class="ri-download-line"></i> 导出配置
                                </button>
                                <button id="import-config" class="btn-secondary">
                                    <i class="ri-upload-line"></i> 导入配置
                                </button>
                                <input type="file" id="import-file" accept=".json" style="display: none;">
                            </div>
                        </div>

                        <!-- 关于 -->
                        <div class="settings-section">
                            <h4><i class="ri-information-line"></i> 关于</h4>
                            <p class="about-text">
                                <strong>Local Navigation Page</strong><br>
                                版本：v1.1.0<br>
                                配置版本：${window.configManager?.configVersion || '1.1.0'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('settings-modal');
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 打开设置
        document.getElementById('open-settings')?.addEventListener('click', () => {
            this.open();
        });

        // 关闭设置
        document.getElementById('close-settings')?.addEventListener('click', () => {
            this.close();
        });

        // 点击模态框外部关闭
        this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // 检测频率滑块
        const intervalSlider = document.getElementById('check-interval');
        const intervalDisplay = document.getElementById('interval-display');
        intervalSlider?.addEventListener('input', () => {
            intervalDisplay.textContent = `${intervalSlider.value}秒`;
        });

        // 保存配置
        document.getElementById('save-config')?.addEventListener('click', () => {
            this.saveConfigGuide();
        });

        // 导出配置
        document.getElementById('export-config')?.addEventListener('click', () => {
            this.exportConfig();
        });

        // 导入配置
        document.getElementById('import-config')?.addEventListener('click', () => {
            document.getElementById('import-file')?.click();
        });

        document.getElementById('import-file')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.importConfig(file);
            }
        });

        // 保存检测设置
        document.getElementById('check-enabled')?.addEventListener('change', () => {
            this.saveCheckSettings();
        });

        document.getElementById('check-interval')?.addEventListener('change', () => {
            this.saveCheckSettings();
        });

        document.getElementById('check-timeout')?.addEventListener('change', () => {
            this.saveCheckSettings();
        });
    }

    /**
     * 打开设置面板
     */
    open() {
        this.loadSettings();
        this.modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    /**
     * 关闭设置面板
     */
    close() {
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    /**
     * 加载设置
     */
    loadSettings() {
        const checkConfig = JSON.parse(localStorage.getItem('urlCheckConfig') || '{}');
        
        document.getElementById('check-enabled').checked = checkConfig.enabled !== false;
        document.getElementById('check-interval').value = (checkConfig.interval || 30000) / 1000;
        document.getElementById('interval-display').textContent = `${(checkConfig.interval || 30000) / 1000}秒`;
        document.getElementById('check-timeout').value = (checkConfig.timeout || 3000) / 1000;
    }

    /**
     * 保存检测设置
     */
    saveCheckSettings() {
        const config = {
            enabled: document.getElementById('check-enabled').checked,
            interval: parseInt(document.getElementById('check-interval').value) * 1000,
            timeout: parseInt(document.getElementById('check-timeout').value) * 1000
        };

        window.urlManager?.saveCheckConfig(config);
        this.showToast('✅ 设置已保存', 'success');

        // 重启检测
        window.urlManager?.stopMonitoring();
        if (config.enabled) {
            window.urlManager?.startMonitoring();
        }
    }

    /**
     * 引导式保存配置
     */
    saveConfigGuide() {
        // 1. 导出配置文件
        const config = window.configManager?.exportConfig(window.configManager?.currentConfig);
        
        // 2. 显示保存指引弹窗
        this.showSaveGuideModal();
        
        // 3. 关闭设置面板
        this.close();
    }

    /**
     * 显示保存指引弹窗
     */
    showSaveGuideModal() {
        const guideModal = document.createElement('div');
        guideModal.id = 'save-guide-modal';
        guideModal.className = 'modal save-guide-modal';
        guideModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="ri-save-line"></i> 保存配置</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="step">
                        <span class="step-number">1</span>
                        <p>配置文件已下载：<strong>links.json</strong></p>
                        <p class="hint">📁 文件已保存到下载文件夹</p>
                    </div>
                    
                    <div class="step">
                        <span class="step-number">2</span>
                        <p>打开项目文件夹：</p>
                        <div class="action-buttons">
                            <button onclick="navigator.clipboard.writeText('HTML/data/'); alert('路径已复制')" class="btn-secondary">
                                📋 复制路径
                            </button>
                        </div>
                        <p class="path-display">HTML/data/</p>
                    </div>
                    
                    <div class="step">
                        <span class="step-number">3</span>
                        <p>将下载的 links.json 拖拽到上述文件夹，替换原文件</p>
                    </div>
                    
                    <div class="final-step">
                        <button onclick="location.reload()" class="btn-primary">
                            ✅ 已完成，刷新页面
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(guideModal);
        setTimeout(() => guideModal.classList.add('show'), 10);
    }

    /**
     * 导出配置
     */
    exportConfig() {
        try {
            window.configManager?.exportConfig(window.configManager?.currentConfig);
            this.showToast('✅ 配置已导出', 'success');
        } catch (e) {
            this.showToast('❌ 导出失败：' + e.message, 'error');
        }
    }

    /**
     * 导入配置
     */
    async importConfig(file) {
        try {
            await window.configManager?.importConfig(file);
            this.showToast('✅ 配置已导入，请刷新页面', 'success');
            setTimeout(() => location.reload(), 1500);
        } catch (e) {
            this.showToast('❌ 导入失败：' + e.message, 'error');
        }
    }

    /**
     * 显示提示消息
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// 初始化设置面板
const settingsPanel = new SettingsPanel();
window.settingsPanel = settingsPanel;

console.log('✅ 设置面板模块已加载 v1.1.0');
