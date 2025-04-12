import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { RequirePermissions } from '../permission/decorators/require-permissions.decorator';
import { Role } from './entities/role.entity';

@Controller('api/roles')
export class RoleController {
    constructor(private readonly roleService: RoleService) {}

    @Get()
    @RequirePermissions('role:view')
    async findAll(): Promise<Role[]> {
        return this.roleService.findAll();
    }

    @Get(':id')
    @RequirePermissions('role:view')
    async findOne(@Param('id', ParseIntPipe) id: number): Promise<Role> {
        return this.roleService.findOneById(id);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @RequirePermissions('role:create')
    async create(@Body() createRoleDto: CreateRoleDto): Promise<Role> {
        return this.roleService.createRole(createRoleDto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequirePermissions('role:delete')
    async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.roleService.deleteRole(id);
    }

    @Put(':id/permissions')
    @HttpCode(HttpStatus.OK)
    @RequirePermissions('role:assign_permissions')
    async assignPermissions(
        @Param('id', ParseIntPipe) id: number,
        @Body() assignPermissionsDto: AssignPermissionsDto,
    ): Promise<Role> {
        return this.roleService.assignPermissions(id, assignPermissionsDto.permissionIds);
    }
} 