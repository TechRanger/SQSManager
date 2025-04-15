import { Injectable, NotFoundException, Logger, InternalServerErrorException, BadRequestException, ConflictException, OnModuleDestroy, OnModuleInit, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateServerInstanceDto } from './dto/create-server-instance.dto';
import { UpdateServerInstanceDto } from './dto/update-server-instance.dto';
import { ServerInstance } from './entities/server-instance.entity';
import { spawn, ChildProcess } from 'child_process';
import { Rcon, TChatMessage, TPlayerWarned, TPlayerKicked, TPlayerBanned, TSquadCreated, TPossessedAdminCamera, TUnPossessedAdminCamera } from 'squad-rcon';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as ini from 'ini';
import { BanEntry, UnbanDto, AddManualBanDto } from './dto/ban.dto'; // Import Ban types
import { RconDto } from './dto/rcon.dto';
import { FullAdminConfig, AdminGroup, AdminEntry } from './dto/admin-config.dto'; // Import Admin Config types
import { AddGroupDto } from './dto/add-group.dto'; // Import AddGroupDto
import { AddAdminDto } from './dto/add-admin.dto'; // Import AddAdminDto
import { Subject } from 'rxjs'; // Import Subject
import * as os from 'os'; // ADD this line for os.EOL

// Define MessageEvent interface (can be moved to a shared types file)
export interface MessageEvent {
    data: string | object;
    id?: string;
    type?: string;
    retry?: number;
}

// Define a type for the running server info
interface RunningServerInfo {
    process: ChildProcess;
    rcon?: Rcon | null;
    instance: ServerInstance;
    rconConnecting?: boolean; // Flag to prevent multiple connection attempts
    rconRetryTimeout?: NodeJS.Timeout;
}

@Injectable()
export class ServerInstanceService implements OnModuleDestroy, OnModuleInit {
    private readonly logger = new Logger(ServerInstanceService.name);
    // Use the defined type for the map
    private runningServers: Map<number, RunningServerInfo> = new Map();
    private readonly SQUAD_APP_ID = '403240'; // Squad Dedicated Server App ID
    private activeUpdates: Set<number> = new Set(); // Track active updates
    // Map to hold SSE update streams
    private updateStreams = new Map<number, Subject<MessageEvent>>();

    constructor(
        @InjectRepository(ServerInstance)
        private serverInstanceRepository: Repository<ServerInstance>,
    ) {
        this.loadRunningServersFromSystem(); // Attempt to find existing processes on start?
    }

    async onModuleDestroy() {
        this.logger.log("模块销毁，尝试停止所有正在运行的服务器...");
        const stopPromises = Array.from(this.runningServers.keys()).map(id =>
            this.stop(id).catch(err => this.logger.error(`停止服务器 ${id} 时出错: ${err.message}`))
        );
        await Promise.all(stopPromises);
        this.logger.log("所有服务器停止命令已发送。");
    }

    async onModuleInit() {
        this.logger.log("服务启动，检查现有进程状态...");
        await this.syncServerRunningStates();
        
        // 启动聊天日志清理定时任务
        this.setupChatLogCleanupTask();
    }

    // 设置定时清理聊天日志的任务
    private setupChatLogCleanupTask() {
        // 每1分钟清理一次
        setInterval(() => {
            this.cleanupOldChatLogs().catch(err => {
                this.logger.error(`清理旧聊天日志时出错: ${err.message}`);
            });
        }, 60 * 1000); // 1分钟 = 60秒 * 1000毫秒
        
        this.logger.log('聊天日志清理定时任务已设置');
    }

    // 清理旧的聊天日志
    private async cleanupOldChatLogs(): Promise<void> {
        this.logger.debug('开始清理旧聊天日志记录');
        
        try {
            // 获取所有服务器实例
            const allInstances = await this.findAll();
            
            for (const instance of allInstances) {
                try {
                    await this.cleanupServerChatLog(instance.id);
                } catch (err) {
                    this.logger.warn(`清理服务器 ${instance.id} 的聊天日志失败: ${err.message}`);
                }
            }
            
            this.logger.debug('聊天日志清理完成');
        } catch (err) {
            this.logger.error(`获取服务器实例列表失败: ${err.message}`);
            throw err;
        }
    }
    
    // 清理单个服务器的聊天日志
    private async cleanupServerChatLog(id: number): Promise<void> {
        const instance = await this.findOne(id);
        const logPath = this.getChatLogPath(instance.installPath, instance.id);
        
        try {
            // 检查文件是否存在
            try {
                await fs.access(logPath);
            } catch (err) {
                // 文件不存在，不需要处理
                return;
            }
            
            // 读取文件内容
            const content = await fs.readFile(logPath, 'utf-8');
            const lines = content.split(/\r?\n/).filter(line => line.trim());
            
            if (lines.length === 0) {
                return; // 没有日志，不需要处理
            }
            
            // 当前时间
            const now = new Date();
            // 2小时前的时间戳
            const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
            
            // 过滤保留2小时内的日志
            const recentLines = lines.filter(line => {
                try {
                    // 提取时间戳 [2023-04-15T13:45:27.123Z]
                    const match = line.match(/^\[(.*?)\]/);
                    if (!match) return false;
                    
                    const timestamp = new Date(match[1]);
                    return timestamp >= twoHoursAgo;
                } catch (err) {
                    // 解析日期失败，默认保留该行
                    return true;
                }
            });
            
            // 如果有行被移除
            if (recentLines.length < lines.length) {
                this.logger.log(`服务器 ${id} 的聊天日志中移除了 ${lines.length - recentLines.length} 条超过2小时的记录`);
                
                // 写回文件
                await fs.writeFile(logPath, recentLines.join(os.EOL), 'utf-8');
            }
        } catch (err) {
            this.logger.error(`清理服务器 ${id} 的聊天日志时出错: ${err.message}`);
            throw err;
        }
    }

    // 初始化时同步服务器运行状态
    private async syncServerRunningStates(): Promise<void> {
        try {
            // 获取所有数据库中标记为运行中的服务器
            const runningServers = await this.serverInstanceRepository.find({ where: { isRunning: true } });
            
            if (runningServers.length > 0) {
                this.logger.log(`发现数据库中有 ${runningServers.length} 台标记为运行中的服务器，正在检查实际状态...`);
                
                // 遍历运行中的服务器，检查其是否真的在运行
                for (const server of runningServers) {
                    const isActuallyRunning = this.runningServers.has(server.id);
                    
                    if (!isActuallyRunning) {
                        this.logger.warn(`服务器 ${server.id} (${server.name}) 在数据库中标记为运行中，但实际未运行，正在更新状态...`);
                        await this.updateServerRunningState(server.id, false);
                    } else {
                        this.logger.log(`服务器 ${server.id} (${server.name}) 状态正确同步。`);
                    }
                }
            } else {
                this.logger.log(`数据库中没有标记为运行中的服务器。`);
            }
        } catch (err: any) {
            this.logger.error(`同步服务器运行状态时出错: ${err.message}`);
        }
    }

    // Helper to safely access executable
    private async checkExecutable(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath, fs.constants.X_OK); // Check execute permission
            return true;
        } catch (err: any) {
            this.logger.warn(`可执行文件检查失败: ${filePath}, 错误: ${err.code}`);
            return false;
        }
    }

    private getServerExecutablePath(instance: ServerInstance): string {
        const isWindows = process.platform === 'win32';
        const serverExecutable = isWindows ? 'SquadGameServer.exe' : 'SquadGameServer';
        // Common structure: <InstallDir>/SquadGame/Binaries/<Platform>/<Executable>
        return path.join(
            instance.installPath,
            'SquadGame',
            'Binaries',
            isWindows ? 'Win64' : 'Linux',
            serverExecutable
        );
    }

    // --- Helper to update Rcon.cfg content (Password and/or Port) ---
    private async _updateRconConfigFileContent(installPath: string, configUpdates: { password?: string; port?: number }): Promise<void> {
        // Exit if no updates are provided
        if (configUpdates.password === undefined && configUpdates.port === undefined) {
            this.logger.debug(`没有提供 RCON 配置更新，跳过文件写入。`);
            return;
        }

        const configFileName = 'Rcon.cfg';
        const configPath = path.join(
            installPath,
            'SquadGame',
            'ServerConfig',
            configFileName
        );
        this.logger.log(`尝试更新 RCON 配置文件内容: ${configPath}`);

        let content = '';
        let fileExists = true;
        try {
            content = await fs.readFile(configPath, 'utf-8');
            this.logger.debug(`读取到 RCON 配置文件内容。`);
        } catch (readErr: any) {
            if (readErr.code === 'ENOENT') {
                this.logger.warn(`RCON 配置文件 ${configPath} 不存在，将尝试创建。`);
                fileExists = false;
                // Default content if file doesn't exist
                content = `// Set this to enable the usage of RCON with the given password for login.
// Leaving this empty will keep RCON turned off.
// Alternatively, set this from the command line with the argument:
//   RCONPASSWORD=MyPassword
Password=
Port=21114`; // Add a default port too
            } else {
                throw new InternalServerErrorException(`读取 RCON 配置文件 ${configFileName} 失败: ${readErr.message}`);
            }
        }

        let updatedContent = content;
        let changed = false;

        // Update Password if provided
        if (configUpdates.password !== undefined) {
            const passwordLineRegex = /^Password=.*/m;
            const newPasswordLine = `Password=${configUpdates.password}`;
            if (passwordLineRegex.test(updatedContent)) {
                 updatedContent = updatedContent.replace(passwordLineRegex, newPasswordLine);
                 this.logger.debug(`RCON 配置文件中替换 Password 行。`);
            } else {
                 updatedContent = updatedContent.trim() + '\n' + newPasswordLine + '\n';
                 this.logger.debug(`RCON 配置文件中添加 Password 行。`);
            }
            changed = true;
        }

        // Update Port if provided
        if (configUpdates.port !== undefined) {
             const portLineRegex = /^Port=\d*/m;
             const newPortLine = `Port=${configUpdates.port}`;
             if (portLineRegex.test(updatedContent)) {
                  updatedContent = updatedContent.replace(portLineRegex, newPortLine);
                  this.logger.debug(`RCON 配置文件中替换 Port 行。`);
             } else {
                  updatedContent = updatedContent.trim() + '\n' + newPortLine + '\n';
                  this.logger.debug(`RCON 配置文件中添加 Port 行。`);
             }
             changed = true;
         }

        // Write file only if changes were made or if the file didn't exist initially
        if (changed || !fileExists) {
            try {
                 // Ensure the directory exists
                 const dirPath = path.dirname(configPath);
                 await fs.mkdir(dirPath, { recursive: true });

                await fs.writeFile(configPath, updatedContent, 'utf-8');
                this.logger.log(`RCON 配置文件 ${configPath} 已成功更新。`);
            } catch (writeError: any) {
                 this.logger.error(`写入 RCON 配置文件 ${configPath} 失败: ${writeError.message}`);
                 throw new InternalServerErrorException(`写入 RCON 配置文件 ${configFileName} 失败: ${writeError.message}`);
            }
        } else {
             this.logger.debug(`RCON 配置文件内容无需更新。`);
        }
    }

    // --- Helper to read RCON config (password and port) from file ---
    async readRconConfigFromFile(installPath: string): Promise<{ password?: string; port?: number }> {
        const configFileName = 'Rcon.cfg';
        const configPath = path.join(
            installPath,
            'SquadGame',
            'ServerConfig',
            configFileName
        );
        this.logger.debug(`尝试读取 RCON 配置从文件: ${configPath}`);
        let password = '';
        let port: number | undefined = undefined;

        try {
            const content = await fs.readFile(configPath, 'utf-8');
            
            // Parse Password
            const passwordMatch = content.match(/^Password=(.*)/m);
            if (passwordMatch && passwordMatch[1]) {
                password = passwordMatch[1].trim();
                this.logger.debug(`从 Rcon.cfg 中读取到密码。`);
            } else {
                 this.logger.warn(`在 ${configPath} 中未找到有效的 Password= 行。`);
            }

            // Parse Port
            const portMatch = content.match(/^Port=(\d+)/m);
             if (portMatch && portMatch[1]) {
                 const parsedPort = parseInt(portMatch[1], 10);
                 if (!isNaN(parsedPort) && parsedPort > 0) {
                     port = parsedPort;
                     this.logger.debug(`从 Rcon.cfg 中读取到端口: ${port}`);
                 } else {
                     this.logger.warn(`在 ${configPath} 中找到无效的 Port 值: ${portMatch[1]}`);
                 }
             } else {
                  this.logger.warn(`在 ${configPath} 中未找到有效的 Port= 行。`);
             }

             return { password, port };

        } catch (error: any) {
             if (error.code === 'ENOENT') {
                this.logger.warn(`RCON 配置文件 ${configPath} 不存在。`);
                // Return empty password and undefined port if file not found
                return { password: '', port: undefined }; 
            } else {
                this.logger.error(`读取 RCON 配置文件 ${configPath} 时出错: ${error.message}`);
                throw new InternalServerErrorException(`读取 Rcon.cfg 文件时出错: ${error.message}`);
            }
        }
    }

    async create(createServerInstanceDto: CreateServerInstanceDto): Promise<ServerInstance> {
        // Basic validation
        if (!createServerInstanceDto.installPath || !createServerInstanceDto.rconPassword) {
            throw new BadRequestException("安装路径和 RCON 密码不能为空");
        }

        const newInstance = this.serverInstanceRepository.create(createServerInstanceDto);

        // Validate install path existence roughly
        try {
            const stats = await fs.stat(newInstance.installPath);
            if (!stats.isDirectory()) {
                throw new BadRequestException(`提供的安装路径不是一个目录: ${newInstance.installPath}`);
            }
            // Deeper validation: check for SquadGame/Binaries structure?
        } catch (err: any) {
             if (err.code === 'ENOENT') {
                 throw new BadRequestException(`安装路径不存在: ${newInstance.installPath}`);
             } else {
                this.logger.error(`检查安装路径时出错 (${newInstance.installPath}): ${err}`);
                 throw new InternalServerErrorException("检查安装路径时发生错误");
             }
        }

        // --- Update Rcon.cfg before saving to DB ---
        try {
            await this._updateRconConfigFileContent(newInstance.installPath, { 
                password: newInstance.rconPassword, 
                port: newInstance.rconPort 
            });
        } catch (configError) {
             // If updating config file fails, prevent DB save and re-throw
             throw configError; 
        }
        // --- End Rcon.cfg update ---

        this.logger.log(`创建新的服务器实例配置并更新Rcon.cfg: ${newInstance.name}`);
        return this.serverInstanceRepository.save(newInstance);
    }

    async findAll(): Promise<ServerInstance[]> {
        this.logger.log('调用 findAll 获取所有服务器实例...');
        try {
            const instances = await this.serverInstanceRepository.find();
            this.logger.log(`数据库查询完成，找到 ${instances.length} 个实例。`);
            // Log the IDs found
            const instanceIds = instances.map(inst => inst.id);
            this.logger.verbose(`找到的实例 ID: [${instanceIds.join(', ')}]`);
            return instances;
        } catch (error) {
            this.logger.error(`findAll 查询数据库时出错: ${error.message}`, error.stack);
            throw new InternalServerErrorException('获取服务器实例列表时发生错误');
        }
    }

    async findOne(id: number): Promise<ServerInstance> {
        const instance = await this.serverInstanceRepository.findOneBy({ id });
        if (!instance) {
            throw new NotFoundException(`未找到 ID 为 ${id} 的服务器实例`);
        }
        // Return only DB data
        return instance;
    }

    async update(id: number, updateServerInstanceDto: UpdateServerInstanceDto): Promise<ServerInstance> {
        const instance = await this.findOne(id); // Use findOne to leverage existing not found check

        // Prevent updates if the server is running?
        if (this.runningServers.has(id)) {
            throw new ConflictException(`无法更新正在运行的服务器实例 ${id}。请先停止服务器。`);
        }

        // Merge updates into the existing instance
        // Only update fields that are actually provided in the DTO
        Object.assign(instance, updateServerInstanceDto);

        // Re-validate install path if it's changed?
        if (updateServerInstanceDto.installPath) {
            try {
                const stats = await fs.stat(instance.installPath);
                if (!stats.isDirectory()) {
                    throw new BadRequestException(`提供的安装路径不是一个目录: ${instance.installPath}`);
                }
            } catch (err: any) {
                 if (err.code === 'ENOENT') {
                     throw new BadRequestException(`安装路径不存在: ${instance.installPath}`);
                 } else {
                    this.logger.error(`检查更新的安装路径时出错 (${instance.installPath}): ${err}`);
                     throw new InternalServerErrorException("检查更新的安装路径时发生错误");
                 }
            }
        }

        // --- Update Rcon.cfg if password or port is provided ---
        if (updateServerInstanceDto.rconPassword !== undefined || updateServerInstanceDto.rconPort !== undefined) {
            this.logger.log(`检测到 RCON 配置更新请求 (ID: ${id})，尝试更新 Rcon.cfg 文件...`);
            try {
                // Pass the relevant updates from the DTO
                await this._updateRconConfigFileContent(instance.installPath, { 
                    password: updateServerInstanceDto.rconPassword, 
                    port: updateServerInstanceDto.rconPort 
                });
            } catch (configError) {
                // If updating config file fails, prevent DB save and re-throw
                 throw configError;
            }
        } else {
             this.logger.debug(`更新请求 (ID: ${id}) 未包含 RCON 密码或端口，跳过 Rcon.cfg 文件更新。`);
        }
        // --- End Rcon.cfg update ---

        this.logger.log(`更新服务器实例配置: ID ${id}`);
        return this.serverInstanceRepository.save(instance);
    }

    async remove(id: number): Promise<void> {
        if (this.runningServers.has(id)) {
            this.logger.warn(`尝试删除正在运行的服务器 ${id}，将先停止它。`);
            try {
                await this.stop(id);
            } catch (err: any) {
                this.logger.error(`删除前停止服务器 ${id} 失败: ${err.message}。继续尝试删除记录...`);
                 // Decide if deletion should proceed if stop fails?
                 // For now, we continue to delete the record.
            }
        }
        const result = await this.serverInstanceRepository.delete(id);
        if (result.affected === 0) {
            // Check if it was already deleted after a failed stop
            const exists = await this.serverInstanceRepository.findOneBy({ id });
            if (exists) {
                 throw new NotFoundException(`删除服务器实例 ${id} 失败，记录仍然存在。`);
            }
             // If it doesn't exist, it might have been deleted between stop and here, or never existed.
             this.logger.warn(`删除 ID 为 ${id} 的实例时发现记录不存在或已被删除。`);
        } else {
             this.logger.log(`已删除服务器实例配置: ID ${id}`);
        }
         // Ensure it's removed from the running map if somehow still present
         this.runningServers.delete(id);
    }

    async start(id: number): Promise<void> {
        if (this.runningServers.has(id)) {
            this.logger.warn(`服务器实例 ${id} 已在运行中。`);
            throw new ConflictException(`服务器实例 ${id} 已在运行中。`);
        }

        const instance = await this.findOne(id); // Fetch latest config from DB

        const executablePath = this.getServerExecutablePath(instance);
        if (!(await this.checkExecutable(executablePath))) {
            throw new InternalServerErrorException(`服务器可执行文件未找到或不可执行: ${executablePath}`);
        }

        const args = [
            `Port=${instance.gamePort}`,
            `QueryPort=${instance.queryPort}`,
            `BeaconPort=${instance.beaconPort}`, // Use the instance's beacon port
            '-log',
        ];
        if (instance.extraArgs) {
            args.push(...instance.extraArgs.split(' ').filter(arg => arg)); // Add extra args, filtering empty strings
        }

        this.logger.log(`尝试启动服务器 ${id} (${instance.name}): ${executablePath} ${args.join(' ')}`);

        try {
            // 更新数据库中服务器实例的运行状态
            instance.isRunning = true;
            await this.serverInstanceRepository.save(instance);
            this.logger.log(`已更新服务器 ${id} (${instance.name}) 状态为运行中`);

            const serverProcess = spawn(executablePath, args, {
                cwd: instance.installPath, // Often better to run from install dir root
                detached: process.platform !== 'win32', // Detach on non-Windows
                stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, capture stdout/stderr
            });

            this.logger.log(`服务器 ${id} (${instance.name}) 进程已启动 (PID: ${serverProcess.pid})`);

            // Add listeners after spawn
            serverProcess.stdout.on('data', (data) => {
                this.logger.log(`[${id} STDOUT]: ${data.toString().trim()}`);
            });
            serverProcess.stderr.on('data', (data) => {
                this.logger.error(`[${id} STDERR]: ${data.toString().trim()}`);
            });

            // Make the exit handler async to allow awaiting rcon.close()
            serverProcess.on('exit', async (code, signal) => { 
                this.logger.log(`服务器 ${id} (${instance.name}) 进程已退出，退出码: ${code}, 信号: ${signal}`);
                const serverInfo = this.runningServers.get(id);
                if (serverInfo) {
                    // Clear any pending RCON retry timeouts
                    if (serverInfo.rconRetryTimeout) {
                        clearTimeout(serverInfo.rconRetryTimeout);
                        serverInfo.rconRetryTimeout = undefined; // Clear timeout ID
                    }
                    // Attempt to close RCON connection if it exists
                    if (serverInfo.rcon) {
                        try {
                            await serverInfo.rcon.close(); // Now correctly awaited
                            this.logger.log(`RCON 连接已关闭 (服务器 ${id} 退出)`);
                        } catch (e: any) {
                            this.logger.warn(`关闭 RCON 连接时出错 (服务器 ${id} 退出): ${e.message}`);
                        }
                    }
                    this.runningServers.delete(id);
                }
                 // Update DB state regardless of whether it was in runningServers map
                 await this.updateServerRunningState(id, false);
                 // Remove update stream when server stops
                 const stream = this.updateStreams.get(id);
                 if (stream) {
                     stream.complete(); // Signal completion to subscribers
                     this.updateStreams.delete(id);
                 }
            });

            serverProcess.on('error', (err) => {
                this.logger.error(`启动服务器 ${id} (${instance.name}) 进程时出错: ${err.message}`);
                // Clean up if process failed to start properly
                this.runningServers.delete(id);
                this.updateServerRunningState(id, false).catch(dbErr => this.logger.error(`Failed to update DB state after process error for server ${id}: ${dbErr}`));
                 // Remove update stream on error
                 const stream = this.updateStreams.get(id);
                 if (stream) {
                     stream.error(err); // Signal error to subscribers
                     this.updateStreams.delete(id);
                 }
            });

            // Store the process and RCON info
            this.runningServers.set(id, { process: serverProcess, instance, rcon: null, rconConnecting: false });
            await this.updateServerRunningState(id, true);

            // Attempt initial RCON connection after a short delay
            setTimeout(() => this.connectRcon(id), 5000); // Connect after 5s

        } catch (err: any) {
            this.logger.error(`启动服务器实例 ${id} 时发生内部错误: ${err.message}`);
            throw new InternalServerErrorException(`启动服务器实例 ${id} 失败。`);
        }
    }

    async stop(id: number): Promise<void> {
        const serverInfo = this.runningServers.get(id);
        if (!serverInfo) {
            this.logger.warn(`尝试停止服务器 ${id}，但它不在运行中。`);
            return;
        }

        this.logger.log(`尝试停止服务器实例 ${id} (${serverInfo.instance.name})...`);

        // 更新数据库中服务器实例的运行状态
        await this.updateServerRunningState(id, false);
        this.logger.log(`已更新服务器 ${id} (${serverInfo.instance.name}) 状态为已停止`);

        // 1. Disconnect RCON if connected
         if (serverInfo.rcon) {
             this.logger.log(`关闭 RCON 连接 (服务器 ${id})`);
             try {
                await serverInfo.rcon.close();
             } catch (e: any) {
                // Log error but continue stopping process
                 this.logger.warn(`停止服务器 ${id} 时关闭 RCON 连接失败: ${e.message}`);
             }
             serverInfo.rcon = null;
         }
          // Clear any pending RCON retry timeouts
          if (serverInfo.rconRetryTimeout) {
              clearTimeout(serverInfo.rconRetryTimeout);
              serverInfo.rconRetryTimeout = undefined;
          }

        // 2. Terminate the process
        if (!serverInfo.process || serverInfo.process.exitCode !== null || serverInfo.process.signalCode !== null) {
            this.logger.warn(`服务器 ${id} 进程信息无效或已退出，无法终止。`);
            this.runningServers.delete(id); // Clean up map if process is invalid
            return;
        }

        // Check if PID exists before trying to kill
        const pid = serverInfo.process.pid;
        if (pid === undefined || pid === null) {
             this.logger.warn(`服务器 ${id} 进程 PID 无效，无法终止。`);
             this.runningServers.delete(id);
             return;
        }

        this.logger.log(`终止服务器进程 ${id} (PID: ${pid})`);
        const isWindows = process.platform === 'win32';
        try {
            if (isWindows) {
                // Forcefully kill the process and its children on Windows
                spawn('taskkill', ['/pid', pid.toString(), '/f', '/t'], { stdio: 'ignore' });
            } else {
                // Send SIGTERM first
                 process.kill(pid, 'SIGTERM'); // Use process.kill for cross-platform signals
                 // Optional: Add a timeout and then send SIGKILL if still alive
                 // setTimeout(() => {
                 //    try {
                 //        process.kill(pid, 0); // Check if process exists
                 //        this.logger.warn(`SIGTERM 超时，发送 SIGKILL 到服务器 ${id}`);
                 //        process.kill(pid, 'SIGKILL');
                 //    } catch (e) {
                 //        // Process already exited
                 //    }
                 // }, 5000);
            }
        } catch (killError: any) {
             this.logger.error(`终止进程 ${id} (PID: ${pid}) 出错: ${killError.message}`);
        }
    }

    private scheduleRconReconnect(id: number, delayMs: number): void {
        const serverInfo = this.runningServers.get(id);
        if (!serverInfo || serverInfo.rconConnecting || serverInfo.rcon) {
            return; // Don't schedule if already connecting, connected, or server stopped
        }

        // Clear existing timer if any
        if (serverInfo.rconRetryTimeout) {
            clearTimeout(serverInfo.rconRetryTimeout);
        }

        this.logger.log(`安排 ${delayMs / 1000} 秒后重新连接 RCON 到服务器 ${id}`);
        serverInfo.rconRetryTimeout = setTimeout(() => {
             serverInfo.rconRetryTimeout = undefined; // Clear the stored timeout ID
             if (this.runningServers.has(id)) { // Check if server is still supposed to be running
                 this.connectRcon(id);
             }
         }, delayMs);
         this.runningServers.set(id, serverInfo); // Update map with timeout ID
    }

    async connectRcon(id: number): Promise<void> {
        const serverInfo = this.runningServers.get(id);
        if (!serverInfo || serverInfo.rcon || serverInfo.rconConnecting) {
            this.logger.debug(`跳过 RCON 连接尝试: ${!serverInfo ? '服务器信息不存在' : serverInfo.rcon ? '已连接' : '正在连接'}`);
            return;
        }

        const { instance } = serverInfo;
        if (!instance.rconPassword || !instance.rconPort) {
             this.logger.warn(`服务器 ${id} (${instance.name}) 缺少 RCON 密码或端口，无法连接。`);
             return;
        }

        this.logger.log(`尝试连接到服务器 ${id} (${instance.name}) 的 RCON (localhost:${instance.rconPort})`);
        serverInfo.rconConnecting = true; // Set connecting flag

        let rcon: Rcon | null = null; // Declare rcon variable outside try block

        try {
            // Use squad-rcon constructor and init()
            rcon = new Rcon({
                id: instance.id, // Use server instance ID or another unique ID if needed
                host: '127.0.0.1', // Assuming localhost, adjust if needed
                port: instance.rconPort,
                password: instance.rconPassword,
                pingDelay: 60000, // Default ping delay
                autoReconnect: false, // Disable auto-reconnect, we handle it manually
                logEnabled: true, // Enable logging from the library
                // REMOVE the chatListeners block from here
                // chatListeners: { ... }
            });

            // Setup standard event listeners AFTER creating the rcon instance
            rcon.on('connected', () => {
                 if (this.runningServers.has(id)) { // Check if server still exists
                     this.logger.log(`成功连接到服务器 ${id} 的 RCON`);
                     const currentServerInfo = this.runningServers.get(id);
                     if (currentServerInfo) {
                         currentServerInfo.rcon = rcon; // Assign the connected instance
                         currentServerInfo.rconConnecting = false; // Clear connecting flag
                         // Clear retry timeout if connection successful
                         if (currentServerInfo.rconRetryTimeout) {
                              clearTimeout(currentServerInfo.rconRetryTimeout);
                              currentServerInfo.rconRetryTimeout = undefined;
                         }
                     } else {
                         // Server was removed while connecting, close this connection
                         rcon?.close().catch(e => this.logger.warn(`Closing orphaned RCON connection failed: ${e.message}`));
                     }
                 } else {
                     // Server was removed before connection completed, close this connection
                     this.logger.log(`Server ${id} removed before RCON could fully connect. Closing connection.`);
                     rcon?.close().catch(e => this.logger.warn(`Closing orphaned RCON connection failed: ${e.message}`));
                 }
            });

            rcon.on('close', () => {
                 this.logger.log(`RCON 连接已关闭 (服务器 ${id})`);
                     if (this.runningServers.has(id)) {
                     const currentServerInfo = this.runningServers.get(id);
                     if (currentServerInfo && currentServerInfo.rcon === rcon) { // Ensure it's the same instance being closed
                         currentServerInfo.rcon = null;
                         currentServerInfo.rconConnecting = false; // Reset connecting flag
                         // Schedule reconnect only if the server process is still running
                         if (currentServerInfo.process && !currentServerInfo.process.killed) {
                              this.scheduleRconReconnect(id, 15000); // Reconnect after 15s on close
                         }
                     }
                }
            });

            rcon.on('err', (error: Error) => {
                this.logger.error(`RCON 连接错误 (服务器 ${id}): ${error.message}`);
            if (this.runningServers.has(id)) {
                    const currentServerInfo = this.runningServers.get(id);
                    if (currentServerInfo) {
                         currentServerInfo.rcon = null; // Clear potentially broken RCON instance
                         currentServerInfo.rconConnecting = false; // Reset connecting flag
                         this.scheduleRconReconnect(id, 30000); // Reconnect after 30s on error
                    }
                }
            });

            // Add listener for raw data if needed (e.g., for commands without specific emitters)
            rcon.on('data', (data) => {
                // this.logger.debug(`[RCON Data ${id}]: ${JSON.stringify(data)}`);
            });

            // ADD listeners for specific game events using the standard emitter pattern
            rcon.on('CHAT_MESSAGE', async (data: TChatMessage) => { // Make the handler async
                // Log the raw data object to inspect its structure
                this.logger.debug(`[Raw Chat Data]: ${JSON.stringify(data)}`); 

                let teamId = '?';
                let squadId = '?';
                let playerName = data.name.trim(); // Use name from chat data initially

                // Fetch player list to get team/squad info (potential performance impact)
                if (serverInfo && serverInfo.rcon) { // Ensure rcon is still connected
                    try {
                        this.logger.debug(`[Chat Info Fetch] Getting player list for ${data.steamID}`);
                        const listPlayersResponse = await serverInfo.rcon.execute('ListPlayers');
                        this.logger.debug(`[Chat Info Fetch] ListPlayers Response received`);
                        
                        // Parse the ListPlayers response (this requires knowing the exact format)
                        // Assuming standard Squad format: "ID: <id> | Online IDs: EOS: <eosid> steam: <steamid> | Name: <name> | Team ID: <teamid> | Squad ID: <squadid> | Is Leader: <bool> | Role: <role>"
                        const players = listPlayersResponse.split('\n');
                        // Correct the key to lowercase 'steam:'
                        const playerLine = players.find(p => p.includes(`steam: ${data.steamID}`)); 
                        
                        if (playerLine) {
                            this.logger.debug(`[Chat Info Fetch] Found player line: ${playerLine}`);
                            const teamMatch = playerLine.match(/Team ID: (\d+)/);
                            const squadMatch = playerLine.match(/Squad ID: (\d+|None)/); // Squad ID can be 'None'
                            const nameMatch = playerLine.match(/Name: (.*?)(?:\s+\||$)/); // Extract name again from ListPlayers if needed

                            if (teamMatch) teamId = teamMatch[1];
                            if (squadMatch) squadId = squadMatch[1] === 'None' ? '?' : squadMatch[1]; // Map 'None' to '?'
                            if (nameMatch) playerName = nameMatch[1].trim(); // Update player name from ListPlayers if more accurate
                            this.logger.debug(`[Chat Info Fetch] Parsed Info - Team: ${teamId}, Squad: ${squadId}, Name: ${playerName}`);
                        } else {
                            this.logger.warn(`[Chat Info Fetch] Player ${data.steamID} not found in ListPlayers response.`);
                        }
                    } catch (listPlayersError: any) {
                        this.logger.error(`[Chat Info Fetch] Failed to get ListPlayers for team/squad info: ${listPlayersError.message}`);
                        // Proceed without team/squad info if ListPlayers fails
                    }
                }

                // Format the log message to include the chat type AND team/squad info
                const chatPrefix = data.chat ? `[${data.chat}]` : '[UnknownChat]';
                const teamSquadPrefix = `[T:${teamId} S:${squadId}]`;
                const logMessage = `${chatPrefix} ${teamSquadPrefix} ${playerName} (${data.steamID}): ${data.message}`;
                
                // Log to console with the new format
                this.logger.log(`[RCON Chat ${id}] ${logMessage}`); 
                
                // Write to file with the new format
                this.appendToChatLog(instance, logMessage).catch(err => {
                     this.logger.error(`写入服务器 ${id} 的聊天日志时出错: ${err.message}`);
                });
            });

            rcon.on('PLAYER_WARNED', (data: TPlayerWarned) => {
                 const logMessage = `Player Warned: ${JSON.stringify(data)}`;
                 this.logger.log(`[RCON Warn ${id}] ${logMessage}`);
                 this.appendToChatLog(instance, logMessage).catch(err => {
                     this.logger.error(`写入服务器 ${id} 的警告日志时出错: ${err.message}`);
                 });
            });

            rcon.on('PLAYER_KICKED', (data: TPlayerKicked) => {
                 const logMessage = `Player Kicked: ${JSON.stringify(data)}`;
                 this.logger.log(`[RCON Kick ${id}] ${logMessage}`);
                 this.appendToChatLog(instance, logMessage).catch(err => {
                      this.logger.error(`写入服务器 ${id} 的踢出日志时出错: ${err.message}`);
                 });
            });

            rcon.on('PLAYER_BANNED', (data: TPlayerBanned) => {
                 const logMessage = `Player Banned: ${JSON.stringify(data)}`;
                 this.logger.log(`[RCON Ban ${id}] ${logMessage}`);
                 this.appendToChatLog(instance, logMessage).catch(err => {
                      this.logger.error(`写入服务器 ${id} 的封禁日志时出错: ${err.message}`);
                 });
            });

            rcon.on('SQUAD_CREATED', (data: TSquadCreated) => {
                 const logMessage = `Squad Created: ${JSON.stringify(data)}`;
                 this.logger.log(`[RCON Squad ${id}] ${logMessage}`);
                 this.appendToChatLog(instance, logMessage).catch(err => {
                      this.logger.error(`写入服务器 ${id} 的小队日志时出错: ${err.message}`);
                 });
            });

            rcon.on('POSSESSED_ADMIN_CAMERA', (data: TPossessedAdminCamera) => {
                const logMessage = `Admin Camera Possessed: ${JSON.stringify(data)}`;
                 this.logger.log(`[RCON AdminCam ${id}] ${logMessage}`);
                 this.appendToChatLog(instance, logMessage).catch(err => {
                      this.logger.error(`写入服务器 ${id} 的管理员摄像机日志时出错: ${err.message}`);
                 });
            });

            rcon.on('UNPOSSESSED_ADMIN_CAMERA', (data: TUnPossessedAdminCamera) => {
                const logMessage = `Admin Camera Unpossessed: ${JSON.stringify(data)}`;
                 this.logger.log(`[RCON AdminCam ${id}] ${logMessage}`);
                 this.appendToChatLog(instance, logMessage).catch(err => {
                      this.logger.error(`写入服务器 ${id} 的管理员摄像机日志时出错: ${err.message}`);
                 });
            });

            // Now initialize the connection
            await rcon.init();

        } catch (error: any) {
             this.logger.error(`初始化 RCON 连接失败 (服务器 ${id}): ${error.message}`);
             if (rcon) {
                 // Attempt cleanup if instance was created but init failed
                 await rcon.close().catch(e => this.logger.warn(`Closing failed RCON connection failed: ${e.message}`));
             }
             const currentServerInfo = this.runningServers.get(id);
             if (currentServerInfo) {
                 currentServerInfo.rcon = null;
                 currentServerInfo.rconConnecting = false; // Reset connecting flag
                 this.scheduleRconReconnect(id, 60000); // Reconnect after 60s on initial connection failure
             }
        }
    }

    async sendRconCommand(id: number, command: string): Promise<string> {
        const serverInfo = this.runningServers.get(id);
        if (!serverInfo) {
            throw new NotFoundException(`服务器实例 ${id} 未运行或不存在。`);
        }
        if (!serverInfo.rcon) {
            throw new InternalServerErrorException(`服务器 ${id} 的 RCON 未连接。请稍后再试或检查连接状态。`);
        }

        this.logger.log(`向服务器 ${id} 发送 RCON 命令: ${command}`);
        try {
            // Use execute() from squad-rcon
            const response = await serverInfo.rcon.execute(command);
            this.logger.debug(`收到服务器 ${id} 的 RCON 响应`);
            return response; // squad-rcon's execute returns the response directly
        } catch (error: any) {
            this.logger.error(`发送 RCON 命令到服务器 ${id} 失败: ${error.message}`);
            // Check if the error indicates a connection issue and potentially trigger reconnect logic
            if (error.message.includes('Not connected') || error.message.includes('closed')) {
                 serverInfo.rcon = null; // Assume connection is dead
                 this.scheduleRconReconnect(id, 5000); // Quick reconnect attempt
                 throw new InternalServerErrorException(`RCON 连接丢失，无法发送命令。正在尝试重新连接...`);
            }
            throw new InternalServerErrorException(`发送 RCON 命令失败: ${error.message}`);
        }
    }

    // 获取服务器状态
    async getStatus(id: number): Promise<any> {
        const instanceFromDb = await this.findOne(id); // Get base config
        const serverInfo = this.runningServers.get(id);
        const isRunning = !!serverInfo;
        const pid = serverInfo?.process?.pid;

        let rconStatus = 'Disconnected';
        let players: number | null = null;
        let currentLevel: string | null = null; // Renamed from currentMap
        let currentLayer: string | null = null; // Added for Layer
        let currentFactions: string | null = null; // Added for Factions
        let nextLevel: string | null = null;
        let nextLayer: string | null = null;
        let nextFactions: string | null = null;
        // 添加玩家列表数组
        let playersList: any[] = [];
        // 添加最近离开的玩家列表
        let disconnectedPlayersList: any[] = [];

        if (isRunning && serverInfo?.rcon) { 
            rconStatus = 'Connected';
            try {
                // Fetch status sequentially with timing logs
                this.logger.debug(`[${id}] Fetching ListPlayers...`);
                const startTimeListPlayers = Date.now();
                const listPlayersResponse = await this.sendRconCommand(id, 'ListPlayers');
                this.logger.debug(`[${id}] Fetched ListPlayers in ${Date.now() - startTimeListPlayers}ms`);

                this.logger.debug(`[${id}] Fetching ShowCurrentMap...`);
                const startTimeCurrentMap = Date.now();
                const currentMapResponse = await this.sendRconCommand(id, 'ShowCurrentMap');
                this.logger.debug(`[${id}] Fetched ShowCurrentMap in ${Date.now() - startTimeCurrentMap}ms`);

                this.logger.debug(`[${id}] Fetching ShowNextMap...`);
                const startTimeNextMap = Date.now();
                const nextMapResponse = await this.sendRconCommand(id, 'ShowNextMap');
                this.logger.debug(`[${id}] Fetched ShowNextMap in ${Date.now() - startTimeNextMap}ms`);

                // Parse player count - Only count active players
                let activePlayerCount = 0;
                
                // 解析玩家列表
                const listPlayersOutput = listPlayersResponse.trim();
                
                // 调试输出完整的ListPlayers响应
                this.logger.debug(`[${id}] 完整的ListPlayers响应:\n${listPlayersOutput}`);
                
                // 分隔Active Players和Disconnected Players两部分
                const activeSectionMatch = listPlayersOutput.match(/----- Active Players -----([\s\S]*?)----- Recently Disconnected Players/);
                
                // 提取活跃玩家部分
                const activePlayersSection = activeSectionMatch ? activeSectionMatch[1].trim() : '';
                this.logger.debug(`[${id}] 分离出的活跃玩家部分:\n${activePlayersSection}`);
                
                // 提取最近离开玩家部分
                const disconnectedSectionMatch = listPlayersOutput.match(/----- Recently Disconnected Players[^-]+([\s\S]*?)$/);
                const disconnectedPlayersSection = disconnectedSectionMatch ? disconnectedSectionMatch[1].trim() : '';
                this.logger.debug(`[${id}] 分离出的最近离开玩家部分:\n${disconnectedPlayersSection}`);
                
                // 按行分割活跃玩家部分
                const activePlayerLines = activePlayersSection.split('\n').filter(line => line.trim());
                
                // 遍历每个活跃玩家的行
                activePlayerLines.forEach((line, index) => {
                    const playerLine = line.trim();
                    
                    // 解析玩家信息
                    // 格式: ID: 0 | Online IDs: EOS: 000293eaece14ead884a03d845013409 steam: 76561199150162540 | Name: Bot007 | Team ID: 1 | Squad ID: N/A | Is Leader: False | Role: WPMC_Rifleman_01
                    const playerInfo: any = {};
                    
                    // 解析ID
                    const idMatch = playerLine.match(/ID:\s*(\d+)/);
                    if (idMatch) playerInfo.id = idMatch[1].trim();
                    
                    // 解析EOS ID
                    const eosIdMatch = playerLine.match(/EOS:\s*([a-zA-Z0-9]+)/);
                    if (eosIdMatch) playerInfo.eosId = eosIdMatch[1].trim();
                    
                    // 解析Steam ID
                    const steamIdMatch = playerLine.match(/steam:\s*(\d+)/);
                    if (steamIdMatch) playerInfo.steamId = steamIdMatch[1].trim();
                    
                    // 解析名称
                    const nameMatch = playerLine.match(/Name:\s*([^|]+)/);
                    if (nameMatch) playerInfo.name = nameMatch[1].trim();
                    
                    // 解析队伍ID
                    const teamIdMatch = playerLine.match(/Team ID:\s*([^|]+)/);
                    if (teamIdMatch) playerInfo.team = teamIdMatch[1].trim();
                    
                    // 解析小队ID
                    const squadIdMatch = playerLine.match(/Squad ID:\s*([^|]+)/);
                    if (squadIdMatch) {
                        const squadValue = squadIdMatch[1].trim();
                        // 直接使用解析到的值，如果它是 "N/A"，则保留 "N/A"
                        playerInfo.squad = squadValue;
                    }
                    
                    // 解析是否为小队长
                    const isLeaderMatch = playerLine.match(/Is Leader:\s*([^|]+)/);
                    if (isLeaderMatch) {
                        const isLeaderValue = isLeaderMatch[1].trim().toLowerCase();
                        playerInfo.isLeader = isLeaderValue === 'true';
                    }
                    
                    // 解析角色
                    const roleMatch = playerLine.match(/Role:\s*([^|]+)/);
                    if (roleMatch) {
                        const roleValue = roleMatch[1].trim();
                        // 如果是行末，可能没有分隔符
                        playerInfo.role = roleValue.split('|')[0].trim();
                    }
                    
                    // 默认Ping值
                    playerInfo.ping = 0;
                    
                    // 如果玩家信息包含必要字段，添加到列表
                    if ((playerInfo.name || playerInfo.steamId) && playerInfo.id !== undefined) {
                        this.logger.debug(`[${id}] 解析到活跃玩家: ${JSON.stringify(playerInfo)}`);
                        playersList.push(playerInfo);
                        activePlayerCount++;
                    }
                });
                
                // 按行分割最近离开玩家部分
                const disconnectedPlayerLines = disconnectedPlayersSection.split('\n').filter(line => line.trim());
                
                // 遍历每个离开玩家的行
                disconnectedPlayerLines.forEach((line, index) => {
                    const playerLine = line.trim();
                    
                    // 解析离开玩家信息
                    // 格式: ID: 0 | Online IDs: EOS: 000293eaece14ead884a03d845013409 steam: 76561199150162540 | Since Disconnect: 03m.16s | Name:  Bot007
                    const playerInfo: any = {};
                    
                    // 解析ID
                    const idMatch = playerLine.match(/ID:\s*(\d+)/);
                    if (idMatch) playerInfo.id = idMatch[1].trim();
                    
                    // 解析EOS ID
                    const eosIdMatch = playerLine.match(/EOS:\s*([a-zA-Z0-9]+)/);
                    if (eosIdMatch) playerInfo.eosId = eosIdMatch[1].trim();
                    
                    // 解析Steam ID
                    const steamIdMatch = playerLine.match(/steam:\s*(\d+)/);
                    if (steamIdMatch) playerInfo.steamId = steamIdMatch[1].trim();
                    
                    // 解析名称
                    const nameMatch = playerLine.match(/Name:\s*([^$|]+)/);
                    if (nameMatch) playerInfo.name = nameMatch[1].trim();
                    
                    // 解析离开时间
                    const disconnectTimeMatch = playerLine.match(/Since Disconnect:\s*([^|]+)/);
                    if (disconnectTimeMatch) playerInfo.disconnectTime = disconnectTimeMatch[1].trim();
                    
                    // 如果离开玩家信息包含必要字段，添加到列表
                    if ((playerInfo.name || playerInfo.steamId) && playerInfo.id !== undefined) {
                        this.logger.debug(`[${id}] 解析到离开玩家: ${JSON.stringify(playerInfo)}`);
                        disconnectedPlayersList.push(playerInfo);
                    }
                });
                
                this.logger.debug(`[${id}] 最终解析出的活跃玩家数量: ${activePlayerCount}, 离开玩家数量: ${disconnectedPlayersList.length}`);
                
                // 设置总玩家数量
                players = activePlayerCount;

                // Parse current map/layer/factions
                // Example: "Current level is Al Basrah, layer is AlBasrah_AAS_v1, factions WPMC INS"
                const levelMatch = currentMapResponse.match(/Current level is ([^,]+)/);
                const layerMatch = currentMapResponse.match(/layer is ([^,]+)/);
                const factionsMatch = currentMapResponse.match(/factions (.*)$/);

                currentLevel = levelMatch ? levelMatch[1].trim() : '解析失败';
                currentLayer = layerMatch ? layerMatch[1].trim() : '解析失败';
                currentFactions = factionsMatch ? factionsMatch[1].trim() : '解析失败';

                // Parse next map
                const nextLevelMatch = nextMapResponse.match(/Next level is ([^,]+)/);
                const nextLayerMatch = nextMapResponse.match(/layer is ([^,]+)/);
                const nextFactionsMatch = nextMapResponse.match(/factions (.*)$/);

                nextLevel = nextLevelMatch ? nextLevelMatch[1].trim() : 'N/A';
                nextLayer = nextLayerMatch ? nextLayerMatch[1].trim() : 'N/A';
                nextFactions = nextFactionsMatch ? nextFactionsMatch[1].trim() : 'N/A';

            } catch (err: any) {
                this.logger.warn(`通过 RCON 获取服务器 ${id} 详细状态时出错: ${err.message}`);
                rconStatus = 'Error Querying';
            }
        } else if (isRunning && serverInfo?.rconConnecting) {
            rconStatus = 'Connecting...';
        } else if (isRunning && !serverInfo?.rcon) {
            rconStatus = 'Disconnected (Retrying...)';
        }

        return {
            ...instanceFromDb,
            isRunning,
            pid,
            rconStatus,
            playerCount: players,
            currentLevel: currentLevel,   // Return current level
            currentLayer: currentLayer,   // Return current layer
            currentFactions: currentFactions, // Return current factions
            nextMap: nextLevel, // 使用 nextLevel 替代旧的 nextMap
            nextLayer: nextLayer,
            nextFactions: nextFactions,
            players: playersList,          // 返回玩家列表
            recentlyDisconnectedPlayers: disconnectedPlayersList
        };
    }

    // 获取所有服务器状态
    async getAllStatuses(): Promise<any[]> {
        // 获取所有运行中的服务器实例
        const servers = await this.serverInstanceRepository.find({
            where: { isRunning: true }
        });
        
        // 如果没有运行中的服务器，返回空数组
        if (!servers || servers.length === 0) {
            return [];
        }

        // 获取每个服务器的状态
        const statusPromises = servers.map(server => this.getStatus(server.id));
        
        // 等待所有状态查询完成
        return Promise.all(statusPromises);
    }

    // --- Config Management --- //
    private getConfigPath(instance: ServerInstance, configFileName: string): string {
        // Ensure filename is safe (basic check)
        if (configFileName.includes('..') || !configFileName.endsWith('.cfg') && !configFileName.endsWith('.ini')) {
             throw new BadRequestException(`无效的配置文件名: ${configFileName}`);
        }
        return path.join(
            instance.installPath,
            'SquadGame',
            'ServerConfig',
            configFileName
        );
    }

    async readServerConfig(id: number, configFileName: string): Promise<string> {
        const instance = await this.findOne(id);
        const configPath = this.getConfigPath(instance, configFileName);
        this.logger.log(`读取配置文件: ${configPath}`);
        try {
            const fileContent = await fs.readFile(configPath, 'utf-8');
            // Return raw content for frontend editing (e.g., in a textarea)
            return fileContent;
            // Or parse and return object if needed:
            // return ini.parse(fileContent);
        } catch (error: any) {
            this.logger.error(`读取配置文件 ${configPath} 失败: ${error}`);
            if (error.code === 'ENOENT') {
                throw new NotFoundException(`配置文件 ${configFileName} 未找到`);
            }
            throw new InternalServerErrorException(`读取配置文件 ${configFileName} 失败`);
        }
    }

    async writeServerConfig(id: number, configFileName: string, configData: string): Promise<void> {
        const instance = await this.findOne(id);
        const configPath = this.getConfigPath(instance, configFileName);
        this.logger.log(`写入配置文件: ${configPath}`);

        try {
            // Optional: Backup existing file
             const backupPath = `${configPath}.bak-${Date.now()}`;
             try {
                await fs.copyFile(configPath, backupPath);
                this.logger.log(`已备份配置文件到: ${backupPath}`);
             } catch (backupError: any) {
                 if (backupError.code !== 'ENOENT') { // Ignore if original doesn't exist yet
                    this.logger.warn(`备份配置文件 ${configPath} 失败: ${backupError.message}`);
                 }
             }

            // Write the raw string content received from frontend/API
            await fs.writeFile(configPath, configData, 'utf-8');
            this.logger.log(`配置文件 ${configPath} 已更新`);

            if (this.runningServers.has(id)) {
                this.logger.warn(`配置文件 ${configFileName} 已修改，可能需要重启服务器 ${id} 或执行特定 RCON 命令才能生效。`);
                try {
                    await this.sendRconCommand(id, `AdminBroadcast 配置 ${configFileName} 已被后台更新。`);
                } catch (rconError) { /* Ignore notification error */ }
            }
        } catch (error: any) {
            this.logger.error(`写入配置文件 ${configPath} 失败: ${error}`);
            throw new InternalServerErrorException(`写入配置文件 ${configFileName} 失败`);
        }
    }

    // TODO: Method to discover running Squad processes not started by this manager?
    async loadRunningServersFromSystem(): Promise<void> {
        this.logger.log("服务启动，检查现有进程... (功能待实现)");
        // This is complex: requires platform-specific process listing (ps, tasklist),
        // matching command lines/PIDs to stored configurations, checking ports.
        // Placeholder for now.
    }

    async restart(id: number): Promise<void> {
        const serverInfo = this.runningServers.get(id);
        const instance = await this.findOne(id); // Get instance data regardless of running state
        this.logger.log(`收到重启服务器 ${id} (${instance.name}) 的请求...`);

        if (serverInfo) {
            this.logger.log(`服务器 ${id} 正在运行，将先停止它...`);
            try {
                await this.stop(id);
                // 等待 stop 完成并且 close 事件被处理 (或者超时)
                // 加一个短暂延时确保端口释放
                this.logger.log(`等待 3 秒以确保端口释放 (服务器 ${id})...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (err: any) {
                this.logger.error(`重启过程中停止服务器 ${id} 失败: ${err.message}。仍将尝试启动...`);
                // 即使停止失败，也继续尝试启动，因为进程可能已经崩溃或被外部杀死
            }
        } else {
            this.logger.log(`服务器 ${id} 当前未运行，将直接尝试启动...`);
        }

        // 无论之前是否运行，都尝试启动
        try {
            this.logger.log(`尝试启动服务器 ${id} 作为重启的一部分...`);
            await this.start(id);
            this.logger.log(`服务器 ${id} 重启命令已成功触发启动。`);
        } catch (err: any) {
             this.logger.error(`重启过程中启动服务器 ${id} 失败: ${err.message}`);
             // 如果启动失败，需要抛出异常让 Controller 知道
             throw new InternalServerErrorException(`重启服务器 ${id} 失败，启动步骤出错: ${err.message}`);
        }
    }

    // --- Ban List Management ---

    private getBansFilePath(installPath: string): string {
        // Construct the path to Bans.cfg relative to the server instance install path
        return path.join(installPath, 'SquadGame', 'ServerConfig', 'Bans.cfg');
    }

    async getBanList(id: number): Promise<BanEntry[]> {
        const serverInstance = await this.findOne(id);
        const bansFilePath = this.getBansFilePath(serverInstance.installPath);
        this.logger.log(`Reading ban list for server ${id} from: ${bansFilePath}`);

        try {
            const fileContent = await fs.readFile(bansFilePath, 'utf-8');
            const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '' && !line.trim().startsWith('//')); // Split lines, remove empty and comments
            
            const banEntries: BanEntry[] = lines.map(line => {
                // Basic parsing - This needs refinement based on exact format variations
                // Example format: John [SteamID 76561198000000000] Banned:EOS_ID_HERE:0 //Permanent ban
                // Ensure the interface now uses bannedEosId
                const entry: BanEntry = { originalLine: line, bannedEosId: '', expirationTimestamp: 0 }; 
                
                // Update the regex if EOS IDs have a different format than SteamIDs (e.g., non-numeric)
                // Assuming EOS ID is still captured by the first group after "Banned:"
                // const mainPartMatch = line.match(/Banned:([^:]+):(\d+)/); // Allow non-digits for EOS ID
                const mainPartMatch = line.match(/Banned:(\S+):(\d+)/); // Allow any non-space char for EOS ID and digits for timestamp

                if (mainPartMatch) {
                  entry.bannedEosId = mainPartMatch[1]; // Assign to bannedEosId
                  entry.expirationTimestamp = parseInt(mainPartMatch[2], 10) || 0;
                }

                const commentMatch = line.match(/\/\/(.*)$/);
                if (commentMatch) {
                    entry.comment = commentMatch[1].trim();
                }

                // Simpler Regex for admin info: Capture everything before " Banned:"
                const adminPartMatch = line.match(/^(.*?)\s+Banned:/);
                if (adminPartMatch) {
                    entry.adminNickname = adminPartMatch[1]?.trim();
                    entry.adminSteamId = undefined; // Reset as we don't parse it separately now
                } else {
                    this.logger.warn(`Could not parse admin part from line: ${line}`);
                }

                return entry;
            });

            return banEntries;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                this.logger.warn(`Bans.cfg not found for server ${id} at ${bansFilePath}. Returning empty list.`);
                return []; // File doesn't exist, return empty list
            } else {
                this.logger.error(`Error reading or parsing Bans.cfg for server ${id}: ${error}`, error.stack);
                throw new InternalServerErrorException('无法读取 Ban 列表文件。');
            }
        }
    }

    async unbanPlayer(id: number, lineToRemove: string): Promise<void> {
        const serverInstance = await this.findOne(id);
        const bansFilePath = this.getBansFilePath(serverInstance.installPath);
        this.logger.log(`Attempting to unban by removing line in: ${bansFilePath}`);
        this.logger.log(`Line to remove: ${lineToRemove}`);

        try {
            const fileContent = await fs.readFile(bansFilePath, 'utf-8');
            const lines = fileContent.split(/\r?\n/);
            
            // Filter out the exact line to remove
            // Use trim() comparison in case of extra whitespace issues
            const updatedLines = lines.filter(line => line.trim() !== lineToRemove.trim());
            
            if (lines.length === updatedLines.length) {
                this.logger.warn(`Line not found in Bans.cfg for removal: ${lineToRemove}`);
                // Optionally throw an error or just return if line not found
                // throw new NotFoundException('指定的 Ban 条目未找到。'); 
                return; // Silently succeed if line not found?
            }

            const updatedContent = updatedLines.join('\n');
            await fs.writeFile(bansFilePath, updatedContent, 'utf-8');
            this.logger.log(`Successfully removed line and updated ${bansFilePath}`);

        } catch (error: any) {
            if (error.code === 'ENOENT') {
                this.logger.error(`Cannot unban: Bans.cfg not found for server ${id} at ${bansFilePath}.`);
                throw new NotFoundException('Ban 列表文件不存在。');
            } else {
                this.logger.error(`Error reading or writing Bans.cfg during unban for server ${id}: ${error}`, error.stack);
                throw new InternalServerErrorException('解 Ban 操作失败。');
            }
        }
    }

    // 添加手动Ban到服务器
    async addManualBan(id: number, addManualBanDto: AddManualBanDto, username: string): Promise<void> {
        const serverInstance = await this.findOne(id);
        const bansFilePath = this.getBansFilePath(serverInstance.installPath);
        this.logger.log(`尝试添加手动Ban记录到: ${bansFilePath}`);
        
        try {
            // 先确保Bans.cfg目录存在
            const dirPath = path.dirname(bansFilePath);
            await fs.mkdir(dirPath, { recursive: true });
            
            // 读取现有内容（如果文件存在）
            let existingContent = '';
            try {
                existingContent = await fs.readFile(bansFilePath, 'utf-8');
            } catch (err: any) {
                if (err.code !== 'ENOENT') {
                    // 如果是除了文件不存在以外的错误，抛出
                    throw err;
                }
                // 文件不存在，将使用空字符串
                this.logger.warn(`Bans.cfg不存在，将创建新文件: ${bansFilePath}`);
            }
            
            // 检查玩家是否已在封禁列表中
            const lines = existingContent.split(/\r?\n/);
            const eosIdPattern = new RegExp(`Banned:${addManualBanDto.eosId}:`, 'i');
            
            // 获取当前时间戳（秒）
            const currentTimestamp = Math.floor(Date.now() / 1000);
            
            // 标记是否找到有效的（未过期的）ban记录
            let activeExistingBan = false;
            
            // 遍历所有行，检查是否有该玩家的未过期ban记录
            for (const line of lines) {
                if (eosIdPattern.test(line)) {
                    // 找到匹配的EOS ID，解析时间戳
                    // 格式：AdminName Banned:EOSID:TIMESTAMP //COMMENT
                    const timestampMatch = line.match(/Banned:[^:]+:(\d+)/i);
                    if (timestampMatch && timestampMatch[1]) {
                        const banTimestamp = parseInt(timestampMatch[1]);
                        
                        // 如果时间戳为0，表示永久ban；或者时间戳大于当前时间，表示ban尚未过期
                        if (banTimestamp === 0 || banTimestamp > currentTimestamp) {
                            activeExistingBan = true;
                            break;
                        }
                        // 如果时间戳小于当前时间，表示ban已过期，可以继续添加
                        this.logger.log(`该玩家(EOS ID: ${addManualBanDto.eosId})存在过期的ban记录，允许添加新ban`);
                    }
                }
            }
            
            // 如果存在未过期的ban记录，抛出异常
            if (activeExistingBan) {
                throw new ConflictException(`该玩家(EOS ID: ${addManualBanDto.eosId})已经在有效的封禁列表中。`);
            }
            
            // 使用传入的用户名作为管理员名称
            const adminName = username;
            
            // 确保有评论，如果没有提供则使用默认值
            const comment = addManualBanDto.comment.trim() || '违反服务器规则';
            
            // 使用timestamp作为封禁时长
            // 格式: 用户名 Banned:EOS ID:unixtimestamp //封禁原因
            const timestamp = addManualBanDto.isPermanent ? 0 : (addManualBanDto.expirationTimestamp || 0);
            const formattedBanEntry = `${adminName} Banned:${addManualBanDto.eosId}:${timestamp} //${comment}`;
            
            // 添加到文件末尾
            let newContent: string;
            if (existingContent.trim() === '') {
                newContent = formattedBanEntry;
            } else if (existingContent.endsWith('\n')) {
                newContent = existingContent + formattedBanEntry;
            } else {
                newContent = existingContent + '\n' + formattedBanEntry;
            }
            
            // 写入文件
            await fs.writeFile(bansFilePath, newContent, 'utf-8');
            this.logger.log(`成功添加Ban记录到 ${bansFilePath}`);
            
            // 如果服务器正在运行，发送通知
            if (this.runningServers.has(id)) {
                try {
                    await this.sendRconCommand(id, `AdminBroadcast Ban列表已被后台更新。`);
                } catch (rconError) {
                    // 忽略通知错误，不影响主要功能
                    this.logger.warn(`发送Ban更新通知时出错: ${rconError.message}`);
                }
            }
        } catch (error: any) {
            this.logger.error(`添加Ban记录到 ${bansFilePath} 失败: ${error.message}`);
            throw error instanceof HttpException 
                ? error 
                : new InternalServerErrorException(`添加Ban记录失败: ${error.message}`);
        }
    }

    // 编辑Ban记录
    async editBan(id: number, editBanDto: { originalLine: string; newComment: string; newExpirationTimestamp: number }, username: string): Promise<void> {
        const serverInstance = await this.findOne(id);
        const bansFilePath = this.getBansFilePath(serverInstance.installPath);
        this.logger.log(`尝试编辑Ban记录: ${bansFilePath}`);
        
        try {
            // 读取现有内容
            let existingContent = '';
            try {
                existingContent = await fs.readFile(bansFilePath, 'utf-8');
            } catch (err: any) {
                if (err.code === 'ENOENT') {
                    throw new NotFoundException(`Ban配置文件不存在: ${bansFilePath}`);
                }
                throw err;
            }
            
            // 将文件内容分割成行
            const lines = existingContent.split(/\r?\n/);
            
            // 找到原始行的索引
            const lineIndex = lines.findIndex(line => line === editBanDto.originalLine);
            if (lineIndex === -1) {
                throw new NotFoundException('未找到要编辑的Ban记录');
            }
            
            // 解析原始行以获取EOS ID
            // 原始格式：AdminName Banned:EOSID:TIMESTAMP //COMMENT
            const originalLine = lines[lineIndex];
            const eosIdMatch = originalLine.match(/Banned:([^:]+):/i);
            if (!eosIdMatch || !eosIdMatch[1]) {
                throw new BadRequestException('无法解析原始Ban记录中的EOS ID');
            }
            
            const eosId = eosIdMatch[1];
            const comment = editBanDto.newComment.trim() || '违反服务器规则';
            
            // 创建新的Ban记录行，使用新的管理员名称、时间戳和评论
            const newLine = `${username} Banned:${eosId}:${editBanDto.newExpirationTimestamp} //${comment}`;
            
            // 替换原始行
            lines[lineIndex] = newLine;
            
            // 写回文件
            await fs.writeFile(bansFilePath, lines.join('\n'), 'utf-8');
            
            this.logger.log(`成功编辑Ban记录: ${bansFilePath}`);
            
            // 如果服务器正在运行，发送通知
            if (this.runningServers.has(id)) {
                try {
                    await this.sendRconCommand(id, `AdminBroadcast Ban列表已被后台更新。`);
                } catch (rconError) {
                    // 忽略通知错误，不影响主要功能
                    this.logger.warn(`发送Ban更新通知时出错: ${rconError.message}`);
                }
            }
        } catch (error: any) {
            this.logger.error(`编辑Ban记录失败: ${error.message}`);
            throw error instanceof HttpException 
                ? error 
                : new InternalServerErrorException(`编辑Ban记录失败: ${error.message}`);
        }
    }

    // --- End Ban List Management ---

    // --- Admin Config Management ---

    private getAdminsFilePath(installPath: string): string {
        return path.join(installPath, 'SquadGame', 'ServerConfig', 'Admins.cfg');
    }

    // Helper to read all lines, preserving order and type
    private async readAdminLines(filePath: string): Promise<string[]> {
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            return fileContent.split(/\r?\n/);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                this.logger.warn(`Admins.cfg not found at ${filePath}. Returning empty array.`);
                return []; // File doesn't exist
            } else {
                this.logger.error(`Error reading Admins.cfg at ${filePath}: ${error}`, error.stack);
                throw new InternalServerErrorException('无法读取管理员配置文件。');
            }
        }
    }

    // Helper to write lines back to the file
    private async writeAdminLines(filePath: string, lines: string[]): Promise<void> {
         try {
              const dirPath = path.dirname(filePath);
              await fs.mkdir(dirPath, { recursive: true }); // Ensure directory exists
             const content = lines.join('\n'); // Use \n for consistency?
             await fs.writeFile(filePath, content, 'utf-8');
             this.logger.log(`Successfully wrote ${lines.length} lines to ${filePath}`);
         } catch (error: any) {
              this.logger.error(`Error writing Admins.cfg at ${filePath}: ${error}`, error.stack);
              throw new InternalServerErrorException('无法写入管理员配置文件。');
         }
    }

    async getAdminConfig(id: number): Promise<FullAdminConfig> {
        const serverInstance = await this.findOne(id);
        const adminsFilePath = this.getAdminsFilePath(serverInstance.installPath);
        this.logger.log(`Reading admin config for server ${id} from: ${adminsFilePath}`);

        const result: FullAdminConfig = { groups: [], admins: [], otherLines: [] };

        try {
            const fileContent = await fs.readFile(adminsFilePath, 'utf-8');
            const lines = fileContent.split(/\r?\n/);

            lines.forEach(line => {
                const trimmedLine = line.trim();

                if (trimmedLine === '' || trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) {
                    // Preserve comments and empty lines
                    result.otherLines.push(line); 
                    return;
                }

                // Parse Group lines: Group=GroupName:perm1,perm2,perm3
                const groupMatch = trimmedLine.match(/^Group=([^:]+):(.*)$/i);
                if (groupMatch) {
                    const name = groupMatch[1].trim();
                    const permissions = groupMatch[2].split(',').map(p => p.trim()).filter(p => p !== '');
                    result.groups.push({ name, permissions, originalLine: line });
                    return;
                }

                // Parse Admin lines: Admin=SteamID64:GroupName // Optional Comment
                const adminMatch = trimmedLine.match(/^Admin=(\d+):([^\/\s]+)(?:\s*\/\/(.*))?$/i);
                if (adminMatch) {
                    const steamId = adminMatch[1];
                    const groupName = adminMatch[2].trim();
                    const comment = adminMatch[3]?.trim();
                    result.admins.push({ steamId, groupName, comment, originalLine: line });
                    return;
                }

                // If it's not a group, admin, comment, or empty line, treat as 'other'
                this.logger.warn(`Unrecognized line format in Admins.cfg: ${line}`);
                result.otherLines.push(line);
            });

            return result;

        } catch (error: any) {
            if (error.code === 'ENOENT') {
                this.logger.warn(`Admins.cfg not found for server ${id} at ${adminsFilePath}. Returning empty config.`);
                return result; // File doesn't exist, return empty structure
            } else {
                this.logger.error(`Error reading or parsing Admins.cfg for server ${id}: ${error}`, error.stack);
                throw new InternalServerErrorException('无法读取管理员配置文件。');
            }
        }
    }
    
    // --- Add Group Method ---
    async addGroup(id: number, addGroupDto: AddGroupDto): Promise<void> {
        const serverInstance = await this.findOne(id);
        const adminsFilePath = this.getAdminsFilePath(serverInstance.installPath);
        this.logger.log(`Attempting to add group "${addGroupDto.name}" to ${adminsFilePath}`);

        const lines = await this.readAdminLines(adminsFilePath);

        // Check if group already exists
        const groupExists = lines.some(line => {
            const match = line.trim().match(/^Group=([^:]+):/i);
            return match && match[1].trim().toLowerCase() === addGroupDto.name.trim().toLowerCase();
        });
        if (groupExists) {
            throw new ConflictException(`权限组 "${addGroupDto.name}" 已存在。`);
        }

        // Format the new group line
        const newGroupLine = `Group=${addGroupDto.name.trim()}:${addGroupDto.permissions.join(',')}`;

        // Add the new line (e.g., append it, or find a suitable place like after other Group lines)
        // Simple approach: append before the first admin line or at the end
        let inserted = false;
        const newLines: string[] = [];
        for (const line of lines) {
            if (!inserted && line.trim().toLowerCase().startsWith('admin=')) {
                 newLines.push(newGroupLine);
                 inserted = true;
            }
            newLines.push(line);
        }
        if (!inserted) {
            // If no admin lines were found, append at the end
            // Maybe add a newline before if the last line wasn't empty
            if (lines.length > 0 && lines[lines.length-1].trim() !== '') {
                newLines.push(''); // Add an empty line for separation
            }
            newLines.push(newGroupLine);
        }

        await this.writeAdminLines(adminsFilePath, newLines);
        this.logger.log(`Successfully added group "${addGroupDto.name}" to ${adminsFilePath}`);
    }

    // --- Delete Group Method ---
    async deleteGroup(id: number, groupName: string): Promise<void> {
        const serverInstance = await this.findOne(id);
        const adminsFilePath = this.getAdminsFilePath(serverInstance.installPath);
        const targetGroupNameLower = groupName.trim().toLowerCase();
        this.logger.log(`Attempting to delete group "${groupName}" from ${adminsFilePath}`);

        const lines = await this.readAdminLines(adminsFilePath);
        let groupFound = false;

        const updatedLines = lines.filter(line => {
            const trimmedLine = line.trim();
            // Check group definition
            const groupMatch = trimmedLine.match(/^Group=([^:]+):/i);
            if (groupMatch && groupMatch[1].trim().toLowerCase() === targetGroupNameLower) {
                groupFound = true;
                this.logger.log(`Removing Group definition line: ${line}`);
                return false; // Remove this line
            }
            // Check admin assignments to this group
            const adminMatch = trimmedLine.match(/^Admin=(\d+):([^\/s]+)/i);
            if (adminMatch && adminMatch[2].trim().toLowerCase() === targetGroupNameLower) {
                this.logger.log(`Removing Admin assignment line for group ${groupName}: ${line}`);
                return false; // Remove this line
            }
            return true; // Keep other lines
        });

        if (!groupFound) {
            throw new NotFoundException(`权限组 "${groupName}" 未找到。`);
        }
        if (lines.length === updatedLines.length) {
             // This case shouldn't happen if groupFound is true, but good safety check
             this.logger.warn(`Group "${groupName}" definition was found, but no lines were removed?`);
        }

        await this.writeAdminLines(adminsFilePath, updatedLines);
        this.logger.log(`Successfully removed group "${groupName}" and associated admins from ${adminsFilePath}`);
    }

    // --- Add Admin Method ---
    async addAdmin(id: number, addAdminDto: AddAdminDto): Promise<void> {
        // Log the received DTO and steamId specifically
        this.logger.log(`[addAdmin] Received DTO for server ${id}:`, addAdminDto);
        this.logger.log(`[addAdmin] Received steamId type: ${typeof addAdminDto.steamId}, value: "${addAdminDto.steamId}"`);
        
        const serverInstance = await this.findOne(id);
        const adminsFilePath = this.getAdminsFilePath(serverInstance.installPath);
        this.logger.log(`Attempting to add admin "${addAdminDto.steamId}" to ${adminsFilePath}`);

        const lines = await this.readAdminLines(adminsFilePath);

        // Check if admin already exists
        const adminExists = lines.some(line => {
            const match = line.trim().match(/^Admin=(\d+):/i);
            return match && match[1].trim() === addAdminDto.steamId;
        });
        if (adminExists) {
            throw new ConflictException(`管理员 "${addAdminDto.steamId}" 已存在。`);
        }

        // Format the new admin line
        const newAdminLine = `Admin=${addAdminDto.steamId}:${addAdminDto.groupName}`;

        // Add the new line (e.g., append it, or find a suitable place like after other admin lines)
        // Simple approach: append before the first admin line or at the end
        let inserted = false;
        const newLines: string[] = [];
        for (const line of lines) {
            if (!inserted && line.trim().toLowerCase().startsWith('admin=')) {
                 newLines.push(newAdminLine);
                 inserted = true;
            }
            newLines.push(line);
        }
        if (!inserted) {
            // If no admin lines were found, append at the end
            // Maybe add a newline before if the last line wasn't empty
            if (lines.length > 0 && lines[lines.length-1].trim() !== '') {
                newLines.push(''); // Add an empty line for separation
            }
            newLines.push(newAdminLine);
        }

        await this.writeAdminLines(adminsFilePath, newLines);
        this.logger.log(`Successfully added admin "${addAdminDto.steamId}" to ${adminsFilePath}`);
    }

    // --- Delete Admin Method ---
    async deleteAdmin(id: number, steamId: string, groupName: string): Promise<void> {
        const serverInstance = await this.findOne(id);
        const adminsFilePath = this.getAdminsFilePath(serverInstance.installPath);
        const targetGroupNameLower = groupName.trim().toLowerCase();
        this.logger.log(`Attempting to delete admin ${steamId} from group ${groupName} in ${adminsFilePath}`);

        const lines = await this.readAdminLines(adminsFilePath);
        let assignmentFound = false;

        const updatedLines = lines.filter(line => {
            const adminMatch = line.trim().match(/^Admin=(\d+):([^\/s]+)/i);
            if (adminMatch && 
                adminMatch[1] === steamId && 
                adminMatch[2].trim().toLowerCase() === targetGroupNameLower) {
                assignmentFound = true;
                this.logger.log(`Removing Admin assignment line: ${line}`);
                return false; // Remove this line
            }
            return true; // Keep other lines
        });

        if (!assignmentFound) {
            throw new NotFoundException(`未找到管理员 ${steamId} 在组 "${groupName}" 中的分配记录。`);
        }
        if (lines.length === updatedLines.length) {
            this.logger.warn(`Admin assignment for ${steamId} in group ${groupName} was searched, but no lines were removed?`);
        }

        await this.writeAdminLines(adminsFilePath, updatedLines);
        this.logger.log(`Successfully removed admin ${steamId} from group ${groupName} in ${adminsFilePath}`);
    }

    // --- End Admin Config Management ---

    // 辅助方法：更新服务器的运行状态到数据库
    private async updateServerRunningState(id: number, isRunning: boolean): Promise<void> {
        try {
            await this.serverInstanceRepository.update(id, { isRunning });
            this.logger.log(`服务器 ${id} 的运行状态已更新为 ${isRunning ? '运行中' : '已停止'}`);
        } catch (err: any) {
            this.logger.error(`更新服务器 ${id} 的运行状态失败: ${err.message}`);
            throw err;
        }
    }

    // --- SSE Stream Management ---
    getUpdateStream(id: number): Subject<MessageEvent> {
        if (!this.updateStreams.has(id)) {
            this.logger.log(`Creating new SSE stream subject for update ID: ${id}`);
            const subject = new Subject<MessageEvent>();
            this.updateStreams.set(id, subject);
            // Clean up the stream when it completes or errors
            subject.subscribe({
                error: () => {
                    this.logger.log(`SSE stream for update ${id} errored. Cleaning up.`);
                    this.updateStreams.delete(id);
                    this.activeUpdates.delete(id); // Also ensure active update flag is cleared
                },
                complete: () => {
                    this.logger.log(`SSE stream for update ${id} completed. Cleaning up.`);
                    this.updateStreams.delete(id);
                    this.activeUpdates.delete(id); // Also ensure active update flag is cleared
                }
            });
        }
        return this.updateStreams.get(id)!; // Non-null assertion as we just created it if missing
    }

    // --- New Update Method using SSE ---
    async updateGameFiles(id: number, steamCmdPath: string): Promise<void> {
        this.logger.log(`收到更新服务器 ${id} 游戏文件的请求 (SteamCMD Path: ${steamCmdPath})...`);
        const instance = await this.findOne(id);
        const subject = this.getUpdateStream(id); // Get or create the stream subject

        // Check if server is running
        if (instance.isRunning) {
            const errorMsg = '服务器正在运行，请先停止后再更新。';
            this.logger.warn(`服务器 ${id}: ${errorMsg}`);
            subject.next({ data: { type: 'error', message: errorMsg } });
            subject.complete(); // Close the stream
            throw new BadRequestException(errorMsg);
        }

        // Check if an update is already in progress
        if (this.activeUpdates.has(id) && this.updateStreams.has(id)) {
             // Check if the stream is already active for this update
            const warningMsg = '此服务器的更新已经在进行中。';
            this.logger.warn(`服务器 ${id}: ${warningMsg}`);
             // Send a message to any *new* subscriber, but don't create a new process
            subject.next({ data: { type: 'log', message: warningMsg } });
             // Do not complete here, let the original process finish
            // Re-throw the exception to prevent starting a duplicate process via controller
            throw new ConflictException(warningMsg);
        }
        // Mark update as active *before* starting the process
        this.activeUpdates.add(id);

        const installPath = instance.installPath;

        // Check SteamCMD path
        try {
            const fs = require('fs'); // Use require for sync check here, consider async if preferred
            if (!fs.existsSync(steamCmdPath)) {
                const errorMsg = `SteamCMD路径不存在: ${steamCmdPath}`;
                this.logger.error(errorMsg);
                subject.next({ data: { type: 'error', message: errorMsg } });
                subject.error(new Error(errorMsg)); // Signal stream error
                // No need to delete from activeUpdates/updateStreams here, subject error handler does it
                return; // Exit the function
            }
        } catch (error: any) {
            const errorMsg = `检查SteamCMD路径时出错: ${error.message}`;
            this.logger.error(errorMsg);
            subject.next({ data: { type: 'error', message: errorMsg } });
            subject.error(new Error(errorMsg)); // Signal stream error
            return; // Exit the function
        }

        this.logger.log(`服务器 ${id}: 开始使用 steamcmd (${steamCmdPath}) 更新，安装目录: ${installPath}`);
        subject.next({ data: { type: 'log', message: `开始使用 steamcmd (${steamCmdPath}) 更新，安装目录: ${installPath}` } });

        const steamCmdArgs = [
            `+force_install_dir`, installPath,
            `+login`, `anonymous`,
            `+app_update`, this.SQUAD_APP_ID, `validate`,
            `+quit`
        ];

        try {
            const spawnOptions: any = {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env }
            };

            if (process.platform !== 'win32') {
                spawnOptions.env.HOME = '/home/steam'; // Default for steamcmd docker images often
                subject.next({ data: { type: 'log', message: '检测到Linux/Unix平台，设置HOME环境变量为/home/steam' } });
            } else {
                subject.next({ data: { type: 'log', message: '检测到Windows平台' } });
            }

            const updateProcess = spawn(steamCmdPath, steamCmdArgs, spawnOptions);

            updateProcess.stdout?.on('data', (data) => {
                const line = data.toString().trim();
                if (line) {
                    this.logger.debug(`[SteamCMD Update ${id} STDOUT]: ${line}`);
                    subject.next({ data: { type: 'log', message: line } }); // Send log line via SSE
                    if (line.includes('invalidplatform')) {
                         subject.next({ data: { type: 'error', message: 'SteamCMD平台错误: 当前SteamCMD版本与您的系统不兼容，请下载正确的SteamCMD版本' } });
                         // Consider stopping the process here if possible/desired
                    }
                }
            });

            updateProcess.stderr?.on('data', (data) => {
                const line = data.toString().trim();
                if (line) {
                    this.logger.warn(`[SteamCMD Update ${id} STDERR]: ${line}`);
                    // Send stderr lines as logs, potentially prefixed
                    subject.next({ data: { type: 'log', message: `[STDERR] ${line}` } });
                }
            });

            updateProcess.on('error', (err) => {
                const errorMsg = `启动 steamcmd 进程失败: ${err.message}`;
                this.logger.error(`启动 steamcmd 进程失败 (服务器 ${id}): ${err.message}`);
                subject.next({ data: { type: 'error', message: errorMsg } });
                subject.error(new Error(errorMsg)); // Signal stream error
                // Cleanup is handled by subject's error handler
            });

            updateProcess.on('close', (code) => {
                if (code === 0) {
                    const completionMsg = '游戏文件更新成功完成。';
                    this.logger.log(`服务器 ${id} steamcmd 更新成功完成 (退出码: ${code})。`);
                    subject.next({ data: { type: 'complete', message: completionMsg } });
                    subject.complete(); // Signal successful completion
                } else {
                    const errorMsg = `SteamCMD 更新进程意外退出，错误码: ${code}。请检查日志获取详细信息。`;
                    this.logger.error(`服务器 ${id} steamcmd 更新失败 (退出码: ${code})。`);
                    subject.next({ data: { type: 'error', message: errorMsg } });
                    subject.error(new Error(errorMsg)); // Signal stream error
                }
                // Cleanup is handled by subject's complete/error handler
            });

        } catch (error: any) {
            const errorMsg = `执行更新时发生意外错误: ${error.message}`;
            this.logger.error(`执行 steamcmd 更新时捕获到意外错误 (服务器 ${id}): ${error}`);
            subject.next({ data: { type: 'error', message: errorMsg } });
            subject.error(new Error(errorMsg)); // Signal stream error
            // Cleanup is handled by subject's error handler
        }
        // Note: The function now implicitly returns Promise<void> as before,
        // but the actual result notification happens via the SSE stream.
    }
     // --- End New Update Method ---

    private getChatLogPath(installPath: string, serverId: number): string {
        return path.join(
            installPath,
            'SquadGame',
            'Saved',
            'Logs',
            `RconChat_${serverId}.log`
        );
    }

    private async appendToChatLog(instance: ServerInstance, message: string): Promise<void> {
        const logPath = this.getChatLogPath(instance.installPath, instance.id);
        this.logger.debug(`[Chat Log Attempt] Server ID: ${instance.id}, Path: ${logPath}`); // Log the attempt and path
        try {
            const dirPath = path.dirname(logPath);
            this.logger.debug(`[Chat Log Attempt] Ensuring directory exists: ${dirPath}`);
            await fs.mkdir(dirPath, { recursive: true });
            this.logger.debug(`[Chat Log Attempt] Directory ensured/exists: ${dirPath}`);

            const timestamp = new Date().toISOString();
            const logLine = `[${timestamp}] ${message}${os.EOL}`;
            this.logger.debug(`[Chat Log Attempt] Appending to file: ${logPath}`);
            await fs.appendFile(logPath, logLine, 'utf-8');
            this.logger.debug(`[Chat Log Success] Appended to file: ${logPath}`);
        } catch (error: any) {
            // Log the specific error encountered during mkdir or appendFile
            this.logger.error(`[Chat Log Failure] Server ID: ${instance.id}, Path: ${logPath}, Error: ${error.message}`, error.stack);
        }
    }

    // --- Add method to read chat log ---
    async readChatLog(id: number): Promise<string> {
        const instance = await this.findOne(id); // findOne already throws NotFoundException
        const logPath = this.getChatLogPath(instance.installPath, instance.id);
        this.logger.debug(`尝试读取聊天日志文件: ${logPath}`);
        try {
            // Ensure the directory exists before trying to read
             const dirPath = path.dirname(logPath);
             try {
                 await fs.access(dirPath); // Check if directory exists
             } catch (dirErr: any) {
                 if (dirErr.code === 'ENOENT') {
                     this.logger.warn(`聊天日志目录 ${dirPath} 不存在，返回空日志。`);
                     return ''; // Return empty string if directory doesn't exist
                 }
                 throw dirErr; // Re-throw other directory access errors
             }

            // Now try reading the file
            const content = await fs.readFile(logPath, 'utf-8');
            this.logger.debug(`成功读取聊天日志文件 ${logPath}`);
            return content;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                this.logger.warn(`聊天日志文件 ${logPath} 不存在，返回空日志。`);
                return ''; // Return empty string if file doesn't exist
            }
            this.logger.error(`读取聊天日志文件 ${logPath} 时出错: ${error.message}`);
            throw new InternalServerErrorException(`读取聊天日志时出错: ${error.message}`);
        }
    }
} 