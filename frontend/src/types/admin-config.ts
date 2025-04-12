// frontend/src/types/admin-config.ts

export interface AdminGroup {
    name: string;
    permissions: string[];
    originalLine: string; // Might be useful if we implement editing/saving later
}

export interface AdminEntry {
    steamId: string;
    groupName: string;
    comment?: string;
    originalLine: string;
}

export interface FullAdminConfig {
    groups: AdminGroup[];
    admins: AdminEntry[];
    otherLines: string[];
} 