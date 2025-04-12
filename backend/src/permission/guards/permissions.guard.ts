import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionName } from '../entities/permission.entity';
import { UserService } from '../../user/user.service';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private reflector: Reflector,
    private userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      this.logger.verbose('Route is public, skipping permission check.');
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<PermissionName[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    this.logger.verbose(`Required permissions for route: ${requiredPermissions?.join(', ') ?? 'None'}`);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      this.logger.verbose('No specific permissions required, allowing access.');
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    this.logger.verbose(`User payload from JWT: ${JSON.stringify(user)}`);

    if (!user || !user.sub) {
      this.logger.warn('User information (sub/userId) not found in JWT payload.');
      throw new ForbiddenException('User information not available for permission check.');
    }

    const userId = user.sub;
    this.logger.verbose(`Fetching full details for user ID: ${userId}`);
    const userDetails = await this.userService.findOneByIdWithRelations(userId, { role: { permissions: true } });

    if (userDetails) {
      this.logger.verbose(`Fetched user details: ${JSON.stringify({ id: userDetails.id, username: userDetails.username, role: userDetails.role?.name })}`);
      const userPermissionNames = userDetails.role?.permissions?.map(p => p.name) ?? [];
      this.logger.verbose(`User permissions found: ${userPermissionNames.join(', ')}`);
    } else {
      this.logger.warn(`Could not find user details for ID: ${userId}`);
      throw new ForbiddenException('Could not retrieve user details for permission check.');
    }

    if (!userDetails.role || !userDetails.role.permissions) {
      this.logger.warn(`User ID ${userId} has no role or role has no permissions assigned.`);
      throw new ForbiddenException('Could not retrieve user permissions (no role/permissions found).');
    }

    const userPermissions = userDetails.role.permissions.map(p => p.name);

    // 添加特殊处理: 如果用户拥有user:manage权限,视为拥有所有user:开头的权限
    const hasUserManagePermission = userPermissions.includes('user:manage');

    const hasAllPermissions = requiredPermissions.every(permission => 
      userPermissions.includes(permission) || 
      (hasUserManagePermission && permission.startsWith('user:'))
    );

    this.logger.verbose(`Permission check result for user ${userId}: ${hasAllPermissions}`);

    if (!hasAllPermissions) {
      // 排除已有的权限和因为user:manage而自动获得的权限
      const missingPermissions = requiredPermissions.filter(p => 
        !userPermissions.includes(p) && 
        !(hasUserManagePermission && p.startsWith('user:'))
      );
      this.logger.warn(`User ${userId} denied access. Missing permissions: ${missingPermissions.join(', ')}`);
      throw new ForbiddenException(`Insufficient permissions. Missing: ${missingPermissions.join(', ')}`);
    }

    this.logger.verbose(`User ${userId} granted access.`);
    return true;
  }
} 