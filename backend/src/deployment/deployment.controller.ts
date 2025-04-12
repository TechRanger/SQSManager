import { Controller, Get, Query, Sse, UseGuards, ValidationPipe, BadRequestException, Logger, Post, Body, Param, Inject, UnauthorizedException } from '@nestjs/common';
import { DeploymentService } from './deployment.service';
import { DeployInstanceDto } from './dto/deploy-instance.dto';
import { Observable, Subject } from 'rxjs';
import { RequirePermissions } from '../permission/decorators/require-permissions.decorator';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';

// Interface for SSE message structure (matches service)
interface MessageEvent {
    data: string | object;
}

@Controller('api/deployment')
export class DeploymentController {
    private readonly logger = new Logger(DeploymentController.name);

    constructor(
        private readonly deploymentService: DeploymentService,
        private readonly jwtService: JwtService,
        private readonly userService: UserService
    ) {}

    // Remove or comment out the old POST /install endpoint if no longer needed
    // @Post('install')
    // @HttpCode(HttpStatus.ACCEPTED)
    // async installServer(@Body() installServerDto: InstallServerDto): Promise<{ message: string }> {
    //     this.deploymentService.installOrUpdateServer(installServerDto.installPath);
    //     return { message: '服务器安装/更新任务已开始。' };
    // }

    @Sse('deploy-instance')
    @RequirePermissions('deployment:manage')
    deployInstanceSse(
        @Query(new ValidationPipe({ 
            transform: true, 
            whitelist: true,
            forbidNonWhitelisted: true,
            expectedType: DeployInstanceDto,
            exceptionFactory: (errors) => new BadRequestException(errors) 
        })) 
        queryDto: DeployInstanceDto
    ): Observable<MessageEvent> {
        this.logger.log(`进入 deployInstanceSse 端点。`);
        this.logger.verbose(`接收到已验证的 DTO: ${JSON.stringify(queryDto)}`);
        
        return this.deploymentService.deployInstance(queryDto);
    }

    // 新的安全部署端点 - 步骤1：创建部署任务并返回任务ID
    @Post('deploy-instance-sse/create')
    @RequirePermissions('deployment:manage')
    async createDeploymentTask(
        @Body(new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true
        }))
        deployDto: DeployInstanceDto
    ) {
        this.logger.log('接收到创建部署任务请求');
        this.logger.verbose(`部署数据: ${JSON.stringify(deployDto)}`);
        
        const taskId = await this.deploymentService.createDeploymentTask(deployDto);
        return { taskId };
    }

    // 新的安全部署端点 - 步骤2：通过SSE获取部署进度
    @Sse('deploy-instance-sse/:taskId')
    async getDeploymentProgress(
        @Param('taskId') taskId: string,
        @Query('token') token: string
    ): Promise<Observable<MessageEvent>> {
        this.logger.log(`获取部署任务进度: ${taskId}, 通过查询参数认证`);
        
        // 手动验证令牌
        if (!token) {
            this.logger.error('没有提供认证令牌');
            const errorSubject = new Subject<MessageEvent>();
            errorSubject.next({ data: 'DEPLOYMENT_ERROR: 未授权访问，缺少有效的认证令牌' });
            errorSubject.complete();
            return errorSubject.asObservable();
        }
        
        try {
            // 验证JWT令牌
            const payload = this.jwtService.verify(token);
            const userId = payload.sub;
            
            // 获取用户及其权限
            const user = await this.userService.findOneByIdWithRelations(userId, { role: { permissions: true } });
            
            if (!user) {
                throw new UnauthorizedException('用户不存在');
            }
            
            // 检查是否有部署权限
            const hasPermission = user.role?.permissions?.some(p => p.name === 'deployment:manage');
            
            if (!hasPermission) {
                this.logger.error(`用户 ${user.username} (ID: ${user.id}) 没有部署权限`);
                const errorSubject = new Subject<MessageEvent>();
                errorSubject.next({ data: 'DEPLOYMENT_ERROR: 未授权访问，缺少部署权限' });
                errorSubject.complete();
                return errorSubject.asObservable();
            }
            
            // 权限验证通过，继续处理请求
            return this.deploymentService.getDeploymentProgress(taskId);
            
        } catch (error) {
            this.logger.error(`令牌验证失败: ${error.message}`);
            const errorSubject = new Subject<MessageEvent>();
            errorSubject.next({ data: `DEPLOYMENT_ERROR: 未授权访问，无效的认证令牌` });
            errorSubject.complete();
            return errorSubject.asObservable();
        }
    }
} 