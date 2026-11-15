import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function layoutFixture({ reducedMotion = false } = {}) {
  const classes = new Set();
  const animations = [];
  const element = (closed, open) => ({
    visible: true,
    getBoundingClientRect() {
      return this.visible ? classes.has('navigation-open') ? open : closed : { width: 0, height: 0 };
    },
    animate(frames, options) {
      const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    }
  });
  const time = element({ left: 460, top: 180, width: 360, height: 44 }, { left: 40, top: 25, width: 190, height: 40 });
  const search = element({ left: 295, top: 250, width: 690, height: 60 }, { left: 248, top: 26, width: 600, height: 44 });
  const tools = element({ left: 1000, top: 26, width: 250, height: 48 }, { left: 900, top: 31, width: 250, height: 34 });
  const header = { append(item) { item.parent = 'header'; } };
  const main = {};
  const drawer = { hidden: true, contains: () => false };
  const attributes = {};
  const opener = { setAttribute: (key, value) => { attributes[key] = value; } };
  const context = vm.createContext({
    links: [],
    document: {
      body: {
        classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
        insertBefore(item) { item.parent = 'body'; }
      },
      querySelector: selector => ({ '.home-header': header, '.top-right-buttons': tools, 'main.container': main })[selector],
      querySelectorAll: selector => selector === '.url-dropdown' ? [] : [time, search, tools],
      getElementById: id => ({ 'navigation-view': drawer, 'open-navigation': opener })[id],
      addEventListener() {}
    },
    matchMedia: () => ({ matches: reducedMotion }),
    renderLinksByCategory() {}
  });
  context.window = context;
  vm.runInContext(readFileSync(new URL('../../HTML/js/navigation.js', import.meta.url), 'utf8'), context);
  return { api: context, classes, animations, time, search, tools, drawer, attributes };
}

test('正常展开入口将同一工具栏移入顶栏，并从原位置执行缩放位移动画', () => {
  const fixture = layoutFixture();
  fixture.api.openNavigation();
  assert.equal(fixture.tools.parent, 'header');
  assert.equal(fixture.drawer.hidden, false);
  assert.equal(fixture.attributes['aria-expanded'], 'true');
  assert.equal(fixture.animations.length, 3);
  assert.equal(fixture.animations[1].frames[0].transform, 'translate(47px, 224px) scale(1.15, 1.3636363636363635)');
  assert.equal(fixture.animations[1].options.duration, 520);
});

test('收起通过同一入口恢复工具栏位置、折叠状态与反向动画', () => {
  const fixture = layoutFixture();
  fixture.api.openNavigation();
  fixture.api.closeNavigation();
  assert.equal(fixture.tools.parent, 'body');
  assert.equal(fixture.drawer.hidden, true);
  assert.equal(fixture.classes.has('navigation-open'), false);
  assert.equal(fixture.attributes['aria-label'], '打开快捷方式');
  assert.equal(fixture.animations.length, 6);
  assert.ok(fixture.animations.slice(0, 3).every(animation => animation.cancelled));
});

test('减少动态效果偏好仍完成展开收起，跳过位移动画', () => {
  const fixture = layoutFixture({ reducedMotion: true });
  fixture.api.openNavigation();
  assert.equal(fixture.tools.parent, 'header');
  fixture.api.closeNavigation();
  assert.equal(fixture.tools.parent, 'body');
  assert.equal(fixture.animations.length, 0);
});

test('快速连续切换取消上一轮动画，只保留当前布局的动画', () => {
  const fixture = layoutFixture();
  fixture.api.openNavigation();
  fixture.api.closeNavigation();
  fixture.api.openNavigation();
  assert.ok(fixture.animations.slice(0, 6).every(animation => animation.cancelled));
  assert.ok(fixture.animations.slice(6).every(animation => !animation.cancelled));
  assert.equal(fixture.drawer.hidden, false);
  assert.equal(fixture.tools.parent, 'header');
});

test('隐藏组件或缺少动画 API 时，布局切换照常完成', () => {
  const fixture = layoutFixture();
  fixture.time.visible = false;
  delete fixture.tools.animate;
  fixture.api.openNavigation();
  assert.equal(fixture.animations.length, 1);
  assert.equal(fixture.drawer.hidden, false);
});

// 分组管理改成「分组」标签页后，category-modal 已从 HTML 移除。
// 若初始化仍把 getElementById 的结果直接传给 body.append，null 会被写成文本节点显示在页面底部。
function initFixture({ withCategoryModal = false } = {}) {
  const appended = [];
  const strayText = [];
  const handlers = {};
  const linkModal = { id: 'link-modal' };
  const categoryModal = { id: 'category-modal' };
  const stub = () => ({ addEventListener() {}, setAttribute() {} });
  const byId = {
    'navigation-view': { hidden: true },
    'open-navigation': stub(),
    'link-modal': linkModal,
    'category-modal': withCategoryModal ? categoryModal : null,
    'navigation-search': stub(),
    'network-mode': { value: '', addEventListener() {} }
  };
  const context = vm.createContext({
    links: [],
    getSetting: () => 'auto',
    setSetting() {},
    LAST_USED_LINK_URLS_KEY: 'lastUsedLinkUrls',
    renderLinksByCategory() {},
    renderRecentLinks() {},
    document: {
      body: {
        append(...nodes) {
          appended.push(...nodes);
          // 模拟 DOM 语义：非节点参数会被转换成字符串文本节点
          nodes.forEach(node => {
            if (!node || typeof node !== 'object') strayText.push(String(node));
          });
        }
      },
      getElementById: id => byId[id] ?? null,
      querySelector: () => stub(),
      addEventListener: (name, fn) => { handlers[name] = fn; }
    },
    matchMedia: () => ({ matches: true })
  });
  context.window = context;
  vm.runInContext(readFileSync(new URL('../../HTML/js/navigation.js', import.meta.url), 'utf8'), context);
  return { handlers, appended, strayText, linkModal, categoryModal };
}

test('初始化只把存在的弹窗移到 body，不在页面底部留下 null 文本', () => {
  const fixture = initFixture();
  assert.equal(typeof fixture.handlers.DOMContentLoaded, 'function');
  fixture.handlers.DOMContentLoaded();
  assert.deepEqual(fixture.appended, [fixture.linkModal]);
  assert.deepEqual(fixture.strayText, [], 'append(null) 会写出 "null" 文本节点');
});

test('旧结构中两个弹窗同时存在时，仍然都会被移到 body', () => {
  const fixture = initFixture({ withCategoryModal: true });
  fixture.handlers.DOMContentLoaded();
  assert.deepEqual(fixture.appended, [fixture.linkModal, fixture.categoryModal]);
  assert.deepEqual(fixture.strayText, []);
});
