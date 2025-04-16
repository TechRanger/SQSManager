import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogsReader, TPlayerConnected, TPlayerDamaged, TPlayerWounded, TVehicleDamaged, TSquadCreated, TNewGame } from 'squad-logs';
import * as fs from 'fs';
import * as path from 'path';
import { ServerInstanceService } from '../server-instance/server-instance.service';
import { ServerInstance } from '../server-instance/entities/server-instance.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class LogParserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogParserService.name);
  private logsReaderMap: Map<number, LogsReader> = new Map();
  private outputStreamMap: Map<number, fs.WriteStream> = new Map();
  private logCleanupInterval: NodeJS.Timeout;

  constructor(
    private configService: ConfigService,
    @InjectRepository(ServerInstance)
    private serverInstanceRepository: Repository<ServerInstance>,
    @Inject(forwardRef(() => ServerInstanceService))
    private serverInstanceService: ServerInstanceService,
  ) {
  }

  async onModuleInit() {
    this.logger.log('LogParserService initializing...');
    try {
      await this.initializeMonitoringForInitiallyRunningInstances();
      this.setupLogCleanupTask();
    } catch (err) {
      this.logger.error('Error during LogParserService initialization:', err);
    }
  }

  async onModuleDestroy() {
    this.logger.log('LogParserService shutting down...');
    if (this.logCleanupInterval) {
      clearInterval(this.logCleanupInterval);
    }
    
    const instanceIds = [...this.logsReaderMap.keys()];
    for (const instanceId of instanceIds) {
      await this.stopMonitoringInstance(instanceId);
    }
    this.logger.log('LogParserService shutdown complete.');
  }

  private async initializeMonitoringForInitiallyRunningInstances() {
    this.logger.log('Initializing monitoring for instances running at service start...');
    let runningInstances: ServerInstance[] = [];
    try {
      runningInstances = await this.serverInstanceRepository.find({ where: { isRunning: true } });
      this.logger.log(`Found ${runningInstances.length} initially running instance(s).`);
    } catch (error) {
      this.logger.error('Failed to fetch initially running server instances:', error);
      return;
    }

    for (const instance of runningInstances) {
      await this.startMonitoringInstance(instance);
    }
    this.logger.log('Finished initializing monitors for initially running instances.');
  }

  async startMonitoringInstance(instance: ServerInstance) {
    const instanceId = instance.id;
    this.logger.log(`Attempting to start monitoring for instance ${instanceId} (${instance.name})...`);

    if (this.logsReaderMap.has(instanceId)) {
      this.logger.warn(`[Instance ${instanceId}] Already monitoring. Skipping start request.`);
      return;
    }

    if (!instance.installPath) {
      this.logger.error(`[Instance ${instanceId}] Cannot start monitoring: installPath is not configured.`);
      return;
    }

    const targetLogDir = path.join(instance.installPath, 'SquadGame', 'Saved', 'Logs');
    const adminsCfgPath = path.join(instance.installPath, 'SquadGame', 'ServerConfig', 'Admins.cfg');
    const squadLogPath = path.join(targetLogDir, 'SquadGame.log');
    const outputLogFileName = `parsed_squad_events_${instanceId}.log`;
    const outputLogPath = path.join(targetLogDir, outputLogFileName);

    this.logger.log(`[Instance ${instanceId}] Admins.cfg path: ${adminsCfgPath}`);
    this.logger.log(`[Instance ${instanceId}] SquadGame.log path: ${squadLogPath}`);
    this.logger.log(`[Instance ${instanceId}] Parsed output log path: ${outputLogPath}`);

    try {
      await fs.promises.access(adminsCfgPath);
      await fs.promises.access(squadLogPath);
      this.logger.log(`[Instance ${instanceId}] Prerequisite log files found.`);
    } catch (err) {
      this.logger.error(`[Instance ${instanceId}] Cannot start monitoring: Required log file(s) not found. Admins.cfg: ${adminsCfgPath}, SquadGame.log: ${squadLogPath}. Error: ${err.message}`);
      return;
    }

    try {
      if (!fs.existsSync(targetLogDir)) {
        await fs.promises.mkdir(targetLogDir, { recursive: true });
        this.logger.log(`[Instance ${instanceId}] Created target log directory: ${targetLogDir}`);
      }
    } catch (mkdirError) {
      this.logger.error(`[Instance ${instanceId}] Cannot start monitoring: Failed to ensure target log directory exists ${targetLogDir}:`, mkdirError);
      return;
    }

    let outputStream: fs.WriteStream;
    try {
      outputStream = fs.createWriteStream(outputLogPath, { flags: 'a' });
      this.outputStreamMap.set(instanceId, outputStream);
      this.logger.log(`[Instance ${instanceId}] Output log stream created successfully.`);
    } catch (streamError) {
      this.logger.error(`[Instance ${instanceId}] Cannot start monitoring: Failed to create output log stream at ${outputLogPath}:`, streamError);
      return;
    }

    let reader: LogsReader | null = null;
    try {
      reader = new LogsReader({
        id: instanceId,
        autoReconnect: true,
        readType: 'local',
        adminsFilePath: adminsCfgPath,
        filePath: squadLogPath,
      });

      await reader.init();
      this.logsReaderMap.set(instanceId, reader);
      this.logger.log(`[Instance ${instanceId}] Squad LogsReader initialized and monitoring started successfully.`);
      this.setupEventListeners(instanceId, reader);

    } catch (initError) {
      this.logger.error(`[Instance ${instanceId}] Failed to initialize Squad LogsReader after creating stream:`, initError);
      if (reader && typeof (reader as any).destroy === 'function') {
        (reader as any).destroy();
      }
      if (this.outputStreamMap.has(instanceId)) {
        const streamToClose = this.outputStreamMap.get(instanceId);
        streamToClose?.end(() => this.logger.log(`[Instance ${instanceId}] Cleaned up output stream due to reader init failure.`));
        this.outputStreamMap.delete(instanceId);
      }
    }
  }

  async stopMonitoringInstance(instanceId: number) {
    this.logger.log(`Attempting to stop monitoring for instance ${instanceId}...`);

    const reader = this.logsReaderMap.get(instanceId);
    if (reader) {
      try {
        if (typeof (reader as any).destroy === 'function') {
          (reader as any).destroy();
          this.logger.log(`[Instance ${instanceId}] LogsReader destroyed.`);
        } else {
          this.logger.warn(`[Instance ${instanceId}] LogsReader does not have a destroy method.`);
        }
      } catch (error) {
        this.logger.error(`[Instance ${instanceId}] Error destroying LogsReader:`, error);
      }
      this.logsReaderMap.delete(instanceId);
    } else {
      this.logger.warn(`[Instance ${instanceId}] No active LogsReader found to stop.`);
    }

    const stream = this.outputStreamMap.get(instanceId);
    if (stream) {
      try {
        await new Promise<void>(resolve => stream.end(resolve));
        this.logger.log(`[Instance ${instanceId}] Output log stream closed.`);
      } catch (error) {
        this.logger.error(`[Instance ${instanceId}] Error closing output stream:`, error);
      }
      this.outputStreamMap.delete(instanceId);
    } else {
        this.logger.warn(`[Instance ${instanceId}] No active output stream found to close.`);
    }
    this.logger.log(`Finished stop monitoring attempt for instance ${instanceId}.`);
  }

  private setupEventListeners(instanceId: number, reader: LogsReader) {
    this.logger.log(`[Instance ${instanceId}] Setting up event listeners.`);

    reader.on('PLAYER_CONNECTED', (data: TPlayerConnected) => {
      this.logEvent(instanceId, 'PLAYER_CONNECTED', data);
    });

    reader.on('PLAYER_DAMAGED', (data: TPlayerDamaged) => {
      this.logEvent(instanceId, 'PLAYER_DAMAGED', data);
    });

    reader.on('PLAYER_WOUNDED', (data: TPlayerWounded) => {
      this.logEvent(instanceId, 'PLAYER_WOUNDED', data);
    });

    reader.on('VEHICLE_DAMAGED', (data: TVehicleDamaged) => {
      this.logEvent(instanceId, 'VEHICLE_DAMAGED', data);
    });

    reader.on('SQUAD_CREATED', (data: TSquadCreated) => {
      this.logEvent(instanceId, 'SQUAD_CREATED', data);
    });

    reader.on('NEW_GAME', (data: TNewGame) => {
      this.logEvent(instanceId, 'NEW_GAME', data);
    });

    reader.on('close', () => {
      this.logger.log(`[Instance ${instanceId}] LogsReader connection closed.`);
    });

    reader.on('error', (error) => {
      this.logger.error(`[Instance ${instanceId}] LogsReader error:`, error);
    });
  }

  private logEvent(instanceId: number, eventName: string, data: any) {
    const outputStream = this.outputStreamMap.get(instanceId);
    if (!outputStream) {
      this.logger.warn(`[Instance ${instanceId}] Received event ${eventName} but no output stream found.`);
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} [${eventName}] ${JSON.stringify(data)}\n`;
    try {
        outputStream.write(logEntry);
    } catch (writeError) {
        this.logger.error(`[Instance ${instanceId}] Failed to write event ${eventName} to log file:`, writeError);
    }
  }

  private setupLogCleanupTask() {
    this.logCleanupInterval = setInterval(() => {
      this.cleanupOldEventLogs().catch(err => {
        this.logger.error(`清理旧事件日志时出错: ${err.message}`);
      });
    }, 5 * 60 * 1000);
    
    this.logger.log('事件日志清理定时任务已设置');
  }

  private async cleanupOldEventLogs(): Promise<void> {
    this.logger.debug('开始清理旧事件日志记录');
    
    try {
      const allInstances = await this.serverInstanceRepository.find();
      
      for (const instance of allInstances) {
        try {
          await this.cleanupInstanceEventLog(instance.id, instance.installPath);
        } catch (err) {
          this.logger.warn(`清理服务器 ${instance.id} 的事件日志失败: ${err.message}`);
        }
      }
      
      this.logger.debug('事件日志清理完成');
    } catch (err) {
      this.logger.error(`获取服务器实例列表失败: ${err.message}`);
      throw err;
    }
  }
  
  private async cleanupInstanceEventLog(instanceId: number, installPath: string): Promise<void> {
    const targetLogDir = path.join(installPath, 'SquadGame', 'Saved', 'Logs');
    const logPath = path.join(targetLogDir, `parsed_squad_events_${instanceId}.log`);
    
    try {
      try {
        await fs.promises.access(logPath);
      } catch (err) {
        return;
      }
      
      const content = await fs.promises.readFile(logPath, 'utf-8');
      const lines = content.split(/\r?\n/).filter(line => line.trim());
      
      if (lines.length === 0) {
        return;
      }
      
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      
      const recentLines = lines.filter(line => {
        try {
          const timestampStr = line.substring(0, line.indexOf(' ['));
          const timestamp = new Date(timestampStr);
          return timestamp >= twoHoursAgo;
        } catch (err) {
          return true;
        }
      });
      
      if (recentLines.length < lines.length) {
        this.logger.log(`服务器 ${instanceId} 的事件日志中移除了 ${lines.length - recentLines.length} 条超过2小时的记录`);
        
        const hasActiveStream = this.outputStreamMap.has(instanceId);
        let stream: fs.WriteStream | null = null;
        
        if (hasActiveStream) {
          stream = this.outputStreamMap.get(instanceId) || null;
          if (stream) {
            await new Promise<void>(resolve => stream!.end(resolve));
            this.outputStreamMap.delete(instanceId);
          }
        }
        
        await fs.promises.writeFile(logPath, recentLines.join('\n'), 'utf-8');
        
        if (hasActiveStream) {
          const newStream = fs.createWriteStream(logPath, { flags: 'a' });
          this.outputStreamMap.set(instanceId, newStream);
          this.logger.debug(`服务器 ${instanceId} 的事件日志流已重新创建`);
        }
      }
    } catch (err) {
      this.logger.error(`清理服务器 ${instanceId} 的事件日志时出错: ${err.message}`);
      throw err;
    }
  }
} 