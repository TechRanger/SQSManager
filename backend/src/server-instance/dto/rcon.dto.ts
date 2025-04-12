import { IsString, IsNotEmpty } from 'class-validator';

export class RconDto {
    @IsString()
    @IsNotEmpty()
    command: string;
} 