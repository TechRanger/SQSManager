import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServerInstanceService } from './server-instance.service';
import { ServerInstanceController } from './server-instance.controller';
import { ServerInstance } from './entities/server-instance.entity';
import { LogParserModule } from '../log-parser/log-parser.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServerInstance]),
    forwardRef(() => LogParserModule)
  ],
  controllers: [ServerInstanceController],
  providers: [ServerInstanceService],
  exports: [ServerInstanceService]
})
export class ServerInstanceModule {} 