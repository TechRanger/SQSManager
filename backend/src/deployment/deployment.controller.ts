import { Controller, Get, Query, Sse, UseGuards, ValidationPipe, BadRequestException, Logger } from '@nestjs/common';
import { DeploymentService } from './deployment.service';
import { DeployInstanceDto } from './dto/deploy-instance.dto';
import { Observable } from 'rxjs';
import { RequirePermissions } from '../permission/decorators/require-permissions.decorator';

// Interface for SSE message structure (matches service)
interface MessageEvent {
    data: string | object;
}

@Controller('api/deployment')
export class DeploymentController {
    private readonly logger = new Logger(DeploymentController.name);

    constructor(private readonly deploymentService: DeploymentService) {}

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
} 