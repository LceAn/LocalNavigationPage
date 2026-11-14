FROM node:22-alpine
LABEL maintainer="LceAn <lcean@users.noreply.github.com>"
LABEL version="1.27.0"
WORKDIR /app
COPY HTML/ ./HTML/
COPY scripts/serve.mjs scripts/config-store.mjs scripts/catalog-service.mjs scripts/mcp-client.mjs scripts/scan-catalog.mjs ./scripts/
ENV SERVE_HOST=0.0.0.0 LNP_DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/serve.mjs", "8080"]
