# syntax=docker/dockerfile:1

########################################
# 阶段 1：构建 React 前端
########################################
FROM node:20-bookworm-slim AS web-build
WORKDIR /app/web
# 优先复制依赖描述以利用 Docker 层缓存
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

########################################
# 阶段 2：安装后端依赖（含 better-sqlite3 原生编译）
########################################
FROM node:20-bookworm-slim AS server-deps
# better-sqlite3 优先下载预编译二进制；失败时用以下工具链从源码编译
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

########################################
# 阶段 3：运行镜像
########################################
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/server

# 后端代码与生产依赖
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/src ./src
COPY server/package.json ./package.json
# 前端构建产物由 Express 直接托管
COPY --from=web-build /app/web/dist ./public

# 数据库文件目录（compose 中挂载为命名卷）
RUN mkdir -p /app/server/data

ENV PORT=4000 \
    DB_PATH=/app/server/data/evacuation.db \
    SEED_ON_EMPTY=true \
    STATIC_DIR=/app/server/public

EXPOSE 4000

# 简单的容器健康检查
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
