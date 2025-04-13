# 使用 cm2network/steamcmd 作为基础镜像
FROM cm2network/steamcmd

# 切换到 root 用户以安装 Node.js 和依赖
USER root

# 设置工作目录 (可以选择你喜欢的路径)
WORKDIR /app

# 安装 Node.js 20 和其他必要工具 (假设基础镜像是 Debian/Ubuntu)
# 更新包列表，安装 curl 和 gnupg 用于添加 NodeSource 仓库
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg && \
    # 添加 NodeSource GPG key 和仓库
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    NODE_MAJOR=20 && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    # 更新包列表并安装 Node.js
    apt-get update && apt-get install nodejs -y && \
    # 清理 apt 缓存
    apt-get clean && rm -rf /var/lib/apt/lists/*

# 验证 Node.js 和 npm 版本 (可选)
RUN node -v && npm -v

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装所有依赖项（包括开发依赖，因为我们需要构建）
# 注意：这里使用 npm install 而不是 npm ci，因为基础镜像变了，node_modules 可能需要重新构建
RUN npm install

# 复制源代码 (包括 tsconfig 等构建需要的文件)
COPY . .

# 构建项目 (如果你的项目需要构建步骤)
# 如果没有构建步骤，可以注释掉或删除这一行
RUN npm run build

# 确保 /app 目录的所有权正确 (如果后续可能切换用户)
# RUN chown -R steam:steam /app 

# 如果应用需要访问挂载的 /servers 目录，确保运行用户有权限
# 如果以 root 运行，通常有权限；如果以 steam 运行，可能需要调整 /servers 的宿主机权限
# 或者在容器启动脚本中 chown /servers

# 设置生产环境变量
ENV NODE_ENV production

# 暴露应用端口
EXPOSE 3000

# 运行应用
# 注意: CMD 应该指向你编译后的 JavaScript 文件入口，通常在 dist 目录
CMD [ "node", "dist/main" ] 