import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateGameFilesDto {
  @IsString()
  @IsNotEmpty({ message: 'SteamCMD path cannot be empty' })
  steamCmdPath: string;
} 