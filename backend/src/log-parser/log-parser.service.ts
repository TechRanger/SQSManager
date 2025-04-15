import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogsReader, TPlayerConnected, TPlayerDamaged, TPlayerWounded, TVehicleDamaged, TSquadCreated, TNewGame } from 'squad-logs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LogParserService implements OnModuleInit {
  private readonly logger = new Logger(LogParserService.name);
  private logsReader: LogsReader;
  private outputLogStream: fs.WriteStream;

  constructor(private configService: ConfigService) {
    const outputLogPath = path.join(process.cwd(), this.configService.get<string>('PARSED_LOG_OUTPUT_PATH', 'data/parsed_squad_events.log'));
    // Ensure directory exists
    const outputDir = path.dirname(outputLogPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    this.outputLogStream = fs.createWriteStream(outputLogPath, { flags: 'a' }); // 'a' for append
  }

  async onModuleInit() {
    const squadLogPath = this.configService.get<string>('SQUAD_LOG_PATH');
    const adminsCfgPath = this.configService.get<string>('SQUAD_ADMINS_CFG_PATH');

    if (!squadLogPath || !adminsCfgPath) {
      this.logger.error('SQUAD_LOG_PATH or SQUAD_ADMINS_CFG_PATH environment variable is not set. Log parsing disabled.');
      return;
    }

    this.logger.log(`Initializing LogsReader with local path: ${squadLogPath}`);
    this.logsReader = new LogsReader({
      id: 1, // Identifier, can be anything
      autoReconnect: true,
      readType: 'local',
      adminsFilePath: adminsCfgPath,
      filePath: squadLogPath,
    });

    try {
      await this.logsReader.init();
      this.logger.log('Squad LogsReader initialized successfully.');
      this.setupEventListeners();
    } catch (error) {
      this.logger.error('Failed to initialize Squad LogsReader:', error);
    }
  }

  private setupEventListeners() {
    this.logsReader.on('PLAYER_CONNECTED', (data: TPlayerConnected) => {
      this.logEvent('PLAYER_CONNECTED', data);
    });

    this.logsReader.on('PLAYER_DAMAGED', (data: TPlayerDamaged) => {
      this.logEvent('PLAYER_DAMAGED', data);
    });

    this.logsReader.on('PLAYER_WOUNDED', (data: TPlayerWounded) => {
      this.logEvent('PLAYER_WOUNDED', data);
    });

    this.logsReader.on('VEHICLE_DAMAGED', (data: TVehicleDamaged) => {
      this.logEvent('VEHICLE_DAMAGED', data);
    });

    this.logsReader.on('SQUAD_CREATED', (data: TSquadCreated) => {
      this.logEvent('SQUAD_CREATED', data);
    });

    this.logsReader.on('NEW_GAME', (data: TNewGame) => {
      this.logEvent('NEW_GAME', data);
    });

    this.logsReader.on('close', () => {
      this.logger.log('LogsReader connection closed.');
    });

    this.logsReader.on('error', (error) => {
      this.logger.error('LogsReader error:', error);
    });
  }

  private logEvent(eventName: string, data: any) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} [${eventName}] ${JSON.stringify(data)}\n`;
    this.outputLogStream.write(logEntry);
    this.logger.verbose(`Logged event: ${eventName}`); // Optional: Log to console as well
  }

  // Optional: Method to gracefully close the stream on shutdown
  async onModuleDestroy() {
    if (this.outputLogStream) {
      this.outputLogStream.end();
    }
    if (this.logsReader) {
      // Check if destroy method exists and call it
      if (typeof (this.logsReader as any).destroy === 'function') {
           (this.logsReader as any).destroy();
      } else {
           this.logger.warn('LogsReader does not have a destroy method.');
      }
    }
  }
} 