import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class ServerInstance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string; // 服务器实例名称 (用户自定义)

  @Column()
  installPath: string; // Squad 服务器安装路径

  @Column({ default: 7787 })
  gamePort: number; // 游戏端口

  @Column({ default: 27165 })
  queryPort: number; // Steam 查询端口

  @Column({ default: 21114 })
  rconPort: number; // RCON 端口

  @Column({ default: 15000 }) // 每个服务器实例需要唯一的 Beacon 端口
  beaconPort: number;

  @Column()
  rconPassword: string; // RCON 密码

  @Column({ nullable: true }) // 可选的额外启动参数
  extraArgs?: string;

  // --- 运行时状态 (非数据库持久化，但方便管理) ---
  // These fields are not stored in the DB but managed in the service
  // isRunning: boolean = false;
  // pid?: number = null;
  // currentMap?: string = null;
  // playerCount?: number = null;

} 