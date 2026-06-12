# LocalNavigationPage Docker Image
# 轻量级静态网页导航服务

FROM nginx:alpine

# 维护者信息
LABEL maintainer="LceAn <lcean@users.noreply.github.com>"
LABEL version="1.2.0"
LABEL description="Local Navigation Page - 个人本地网络导航页"

# 复制静态文件到 nginx 目录；.dockerignore 会避免把本地 links.json 烘焙进镜像
COPY HTML/ /usr/share/nginx/html/

# 提供独立默认配置，避免挂载空 data 目录时默认配置被 volume 遮住
COPY HTML/data/links.json.default /opt/local-navigation-page/links.json.default
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/10-init-links-json.sh /docker-entrypoint.d/10-init-links-json.sh

RUN mkdir -p /usr/share/nginx/html/data /opt/local-navigation-page \
    && chmod +x /docker-entrypoint.d/10-init-links-json.sh

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
