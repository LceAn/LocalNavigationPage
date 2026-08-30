# 安全策略 / Security Policy

## 支持版本 / Supported Versions

| 版本 | 支持 |
| ---- | ---- |
| 1.5.x | ✅ |
| < 1.5 | ❌ |

## 报告漏洞 / Reporting a Vulnerability

请通过 GitHub [Security Advisories](https://github.com/LceAn/LocalNavigationPage/security/advisories/new) 私密报告，
不要在公开 Issue 中披露细节。通常 7 天内回复。

## 私有数据处理约定 / Private Data Policy

本项目是面向个人的本地导航页，**公开仓库中绝不出现私有网络信息**：

- `HTML/data/links.json` 只保留虚构的公开示例地址；
  真实内网地址（192.168.x.x、Tailscale 等）仅保存在浏览器 `localStorage`
  或仓库外的数据卷中。
- 仓库工作区提供本地 pre-commit 钩子（`.git/hooks/pre-commit`，不随仓库分发），
  拦截与公开示例不一致的 `links.json` 提交。
- `npm run validate` 默认严格校验两者一致；本地开发可用
  `LNP_ALLOW_PRIVATE_LINKS=1` 临时豁免，但豁免的文件仍不允许提交。
- `docs/` 中出现的历史示例网段（如 192.168.2.100）为文档示例，非真实服务地址。

## 已知安全设计 / Security Notes

- 所有链接地址在数据规范化（`normalizeLinks`）与渲染（`getSafeLinkUrls`）
  两层强制协议白名单：`http/https/mailto/tel/ftp/file`，
  `javascript:` 等危险协议的链接会被丢弃。
- 所有用户数据经 `escapeHTML` / `textContent` 渲染；图标类名经
  `sanitizeIconClass` 白名单校验。
- Docker 镜像的 nginx 对 JSON 数据路由禁用缓存，并全站下发
  `X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`、
  `Permissions-Policy` 安全响应头。
