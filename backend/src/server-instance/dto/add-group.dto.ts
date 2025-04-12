import { IsString, IsNotEmpty, IsArray, ArrayNotEmpty, ArrayUnique } from 'class-validator';

export class AddGroupDto {
    @IsString()
    @IsNotEmpty()
    // TODO: Add validation to prevent names containing ':' or starting/ending with spaces?
    name: string;

    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    @ArrayUnique() // Ensure no duplicate permissions
    permissions: string[];
} 