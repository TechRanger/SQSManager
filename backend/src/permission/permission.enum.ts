export enum Permission {
  // User Management
  UserManage = 'user:manage',
  RoleManage = 'role:manage',

  // Server Instance Management
  ServerView = 'server:view',
  ServerCreate = 'server:create',
  ServerEdit = 'server:edit',
  ServerDelete = 'server:delete',
  ServerControl = 'server:control', // Start, Stop, Restart
  ServerUpdate = 'server:update', // Update game files
  ServerManageAdmins = 'server:manageAdmins',
  ServerRcon = 'server:rcon',

  // Deployment
  DeploymentManage = 'deployment:manage',
} 