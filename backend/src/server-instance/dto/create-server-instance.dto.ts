import { IsNotEmpty, IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateServerInstanceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  installPath: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  gamePort?: number; // 可选，使用默认值

  @IsOptional()
  @IsNumber()
  @Min(1)
  queryPort?: number; // 可选，使用默认值

  @IsOptional()
  @IsNumber()
  @Min(1)
  rconPort?: number; // 可选，使用默认值

  @IsOptional()
  @IsNumber()
  @Min(1)
  beaconPort?: number; // 可选，使用默认值

  @IsString()
  @IsNotEmpty()
  rconPassword: string;

  @IsOptional()
  @IsString()
  extraArgs?: string;
} 