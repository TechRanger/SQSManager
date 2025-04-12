import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getServerInstance, getServerInstanceStatus, startServerInstance, stopServerInstance, restartServerInstance, updateServerInstance, updateServerGameFiles, getAdminConfig, addAdminGroup, deleteAdminGroup, addAdmin, deleteAdmin } from '../services/api';
import { LuSave, LuX, LuPencil, LuPlay, LuSquare, LuPower, LuRotateCcw, LuArrowLeft, LuShield, LuUsers, LuArrowDownToLine } from "react-icons/lu";
// Import shared UI components
import FluentButton from '../components/ui/FluentButton';
import Card from '../components/ui/Card';
import FluentInput from '../components/ui/FluentInput';
import FluentTextarea from '../components/ui/FluentTextarea';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import AlertMessage from '../components/ui/AlertMessage';
import { FullAdminConfig } from '../types/admin-config';
import AdminConfigManager from '../components/AdminConfigManager';
import { useAuth } from '../context/AuthContext';
import InputModal from '../components/ui/InputModal';

// 按部分显示AdminConfigManager组件的新props定义
interface AdminGroupsSectionProps {
  serverId: number;
  config: FullAdminConfig | null;
  isLoading: boolean;
  error: string | null;
  onConfigReload: () => void;
  addAdminGroupApi: (serverId: number, groupData: any) => Promise<void>;
  deleteAdminGroupApi: (serverId: number, groupName: string) => Promise<void>;
}

interface AdminAssignmentsSectionProps {
  serverId: number;
  config: FullAdminConfig | null;
  isLoading: boolean;
  error: string | null;
  onConfigReload: () => void;
  addAdminApi: (serverId: number, adminData: any) => Promise<void>;
  deleteAdminApi: (serverId: number, steamId: string, groupName: string) => Promise<void>;
}

// 权限组管理组件
const AdminGroupsSection: React.FC<AdminGroupsSectionProps> = ({
  serverId,
  config,
  isLoading,
  error,
  onConfigReload,
  addAdminGroupApi,
  deleteAdminGroupApi
}) => {
  if (isLoading) return <p>正在加载权限组配置...</p>;
  if (error) return <p className="text-red-500">加载权限组配置失败: {error}</p>;
  if (!config) return <p>未找到权限组配置信息。</p>;

  // 使用AdminConfigManager并传递forceMode='groups'属性来只显示权限组管理部分
  return (
    <AdminConfigManager
      serverId={serverId}
      config={config}
      isLoading={isLoading}
      error={error}
      onConfigReload={onConfigReload}
      addAdminGroupApi={addAdminGroupApi}
      deleteAdminGroupApi={deleteAdminGroupApi}
      addAdminApi={(() => Promise.resolve()) as any}
      deleteAdminApi={(() => Promise.resolve()) as any}
      displayMode="groups"
    />
  );
};

// 管理员分配组件
const AdminAssignmentsSection: React.FC<AdminAssignmentsSectionProps> = ({
  serverId,
  config,
  isLoading,
  error,
  onConfigReload,
  addAdminApi,
  deleteAdminApi
}) => {
  if (isLoading) return <p>正在加载管理员配置...</p>;
  if (error) return <p className="text-red-500">加载管理员配置失败: {error}</p>;
  if (!config) return <p>未找到管理员配置信息。</p>;

  // 使用AdminConfigManager并传递forceMode='admins'属性来只显示管理员分配部分
  return (
    <AdminConfigManager
      serverId={serverId}
      config={config}
      isLoading={isLoading}
      error={error}
      onConfigReload={onConfigReload}
      addAdminGroupApi={(() => Promise.resolve()) as any}
      deleteAdminGroupApi={(() => Promise.resolve()) as any}
      addAdminApi={addAdminApi}
      deleteAdminApi={deleteAdminApi}
      displayMode="admins"
    />
  );
};

// 定义服务器实例的基础接口 (可以移到共享文件)
interface ServerInstance {
    id: number;
    name: string;
    installPath: string;
    gamePort: number;
    queryPort: number;
    rconPort: number;
    beaconPort: number;
    rconPassword?: string;
    extraArgs?: string;
    isRunning: boolean;
    pid?: number;
}

// 扩展接口以包含详细状态
interface ServerDetails extends ServerInstance {
  rconStatus?: string;
  playerCount?: number | null;
  currentLevel?: string | null;
  currentLayer?: string | null;
  currentFactions?: string | null;
  nextMap?: string | null;
}

// Type for editable fields
type EditableServerData = Pick<ServerDetails, 'name' | 'installPath' | 'gamePort' | 'queryPort' | 'rconPort' | 'beaconPort' | 'rconPassword' | 'extraArgs'> & { [key: string]: string | number | undefined };

function ServerDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const serverId = id ? parseInt(id, 10) : null;
    const [server, setServer] = useState<ServerDetails | null>(null);
    const [status, setStatus] = useState<ServerDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<'idle' | 'pending' | 'restarting' | 'saving' | 'updating'>('idle');
    const [isEditing, setIsEditing] = useState(false);
    const [editableServerData, setEditableServerData] = useState<Partial<EditableServerData>>({});
    const [statusLoading, setStatusLoading] = useState(false);
    const [statusError, setStatusError] = useState<string | null>(null);
    
    // 管理员配置相关状态
    const [adminConfig, setAdminConfig] = useState<FullAdminConfig | null>(null);
    const [adminConfigLoading, setAdminConfigLoading] = useState(false);
    const [adminConfigError, setAdminConfigError] = useState<string | null>(null);

    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
    const [steamCmdPath, setSteamCmdPath] = useState(localStorage.getItem('steamCmdPath') || 'steamcmd');

    const fetchServerDetails = useCallback(async (showLoadingIndicator = false) => {
        if (!serverId) return;
        if (showLoadingIndicator) {
            setLoading(true);
        }
        setError(null);
        try {
            const response = await getServerInstance(serverId);
            setServer(response.data);
            // Initialize editable data when fetching (excluding status fields)
            setEditableServerData({
                name: response.data.name,
                installPath: response.data.installPath,
                gamePort: response.data.gamePort,
                queryPort: response.data.queryPort,
                rconPort: response.data.rconPort,
                beaconPort: response.data.beaconPort,
                extraArgs: response.data.extraArgs || '',
                rconPassword: '', // Don't prefill password
            });
        } catch (err: any) {
            console.error("获取服务器详情失败:", err);
            setError(err.response?.data?.message || '无法刷新服务器详情。');
             if (err.response?.status === 404) {
                 // If server not found, redirect or show specific message
                 setTimeout(() => navigate('/'), 3000); // Redirect after 3 seconds
             }
        } finally {
            setLoading(false);
        }
    }, [serverId, navigate]);

    const fetchServerStatus = useCallback(async () => {
        if (!serverId) return;
        setStatusLoading(true);
        setStatusError(null);
        try {
            const response = await getServerInstanceStatus(serverId);
            console.log('Fetched server status for details page:', response.data);
            setStatus(response.data);
        } catch (err: any) {
            console.error("获取服务器状态失败:", err);
            const errorMsg = err.response?.data?.message || (err instanceof Error ? err.message : '获取服务器状态失败');
            setStatusError(errorMsg);
        }
        setStatusLoading(false);
    }, [serverId]);

    // 获取管理员配置
    const fetchAdminConfig = useCallback(async () => {
        if (!serverId) return;
        setAdminConfigLoading(true);
        setAdminConfigError(null);
        try {
            const response = await getAdminConfig(serverId);
            setAdminConfig(response.data);
        } catch (err: any) {
            console.error("获取管理员配置失败:", err);
            setAdminConfigError(err.response?.data?.message || '获取管理员配置失败');
        } finally {
            setAdminConfigLoading(false);
        }
    }, [serverId]);

    // Initial load and periodic refresh (stop refresh when editing)
    useEffect(() => {
        if (serverId) {
            fetchServerDetails(true);
            fetchServerStatus();
            fetchAdminConfig(); // 加载管理员配置
            let intervalId: ReturnType<typeof setTimeout> | null = null;
            if (!isEditing) {
                 intervalId = setInterval(fetchServerStatus, 10000); 
            }
            return () => {
                 if (intervalId) clearInterval(intervalId);
             };
        } else {
            setError("无效的服务器 ID");
            setLoading(false);
        }
    }, [serverId, fetchServerDetails, isEditing, fetchServerStatus, fetchAdminConfig]);

    const toggleEditMode = () => {
        if (isEditing) {
            // Reset editable data to current server state when canceling
            if (server) {
             setEditableServerData({
                 name: server.name,
                 installPath: server.installPath,
                 gamePort: server.gamePort,
                 queryPort: server.queryPort,
                 rconPort: server.rconPort,
                 beaconPort: server.beaconPort,
                 extraArgs: server.extraArgs || '',
                    rconPassword: '', // Don't prefill password
             });
            }
         }
        setIsEditing(!isEditing);
    };

    const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        // Handle number type conversion
        const numberTypes = ['gamePort', 'queryPort', 'rconPort', 'beaconPort'];
        const newValue = numberTypes.includes(name) && type === 'number' ? parseInt(value, 10) : value;
        
        setEditableServerData(prev => ({ ...prev, [name]: newValue }));
    };

     const handleSaveChanges = async () => {
        if (!serverId) return;

        setActionLoading('saving');
        try {
            // Clean up the data to be sent
            const dataToUpdate: Partial<EditableServerData> = {
                ...editableServerData
            };
            
            // Don't send empty password
            if (dataToUpdate.rconPassword === '') {
                delete dataToUpdate.rconPassword;
            }
            
            // Validate important fields (optional validation)
            if (!dataToUpdate.name || !dataToUpdate.installPath) {
                throw new Error("名称和安装路径不能为空");
            }
            
            // Validate ports are numbers and in range
            const ports = ['gamePort', 'queryPort', 'rconPort', 'beaconPort'];
            ports.forEach(portKey => {
                const portValue = dataToUpdate[portKey as keyof typeof dataToUpdate];
                if (typeof portValue === 'number' && (portValue < 1 || portValue > 65535)) {
                    throw new Error(`端口 ${portKey} 必须在 1-65535 范围内`);
                }
            });
            
            const response = await updateServerInstance(serverId, dataToUpdate);
            setServer(prev => ({ ...prev!, ...response.data }));
            // Update status or fetch fresh status
            fetchServerStatus();
            // Exit edit mode
            setIsEditing(false);
            
        } catch (err: any) {
            console.error("更新服务器失败:", err);
            setError(err.response?.data?.message || (err instanceof Error ? err.message : '更新服务器失败'));
        } finally {
             setActionLoading('idle');
        }
    };

     const handleControlAction = async (action: 'start' | 'stop' | 'restart') => {
         if (!serverId) return;
         const loadingState = action === 'restart' ? 'restarting' : 'pending';
         setActionLoading(loadingState);
         setError(null);
         try {
             switch (action) {
                 case 'start':
                     await startServerInstance(serverId);
                     break;
                 case 'stop':
                     await stopServerInstance(serverId);
                     break;
                 case 'restart':
                     await restartServerInstance(serverId);
                     break;
             }
             // Give backend some time, then refresh with loading indicator
             const refreshDelay = action === 'restart' ? 4000 : 2000;
             setTimeout(() => fetchServerDetails(true), refreshDelay);
         } catch (err: any) {
             console.error(`${action} 服务器失败:`, err);
             setError(err.response?.data?.message || `${action}服务器失败。`);
             setActionLoading('idle'); // Reset loading on error
         }
         // setLoading(false) will be called by fetchServerDetails after refresh
     };

    // --- Function to open the modal ---
    const openUpdateModal = () => {
        // Reset to last known path when opening
        setSteamCmdPath(localStorage.getItem('steamCmdPath') || 'steamcmd');
        setIsUpdateModalOpen(true);
    };

    // --- Modified function to handle Update submission from modal ---
    const handleUpdateAction = async (submittedPath: string) => {
        if (!serverId) return;
        
        const finalPath = submittedPath.trim();
        if (!finalPath) { // Should be caught by modal disable logic, but double check
            setError('SteamCMD path cannot be empty.');
            return;
        }

        // Save the path for next time
        localStorage.setItem('steamCmdPath', finalPath);
        setSteamCmdPath(finalPath); // Update state as well

        setActionLoading('updating');
        setError(null);
        setIsUpdateModalOpen(false); // Close modal before navigation
        
        try {
            await updateServerGameFiles(serverId, finalPath); 
            navigate(`/servers/${serverId}/update`);
        } catch (err: any) {
            console.error("启动更新失败:", err);
            setError(err.response?.data?.message || '启动更新过程失败。');
            setActionLoading('idle');
        } 
    };
    // --- End Update Action --- 

    if (loading) {
        return <div className="p-fluent-3xl text-center">
            <LoadingSpinner text="加载服务器详情..." />
        </div>;
    }

    if (!server) {
        return (
        <div className="p-fluent-3xl text-center">
            <AlertMessage type="warning" title="未找到服务器" message="无法加载服务器信息。" className="mb-6" />
            <Link to="/">
                <FluentButton variant="secondary">返回仪表盘</FluentButton>
            </Link>
        </div>
    );
}

    const isActionInProgress = actionLoading !== 'idle';
    const isServerRunning = !!status?.isRunning;

    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold text-neutral-foreground">服务器: {server.name}</h2>
                <Link to="/">
                    <FluentButton variant="secondary" icon={<LuArrowLeft />}>返回仪表盘</FluentButton>
                </Link>
            </div>

            {/* Non-critical Error Display */}
            {error && !loading && (
                <AlertMessage type="error" message={error} />
            )}

            {/* Grid for Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-8">
                
                {/* --- Instance Info & Control Card (Column 1) --- */}
                <div className="lg:col-span-2">
                    <Card title={
                        <div className="flex items-center justify-between w-full">
                            <span>服务器基本参数</span>
                            <div className="flex items-center">
                                {!isEditing && (
                                    <FluentButton 
                                        variant="secondary" 
                                        onClick={toggleEditMode} 
                                        disabled={isActionInProgress || loading || isServerRunning}
                                        title={isServerRunning ? "停止服务器后才能编辑" : "编辑配置"}
                                        icon={<LuPencil />}
                                        size="small"
                                        className={`ml-2 !px-2 !py-1 ${isActionInProgress || loading || isServerRunning ? '' : '!bg-blue-100 hover:!bg-blue-200'}`} 
                                    >
                                        编辑
                                    </FluentButton>
                                )}
                                {hasPermission('server:update') && !isEditing && (
                                    <FluentButton
                                        variant="secondary"
                                        onClick={openUpdateModal}
                                        disabled={isActionInProgress || isServerRunning}
                                        title={isServerRunning ? "服务器运行时无法更新" : "更新游戏文件"}
                                        icon={<LuArrowDownToLine />}
                                        size="small"
                                        className={`ml-2 !px-2 !py-1 ${isActionInProgress || isServerRunning ? '' : '!bg-teal-100 hover:!bg-teal-200'}`} 
                                    >
                                        {(actionLoading === 'updating') ? '更新中...' : '版本更新'}
                                    </FluentButton>
                                )}
                            </div>
                        </div>
                    }>
                        {isEditing ? (
                            <form onSubmit={(e) => { e.preventDefault(); handleSaveChanges(); }} className="space-y-6">
                                <FluentInput 
                                    label="名称:"
                                    name="name"
                                    value={editableServerData.name || ''}
                                    onChange={handleEditChange}
                                    required
                                    disabled={actionLoading === 'saving'}
                                    className="border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                />
                                <FluentInput 
                                    label="安装路径:"
                                    name="installPath"
                                    value={editableServerData.installPath || ''}
                                    onChange={handleEditChange}
                                    required
                                    disabled={actionLoading === 'saving'}
                                    className="border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                />
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <FluentInput 
                                        label="游戏端口:"
                                        type="number"
                                        name="gamePort"
                                        value={editableServerData.gamePort || ''}
                                        onChange={handleEditChange}
                                        required
                                        min="1"
                                        disabled={actionLoading === 'saving'}
                                        className="border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                    />
                                    <FluentInput 
                                        label="查询端口:"
                                        type="number"
                                        name="queryPort"
                                        value={editableServerData.queryPort || ''}
                                        onChange={handleEditChange}
                                        required
                                        min="1"
                                        disabled={actionLoading === 'saving'}
                                        className="border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                    />
                                    <FluentInput 
                                        label="RCON 端口:"
                                        type="number"
                                        name="rconPort"
                                        value={editableServerData.rconPort || ''}
                                        onChange={handleEditChange}
                                        required
                                        min="1"
                                        disabled={actionLoading === 'saving'}
                                        className="border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                    />
                                    <FluentInput 
                                        label="信标端口:"
                                        type="number"
                                        name="beaconPort"
                                        value={editableServerData.beaconPort || ''}
                                        onChange={handleEditChange}
                                        required
                                        min="1"
                                        disabled={actionLoading === 'saving'}
                                        className="border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                    />
                                </div>
                                <FluentInput label="RCON 密码:" type="password" name="rconPassword" value={editableServerData.rconPassword || ''} onChange={handleEditChange} placeholder="如需更改，请填写" disabled={actionLoading === 'saving'} />
                                <FluentTextarea label="额外参数:" name="extraArgs" value={editableServerData.extraArgs || ''} onChange={handleEditChange} disabled={actionLoading === 'saving'} />
                                <div className="flex justify-end space-x-4 pt-6 mt-8 bg-gradient-to-r from-transparent to-gray-50">
                                    <FluentButton type="button" variant="secondary" onClick={toggleEditMode} disabled={actionLoading === 'saving'} icon={<LuX />}>
                                        取消
                                    </FluentButton>
                                    <FluentButton type="submit" variant="primary" disabled={actionLoading === 'saving'} icon={<LuSave />}>
                                        {actionLoading === 'saving' ? '保存中...' : '保存更改'}
                                    </FluentButton>
                                </div>
                            </form>
                        ) : (
                            <div className="space-y-3 text-sm text-gray-600">
                                <p><strong>状态:</strong> {statusLoading ? (
                                    <span className="italic">加载中...</span>
                                ) : (
                                    <span className={`font-medium ${isServerRunning ? 'text-green-600' : 'text-gray-500'}`}>
                                        {isServerRunning ? '运行中' : '已停止'}
                                    </span>
                                )} {isServerRunning && status?.pid ? `(PID: ${status.pid})` : ''}</p>
                                <p><strong>安装路径:</strong> <span className="font-mono bg-gray-50 px-2 py-1 rounded">{server.installPath}</span></p>
                                <p><strong>游戏端口:</strong> {server.gamePort}</p>
                                <p><strong>查询端口:</strong> {server.queryPort}</p>
                                <p><strong>RCON 端口:</strong> {server.rconPort}</p>
                                <p><strong>信标端口:</strong> {server.beaconPort}</p>
                                <p><strong>额外参数:</strong> <span className="font-mono bg-gray-50 px-2 py-1 rounded">{server.extraArgs || '无'}</span></p>
                                <div className="flex justify-start items-center pt-6 mt-6">
                                    <div className="flex space-x-4">
                                        {!isServerRunning ? (
                                            <FluentButton 
                                                variant="primary" 
                                                onClick={() => handleControlAction('start')} 
                                                disabled={isActionInProgress || loading || isEditing} 
                                                icon={<LuPlay />} 
                                                className="shadow-none hover:shadow-md"
                                            >
                                                {actionLoading === 'pending' ? '启动中...' : '启动'}
                                            </FluentButton>
                                        ) : (
                                            <>
                                                <FluentButton 
                                                  variant="warning" 
                                                  onClick={() => handleControlAction('stop')} 
                                                  disabled={isActionInProgress || loading || isEditing} 
                                                  icon={<LuSquare />}
                                                  className={`!bg-amber-500 !text-white font-bold ${actionLoading === 'pending' ? '!bg-amber-400 !opacity-80' : ''}`}
                                                >
                                                    {actionLoading === 'pending' ? '停止中...' : '停止'}
                                                </FluentButton>
                                                <FluentButton 
                                                  variant="secondary" 
                                                  onClick={() => handleControlAction('restart')} 
                                                  disabled={isActionInProgress || loading || isEditing} 
                                                  icon={<LuPower />}
                                                  className={`!bg-blue-500 !text-white hover:!bg-blue-600 ${actionLoading === 'restarting' ? '!bg-blue-400 !opacity-80' : ''}`}
                                                >
                                                    {actionLoading === 'restarting' ? '重启中...' : '重启'}
                                                </FluentButton>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>

                {/* --- Live Status Card (Column 2) --- */}
                <div className="lg:col-span-1">
                    <Card title="实时状态" actions={
                         <FluentButton variant="secondary" size="small" onClick={fetchServerStatus} disabled={statusLoading || !isServerRunning} icon={<LuRotateCcw />}>
                             {statusLoading ? '刷新中...' : '刷新'}
                         </FluentButton>
                    }>
                        {statusLoading && <LoadingSpinner text="加载状态..." size="small" />}
                        {statusError && <AlertMessage type="error" message={statusError} title="状态错误" className="text-xs" />}
                        {!statusLoading && !statusError && (
                            isServerRunning ? (
                                <div className="space-y-3 text-sm text-gray-600">
                                    <p><strong>RCON 连接:</strong> <span className={status?.rconStatus === 'Connected' ? 'text-green-600' : 'text-amber-600'}>{status?.rconStatus || '未知'}</span></p>
                                    <p><strong>玩家数量:</strong> <span className="font-medium">{status?.playerCount ?? 'N/A'}</span></p>
                                    <p><strong>当前地图:</strong> <span className="font-medium">{status?.currentLevel || 'N/A'}</span></p>
                                    <p><strong>当前图层:</strong> <span className="font-medium">{status?.currentLayer || 'N/A'}</span></p>
                                    <p><strong>当前阵营:</strong> <span className="font-medium">{status?.currentFactions || 'N/A'}</span></p>
                                    <p><strong>下一地图:</strong> <span className="font-medium">{status?.nextMap || 'N/A'}</span></p>
                                </div>
                            ) : (
                                <AlertMessage type="info" message="服务器已停止。" />
                            )
                        )}
                    </Card>
                </div>

                {/* --- Admin Groups Card --- */}
                <div className="lg:col-span-3 md:col-span-2">
                    <Card title="权限组管理" icon={<LuShield className="h-5 w-5 text-blue-500" />}>
                        {serverId !== null && (
                            <AdminGroupsSection
                                serverId={serverId}
                                config={adminConfig}
                                isLoading={adminConfigLoading}
                                error={adminConfigError}
                                onConfigReload={fetchAdminConfig}
                                addAdminGroupApi={addAdminGroup}
                                deleteAdminGroupApi={deleteAdminGroup}
                            />
                         )}
                    </Card>
                </div>

                {/* --- Admin Assignments Card --- */}
                <div className="lg:col-span-3 md:col-span-2">
                    <Card title="管理员分配" icon={<LuUsers className="h-5 w-5 text-green-500" />}>
                             {serverId !== null && (
                            <AdminAssignmentsSection
                                     serverId={serverId}
                                     config={adminConfig} 
                                     isLoading={adminConfigLoading} 
                                     error={adminConfigError} 
                                     onConfigReload={fetchAdminConfig}
                                     addAdminApi={addAdmin}
                                     deleteAdminApi={deleteAdmin}
                                 />
                             )}
                     </Card>
                </div>
            </div>

            {/* Render the Input Modal */}
            <InputModal
                isOpen={isUpdateModalOpen}
                onClose={() => setIsUpdateModalOpen(false)}
                onSubmit={handleUpdateAction}
                title="输入 SteamCMD 路径"
                label="SteamCMD 可执行文件路径"
                initialValue={steamCmdPath}
                placeholder="例如: C:\steamcmd\steamcmd.exe 或 /usr/bin/steamcmd"
                submitText="开始更新"
                cancelText="取消"
            />
        </div>
    );
}

export default ServerDetailsPage; 