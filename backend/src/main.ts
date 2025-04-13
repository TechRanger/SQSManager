import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './permission/guards/permissions.guard';
import { APP_GUARD } from '@nestjs/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // 启用全局 DTO 验证
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // More specific CORS configuration
  app.enableCors({
    origin: function(origin, callback) {
      // 允许任何来源，包括直接通过IP地址访问
      callback(null, true);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
    credentials: true,
  });

  // 监听端口
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0'); // 监听所有网络接口
  logger.log(`后端服务正在监听 http://localhost:${port}`);
}
bootstrap();
