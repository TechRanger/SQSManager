#!/bin/sh
# entrypoint.sh

# 确保脚本在出错时退出
set -e

# 设置 /app/data 目录的权限为用户 1000:1000
# 这个脚本现在以 root 身份运行，所以 chown 应该能成功
echo "Entrypoint: Setting permissions for /app/data (as root)..."
# 如果目录不存在，创建它
mkdir -p /app/data
chown 1000:1000 /app/data || echo "Entrypoint Error: Failed to chown /app/data!"

# 设置 /app 目录权限 (可选，但推荐，以防万一)
# echo "Entrypoint: Setting permissions for /app (as root)..."
# chown -R 1000:1000 /app || echo "Entrypoint Warning: Failed to chown /app"

# 使用 gosu 切换到用户 1000:1000 并执行传递的命令 (CMD)
echo "Entrypoint: Switching to user 1000:1000 and starting application -> exec gosu 1000:1000 \"$@\""
exec gosu 1000:1000 "$@" 