import React, { useState, useEffect, useCallback } from 'react';
import {
    getUsers, createUser, deleteUser,
    getRoles, createRole, deleteRole, assignPermissionsToRole,
    getPermissions
} from '../services/api';
import { User, Role } from '../types/user';
import { Permission } from '../types/permission';
import { CreateUserDto } from '../types/create-user.dto';
import { CreateRoleDto } from '../types/create-role.dto';
// Import shared UI components
import FluentInput from '../components/ui/FluentInput';
import FluentButton from '../components/ui/FluentButton';
import FluentTable from '../components/ui/FluentTable';
import FluentSelect from '../components/ui/FluentSelect';
import Card from '../components/ui/Card';
import AlertMessage from '../components/ui/AlertMessage';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { LuPlus, LuTrash2, LuPencil, LuX, LuSave } from 'react-icons/lu'; // Import icons

// Mock function to fetch available roles (keep for user creation dropdown)
const fetchAvailableRolesForUser = async (): Promise<Role[]> => {
    console.warn("Using mock roles for UserManagementPage - User creation. Implement API call!");
    return [
        // { id: 1, name: 'Owner', description: 'System Owner' },
        { id: 2, name: 'Admin', description: 'Administrator' },
        { id: 3, name: 'Moderator', description: 'Content Moderator' },
    ];
};

function UserManagementPage() {
    // --- User States ---
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [usersError, setUsersError] = useState<string | null>(null);
    const [isAddingUser, setIsAddingUser] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newUserRoleId, setNewUserRoleId] = useState<number | string>(''); // Use string for select
    const [addUserLoading, setAddUserLoading] = useState(false);
    const [addUserError, setAddUserError] = useState<string | null>(null);
    const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
    const [availableRolesForUser, setAvailableRolesForUser] = useState<Role[]>([]);
    const [rolesForUserLoading, setRolesForUserLoading] = useState(true);

    // --- Role States ---
    const [roles, setRoles] = useState<Role[]>([]);
    const [loadingRoles, setLoadingRoles] = useState(true);
    const [rolesError, setRolesError] = useState<string | null>(null);
    const [isAddingRole, setIsAddingRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleDescription, setNewRoleDescription] = useState('');
    const [addRoleLoading, setAddRoleLoading] = useState(false);
    const [addRoleError, setAddRoleError] = useState<string | null>(null);
    const [deletingRoleId, setDeletingRoleId] = useState<number | null>(null);

    // --- Permission States ---
    const [editingRole, setEditingRole] = useState<Role | null>(null); // Role being edited
    const [availablePermissions, setAvailablePermissions] = useState<Permission[]>([]);
    const [permissionsLoading, setPermissionsLoading] = useState(true);
    const [permissionsError, setPermissionsError] = useState<string | null>(null);
    const [selectedPermissions, setSelectedPermissions] = useState<Set<number>>(new Set());
    const [assigningPermissionsLoading, setAssigningPermissionsLoading] = useState(false);
    const [assignPermissionsError, setAssignPermissionsError] = useState<string | null>(null);

    // --- Fetch Users ---
    const fetchUsers = useCallback(async () => {
        setLoadingUsers(true);
        setUsersError(null);
        try {
            const response = await getUsers();
            setUsers(response.data);
        } catch (err: any) {
            console.error("获取用户列表失败:", err);
            setUsersError(err.response?.data?.message || '获取用户列表失败');
        } finally {
            setLoadingUsers(false);
        }
    }, []);

    // --- Fetch Roles (for User creation dropdown) ---
    const loadRolesForUserDropdown = useCallback(async () => {
        setRolesForUserLoading(true);
        try {
            const response = await getRoles();
            // Exclude 'Owner' role from assignment
            setAvailableRolesForUser(response.data.filter(role => role.name !== 'Owner'));
        } catch (err: any) {
             console.error("获取用户创建角色失败:", err);
             setUsersError('获取可分配角色失败'); // Show error in user section maybe?
        } finally {
            setRolesForUserLoading(false);
        }
    }, []);

     // --- Fetch Roles (for Role Management section) ---
    const fetchRoles = useCallback(async () => {
        setLoadingRoles(true);
        setRolesError(null);
        try {
            const response = await getRoles();
            setRoles(response.data);
        } catch (err: any) {
            console.error("获取角色列表失败:", err);
            setRolesError(err.response?.data?.message || '获取角色列表失败');
        } finally {
            setLoadingRoles(false);
        }
    }, []);

    // --- Fetch Permissions ---
    const fetchPermissions = useCallback(async () => {
        setPermissionsLoading(true);
        setPermissionsError(null);
        try {
            const response = await getPermissions();
            setAvailablePermissions(response.data);
        } catch (err: any) {
            console.error("获取权限列表失败:", err);
            setPermissionsError('获取可用权限列表失败');
        } finally {
            setPermissionsLoading(false);
        }
    }, []);

    // --- Initial Data Load ---
    useEffect(() => {
        fetchUsers();
        loadRolesForUserDropdown();
        fetchRoles();
        fetchPermissions();
    }, [fetchUsers, loadRolesForUserDropdown, fetchRoles, fetchPermissions]);

    // --- User Handlers ---
    const handleAddUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddUserError(null);
        if (!newUsername.trim() || !newPassword.trim() || !newUserRoleId) {
             setAddUserError('请填写用户名、密码并选择角色。');
             return;
         }
         if (newPassword.length < 6) {
             setAddUserError('密码长度至少为 6 位。');
             return;
         }

        setAddUserLoading(true);
        const roleIdNum = Number(newUserRoleId);
        if (isNaN(roleIdNum)){
            setAddUserError('无效的角色选择。');
            setAddUserLoading(false);
            return;
        }
        const userData: CreateUserDto = { username: newUsername.trim(), password: newPassword, roleId: roleIdNum };
        try {
            await createUser(userData);
            fetchUsers();
            setIsAddingUser(false);
            setNewUsername('');
            setNewPassword('');
            setNewUserRoleId('');
            setAddUserError(null);
            alert('用户创建成功！');
        } catch (err: any) {
            console.error("添加用户失败:", err);
            setAddUserError(err.response?.data?.message || '添加用户失败');
        } finally {
            setAddUserLoading(false);
        }
    };

    const handleDeleteUser = async (userId: number, username: string) => {
        if(window.confirm(`确定要删除用户 "${username}" 吗？此操作不可逆。`)) {
            setDeletingUserId(userId);
            setUsersError(null);
            try {
                await deleteUser(userId);
                setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
                alert(`用户 "${username}" 已删除。`);
            } catch (err: any) {
                console.error("删除用户失败:", err);
                setUsersError(err.response?.data?.message || '删除用户失败');
            } finally {
                setDeletingUserId(null);
            }
        }
    };

    // --- Role Handlers ---
    const handleCreateRoleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddRoleError(null);
        if (!newRoleName.trim()) {
            setAddRoleError("角色名称是必需的。");
            return;
        }
        setAddRoleLoading(true);
        const roleData: CreateRoleDto = {
            name: newRoleName.trim(),
            description: newRoleDescription.trim() || undefined,
        };
        try {
            await createRole(roleData);
            fetchRoles();
            loadRolesForUserDropdown(); // Refresh roles for user dropdown too
            setIsAddingRole(false);
            setNewRoleName('');
            setNewRoleDescription('');
            setAddRoleError(null);
            alert('角色创建成功！');
        } catch (err: any) {
            console.error("创建角色失败:", err);
            setAddRoleError(err.response?.data?.message || '创建角色失败');
        } finally {
            setAddRoleLoading(false);
        }
    };

    const handleDeleteRole = async (roleId: number, roleName: string) => {
        if (roleName === 'Owner') return; // Prevent deleting Owner role
        if (window.confirm(`确定要删除角色 "${roleName}" 吗？此操作不可逆，且会影响属于该角色的用户。`)) {
            setDeletingRoleId(roleId);
            setRolesError(null);
            try {
                await deleteRole(roleId);
                setRoles(prevRoles => prevRoles.filter(role => role.id !== roleId));
                setAvailableRolesForUser(prev => prev.filter(role => role.id !== roleId));
                alert(`角色 "${roleName}" 已删除。`);
            } catch (err: any) {
                console.error("删除角色失败:", err);
                setRolesError(err.response?.data?.message || '删除角色失败，可能仍有用户属于该角色。');
            } finally {
                setDeletingRoleId(null);
            }
        }
    };

    // --- Permission Handlers ---
    const openEditPermissionsModal = (role: Role) => {
        if (role.name === 'Owner') return;
        setEditingRole(role);
        const currentPermissionIds = new Set(role.permissions?.map(p => p.id) ?? []);
        setSelectedPermissions(currentPermissionIds);
        setAssignPermissionsError(null);
    };

    const closeEditPermissionsModal = () => {
        setEditingRole(null);
        setSelectedPermissions(new Set());
        setAssignPermissionsError(null);
    };

    const handlePermissionToggle = (permissionId: number) => {
        setSelectedPermissions(prev => {
            const newSet = new Set(prev);
            if (newSet.has(permissionId)) {
                newSet.delete(permissionId);
            } else {
                newSet.add(permissionId);
            }
            return newSet;
        });
    };

    const handleAssignPermissionsSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRole) return;

        setAssigningPermissionsLoading(true);
        setAssignPermissionsError(null);
        const permissionIds = Array.from(selectedPermissions);

        try {
            const updatedRoleData = await assignPermissionsToRole(editingRole.id, permissionIds);
            // Update the role in the local state
            setRoles(prevRoles => prevRoles.map(r => r.id === editingRole.id ? { ...r, permissions: updatedRoleData.data.permissions } : r));
            closeEditPermissionsModal();
            alert('权限更新成功！');
        } catch (err: any) {
            console.error("分配权限失败:", err);
            setAssignPermissionsError(err.response?.data?.message || '分配权限失败');
        } finally {
            setAssigningPermissionsLoading(false);
        }
    };

    const userTableHeaders = ["用户名", "角色", "操作"];
    const roleTableHeaders = ["角色名称", "描述", "权限", "操作"];

    const roleOptions = rolesForUserLoading
        ? [{ value: '', label: '加载中...' }]
        : [
              { value: '', label: '-- 选择角色 --' },
              ...availableRolesForUser.map(role => ({ value: role.id, label: role.name }))
          ];

    return (
        <div className="space-y-fluent-lg">
            {/* --- User Management Section --- */} 
            <Card title="用户管理">
                <div className="flex justify-end mb-fluent-md">
                    <FluentButton 
                        variant={isAddingUser ? 'secondary' : 'primary'}
                        icon={<LuPlus />} 
                        onClick={() => { setIsAddingUser(prev => !prev); setAddUserError(null); }}
                        size="small"
                    >
                        {isAddingUser ? '取消添加' : '添加用户'}
                    </FluentButton>
                </div>

                {/* Add User Form */} 
                {isAddingUser && (
                    <div className="p-fluent-lg border border-neutral-stroke rounded-fluent-md bg-neutral-background mb-fluent-lg space-y-fluent-md">
                        <h3 className="text-md font-semibold text-neutral-foreground">添加新用户</h3>
                        {addUserError && (
                           <AlertMessage type="error" message={addUserError} className="text-xs" />
                        )}
                        <form onSubmit={handleAddUserSubmit} className="space-y-fluent-md">
                            <FluentInput 
                                label="用户名:"
                                id="newUsername"
                                type="text"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                required
                                disabled={addUserLoading}
                                className="!mb-0"
                            />
                            <FluentInput 
                                label="密码:"
                                id="newPassword"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                minLength={6}
                                disabled={addUserLoading}
                                className="!mb-0"
                            />
                            <FluentSelect 
                                label="角色:"
                                id="newUserRoleId"
                                value={newUserRoleId}
                                onChange={(e) => setNewUserRoleId(e.target.value)}
                                options={roleOptions}
                                required
                                disabled={addUserLoading || rolesForUserLoading}
                                className="!mb-0"
                            />
                            <div className="flex justify-end space-x-fluent-sm">
                                <FluentButton type="button" variant="secondary" onClick={() => setIsAddingUser(false)} disabled={addUserLoading}>
                                    取消
                                </FluentButton>
                                <FluentButton 
                                    type="submit" 
                                    variant="primary" 
                                    disabled={addUserLoading || rolesForUserLoading}
                                    icon={<LuSave />} 
                                    className="shadow-none hover:shadow-md"
                                >
                                    {addUserLoading ? '添加中...' : '确认添加'}
                                </FluentButton>
                            </div>
                        </form>
                    </div>
                )}

                {/* User List Table */} 
                {usersError && (
                    <AlertMessage type="error" message={usersError} className="mb-fluent-md" />
                )}
                {loadingUsers ? (
                    <div className="flex justify-center p-fluent-lg">
                         <LoadingSpinner text="正在加载用户列表..." />
                     </div>
                ) : users.length === 0 ? (
                    <AlertMessage type="info" message="没有找到用户。" />
                ) : (
                    <FluentTable headers={userTableHeaders}>
                        {users.map(user => (
                            <tr key={user.id} className="hover:bg-gray-50 text-xs">
                                <td className="px-fluent-md py-fluent-sm whitespace-nowrap text-neutral-foreground font-medium">{user.username}</td>
                                <td className="px-fluent-md py-fluent-sm whitespace-nowrap text-neutral-secondary">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${user.role.name === 'Owner' ? 'bg-warning-background text-warning' : 'bg-neutral-background text-neutral-secondary'}`}>
                                        {user.role.name}
                                    </span>
                                </td>
                                <td className="px-fluent-md py-fluent-sm whitespace-nowrap text-right space-x-fluent-xs">
                                    <FluentButton 
                                        variant="danger" 
                                        size="small" 
                                        icon={<LuTrash2 />}
                                        onClick={() => handleDeleteUser(user.id, user.username)}
                                        disabled={deletingUserId === user.id || user.role.name === 'Owner'} // Prevent deleting Owner
                                        title={user.role.name === 'Owner' ? '无法删除 Owner' : '删除用户'}
                                    >
                                        {deletingUserId === user.id ? '删除中...' : '删除'}
                                    </FluentButton>
                                </td>
                            </tr>
                        ))}
                    </FluentTable>
                )}
            </Card>

            {/* --- Role & Permission Management Section --- */} 
            <Card title="角色与权限管理">
                <div className="flex justify-end mb-fluent-md">
                    <FluentButton 
                        variant={isAddingRole ? 'secondary' : 'primary'} 
                        icon={<LuPlus />} 
                        onClick={() => { setIsAddingRole(prev => !prev); setAddRoleError(null); }}
                        size="small"
                    >
                        {isAddingRole ? '取消添加' : '添加角色'}
                    </FluentButton>
                </div>

                {/* Add Role Form */} 
                 {isAddingRole && (
                    <div className="p-fluent-lg border border-neutral-stroke rounded-fluent-md bg-neutral-background mb-fluent-lg space-y-fluent-md">
                        <h3 className="text-md font-semibold text-neutral-foreground">添加新角色</h3>
                        {addRoleError && (
                            <AlertMessage type="error" message={addRoleError} className="text-xs" />
                        )}
                        <form onSubmit={handleCreateRoleSubmit} className="space-y-fluent-md">
                             <FluentInput 
                                label="角色名称:"
                                id="newRoleName"
                                type="text"
                                value={newRoleName}
                                onChange={(e) => setNewRoleName(e.target.value)}
                                required
                                disabled={addRoleLoading}
                                className="!mb-0"
                            />
                             <FluentInput 
                                label="描述 (可选):"
                                id="newRoleDescription"
                                type="text"
                                value={newRoleDescription}
                                onChange={(e) => setNewRoleDescription(e.target.value)}
                                disabled={addRoleLoading}
                                className="!mb-0"
                            />
                            <div className="flex justify-end space-x-fluent-sm">
                                <FluentButton type="button" variant="secondary" onClick={() => setIsAddingRole(false)} disabled={addRoleLoading}>
                                    取消
                                </FluentButton>
                                <FluentButton type="submit" variant="primary" disabled={addRoleLoading}>
                                    {addRoleLoading ? '添加中...' : '确认添加'}
                                </FluentButton>
                            </div>
                        </form>
                    </div>
                )}

                {/* Role List Table */} 
                {rolesError && (
                   <AlertMessage type="error" message={rolesError} className="mb-fluent-md" />
                )}
                {loadingRoles ? (
                     <div className="flex justify-center p-fluent-lg">
                         <LoadingSpinner text="正在加载角色列表..." />
                     </div>
                ) : roles.length === 0 ? (
                    <AlertMessage type="info" message="没有找到角色。" />
                ) : (
                    <FluentTable headers={roleTableHeaders}>
                         {roles.map(role => (
                            <tr key={role.id} className="hover:bg-gray-50 text-xs align-top">
                                <td className="px-fluent-md py-fluent-sm whitespace-nowrap text-neutral-foreground font-medium">
                                    {role.name}
                                    {role.name === 'Owner' && <span className="ml-2 px-1.5 py-0.5 bg-warning-background text-warning rounded text-[10px]">系统内置</span>}
                                </td>
                                <td className="px-fluent-md py-fluent-sm text-neutral-secondary">{role.description || '-'}</td>
                                <td className="px-fluent-md py-fluent-sm text-neutral-secondary max-w-md">
                                     {role.name === 'Owner' ? (
                                         <span className="italic text-xs">所有权限</span>
                                     ) : (
                                        (role.permissions && role.permissions.length > 0) ? (
                                            <div className="flex flex-wrap gap-1">
                                                {role.permissions.slice(0, 5).map(perm => (
                                                    <span key={perm.id} className="px-1.5 py-0.5 bg-neutral-background rounded text-neutral-secondary text-[10px]">{perm.action}:{perm.resource}</span>
                                                ))}
                                                {role.permissions.length > 5 && <span className="text-[10px]">...等 {role.permissions.length} 项</span>}
                                            </div>
                                         ) : (
                                            <span className="italic text-xs">无权限</span>
                                         )
                                     )}
                                </td>
                                <td className="px-fluent-md py-fluent-sm whitespace-nowrap text-right space-x-fluent-xs">
                                    <FluentButton 
                                        variant="secondary" 
                                        size="small" 
                                        icon={<LuPencil />}
                                        onClick={() => openEditPermissionsModal(role)}
                                        disabled={role.name === 'Owner'} // Disable editing Owner permissions
                                        title={role.name === 'Owner' ? '无法编辑 Owner 权限' : '编辑权限'}
                                    >
                                        编辑权限
                                    </FluentButton>
                                    <FluentButton 
                                        variant="danger" 
                                        size="small" 
                                        icon={<LuTrash2 />}
                                        onClick={() => handleDeleteRole(role.id, role.name)}
                                        disabled={deletingRoleId === role.id || role.name === 'Owner'} // Disable deleting Owner
                                        title={role.name === 'Owner' ? '无法删除 Owner' : '删除角色'}
                                    >
                                        {deletingRoleId === role.id ? '删除中...' : '删除'}
                                    </FluentButton>
                                </td>
                            </tr>
                        ))}
                    </FluentTable>
                )}
            </Card>

            {/* --- Edit Permissions Modal/Overlay --- */} 
            {editingRole && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-fluent-xl backdrop-blur-sm">
                    <Card 
                        title={`编辑角色权限: ${editingRole.name}`} 
                        className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col bg-white"
                    >
                        <form id={`permission-form-${editingRole.id}`} onSubmit={handleAssignPermissionsSubmit} className="flex-grow overflow-y-auto p-fluent-lg space-y-fluent-md">
                            {assignPermissionsError && (
                               <AlertMessage type="error" message={assignPermissionsError} className="text-xs" />
                            )}
                            {permissionsLoading ? (
                                 <div className="flex justify-center p-fluent-md">
                                     <LoadingSpinner text="正在加载权限列表..." />
                                 </div>
                            ) : permissionsError ? (
                                 <AlertMessage type="error" message={permissionsError} />
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-fluent-lg gap-y-fluent-md">
                                     {availablePermissions.map(permission => (
                                        <label key={permission.id} className="flex items-center space-x-fluent-sm cursor-pointer text-sm">
                                             <input 
                                                type="checkbox" 
                                                checked={selectedPermissions.has(permission.id)}
                                                onChange={() => handlePermissionToggle(permission.id)}
                                                disabled={assigningPermissionsLoading}
                                                className="rounded text-brand focus:ring-brand border-neutral-stroke"
                                             />
                                             <span className="text-neutral-foreground">{`${permission.action}:${permission.resource}`}</span>
                                         </label>
                                     ))}
                                 </div>
                            )}
                        </form>
                         {/* Modal Footer */} 
                        <div className="p-fluent-md bg-neutral-background border-t border-neutral-stroke flex justify-end space-x-fluent-sm mt-auto">
                             <FluentButton type="button" variant="secondary" onClick={closeEditPermissionsModal} disabled={assigningPermissionsLoading}>
                                取消
                            </FluentButton>
                            <FluentButton type="submit" variant="primary" form={`permission-form-${editingRole.id}`} disabled={assigningPermissionsLoading || permissionsLoading || !!permissionsError}>
                                {assigningPermissionsLoading ? '保存中...' : '保存权限'}
                             </FluentButton>
                         </div>
                     </Card>
                 </div>
             )}
         </div>
     );
 }

 export default UserManagementPage; 