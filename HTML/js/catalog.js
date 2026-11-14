/* catalog.js — MCP / 技能目录
 * 数据来自 HTML/data/catalog.json（私有，gitignore）或 catalog.json.default（公开示例）。
 * 详情通过导航服务器读取实时工具和技能文件。扫描用 `npm run catalog`。 */
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

    window.catalogEntries = [];
    document.addEventListener('DOMContentLoaded', async () => {
        const data = await fetchCatalog();
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
        renderLinksByCategory(links);
        renderLinksInSettingsIfVisible(links);
        window.updateCategoryDatalist?.();
    });
})();
