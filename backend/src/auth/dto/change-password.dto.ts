import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ChangePasswordDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(6, { message: '新密码长度至少为 6 位' })
    newPassword: string;
} 