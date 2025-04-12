import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './entities/permission.entity';
import { PermissionsGuard } from './guards/permissions.guard';
import { UserModule } from '../user/user.module';
import { PermissionController } from './permission.controller';
import { PermissionService } from './permission.service';

@Module({
  imports: [
      TypeOrmModule.forFeature([Permission]),
      UserModule,
    ],
  controllers: [PermissionController],
  providers: [PermissionsGuard, PermissionService],
  exports: [TypeOrmModule, PermissionsGuard, PermissionService],
})
export class PermissionModule {} 