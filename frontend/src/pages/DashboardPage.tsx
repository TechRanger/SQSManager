import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getServerInstances, startServerInstance, stopServerInstance, deleteServerInstance, getServerInstanceStatus, restartServerInstance } from '../services/api';
// Import icons
import { LuRefreshCw, LuPlay, LuSquare, LuTrash2, LuPower } from "react-icons/lu";
// Import shared UI components
import FluentButton from '../components/ui/FluentButton';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import AlertMessage from '../components/ui/AlertMessage';
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

    // Move the ref initialization to the top level
    const loadingStatesRef = useRef(loadingStates);

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

        const intervalId = setInterval(() => {
            // Check using the ref (ref value updated by Effect 2)
            if (Object.values(loadingStatesRef.current).some(s => s !== 'idle')) {
                return; // Skip refresh if any action is pending
            }
            fetchBasicStatuses(false); // Fetch if idle
        }, 5000); // Interval remains 5 seconds

        // Cleanup function to clear interval on unmount
        return () => clearInterval(intervalId);

    // This effect runs only once on mount because fetchBasicStatuses is stable
    }, [fetchBasicStatuses]);

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
     const handleManualRefresh = () => {
         setInitialLoad(true); // Show loading indicator
         Promise.all(Object.keys(servers).map(id => fetchFullServerStatus(Number(id))))
             .finally(() => setInitialLoad(false));
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
        <div className="space-y-fluent-lg">
            {/* Header Area */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold text-neutral-foreground">服务器仪表盘</h2>
                <FluentButton onClick={handleManualRefresh} disabled={initialLoad || Object.values(loadingStates).some(s => s !== 'idle')} title="手动刷新所有服务器详细状态" icon={<LuRefreshCw />}>
                    刷新状态
                </FluentButton>
            </div>

            {/* Error Message: Use AlertMessage */}
            {error && (
                <AlertMessage type="error" message={error} className="mb-fluent-lg" />
            )}

            {/* Server Grid */}
            {serverList.length === 0 && !initialLoad && !error && (
                // Use AlertMessage for info when list is empty
                <AlertMessage type="info" message="还没有配置服务器实例。" className="text-center" />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-fluent-lg">
                {serverList.map(server => {
                    if (!server) return null;
                    const currentLoadingState = loadingStates[server.id] || 'idle';
                    const isLoading = currentLoadingState !== 'idle';

                    return (
                        <div key={server.id} className={`bg-white border border-neutral-stroke rounded-fluent-lg shadow-fluent-sm transition-shadow hover:shadow-fluent-md overflow-hidden flex flex-col`}>
                            {/* Card Header */}
                            <div className="p-fluent-lg border-b border-neutral-stroke">
                                <div className="flex justify-between items-center mb-fluent-xs">
                                    <h3 className="text-lg font-semibold text-neutral-foreground truncate mr-2">
                                        <Link to={`/server/${server.id}`} className="hover:text-brand hover:underline">
                                            {server.name}
                                        </Link>
                                    </h3>
                                    <span className={`px-fluent-sm py-fluent-xs rounded-full text-xs font-medium ${server.isRunning ? 'bg-success-background text-success' : 'bg-neutral-background text-neutral-secondary'}`}>
                                        {server.isRunning ? '运行中' : '已停止'}
                                    </span>
                                </div>
                                <p className="text-sm text-neutral-secondary truncate" title={server.installPath}>路径: {server.installPath}</p>
                            </div>

                            {/* Card Body (Basic Info & Status) */}
                            <div className="p-fluent-lg space-y-fluent-sm text-sm text-neutral-secondary flex-grow">
                                <p><strong>端口:</strong> Game {server.gamePort} | Query {server.queryPort} | RCON {server.rconPort}</p>
                                {server.isRunning && (
                                    <div className="space-y-fluent-xs pl-fluent-sm border-l-2 border-neutral-stroke">
                                        {server.pid && <p><strong>PID:</strong> {server.pid}</p>}
                                        {server.rconStatus ? (
                                            <>
                                                <p><strong>RCON:</strong> {server.rconStatus}</p>
                                                {(server.rconStatus === 'Connected' || server.rconStatus === 'Error Querying') && (
                                                    <>
                                                        <p><strong>玩家:</strong> {server.playerCount ?? '-'}</p>
                                                        <p><strong>地图:</strong> {server.currentLevel || '-'} ({server.currentLayer || '-'})</p>
                                                        {/* <p><strong>阵营:</strong> {server.currentFactions || '-'}</p> */}
                                                        {/* <p><strong>下一地图:</strong> {server.nextMap || '-'}</p> */}
                                                    </>
                                                )}
                                            </>
                                        ) : <p><strong>RCON:</strong> 状态未知</p>}
                                    </div>
                                )}
                            </div>

                            {/* Card Footer (Actions) */}
                            <div className="p-fluent-md bg-neutral-background border-t border-neutral-stroke flex justify-end space-x-fluent-sm">
                                <FluentButton
                                    variant={server.isRunning ? 'warning' : 'success'}
                                    onClick={() => handleAction(server.isRunning ? 'stop' : 'start', server.id)}
                                    disabled={isLoading}
                                    icon={server.isRunning ? <LuSquare /> : <LuPlay />}
                                >
                                    {currentLoadingState === 'pending' ? (server.isRunning ? '停止中...' : '启动中...') : (server.isRunning ? '停止' : '启动')}
                                </FluentButton>
                                <FluentButton
                                    variant="secondary"
                                    onClick={() => handleAction('restart', server.id)}
                                    disabled={isLoading || !server.isRunning}
                                    icon={<LuPower />}
                                >
                                    {currentLoadingState === 'restarting' ? '重启中...' : '重启'}
                                </FluentButton>
                                <FluentButton
                                    variant="danger"
                                    onClick={() => handleAction('delete', server.id)}
                                    disabled={isLoading || server.isRunning}
                                    icon={<LuTrash2 />}
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