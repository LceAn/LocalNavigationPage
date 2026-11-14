import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { loadDataLayer } from './data-harness.mjs';

function detailFixture() {
    class Node {
        constructor(tag = 'div') {
            this.tagName = tag.toUpperCase();
            this.children = [];
            this.dataset = {};
            this.attributes = {};
            this.events = {};
            this.className = '';
            this.textContent = '';
            this.open = false;
            this.isConnected = true;
            this.classList = { contains: name => this.className.split(' ').includes(name), toggle() {}, add() {}, remove() {} };
        }
        append(...children) {
            for (const child of children) {
                if (child.parent) child.parent.children = child.parent.children.filter(node => node !== child);
                child.parent = this;
                this.children.push(child);
            }
        }
        replaceChildren(...children) { this.children = []; this.append(...children); }
        setAttribute(key, value) { this.attributes[key] = value; }
        addEventListener(name, callback) { this.events[name] = callback; }
        contains(node) { return this.children.includes(node) || this.children.some(child => child.contains?.(node)); }
        showModal() { this.open = true; }
        close() { this.open = false; this.events.close(); }
        focus() { document.activeElement = this; }
    }
    const nodes = new Map();
    const document = {
        hidden: false,
        activeElement: null,
        body: new Node('body'),
        createElement: tag => new Node(tag),
        createTextNode: text => ({ textContent: text }),
        getElementById: id => {
            if (!nodes.has(id)) nodes.set(id, new Node(id === 'resource-detail-dialog' ? 'dialog' : 'div'));
            return nodes.get(id);
        }
    };
    const { api } = loadDataLayer();
    const requests = [];
    const intervals = [];
    const context = vm.createContext({
        ...api, document, AbortController, navigator: {},
        getNavigationItemKind: item => item.kind,
        tileHueClass: () => '',
        setTimeout: () => 1, clearTimeout() {}, setInterval: callback => { intervals.push(callback); return intervals.length; }, clearInterval() {},
        fetch(url, options) {
            return new Promise(resolve => requests.push({ url, options, resolve }));
        }
    });
    context.window = context;
    vm.runInContext(readFileSync(new URL('../../HTML/js/resource-details.js', import.meta.url), 'utf8'), context);
    return { api: context, nodes, requests, intervals, Node, document };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('无 URL 的 MCP 卡片发送目录标识，省略占位井号地址', () => {
    const fixture = detailFixture();
    fixture.api.openResourceDetails({ ID: 'mcp-1', name: 'files', kind: 'mcp', catalog: true, catalogKey: 'mcp:files', urls: [], transport: 'stdio' });
    assert.equal(fixture.nodes.get('resource-detail-dialog').open, true);
    assert.deepEqual(JSON.parse(fixture.requests[0].options.body), { catalogKey: 'mcp:files', refresh: false });
});

test('自建资源按持久化 ID 检测，并使用当前设备的默认 URL', () => {
    const fixture = detailFixture();
    fixture.api.openResourceDetails({ ID: 17, name: 'notes', kind: 'mcp', urls: [{ address: 'http://100.90.1.2:3000/mcp', label: 'Tailscale' }] });
    const payload = JSON.parse(fixture.requests[0].options.body);
    assert.equal(payload.linkId, 17);
    assert.equal(payload.address, 'http://100.90.1.2:3000/mcp');
});

test('切换资源后忽略前一个请求的迟到响应', async () => {
    const fixture = detailFixture();
    fixture.api.openResourceDetails({ ID: 1, name: 'A', kind: 'mcp', urls: [] });
    fixture.api.openResourceDetails({ ID: 2, name: 'B', kind: 'mcp', urls: [] });
    assert.equal(fixture.requests[0].options.signal.aborted, true);
    fixture.requests[1].resolve({ ok: true, json: async () => ({ kind: 'mcp', tools: [], status: { state: 'available', message: 'B 成功' } }) });
    await flush();
    fixture.requests[0].resolve({ ok: true, json: async () => ({ kind: 'mcp', tools: [], status: { state: 'unavailable', message: 'A 失败' } }) });
    await flush();
    assert.equal(fixture.nodes.get('resource-title').textContent, 'B');
    assert.equal(fixture.nodes.get('resource-status').textContent, '工具清单来自本次服务发现');
});

test('关闭详情会取消请求并恢复触发器焦点', async () => {
    const fixture = detailFixture();
    const source = new fixture.Node('button');
    fixture.api.openResourceDetails({ ID: 1, name: 'A', kind: 'skill', urls: [] }, source);
    fixture.nodes.get('resource-close').events.click();
    assert.equal(fixture.requests[0].options.signal.aborted, true);
    assert.equal(fixture.document.activeElement, source);
    fixture.requests[0].resolve({ ok: true, json: async () => ({ kind: 'skill', status: { state: 'available' } }) });
    await flush();
    assert.equal(fixture.nodes.get('resource-detail-dialog').open, false);
});

test('打开期间定时重新发现，关闭后停止刷新', async () => {
    const fixture = detailFixture();
    fixture.api.openResourceDetails({ ID: 1, name: 'A', kind: 'mcp', urls: [] });
    fixture.requests[0].resolve({ ok: true, json: async () => ({ kind: 'mcp', tools: [], status: { state: 'available' } }) });
    await flush();
    fixture.intervals[0]();
    assert.equal(JSON.parse(fixture.requests[1].options.body).refresh, true);
    fixture.nodes.get('resource-close').events.click();
    fixture.intervals[0]();
    assert.equal(fixture.requests.length, 2);
});
