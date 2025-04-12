import { IsArray, IsInt, IsNotEmpty } from 'class-validator';

export class AssignPermissionsDto {
  @IsArray()
  @IsInt({ each: true }) // Validate each element is an integer
  @IsNotEmpty() // Ensure the array itself is provided, even if empty (though service handles empty case)
  permissionIds: number[];
} 