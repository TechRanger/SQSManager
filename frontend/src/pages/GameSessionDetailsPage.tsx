import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  getServerInstance, 
  getServerInstanceStatus, 
  sendRconCommand,
  getBanList,
  unbanPlayer 
} from '../services/api';
import Card from '../components/ui/Card';
import FluentButton from '../components/ui/FluentButton';
import FluentInput from '../components/ui/FluentInput';
import AlertMessage from '../components/ui/AlertMessage';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import FluentTable from '../components/ui/FluentTable';
import FluentRow from '../components/ui/FluentRow';
import BanList from '../components/BanList';
import { LuRefreshCw, LuArrowLeft, LuSend, LuTrash, LuUserX, LuToggleLeft, LuToggleRight, LuSettings } from "react-icons/lu";
import { BanEntry } from '../types/ban';

// 玩家接口
interface Player {
  name: string;
  steamId: string;
  ping: number;
  kills?: number;
  deaths?: number;
  score?: number;
  team?: string;
  squad?: string;
  role?: string;
  onlineTime?: string;
  eosId?: string;
  disconnectTime?: string; // 玩家断开连接的时间
}

// 服务器状态接口
interface ServerStatus {
  id: number;
  rconStatus: string;
  playerCount: number | null;
  currentLevel: string | null;
  currentLayer: string | null;
  currentFactions: string | null;
  nextLevel?: string | null;
  nextLayer?: string | null;
  players: Player[];
  recentlyDisconnectedPlayers?: Player[];
  gameTime?: string | null;
  tickRate?: number | null;
}

// 服务器实例接口
interface ServerInstance {
  id: number;
  name: string;
  description: string;
  game: string;
  ipAddress: string;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  rconPassword: string;
  rconEnabled: boolean;
  gameSettings: Record<string, any>;
  isRunning: boolean;
  startCommand?: string;
  stopCommand?: string;
  restartCommand?: string;
  createdAt: string;
  updatedAt: string;
}

// 插件接口
interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  isEnabled: boolean;
}

// Tab 接口和组件
interface TabProps {
  value: string;
  tabId: string;
  children: React.ReactNode;
}

function FluentTab({ value, tabId, children }: TabProps) {
  if (value !== tabId) return null;
  return <div>{children}</div>;
}

interface TabOption {
  id: string;
  label: string;
}

interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  tabs: TabOption[];
}

function FluentTabs({ value, onChange, tabs }: TabsProps) {
  return (
    <div className="border-b border-gray-200">
      <div className="flex -mb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`py-2 px-4 text-sm font-medium ${
              value === tab.id
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GameSessionDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const rconConsoleRef = useRef<HTMLDivElement>(null);
  
  const [server, setServer] = useState<ServerInstance | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  const [activeTab, setActiveTab] = useState<string>('settings');
  const [rconCommand, setRconCommand] = useState<string>('');
  const [rconResponses, setRconResponses] = useState<{ command: string; response: string }[]>([]);
  const [sendingCommand, setSendingCommand] = useState(false);
  
  // Ban列表状态
  const [bans, setBans] = useState<BanEntry[]>([]);
  const [bansLoading, setBansLoading] = useState(false);
  const [bansError, setBansError] = useState<string | null>(null);
  
  // 添加插件相关的状态
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [pluginsError, setPluginsError] = useState<string | null>(null);
  const [togglingPlugin, setTogglingPlugin] = useState<string | null>(null);
  
  // 获取服务器详情和状态
  useEffect(() => {
    if (!id) return;
    
    const fetchServerDetails = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // 获取服务器详情
        const serverResponse = await getServerInstance(parseInt(id));
        setServer(serverResponse.data);
        
        // 获取服务器状态
        await refreshServerStatus();
      } catch (err: any) {
        console.error("获取服务器详情失败:", err);
        setError(err.response?.data?.message || '获取服务器详情失败');
      } finally {
        setLoading(false);
      }
    };
    
    fetchServerDetails();
    
    // 每30秒自动刷新一次服务器状态
    const intervalId = setInterval(() => {
      if (!loading) {
        refreshServerStatus(false);
      }
    }, 30000);
    
    return () => clearInterval(intervalId);
  }, [id]);
  
  // 刷新服务器状态
  const refreshServerStatus = async (showRefreshing = true) => {
    if (!id) return;
    
    if (showRefreshing) {
      setRefreshing(true);
    }
    
    try {
      const statusResponse = await getServerInstanceStatus(parseInt(id));
      setServerStatus(statusResponse.data);
    } catch (err: any) {
      console.error("获取服务器状态失败:", err);
      // 不设置错误，避免影响用户体验
    } finally {
      if (showRefreshing) {
        setRefreshing(false);
      }
    }
  };
  
  // 获取Ban列表
  const fetchBanList = async () => {
    if (!id) return;
    
    setBansLoading(true);
    setBansError(null);
    
    try {
      const response = await getBanList(parseInt(id));
      setBans(response.data);
    } catch (err: any) {
      console.error("获取Ban列表失败:", err);
      setBansError(err.response?.data?.message || '获取Ban列表失败');
    } finally {
      setBansLoading(false);
    }
  };
  
  // 当切换到Ban管理标签页时加载Ban列表
  useEffect(() => {
    if (activeTab === 'bans' && id) {
      fetchBanList();
    }
  }, [activeTab, id]);
  
  // 发送RCON命令
  const handleSendCommand = async () => {
    if (!rconCommand.trim() || !id || !server?.rconEnabled) return;
    
    setSendingCommand(true);
    
    try {
      const response = await sendRconCommand(parseInt(id), rconCommand);
      
      // 添加命令和响应到历史记录 - 直接使用原始响应，不做任何处理
      setRconResponses(prev => [
        ...prev, 
        { 
          command: rconCommand, 
          response: response.data.response || ''
        }
      ]);
      
      // 清空命令输入框
      setRconCommand('');
      
      // 刷新服务器状态
      refreshServerStatus(false);
      
      // 滚动到控制台底部
      setTimeout(() => {
        if (rconConsoleRef.current) {
          rconConsoleRef.current.scrollTop = rconConsoleRef.current.scrollHeight;
        }
      }, 100);
    } catch (err: any) {
      console.error("发送RCON命令失败:", err);
      setRconResponses(prev => [
        ...prev, 
        { 
          command: rconCommand, 
          response: `错误: ${err.response?.data?.message || '发送命令失败'}`
        }
      ]);
    } finally {
      setSendingCommand(false);
    }
  };
  
  // 处理TAB键在RCON输入框中的行为
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      // 可以在这里添加命令补全功能
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendCommand();
    }
  };
  
  // 踢出玩家
  const handleKickPlayer = async (player: Player) => {
    if (!id || !server?.rconEnabled) return;
    
    try {
      // 直接使用RCON命令踢出玩家
      const kickCmd = `AdminKick "${player.steamId}"`;
      const response = await sendRconCommand(parseInt(id), kickCmd);
      
      // 添加到RCON响应中 - 直接使用原始响应
      setRconResponses(prev => [
        ...prev, 
        { 
          command: kickCmd, 
          response: response.data.response || ''
        }
      ]);
      
      // 刷新服务器状态
      refreshServerStatus();
    } catch (err: any) {
      console.error("踢出玩家失败:", err);
      setRconResponses(prev => [
        ...prev, 
        { 
          command: `AdminKick "${player.steamId}"`, 
          response: `错误: ${err.response?.data?.message || '踢出玩家失败'}`
        }
      ]);
    }
  };
  
  // 封禁玩家
  const handleBanPlayer = async (player: Player) => {
    if (!id || !server?.rconEnabled) return;
    
    try {
      // 直接使用RCON命令封禁玩家
      const banCmd = `AdminBan "${player.steamId}" 0 作弊或违反规则`;
      const response = await sendRconCommand(parseInt(id), banCmd);
      
      // 添加到RCON响应中 - 直接使用原始响应
      setRconResponses(prev => [
        ...prev, 
        { 
          command: banCmd, 
          response: response.data.response || ''
        }
      ]);
      
      // 刷新服务器状态
      refreshServerStatus();
    } catch (err: any) {
      console.error("封禁玩家失败:", err);
      setRconResponses(prev => [
        ...prev, 
        { 
          command: `AdminBan "${player.steamId}" 0 作弊或违反规则`, 
          response: `错误: ${err.response?.data?.message || '封禁玩家失败'}`
        }
      ]);
    }
  };
  
  // 清空RCON控制台
  const clearRconConsole = () => {
    setRconResponses([]);
  };
  
  // 解除玩家Ban
  const handleUnban = async (lineContent: string) => {
    if (!id) return;
    
    try {
      await unbanPlayer(parseInt(id), lineContent);
      // 重新获取Ban列表
      await fetchBanList();
    } catch (err: any) {
      console.error("解除Ban失败:", err);
      throw err; // 让BanList组件处理错误
    }
  };
  
  // 获取插件列表（示例实现）
  const fetchPlugins = async () => {
    if (!id) return;
    
    setPluginsLoading(true);
    setPluginsError(null);
    
    try {
      // 这里是模拟的数据，实际应用中应该通过API获取
      // const response = await getServerPlugins(parseInt(id));
      // setPlugins(response.data);
      
      // 模拟数据
      setTimeout(() => {
        const mockPlugins: Plugin[] = [
          {
            id: 'tk_warning',
            name: 'TK警告系统',
            description: '队友误伤警告系统，要求犯错者在聊天栏道歉',
            version: '1.0.0',
            isEnabled: true
          },
          {
            id: 'auto_balance',
            name: '自动平衡',
            description: '当队伍人数不平衡时自动调整玩家',
            version: '1.2.1',
            isEnabled: false
          },
          {
            id: 'welcome_message',
            name: '欢迎消息',
            description: '向新加入的玩家发送欢迎消息',
            version: '0.9.5',
            isEnabled: true
          },
          {
            id: 'vip_slots',
            name: 'VIP位置保留',
            description: '为VIP玩家保留服务器位置',
            version: '2.0.1',
            isEnabled: false
          }
        ];
        setPlugins(mockPlugins);
        setPluginsLoading(false);
      }, 1000);
    } catch (err: any) {
      console.error("获取插件列表失败:", err);
      setPluginsError(err.response?.data?.message || '获取插件列表失败');
      setPluginsLoading(false);
    }
  };
  
  // 切换插件启用状态（示例实现）
  const handleTogglePlugin = async (pluginId: string, currentStatus: boolean) => {
    setTogglingPlugin(pluginId);
    
    try {
      // 实际应用中应该通过API设置
      // await setPluginStatus(parseInt(id!), pluginId, !currentStatus);
      
      // 模拟API调用
      setTimeout(() => {
        setPlugins(prev => 
          prev.map(plugin => 
            plugin.id === pluginId 
              ? { ...plugin, isEnabled: !currentStatus } 
              : plugin
          )
        );
        setTogglingPlugin(null);
      }, 800);
    } catch (err: any) {
      console.error("设置插件状态失败:", err);
      setPluginsError(err.response?.data?.message || '设置插件状态失败');
      setTogglingPlugin(null);
    }
  };
  
  // 当切换到插件管理标签页时加载插件列表
  useEffect(() => {
    if (activeTab === 'plugins' && id) {
      fetchPlugins();
    }
  }, [activeTab, id]);
  
  // 如果用户没有对局管理权限，显示错误信息
  if (!hasPermission('game_session:view')) {
    return (
      <div className="p-fluent-3xl text-center">
        <AlertMessage 
          type="error" 
          message="您没有对局管理的权限" 
          className="mb-6" 
        />
        <FluentButton 
          variant="secondary" 
          onClick={() => navigate('/game-sessions')}
        >
          返回
        </FluentButton>
      </div>
    );
  }
  
  if (loading) {
    return (
      <div className="flex justify-center p-fluent-lg">
        <LoadingSpinner text="加载服务器详情..." />
      </div>
    );
  }
  
  if (error || !server) {
    return (
      <div className="p-fluent-3xl text-center">
        <AlertMessage 
          type="error" 
          message={error || "服务器不存在"} 
          className="mb-6" 
        />
        <FluentButton 
          variant="secondary" 
          onClick={() => navigate('/game-sessions')}
        >
          返回
        </FluentButton>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <FluentButton 
            variant="secondary" 
            icon={<LuArrowLeft />}
            onClick={() => navigate('/game-sessions')}
          />
          <h2 className="text-2xl font-semibold text-neutral-foreground">{server.name}</h2>
          {!server.isRunning && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
              已停止
            </span>
          )}
          {server.isRunning && serverStatus?.rconStatus === 'Connected' && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              RCON已连接
            </span>
          )}
          {server.isRunning && serverStatus?.rconStatus !== 'Connected' && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
              RCON未连接
            </span>
          )}
        </div>
        <FluentButton 
          variant="secondary" 
          icon={<LuRefreshCw />}
          onClick={() => refreshServerStatus()}
          disabled={refreshing}
        >
          {refreshing ? '刷新中...' : '刷新'}
        </FluentButton>
      </div>
      
      <Card>
        <div className="mb-6">
          <FluentTabs
            value={activeTab}
            onChange={setActiveTab}
            tabs={[
              { id: 'settings', label: '服务器设置' },
              { id: 'players', label: '玩家列表' },
              { id: 'disconnected', label: '最近离开玩家' },
              { id: 'rcon', label: 'RCON控制台' },
              { id: 'bans', label: 'Ban管理' },
              { id: 'plugins', label: '插件管理' },
            ]}
          />
        </div>
        
        <FluentTab value={activeTab} tabId="settings">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">服务器信息</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-500">服务器名称</div>
                  <div className="font-medium">{server.name}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">游戏</div>
                  <div className="font-medium">{server.game}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">描述</div>
                  <div className="font-medium">{server.description || '无'}</div>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">游戏状态</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-500">当前地图</div>
                  <div className="font-medium">{serverStatus?.currentLevel || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">当前层级</div>
                  <div className="font-medium">{serverStatus?.currentLayer || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">阵营</div>
                  <div className="font-medium">{serverStatus?.currentFactions || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">玩家数量</div>
                  <div className="font-medium">{serverStatus?.playerCount || 0}</div>
                </div>
                {serverStatus?.gameTime && (
                  <div>
                    <div className="text-sm text-gray-500">游戏时间</div>
                    <div className="font-medium">{serverStatus.gameTime}</div>
                  </div>
                )}
                {serverStatus?.tickRate && (
                  <div>
                    <div className="text-sm text-gray-500">Tick Rate</div>
                    <div className="font-medium">{serverStatus.tickRate}</div>
                  </div>
                )}
                {serverStatus?.nextLevel && (
                  <div>
                    <div className="text-sm text-gray-500">下一张地图</div>
                    <div className="font-medium">{serverStatus.nextLevel}</div>
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">游戏设置</h3>
              {server.gameSettings && Object.keys(server.gameSettings).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(server.gameSettings).map(([key, value]) => (
                    <div key={key}>
                      <div className="text-sm text-gray-500">{key}</div>
                      <div className="font-medium">{String(value)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500">没有可用的游戏设置</div>
              )}
            </div>
          </div>
        </FluentTab>
        
        <FluentTab value={activeTab} tabId="players">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">玩家列表</h3>
              <div className="flex space-x-2">
                <FluentButton 
                  variant="secondary" 
                  size="small" 
                  icon={<LuRefreshCw />} 
                  onClick={() => refreshServerStatus(true)}
                  disabled={refreshing}
                >
                  {refreshing ? '刷新中...' : '刷新玩家列表'}
                </FluentButton>
              </div>
            </div>
            
            {serverStatus?.players && serverStatus.players.length > 0 ? (
              <>
                <FluentTable 
                  headers={["玩家名", "Steam ID", "EOS ID", ...(server.game === 'Squad' ? ["队伍", "小队", "职位"] : []), "操作"]}
                  className="w-full"
                >
                  {serverStatus.players.map((player, index) => (
                    <FluentRow key={player.steamId || `player-${index}`}>
                      <td className="whitespace-nowrap text-gray-700 font-medium">{player.name}</td>
                      <td className="whitespace-nowrap text-gray-500">{player.steamId}</td>
                      <td className="whitespace-nowrap text-gray-500">{player.eosId || 'N/A'}</td>
                      {server.game === 'Squad' && (
                        <>
                          <td className="whitespace-nowrap text-gray-500">{player.team || 'N/A'}</td>
                          <td className="whitespace-nowrap text-gray-500">{player.squad || 'N/A'}</td>
                          <td className="whitespace-nowrap text-gray-500">{player.role || 'N/A'}</td>
                        </>
                      )}
                      <td className="whitespace-nowrap text-right">
                        <div className="flex justify-end space-x-2">
                          {hasPermission('server:rcon') && server.rconEnabled && (
                            <>
                              <FluentButton
                                variant="secondary"
                                size="small"
                                icon={<LuUserX />}
                                onClick={() => handleKickPlayer(player)}
                              >
                                踢出
                              </FluentButton>
                              <FluentButton
                                variant="danger"
                                size="small"
                                onClick={() => handleBanPlayer(player)}
                              >
                                封禁
                              </FluentButton>
                            </>
                          )}
                        </div>
                      </td>
                    </FluentRow>
                  ))}
                </FluentTable>
              </>
            ) : (
              <div className="text-center p-8">
                <h3 className="text-lg font-medium mb-2">当前没有玩家</h3>
                <p className="text-gray-500">服务器上线的玩家将会显示在这里</p>
              </div>
            )}
          </div>
        </FluentTab>
        
        <FluentTab value={activeTab} tabId="disconnected">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">最近离开玩家</h3>
              <FluentButton 
                variant="secondary" 
                size="small" 
                icon={<LuRefreshCw />} 
                onClick={() => refreshServerStatus(true)}
                disabled={refreshing}
              >
                {refreshing ? '刷新中...' : '刷新列表'}
              </FluentButton>
            </div>
            
            {serverStatus?.recentlyDisconnectedPlayers && serverStatus.recentlyDisconnectedPlayers.length > 0 ? (
              <>
                <div className="text-sm text-gray-600 mb-2">
                  最近离开玩家数量: {serverStatus.recentlyDisconnectedPlayers.length}
                </div>
                <FluentTable 
                  headers={["玩家名", "Steam ID", "EOS ID", "断开时间"]}
                  className="w-full"
                >
                  {serverStatus.recentlyDisconnectedPlayers.map((player, index) => (
                    <FluentRow key={player.steamId || `disconnected-${index}`}>
                      <td className="whitespace-nowrap text-gray-700 font-medium">{player.name}</td>
                      <td className="whitespace-nowrap text-gray-500">{player.steamId}</td>
                      <td className="whitespace-nowrap text-gray-500">{player.eosId || 'N/A'}</td>
                      <td className="whitespace-nowrap text-gray-500">{player.disconnectTime || 'N/A'}</td>
                    </FluentRow>
                  ))}
                </FluentTable>
              </>
            ) : (
              <div className="text-center p-8">
                <h3 className="text-lg font-medium mb-2">当前没有最近离开的玩家</h3>
                <p className="text-gray-500">最近离开的玩家将会显示在这里</p>
              </div>
            )}
          </div>
        </FluentTab>
        
        <FluentTab value={activeTab} tabId="rcon">
          {!hasPermission('server:rcon') ? (
            <AlertMessage type="error" message="您没有执行RCON命令的权限" />
          ) : !server.rconEnabled ? (
            <AlertMessage type="warning" message="该服务器未启用RCON" />
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">RCON控制台</h3>
                <FluentButton
                  variant="secondary"
                  size="small"
                  icon={<LuTrash />}
                  onClick={clearRconConsole}
                >
                  清空控制台
                </FluentButton>
              </div>
              
              <div 
                ref={rconConsoleRef}
                className="bg-gray-50 border border-gray-200 rounded-md p-3 h-96 overflow-y-auto font-mono text-sm"
              >
                {rconResponses.length === 0 ? (
                  <div className="text-gray-500 italic">输入命令并按回车执行...</div>
                ) : (
                  rconResponses.map((item, index) => (
                    <div key={index} className="mb-2">
                      <div className="text-blue-600">
                        &gt; {item.command}
                      </div>
                      <div className="pl-2 whitespace-pre-wrap text-gray-800">
                        {item.response || '无响应'}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="flex space-x-2">
                <FluentInput
                  type="text"
                  placeholder="输入RCON命令..."
                  value={rconCommand}
                  onChange={(e) => setRconCommand(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-grow font-mono"
                  disabled={!server.rconEnabled || serverStatus?.rconStatus !== 'Connected'}
                />
                <FluentButton
                  variant="primary"
                  icon={<LuSend />}
                  onClick={handleSendCommand}
                  disabled={!rconCommand.trim() || !server.rconEnabled || serverStatus?.rconStatus !== 'Connected' || sendingCommand}
                >
                  {sendingCommand ? '发送中...' : '发送'}
                </FluentButton>
              </div>
            </div>
          )}
        </FluentTab>
        
        <FluentTab value={activeTab} tabId="bans">
          {!hasPermission('server:manage_bans_web') ? (
            <AlertMessage type="error" message="您没有管理Ban列表的权限" />
          ) : !server.rconEnabled ? (
            <AlertMessage type="warning" message="该服务器未启用RCON，无法管理Ban列表" />
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Ban列表管理</h3>
                <FluentButton
                  variant="secondary"
                  size="small"
                  icon={<LuRefreshCw />}
                  onClick={fetchBanList}
                  disabled={bansLoading}
                >
                  {bansLoading ? '刷新中...' : '刷新'}
                </FluentButton>
              </div>
              
              <BanList 
                bans={bans} 
                onUnban={handleUnban} 
                isLoading={bansLoading} 
                error={bansError} 
              />
            </div>
          )}
        </FluentTab>
        
        <FluentTab value={activeTab} tabId="plugins">
          {!hasPermission('server:manage_plugins') ? (
            <AlertMessage type="error" message="您没有管理插件的权限" />
          ) : !server.rconEnabled ? (
            <AlertMessage type="warning" message="该服务器未启用RCON，无法管理插件" />
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">插件管理</h3>
                <FluentButton
                  variant="secondary"
                  size="small"
                  icon={<LuRefreshCw />}
                  onClick={fetchPlugins}
                  disabled={pluginsLoading}
                >
                  {pluginsLoading ? '刷新中...' : '刷新'}
                </FluentButton>
              </div>
              
              {pluginsError && (
                <AlertMessage type="error" message={pluginsError} className="mb-4" />
              )}
              
              {pluginsLoading ? (
                <div className="flex justify-center p-8">
                  <LoadingSpinner text="加载插件列表..." />
                </div>
              ) : plugins.length === 0 ? (
                <div className="text-center p-8">
                  <h3 className="text-lg font-medium mb-2">没有可用的插件</h3>
                  <p className="text-gray-500 mb-4">服务器上没有安装插件或插件系统未启用</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {plugins.map(plugin => (
                    <div key={plugin.id} className="border border-gray-200 rounded-lg p-4 bg-white flex flex-col">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-800">{plugin.name}</h4>
                          <p className="text-xs text-gray-500">版本 {plugin.version}</p>
                        </div>
                        <FluentButton
                          variant={plugin.isEnabled ? "success" : "secondary"}
                          size="small"
                          disabled={togglingPlugin === plugin.id || serverStatus?.rconStatus !== 'Connected'}
                          onClick={() => handleTogglePlugin(plugin.id, plugin.isEnabled)}
                          icon={plugin.isEnabled ? <LuToggleRight className="text-green-600" /> : <LuToggleLeft />}
                          className={plugin.isEnabled ? "bg-green-100 text-green-800 hover:bg-green-200" : ""}
                        >
                          {togglingPlugin === plugin.id ? 
                            (plugin.isEnabled ? '禁用中...' : '启用中...') : 
                            (plugin.isEnabled ? '已启用' : '已禁用')}
                        </FluentButton>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{plugin.description}</p>
                      <div className="mt-auto pt-2 border-t border-gray-100 flex justify-end">
                        <FluentButton
                          variant="secondary"
                          size="small"
                          disabled={serverStatus?.rconStatus !== 'Connected'}
                          icon={<LuSettings />}
                          className="text-gray-600"
                        >
                          配置
                        </FluentButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mt-6">
                <h4 className="font-medium text-gray-800 mb-2">关于插件系统</h4>
                <p className="text-sm text-gray-600">
                  插件系统利用RCON命令与服务器交互，提供扩展功能。您可以启用/禁用插件，但请确保服务器已正确配置以支持这些功能。
                  一些插件可能需要服务器重启才能完全生效。
                </p>
              </div>
            </div>
          )}
        </FluentTab>
      </Card>
    </div>
  );
}

export default GameSessionDetailsPage; 