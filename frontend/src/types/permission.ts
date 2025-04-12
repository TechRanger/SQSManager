export interface Permission {
    id: number;
    name: string;
    description: string | null;
}

// 定义系统中所有权限，使用字符串字面量类型
export type PermissionName = 
    | 'deployment:manage'      // 部署管理
    | 'server:view_all'        // 查看所有服务器
    | 'server:view_details'    // 查看服务器详情
    | 'server:edit_config'     // 编辑服务器配置
    | 'server:delete'          // 删除服务器
    | 'server:control'         // 控制服务器启动/停止
    | 'server:rcon'            // 使用RCON控制台
    | 'server:manage_bans_web' // 管理Ban列表(web)
    | 'server:manage_admins_web' // 管理管理员(web)
    | 'user:view'              // 查看用户
    | 'user:create'            // 创建用户
    | 'user:delete'            // 删除用户
    | 'user:assign_role'       // 分配角色
    | 'role:view'              // 查看角色
    | 'role:create'            // 创建角色
    | 'role:delete'            // 删除角色
    | 'role:assign_permissions' // 分配权限
    | 'game_session:view'      // 查看对局管理
    | 'game_session:manage_players'; // 管理玩家(踢出/封禁) 