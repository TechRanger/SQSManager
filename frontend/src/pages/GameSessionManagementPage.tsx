import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAllServerInstances, getAllServerInstanceStatuses } from '../services/api';
import Card from '../components/ui/Card';
import AlertMessage from '../components/ui/AlertMessage';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import FluentButton from '../components/ui/FluentButton';
import FluentTable from '../components/ui/FluentTable';
import FluentRow from '../components/ui/FluentRow';
import { LuRefreshCw, LuArrowRight } from "react-icons/lu";

// 服务器实例接口 (字段变为可选以适应不同权限)
interface ServerInstance {
  id: number;
  name: string;
  description?: string; // Optional
  game?: string;        // Optional
  isRunning?: boolean;    // Optional (but likely needed even for basic view)
  rconEnabled?: boolean;  // Optional
}

// 服务器实例状态接口
interface ServerInstanceStatus {
  id: number;
  rconStatus: string;
  playerCount: number | null;
  currentLevel: string | null;
  currentLayer: string | null;
  currentFactions: string | null;
}

function GameSessionManagementPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  
  const [servers, setServers] = useState<ServerInstance[]>([]);
  const [serverStatuses, setServerStatuses] = useState<Record<number, ServerInstanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 获取所有运行中的服务器
  useEffect(() => {
    fetchServers();
    
    // 每30秒自动刷新一次
    const intervalId = setInterval(() => {
      fetchServers(false);
    }, 30000);
    
    return () => clearInterval(intervalId);
  }, []);

  // 获取服务器列表和状态
  const fetchServers = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    
    setError(null);
    
    try {
      // 获取所有服务器实例
      const serversResponse = await getAllServerInstances();
      
      // 过滤出运行中的服务器 (如果 isRunning 字段存在)
      const runningServers = serversResponse.data.filter((server: ServerInstance) => server.isRunning === true);
      setServers(runningServers);
      
      // 如果有运行中的服务器，尝试获取它们的状态
      if (runningServers.length > 0) {
        try {
           const statusesResponse = await getAllServerInstanceStatuses();
           const statusesMap: Record<number, ServerInstanceStatus> = {};
           statusesResponse.data.forEach((status: ServerInstanceStatus) => {
             // Only map statuses for servers we are showing (running servers)
             if (runningServers.some((s: ServerInstance) => s.id === status.id)) {
                statusesMap[status.id] = status;
             }
           });
           setServerStatuses(statusesMap);
        } catch (statusErr: any) {
           console.warn("获取服务器状态失败 (可能权限不足):", statusErr);
           // Don't set global error, just proceed without status info
           setServerStatuses({}); // Clear statuses on error
        }
      } else {
         setServerStatuses({}); // No running servers, clear statuses
      }
    } catch (err: any) {
      console.error("获取服务器列表失败:", err);
      setError(err.response?.data?.message || '获取服务器列表失败');
    } finally {
      if (showLoading) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  // 手动刷新
  const handleRefresh = () => {
    fetchServers(false);
  };

  // 检查用户权限
  const canViewPage = hasPermission('game_session:view');
  const canFetchServerList = hasPermission('server:view_basic') || hasPermission('server:view_all');

  if (!canViewPage || !canFetchServerList) {
    let message = '';
    if (!canViewPage && !canFetchServerList) {
      message = '您没有查看对局管理和获取服务器列表的权限。';
    } else if (!canViewPage) {
      message = '您没有查看对局管理的权限。';
    } else { // !canFetchServerList
      message = '您没有获取服务器列表的权限 (需要 server:view_basic 或 server:view_all)。';
    }

    return (
      <div className="p-fluent-3xl text-center">
        <AlertMessage 
          type="error" 
          message={message} 
          className="mb-6" 
        />
        <FluentButton 
          variant="secondary" 
          onClick={() => navigate('/')}
        >
          返回首页
        </FluentButton>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center p-fluent-lg">
        <LoadingSpinner text="加载对局列表..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-neutral-foreground">对局管理</h2>
        <FluentButton 
          variant="secondary" 
          icon={<LuRefreshCw />}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? '刷新中...' : '刷新'}
        </FluentButton>
      </div>
      
      {error && (
        <AlertMessage type="error" message={error} className="mb-6" />
      )}
      
      {servers.length === 0 ? (
        <Card>
          <div className="text-center p-8">
            <h3 className="text-lg font-medium mb-2">当前没有运行中的服务器</h3>
            <p className="text-gray-500 mb-4">所有运行中的游戏服务器都会显示在这里</p>
          </div>
        </Card>
      ) : (
        <Card>
          <FluentTable 
            headers={["服务器名称", "玩家数", "当前地图", "RCON状态", "操作"]}
          >
            {servers.map(server => {
              const status = serverStatuses[server.id]; // status might be undefined if fetch failed
              const isRconEnabled = server.rconEnabled === true; // Check if rconEnabled is explicitly true
              const rconDisplayStatus = status?.rconStatus === 'Connected' ? '已连接' : '未连接';

              return (
                <FluentRow key={server.id}>
                  <td className="whitespace-nowrap text-gray-700 font-medium">{server.name}</td>
                  <td className="whitespace-nowrap text-gray-500">
                    {status?.playerCount !== undefined && status?.playerCount !== null
                      ? `${status.playerCount}`
                      : 'N/A' // Show N/A if status or playerCount is missing
                    }
                  </td>
                  <td className="whitespace-nowrap text-gray-500">
                    {status?.currentLevel || 'N/A'} {/* Show N/A if status or currentLevel is missing */}
                  </td>
                  <td className="whitespace-nowrap">
                    {isRconEnabled ? (
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                        status?.rconStatus === 'Connected' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {status ? rconDisplayStatus : '状态未知'} {/* Handle missing status */}
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        未启用
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <FluentButton
                      variant="secondary"
                      size="small"
                      icon={<LuArrowRight />}
                      onClick={() => navigate(`/game-sessions/${server.id}`)}
                    >
                      管理
                    </FluentButton>
                  </td>
                </FluentRow>
              );
            })}
          </FluentTable>
        </Card>
      )}
    </div>
  );
}

export default GameSessionManagementPage; 