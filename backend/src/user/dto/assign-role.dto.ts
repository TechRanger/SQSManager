import { IsNotEmpty, IsInt } from 'class-validator';

export class AssignRoleDto {
  @IsNotEmpty()
  @IsInt()
  roleId: number;
} 