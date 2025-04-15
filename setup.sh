#!/bin/bash
set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 基本配置
INSTALL_DIR="/opt/sqsmanager"
SQS_USER="sqsmanager"
SQS_SERVERS_DIR="/home/$SQS_USER/servers"
BITBUCKET_URL="https://bitbucket.org/michaelcode/sqsmanager/downloads"

# 通用函数
log_info() {
    echo -e "${GREEN}$1${NC}"
}

log_warn() {
    echo -e "${YELLOW}$1${NC}"
}

log_error() {
    echo -e "${RED}$1${NC}"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用 root 权限运行此脚本"
        log_warn "请使用: sudo bash setup.sh"
        exit 1
    fi
}

download_file() {
    local url="$1"
    local output_file="$2"
    local error_msg="$3"
    
    log_warn "下载 $(basename $output_file)..."
    curl -L "$url" -o "$output_file" || {
        log_error "$error_msg"
        return 1
    }
    log_info "$(basename $output_file) 已下载"
    return 0
}

# 安装依赖
install_dependencies() {
    log_warn "安装必要的软件包..."

    # --- BEGIN APT Mirror Configuration ---
    # 检查是否为 Ubuntu 系统，如果不是则跳过镜像配置
    if command -v lsb_release >/dev/null && lsb_release -a | grep -q 'Ubuntu'; then
        # Get Ubuntu codename
        UBUNTU_CODENAME=$(lsb_release -cs)
        if [ -z "$UBUNTU_CODENAME" ]; then
            log_error "无法获取 Ubuntu codename，跳过 APT 镜像配置。"
        else
            # Backup original sources.list
            if [ -f /etc/apt/sources.list ]; then
                 cp /etc/apt/sources.list /etc/apt/sources.list.bak.$(date +%F_%T)
                 log_info "Backed up /etc/apt/sources.list to /etc/apt/sources.list.bak.*"
            fi

            # Create new sources.list using Tsinghua mirror
            log_warn "正在为 Ubuntu $UBUNTU_CODENAME 配置清华大学 APT 镜像源..."
            cat <<EOF > /etc/apt/sources.list
# 清华大学镜像源
deb https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ ${UBUNTU_CODENAME} main restricted universe multiverse
# deb-src https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ ${UBUNTU_CODENAME} main restricted universe multiverse
deb https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ ${UBUNTU_CODENAME}-updates main restricted universe multiverse
# deb-src https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ ${UBUNTU_CODENAME}-updates main restricted universe multiverse
deb https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ ${UBUNTU_CODENAME}-backports main restricted universe multiverse
# deb-src https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ ${UBUNTU_CODENAME}-backports main restricted universe multiverse

# 官方安全更新源 (保持不变，不使用镜像)
deb http://security.ubuntu.com/ubuntu/ ${UBUNTU_CODENAME}-security main restricted universe multiverse
# deb-src http://security.ubuntu.com/ubuntu/ ${UBUNTU_CODENAME}-security main restricted universe multiverse
EOF
            log_info "APT 源已配置为使用清华大学镜像。"
            log_warn "正在使用清华镜像更新软件包列表..."
        fi
    else
         log_warn "非 Ubuntu 系统或无法检测到 Ubuntu，跳过 APT 镜像配置。"
    fi
    # --- END APT Mirror Configuration ---

    apt-get update
    apt-get install -y apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release
}

# 安装 Docker
install_docker() {
    # 检查 Docker 是否已安装
    if ! command -v docker &> /dev/null; then
        log_warn "Docker 未安装，正在安装..."
        
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
        
        log_info "Docker 安装完成"
    else
        log_info "Docker 已安装"
    fi
}

# 安装 Docker Compose
install_docker_compose() {
    # 检查 Docker Compose 是否已安装
    if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
        log_warn "Docker Compose 未安装，正在安装..."
        
        # 安装 Docker Compose
        apt-get update
        apt-get install -y docker-compose-plugin
        
        # 为了兼容性创建一个 docker-compose 命令的软链接
        ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
        
        log_info "Docker Compose 安装完成"
    else
        log_info "Docker Compose 已安装"
    fi
    
    # 检测Docker Compose版本
    log_warn "检测Docker Compose版本..."
    COMPOSE_VERSION=$(docker-compose --version 2>/dev/null || docker compose version 2>/dev/null)
    log_info "检测到: ${COMPOSE_VERSION}"
    
    # 确定使用哪种Docker Compose命令格式
    if docker compose version &>/dev/null; then
        log_info "使用Docker Compose V2格式命令"
        COMPOSE_CMD="docker compose"
    else
        log_info "使用Docker Compose V1格式命令"
        COMPOSE_CMD="docker-compose"
    fi
}

# 设置用户和目录
setup_user_and_dirs() {
    log_warn "检查/创建 SQSManager 用户和目录..."
    
    # 检查用户是否存在，不存在则创建
    if ! id -u $SQS_USER &>/dev/null; then
        log_warn "创建用户 $SQS_USER..."
        useradd -m -s /bin/bash $SQS_USER || {
            log_error "创建用户 $SQS_USER 失败"
            return 1
        }
        log_info "用户 $SQS_USER 已创建"
    else
        log_info "用户 $SQS_USER 已存在"
    fi
    
    # 创建服务器目录
    log_warn "创建服务器目录 $SQS_SERVERS_DIR..."
    mkdir -p $SQS_SERVERS_DIR
    
    # 设置目录权限
    log_warn "设置目录 $SQS_SERVERS_DIR 权限..."
    chown 1000:1000 $SQS_SERVERS_DIR
    chmod 755 $SQS_SERVERS_DIR
    
    # 同时设置父目录权限
    PARENT_DIR=$(dirname "$SQS_SERVERS_DIR")
    log_warn "设置父目录 $PARENT_DIR 权限..."
    chown 1000:1000 $PARENT_DIR
    chmod 755 $PARENT_DIR
    
    log_info "用户和目录设置完成"
    return 0
}

# 下载配置文件
download_config_files() {
    mkdir -p $INSTALL_DIR
    cd $INSTALL_DIR
    
    log_warn "下载配置文件..."
    
    # 下载 docker-compose.yml
    download_file "$BITBUCKET_URL/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml" "下载 docker-compose.yml 失败" || return 1
    
    # 下载 nginx-host.conf
    download_file "$BITBUCKET_URL/nginx-host.conf" "$INSTALL_DIR/nginx-host.conf" "下载 nginx-host.conf 失败" || return 1
    
    # 设置文件权限
    log_warn "设置文件权限..."
    chmod 644 $INSTALL_DIR/docker-compose.yml $INSTALL_DIR/nginx-host.conf
    
    # 验证配置文件
    log_warn "验证配置文件..."
    if [ ! -s "$INSTALL_DIR/docker-compose.yml" ]; then
        log_error "docker-compose.yml 文件为空或不存在"
        return 1
    fi
    
    # 检查配置文件格式
    $COMPOSE_CMD -f "$INSTALL_DIR/docker-compose.yml" config &>/dev/null || {
        log_error "docker-compose.yml 文件格式无效"
        return 1
    }
    
    log_info "配置文件验证通过"
    
    # 检查.env文件
    if [ ! -f "$INSTALL_DIR/.env" ]; then
        download_file "$BITBUCKET_URL/.env.example" "$INSTALL_DIR/.env.example" "下载 .env.example 失败" || return 1
        
        cp $INSTALL_DIR/.env.example $INSTALL_DIR/.env
        
        # 生成随机 JWT 密钥
        JWT_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '\n' | tr -d '/' | tr -d '+' | tr -d '=')
        sed -i "s/changeThisToASecureRandomStringInProduction/$JWT_SECRET/g" $INSTALL_DIR/.env
        
        log_info ".env 文件已创建，并配置了随机 JWT 密钥"
    else
        log_info "已存在 .env 文件，将保留现有配置"
    fi
    
    return 0
}

# 安装/更新SQSManager
install_sqsmanager() {
    cd $INSTALL_DIR
    
    log_warn "检查当前服务状态..."
    if $COMPOSE_CMD -f "$INSTALL_DIR/docker-compose.yml" ps -q 2>/dev/null | grep -q .; then
        log_warn "检测到正在运行的服务，正在停止..."
        $COMPOSE_CMD -f "$INSTALL_DIR/docker-compose.yml" down || log_warn "停止服务失败，可能服务已停止。继续执行..."
    else
        log_info "服务未运行或已停止。"
    fi
    
    log_warn "正在拉取最新镜像..."
    $COMPOSE_CMD -f "$INSTALL_DIR/docker-compose.yml" pull
    
    log_warn "正在启动 SQSManager..."
    $COMPOSE_CMD -f "$INSTALL_DIR/docker-compose.yml" up -d
    
    log_info "SQSManager 已成功安装/更新"
    log_info "可以通过浏览器访问: http://$(hostname -I | awk '{print $1}')"
}

# 启动SQSManager
start_sqsmanager() {
    cd $INSTALL_DIR
    log_warn "正在启动 SQSManager..."
    $COMPOSE_CMD -f "$INSTALL_DIR/docker-compose.yml" up -d
    log_info "SQSManager 已启动"
    log_info "可以通过浏览器访问: http://$(hostname -I | awk '{print $1}')"
}

# 停止SQSManager
stop_sqsmanager() {
    cd $INSTALL_DIR
    log_warn "正在停止 SQSManager..."
    $COMPOSE_CMD -f "$INSTALL_DIR/docker-compose.yml" down
    log_info "SQSManager 已停止"
}

# 查看日志
view_logs() {
    cd $INSTALL_DIR
    log_warn "显示日志 (按 Ctrl+C 退出)..."
    $COMPOSE_CMD -f "$INSTALL_DIR/docker-compose.yml" logs -f
}

# 备份数据
backup_data() {
    cd $INSTALL_DIR
    
    # 创建备份目录
    BACKUP_DIR="$INSTALL_DIR/backups"
    mkdir -p $BACKUP_DIR
    BACKUP_FILE="$BACKUP_DIR/sqsmanager_backup_$(date +%Y%m%d_%H%M%S).tar.gz"
    
    log_warn "创建数据备份..."
    
    # 确保数据卷存在
    VOLUME_NAME=$(docker volume ls | grep sqsmanager_backend_data | awk '{print $2}')
    if [ -z "$VOLUME_NAME" ]; then
        log_warn "尝试启动应用以创建卷..."
        $COMPOSE_CMD -f "$INSTALL_DIR/docker-compose.yml" up -d
        sleep 5
        $COMPOSE_CMD -f "$INSTALL_DIR/docker-compose.yml" down
        VOLUME_NAME=$(docker volume ls | grep sqsmanager_backend_data | awk '{print $2}')
        if [ -z "$VOLUME_NAME" ]; then
            log_error "找不到数据卷，可能尚未创建"
            return 1
        fi
    fi
    
    # 备份数据卷
    docker run --rm -v $VOLUME_NAME:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/data.tar.gz -C /data .
    
    # 备份环境文件
    cp $INSTALL_DIR/.env $BACKUP_DIR/.env
    
    # 打包所有备份
    tar -czf $BACKUP_FILE -C $BACKUP_DIR data.tar.gz .env
    rm $BACKUP_DIR/data.tar.gz $BACKUP_DIR/.env
    
    log_info "备份已创建: $BACKUP_FILE"
}

# 重置密码
reset_password() {
    log_warn "重置管理员密码功能即将推出..."
    log_info "目前请通过应用内的用户管理功能重置密码"
}

# 主函数
main() {
    # 欢迎信息
    log_info "====================================================="
    log_info "    SQSManager 安装/管理工具 (Ubuntu版)    "
    log_info "====================================================="
    echo ""
    
    # 检查root权限
    check_root
    
    # 检查系统类型
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [ "$ID" != "ubuntu" ]; then
            log_warn "注意: 当前系统不是 Ubuntu，某些功能可能不正常工作"
        else
            log_info "检测到 Ubuntu $VERSION_ID 系统"
        fi
    else
        log_warn "无法确定操作系统类型，继续执行..."
    fi
    
    # 安装依赖
    install_dependencies
    
    # 安装Docker
    install_docker
    
    # 安装Docker Compose
    install_docker_compose
    
    # 设置用户和目录
    setup_user_and_dirs
    
    # 下载配置文件
    download_config_files
    
    # 询问用户操作
    echo ""
    log_warn "请选择操作:"
    echo "1) 安装/更新 SQSManager"
    echo "2) 启动 SQSManager"
    echo "3) 停止 SQSManager"
    echo "4) 查看日志"
    echo "5) 备份数据"
    echo "6) 重置管理员密码"
    echo "7) 退出"
    read -p "请输入选项 [1-7]: " choice < /dev/tty
    
    case $choice in
        1) install_sqsmanager ;;
        2) start_sqsmanager ;;
        3) stop_sqsmanager ;;
        4) view_logs ;;
        5) backup_data ;;
        6) reset_password ;;
        7) 
            log_info "感谢使用 SQSManager 安装工具"
            exit 0
            ;;
        *)
            log_error "无效的选项"
            exit 1
            ;;
    esac
    
    echo ""
    log_info "====================================================="
    log_info "    SQSManager 安装管理工具已完成所选操作    "
    log_info "====================================================="
}

# 执行主函数
main