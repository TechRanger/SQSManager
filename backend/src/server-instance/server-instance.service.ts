import { Injectable, NotFoundException, Logger, InternalServerErrorException, BadRequestException, ConflictException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateServerInstanceDto } from './dto/create-server-instance.dto';
import { UpdateServerInstanceDto } from './dto/update-server-instance.dto';
import { ServerInstance } from './entities/server-instance.entity';
import { spawn, ChildProcess } from 'child_process';
import { Rcon } from 'rcon-client'; // Use Rcon type directly
import * as path from 'path';
import * as fs from 'fs/promises';
import * as ini from 'ini';
import { BanEntry, UnbanDto } from './dto/ban.dto'; // Import Ban types
import { RconDto } from './dto/rcon.dto';
import { FullAdminConfig, AdminGroup, AdminEntry } from './dto/admin-config.dto'; // Import Admin Config types
import { AddGroupDto } from './dto/add-group.dto'; // Import AddGroupDto
import { AddAdminDto } from './dto/add-admin.dto'; // Import AddAdminDto
import { RealtimeGateway } from '../shared/realtime/realtime.gateway'; // Import the gateway

// Define a type for the running server info
interface RunningServerInfo {
    process: ChildProcess;
    rcon?: Rcon | null; // Use Rcon type directly
    instance: ServerInstance;
    rconConnecting?: boolean; // Flag to prevent multiple connection attempts
    rconRetryTimeout?: NodeJS.Timeout;
}

@Injectable()
export class ServerInstanceService implements OnModuleDestroy, OnModuleInit {
    private readonly logger = new Logger(ServerInstanceService.name);
    // Use the defined type for the map
    private runningServers: Map<number, RunningServerInfo> = new Map();
    private readonly SQUAD_APP_ID = '393380'; // Squad Dedicated Server App ID
    private activeUpdates: Set<number> = new Set(); // Track active updates

    constructor(
        @InjectRepository(ServerInstance)
        private serverInstanceRepository: Repository<ServerInstance>,
        private readonly realtimeGateway: RealtimeGateway, // Inject the gateway
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
        const serverExecutable = isWindows ? 'SquadGameServer.exe' : 'SquadGameServer.sh';
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

            // Store basic info immediately
            this.runningServers.set(id, { process: serverProcess, instance, rcon: null, rconConnecting: false });

            serverProcess.stdout?.on('data', (data) => {
                const message = data.toString().trim();
                if (message) this.logger.log(`[Server ${id} STDOUT]: ${message}`);
                // TODO: Parse specific log lines for status updates (e.g., map change, server ready)
            });

            serverProcess.stderr?.on('data', (data) => {
                const message = data.toString().trim();
                 if (message) this.logger.error(`[Server ${id} STDERR]: ${message}`);
            });

            serverProcess.on('spawn', () => {
                this.logger.log(`服务器进程 ${id} (${instance.name}) 已生成, PID: ${serverProcess.pid}`);
                // Attempt initial RCON connection after a short delay
                setTimeout(() => this.connectRcon(id), 5000); // Connect after 5s
            });

            serverProcess.on('close', (code, signal) => {
                this.logger.log(`服务器进程 ${id} (${instance.name}) 已退出，退出码: ${code}, 信号: ${signal}`);
                const serverInfo = this.runningServers.get(id);
                if (serverInfo) {
                    // Clear any pending RCON retry timeouts
                    if (serverInfo.rconRetryTimeout) {
                        clearTimeout(serverInfo.rconRetryTimeout);
                    }
                    // Attempt to close RCON connection if it exists
                    if (serverInfo.rcon) {
                        try {
                            serverInfo.rcon.end();
                            this.logger.log(`RCON 连接已关闭 (服务器 ${id} 退出)`);
                        } catch (e: any) {
                            this.logger.warn(`关闭 RCON 连接时出错 (服务器 ${id} 退出): ${e.message}`);
                        }
                    }
                }
                this.runningServers.delete(id); // Remove from running map
                
                // 更新数据库中的服务器状态为停止
                this.updateServerRunningState(id, false).catch(err => {
                    this.logger.error(`更新服务器 ${id} 状态为停止时出错: ${err.message}`);
                });
            });

            serverProcess.on('error', (err) => {
                this.logger.error(`启动服务器进程 ${id} (${instance.name}) 失败: ${err.message}`);
                this.runningServers.delete(id); // Clean up map
                
                // 更新数据库中的服务器状态为停止
                this.updateServerRunningState(id, false).catch(err => {
                    this.logger.error(`更新服务器 ${id} 状态为停止时出错: ${err.message}`);
                });
            });

        } catch (error: any) {
            this.logger.error(`执行启动命令时出错 (服务器 ${id}): ${error}`);
            this.runningServers.delete(id); // Ensure cleanup
            
            // 发生错误时，确保服务器状态为停止
            this.updateServerRunningState(id, false).catch(err => {
                this.logger.error(`更新服务器 ${id} 状态为停止时出错: ${err.message}`);
            });
            
            throw new InternalServerErrorException(`启动服务器时发生意外错误`);
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
                 await serverInfo.rcon.end();
             } catch (e: any) {
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

        const instance = serverInfo.instance;
        this.logger.log(`尝试连接到服务器 ${id} (${instance.name}) 的 RCON (localhost:${instance.rconPort})`);
        serverInfo.rconConnecting = true; // Set connecting flag
        this.runningServers.set(id, serverInfo); // Update map

        try {
            const rcon = await Rcon.connect({
                host: '127.0.0.1', // Assume RCON runs locally
                port: instance.rconPort,
                password: instance.rconPassword,
                timeout: 15000 // Connection timeout
            });

            this.logger.log(`RCON 已连接到服务器 ${id} (${instance.name})`);
            serverInfo.rcon = rcon as Rcon; // Store the active connection (cast if necessary, type is Rcon)
            serverInfo.rconConnecting = false;
            this.runningServers.set(id, serverInfo); // Update map

            rcon.on('error', (err) => {
                this.logger.error(`服务器 ${id} (${instance.name}) RCON 连接错误: ${err.message}`);
                if (serverInfo.rcon === rcon) { // Check if it's still the current connection
                    serverInfo.rcon = null;
                    this.scheduleRconReconnect(id, 20000); // Schedule reconnect on error
                }
            });

            rcon.on('end', () => {
                this.logger.log(`服务器 ${id} (${instance.name}) RCON 连接已断开`);
                if (serverInfo.rcon === rcon) { // Check if it's still the current connection
                    serverInfo.rcon = null;
                     // Only reconnect if the server process itself is still tracked
                     if (this.runningServers.has(id)) {
                         this.scheduleRconReconnect(id, 15000); // Schedule reconnect on normal end
                     }
                }
            });

        } catch (err: any) {
            this.logger.error(`连接 RCON 到服务器 ${id} (${instance.name}) 失败: ${err.message}`);
            serverInfo.rconConnecting = false;
            this.runningServers.set(id, serverInfo); // Update map
            // Schedule retry only if the server is still supposed to be running
            if (this.runningServers.has(id)) {
                this.scheduleRconReconnect(id, 30000); // Longer delay after connection failure
            }
        }
    }


    async sendRconCommand(id: number, command: string): Promise<string> {
        const serverInfo = this.runningServers.get(id);
        // Check if rcon exists and is authenticated
        if (!serverInfo?.rcon?.authenticated) {
            this.logger.warn(`无法发送 RCON 命令到 ${id}: ${!serverInfo ? '服务器未运行' : !serverInfo.rcon ? 'RCON未连接' : 'RCON未认证'}`);
            throw new BadRequestException(`服务器 ${id} RCON 不可用。`);
        }

        try {
            this.logger.log(`向服务器 ${id} (${serverInfo.instance.name}) 发送 RCON 命令: ${command}`);
            
            // 设置一个Promise超时来处理无响应的命令
            const timeoutPromise = new Promise<string>((_, reject) => {
                setTimeout(() => {
                    reject(new Error('RCON命令超时，服务器无响应'));
                }, 5000); // 5秒超时
            });
            
            // 创建RCON发送命令的Promise
            const rconPromise = serverInfo.rcon.send(command);
            
            // 使用Promise.race来处理两者中先完成的那个
            const response = await Promise.race([rconPromise, timeoutPromise]);
            
            this.logger.debug(`服务器 ${id} RCON 响应: ${response}`);
            return response;
        } catch (err: any) {
            this.logger.error(`发送 RCON 命令到服务器 ${id} (${serverInfo.instance.name}) 失败: ${err.message}`);
            throw new InternalServerErrorException(`发送 RCON 命令失败: ${err.message}`);
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

        if (isRunning && serverInfo?.rcon?.authenticated) {
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

    // --- New Update Method ---
    async updateGameFiles(id: number, steamCmdPath: string): Promise<void> {
        this.logger.log(`收到更新服务器 ${id} 游戏文件的请求 (SteamCMD Path: ${steamCmdPath})...`);
        const instance = await this.findOne(id);

        // Check if server is running (using DB state)
        if (instance.isRunning) {
            this.logger.warn(`服务器 ${id} 正在运行，无法进行更新。`);
            throw new BadRequestException('服务器正在运行，请先停止后再更新。');
        }

        // Check if an update is already in progress for this server
        if (this.activeUpdates.has(id)) {
            this.logger.warn(`服务器 ${id} 的更新已经在进行中。`);
            throw new ConflictException('此服务器的更新已经在进行中。');
        }
        this.activeUpdates.add(id);

        const installPath = instance.installPath;
        const updateRoom = `update-${id}`;

        // Use the provided steamCmdPath
        this.logger.log(`服务器 ${id}: 开始使用 steamcmd (${steamCmdPath}) 更新，安装目录: ${installPath}`);
        this.realtimeGateway.sendUpdateLog(updateRoom, `服务器 ${id}: 开始使用 steamcmd (${steamCmdPath}) 更新，安装目录: ${installPath}`);

        const steamCmdArgs = [
            `+force_install_dir`, `"${installPath}"`,
            `+login`, `anonymous`,
            `+app_update`, this.SQUAD_APP_ID, `validate`,
            `+quit`
        ];

        try {
            // Use the provided steamCmdPath in spawn
            const updateProcess = spawn(steamCmdPath, steamCmdArgs, {
                shell: true, 
                stdio: ['ignore', 'pipe', 'pipe'] 
            });

            updateProcess.stdout.on('data', (data) => {
                const line = data.toString().trim();
                if (line) {
                    this.logger.debug(`[SteamCMD Update ${id} STDOUT]: ${line}`);
                    this.realtimeGateway.sendUpdateLog(updateRoom, line);
                }
            });

            updateProcess.stderr.on('data', (data) => {
                const line = data.toString().trim();
                if (line) {
                    this.logger.warn(`[SteamCMD Update ${id} STDERR]: ${line}`);
                    this.realtimeGateway.sendUpdateLog(updateRoom, `错误: ${line}`); // Prefix stderr lines
                }
            });

            updateProcess.on('error', (err) => {
                this.logger.error(`启动 steamcmd 进程失败 (服务器 ${id}): ${err.message}`);
                this.realtimeGateway.sendUpdateError(updateRoom, `启动 steamcmd 进程失败: ${err.message}`);
                this.activeUpdates.delete(id); // Remove from active updates on process error
            });

            updateProcess.on('close', (code) => {
                this.activeUpdates.delete(id); // Remove from active updates when process finishes
                if (code === 0) {
                    this.logger.log(`服务器 ${id} steamcmd 更新成功完成 (退出码: ${code})。`);
                    this.realtimeGateway.sendUpdateComplete(updateRoom, '游戏文件更新成功完成。');
                } else {
                    this.logger.error(`服务器 ${id} steamcmd 更新失败 (退出码: ${code})。`);
                    this.realtimeGateway.sendUpdateError(updateRoom, `SteamCMD 更新进程意外退出，错误码: ${code}。请检查日志获取详细信息。`);
                }
            });

        } catch (error) {
            this.activeUpdates.delete(id); // Ensure removal on synchronous errors too
            this.logger.error(`执行 steamcmd 更新时捕获到意外错误 (服务器 ${id}): ${error}`);
            this.realtimeGateway.sendUpdateError(updateRoom, `执行更新时发生意外错误: ${error.message}`);
            // Re-throw if needed, but usually handled by gateway message
            // throw new InternalServerErrorException(`执行更新时发生意外错误。`);
        }
    }
    // --- End New Update Method ---
} 