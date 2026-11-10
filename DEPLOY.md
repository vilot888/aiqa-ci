# DEPLOY.md — AI 答疑助手部署文档

> 项目：aiqa（AI 答疑助手）｜零运行时依赖，Node 内置 `http` 实现
> 适用任务：实验 7.2 配置 CI 流水线与容器化部署

---

## 一、本地启动

### 1. 环境要求

| 项 | 版本要求 | 校验命令 |
|---|---|---|
| Node.js | ≥ 18（CI 中使用 24） | `node -v` |
| npm | ≥ 9 | `npm -v` |
| 操作系统 | Windows 10/11、macOS、Linux 均可 | — |

### 2. 启动步骤

```bash
# 1) 进入项目目录
cd aiqa

# 2) 安装开发依赖（仅跑测试需要；运行应用本身不需要）
npm install

# 3) 启动服务
node src/server.js
# 或
npm start
```

### 3. 访问地址

浏览器打开 **http://localhost:3000**

### 4. 演示模式说明

本项目**未配置 LLM API Key 时自动进入演示模式**：

- 直接返回内置的本地兜底回答，无需联网、无需密钥，功能与交互完整可演示；
- 配置了 `LLM_API_KEY` 等环境变量后，自动切换为真实大模型回答；
- 演示模式的回答仅用于功能验证，**不代表真实模型输出质量**。

---

## 二、容器构建与运行

### 1. 构建镜像

```bash
docker build -t aiqa .
```

构建日志中可见分层过程：`FROM → WORKDIR → COPY package*.json → RUN npm ci → COPY src/public/data → USER node → EXPOSE → CMD`。
`COPY package*.json` 与 `RUN npm ci` 位于源码复制之前，源码变动时这两层仍命中缓存。

### 2. 前台运行（调试用，Ctrl+C 停止）

```bash
docker run -p 3000:3000 aiqa
```

### 3. 后台运行（推荐）

```bash
docker run -d -p 3000:3000 --name qa-helper --restart=unless-stopped aiqa
```

参数说明：

| 参数 | 作用 |
|---|---|
| `-d` | 后台运行（detached），不占用当前终端 |
| `-p 3000:3000` | 端口映射，格式为 `宿主机端口:容器端口` |
| `--name qa-helper` | 为容器命名，便于 logs / stop / rm 引用 |
| `--restart=unless-stopped` | 进程异常退出或宿主机重启后自动拉起（手动 stop 的除外） |
| `-v $(pwd)/data:/app/data` | （可选）挂载数据目录，使历史记录持久化到宿主机 |

### 4. 查看运行状态与日志

```bash
docker ps                       # 查看运行中的容器及端口映射
docker logs qa-helper           # 查看容器日志
docker logs -f --tail 100 qa-helper   # 实时跟随最后 100 行
docker stats qa-helper          # 查看 CPU / 内存占用
```

### 5. 停止与清理

```bash
docker stop qa-helper           # 停止
docker rm qa-helper             # 删除容器
docker rmi aiqa                 # 删除镜像
```

---

## 三、环境变量说明

| 变量名 | 作用 | 是否必填 | 默认值 |
|---|---|---|---|
| `LLM_API_KEY` | 大模型服务密钥，用于调用真实模型 | 否（不填则演示模式） | 空 |
| `LLM_BASE_URL` | 大模型服务接口地址（兼容 OpenAI 协议） | 否 | 内置默认地址 |
| `LLM_MODEL` | 指定使用的模型名称 | 否 | 内置默认模型 |
| `PORT` | 服务监听端口 | 否 | `3000` |

### 配置位置

**本地运行**：在项目根目录创建 `.env` 或直接导出环境变量

```bash
# Windows PowerShell
$env:LLM_API_KEY="sk-xxxx"; node src/server.js

# macOS / Linux
LLM_API_KEY=sk-xxxx node src/server.js
```

**Docker 运行**：通过 `-e` 传入，**不要写进 Dockerfile**

```bash
docker run -d -p 3000:3000 --name qa-helper \
  -e LLM_API_KEY=sk-xxxx \
  -e LLM_MODEL=qwen-plus \
  aiqa
```

或用 `--env-file`：

```bash
docker run -d -p 3000:3000 --name qa-helper --env-file .env aiqa
```

**CI 中**：密钥存放于仓库 Secrets，通过 `${{ secrets.XXX }}` 引用，禁止明文写入 YAML。

> ⚠️ 安全红线：`.env` 已加入 `.gitignore` 与 `.dockerignore`，切勿提交到仓库，也不要写进 Dockerfile 的 `ENV`（会固化在镜像层中，任何人 `docker history` 都能看到）。

---

## 四、常见故障排查

### 1. 端口占用（`EADDRINUSE`）

**现象**：启动报 `Error: listen EADDRINUSE: address already in use :::3000`

**排查步骤**：

```bash
# Windows：查谁占用了 3000
netstat -ano | findstr :3000
taskkill /PID <上一步查到的PID> /F

# macOS / Linux
lsof -i :3000
kill -9 <PID>
```

**替代方案**：换端口启动 —— `PORT=3001 node src/server.js`，或 Docker 改映射 `-p 3001:3000`。

### 2. 依赖缺失（`Cannot find module`）

**现象**：报 `Error: Cannot find module 'vitest'` 等

**排查步骤**：

```bash
# 1) 确认当前目录在项目根（有 package.json 的那一层）
pwd && ls package.json

# 2) 清缓存重装
rm -rf node_modules package-lock.json
npm install

# 3) 确认 Node 版本符合要求
node -v   # 应 ≥ 18
```

> 注意：应用本身零运行时依赖，只有跑测试才需要 `npm install`。若 `node src/server.js` 报找不到模块，多半是执行目录不对。

### 3. 容器无法启动

**现象**：`docker run` 后容器立即退出，`docker ps` 看不到

**排查步骤**：

```bash
# 1) 先看日志，这是第一手证据
docker logs qa-helper

# 2) 查看退出码（Exited (1) / Exited (137) 含义不同）
docker ps -a

# 3) 进容器内部检查
docker run -it --entrypoint sh aiqa
#    进去后确认：/app 下有 src、public、data、package.json
#    node -v 是否正常
```

**常见根因**：

| 退出码 / 现象 | 根因 | 解决 |
|---|---|---|
| `Exited (1)` + 日志 `Cannot find module` | `.dockerignore` 误排除了 `src` 或 `COPY` 路径写错 | 检查 COPY 路径与 .dockerignore |
| `Exited (1)` + `EACCES` | 非 root 用户无文件读权限 | `COPY` 后补 `chown -R node:node /app` |
| `Exited (137)` | 内存不足被 OOM kill | `docker stats` 查看，增加 Docker 内存上限 |
| `Up` 但浏览器打不开 | 端口映射写反或应用只监听 127.0.0.1 | 确认 `-p 宿主机:3000`，应用监听 `0.0.0.0` |

### 4. 故障演练标准流程

人为停止服务 → 观察现象 → 收集证据（进程状态 / 端口 / 日志）→ 定位根因 → 修复验证。

```bash
# 演练：停止容器
docker stop qa-helper
# 现象：浏览器无法访问，curl 连接被拒绝
curl -v http://localhost:3000
# 证据：docker ps 为空，但 docker ps -a 可见 Exited (0)
docker ps -a --filter name=qa-helper
# 结论：容器被人为停止，非程序崩溃（退出码 0 = 正常退出）
# 修复：
docker start qa-helper
```

---

## 五、运维清单（可选）

| 场景 | 做法 |
|---|---|
| 进程守护（Node 直跑） | `pm2 start src/server.js --name aiqa`；`pm2 save` + `pm2 startup` 开机自启 |
| 进程守护（容器） | `--restart=unless-stopped` |
| 查看日志 | `pm2 logs aiqa` / `docker logs -f qa-helper` |
| 一键重启 | `pm2 restart aiqa` / `docker restart qa-helper` |
| 健康检查 | `curl -f http://localhost:3000/` 返回 200 即正常 |
| 数据备份 | 挂载 `-v $(pwd)/data:/app/data`，备份宿主机 data 目录 |

---

## 六、上线检查清单

- [ ] `npm test` 全部通过
- [ ] `npm run test:e2e` 全部通过
- [ ] CI 流水线最近一次运行全绿
- [ ] 镜像体积已记录，无冗余文件（无 `node_modules`、`.git`、`tests`）
- [ ] 镜像以非 root 用户运行
- [ ] 密钥通过环境变量注入，镜像内无明文
- [ ] 已配置 `--restart=unless-stopped`
- [ ] 已做一次故障演练，确认能恢复
