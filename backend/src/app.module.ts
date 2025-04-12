import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ServerInstanceModule } from './server-instance/server-instance.module';
import { ServerInstance } from './server-instance/entities/server-instance.entity';
import { join } from 'path';
import { DeploymentModule } from './deployment/deployment.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { User } from './user/entities/user.entity';
import { PermissionModule } from './permission/permission.module';
import { RoleModule } from './role/role.module';
import { Permission } from './permission/entities/permission.entity';
import { Role } from './role/entities/role.entity';
import { SeedModule } from './seed/seed.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './permission/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: join(__dirname, '..', 'data', 'manager.db'), // 数据库文件路径, 放在项目根目录的 data/ 下
      entities: [ServerInstance, User, Permission, Role],
      synchronize: true, // 开发阶段自动创建数据库表 (生产环境不要用)
      autoLoadEntities: true, // 自动加载实体
    }),
    ServerInstanceModule, // 导入我们的服务器实例模块
    DeploymentModule,
    UserModule,
    AuthModule,
    PermissionModule,
    RoleModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
