#!/bin/bash
set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}请使用 root 权限运行此脚本${NC}"
  echo -e "请使用: ${YELLOW}sudo bash setup.sh${NC}"
  exit 1
fi

# 检查是否为 Ubuntu 系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [ "$ID" != "ubuntu" ]; then
        echo -e "${YELLOW}注意: 当前系统不是 Ubuntu，某些功能可能不正常工作${NC}"
    else
        echo -e "${GREEN}检测到 Ubuntu $VERSION_ID 系统${NC}"
    fi
else
    echo -e "${YELLOW}无法确定操作系统类型，继续执行...${NC}"
fi

# 欢迎信息
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}    SQSManager 安装/管理工具 (Ubuntu版)    ${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo ""

# 安装必要的软件包
echo -e "${YELLOW}安装必要的软件包...${NC}"
apt-get update
apt-get install -y apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release

# 检查 Docker 是否已安装
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker 未安装，正在安装...${NC}"
    
    # 添加 Docker 官方 GPG 密钥
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    
    # 添加 Docker 软件源
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # 安装 Docker
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
    
    # 启动 Docker 服务
    systemctl enable docker
    systemctl start docker
    
    echo -e "${GREEN}Docker 安装完成${NC}"
else
    echo -e "${GREEN}Docker 已安装${NC}"
fi

# 检查 Docker Compose 是否已安装
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Docker Compose 未安装，正在安装...${NC}"
    
    # 安装 Docker Compose
    apt-get update
    apt-get install -y docker-compose-plugin
    
    # 为了兼容性创建一个 docker-compose 命令的软链接
    ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    echo -e "${GREEN}Docker Compose 安装完成${NC}"
else
    echo -e "${GREEN}Docker Compose 已安装${NC}"
fi

# 创建项目目录
INSTALL_DIR="/opt/sqsmanager"
mkdir -p $INSTALL_DIR
cd $INSTALL_DIR

# 下载 docker-compose.yml 和 .env 文件
echo -e "${YELLOW}下载配置文件...${NC}"

curl -L "https://bitbucket.org/michaelcode/sqsmanager/downloads/docker-compose.yml" -o $INSTALL_DIR/docker-compose.yml || {
    echo -e "${RED}下载 docker-compose.yml 失败${NC}"
    exit 1
}

# 检查是否已有 .env 文件，如没有则创建
if [ ! -f "$INSTALL_DIR/.env" ]; then
    curl -L "https://bitbucket.org/michaelcode/sqsmanager/downloads/.env.example" -o $INSTALL_DIR/.env.example || {
        echo -e "${RED}下载 .env.example 失败${NC}"
        exit 1
    }
      
    cp $INSTALL_DIR/.env.example $INSTALL_DIR/.env
    
    # 生成随机 JWT 密钥
    JWT_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '\n' | tr -d '/' | tr -d '+' | tr -d '=')
    sed -i "s/changeThisToASecureRandomStringInProduction/$JWT_SECRET/g" $INSTALL_DIR/.env
    
    echo -e "${GREEN}.env 文件已创建，并配置了随机 JWT 密钥${NC}"
else
    echo -e "${GREEN}已存在 .env 文件，将保留现有配置${NC}"
fi

echo -e "${GREEN}配置文件已就绪${NC}"

# 设置防火墙规则（如果启用了 UFW）
if command -v ufw &> /dev/null && ufw status | grep -q "active"; then
    echo -e "${YELLOW}配置防火墙规则...${NC}"
    ufw allow 80/tcp
    ufw allow 443/tcp
    echo -e "${GREEN}防火墙规则已配置${NC}"
fi

# 询问用户操作
echo ""
echo -e "${YELLOW}请选择操作:${NC}"
echo "1) 安装/更新 SQSManager"
echo "2) 启动 SQSManager"
echo "3) 停止 SQSManager"
echo "4) 查看日志"
echo "5) 备份数据"
echo "6) 重置管理员密码"
echo "7) 退出"
read -p "请输入选项 [1-7]: " choice < /dev/tty

case $choice in
    1)
        echo -e "${YELLOW}正在拉取最新镜像...${NC}"
        docker-compose -f $INSTALL_DIR/docker-compose.yml pull
        
        echo -e "${YELLOW}正在启动 SQSManager...${NC}"
        docker-compose -f $INSTALL_DIR/docker-compose.yml up -d
        
        echo -e "${GREEN}SQSManager 已成功安装/更新${NC}"
        echo -e "${GREEN}可以通过浏览器访问: http://$(hostname -I | awk '{print $1}')${NC}"
        ;;
    2)
        echo -e "${YELLOW}正在启动 SQSManager...${NC}"
        docker-compose -f $INSTALL_DIR/docker-compose.yml up -d
        echo -e "${GREEN}SQSManager 已启动${NC}"
        echo -e "${GREEN}可以通过浏览器访问: http://$(hostname -I | awk '{print $1}')${NC}"
        ;;
    3)
        echo -e "${YELLOW}正在停止 SQSManager...${NC}"
        docker-compose -f $INSTALL_DIR/docker-compose.yml down
        echo -e "${GREEN}SQSManager 已停止${NC}"
        ;;
    4)
        echo -e "${YELLOW}显示日志 (按 Ctrl+C 退出)...${NC}"
        docker-compose -f $INSTALL_DIR/docker-compose.yml logs -f
        ;;
    5)
        # 创建备份目录
        BACKUP_DIR="$INSTALL_DIR/backups"
        mkdir -p $BACKUP_DIR
        BACKUP_FILE="$BACKUP_DIR/sqsmanager_backup_$(date +%Y%m%d_%H%M%S).tar.gz"
        
        echo -e "${YELLOW}创建数据备份...${NC}"
        # 确保数据卷存在
        VOLUME_NAME=$(docker volume ls | grep backend_data | awk '{print $2}')
        if [ -z "$VOLUME_NAME" ]; then
            echo -e "${RED}找不到数据卷，可能尚未创建${NC}"
            exit 1
        fi
        
        # 备份数据卷
        docker run --rm -v $VOLUME_NAME:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/data.tar.gz -C /data .
        
        # 备份环境文件
        cp $INSTALL_DIR/.env $BACKUP_DIR/.env
        
        # 打包所有备份
        tar -czf $BACKUP_FILE -C $BACKUP_DIR data.tar.gz .env
        rm $BACKUP_DIR/data.tar.gz $BACKUP_DIR/.env
        
        echo -e "${GREEN}备份已创建: $BACKUP_FILE${NC}"
        ;;
    6)
        echo -e "${YELLOW}重置管理员密码功能即将推出...${NC}"
        echo -e "${GREEN}目前请通过应用内的用户管理功能重置密码${NC}"
        ;;
    7)
        echo -e "${GREEN}感谢使用 SQSManager 安装工具${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}无效的选项${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}    SQSManager 安装管理工具已完成所选操作    ${NC}"
echo -e "${GREEN}=====================================================${NC}"