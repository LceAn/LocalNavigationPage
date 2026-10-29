# 部署与访问控制指南

本页覆盖纯静态架构下的部署加固:基础认证(Basic Auth)、HTTPS、以及访问边界说明。容器监控 / 系统状态 / 多账号权限需要后端,超出本项目范围(见文末)。

## 基础认证(Basic Auth)

导航页会暴露你的服务清单与内网拓扑。若部署在公网可达的环境,建议加一层认证。

### 方案 A:宿主机 Nginx 反向代理 + auth

容器本身只服务静态文件,认证交给前置的 Nginx:

```nginx
server {
    listen 443 ssl;
    server_name nav.example.com;

    # 证书(Let's Encrypt / acme.sh 签发)
    ssl_certificate     /etc/ssl/nav.example.com.fullchain.pem;
    ssl_certificate_key /etc/ssl/nav.example.com.key;

    # 生成密码文件:htpasswd -c /etc/nginx/nav.htpasswd user
    auth_basic "Navigation";
    auth_basic_user_file /etc/nginx/nav.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 方案 B:Caddy(自动 HTTPS,配置最短)

```
nav.example.com {
    basic_auth {
        user $2a$14$…   # caddy hash-password 生成
    }
    reverse_proxy 127.0.0.1:8080
}
```

### 方案 C:仅内网开放(推荐的家庭布局)

最简单也最安全:服务只监听内网,外网访问走 VPN(Tailscale/WireGuard)。

- docker-compose.yml 端口改为 `127.0.0.1:8080:80`(仅本机)或防火墙放行 8080 仅限内网网段
- 外网场景使用链接的「隧道」地址(ts.net 等)访问服务本身,导航页仍从内网打开

## HTTPS

- 公网部署:用 Caddy(自动)或 Nginx + Let's Encrypt
- 纯内网:HTTP 可接受;若需 HTTPS 可用 mkcert 生成本地 CA 证书
- 注意:PWA 与剪贴板 API 在非 localhost 的 HTTP 下受限

## 更新部署

```bash
git pull
docker compose up -d --build
```

数据卷 `HTML/data` 独立于镜像,更新不影响数据;`links.json` 若为本地私有版本,更新前无需处理(构建时 .dockerignore 会排除它)。

## 访问边界说明

| 能力 | 本项目 | 说明 |
|---|---|---|
| 静态文件 + 认证 | ✅ 前置代理实现 | 见上 |
| 多账号 / 每人独立数据 | ❌ 需后端 | 数据在浏览器本地,天然按设备隔离 |
| 容器状态 / 系统资源 | ❌ 需后端 | 建议直接用 Portainer / Glances,导航页只放入口 |
| 点击统计 / 使用分析 | ✅ 浏览器本地 | 不上传,无隐私外泄 |
