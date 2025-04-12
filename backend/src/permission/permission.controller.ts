import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { Permission } from './entities/permission.entity';
import { RequirePermissions } from './decorators/require-permissions.decorator';

@Controller('api/permissions')
export class PermissionController {
    constructor(private readonly permissionService: PermissionService) {}

    @Get()
    @RequirePermissions('role:view', 'user:view')
    async findAll(): Promise<Permission[]> {
        return this.permissionService.findAll();
    }
} 