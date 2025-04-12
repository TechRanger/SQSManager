import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission, PermissionName } from '../permission/entities/permission.entity';
import { Role } from '../role/entities/role.entity';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service'; // Assuming create method exists
import { CreateUserDto } from '../user/dto/create-user.dto';

@Injectable()
export class SeedService implements OnModuleInit {
    private readonly logger = new Logger(SeedService.name);

    constructor(
        @InjectRepository(Permission)
        private permissionRepository: Repository<Permission>,
        @InjectRepository(Role)
        private roleRepository: Repository<Role>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private userService: UserService, // Inject UserService
    ) {}

    async onModuleInit() {
        await this.seedPermissions();
        await this.seedRolesAndAssignPermissions();
        await this.seedInitialAdminUser(); // Moved admin user creation here
    }

    async seedPermissions() {
        this.logger.log('开始检查并填充权限...');
        const definedPermissions: PermissionName[] = [
            'deployment:manage',
            'server:view_all', 'server:view_details', 'server:edit_config', 'server:delete',
            'server:control', 'server:rcon', 'server:manage_bans_web',
            'server:manage_admins_web', // Added missing admin management permission
            'server:manage_plugins', // 添加插件管理权限
            'game_session:view', // 添加对局管理查看权限
            'user:view', 'user:create', 'user:delete', 'user:assign_role',
            'role:view', 'role:create', 'role:delete', 'role:assign_permissions'
        ]; // Add the missing closing bracket

        const existingPermissions = await this.permissionRepository.find();
        const existingPermissionNames = new Set(existingPermissions.map(p => p.name));

        for (const permission of definedPermissions) {
            if (!existingPermissionNames.has(permission)) {
                const newPermission = this.permissionRepository.create({ name: permission });
                await this.permissionRepository.save(newPermission);
                this.logger.log(`权限 ${permission} 已创建`);
            }
        }
    }

    async seedRolesAndAssignPermissions() {
        this.logger.log('开始检查并填充 Owner 角色及其权限...');
        let ownerRole = await this.roleRepository.findOne({ where: { name: 'Owner' }, relations: ['permissions'] });

        if (!ownerRole) {
            this.logger.log('未找到 Owner 角色，正在创建...');
            ownerRole = this.roleRepository.create({ name: 'Owner', description: '系统管理员，拥有所有权限' });
        } else {
            this.logger.log('找到现有 Owner 角色。');
        }

        // 获取所有已定义的权限
        const allPermissions = await this.permissionRepository.find();
        if (!allPermissions || allPermissions.length === 0) {
            this.logger.warn('数据库中未找到任何权限记录，无法为 Owner 分配权限！');
            return; // Or throw an error?
        }

        const currentOwnerPermissionNames = new Set(ownerRole.permissions?.map(p => p.name) ?? []);
        const allPermissionNames = new Set(allPermissions.map(p => p.name));

        // 检查是否所有权限都已分配，避免不必要的数据库写入
        let needsUpdate = false;
        if (currentOwnerPermissionNames.size !== allPermissionNames.size) {
            needsUpdate = true;
        } else {
            for (const pName of allPermissionNames) {
                if (!currentOwnerPermissionNames.has(pName)) {
                    needsUpdate = true;
                    break;
                }
            }
        }

        if (needsUpdate) {
            this.logger.log('正在更新 Owner 角色的权限...');
            ownerRole.permissions = allPermissions; // 将所有权限分配给 Owner 角色
            await this.roleRepository.save(ownerRole);
            this.logger.log('Owner 角色权限已更新。');
        } else {
            this.logger.log('Owner 角色已拥有所有权限，无需更新。');
        }

        // 未来可以考虑创建其他默认角色（如 Operator）并分配特定权限
    }

    async seedInitialAdminUser() {
        this.logger.log('开始检查并填充初始管理员用户...');
        const userCount = await this.userRepository.count();

        // Only seed if no users exist
        if (userCount === 0) {
            const initialUsername = process.env.INITIAL_ADMIN_USERNAME || 'admin';
            const initialPassword = process.env.INITIAL_ADMIN_PASSWORD || 'password';
            this.logger.log(`数据库为空，准备创建初始管理员: ${initialUsername}`);

            // Find the Owner role (should exist after seedRolesAndAssignPermissions)
            const ownerRole = await this.roleRepository.findOne({ where: { name: 'Owner' } });

            if (!ownerRole) {
                this.logger.error('无法创建初始管理员：未找到 "Owner" 角色！请确保 seedRolesAndAssignPermissions 先运行。');
                return;
            }
            this.logger.log(`找到 "Owner" 角色 (ID: ${ownerRole.id}) 用于分配给初始管理员。`);

            // Create the new user entity and explicitly assign the role object
            const adminUser = this.userRepository.create({
                username: initialUsername,
                password: initialPassword, // Password will be hashed by @BeforeInsert hook
                role: ownerRole, // Assign the actual Role entity
            });

            this.logger.log(`准备保存初始管理员 ${adminUser.username}，分配的角色: ${adminUser.role.name}`);

            try {
                const savedAdmin = await this.userRepository.save(adminUser);
                this.logger.log(`初始管理员 ${savedAdmin.username} (ID: ${savedAdmin.id}) 已成功创建并分配了 ${savedAdmin.role.name} 角色。`);
            } catch (error) {
                this.logger.error(`创建初始管理员失败: ${error.message}`, error.stack);
            }
        } else {
            this.logger.log(`数据库中已存在用户 (${userCount} 个)，跳过创建初始管理员。`);
        }
    }
}