import React, { useState, useEffect } from 'react';
import { FullAdminConfig, AdminEntry } from '../types/admin-config';
import { AddGroupDto } from '../types/add-group.dto';
import { AddAdminDto } from '../types/add-admin.dto';
// Import shared UI components
import FluentButton from './ui/FluentButton';
import FluentTable from './ui/FluentTable';
import FluentInput from './ui/FluentInput';
import FluentSelect from './ui/FluentSelect';
import FluentRow from './ui/FluentRow';
import { Trash2 } from 'lucide-react';

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
    // 控制显示模式: "all" 显示所有内容, "groups" 只显示权限组, "admins" 只显示管理员分配
    displayMode?: 'all' | 'groups' | 'admins';
}

const AdminConfigManager: React.FC<AdminConfigManagerProps> = ({
    serverId, config, isLoading, error, onConfigReload, addAdminGroupApi, deleteAdminGroupApi, addAdminApi, deleteAdminApi, displayMode = 'all'
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

    // 添加调试钩子，检查config中的权限数据格式
    useEffect(() => {
        if (config && config.groups && config.groups.length > 0) {
            console.log('AdminConfigManager received config:', config);
            console.log('Checking permissions format for all groups:');
            config.groups.forEach(group => {
                console.log(`Group: ${group.name}`);
                console.log(`Permissions type: ${typeof group.permissions}, isArray: ${Array.isArray(group.permissions)}`);
                if (Array.isArray(group.permissions) && group.permissions.length > 0) {
                    console.log(`First permission: ${JSON.stringify(group.permissions[0])}, type: ${typeof group.permissions[0]}`);
                }
            });
        }
    }, [config]);

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
            // 确保权限是字符串数组
            const permissions = Array.from(newGroupPermissions);
            console.log('Submitting new group with permissions:', permissions);
            
            const groupData: AddGroupDto = {
                name: newGroupName.trim(),
                permissions: permissions
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

    // 渲染权限组管理部分
    const renderGroupsSection = () => {
        // 确保config不为null
        if (!config) return <p>未找到配置信息</p>;
        
        return (
            <section>
                <div className="flex mb-fluent-md items-center mb-4">
                    <FluentButton 
                        variant={isAddingGroup ? 'secondary' : 'primary'} 
                        onClick={() => { setIsAddingGroup(prev => !prev); setAddGroupError(null); }} 
                        disabled={addGroupLoading}
                        icon={isAddingGroup ? null : null}
                        size="small"
                        className={isAddingGroup ? "" : "!bg-blue-600 !text-white font-bold"}
                    >
                        {isAddingGroup ? '取消添加' : '添加权限组'}
                    </FluentButton>
                    <span className="ml-4 text-md font-medium text-neutral-foreground">当前权限组: {config.groups.length}个</span>
                </div>

                {/* Add Group Form */}
                {isAddingGroup && (
                    <form onSubmit={handleAddGroupSubmit} className="mb-fluent-2xl border border-brand rounded-md p-4 bg-gradient-to-r from-blue-50 to-blue-100 space-y-4 mb-6">
                        <h5 className="text-md font-semibold text-blue-700">添加新权限组</h5>
                        <FluentInput
                            name="newGroupName"
                            label="组名:"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            required
                            disabled={addGroupLoading}
                            placeholder="例如: admin, moderator, etc"
                            className="w-full"
                        />
                        
                        <div>
                            <label className="block text-sm font-medium text-neutral-secondary mb-2">权限:</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 text-xs border border-gray-300 p-3 rounded-md bg-white">
                                {AVAILABLE_PERMISSIONS.map(perm => (
                                    <label key={perm} className="flex items-center space-x-2 cursor-pointer">
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
                        
                        <div className="flex justify-end space-x-4">
                            <FluentButton 
                                type="button" 
                                disabled={addGroupLoading} 
                                onClick={() => setIsAddingGroup(false)}
                                variant="secondary"
                            >
                                取消
                            </FluentButton>
                            <FluentButton 
                                type="submit" 
                                disabled={addGroupLoading || !newGroupName.trim() || newGroupPermissions.size === 0}
                                variant="primary"
                                className={`${(addGroupLoading || !newGroupName.trim() || newGroupPermissions.size === 0) ? '!bg-gray-200 !text-gray-600' : ''}`}
                            >
                                {addGroupLoading ? '添加中...' : '添加组'}
                            </FluentButton>
                        </div>
                        
                        {addGroupError && (
                            <div className="mt-4 p-fluent-sm rounded bg-red-50 border border-red-200 text-red-700 text-sm">
                                {addGroupError}
                            </div>
                        )}
                    </form>
                )}

                {/* 显示当前组 */}
                <div className="mt-fluent-md space-y-4">
                    {config.groups.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">暂无权限组定义。</p>
                    ) : (
                        config.groups.map(group => (
                            <div key={group.name} className="border border-gray-200 rounded-md overflow-hidden mb-4">
                                <div className="bg-gray-50 p-3 border-b border-gray-200 flex justify-between items-center">
                                    <h6 className="font-bold text-neutral-foreground">{group.name}</h6>
                                    <FluentButton
                                        disabled={deletingGroup === group.name}
                                        variant="danger"
                                        size="small"
                                        onClick={() => handleDeleteGroup(group.name)}
                                        icon={<Trash2 className="h-4 w-4" />}
                                    >
                                        删除
                                    </FluentButton>
                                </div>
                                <div className="p-3 text-sm">
                                    <div className="mb-2 font-medium text-neutral-foreground">权限:</div>
                                    <div className="flex flex-wrap gap-2">
                                        {Array.isArray(group.permissions) && group.permissions.length > 0 ? (
                                            group.permissions.map(perm => (
                                                <span
                                                    key={`${group.name}-${perm}`}
                                                    className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs"
                                                >
                                                    {perm}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-gray-500 italic">无权限</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>
        );
    };

    // 渲染管理员分配部分
    const renderAdminsSection = () => {
        // 确保config不为null
        if (!config) return <p>未找到配置信息</p>;
        
        // Group admins by group name for easier display
        const adminsByGroup: { [groupName: string]: AdminEntry[] } = {};
        config.admins.forEach(admin => {
            if (!adminsByGroup[admin.groupName]) {
                adminsByGroup[admin.groupName] = [];
            }
            adminsByGroup[admin.groupName].push(admin);
        });
        
        return (
            <section>
                <div className="flex items-center mb-4">
                    <FluentButton 
                        variant={isAddingAdmin ? 'secondary' : 'primary'}
                        onClick={() => {
                            const nextIsAddingAdmin = !isAddingAdmin;
                            setIsAddingAdmin(nextIsAddingAdmin);
                            setAddAdminError(null); // Reset error on toggle
                            // If opening the form and groups exist, pre-select the first group
                            if (nextIsAddingAdmin && config?.groups?.length > 0) {
                                setNewAdminGroup(config.groups[0].name);
                            } else if (!nextIsAddingAdmin) {
                                // If closing the form via the toggle, reset fields
                                setNewAdminGroup('');
                                setNewAdminSteamId('');
                                setNewAdminComment('');
                            }
                        }}
                        disabled={addAdminLoading} // Disable toggle only if an add is in progress
                        size="small"
                        className={isAddingAdmin ? "" : "!bg-blue-600 !text-white font-bold"}
                    >
                        {isAddingAdmin ? '取消添加' : '添加管理员'}
                    </FluentButton>
                </div>

                {/* Add Admin Form */}
                {isAddingAdmin && (() => {
                    // 计算禁用状态并添加日志
                    const isSteamIdEmpty = !newAdminSteamId.trim();
                    const isGroupEmpty = !newAdminGroup;
                    const hasNoGroups = config.groups.length === 0;
                    const isSteamIdInvalid = !/^\d{17}$/.test(newAdminSteamId.trim());
                    const isButtonDisabled = addAdminLoading || isSteamIdEmpty || isGroupEmpty || hasNoGroups || isSteamIdInvalid;

                    console.log('Add Admin Button Disabled Check:', {
                        addAdminLoading,
                        isSteamIdEmpty,
                        isGroupEmpty,
                        hasNoGroups,
                        isSteamIdInvalid,
                        finalDisabled: isButtonDisabled
                    });
                    
                    // 添加日志用于调试权限组下拉菜单禁用状态
                    console.log('[AdminConfigManager] Permissions Group Select Disabled State:', {
                        isDisabled: addAdminLoading || hasNoGroups,
                        reason: { 
                            addAdminLoading: addAdminLoading, 
                            hasNoGroups: hasNoGroups 
                        }
                    });

                    return (
                        <form onSubmit={handleAddAdminSubmit} className="mb-fluent-2xl border border-green-300 rounded-md p-4 bg-gradient-to-r from-green-50 to-green-100 space-y-4 mb-6">
                            <h5 className="text-md font-semibold text-green-700">添加新管理员</h5>
                            <FluentInput 
                                label="Steam ID 64:"
                                type="text" 
                                value={newAdminSteamId} 
                                onChange={(e) => setNewAdminSteamId(e.target.value)}
                                required
                                disabled={addAdminLoading}
                                placeholder="例如 76561198012345678 (17位数字)"
                            />
                            
                            <FluentSelect 
                                label="权限组:"
                                id="newAdminGroup"
                                value={newAdminGroup}
                                onChange={(e) => setNewAdminGroup(e.target.value)}
                                required
                                disabled={addAdminLoading || hasNoGroups}
                                options={config.groups.map(group => ({ value: group.name, label: group.name }))}
                            >
                                <option value="" disabled>-- 选择一个组 --</option>
                                {config.groups.map(group => (
                                    <option key={group.name} value={group.name}>{group.name}</option>
                                ))}
                            </FluentSelect>
                            {hasNoGroups && <p className="text-xs text-warning">需要先创建权限组才能添加管理员。</p>}
                            <FluentInput 
                                label="注释 (可选):"
                                id="newAdminComment"
                                type="text" 
                                value={newAdminComment} 
                                onChange={(e) => setNewAdminComment(e.target.value)}
                                disabled={addAdminLoading}
                                placeholder="例如 玩家名称或备注"
                            />
                            
                            <div className="flex justify-end space-x-4">
                                <FluentButton 
                                    type="button" 
                                    disabled={addAdminLoading} 
                                    onClick={() => setIsAddingAdmin(false)}
                                    variant="secondary"
                                >
                                    取消
                                </FluentButton>
                                <FluentButton 
                                    type="submit" 
                                    disabled={isButtonDisabled}
                                    variant="primary"
                                    className={`${isButtonDisabled ? '!bg-gray-200 !text-gray-600' : ''}`}
                                >
                                    {addAdminLoading ? '添加中...' : '添加管理员'}
                                </FluentButton>
                            </div>
                            
                            {addAdminError && (
                                <div className="mt-4 p-fluent-sm rounded bg-red-50 border border-red-200 text-red-700 text-sm">
                                    {addAdminError}
                                </div>
                            )}
                            
                        </form>
                    );
                })()}

                {/* Admins By Group List - Using FluentTable within each group section */}
                <div className="mt-fluent-md space-y-6">
                    {Object.keys(adminsByGroup).length === 0 ? (
                        <p className="text-sm text-gray-500 italic">暂无管理员分配。</p>
                    ) : (
                        Object.entries(adminsByGroup).map(([groupName, admins]) => (
                            <div key={groupName}>
                                <h6 className="font-semibold text-neutral-foreground mb-3">权限组：{groupName}</h6>
                                <FluentTable headers={["Steam ID", "注释", "操作"]}>
                                    {admins.map((admin) => {
                                        const key = `${admin.steamId}:${admin.groupName}`;
                                        const isDeleting = deletingAdminKey === key;
                                        return (
                                            <FluentRow key={key}>
                                                <td className="whitespace-nowrap text-gray-700 font-mono">{admin.steamId}</td>
                                                <td className="text-gray-700 max-w-xs truncate">{admin.comment || '-'}</td>
                                                <td className="whitespace-nowrap text-right">
                                                    <FluentButton
                                                        variant="danger"
                                                        size="small"
                                                        disabled={isDeleting || !!deletingAdminKey}
                                                        onClick={() => handleDeleteAdmin(admin.steamId, admin.groupName)}
                                                        icon={<Trash2 className="h-4 w-4"/>}
                                                        // className="!py-1 !px-2" // Revert button style if needed
                                                    >
                                                        {isDeleting ? '删除中...' : '删除'}
                                                    </FluentButton>
                                                </td>
                                            </FluentRow>
                                        );
                                    })}
                                </FluentTable>
                            </div>
                        ))
                    )}
                </div>
            </section>
        );
    };

    if (isLoading) return <p>正在加载管理员配置...</p>;
    if (error) return <p style={{ color: 'red' }}>加载管理员配置失败: {error}</p>;
    if (!config) return <p>未找到管理员配置信息。</p>;

    // 根据displayMode显示相应的内容
    return (
        <div className="space-y-fluent-xl">
            {(displayMode === 'all' || displayMode === 'groups') && renderGroupsSection()}
            {(displayMode === 'all' || displayMode === 'admins') && renderAdminsSection()}
        </div>
    );
};

export default AdminConfigManager; 