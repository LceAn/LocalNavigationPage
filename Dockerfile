# LocalNavigationPage Docker Image
# 轻量级静态网页导航服务

FROM nginx:alpine

# 维护者信息
LABEL maintainer="LceAn <lcean@users.noreply.github.com>"
LABEL version="1.2.0"
LABEL description="Local Navigation Page - 个人本地网络导航页"

# 复制静态文件到 nginx 目录
COPY HTML/ /usr/share/nginx/html/

# 创建数据目录（用于 volume 挂载）
RUN mkdir -p /usr/share/nginx/html/data

# 提供默认配置文件（首次启动时使用）
COPY HTML/data/links.json /usr/share/nginx/html/data/links.json.default

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
