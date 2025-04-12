import React, { useState } from 'react';
import { FullAdminConfig, AdminGroup, AdminEntry } from '../types/admin-config';
import { AddGroupDto } from '../types/add-group.dto';
import { AddAdminDto } from '../types/add-admin.dto';
// Import shared UI components
import FluentButton from './ui/FluentButton';
import FluentTable from './ui/FluentTable';
import FluentInput from './ui/FluentInput';
import FluentSelect from './ui/FluentSelect';

// --- Remove Reusable Fluent UI Components (Temporary definitions) ---
// interface FluentButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
//     variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
//     icon?: React.ReactNode;
//     size?: 'small' | 'medium';
// }
// const FluentButton: React.FC<FluentButtonProps> = ({ variant = 'secondary', size = 'medium', icon, children, ...props }) => <button {...props}>{icon && <span>{icon}</span>}<span>{children}</span></button>;
//
// interface FluentTableProps {
//     headers: string[];
//     children: React.ReactNode;
//     className?: string;
// }
// const FluentTable: React.FC<FluentTableProps> = ({ headers, children, className }) => <div className={className}><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
//
// interface FluentInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
//   label?: string;
// }
// const FluentInput: React.FC<FluentInputProps> = ({ label, id, ...props }) => <div>{label && <label htmlFor={id}>{label}</label>}<input id={id} {...props} /></div>;
//
// // FluentSelect Component (Basic Styling)
// interface FluentSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
//   label?: string;
// }
// const FluentSelect: React.FC<FluentSelectProps> = ({ label, id, className, children, ...props }) => {
//   const selectId = id || props.name;
//   return (
//     <div className="mb-fluent-md">
//       {label && <label htmlFor={selectId} className="block text-sm font-medium text-neutral-secondary mb-fluent-xs">{label}</label>}
//       <div className="relative">
//         <select
//           id={selectId}
//           className={`w-full pl-fluent-sm pr-10 py-fluent-xs border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent appearance-none bg-white ${className}`}
//           {...props}
//         >
//           {children}
//         </select>
//         <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-neutral-secondary">
//           {/* Add dropdown icon here if desired (e.g., <LuChevronDown />) */}
//           <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
//         </div>
//       </div>
//     </div>
//   );
// };
// --- End Temporary definitions ---

const AVAILABLE_PERMISSIONS: string[] = [
    'changemap', 'cheat', 'private', 'balance', 'chat', 'kick', 'ban', 'config',
    'cameraman', 'debug', 'pause', 'immune', 'manageserver', 'featuretest', 'reserve',
    'demos', 'clientdemos', 'teamchange', 'forceteamchange', 'canseeadminchat'
];

interface AdminConfigManagerProps {
    serverId: number; // Need server ID for API calls
    config: FullAdminConfig | null;
    isLoading: boolean;
    error: string | null;
    // Callbacks for actions
    onConfigReload: () => void; // To refresh data after an action
    // Add API functions as props or import them directly
    addAdminGroupApi: (serverId: number, groupData: AddGroupDto) => Promise<void>;
    deleteAdminGroupApi: (serverId: number, groupName: string) => Promise<void>;
    addAdminApi: (serverId: number, adminData: AddAdminDto) => Promise<void>;
    deleteAdminApi: (serverId: number, steamId: string, groupName: string) => Promise<void>;
}

const AdminConfigManager: React.FC<AdminConfigManagerProps> = ({
    serverId, config, isLoading, error, onConfigReload, addAdminGroupApi, deleteAdminGroupApi, addAdminApi, deleteAdminApi
}) => {

    const [isAddingGroup, setIsAddingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupPermissions, setNewGroupPermissions] = useState<Set<string>>(new Set());
    const [addGroupLoading, setAddGroupLoading] = useState(false);
    const [addGroupError, setAddGroupError] = useState<string | null>(null);
    const [deletingGroup, setDeletingGroup] = useState<string | null>(null); // Store name of group being deleted

    const [isAddingAdmin, setIsAddingAdmin] = useState(false);
    const [newAdminSteamId, setNewAdminSteamId] = useState('');
    const [newAdminGroup, setNewAdminGroup] = useState('');
    const [newAdminComment, setNewAdminComment] = useState('');
    const [addAdminLoading, setAddAdminLoading] = useState(false);
    const [addAdminError, setAddAdminError] = useState<string | null>(null);
    const [deletingAdminKey, setDeletingAdminKey] = useState<string | null>(null);

    const handlePermissionToggle = (permission: string) => {
        setNewGroupPermissions(prev => {
            const newSet = new Set(prev);
            if (newSet.has(permission)) {
                newSet.delete(permission);
            } else {
                newSet.add(permission);
            }
            return newSet;
        });
    };

    const handleAddGroupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newGroupName.trim() || newGroupPermissions.size === 0) {
            setAddGroupError('组名和至少一个权限是必需的。');
            return;
        }
        setAddGroupLoading(true);
        setAddGroupError(null);
        try {
            const groupData: AddGroupDto = {
                name: newGroupName.trim(),
                permissions: Array.from(newGroupPermissions)
            };
            await addAdminGroupApi(serverId, groupData);
            // Reset form and refresh config
            setIsAddingGroup(false);
            setNewGroupName('');
            setNewGroupPermissions(new Set());
            onConfigReload(); // Tell parent to refetch
            alert('权限组添加成功!');
        } catch (err: any) {
            console.error("添加权限组失败:", err);
            setAddGroupError(err.response?.data?.message || '添加权限组失败。');
        } finally {
            setAddGroupLoading(false);
        }
    };

    const handleDeleteGroup = async (groupName: string) => {
        if (deletingGroup) return; // Prevent concurrent deletions
        if (window.confirm(`确定要删除权限组 "${groupName}" 吗？\n注意：分配到此组的管理员也将从 Admins.cfg 中移除！`)) {
            setDeletingGroup(groupName);
            try {
                await deleteAdminGroupApi(serverId, groupName);
                onConfigReload();
                alert(`权限组 "${groupName}" 已删除。`);
            } catch (err: any) {
                console.error("删除权限组失败:", err);
                alert(`删除权限组 "${groupName}" 失败: ${err.response?.data?.message || '未知错误'}`);
            } finally {
                setDeletingGroup(null);
            }
        }
    };

    const handleAddAdminSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddAdminError(null); // Clear previous errors at the start
        const steamId = newAdminSteamId.trim();
        const groupName = newAdminGroup.trim();
        const comment = newAdminComment.trim();

        if (!steamId || !groupName) {
            setAddAdminError('SteamID 和权限组是必需的。');
            return;
        }
        // Log the value being tested by the regex
        console.log(`[Frontend Check] Testing SteamID: "${steamId}", Length: ${steamId.length}`);
        // Basic SteamID64 check
        if (!/^\d{17}$/.test(steamId)) {
            setAddAdminError('请输入一个有效的 17 位 SteamID64。');
            return;
        }

        setAddAdminLoading(true);
        try {
            const adminData: AddAdminDto = { steamId, groupName, comment: comment || undefined };
            await addAdminApi(serverId, adminData);
            // Reset form and reload
            setIsAddingAdmin(false);
            setNewAdminSteamId('');
            setNewAdminGroup('');
            setNewAdminComment('');
            onConfigReload();
            alert('管理员添加成功!');
        } catch (err: any) {
            console.error("添加管理员失败:", err);
            setAddAdminError(err.response?.data?.message || '添加管理员失败。');
        } finally {
            setAddAdminLoading(false);
        }
    };

    const handleDeleteAdmin = async (steamId: string, groupName: string) => {
        const key = `${steamId}:${groupName}`;
        if (deletingAdminKey) return;
        if (window.confirm(`确定要从组 "${groupName}" 中移除管理员 ${steamId} 吗？`)) {
            setDeletingAdminKey(key);
            try {
                await deleteAdminApi(serverId, steamId, groupName);
                onConfigReload();
                alert(`已从组 "${groupName}" 中移除管理员 ${steamId}。`);
            } catch (err: any) {
                console.error("删除管理员失败:", err);
                alert(`删除管理员 ${steamId} (组: ${groupName}) 失败: ${err.response?.data?.message || '未知错误'}`);
            } finally {
                setDeletingAdminKey(null);
            }
        }
    };

    if (isLoading) return <p>正在加载管理员配置...</p>;
    if (error) return <p style={{ color: 'red' }}>加载管理员配置失败: {error}</p>;
    if (!config) return <p>未找到管理员配置信息。</p>;

    // Group admins by group name for easier display
    const adminsByGroup: { [groupName: string]: AdminEntry[] } = {};
    config.admins.forEach(admin => {
        if (!adminsByGroup[admin.groupName]) {
            adminsByGroup[admin.groupName] = [];
        }
        adminsByGroup[admin.groupName].push(admin);
    });

    return (
        <div className="space-y-fluent-xl">
            {/* --- Groups Section --- */}
            <section>
                <div className="flex justify-between items-center mb-fluent-md">
                    <h4 className="text-lg font-semibold text-neutral-foreground">权限组</h4>
                    <FluentButton 
                        variant={isAddingGroup ? 'secondary' : 'primary'} 
                        onClick={() => { setIsAddingGroup(prev => !prev); setAddGroupError(null); }} 
                        disabled={addGroupLoading}
                        icon={isAddingGroup ? null : null}
                        size="small"
                    >
                        {isAddingGroup ? '取消添加' : '添加权限组'}
                    </FluentButton>
                </div>

                {/* Add Group Form */}
                {isAddingGroup && (
                    <div className="p-fluent-lg border border-neutral-stroke rounded-fluent-md bg-neutral-background mb-fluent-md">
                        <form onSubmit={handleAddGroupSubmit} className="space-y-fluent-md">
                            <h5 className="text-md font-semibold text-neutral-foreground mb-fluent-sm">添加新权限组</h5>
                            {addGroupError && <p className="text-sm text-danger">{addGroupError}</p>}
                            <FluentInput 
                                label="组名:"
                                id="newGroupName"
                                type="text" 
                                value={newGroupName} 
                                onChange={(e) => setNewGroupName(e.target.value)}
                                required
                                disabled={addGroupLoading}
                                className="!mb-0"
                            />
                            <div>
                                <label className="block text-sm font-medium text-neutral-secondary mb-fluent-xs">权限:</label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-fluent-sm text-xs border border-neutral-stroke p-fluent-sm rounded-fluent-sm bg-white">
                                    {AVAILABLE_PERMISSIONS.map(perm => (
                                        <label key={perm} className="flex items-center space-x-fluent-xs cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={newGroupPermissions.has(perm)}
                                                onChange={() => handlePermissionToggle(perm)}
                                                disabled={addGroupLoading}
                                                className="focus:ring-brand text-brand rounded-sm"
                                            />
                                            <span className="select-none">{perm}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="mt-fluent-sm">
                                <FluentButton type="submit" variant="primary" disabled={addGroupLoading || !newGroupName.trim() || newGroupPermissions.size === 0} size="small">
                                    {addGroupLoading ? '添加中...' : '确认添加组'}
                                </FluentButton>
                            </div>
                        </form>
                    </div>
                )}

                {/* Groups Table */}
                {config.groups.length > 0 ? (
                    <FluentTable headers={["组名", "权限", "操作"]} className="mt-fluent-md">
                        {config.groups.map(group => (
                            <tr key={group.name} className="hover:bg-gray-50 text-xs">
                                <td className="px-fluent-md py-fluent-sm whitespace-nowrap text-neutral-foreground font-medium">{group.name}</td>
                                <td className="px-fluent-md py-fluent-sm text-neutral-secondary max-w-xl">
                                    <div className="flex flex-wrap gap-1">
                                        {group.permissions.map(perm => (
                                            <span key={perm} className="px-1.5 py-0.5 bg-neutral-background rounded text-neutral-secondary text-[10px]">{perm}</span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-fluent-md py-fluent-sm whitespace-nowrap text-right">
                                    <FluentButton 
                                        variant="danger" 
                                        size="small" 
                                        onClick={() => handleDeleteGroup(group.name)}
                                        disabled={deletingGroup === group.name}
                                    >
                                        {deletingGroup === group.name ? '删除中...' : '删除'}
                                    </FluentButton>
                                </td>
                            </tr>
                        ))}
                    </FluentTable>
                ) : (
                    <p className="text-sm text-neutral-secondary italic mt-fluent-md">还没有配置权限组。</p>
                )}
            </section>

            {/* --- Admins Section --- */}
            <section>
                <div className="flex justify-between items-center mb-fluent-md">
                    <h4 className="text-lg font-semibold text-neutral-foreground">管理员分配</h4>
                    <FluentButton 
                        variant={isAddingAdmin ? 'secondary' : 'primary'}
                        onClick={() => { setIsAddingAdmin(prev => !prev); setAddAdminError(null); }}
                        disabled={addAdminLoading}
                        size="small"
                    >
                        {isAddingAdmin ? '取消添加' : '添加管理员'}
                    </FluentButton>
                </div>

                 {/* Add Admin Form */}
                {isAddingAdmin && (
                    <div className="p-fluent-lg border border-neutral-stroke rounded-fluent-md bg-neutral-background mb-fluent-md">
                        <form onSubmit={handleAddAdminSubmit} className="space-y-fluent-md">
                             <h5 className="text-md font-semibold text-neutral-foreground mb-fluent-sm">添加新管理员</h5>
                             {addAdminError && <p className="text-sm text-danger">{addAdminError}</p>}
                             <FluentInput 
                                label="SteamID64:"
                                id="newAdminSteamId"
                                type="text" 
                                value={newAdminSteamId} 
                                onChange={(e) => setNewAdminSteamId(e.target.value)}
                                required
                                disabled={addAdminLoading}
                                pattern="\d{17}" // Basic validation
                                title="请输入 17 位数字的 SteamID64"
                                placeholder="例如 76561198000000000"
                             />
                             <FluentSelect 
                                label="权限组:"
                                id="newAdminGroup"
                                value={newAdminGroup}
                                onChange={(e) => setNewAdminGroup(e.target.value)}
                                required
                                disabled={addAdminLoading || config.groups.length === 0}
                             >
                                <option value="" disabled>-- 选择一个组 --</option>
                                {config.groups.map(group => (
                                    <option key={group.name} value={group.name}>{group.name}</option>
                                ))}
                             </FluentSelect>
                             {config.groups.length === 0 && <p className="text-xs text-warning">需要先创建权限组才能添加管理员。</p>}
                             <FluentInput 
                                label="注释 (可选):"
                                id="newAdminComment"
                                type="text" 
                                value={newAdminComment} 
                                onChange={(e) => setNewAdminComment(e.target.value)}
                                disabled={addAdminLoading}
                                placeholder="例如 玩家名称或备注"
                             />
                            <div className="mt-fluent-sm">
                                <FluentButton type="submit" variant="primary" disabled={addAdminLoading || !newAdminSteamId.trim() || !newAdminGroup.trim() || !/^\d{17}$/.test(newAdminSteamId.trim())} size="small">
                                    {addAdminLoading ? '添加中...' : '确认添加管理员'}
                                </FluentButton>
                            </div>
                        </form>
                    </div>
                )}

                {/* Admins List (Grouped) */}
                {Object.keys(adminsByGroup).length > 0 ? (
                    Object.entries(adminsByGroup).map(([groupName, adminsInGroup]) => (
                        <div key={groupName} className="mb-fluent-lg">
                            <h5 className="text-md font-semibold mb-fluent-sm text-neutral-secondary">组: {groupName}</h5>
                            <FluentTable headers={["SteamID64", "注释", "操作"]} className="mt-fluent-sm">
                                {adminsInGroup.map(admin => {
                                    const key = `${admin.steamId}:${admin.groupName}`;
                                    const isDeletingThis = deletingAdminKey === key;
                                    return (
                                        <tr key={key} className="hover:bg-gray-50 text-xs">
                                            <td className="px-fluent-md py-fluent-sm whitespace-nowrap text-neutral-foreground font-mono">{admin.steamId}</td>
                                            <td className="px-fluent-md py-fluent-sm text-neutral-secondary">{admin.comment || '-'}</td>
                                            <td className="px-fluent-md py-fluent-sm whitespace-nowrap text-right">
                                                <FluentButton 
                                                    variant="danger" 
                                                    size="small" 
                                                    onClick={() => handleDeleteAdmin(admin.steamId, admin.groupName)}
                                                    disabled={isDeletingThis}
                                                >
                                                    {isDeletingThis ? '删除中...' : '删除'}
                                                </FluentButton>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </FluentTable>
                        </div>
                    ))
                ) : (
                    <p className="text-sm text-neutral-secondary italic mt-fluent-md">还没有分配管理员。</p>
                )}

            </section>
        </div>
    );
};

export default AdminConfigManager; 