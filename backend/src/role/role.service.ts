// backend/src/role/role.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from '../permission/entities/permission.entity';
import { CreateRoleDto } from './dto/create-role.dto';
// Import User entity if we implement the check for assigned users
// import { User } from '../user/entities/user.entity';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    // Inject UserRepository if needed for the check
    // @InjectRepository(User)
    // private userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.roleRepository.find({ relations: ['permissions'] });
  }

  async findOneById(id: number): Promise<Role> { // Changed return type to Role (non-nullable)
    const role = await this.roleRepository.findOne({ where: { id }, relations: ['permissions'] });
     if (!role) {
       throw new NotFoundException(`ID 为 ${id} 的角色未找到`);
     }
    return role;
  }

  async createRole(createRoleDto: CreateRoleDto): Promise<Role> {
    const { name, description, permissionIds } = createRoleDto;

    const existingRole = await this.roleRepository.findOne({ where: { name } });
    if (existingRole) {
      throw new ConflictException(`名称为 "${name}" 的角色已存在`);
    }
    if (name === 'Owner') {
      throw new ForbiddenException('无法创建名为 "Owner" 的角色，这是系统保留角色。');
    }

    let permissions: Permission[] = [];
    if (permissionIds && permissionIds.length > 0) {
      permissions = await this.permissionRepository.findBy({
        id: In(permissionIds),
      });
      if (permissions.length !== permissionIds.length) {
        throw new BadRequestException('一个或多个提供的权限 ID 无效');
      }
    }

    const newRole = this.roleRepository.create({ name, description, permissions });
    return this.roleRepository.save(newRole);
  }

  async deleteRole(id: number): Promise<void> {
    const role = await this.findOneById(id);
    if (role.name === 'Owner') {
        throw new ForbiddenException('无法删除系统保留的 "Owner" 角色。');
    }

    // TODO: Check if users are assigned (requires UserModule dependency)
    // const usersWithRole = await this.userRepository.count({ where: { role: { id: id } } });
    // if (usersWithRole > 0) {
    //   throw new ConflictException(`无法删除角色 "${role.name}"，因为它当前已分配给 ${usersWithRole} 个用户。`);
    // }

    const result = await this.roleRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`尝试删除时未找到 ID 为 ${id} 的角色`);
    }
  }

  async assignPermissions(id: number, permissionIds: number[]): Promise<Role> {
    const role = await this.findOneById(id);
     if (role.name === 'Owner') {
        throw new ForbiddenException('无法修改 "Owner" 角色的权限。');
     }

    let permissions: Permission[] = [];
    if (permissionIds && permissionIds.length > 0) {
        permissions = await this.permissionRepository.findBy({
            id: In(permissionIds),
        });
        if (permissions.length !== permissionIds.length) {
            throw new BadRequestException('一个或多个提供的权限 ID 无效');
        }
    }

    role.permissions = permissions;
    return this.roleRepository.save(role);
  }
} 