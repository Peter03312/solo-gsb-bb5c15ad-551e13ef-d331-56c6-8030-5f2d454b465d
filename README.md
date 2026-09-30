# 展馆应急疏散通行能力审核（Evacuation Review）

供展馆管理员审核应急疏散通行能力的 Web 应用。管理员录入各房间**待疏散人数**、
房间/出口之间**有向门与通道的单批次容量**及**出口容量**，系统按
**所有房间同时撤离**进行核定，并展示：

- **正常情形**（所有出口开放）的最大可送达人数、总缺口及未满足人数的房间；
- **逐一封闭单个出口**时的同样指标（被封闭出口不能作为终点，其他通道与出口容量保持原值）；
- 未满足人数的房间清单（含送达量、缺口量、是否为孤立房间）。

## 计算规则

- 系统将方案建模为有向网络上的**最大流**：源点→房间（容量=待疏散人数）→有向通道
  （容量=单批次容量，允许平行通道，容量叠加）→出口（容量=出口容量）→汇点。
- **通道容量由所有房间共享**；一名疏散人员跨越多条通道时，在汇点只被统计一次
  （流量守恒）。
- 优化目标分两级：
  1. **先最大化总送达人数**（Dinic 最大流）；
  2. 总送达量相同的方案中，**按房间编号顺序优先满足编号靠前的房间**
     （数字编号按数值升序，其他按字典序；最小费用流 + BigInt 字典序权重，精确无误差）。
- **封闭出口不能作为终点**：仅移除该出口到汇点的边；通道与其余出口容量不变，
  因此被封闭出口仍可作为中转节点。
- **孤立房间**（从任何容量大于 0 的开放出口沿通道反向不可达）无法送出任何人，
  其全部待疏散人数计入缺口。

### 拒绝录入的情况

提交的方案出现以下任一情况会被拒绝（HTTP 422）并逐条说明原因：

- 引用不存在的房间或通道端点；
- 负的待疏散人数或负容量；
- 没有出口；
- 另：编号为空/重复、房间与出口编号同名、通道自环、非整数值等。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 + Vite |
| 后端 | Node.js 20 + Express |
| 数据库 | SQLite（better-sqlite3，WAL 模式） |
| 部署 | Docker 多阶段构建 + Docker Compose |

## 一键启动（Docker Compose，推荐）

前置要求：已安装 Docker 与 Docker Compose 插件（`docker compose version` 可用）。

```bash
# 在仓库根目录执行
docker compose up -d --build
```

启动后：

- **访问地址：http://localhost:4000**
- 首次启动自动安装依赖、初始化数据库，并写入一个示例方案；
- SQLite 数据保存在命名卷 `evacuation-data` 中，重启容器数据不丢失。

常用命令：

```bash
docker compose logs -f          # 查看日志
docker compose down             # 停止并删除容器（数据卷保留）
docker compose down -v          # 停止并同时删除数据库卷（彻底重置）
HOST_PORT=8080 docker compose up -d --build   # 改用宿主机 8080 端口
```

> 宿主机端口通过环境变量 `HOST_PORT` 配置，默认 **4000**。

## 本地开发（不使用 Docker）

需要 Node.js 20+。

```bash
# 1) 启动后端（端口 4000）
cd server
npm install
npm start

# 2) 另开终端，启动前端开发服务器（端口 5173，自动代理 /api 到 4000）
cd web
npm install
npm run dev
```

访问：

- 前端开发服务器：**http://localhost:5173**
- 后端 API：**http://localhost:4000**

生产模式下可将前端构建后交由后端托管：

```bash
cd web && npm run build
cp -r dist ../server/public
cd ../server && npm start          # 访问 http://localhost:4000
```

## 配置（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `4000` | 后端监听端口（容器内固定为 4000） |
| `HOST_PORT` | `4000` | 仅 Compose 使用：映射到宿主机的端口 |
| `DB_PATH` | `server/data/evacuation.db` | SQLite 数据库文件路径；容器内为 `/app/server/data/evacuation.db` |
| `SEED_ON_EMPTY` | `true` | 数据库为空时是否自动写入示例方案，设为 `false` 关闭 |
| `STATIC_DIR` | `server/public` | 前端构建产物目录（镜像内已内置） |

## API 概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/scenarios` | 方案列表 |
| GET | `/api/scenarios/:id` | 方案详情，含正常 + 逐一封闭出口的计算结果 |
| POST | `/api/scenarios` | 新建方案（校验失败返回 422 及原因） |
| PUT | `/api/scenarios/:id` | 修改方案 |
| DELETE | `/api/scenarios/:id` | 删除方案 |
| POST | `/api/evaluate` | 只试算不保存 |

请求体示例：

```json
{
  "name": "一层展区",
  "rooms": [
    { "id": "R1", "people": 120 },
    { "id": "R2", "people": 80 }
  ],
  "exits": [
    { "id": "E1", "capacity": 120 },
    { "id": "E2", "capacity": 80 }
  ],
  "passages": [
    { "from": "R1", "to": "E1", "capacity": 50 },
    { "from": "R2", "to": "E1", "capacity": 100 },
    { "from": "R2", "to": "R3", "capacity": 30 }
  ]
}
```

校验失败响应示例：

```json
{
  "error": "方案校验未通过。",
  "details": ["第 1 条通道：终点 \"R3\" 不存在，必须引用已定义的房间或出口。"]
}
```

## 目录结构

```
.
├── Dockerfile              # 多阶段构建：构建前端 → 编译后端原生依赖 → 运行镜像
├── docker-compose.yml      # 一键启动 + 数据库命名卷
├── server/                 # Node.js + Express + SQLite
│   ├── src/
│   │   ├── index.js        # HTTP 接口与静态托管
│   │   ├── evacuation.js   # Dinic 最大流 + 字典序最小费用流（核心算法）
│   │   ├── validation.js   # 录入校验（拒绝原因）
│   │   ├── db.js           # SQLite 初始化与存取
│   │   └── seed.js         # 示例方案
│   └── test/               # 核心算法与校验的单元测试（node --test）
└── web/                    # React + Vite 前端
    └── src/
```

## 运行测试

```bash
cd server
npm test
```
