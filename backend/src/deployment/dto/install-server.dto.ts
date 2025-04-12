import { IsNotEmpty, IsString } from 'class-validator';

export class InstallServerDto {
  @IsString()
  @IsNotEmpty()
  // Add validation to check if it's an absolute path?
  // This is tricky across platforms, maybe just ensure it's not empty/relative for now.
  installPath: string; // Absolute path where the server should be installed
} 