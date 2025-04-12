import { IsString, IsNotEmpty, MinLength, IsInt, IsDefined } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  // Role is now mandatory for creation (except maybe initial seed)
  @IsDefined({ message: '必须为用户分配一个角色。' })
  @IsInt({ message: '角色 ID 必须是数字。' })
  roleId: number;
} 