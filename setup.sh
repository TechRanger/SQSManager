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
BITBUCKET_URL="https://bitbucket.org/sqsm/sqsmanager/downloads"

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
        log_warn "Docker 未安装，正在安装 (使用清华镜像源)..."

        # 1. 移除旧版本 (来自清华文档)
        log_info "移除旧的 Docker 相关软件包（如果存在）..."
        for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do
            apt-get remove -y $pkg > /dev/null 2>&1 || log_warn "移除 $pkg 时出错或未找到 $pkg"
        done

        # 2. 添加 Docker 官方 GPG 密钥 (优先尝试官方源，失败则尝试阿里云)
        log_info "添加 Docker GPG 密钥..."
        install -m 0755 -d /etc/apt/keyrings
        # 清理可能存在的旧密钥文件
        rm -f /etc/apt/keyrings/docker.gpg
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        if [ $? -ne 0 ] || [ ! -s /etc/apt/keyrings/docker.gpg ]; then
            log_error "从官方源下载或处理 Docker GPG 密钥失败。请检查网络连接。"
            log_warn "尝试从备用源下载 GPG 密钥 (aliyun)..."
            curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            if [ $? -ne 0 ] || [ ! -s /etc/apt/keyrings/docker.gpg ]; then
                 log_error "从备用源下载 GPG 密钥也失败了。请手动检查网络和 GPG 环境。"
                 return 1 # 退出函数
            fi
            log_info "已成功从备用源 (aliyun) 获取 GPG 密钥。"
        fi
        chmod a+r /etc/apt/keyrings/docker.gpg

        # 3. 添加 Docker 软件源 (使用清华镜像)
        log_info "添加 Docker APT 软件源 (使用清华镜像)..."
        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/ubuntu \
          $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

        # 4. 安装 Docker CE (包含 compose plugin)
        log_info "更新软件包列表并安装 Docker CE..."
        apt-get update
        # 添加重试逻辑以应对可能的瞬时网络问题
        INSTALL_CMD="apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"
        if ! $INSTALL_CMD; then
            log_warn "首次安装 Docker CE 失败，等待5秒后重试..."
            sleep 5
            apt-get update # 再次更新列表以防万一
            if ! $INSTALL_CMD; then
                log_error "安装 Docker CE 软件包失败。请检查 APT 源和网络连接。"
                return 1 # 退出函数
            fi
        fi

        # 5. 启动 Docker 服务
        log_info "启动 Docker 服务..."
        systemctl enable docker
        systemctl start docker
        # 检查服务状态
        if ! systemctl is-active --quiet docker; then
            log_error "Docker 服务未能成功启动。请检查 'systemctl status docker' 和 'journalctl -xeu docker.service' 获取详细信息。"
            return 1
        fi

        log_info "Docker 安装完成 (使用清华镜像)"
    else
        log_info "Docker 已安装"
    fi
    return 0 # 成功
}

# 安装/检查 Docker Compose
install_docker_compose() {
    # 检查 Docker Compose 命令是否可用 (优先 V2 plugin)
    if command -v docker &> /dev/null && docker compose version &>/dev/null; then
        log_info "Docker Compose V2 (plugin) 已检测到"
        COMPOSE_CMD="docker compose"
        # 确保兼容性软链接存在 (如果需要旧脚本)
        if [ ! -x /usr/local/bin/docker-compose ]; then
             # V2 plugin 通常安装到 /usr/libexec/docker/cli-plugins/docker-compose
             if [ -x /usr/libexec/docker/cli-plugins/docker-compose ]; then
                 ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose || log_warn "创建 docker-compose 兼容性链接失败"
                 chmod +x /usr/local/bin/docker-compose || log_warn "设置 docker-compose 兼容性链接权限失败"
             else
                 log_warn "未找到 docker compose 插件执行文件，无法创建兼容链接。"
             fi
        fi
    # 检查旧的 V1 standalone 版本
    elif command -v docker-compose &> /dev/null; then
         log_info "Docker Compose V1 (standalone) 已检测到"
         COMPOSE_CMD="docker-compose"
    # 如果两者都找不到，尝试安装 V2 plugin (可能 install_docker 失败了)
    else
        log_error "未检测到 Docker Compose 命令 (V1 或 V2 plugin)。"
        if command -v apt-get &> /dev/null; then
             log_warn "尝试安装 docker-compose-plugin..."
             apt-get update
             apt-get install -y docker-compose-plugin
             if docker compose version &>/dev/null; then
                 log_info "Docker Compose V2 (plugin) 安装成功"
                 COMPOSE_CMD="docker compose"
                 if [ ! -x /usr/local/bin/docker-compose ]; then
                     if [ -x /usr/libexec/docker/cli-plugins/docker-compose ]; then
                         ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose || log_warn "创建 docker-compose 兼容性链接失败"
                         chmod +x /usr/local/bin/docker-compose || log_warn "设置 docker-compose 兼容性链接权限失败"
                     else
                        log_warn "未找到 docker compose 插件执行文件，无法创建兼容链接。"
                     fi
                 fi
             else
                 log_error "安装 docker-compose-plugin 后仍无法检测到。请检查 Docker 安装。"
                 return 1
             fi
        else
            log_error "系统非 Debian/Ubuntu，无法自动安装 docker-compose-plugin。"
            return 1
        fi
    fi

    # 检测并报告版本
    log_warn "检测 Docker Compose 版本..."
    # 使用 eval 来执行包含空格的命令
    COMPOSE_VERSION=$(eval $COMPOSE_CMD version 2>/dev/null)
    log_info "检测到版本: ${COMPOSE_VERSION:-未知或错误}"

    return 0
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
    # 检查是否有服务正在运行
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
    # 注意：卷名在 docker-compose.yml 中定义为 backend_data，Compose 会自动添加项目名前缀
    PROJECT_NAME=$(basename "$INSTALL_DIR") # 假设项目名是安装目录名
    VOLUME_NAME="${PROJECT_NAME}_backend_data"
    
    # 检查实际的卷名
    ACTUAL_VOLUME_NAME=$(docker volume ls --format '{{.Name}}' | grep "backend_data$" | head -n 1)
    
    if [ -z "$ACTUAL_VOLUME_NAME" ]; then
        log_warn "未找到数据卷，尝试启动应用以创建卷..."
        $COMPOSE_CMD -f "$INSTALL_DIR/docker-compose.yml" up -d backend # 只启动后端以创建卷
        sleep 10 # 等待卷创建
        $COMPOSE_CMD -f "$INSTALL_DIR/docker-compose.yml" stop backend # 停止后端
        ACTUAL_VOLUME_NAME=$(docker volume ls --format '{{.Name}}' | grep "backend_data$" | head -n 1)
        if [ -z "$ACTUAL_VOLUME_NAME" ]; then
            log_error "找不到数据卷 (${PROJECT_NAME}_backend_data 或类似名称)，无法备份。"
            return 1
        fi
    fi
    
    log_info "找到数据卷: $ACTUAL_VOLUME_NAME"
    
    # 临时文件名
    TEMP_DATA_BACKUP="$BACKUP_DIR/data_$(date +%s).tar.gz"
    TEMP_ENV_BACKUP="$BACKUP_DIR/.env_$(date +%s)"
    
    # 备份数据卷内容
    log_info "正在备份卷 $ACTUAL_VOLUME_NAME 到 $TEMP_DATA_BACKUP ..."
    docker run --rm -v "$ACTUAL_VOLUME_NAME:/data" -v "$BACKUP_DIR:/backup" alpine tar czf "/backup/$(basename $TEMP_DATA_BACKUP)" -C /data . || {
        log_error "备份数据卷时出错。"
        rm -f "$TEMP_DATA_BACKUP" # 清理临时文件
        return 1
    }
    
    # 备份环境文件
    if [ -f "$INSTALL_DIR/.env" ]; then
        log_info "正在备份 .env 文件..."
        cp "$INSTALL_DIR/.env" "$TEMP_ENV_BACKUP"
    else
        log_warn ".env 文件不存在，备份中将不包含此文件。"
        TEMP_ENV_BACKUP=""
    fi
    
    # 打包所有备份
    log_info "正在打包最终备份文件 $BACKUP_FILE ..."
    if [ -n "$TEMP_ENV_BACKUP" ] && [ -f "$TEMP_ENV_BACKUP" ]; then
        tar -czf "$BACKUP_FILE" -C "$BACKUP_DIR" "$(basename $TEMP_DATA_BACKUP)" "$(basename $TEMP_ENV_BACKUP)" || {
            log_error "创建最终备份压缩包失败。"
            rm -f "$TEMP_DATA_BACKUP" "$TEMP_ENV_BACKUP"
            return 1
        }
        rm -f "$TEMP_DATA_BACKUP" "$TEMP_ENV_BACKUP" # 清理临时文件
    elif [ -f "$TEMP_DATA_BACKUP" ]; then
         tar -czf "$BACKUP_FILE" -C "$BACKUP_DIR" "$(basename $TEMP_DATA_BACKUP)" || {
             log_error "创建最终备份压缩包失败 (仅含数据)。"
             rm -f "$TEMP_DATA_BACKUP"
             return 1
         }
         rm -f "$TEMP_DATA_BACKUP"
    else
        log_error "没有找到可打包的备份文件。"
        return 1
    fi
    
    log_info "备份已创建: $BACKUP_FILE"
    return 0
}

# 重置密码
reset_password() {
    log_warn "重置管理员密码功能尚未实现。"
    log_info "目前请通过应用内的用户管理功能或联系支持重置密码。"
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
    
    # --- BEGIN: 配置 sysctl for ICMP ping range --- 
    log_warn "配置内核参数以允许 ICMP ping..."
    # Check if the line already exists
    if grep -q "^net.ipv4.ping_group_range" /etc/sysctl.conf; then
        # Line exists, modify it
        sed -i 's/^net\.ipv4\.ping_group_range.*/net.ipv4.ping_group_range = 0 65535/' /etc/sysctl.conf
        log_info "已修改 /etc/sysctl.conf 中的 net.ipv4.ping_group_range 设置"
    else
        # Line does not exist, append it
        echo "net.ipv4.ping_group_range = 0 65535" | tee -a /etc/sysctl.conf > /dev/null
        log_info "已将 net.ipv4.ping_group_range 设置追加到 /etc/sysctl.conf"
    fi
    # Apply the changes immediately
    log_info "应用 sysctl 更改..."
    if sysctl -p; then
        log_info "Sysctl 更改已成功应用。"
    else
        log_error "应用 sysctl 更改失败。请检查 /etc/sysctl.conf 文件。"
        # 这里可以选择退出脚本或仅警告
        # exit 1 
    fi
    # --- END: 配置 sysctl for ICMP ping range --- 
    
    # 安装/检查 Docker
    install_docker || exit 1 # 如果Docker安装失败则退出
    
    # 安装/检查 Docker Compose
    install_docker_compose || exit 1 # 如果Compose检查/安装失败则退出
    
    # 设置用户和目录
    setup_user_and_dirs || exit 1
    
    # 下载配置文件 (如果需要)
    download_config_files || exit 1
    
    # --- 菜单逻辑 --- 
    echo ""
    log_warn "请选择操作:"
    echo "1) 安装/更新 SQSManager"
    echo "2) 启动 SQSManager"
    echo "3) 停止 SQSManager"
    echo "4) 查看日志"
    echo "5) 备份数据"
    echo "6) 重置管理员密码 (未实现)"
    echo "7) 退出"
    
    # 尝试从 /dev/tty 读取，避免被管道输入影响
    read -p "请输入选项 [1-7]: " choice < /dev/tty
    
    case $choice in
        1) install_sqsmanager ;;
        2) start_sqsmanager ;;
        3) stop_sqsmanager ;;
        4) view_logs ;;
        5) backup_data ;;
        6) reset_password ;;
        7) 
            log_info "感谢使用 SQSManager 安装管理工具"
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
main "$@"