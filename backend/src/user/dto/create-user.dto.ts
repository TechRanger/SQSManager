import { IsString, IsNotEmpty, MinLength, IsInt } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6) // Enforce a minimum password length
  password: string;

  @IsInt()
  @IsNotEmpty()
  roleId: number; // Add roleId field

  // Role assignment will be handled separately or via another field (e.g., roleIds)
  // @IsEnum(UserRole)
  // @IsOptional()
  // role?: UserRole;
} 