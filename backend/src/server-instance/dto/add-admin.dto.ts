import { IsString, IsNotEmpty, Matches, IsOptional } from 'class-validator';

export class AddAdminDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/^\d{17}$/, { message: 'SteamID 必须是 17 位数字。' }) // Basic SteamID64 validation
    steamId: string;

    @IsString()
    @IsNotEmpty()
    groupName: string;

    @IsOptional()
    @IsString()
    comment?: string;
} 