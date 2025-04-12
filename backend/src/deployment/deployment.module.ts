import { Module, forwardRef } from '@nestjs/common';
import { DeploymentController } from './deployment.controller';
import { DeploymentService } from './deployment.service';
import { ServerInstanceModule } from '../server-instance/server-instance.module';

@Module({
  imports: [
    forwardRef(() => ServerInstanceModule)
  ],
  controllers: [DeploymentController],
  providers: [DeploymentService],
  exports: [DeploymentService]
})
export class DeploymentModule {} 