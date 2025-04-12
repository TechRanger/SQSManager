// frontend/src/types/user.ts

// Represents a Role object as returned by the backend
export interface Role {
    id: number;
    name: string;
    description?: string; // Add description if backend sends it
    permissions?: { id: number; name: string }[]; // Add permissions if needed/sent
}

// Represents a User object as returned by the backend
export interface User {
    id: number;
    username: string;
    // Backend now sends a single role object, not an array
    role: Role; // Changed from roles: Role[] to role: Role
} 