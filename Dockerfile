# 单阶段精简镜像：本项目零运行时依赖、无编译步骤
FROM node:24-alpine

# 设置工作目录，后续指令的相对路径以此为准
WORKDIR /app

# 先复制依赖清单：package.json 不变时，npm ci 这一层就能命中缓存
COPY package.json package-lock.json ./

# 仅安装生产依赖（本项目零运行时依赖，此步实际不产生 node_modules，但保留以兼容未来新增依赖）
RUN npm ci --omit=dev && npm cache clean --force

# 再复制运行必需的文件：源码、静态资源、数据目录
COPY src ./src
COPY public ./public
COPY data ./data

# 以非 root 用户运行：node 官方镜像自带 node 用户（uid 1000）
RUN chown -R node:node /app
USER node

# 仅声明容器监听端口（实际映射在 docker run 时指定）
EXPOSE 3000

# 容器启动命令
CMD ["npm", "start"]
