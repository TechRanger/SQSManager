import axios from 'axios';
import { BanEntry } from '../types/ban'; // Import the locally defined BanEntry type
import { FullAdminConfig } from '../types/admin-config'; // Import Admin Config type
import { AddGroupDto } from '../types/add-group.dto'; // Import AddGroupDto
import { AddAdminDto } from '../types/add-admin.dto'; // Import AddAdminDto
import { ChangePasswordDto } from '../types/change-password.dto'; // Import ChangePasswordDto
import { CreateUserDto } from '../types/create-user.dto'; // Import the correct DTO
import { User, Role } from '../types/user'; // Import User type and Role type
import { Permission } from '../types/permission'; // Import Permission type
import { CreateRoleDto } from '../types/create-role.dto'; // Import CreateRoleDto type

// Dynamically set the API base URL based on the hostname the frontend is accessed from
// 根据不同环境设置API基础URL
const apiPath = '/api';

// 判断是开发环境还是生产环境
// 在开发环境中(localhost:5173)，使用完整URL连接到后端(localhost:3000)
// 在生产环境中，使用相对路径让Nginx处理代理
const isDevEnvironment = window.location.port === '5173';
const baseURL = isDevEnvironment 
  ? `${window.location.protocol}//${window.location.hostname}:3000${apiPath}`
  : apiPath;

console.log(`API Base URL set to: ${baseURL}`); // Add log for debugging

const apiClient = axios.create({
  baseURL: baseURL, // Use the dynamically determined URL
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // 允许跨域请求携带凭证
});

// --- Axios Request Interceptor --- 
// Add the JWT token to the Authorization header for every request if it exists
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      // console.log('Interceptor added token:', config.headers.Authorization); // Debug log
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
// --- End Interceptor ---

// --- Server Instance API Calls ---

export const getServerInstances = () => apiClient.get('/server-instances');

// 获取所有服务器实例的别名，用于对局管理页面
export const getAllServerInstances = () => apiClient.get('/server-instances');

export const getServerInstance = (id: number) => apiClient.get(`/server-instances/${id}`);

export const getServerInstanceStatus = (id: number) => apiClient.get(`/server-instances/${id}/status`);

// 获取所有服务器实例的状态
export const getAllServerInstanceStatuses = () => apiClient.get('/server-instances/statuses');

export const createServerInstance = (data: any) => apiClient.post('/server-instances', data);

export const updateServerInstance = (id: number, data: any) => apiClient.patch(`/server-instances/${id}`, data);

export const startServerInstance = (id: number) => apiClient.post(`/server-instances/${id}/start`);

export const stopServerInstance = (id: number) => apiClient.post(`/server-instances/${id}/stop`);

export const restartServerInstance = (id: number) => apiClient.post(`/server-instances/${id}/restart`);

// Modified API call for updating game files
export const updateServerGameFiles = (id: number, steamCmdPath: string): Promise<{ message: string }> => 
    apiClient.post(`/server-instances/${id}/update-game`, { steamCmdPath }); // Send path in body

export const deleteServerInstance = (id: number) => apiClient.delete(`/server-instances/${id}`);

export const sendRconCommand = (id: number, command: string) => apiClient.post(`/server-instances/${id}/rcon`, { command });

// Function to read RCON config (password and port)
export const readRconConfig = (installPath: string) => apiClient.post<{ password?: string; port?: number }>('/server-instances/read-rcon-config', { installPath });

// --- Add function to get server chat log ---
export const getServerChatLog = (id: number): Promise<{ data: { logContent: string } }> => 
    apiClient.get(`/server-instances/${id}/chatlog`);

// --- Auth API Calls ---
export const loginUser = (credentials: { username: string; password: string }) => apiClient.post('/auth/login', credentials);

// --- Ban List API Calls ---
export const getBanList = (serverId: number): Promise<{ data: BanEntry[] }> => apiClient.get(`/server-instances/${serverId}/bans`);

export const unbanPlayer = (serverId: number, lineContent: string): Promise<void> => apiClient.delete(`/server-instances/${serverId}/bans`, { 
    data: { lineContent } // Send lineContent in the request body for DELETE
});

// 添加手动Ban的API
export const addManualBan = (serverId: number, banData: { 
  eosId: string, 
  comment: string, 
  isPermanent: boolean, 
  expirationDate?: string,
  expirationTimestamp?: number,
  banLength: string
}): Promise<void> => 
    apiClient.post(`/server-instances/${serverId}/bans`, banData);

// 编辑Ban记录的API
export const editBan = (serverId: number, editData: {
  originalLine: string,
  newComment: string,
  newExpirationTimestamp: number,
}): Promise<void> =>
    apiClient.put(`/server-instances/${serverId}/bans`, editData);

// --- Admin Config API Calls ---
export const getAdminConfig = (serverId: number): Promise<{ data: FullAdminConfig }> => apiClient.get(`/server-instances/${serverId}/admin-config`);

// Add Group
export const addAdminGroup = (serverId: number, groupData: AddGroupDto): Promise<void> => apiClient.post(`/server-instances/${serverId}/admin-config/groups`, groupData);

// Delete Group
export const deleteAdminGroup = (serverId: number, groupName: string): Promise<void> => apiClient.delete(`/server-instances/${serverId}/admin-config/groups/${encodeURIComponent(groupName)}`);

// Add Admin
export const addAdmin = (serverId: number, adminData: AddAdminDto): Promise<void> => apiClient.post(`/server-instances/${serverId}/admin-config/admins`, adminData);

// Delete Admin
export const deleteAdmin = (serverId: number, steamId: string, groupName: string): Promise<void> => apiClient.delete(`/server-instances/${serverId}/admin-config/admins/${steamId}/${encodeURIComponent(groupName)}`);

// TODO: Add API call for updating admin config later
// export const updateAdminConfig = (serverId: number, configData: FullAdminConfig) => apiClient.put(...);

// --- User API Calls ---
export const changePassword = (passwordData: ChangePasswordDto): Promise<{ message: string }> => apiClient.post('/users/change-password', passwordData);

// Get all users
export const getUsers = (): Promise<{ data: User[] }> => apiClient.get('/users');

// Create a user - Updated to use CreateUserDto
export const createUser = (userData: CreateUserDto): Promise<{ data: User }> => apiClient.post('/users', userData);

// Delete a user
export const deleteUser = (userId: number): Promise<void> => apiClient.delete(`/users/${userId}`);

// Get current user profile (Example)
// export const getProfile = () => apiClient.get('/users/profile');

// --- Deployment API Call ---
export const installServer = (installPath: string) => apiClient.post('/deployment/install', { installPath });

// 添加部署服务器实例的API接口
export const getDeployUrl = () => {
  return `${baseURL}/deployment/deploy-instance-sse`;
};

// TODO: Add API calls for config file management if needed in frontend

// --- Role API Calls ---
export const getRoles = (): Promise<{ data: Role[] }> => apiClient.get('/roles');

export const createRole = (roleData: CreateRoleDto): Promise<{ data: Role }> => apiClient.post('/roles', roleData);

export const deleteRole = (roleId: number): Promise<void> => apiClient.delete(`/roles/${roleId}`);

export const assignPermissionsToRole = (roleId: number, permissionIds: number[]): Promise<{ data: Role }> => {
    return apiClient.put(`/roles/${roleId}/permissions`, { permissionIds });
};

// --- Permission API Calls ---
export const getPermissions = (): Promise<{ data: Permission[] }> => apiClient.get('/permissions');

export default apiClient; 