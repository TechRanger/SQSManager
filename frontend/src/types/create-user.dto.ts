export interface CreateUserDto {
  username: string;
  password: string;
  roleId: number; // Changed from roles array to single roleId
} 