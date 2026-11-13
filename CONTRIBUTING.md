# 贡献指南

感谢关注本项目！这是一个纯静态、零依赖、零构建的项目，贡献流程刻意保持轻量。

## 开发环境

- Node.js 18+(无第三方依赖,无需 install)
- 任意静态服务器或 `npm run serve`

## 常用命令

```bash
npm test               # 数据层 + 扫描器单元测试(node:test)
npm run validate       # 链接 JSON / 资源引用 / 脚本语法 / 版本一致性
npm run serve          # 本地预览
npm run scan           # 扫描本机服务生成导入文件
```

## 提交规范

- 一次提交一件事;提交信息用英文祈使句或中文描述均可
- 涉及 UI 变更请附截图
- **禁止提交私有数据**:`HTML/data/links.json` 必须保持公开示例;
  本地私有数据由 pre-commit 钩子拦截(见 SECURITY.md)

## 代码风格

- 经典脚本(非 ES Module),按加载顺序拆分模块(见 README 目录)
- 函数优先复用现有工具(`escapeHTML`/`isSafeUrl`/`sanitizeUrl`...)
- 新增数据字段请同步 [docs/SCHEMA.md](SCHEMA.md)
- 改动识别/分类逻辑请补 `scripts/test/` 用例

## 测试

- 数据层测试走零依赖沙箱执行器(`scripts/test/data-harness.mjs`),
  不引入 jsdom 等重依赖
- 新功能至少一条正例 + 一条边界反例

## 报告问题

- Bug:GitHub Issue,附控制台报错与复现步骤
- 安全:走 [SECURITY.md](SECURITY.md) 的私密渠道
