import { IsString, IsOptional, IsNumber, Min, IsNotEmpty } from 'class-validator';

export class UpdateServerInstanceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  installPath?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  gamePort?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  queryPort?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  rconPort?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  beaconPort?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  rconPassword?: string;

  @IsOptional()
  @IsString()
  extraArgs?: string;
} 