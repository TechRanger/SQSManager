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
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      // or requests from the specific frontend origin
      const allowedOrigins = ['http://localhost:5173', 'http://14.145.201.127:5173']; // Add both localhost and your IP
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        logger.warn(`CORS: Blocked origin ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization', // Ensure Authorization header is allowed
    credentials: true,
  });

  // 监听端口
  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`后端服务正在监听 http://localhost:${port}`);
}
bootstrap();
