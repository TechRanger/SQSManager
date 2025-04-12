import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServerInstanceService } from './server-instance.service';
import { ServerInstanceController } from './server-instance.controller';
import { ServerInstance } from './entities/server-instance.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServerInstance]),
    AuthModule
  ],
  controllers: [ServerInstanceController],
  providers: [ServerInstanceService],
  exports: [ServerInstanceService] // Export the service
})
export class ServerInstanceModule {} 