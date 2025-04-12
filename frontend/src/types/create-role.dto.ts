export interface CreateRoleDto {
    name: string;
    description?: string;
    // Frontend might not need to send initial permissionIds for basic role creation
    // permissionIds?: number[];
} 