import { Injectable, Logger, InternalServerErrorException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Observable, Subject, interval } from 'rxjs';
import { map, filter, takeUntil } from 'rxjs/operators';
import { DeployInstanceDto } from './dto/deploy-instance.dto';
import { ServerInstanceService } from '../server-instance/server-instance.service';
import { CreateServerInstanceDto } from '../server-instance/dto/create-server-instance.dto';

interface MessageEvent {
    data: string | object;
    // Add other SSE fields if needed (id, event, retry)
}

@Injectable()
export class DeploymentService {
    private readonly logger = new Logger(DeploymentService.name);
    private isDeploying: boolean = false; // Simple lock to prevent concurrent deployments

    // Inject ConfigService and ServerInstanceService
    constructor(
        private configService: ConfigService,
        @Inject(forwardRef(() => ServerInstanceService))
        private serverInstanceService: ServerInstanceService,
    ) {}

    // --- SteamCMD Path ---
    private getSteamCmdPath(): string {
        // 1. Try reading from environment variable (STEAMCMD_PATH)
        const envPath = this.configService.get<string>('STEAMCMD_PATH');
        if (envPath) {
            this.logger.log(`使用环境变量 STEAMCMD_PATH: ${envPath}`);
            return envPath;
        }

        // 2. Fallback to default command name based on OS
        this.logger.warn('未设置 STEAMCMD_PATH 环境变量，将尝试使用默认命令 (steamcmd.exe / steamcmd)。');
        const isWindows = process.platform === 'win32';
        return isWindows ? 'steamcmd.exe' : 'steamcmd';
    }

    // --- Main Installation Logic ---
    async installOrUpdateServer(installPath: string): Promise<void> {
        if (this.isDeploying) {
            this.logger.warn('部署任务已在进行中，请稍后再试。');
            // We return immediately, controller returns 202, so no exception needed here
            return;
        }

        this.isDeploying = true;
        this.logger.log(`开始部署 Squad 服务器到: ${installPath}`);

        // Basic path validation (more robust checks needed depending on OS)
        if (!installPath || typeof installPath !== 'string'){
             this.logger.error('无效的安装路径提供给部署服务。');
             this.isDeploying = false; // Release lock
             // No exception needed as controller handles this via DTO validation mostly
             return;
        }

        const steamCmdExecutable = this.getSteamCmdPath();
        const squadAppId = '403240'; // Squad Dedicated Server App ID

        const args = [
            '+force_install_dir', installPath,
            '+login', 'anonymous',
            '+app_update', squadAppId, 'validate',
            '+quit'
        ];

        this.logger.log(`执行 SteamCMD: ${steamCmdExecutable} ${args.join(' ')}`);

        try {
            // Ensure the target directory exists
            await fs.mkdir(installPath, { recursive: true });

            const steamCmdProcess = spawn(steamCmdExecutable, args, {
                stdio: ['ignore', 'pipe', 'pipe'] // Capture stdout/stderr
            });

            steamCmdProcess.stdout?.on('data', (data) => {
                const message = data.toString().trim();
                 if (message) this.logger.log(`[SteamCMD STDOUT]: ${message}`);
                 // TODO: Parse output for progress/status and potentially push to frontend via WebSocket/SSE
            });

            steamCmdProcess.stderr?.on('data', (data) => {
                 const message = data.toString().trim();
                 if (message) this.logger.error(`[SteamCMD STDERR]: ${message}`);
                 // TODO: Parse errors and potentially push to frontend
            });

             steamCmdProcess.on('close', (code) => {
                 if (code === 0) {
                     this.logger.log(`SteamCMD 成功完成部署到: ${installPath}`);
                     // TODO: Notify frontend of success (e.g., via WebSocket)
                 } else {
                     this.logger.error(`SteamCMD 部署失败，退出码: ${code}`);
                      // TODO: Notify frontend of failure
                 }
                 this.isDeploying = false; // Release the lock
             });

             steamCmdProcess.on('error', (err) => {
                 this.logger.error(`启动 SteamCMD 失败: ${err.message}`);
                  // Handle common errors like EONET (command not found)
                  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                       this.logger.error(`错误：找不到 SteamCMD 可执行文件 (${steamCmdExecutable})。请检查环境变量 STEAMCMD_PATH 或系统 PATH。`);
                       // TODO: Notify frontend about missing SteamCMD
                  }
                 this.isDeploying = false; // Release the lock
                  // We don't throw here as the controller already returned 202
             });

        } catch (error: any) {
             this.logger.error(`部署过程中发生意外错误: ${error}`);
             this.isDeploying = false; // Ensure lock is released on unexpected errors
              // TODO: Notify frontend of unexpected error
             // We don't throw here
        }
    }

    deployInstance(dto: DeployInstanceDto): Observable<MessageEvent> {
        const subject = new Subject<MessageEvent>();
        const steamCmdPath = this.getSteamCmdPath();
        const installPath = path.resolve(dto.installPath); // Resolve to absolute path
        const squadAppId = '403240';

        this.logger.log(`收到部署请求: ${JSON.stringify(dto)}`);

        // Basic Path Validation
        if (!installPath) {
             const msg = '安装路径不能为空';
             this.logger.error(msg);
             // Send error immediately and complete
             subject.next({ data: `DEPLOYMENT_ERROR: ${msg}` });
             subject.complete();
             return subject.asObservable();
        }
        // Add more robust path validation if needed

        const args = [
            '+force_install_dir', installPath,
            '+login', 'anonymous',
            '+app_update', squadAppId, 'validate',
            '+quit',
        ];

        try {
            this.logger.log(`正在启动 SteamCMD: ${steamCmdPath} ${args.join(' ')}`);
            const steamCmdProcess = spawn(steamCmdPath, args, {
                 stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout/stderr
                 // shell: true // May be needed on some systems/configurations
             });

             // Helper to send data
             const sendData = (data: Buffer | string) => {
                 const message = data.toString();
                 // Optionally filter or format message here
                 subject.next({ data: message });
             };

            steamCmdProcess.stdout.on('data', sendData);
            steamCmdProcess.stderr.on('data', sendData);

            steamCmdProcess.on('error', (err) => {
                this.logger.error(`启动 SteamCMD 进程失败: ${err.message}`, err.stack);
                let errorMsg = `启动 SteamCMD 进程失败: ${err.message}`;
                if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                   errorMsg = `错误：找不到 SteamCMD 可执行文件 (${steamCmdPath})。请检查路径或环境变量。`;
                }
                subject.next({ data: `DEPLOYMENT_ERROR: ${errorMsg}` });
                subject.complete();
            });

            steamCmdProcess.on('close', async (code) => {
                this.logger.log(`SteamCMD 进程退出，代码: ${code}`);
                if (code === 0) {
                    subject.next({ data: '\nSteamCMD 下载/更新成功！\n' });
                    this.logger.log(`SteamCMD 成功完成部署到: ${installPath}`);

                    // Now, create the server instance record in DB
                    subject.next({ data: '正在创建服务器实例记录...' });
                    try {
                        const createDto: CreateServerInstanceDto = {
                            name: dto.name,
                            installPath: installPath,
                            gamePort: dto.gamePort,
                            queryPort: dto.queryPort,
                            rconPort: dto.rconPort,
                            beaconPort: dto.beaconPort,
                            rconPassword: dto.rconPassword, // Passed from DTO
                            extraArgs: dto.extraArgs,
                        };
                        // Call service to create instance (includes Rcon.cfg update)
                        await this.serverInstanceService.create(createDto);
                        this.logger.log(`服务器实例 ${dto.name} 记录已成功创建。`);
                        subject.next({ data: '\n服务器实例记录已成功创建！部署完成。' });
                        subject.next({ data: 'DEPLOYMENT_SUCCESS' });
                    } catch (createError: any) {
                        this.logger.error(`创建服务器实例记录失败: ${createError.message}`, createError.stack);
                        subject.next({ data: `DATABASE_ERROR: 创建服务器实例记录失败: ${createError.message}` });
                    }
                } else {
                    this.logger.error(`SteamCMD 部署失败，退出码: ${code}`);
                    subject.next({ data: `DEPLOYMENT_ERROR: SteamCMD 部署失败，退出码: ${code}` });
                }
                subject.complete(); // Ensure observable completes
            });

        } catch (error: any) {
            this.logger.error(`运行 SteamCMD 时发生意外错误: ${error.message}`, error.stack);
            subject.next({ data: `DEPLOYMENT_ERROR: 意外错误: ${error.message}` });
            subject.complete();
        }

        // Keep connection alive for SSE while process runs
        // Send a heartbeat or empty comment periodically if needed for proxies/timeouts
        // const keepAliveInterval = interval(15000) // every 15 seconds
        //     .pipe(map(() => ({ data: ': keepalive' } as MessageEvent))) // SSE comment
        //     .pipe(takeUntil(subject)); // Stop when subject completes/errors
        // keepAliveInterval.subscribe(subject);

        return subject.asObservable();
    }
} 