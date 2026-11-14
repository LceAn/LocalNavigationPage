/* MCP 与 Skills 共用的同页详情窗口。检测由导航服务器完成。 */
(function () {
    const dialog = document.getElementById('resource-detail-dialog');
    const connectionPanel = document.getElementById('resource-connection');
    const content = document.getElementById('resource-content');
    const tabs = document.getElementById('resource-tabs');
    const refresh = document.getElementById('resource-refresh');
    let item;
    let detail;
    let trigger;
    let request;
    let polling;
    let generation = 0;
    let activeTab = '';
    let toolQuery = '';
    let visibleTools = 50;
    let address = '';
    let loading = false;

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (tag === 'i') node.setAttribute('aria-hidden', 'true');
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function action(label, callback, className = 'resource-button') {
        const button = element('button', className, label);
        button.type = 'button';
        button.addEventListener('click', callback);
        return button;
    }

    async function copyText(text, button) {
        try {
            if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
            else {
                const field = element('textarea', 'resource-copy-field');
                field.value = text;
                dialog.append(field);
                field.select();
                const copied = document.execCommand('copy');
                field.remove();
                button.focus();
                if (!copied) throw new Error('clipboard');
            }
            window.showMessage?.('已复制');
        } catch { window.prompt('复制内容', text); }
    }

    function copyButton(text, label = '复制') {
        const button = action(label, () => copyText(text, button), 'resource-copy-button');
        return button;
    }

    function info(label, value, copy = false) {
        const row = element('div', 'resource-info');
        row.append(element('span', 'resource-label', label));
        const valueRow = element('div', 'resource-value');
        valueRow.append(element('span', '', value || '尚未配置'));
        if (copy && value) valueRow.append(copyButton(value));
        row.append(valueRow);
        return row;
    }

    function empty(message, icon = 'ri-information-line') {
        const block = element('div', 'resource-empty');
        const symbol = element('i', icon);
        symbol.setAttribute('aria-hidden', 'true');
        block.append(symbol, element('p', '', message));
        return block;
    }

    function renderConnection() {
        connectionPanel.replaceChildren();
        const state = detail.status?.state || 'checking';
        const status = element('div', 'resource-state');
        status.dataset.state = state;
        status.append(element('span', 'resource-state-dot'), element('span', '', loading ? '正在检测' : detail.status?.message || '等待检测'));
        connectionPanel.append(status);
        if (detail.kind === 'mcp') {
            const connection = detail.connection || {};
            connectionPanel.append(info('连接方式', { stdio: 'STDIO · 本地进程', http: 'Streamable HTTP', sse: 'SSE · 事件流' }[connection.transport] || item.transport || '等待检测'));
            const urls = getSafeLinkUrls(item).filter(url => isSafeUrl(url.address, ['http:', 'https:']));
            if (connection.transport !== 'stdio' && urls.length > 1) {
                const label = element('label', 'resource-info');
                label.append(element('span', 'resource-label', '检测线路'));
                const select = element('select', 'resource-select');
                select.setAttribute('aria-label', 'MCP 检测线路');
                urls.forEach(url => {
                    const option = element('option', '', `${url.label || getUrlChoiceMeta(url).type} · ${url.address}`);
                    option.value = url.address;
                    select.append(option);
                });
                select.value = address || urls[0].address;
                select.addEventListener('change', () => { address = select.value; load(true); });
                label.append(select);
                connectionPanel.append(label);
            }
            if (connection.transport === 'stdio') {
                const command = [connection.command, ...(connection.args || [])].filter(Boolean).join(' ');
                connectionPanel.append(info('启动命令', command || item.copyValue, true));
            } else connectionPanel.append(info('端点地址', connection.endpoint || address, true));
            const server = detail.serverInfo || {};
            if (server.name) connectionPanel.append(info('服务', [server.title || server.name, server.version].filter(Boolean).join(' · ')));
            if (detail.protocolVersion) connectionPanel.append(info('协议版本', detail.protocolVersion));
            if (connection.credentials?.length) {
                const credentials = element('div', 'resource-info');
                credentials.append(element('span', 'resource-label', '连接凭据'));
                connection.credentials.forEach(credential => {
                    const row = element('div', 'resource-credential');
                    row.append(element('code', '', credential.name), element('span', '', credential.configured ? '已配置' : '待配置'));
                    row.title = credential.location === 'env' ? '环境变量' : 'HTTP 请求头';
                    credentials.append(row);
                });
                connectionPanel.append(credentials);
            }
        } else {
            connectionPanel.append(info('技能目录', detail.path || item.copyValue, true));
            if (detail.version) connectionPanel.append(info('版本', detail.version));
            if (detail.license) connectionPanel.append(info('许可', detail.license));
            if (detail.compatibility) connectionPanel.append(info('运行依赖', detail.compatibility));
            if (detail.allowedTools?.length) {
                const tools = element('div', 'resource-info');
                tools.append(element('span', 'resource-label', '声明工具'));
                const chips = element('div', 'resource-tags');
                detail.allowedTools.forEach(name => chips.append(element('code', '', name)));
                tools.append(chips);
                connectionPanel.append(tools);
            }
            if (detail.sections?.length) {
                const sections = element('div', 'resource-info');
                sections.append(element('span', 'resource-label', '内容目录'));
                const list = element('ul', 'resource-outline');
                detail.sections.slice(0, 20).forEach(title => list.append(element('li', '', title)));
                sections.append(list);
                connectionPanel.append(sections);
            }
        }
        connectionPanel.append(info('检测位置', '导航服务器'));
        const fields = element('div', 'resource-connection-fields');
        [...connectionPanel.children].slice(1).forEach(node => fields.append(node));
        const toggle = action(detail.kind === 'mcp' ? '连接详情' : '技能信息', () => {
            const expanded = connectionPanel.dataset.expanded !== 'true';
            connectionPanel.dataset.expanded = String(expanded);
            toggle.setAttribute('aria-expanded', String(expanded));
        }, 'resource-connection-toggle');
        toggle.setAttribute('aria-expanded', connectionPanel.dataset.expanded || 'false');
        toggle.append(element('i', 'ri-arrow-down-s-line'));
        connectionPanel.append(toggle, fields);
    }

    function renderTabs() {
        const views = detail.kind === 'mcp'
            ? [['tools', '工具', detail.tools?.length], ['config', '接入配置']]
            : [['guide', '使用指南'], ['files', '配套文件', detail.files?.filter(file => file.kind === 'file').length]];
        tabs.replaceChildren();
        views.forEach(([key, label, count]) => {
            const button = action(label, () => { activeTab = key; renderTabs(); renderContent(); }, 'resource-tab');
            button.setAttribute('aria-current', String(activeTab === key));
            if (count > 0) button.append(element('span', 'resource-tab-count', count));
            tabs.append(button);
        });
    }

    function renderToolList(list, count) {
        const query = toolQuery.toLowerCase().trim();
        const tools = (detail.tools || []).filter(tool => [tool.name, tool.title, tool.description].join(' ').toLowerCase().includes(query));
        count.textContent = loading ? '正在读取工具清单' : detail.status?.state !== 'available' ? '工具清单' : query ? `${tools.length} / ${detail.tools.length} 个工具` : `${tools.length} 个已发布工具`;
        list.replaceChildren();
        tools.slice(0, visibleTools).forEach(tool => {
            const card = element('details', 'resource-tool');
            const heading = element('summary');
            const name = element('div', 'resource-tool-heading');
            name.append(element('strong', '', tool.title || tool.name));
            if (tool.title) name.append(element('code', '', tool.name));
            if (tool.description) name.append(element('p', 'resource-tool-description', tool.description));
            heading.append(name, element('i', 'ri-arrow-down-s-line'));
            card.append(heading);
            const schema = element('div', 'resource-schema');
            const properties = tool.inputSchema?.properties || {};
            const required = new Set(Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : []);
            if (Object.keys(properties).length) {
                schema.append(element('h4', '', '输入参数'));
                Object.entries(properties).forEach(([key, property]) => {
                    const value = property && typeof property === 'object' ? property : {};
                    const row = element('div', 'resource-parameter');
                    const label = element('div', 'resource-parameter-name');
                    label.append(element('code', '', key), element('span', '', value.type || (value.anyOf || value.oneOf ? '联合类型' : 'object')));
                    if (required.has(key)) label.append(element('span', 'resource-required', '必填'));
                    row.append(label);
                    if (value.description) row.append(element('p', '', value.description));
                    schema.append(row);
                });
            } else schema.append(element('p', 'resource-muted', '此工具未声明输入字段'));
            const raw = element('details', 'resource-raw-schema');
            raw.append(element('summary', '', '完整 JSON Schema'), element('pre', '', JSON.stringify({ inputSchema: tool.inputSchema || {}, ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}) }, null, 2)));
            schema.append(raw);
            card.append(schema);
            list.append(card);
        });
        if (!tools.length) list.append(empty(query ? '没有匹配的工具' : detail.status?.state === 'available' ? '服务当前未发布工具' : loading ? '正在发现服务工具…' : detail.status?.message || '尚未发现工具', loading ? 'ri-loader-4-line ri-spin' : 'ri-tools-line'));
        if (tools.length > visibleTools) list.append(action('再显示 50 个', () => { visibleTools += 50; renderToolList(list, count); }));
    }

    // 所有内容都通过文本节点渲染，外部 Markdown 的 HTML 保持原文。
    function inlineMarkdown(parent, source) {
        const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
        let previous = 0;
        for (const match of source.matchAll(pattern)) {
            parent.append(document.createTextNode(source.slice(previous, match.index)));
            const text = match[0];
            if (text.startsWith('`')) parent.append(element('code', '', text.slice(1, -1)));
            else if (text.startsWith('**')) parent.append(element('strong', '', text.slice(2, -2)));
            else {
                const link = text.match(/^\[([^\]]+)\]\((.+)\)$/);
                const anchor = element('a', '', link[1]);
                anchor.href = link[2];
                anchor.target = '_blank';
                anchor.rel = 'noopener noreferrer';
                parent.append(anchor);
            }
            previous = match.index + text.length;
        }
        parent.append(document.createTextNode(source.slice(previous)));
    }

    function renderMarkdown(source) {
        const article = element('article', 'resource-markdown');
        let code = null;
        let fence = '';
        let list = null;
        let paragraph = null;
        const lines = source.replace(/\r\n/g, '\n').split('\n');
        const cells = line => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(value => value.trim().replace(/\\\|/g, '|'));
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
            if (code) {
                if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) code = null;
                else code.textContent += line + '\n';
                continue;
            }
            if (marker) {
                const pre = element('pre');
                code = element('code');
                fence = marker[1];
                pre.append(code);
                article.append(pre);
                paragraph = null;
                list = null;
                continue;
            }
            if (!line.trim()) { paragraph = null; list = null; continue; }
            if (line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[index + 1] || '')) {
                const wrapper = element('div', 'resource-table');
                const table = element('table');
                const head = element('thead');
                const headings = element('tr');
                cells(line).forEach(text => { const cell = element('th'); inlineMarkdown(cell, text); headings.append(cell); });
                head.append(headings);
                const body = element('tbody');
                index += 1;
                while (index + 1 < lines.length && lines[index + 1].includes('|') && lines[index + 1].trim()) {
                    const row = element('tr');
                    cells(lines[++index]).forEach(text => { const cell = element('td'); inlineMarkdown(cell, text); row.append(cell); });
                    body.append(row);
                }
                table.append(head, body);
                wrapper.append(table);
                article.append(wrapper);
                paragraph = null;
                list = null;
                continue;
            }
            const heading = line.match(/^(#{1,6})\s+(.+)$/);
            const bullet = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
            if (heading) {
                const node = element('h' + Math.min(heading[1].length + 1, 6));
                inlineMarkdown(node, heading[2]);
                article.append(node);
                paragraph = null;
                list = null;
            } else if (bullet) {
                if (!list) { list = element('ul'); article.append(list); }
                const node = element('li');
                inlineMarkdown(node, bullet[1]);
                list.append(node);
                paragraph = null;
            } else {
                if (!paragraph) { paragraph = element('p'); article.append(paragraph); }
                else paragraph.append(document.createTextNode('\n'));
                inlineMarkdown(paragraph, line);
                list = null;
            }
        }
        return article;
    }

    function renderContent() {
        content.replaceChildren();
        if (activeTab === 'tools') {
            const toolbar = element('div', 'resource-tool-toolbar');
            const count = element('span', 'resource-muted');
            const search = element('input', 'resource-tool-search');
            search.type = 'search';
            search.placeholder = '搜索工具';
            search.setAttribute('aria-label', '搜索 MCP 工具');
            search.value = toolQuery;
            const list = element('div', 'resource-tool-list');
            search.addEventListener('input', () => { toolQuery = search.value; visibleTools = 50; renderToolList(list, count); });
            toolbar.append(count, search);
            content.append(toolbar, list);
            renderToolList(list, count);
        } else if (activeTab === 'config') {
            const configuration = detail.connection?.clientConfig;
            if (!configuration) { content.append(empty('连接配置正在读取')); return; }
            const header = element('div', 'resource-section-heading');
            const json = JSON.stringify(configuration, null, 2);
            header.append(element('h3', '', 'MCP 客户端配置'), copyButton(json, '复制配置'));
            content.append(header, element('p', 'resource-muted', '将配置加入客户端，补全凭据占位值。STDIO 命令需要在客户端所在设备具备相应运行环境。'), element('pre', 'resource-config-code', json));
            if (detail.instructions) {
                content.append(element('h3', '', '服务说明'), renderMarkdown(detail.instructions));
            }
        } else if (activeTab === 'guide') {
            if (detail.markdown) content.append(renderMarkdown(detail.markdown));
            else {
                content.append(empty(loading ? '正在读取技能说明…' : detail.status?.message || '尚未读取技能说明', loading ? 'ri-loader-4-line ri-spin' : 'ri-book-open-line'));
                if (!loading) content.append(element('p', 'resource-hint', '在设置中填写服务器上的技能目录。容器部署可通过 LNP_SKILLS_DIR 指向挂载后的技能根目录。'));
            }
        } else {
            const files = detail.files || [];
            if (!files.length) { content.append(empty(loading ? '正在读取文件目录…' : '尚未读取到配套文件')); return; }
            const list = element('ul', 'resource-file-list');
            files.forEach(file => {
                const row = element('li');
                row.append(element('i', file.kind === 'directory' ? 'ri-folder-line' : file.kind === 'link' ? 'ri-links-line' : 'ri-file-text-line'), element('span', '', file.path));
                list.append(row);
            });
            content.append(element('p', 'resource-muted', '技能根目录与下一层文件夹，最多展示 120 项。'), list);
        }
    }

    function render() {
        const focused = document.activeElement;
        const restoreSearch = content.contains(focused) && focused.classList.contains('resource-tool-search');
        const selection = restoreSearch ? [focused.selectionStart, focused.selectionEnd] : null;
        renderConnection();
        renderTabs();
        renderContent();
        refresh.disabled = loading;
        refresh.classList.toggle('is-loading', loading);
        document.getElementById('resource-status').textContent = loading ? '正在从导航服务器读取' : detail.kind === 'mcp' && detail.status?.state === 'available' ? '工具清单来自本次服务发现' : detail.status?.message || '';
        const checked = detail.checkedAt ? new Date(detail.checkedAt) : null;
        document.getElementById('resource-checked').textContent = checked && !Number.isNaN(checked.getTime()) ? `${detail.cached ? '缓存检测' : '检测'} ${checked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '';
        if (restoreSearch) {
            const search = content.querySelector('input');
            search?.focus({ preventScroll: true });
            if (search?.type === 'text') search.setSelectionRange(...selection);
        }
    }

    async function load(force = false) {
        request?.abort();
        const controller = new AbortController();
        request = controller;
        const current = ++generation;
        loading = true;
        render();
        const timer = setTimeout(() => controller.abort(), Math.max(26000, (window.catalogInspectionTimeoutMs || 20000) + 6000));
        try {
            const response = await fetch('api/catalog/inspect', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ catalogKey: item.catalogKey, linkId: item.catalog ? undefined : item.ID, address: address || undefined, refresh: force }),
                signal: controller.signal
            });
            if (!response.ok) {
                let error;
                try { error = await response.json(); } catch { /* 静态托管没有检测 API */ }
                throw new Error(error?.error || (response.status === 404 ? '请使用 npm run serve 启动导航服务以读取资源详情' : `检测请求返回 HTTP ${response.status}`));
            }
            const result = await response.json();
            if (!result || result.kind !== detail.kind || !result.status) throw new Error('检测服务返回了异常数据');
            if (current !== generation || !dialog.open) return;
            detail = result;
        } catch (error) {
            if (current !== generation || !dialog.open) return;
            detail = { ...detail, tools: [], checkedAt: new Date().toISOString(), status: { state: 'unavailable', message: controller.signal.aborted ? '检测超时，请重新检测' : error.message } };
        } finally {
            clearTimeout(timer);
            if (current === generation && dialog.open) { loading = false; render(); }
        }
    }

    window.openResourceDetails = (entry, source = document.activeElement) => {
        request?.abort();
        clearInterval(polling);
        item = entry;
        trigger = source?.closest?.('#launcher') ? document.getElementById('open-navigation') : source;
        const kind = getNavigationItemKind(entry);
        const preferred = getPreferredUrlInfo(entry);
        address = getSafeLinkUrls(entry).length && /^https?:\/\//i.test(preferred?.address || '') ? preferred.address : '';
        activeTab = kind === 'mcp' ? 'tools' : 'guide';
        toolQuery = '';
        visibleTools = 50;
        connectionPanel.dataset.expanded = 'false';
        detail = { ...entry, kind, tools: [], files: [], status: { state: 'checking' }, connection: kind === 'mcp' ? { transport: entry.transport || (address ? 'http' : 'stdio'), command: entry.command, args: entry.args, endpoint: address } : undefined };
        document.getElementById('resource-title').textContent = entry.name;
        document.getElementById('resource-description').textContent = entry.remarks || entry.description || '';
        document.getElementById('resource-kind').textContent = kind === 'mcp' ? 'MCP SERVER' : 'SKILL';
        const avatar = document.getElementById('resource-avatar');
        avatar.className = 'resource-avatar ' + tileHueClass(entry.name);
        avatar.textContent = String(entry.name || '?').slice(0, 1).toUpperCase();
        if (!dialog.open) dialog.showModal();
        document.body.classList.add('resource-detail-open');
        content.scrollTop = 0;
        load();
        polling = setInterval(() => {
            if (dialog.open && kind === 'mcp' && !document.hidden && !loading) load(true);
        }, 60000);
    };

    document.getElementById('resource-close').addEventListener('click', () => dialog.close());
    refresh.addEventListener('click', () => load(true));
    dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
    dialog.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
    });
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
        generation += 1;
        request?.abort();
        clearInterval(polling);
        document.body.classList.remove('resource-detail-open');
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
        else document.getElementById('open-navigation').focus({ preventScroll: true });
    });
})();
