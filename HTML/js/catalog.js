/* catalog.js — MCP / 技能目录
 * 数据来自 HTML/data/catalog.json（私有，gitignore）或 catalog.json.default（公开示例）。
 * 只读展示；生成用 `npm run catalog`。 */
(function () {
    const state = { data: null, loading: false, kind: 'mcp', query: '' };

    const $ = (id) => document.getElementById(id);

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
            description: String(raw.description || ''),
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
            description: String(raw.description || ''),
            category: String(raw.category || ''),
            path: String(raw.path || ''),
            enabled: raw.enabled !== false,
            tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : []
        };
    }

    async function fetchCatalog() {
        for (const path of ['data/catalog.json', 'data/catalog.json.default']) {
            try {
                const response = await fetch(path, { cache: 'no-store' });
                if (!response.ok) continue;
                return normalizeCatalog(await response.json());
            } catch { /* 尝试下一个 */ }
        }
        return normalizeCatalog(null);
    }

    function isHttpServer(server) {
        return server.transport === 'http' || server.transport === 'sse';
    }

    function endpointOf(server) {
        return isHttpServer(server)
            ? server.url
            : [server.command, ...server.args].filter(Boolean).join(' ');
    }

    function matches(item) {
        const query = state.query.trim().toLowerCase();
        if (!query) return true;
        const haystack = [
            item.name, item.description, item.category, item.url, item.command,
            ...(item.tags || []), ...(item.args || []), item.path
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
    }

    function serverCard(server) {
        const endpoint = endpointOf(server);
        const httpLike = isHttpServer(server);
        const badge = httpLike ? 'HTTP' : 'STDIO';
        const meta = [];
        if (endpoint) {
            meta.push(`<div><dt>${httpLike ? '端点' : '命令'}</dt><dd class="mono">${escapeHTML(endpoint)}</dd></div>`);
        }
        if (server.tools) meta.push(`<div><dt>工具</dt><dd>${server.tools} 个</dd></div>`);
        if (server.tags.length) meta.push(`<div><dt>标签</dt><dd>${server.tags.map(escapeHTML).join(' · ')}</dd></div>`);
        const keys = [...server.envKeys, ...server.headerKeys];
        if (keys.length) meta.push(`<div><dt>凭据</dt><dd>${keys.map(escapeHTML).join(' · ')}（值不展示）</dd></div>`);

        const status = httpLike && server.url
            ? `<span class="catalog-status" data-probe-url="${escapeHTML(server.url)}">检测中…</span>`
            : '<span class="catalog-status static">本地进程</span>';

        return `<article class="catalog-card" data-kind="mcp">
            <div class="catalog-card-head">
                <span class="catalog-card-icon"><i class="ri-${httpLike ? 'cloud-line' : 'terminal-box-line'}"></i></span>
                <div class="catalog-card-title">
                    <h3>${escapeHTML(server.name)}</h3>
                    <p>${escapeHTML(server.description || '未填写描述')}</p>
                </div>
                <span class="catalog-badge ${httpLike ? 'http' : 'stdio'}">${badge}</span>
            </div>
            <dl class="catalog-meta">${meta.join('')}</dl>
            <div class="catalog-card-foot">
                ${status}
                ${endpoint ? `<button type="button" class="catalog-copy" data-copy="${escapeHTML(endpoint)}">${httpLike ? '复制端点' : '复制命令'}</button>` : ''}
            </div>
        </article>`;
    }

    function skillCard(skill) {
        const meta = [];
        if (skill.category) meta.push(`<div><dt>分类</dt><dd>${escapeHTML(skill.category)}</dd></div>`);
        if (skill.tags.length) meta.push(`<div><dt>标签</dt><dd>${skill.tags.map(escapeHTML).join(' · ')}</dd></div>`);
        if (skill.path) meta.push(`<div><dt>路径</dt><dd class="mono">${escapeHTML(skill.path)}</dd></div>`);

        return `<article class="catalog-card" data-kind="skill">
            <div class="catalog-card-head">
                <span class="catalog-card-icon"><i class="ri-lightbulb-flash-line"></i></span>
                <div class="catalog-card-title">
                    <h3>${escapeHTML(skill.name)}</h3>
                    <p>${escapeHTML(skill.description || '未填写描述')}</p>
                </div>
                <span class="catalog-badge skill">${skill.enabled ? '已启用' : '已停用'}</span>
            </div>
            <dl class="catalog-meta">${meta.join('')}</dl>
            <div class="catalog-card-foot">
                <span class="catalog-status static">${skill.enabled ? '可直接调用' : '已停用'}</span>
                ${skill.path ? `<button type="button" class="catalog-copy" data-copy="${escapeHTML(skill.path)}">复制路径</button>` : ''}
            </div>
        </article>`;
    }

    function emptyState() {
        if (!state.data || (state.data.mcpServers.length === 0 && state.data.skills.length === 0)) {
            return `<div class="catalog-empty">
                <i class="ri-inbox-line"></i>
                <p>还没有目录数据</p>
                <span>运行 <code>npm run catalog</code> 生成 <code>HTML/data/catalog.json</code>，<br>或先编辑 <code>catalog.json.default</code> 作为示例。</span>
            </div>`;
        }
        return `<div class="catalog-empty"><i class="ri-search-line"></i><p>没有匹配项</p><span>换个关键词试试。</span></div>`;
    }

    function render() {
        const list = $('catalog-list');
        if (!list) return;
        const items = (state.kind === 'mcp' ? state.data.mcpServers : state.data.skills).filter(matches);
        list.innerHTML = items.length
            ? items.map(state.kind === 'mcp' ? serverCard : skillCard).join('')
            : emptyState();

        list.querySelectorAll('.catalog-copy').forEach(button => {
            button.addEventListener('click', () => {
                const text = button.dataset.copy || '';
                const clipboard = navigator.clipboard;
                if (!clipboard) { window.showMessage?.('当前环境不支持剪贴板'); return; }
                clipboard.writeText(text)
                    .then(() => window.showMessage?.('已复制', 'success'))
                    .catch(() => window.showMessage?.('复制失败', 'error'));
            });
        });

        if (state.kind === 'mcp') probeStatuses();
    }

    async function probeStatuses() {
        const nodes = [...document.querySelectorAll('#catalog-list [data-probe-url]')].slice(0, 12);
        if (nodes.length === 0) return;
        if (typeof probeUrl !== 'function') {
            nodes.forEach(node => { node.classList.add('static'); node.textContent = '已配置'; });
            return;
        }
        const queue = nodes.slice();
        const worker = async () => {
            while (queue.length) {
                const node = queue.shift();
                const result = await probeUrl(node.dataset.probeUrl);
                node.classList.toggle('online', !!result.online);
                node.classList.toggle('offline', !result.online);
                node.textContent = result.online
                    ? `可达${result.ms ? ` · ${result.ms}ms` : ''}`
                    : '不可达';
            }
        };
        await Promise.all([worker(), worker(), worker()]);
    }

    function updateSummary() {
        const summary = $('catalog-summary');
        if (!summary) return;
        const mcp = state.data ? state.data.mcpServers.length : 0;
        const skills = state.data ? state.data.skills.length : 0;
        summary.textContent = `${mcp} 个 MCP 服务 · ${skills} 个技能`;
    }

    async function openCatalog() {
        const view = $('catalog-view');
        if (!view) return;
        view.hidden = false;
        document.body.classList.add('catalog-open');
        $('catalog-back')?.focus({ preventScroll: true });

        if (!state.data && !state.loading) {
            state.loading = true;
            const list = $('catalog-list');
            if (list) list.innerHTML = '<div class="catalog-empty">加载中…</div>';
            state.data = await fetchCatalog();
            state.loading = false;
        }
        updateSummary();
        render();
    }

    function closeCatalog() {
        const view = $('catalog-view');
        if (!view || view.hidden) return;
        view.hidden = true;
        document.body.classList.remove('catalog-open');
    }

    function bind() {
        $('open-catalog')?.addEventListener('click', openCatalog);
        $('catalog-back')?.addEventListener('click', closeCatalog);

        document.querySelectorAll('.catalog-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                state.kind = tab.dataset.kind === 'skill' ? 'skill' : 'mcp';
                document.querySelectorAll('.catalog-tab').forEach(item => {
                    const active = item === tab;
                    item.classList.toggle('active', active);
                    item.setAttribute('aria-selected', String(active));
                });
                render();
            });
        });

        $('catalog-search')?.addEventListener('input', event => {
            state.query = event.target.value;
            render();
        });

        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            const view = $('catalog-view');
            if (!view || view.hidden) return;
            event.preventDefault();
            event.stopPropagation();
            closeCatalog();
        }, true);
    }

    document.addEventListener('DOMContentLoaded', bind);
})();
