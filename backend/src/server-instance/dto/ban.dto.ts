import { IsString, IsNotEmpty } from 'class-validator';

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