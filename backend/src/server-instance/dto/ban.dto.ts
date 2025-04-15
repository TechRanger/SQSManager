import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsDateString } from 'class-validator';

export interface BanEntry {
    originalLine: string; // The exact line from the file, useful for removal
    bannedEosId: string;
    expirationTimestamp: number; // Unix timestamp (0 for permanent)
    adminNickname?: string;
    adminSteamId?: string;
    comment?: string;
}

export class UnbanDto {
    @IsString()
    @IsNotEmpty()
    lineContent: string; // The exact original line to remove
}

export class AddManualBanDto {
    @IsString()
    @IsNotEmpty()
    eosId: string; // EOS ID 要封禁的玩家

    @IsString()
    @IsNotEmpty()
    comment: string; // 封禁原因或备注
    
    @IsBoolean()
    isPermanent: boolean; // 是否永久封禁
    
    @IsOptional()
    @IsDateString()
    expirationDate?: string; // 非永久封禁的截止日期 (ISO 格式)
    
    @IsOptional()
    expirationTimestamp?: number; // 非永久封禁的截止时间戳（秒）
    
    @IsString()
    @IsOptional()
    banLength?: string; // 封禁时长: 0 = 永久, 1d = 1天, 1M = 1个月等
} 