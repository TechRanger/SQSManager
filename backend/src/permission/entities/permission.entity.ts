import { Role } from '../../role/entities/role.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';

// Define granular application permissions
export type PermissionName =
  // Server Instance & Deployment
  | 'deployment:manage'     // Add server, Deploy server
  | 'server:view_all'       // View list of servers
  | 'server:view_details'   // View specific server details (status, config, players)
  | 'server:edit_config'    // Edit server instance settings (ports, path, args, etc.)
  | 'server:delete'         // Delete server instance from manager
  | 'server:control'        // Start, Stop, Restart server
  | 'server:rcon'           // Send RCON commands via web UI
  | 'server:manage_bans_web'// Use Ban/Unban feature in web UI
  | 'server:manage_admins_web' // Add the new permission for Admins.cfg
  // User Management
  | 'user:view'             // View list of users
  | 'user:create'           // Create new users
  | 'user:delete'           // Delete users
  | 'user:assign_role'      // Change a user's assigned role
  // Role & Permission Management
  | 'role:view'             // View list of roles and their permissions
  | 'role:create'           // Create new roles
  | 'role:delete'           // Delete roles (cannot delete Owner)
  | 'role:assign_permissions' // Add/remove permissions for a role
  ;

@Entity()
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: PermissionName; // The unique identifier for the permission

  @Column({ nullable: true })
  description?: string; // Optional description

  @ManyToMany(() => Role, role => role.permissions)
  roles: Role[];
} 