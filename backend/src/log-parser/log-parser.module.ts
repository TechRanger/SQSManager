import { Module } from '@nestjs/common';
import { LogParserService } from './log-parser.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule], // Import ConfigModule to access environment variables
  providers: [LogParserService],
  exports: [LogParserService], // Export if needed elsewhere, otherwise remove
})
export class LogParserModule {} 