import { Controller, Post, Body, Get, Delete, Param, ParseIntPipe, HttpCode, HttpStatus, Request, Put, ForbiddenException, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { RequirePermissions } from '../permission/decorators/require-permissions.decorator';
import { AssignRoleDto } from './dto/assign-role.dto';

// Define the expected structure of the user object in the request after JwtAuthGuard runs
interface AuthenticatedRequest extends Request {
    user?: {
        sub: number;
        username: string;
        // Potentially other fields from JWT payload like iat, exp
    };
}

// Define the structure for the profile response
interface UserProfile {
    id: number;
    username: string;
    role: string | null;
    permissions: string[];
}

@Controller('api/users')
export class UserController {
    constructor(private userService: UserService) {}

    // --- Get All Users ---
    @Get()
    @RequirePermissions('user:view')
    async findAll(): Promise<Omit<User, 'password' | 'hashPassword' | 'comparePassword' | 'role'>[]> {
        return this.userService.findAll();
    }

    // --- Get User Profile (Current logged-in user) ---
    @Get('profile')
    async getProfile(@Request() req: AuthenticatedRequest): Promise<UserProfile> {
        const userId = req.user?.sub;
        if (!userId) {
            throw new ForbiddenException('无法确定用户信息。');
        }

        const userWithRelations = await this.userService.findOneByIdWithRelations(userId, { role: { permissions: true } });

        if (!userWithRelations) {
            throw new ForbiddenException('无法找到用户信息。');
        }

        const permissions = userWithRelations.role?.permissions?.map(p => p.name) ?? [];
        const roleName = userWithRelations.role?.name ?? null;

        return {
            id: userWithRelations.id,
            username: userWithRelations.username,
            role: roleName,
            permissions: permissions,
        };
    }

    // --- Create User ---
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @RequirePermissions('user:create')
    async createUser(@Body() createUserDto: CreateUserDto): Promise<Omit<User, 'password' | 'hashPassword' | 'comparePassword'>> {
        const user = await this.userService.createUser(createUserDto);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, hashPassword, comparePassword, ...result } = user;
        return result;
    }

    // --- Delete User ---
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequirePermissions('user:delete')
    async deleteUser(@Param('id', ParseIntPipe) id: number, @Request() req): Promise<void> {
        const userId = req.user?.sub;
        if (!userId) {
             throw new ForbiddenException('无法确定当前用户信息。');
        }
        if (userId === id) {
            throw new ForbiddenException('无法删除您自己的账户。');
        }
        await this.userService.deleteUser(id);
    }

    // --- Change Own Password ---
    @Post('change-password')
    @HttpCode(HttpStatus.OK)
    async changePassword(
        @Request() req: any,
        @Body() changePasswordDto: ChangePasswordDto
    ): Promise<{ message: string }> {
        const userId = req.user?.sub;
        if (!userId) {
             throw new ForbiddenException('无法确定当前用户信息以修改密码。');
        }
        await this.userService.changePassword(
            userId,
            changePasswordDto.currentPassword,
            changePasswordDto.newPassword
        );
        return { message: '密码修改成功！' };
    }

    // --- Assign Role to User ---
    @Put(':id/assign-role')
    @HttpCode(HttpStatus.OK)
    @RequirePermissions('user:assign_role')
    async assignRole(
        @Param('id', ParseIntPipe) id: number,
        @Body() assignRoleDto: AssignRoleDto,
         @Request() req
    ): Promise<Omit<User, 'password' | 'hashPassword' | 'comparePassword'>> {
        const user = await this.userService.assignRole(id, assignRoleDto.roleId);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, hashPassword, comparePassword, ...result } = user;
        return result;
    }
} 