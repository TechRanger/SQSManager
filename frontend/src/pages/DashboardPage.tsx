import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getServerInstances, startServerInstance, stopServerInstance, deleteServerInstance, getServerInstanceStatus, restartServerInstance } from '../services/api';
// Import icons
import { LuRefreshCw, LuPlay, LuSquare, LuTrash2, LuPower, LuCloudCog } from "react-icons/lu";
// Import shared UI components
import FluentButton from '../components/ui/FluentButton';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import AlertMessage from '../components/ui/AlertMessage';
import { useAuth } from '../context/AuthContext'; // 导入权限Hook
// import './DashboardPage.css'; // Use App.css or index.css for general styles
// Optional: Import icons if needed
// import { LuRefreshCw, LuPlay, LuStopCircle, LuTrash2, LuPowerOff, LuPower } from "react-icons/lu";

// Define a simpler interface for the dashboard list
interface BasicServerInfo {
    id: number;
    name: string;
    isRunning: boolean; // Only need running status for the list
    pid?: number;
}

// Define the full interface separately (or import if shared)
interface FullServerInstance extends BasicServerInfo {
    installPath: string;
    gamePort: number;
    queryPort: number;
    rconPort: number;
    extraArgs?: string;
    currentLevel?: string;
    currentLayer?: string;
    currentFactions?: string;
    nextMap?: string;
    playerCount?: number;
    rconStatus?: string;
}

type LoadingState = 'idle' | 'pending' | 'restarting' | 'deleting';

// --- Remove Button Component (Fluent Styled) ---
// interface FluentButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
//   variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
//   icon?: React.ReactNode;
// }
//
// const FluentButton: React.FC<FluentButtonProps> = ({ variant = 'secondary', icon, children, className, ...props }) => {
//   const baseStyle = "px-fluent-md py-fluent-xs rounded-fluent-sm text-sm font-medium flex items-center justify-center space-x-fluent-xs transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1";
//   const variantStyles = {
//     primary: "bg-brand text-white hover:bg-brand-dark focus:ring-brand",
//     secondary: "bg-neutral-background text-neutral-foreground border border-neutral-stroke hover:bg-gray-200 focus:ring-brand",
//     danger: "bg-danger-background text-danger hover:bg-red-200 focus:ring-danger",
//     success: "bg-success-background text-success hover:bg-green-200 focus:ring-success",
//     warning: "bg-warning-background text-warning hover:bg-yellow-200 focus:ring-warning",
//   };
//   const disabledStyle = "disabled:bg-neutral-backgroundDisabled disabled:text-neutral-disabled disabled:border-neutral-stroke disabled:cursor-not-allowed";
//
//   return (
//     <button
//       className={`${baseStyle} ${variantStyles[variant]} ${disabledStyle} ${className}`}
//       {...props}
//     >
//       {icon && <span className="text-base">{icon}</span>}
//       {children && <span>{children}</span>}
//     </button>
//   );
// };
// --- End Button Component ---

function DashboardPage() {
    // State now holds potentially mixed info: basic + full status for some
    const [servers, setServers] = useState<Record<number, FullServerInstance>>({});
    const [loadingStates, setLoadingStates] = useState<Record<number, LoadingState>>({});
    const [error, setError] = useState<string | null>(null);
    const [initialLoad, setInitialLoad] = useState(true);
    const { hasPermission } = useAuth(); // 获取权限检查函数

    // Move the ref initialization to the top level
    const loadingStatesRef = useRef(loadingStates);
    // 增加一个ref来跟踪是否已执行过自动刷新
    const hasAutoRefreshedRef = useRef(false);

    // Fetch only basic running status from the main list endpoint
    const fetchBasicStatuses = useCallback(async (isInitial = false) => {
        setError(null);
        try {
            const response = await getServerInstances();
            const basicInstances = response.data as BasicServerInfo[];

            setServers(prevServers => {
                const newServerState: Record<number, FullServerInstance> = {};
                basicInstances.forEach(basicInfo => {
                    newServerState[basicInfo.id] = {
                        ...(prevServers[basicInfo.id] || {}),
                        ...basicInfo,
                        installPath: prevServers[basicInfo.id]?.installPath || 'N/A',
                        gamePort: prevServers[basicInfo.id]?.gamePort || 0,
                        queryPort: prevServers[basicInfo.id]?.queryPort || 0,
                        rconPort: prevServers[basicInfo.id]?.rconPort || 0,
                    };
                });
                return newServerState;
            });

            setLoadingStates(prevLoadingStates => {
                const newState = { ...prevLoadingStates };
                basicInstances.forEach(s => {
                    if (!(s.id in newState) || (newState[s.id] === 'pending')) {
                        newState[s.id] = 'idle';
                    }
                });
                return newState;
            });

        } catch (err: any) {
            console.error("获取服务器列表失败:", err);
            setError(err.response?.data?.message || '无法加载服务器列表，请检查后端服务是否运行。');
            setServers({});
        } finally {
            if (isInitial) setInitialLoad(false);
        }
    }, []);

    // Fetch full status for a SINGLE server (used after actions or manual refresh)
    const fetchFullServerStatus = useCallback(async (id: number) => {
        try {
            const statusRes = await getServerInstanceStatus(id);
            setServers(prev => ({
                ...prev,
                [id]: { ...(prev[id] || {}), ...statusRes.data } // Merge full status
            }));
        } catch (statusError: any) {
            console.error(`获取服务器 ${id} 完整状态失败:`, statusError);
            setError(`服务器 ${id}: 获取详细状态失败。`);
            // Optionally update the specific server's status to reflect the error
            setServers(prev => ({
                 ...prev,
                 [id]: { ...(prev[id] || {}), isRunning: false, rconStatus: 'Error fetching status' }
            }));
        }
    }, []);

    // Effect 1: Initial load and setting up the interval timer ONCE
    useEffect(() => {
        fetchBasicStatuses(true); // Initial load
        hasAutoRefreshedRef.current = false; // 重置自动刷新标记

        const intervalId = setInterval(() => {
            // Check using the ref (ref value updated by Effect 2)
            if (Object.values(loadingStatesRef.current).some(s => s !== 'idle')) {
                return; // Skip refresh if any action is pending
            }
            fetchBasicStatuses(false); // Fetch if idle
        }, 5000); // Interval remains 5 seconds

        // Cleanup function to clear interval on unmount
        return () => {
            clearInterval(intervalId);
            hasAutoRefreshedRef.current = false; // 组件卸载时重置标记
        };

    // This effect runs only once on mount because fetchBasicStatuses is stable
    }, [fetchBasicStatuses]);

    // 修改：在初始加载完成后只执行一次完整刷新
    useEffect(() => {
        if (!initialLoad && Object.keys(servers).length > 0 && !hasAutoRefreshedRef.current) {
            // 当初始加载完成且有服务器数据时，为所有服务器执行一次完整刷新
            console.log('页面加载完成，执行一次性自动刷新...');
            hasAutoRefreshedRef.current = true; // 标记已经执行过自动刷新
            Promise.all(Object.keys(servers).map(id => fetchFullServerStatus(Number(id))))
                .catch(err => console.error('自动刷新服务器状态时出错:', err));
        }
    }, [initialLoad, servers, fetchFullServerStatus]);

    // Effect 2: Keep the ref updated with the latest loadingStates
    useEffect(() => {
        loadingStatesRef.current = loadingStates;
    }, [loadingStates]); // This effect runs whenever loadingStates changes

    // Handle actions
    const handleAction = async (action: 'start' | 'stop' | 'restart' | 'delete', id: number) => {
        const actionStateMap: Record<typeof action, LoadingState> = {
            start: 'pending',
            stop: 'pending',
            restart: 'restarting',
            delete: 'deleting',
        };
        const actionState = actionStateMap[action];
        setLoadingStates(prev => ({ ...prev, [id]: actionState }));
        setError(null);

        try {
            switch (action) {
                case 'start': await startServerInstance(id); break;
                case 'stop': await stopServerInstance(id); break;
                case 'restart': await restartServerInstance(id); break;
                case 'delete':
                    // ... (delete logic remains the same, returns early) ...
                    const serverName = servers[id]?.name || `ID ${id}`;
                    if (window.confirm(`确定要删除服务器 ${serverName} 吗？此操作不可逆！`)) {
                        await deleteServerInstance(id);
                        setServers(prevServers => {
                            const {[id]: _, ...rest} = prevServers;
                            return rest;
                        });
                        setLoadingStates(prev => {
                             const {[id]: _, ...rest} = prev;
                             return rest;
                        });
                        return;
                    } else {
                        setLoadingStates(prev => ({ ...prev, [id]: 'idle' }));
                        return;
                    }
            }
            // Refresh FULL status for the affected server after action
            const refreshDelay = action === 'restart' ? 4000 : 1500;
            setTimeout(() => fetchFullServerStatus(id), refreshDelay);
            // Reset loading state immediately after triggering refresh
            setLoadingStates(prev => ({ ...prev, [id]: 'idle' }));

        } catch (err: any) {
            console.error(`执行操作 ${action} 失败:`, err);
            const errorMsg = err.response?.data?.message || `操作 ${action} 失败。`;
            setError(`服务器 ${id}: ${errorMsg}`);
            setLoadingStates(prev => ({ ...prev, [id]: 'idle' }));
        }
    };

     // Manual full refresh for all servers
     const [isManualRefreshing, setIsManualRefreshing] = useState(false);
     
     const handleManualRefresh = () => {
         setIsManualRefreshing(true); // 显示刷新中状态
         Promise.all(Object.keys(servers).map(id => fetchFullServerStatus(Number(id))))
             .finally(() => {
                 setIsManualRefreshing(false);
             });
     };

    // Render logic: Use LoadingSpinner and AlertMessage
    if (initialLoad && Object.keys(servers).length === 0 && !error) {
        // Use LoadingSpinner for initial load
        return (
            <div className="flex justify-center items-center p-fluent-3xl">
                <LoadingSpinner text="正在加载服务器列表..." size="large" />
            </div>
        );
    }

    const serverList = Object.values(servers);

    return (
        <div className="space-y-8">
            {/* Header Area */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold text-neutral-foreground">服务器仪表盘</h2>
                <div className="flex items-center space-x-4">
                    {hasPermission('deployment:manage') && (
                        <Link to="/deploy">
                            <FluentButton 
                                variant="primary"
                                className="!bg-green-600 hover:!bg-green-700 !text-white font-bold"
                                icon={<LuCloudCog />}
                            >
                                一键部署
                            </FluentButton>
                        </Link>
                    )}
                    <FluentButton 
                        onClick={handleManualRefresh} 
                        disabled={isManualRefreshing || initialLoad || Object.values(loadingStates).some(s => s !== 'idle')} 
                        title="手动刷新所有服务器详细状态" 
                        variant="primary"
                        className="!bg-blue-600 !text-white font-bold"
                        icon={<LuRefreshCw className={isManualRefreshing ? "animate-spin" : ""} />}
                    >
                        {isManualRefreshing ? '刷新中...' : '刷新状态'}
                    </FluentButton>
                </div>
            </div>

            {/* Error Message: Use AlertMessage */}
            {error && (
                <AlertMessage type="error" message={error} className="mb-6" />
            )}

            {/* Server Grid */}
            {serverList.length === 0 && !initialLoad && !error && (
                // Use AlertMessage for info when list is empty
                <AlertMessage type="info" message="还没有配置服务器实例。" />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8 pb-8">
                {serverList.map(server => {
                    if (!server) return null;
                    const currentLoadingState = loadingStates[server.id] || 'idle';
                    const isLoading = currentLoadingState !== 'idle';

                    return (
                        <div key={server.id} className={`bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col border border-gray-200 hover:border-gray-300 hover:translate-y-[-2px]`}>
                            {/* Card Header */}
                            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-lg font-semibold text-gray-800 truncate mr-2">
                                        <Link to={`/servers/${server.id}`} className="hover:text-blue-600 hover:underline">
                                            {server.name}
                                        </Link>
                                    </h3>
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${server.isRunning ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                        {server.isRunning ? '运行中' : '已停止'}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500 truncate" title={server.installPath}>路径: {server.installPath}</p>
                            </div>

                            {/* Card Body (Basic Info & Status) */}
                            <div className="p-6 space-y-3 text-sm text-gray-600 flex-grow">
                                <p><strong>端口:</strong> Game {server.gamePort} | Query {server.queryPort} | RCON {server.rconPort}</p>
                                {server.isRunning && (
                                    <div className="space-y-2 pl-3 border-l-2 border-gray-200">
                                        {server.pid && <p><strong>PID:</strong> {server.pid}</p>}
                                        {server.rconStatus ? (
                                            <>
                                                <p><strong>RCON:</strong> <span className={server.rconStatus === 'Connected' ? 'text-green-600' : 'text-amber-600'}>{server.rconStatus}</span></p>
                                                {(server.rconStatus === 'Connected' || server.rconStatus === 'Error Querying') && (
                                                    <>
                                                        <p><strong>玩家:</strong> <span className="font-medium">{server.playerCount ?? '-'}</span></p>
                                                        <p><strong>地图:</strong> <span className="font-medium">{server.currentLevel || '-'} ({server.currentLayer || '-'})</span></p>
                                                    </>
                                                )}
                                            </>
                                        ) : <p><strong>RCON:</strong> 状态未知</p>}
                                    </div>
                                )}
                            </div>

                            {/* Card Footer (Actions) */}
                            <div className="px-6 py-4 bg-gray-50 flex justify-center space-x-3 border-t border-gray-200">
                                <FluentButton
                                    variant={server.isRunning ? 'warning' : 'primary'}
                                    onClick={() => handleAction(server.isRunning ? 'stop' : 'start', server.id)}
                                    disabled={isLoading}
                                    icon={server.isRunning ? <LuSquare /> : <LuPlay />}
                                    className={`
                                        ${!server.isRunning ? '!bg-blue-600 !text-white' : '!bg-amber-500 !text-white'} 
                                        font-bold
                                        ${isLoading && !server.isRunning ? '!bg-blue-400 !opacity-80' : ''}
                                        ${isLoading && server.isRunning ? '!bg-amber-400 !opacity-80' : ''}
                                    `}
                                >
                                    {currentLoadingState === 'pending' ? (server.isRunning ? '停止中...' : '启动中...') : (server.isRunning ? '停止' : '启动')}
                                </FluentButton>
                                <FluentButton
                                    variant="secondary"
                                    onClick={() => handleAction('restart', server.id)}
                                    disabled={isLoading || !server.isRunning}
                                    icon={<LuPower />}
                                    className={`
                                        ${isLoading || !server.isRunning ? '!bg-gray-200 !text-gray-600' : ''} 
                                    `}
                                >
                                    {currentLoadingState === 'restarting' ? '重启中...' : '重启'}
                                </FluentButton>
                                <FluentButton
                                    variant="danger"
                                    onClick={() => handleAction('delete', server.id)}
                                    disabled={isLoading || server.isRunning}
                                    icon={<LuTrash2 />}
                                    className={`
                                        font-bold
                                        ${isLoading || server.isRunning ? '!bg-gray-200 !text-gray-600' : ''}
                                    `}
                                >
                                    {currentLoadingState === 'deleting' ? '删除中...' : '删除'}
                                </FluentButton>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Add CSS for server-list, server-card, etc. in App.css or index.css
/*
.server-list { margin-top: 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px; }
.server-card { background-color: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); border-left: 5px solid #e74c3c; transition: border-color 0.3s ease; }
.server-card.running { border-left-color: #2ecc71; }
.server-card h3 { margin-top: 0; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; color: #2c3e50; }
.server-card h3 a { color: #3498db; text-decoration: none; }
.server-card h3 a:hover { text-decoration: underline; }
.server-card p { margin: 5px 0; color: #555; font-size: 0.95em; word-wrap: break-word; }
.server-card p strong { color: #333; }
.server-actions { margin-top: 15px; display: flex; flex-wrap: wrap; gap: 10px; }
*/

export default DashboardPage; 