import { IsString, IsNotEmpty, IsInt, IsOptional, Min, Max, IsDefined } from 'class-validator';

export class DeployInstanceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  installPath: string;

  // Use @IsDefined() and @IsInt() to ensure they are provided and are numbers
  @IsDefined({ message: '游戏端口 (gamePort) 是必需的' })
  @IsInt()
  @Min(1024)
  @Max(65535)
  gamePort: number;

  @IsDefined({ message: '查询端口 (queryPort) 是必需的' })
  @IsInt()
  @Min(1024)
  @Max(65535)
  queryPort: number;

  @IsDefined({ message: 'RCON 端口 (rconPort) 是必需的' })
  @IsInt()
  @Min(1024)
  @Max(65535)
  rconPort: number;

  @IsDefined({ message: '信标端口 (beaconPort) 是必需的' })
  @IsInt()
  @Min(1024)
  @Max(65535)
  beaconPort: number;

  @IsString()
  @IsNotEmpty({ message: 'RCON 密码是必需的' })
  rconPassword: string;

  @IsOptional()
  @IsString()
  extraArgs?: string;
} 