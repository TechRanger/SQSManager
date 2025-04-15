import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
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
import { SharedModule } from './shared/shared.module';
import { DatabaseModule } from './database/database.module';
import { WebsocketModule } from './websocket/websocket.module';
import { SettingsModule } from './settings/settings.module';
import { LogParserModule } from './log-parser/log-parser.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'password'),
        database: configService.get<string>('DB_DATABASE', 'sqsmanager'),
        entities: [join(__dirname, '**', '*.entity.{ts,js}')],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'frontend', 'dist'),
      exclude: ['/api/*'],
    }),
    SharedModule,
    ServerInstanceModule,
    DeploymentModule,
    UserModule,
    AuthModule,
    PermissionModule,
    RoleModule,
    SeedModule,
    DatabaseModule,
    WebsocketModule,
    SettingsModule,
    LogParserModule,
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
