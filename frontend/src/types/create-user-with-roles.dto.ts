// frontend/src/types/create-user-with-roles.dto.ts

export interface CreateUserWithRolesDto {
    username: string;
    password: string;
    roleIds?: number[];
} 