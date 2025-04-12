/**
 * Represents a permission group defined in Admins.cfg
 */
export interface AdminGroup {
    name: string;
    permissions: string[]; // List of permission strings for this group
    originalLine: string; // Keep the original line for potential rewrite
}

/**
 * Represents an admin assignment in Admins.cfg
 */
export interface AdminEntry {
    steamId: string;
    groupName: string;
    comment?: string; // Optional comment associated with the admin line
    originalLine: string; // Keep the original line for potential rewrite/removal
}

/**
 * Represents the fully parsed content of Admins.cfg
 */
export interface FullAdminConfig {
    groups: AdminGroup[];
    admins: AdminEntry[];
    otherLines: string[]; // To preserve comments and empty lines during rewrite
} 