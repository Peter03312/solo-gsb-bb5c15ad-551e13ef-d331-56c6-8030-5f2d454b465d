# ---- 构建阶段：安装后端依赖并打包前端 ----
FROM node:20-bookworm AS build
WORKDIR /app

# 先复制依赖清单以利用 Docker 层缓存
COPY package.json ./
COPY client/package.json ./client/

RUN npm install --no-audit --no-fund \
    && cd client && npm install --no-audit --no-fund

COPY . .
RUN npm run build:client

# ---- 运行阶段 ----
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# better-sqlite3 为原生模块，复制构建阶段已编译好的 node_modules
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json

# 数据库默认存放目录（由 Compose 挂载为持久卷）
RUN mkdir -p /data
VOLUME ["/data"]

ENV DB_PATH=/data/evacuation.db
ENV PORT=4000
EXPOSE 4000

# 容器启动时自动建表并在库为空时写入示例方案
CMD ["node", "server/index.js"]
