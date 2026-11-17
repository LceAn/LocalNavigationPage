/* catalog.js — MCP / 技能目录
 * 数据来自 HTML/data/catalog.json（私有，gitignore）或 catalog.json.default（公开示例）。
 * 详情通过导航服务器读取实时工具和技能文件。
 * 网页「重新收集」调用 POST api/catalog/scan；纯静态部署仍可用 `npm run catalog`。 */
(function () {


    function normalizeCatalog(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const mcpServers = (Array.isArray(source.mcpServers) ? source.mcpServers : [])
            .map(normalizeServer)
            .filter(Boolean);
        const skills = (Array.isArray(source.skills) ? source.skills : [])
            .map(normalizeSkill)
            .filter(Boolean);
        return { mcpServers, skills, meta: source._meta && typeof source._meta === 'object' ? source._meta : {} };
    }

    function normalizeServer(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const name = String(raw.name || '').trim();
        if (!name) return null;
        const transport = ['http', 'sse'].includes(String(raw.transport || '').toLowerCase())
            ? String(raw.transport).toLowerCase()
            : 'stdio';
        const tools = Number(raw.tools);
        return {
            name,
            urls: Array.isArray(raw.urls) ? raw.urls.filter(url => url && isSafeUrl(url.address, ['http:', 'https:'])) : [],
            description: String(raw.description || ''),
            enabled: raw.enabled !== false && raw.disabled !== true,
            transport,
            url: raw.url ? String(raw.url) : '',
            command: raw.command ? String(raw.command) : '',
            args: Array.isArray(raw.args) ? raw.args.map(String) : [],
            tools: Number.isFinite(tools) && tools > 0 ? tools : null,
            tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [],
            envKeys: Array.isArray(raw.envKeys) ? raw.envKeys.map(String) : [],
            headerKeys: Array.isArray(raw.headerKeys) ? raw.headerKeys.map(String) : []
        };
    }

    function normalizeSkill(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const name = String(raw.name || '').trim();
        if (!name) return null;
        return {
            name,
            urls: Array.isArray(raw.urls) ? raw.urls.filter(url => url && isSafeUrl(url.address, ['http:', 'https:'])) : [],
            description: String(raw.description || ''),
            category: String(raw.category || ''),
            path: String(raw.path || ''),
            url: String(raw.url || ''),
            enabled: raw.enabled !== false,
            version: String(raw.version || ''),
            license: String(raw.license || ''),
            compatibility: String(raw.compatibility || ''),
            allowedTools: Array.isArray(raw.allowedTools) ? raw.allowedTools.map(String) : [],
            sections: Array.isArray(raw.sections) ? raw.sections.map(String) : [],
            tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : []
        };
    }

    async function fetchCatalog() {
        for (const path of ['api/catalog', 'data/catalog.json', 'data/catalog.json.default']) {
            try {
                const response = await fetch(path, { cache: 'no-store' });
                if (!response.ok) continue;
                return normalizeCatalog(await response.json());
            } catch { /* 尝试下一个 */ }
        }
        return normalizeCatalog(null);
    }

    function applyCatalog(data) {
        window.catalogInspectionTimeoutMs = Number(data.meta.inspectionTimeoutMs) || 20000;
        window.catalogEntries = [
            ...data.mcpServers.map((server, index) => ({
                ...server, ID: 'mcp-' + index, kind: 'mcp', catalog: true, catalogKey: 'mcp:' + server.name,
                category: 'MCP', tag: server.transport.toUpperCase(), remarks: server.description,
                copyValue: [server.command, ...server.args].filter(Boolean).join(' '),
                urls: server.urls?.length ? server.urls : (server.url && isSafeUrl(server.url, ['http:', 'https:']) ? [{ address: server.url, label: 'MCP', priority: 1 }] : [])
            })),
            ...data.skills.map((skill, index) => ({
                ...skill, ID: 'skill-' + index, kind: 'skill', catalog: true, catalogKey: 'skill:' + skill.name,
                category: skill.category || 'Skills', tag: 'Skill', remarks: skill.description,
                copyValue: skill.path,
                urls: skill.urls?.length ? skill.urls : (skill.url && isSafeUrl(skill.url, ['http:', 'https:']) ? [{ address: skill.url, label: '文档', priority: 1 }] : [])
            }))
        ];
    }

    async function loadCatalog() {
        const data = await fetchCatalog();
        applyCatalog(data);
        return data;
    }

    function rerenderCatalogViews() {
        if (typeof renderLinksByCategory === 'function') renderLinksByCategory(links);
        if (typeof renderLinksInSettingsIfVisible === 'function') renderLinksInSettingsIfVisible(links);
        window.updateCategoryDatalist?.();
    }

    window.refreshCatalog = async () => {
        const data = await loadCatalog();
        rerenderCatalogViews();
        return data;
    };

    // 让导航服务器重新扫描它所在机器的 MCP 配置与 Skills 目录。
    // 纯静态部署没有这个接口，会以 404 失败并提示改用 npm run catalog。
    window.scanCatalog = async () => {
        const response = await fetch('api/catalog/scan', { method: 'POST' });
        if (!response.ok) {
            let message = `HTTP ${response.status}`;
            try {
                const body = await response.json();
                if (body?.error) message = body.error;
            } catch { /* 静态服务器返回的不是 JSON */ }
            throw new Error(message);
        }
        const result = await response.json();
        await window.refreshCatalog();
        return result;
    };

    function bindCatalogScanButton() {
        const button = document.getElementById('catalog-scan-btn');
        if (!button || button.dataset.bound === 'true') return;
        button.dataset.bound = 'true';
        button.addEventListener('click', async () => {
            if (button.disabled) return;
            button.disabled = true;
            button.classList.add('is-loading');
            try {
                const result = await window.scanCatalog();
                const { mcpServers = 0, skills = 0 } = result.counts || {};
                window.showMessage?.(result.skipped
                    ? '没有发现 MCP 或 Skills，已保留原有目录'
                    : `已收集 ${mcpServers} 个 MCP、${skills} 个 Skills`);
            } catch (error) {
                window.showMessage?.(`收集失败：${error.message}。网页收集需要运行导航服务器（npm start）`);
            } finally {
                button.disabled = false;
                button.classList.remove('is-loading');
            }
        });
    }

    window.catalogEntries = [];
    document.addEventListener('DOMContentLoaded', async () => {
        await loadCatalog();
        rerenderCatalogViews();
        bindCatalogScanButton();
    });
})();
