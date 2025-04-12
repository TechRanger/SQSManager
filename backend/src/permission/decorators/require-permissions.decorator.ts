import { SetMetadata } from '@nestjs/common';
import { PermissionName } from '../entities/permission.entity';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: PermissionName[]) => SetMetadata(PERMISSIONS_KEY, permissions); 