import { Controller, Get, Post, Body, Patch, Param, Delete, HttpCode, HttpStatus, BadRequestException, UseGuards } from '@nestjs/common';
import { ServerInstanceService } from './server-instance.service';
import { CreateServerInstanceDto } from './dto/create-server-instance.dto';
import { UpdateServerInstanceDto } from './dto/update-server-instance.dto';
import { ServerInstance } from './entities/server-instance.entity';
import { RconDto } from './dto/rcon.dto';
import { BanEntry, UnbanDto } from './dto/ban.dto';
import { FullAdminConfig } from './dto/admin-config.dto';
import { AddGroupDto } from './dto/add-group.dto';
import { AddAdminDto } from './dto/add-admin.dto';
import { RequirePermissions } from '../permission/decorators/require-permissions.decorator';

@Controller('api/server-instances')
export class ServerInstanceController {
  constructor(private readonly serverInstanceService: ServerInstanceService) {}

  @Post()
  @RequirePermissions('server:edit_config')
  create(@Body() createServerInstanceDto: CreateServerInstanceDto): Promise<ServerInstance> {
    return this.serverInstanceService.create(createServerInstanceDto);
  }

  @Get()
  @RequirePermissions('server:view_all')
  findAll(): Promise<ServerInstance[]> {
    return this.serverInstanceService.findAll();
  }

  @Get(':id')
  @RequirePermissions('server:view_details')
  findOne(@Param('id') id: string): Promise<ServerInstance> {
    return this.serverInstanceService.findOne(+id);
  }

  @Patch(':id')
  @RequirePermissions('server:edit_config')
  update(@Param('id') id: string, @Body() updateServerInstanceDto: UpdateServerInstanceDto): Promise<ServerInstance> {
    return this.serverInstanceService.update(+id, updateServerInstanceDto);
  }

  @Get(':id/status')
  @RequirePermissions('server:view_details')
  getStatus(@Param('id') id: string): Promise<any> {
    return this.serverInstanceService.getStatus(+id);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('server:control')
  async start(@Param('id') id: string): Promise<{ message: string }> {
     await this.serverInstanceService.start(+id);
     return { message: '服务器启动命令已发送' };
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('server:control')
  async stop(@Param('id') id: string): Promise<{ message: string }> {
     await this.serverInstanceService.stop(+id);
     return { message: '服务器停止命令已发送' };
  }

  @Post(':id/restart')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('server:control')
  async restart(@Param('id') id: string): Promise<{ message: string }> {
     await this.serverInstanceService.restart(+id);
     return { message: '服务器重启命令已发送' };
  }

  @Post(':id/rcon')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('server:rcon')
  async sendRconCommand(
     @Param('id') id: string,
     @Body() rconDto: RconDto
   ): Promise<{ response: string }> {
     if (!rconDto.command) {
         throw new Error("RCON command cannot be empty.")
     }
     const response = await this.serverInstanceService.sendRconCommand(+id, rconDto.command);
     return { response };
   }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('server:delete')
  remove(@Param('id') id: string): Promise<void> {
    return this.serverInstanceService.remove(+id);
  }

  @Post('read-rcon-config')
  @HttpCode(HttpStatus.OK)
  async readRconConfig(@Body('installPath') installPath: string): Promise<{ password?: string; port?: number }> {
      if (!installPath) {
          throw new BadRequestException('installPath is required.');
      }
      return this.serverInstanceService.readRconConfigFromFile(installPath);
  }

  @Get(':id/bans')
  @RequirePermissions('server:view_details')
  async getBanList(@Param('id') id: string): Promise<BanEntry[]> {
    return this.serverInstanceService.getBanList(+id);
  }

  @Delete(':id/bans')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('server:manage_bans_web')
  async unbanPlayer(@Param('id') id: string, @Body() unbanDto: UnbanDto): Promise<void> {
      return this.serverInstanceService.unbanPlayer(+id, unbanDto.lineContent);
  }

  @Get(':id/admin-config')
  @RequirePermissions('server:view_details')
  async getAdminConfig(@Param('id') id: string): Promise<FullAdminConfig> {
      return this.serverInstanceService.getAdminConfig(+id);
  }

  @Post(':id/admin-config/groups')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('server:manage_admins_web')
  async addGroup(
      @Param('id') id: string,
      @Body() addGroupDto: AddGroupDto
  ): Promise<void> {
      await this.serverInstanceService.addGroup(+id, addGroupDto);
  }

  @Delete(':id/admin-config/groups/:groupName')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('server:manage_admins_web')
  async deleteGroup(
      @Param('id') id: string,
      @Param('groupName') groupName: string
  ): Promise<void> {
      await this.serverInstanceService.deleteGroup(+id, decodeURIComponent(groupName));
  }

  @Post(':id/admin-config/admins')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('server:manage_admins_web')
  async addAdmin(
      @Param('id') id: string,
      @Body() addAdminDto: AddAdminDto
  ): Promise<void> {
       await this.serverInstanceService.addAdmin(+id, addAdminDto);
  }

  @Delete(':id/admin-config/admins/:steamId/:groupName')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('server:manage_admins_web')
  async deleteAdmin(
      @Param('id') id: string,
      @Param('steamId') steamId: string,
      @Param('groupName') groupName: string
  ): Promise<void> {
      await this.serverInstanceService.deleteAdmin(+id, steamId, decodeURIComponent(groupName));
  }
} 