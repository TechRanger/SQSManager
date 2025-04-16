import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogParserService } from './log-parser.service';
import { ConfigModule } from '@nestjs/config';
import { ServerInstanceModule } from '../server-instance/server-instance.module';
import { ServerInstance } from '../server-instance/entities/server-instance.entity';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => ServerInstanceModule),
    TypeOrmModule.forFeature([ServerInstance])
  ],
  providers: [LogParserService],
  exports: [LogParserService],
})
export class LogParserModule {} 