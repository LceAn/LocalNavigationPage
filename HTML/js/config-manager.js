/**
 * Local Navigation Page - 配置管理模块 v1.1.0
 * 功能：Web 可视化配置管理、导入导出、多 URL 支持
 */

// ==================== 配置管理核心 ====================

/**
 * 配置管理器
 */
class ConfigManager {
    constructor() {
        this.STORAGE_KEY = 'navConfig';
        this.configVersion = '1.1.0';
        this.currentConfig = null;
    }

    /**
     * 加载配置（优先从 LocalStorage，其次从文件）
     */
    async loadConfig() {
        // 尝试从 LocalStorage 加载
        const localConfig = localStorage.getItem(this.STORAGE_KEY);
        if (localConfig) {
            try {
                this.currentConfig = JSON.parse(localConfig);
                console.log('✅ 从 LocalStorage 加载配置');
                return this.currentConfig;
            } catch (e) {
                console.error('❌ LocalStorage 配置解析失败', e);
            }
        }

        // 从文件加载
        try {
            const response = await fetch('data/links.json');
            this.currentConfig = await response.json();
            console.log('✅ 从文件加载配置');
            return this.currentConfig;
        } catch (e) {
            console.error('❌ 文件配置加载失败', e);
            return this.getDefaultConfig();
        }
    }

    /**
     * 保存配置到 LocalStorage
     */
    saveToLocal(config) {
        const configToSave = {
            version: this.configVersion,
            updated: new Date().toISOString(),
            links: config.links || config
        };
        
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(configToSave));
        console.log('✅ 配置已保存到 LocalStorage');
        return configToSave;
    }

    /**
     * 导出配置文件
     */
    exportConfig(config) {
        const configToExport = {
            version: this.configVersion,
            updated: new Date().toISOString(),
            links: config.links || config
        };

        const blob = new Blob([JSON.stringify(configToExport, null, 2)], {
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

        console.log('✅ 配置文件已导出');
        return configToExport;
    }

    /**
     * 导入配置文件
     */
    importConfig(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const config = JSON.parse(event.target.result);
                    if (this.validateConfig(config)) {
                        this.saveToLocal(config);
                        resolve(config);
                    } else {
                        reject(new Error('配置格式验证失败'));
                    }
                } catch (e) {
                    reject(new Error('JSON 解析失败：' + e.message));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file);
        });
    }

    /**
     * 验证配置格式
     */
    validateConfig(config) {
        if (!config || !config.links) {
            return false;
        }

        for (const link of config.links) {
            if (!link.ID || !link.url || !link.name) {
                return false;
            }
        }

        return true;
    }

    /**
     * 获取默认配置
     */
    getDefaultConfig() {
        return {
            version: this.configVersion,
            updated: new Date().toISOString(),
            links: []
        };
    }
}

// ==================== 多 URL 支持 ====================

/**
 * URL 管理器（支持多 URL 和状态检测）
 */
class URLManager {
    constructor() {
        this.checkInterval = null;
        this.defaultInterval = 30000; // 30 秒
        this.timeout = 3000; // 3 秒超时
    }

    /**
     * 加载检测配置
     */
    loadCheckConfig() {
        const saved = localStorage.getItem('urlCheckConfig');
        if (saved) {
            try {
                const config = JSON.parse(saved);
                this.defaultInterval = config.interval || 30000;
                this.timeout = config.timeout || 3000;
                return config.enabled !== false;
            } catch (e) {
                return true;
            }
        }
        return true;
    }

    /**
     * 保存检测配置
     */
    saveCheckConfig(config) {
        localStorage.setItem('urlCheckConfig', JSON.stringify({
            enabled: config.enabled,
            interval: config.interval || 30000,
            timeout: config.timeout || 3000
        }));
    }

    /**
     * 检测单个 URL 是否可访问
     */
    async checkURL(url) {
        const startTime = Date.now();

        try {
            // 方法 1：Fetch HEAD 请求
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(url, {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return {
                online: true,
                responseTime: Date.now() - startTime
            };
        } catch (error) {
            // 方法 2：Image 降级检测
            return this.checkByImage(url, startTime);
        }
    }

    /**
     * Image 降级检测
     */
    checkByImage(url, startTime) {
        return new Promise((resolve) => {
            const img = new Image();
            const timeout = setTimeout(() => {
                resolve({ online: false, responseTime: null });
            }, this.timeout);

            img.onload = () => {
                clearTimeout(timeout);
                resolve({
                    online: true,
                    responseTime: Date.now() - (startTime || Date.now())
                });
            };
            img.onerror = () => {
                clearTimeout(timeout);
                resolve({ online: false, responseTime: null });
            };

            // 尝试加载网站 favicon
            const domain = new URL(url).hostname;
            img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        });
    }

    /**
     * 批量检测多个 URL
     */
    async checkMultipleURLs(urls) {
        const results = await Promise.all(
            urls.map(url => this.checkURL(url.address || url))
        );
        return urls.map((url, index) => ({
            ...url,
            ...results[index]
        }));
    }

    /**
     * 选择最优 URL（优先级最高的在线 URL）
     */
    selectBestURL(urls) {
        const onlineURLs = urls.filter(url => url.online);
        if (onlineURLs.length === 0) return null;

        // 按优先级排序
        onlineURLs.sort((a, b) => (a.priority || 999) - (b.priority || 999));
        return onlineURLs[0];
    }

    /**
     * 启动定时检测
     */
    startMonitoring() {
        if (!this.loadCheckConfig()) {
            console.log('⚠️ URL 检测已禁用');
            return;
        }

        console.log(`🔍 启动 URL 检测，间隔：${this.defaultInterval / 1000}秒`);

        this.checkInterval = setInterval(() => {
            this.refreshAllURLStatus();
        }, this.defaultInterval);
    }

    /**
     * 停止定时检测
     */
    stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('⏸️ URL 检测已停止');
        }
    }

    /**
     * 刷新所有 URL 状态（需要在页面中实现）
     */
    refreshAllURLStatus() {
        // 这个方法需要在页面加载后由外部调用
        console.log('🔄 刷新 URL 状态');
    }
}

// ==================== 全局实例 ====================

const configManager = new ConfigManager();
const urlManager = new URLManager();

// 导出到全局
window.configManager = configManager;
window.urlManager = urlManager;

console.log('✅ 配置管理模块已加载 v1.1.0');
