import { Module, forwardRef } from '@nestjs/common';
import { DeploymentController } from './deployment.controller';
import { DeploymentService } from './deployment.service';
import { ServerInstanceModule } from '../server-instance/server-instance.module';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    forwardRef(() => ServerInstanceModule),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'VERY_SECRET_KEY_CHANGE_THIS_IN_PROD',
        signOptions: { expiresIn: '6h' },
      }),
    }),
    UserModule
  ],
  controllers: [DeploymentController],
  providers: [DeploymentService],
  exports: [DeploymentService]
})
export class DeploymentModule {} 