import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getServerInstance, getServerInstanceStatus, sendRconCommand, startServerInstance, stopServerInstance, restartServerInstance, updateServerInstance, getBanList, unbanPlayer, getAdminConfig, addAdminGroup, deleteAdminGroup, addAdmin, deleteAdmin } from '../services/api';
import RconTerminal from '../components/RconTerminal';
import { BanEntry } from '../types/ban';
import { FullAdminConfig } from '../types/admin-config';
import BanList from '../components/BanList';
import AdminConfigManager from '../components/AdminConfigManager';
import { LuSave, LuX, LuPencil, LuPlay, LuSquare, LuPower, LuUsers, LuRotateCcw, LuTerminal, LuArrowLeft } from "react-icons/lu";
// Import shared UI components
import FluentButton from '../components/ui/FluentButton';
import Card from '../components/ui/Card';
import FluentInput from '../components/ui/FluentInput';
import FluentTextarea from '../components/ui/FluentTextarea';
import FluentTable from '../components/ui/FluentTable';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import AlertMessage from '../components/ui/AlertMessage';
import FluentRow from '../components/ui/FluentRow';

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

// Interface for Player Info
interface PlayerInfo {
    id: string;
    eosId: string;
    steamId: string;
    name: string;
    teamId: string;
    squadId: string;
}

function ServerDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const serverId = id ? parseInt(id, 10) : null;
    const [server, setServer] = useState<ServerDetails | null>(null);
    const [status, setStatus] = useState<ServerDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rconCommand, setRconCommand] = useState('');
    const [rconResponse, setRconResponse] = useState('');
    const [actionLoading, setActionLoading] = useState<'idle' | 'pending' | 'restarting' | 'saving'>('idle');
    const [isEditing, setIsEditing] = useState(false);
    const [editableServerData, setEditableServerData] = useState<Partial<EditableServerData>>({});
    // State for player list - Split into active and disconnected
    const [activePlayers, setActivePlayers] = useState<PlayerInfo[] | null>(null);
    const [disconnectedPlayers, setDisconnectedPlayers] = useState<PlayerInfo[] | null>(null);
    const [playerListLoading, setPlayerListLoading] = useState(false);
    const [playerListError, setPlayerListError] = useState<string | null>(null);
    // State for kicking player
    const [kickingPlayerId, setKickingPlayerId] = useState<string | null>(null);
    const [kickReason, setKickReason] = useState('');
    const [kickLoading, setKickLoading] = useState(false);
    const [kickError, setKickError] = useState<string | null>(null);

    // State for Banning Player
    const [banningPlayerId, setBanningPlayerId] = useState<string | null>(null);
    const [banType, setBanType] = useState<'permanent' | 'duration'>('permanent'); // Default to permanent
    const [banEndDate, setBanEndDate] = useState<string>(''); // Store date as YYYY-MM-DD string
    const [banReason, setBanReason] = useState<string>('');
    const [banLoading, setBanLoading] = useState<boolean>(false);
    const [banError, setBanError] = useState<string | null>(null);

    // State for Ban List
    const [banList, setBanList] = useState<BanEntry[]>([]);
    const [banListLoading, setBanListLoading] = useState(false);
    const [banListError, setBanListError] = useState<string | null>(null);

    // State for Admin Config
    const [adminConfig, setAdminConfig] = useState<FullAdminConfig | null>(null);
    const [adminConfigLoading, setAdminConfigLoading] = useState(false);
    const [adminConfigError, setAdminConfigError] = useState<string | null>(null);

    const [statusLoading, setStatusLoading] = useState(false);
    const [statusError, setStatusError] = useState<string | null>(null);

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

    // Function to fetch ban list
    const fetchBanList = useCallback(async () => {
        if (!serverId) return;
        setBanListLoading(true);
        setBanListError(null);
        try {
            const response = await getBanList(serverId);
            setBanList(response.data);
        } catch (err: any) {
            console.error("获取 Ban 列表失败:", err);
            setBanListError(err.response?.data?.message || '获取 Ban 列表失败');
        }
        setBanListLoading(false);
    }, [serverId]);

    // Function to fetch admin config
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
        }
        setAdminConfigLoading(false);
    }, [serverId]);

    // Initial load and periodic refresh (stop refresh when editing)
    useEffect(() => {
        if (serverId) {
            fetchServerDetails(true);
            fetchServerStatus();
            fetchBanList();
            fetchAdminConfig(); // Fetch admin config on load
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
        // Add fetchAdminConfig to dependency array
    }, [serverId, fetchServerDetails, isEditing, fetchServerStatus, fetchBanList, fetchAdminConfig]);

    const toggleEditMode = () => {
        if (!isEditing && server) {
             // Reset editable data to current server state when entering edit mode
             setEditableServerData({
                 name: server.name,
                 installPath: server.installPath,
                 gamePort: server.gamePort,
                 queryPort: server.queryPort,
                 rconPort: server.rconPort,
                 beaconPort: server.beaconPort,
                 extraArgs: server.extraArgs || '',
                 rconPassword: '', // Always clear password field
             });
         }
        setIsEditing(!isEditing);
        setError(null); // Clear errors when toggling mode
    };

    const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setEditableServerData(prev => ({
            ...prev,
            // Handle number inputs, allow empty strings temporarily
            [name]: (name === 'gamePort' || name === 'queryPort' || name === 'rconPort' || name === 'beaconPort')
                      ? (value === '' ? '' : parseInt(value, 10) || 0)
                      : value,
        }));
    };

     const handleSaveChanges = async () => {
         if (!serverId || !server || server.isRunning) {
             setError("无法在服务器运行时保存更改。");
             return;
         }
         // Basic validation
         if (!editableServerData.name || !editableServerData.installPath) {
             setError("名称和安装路径不能为空。");
             return;
         }
        const ports = ['gamePort', 'queryPort', 'rconPort', 'beaconPort'];
        for (const portName of ports) {
            const portValue = editableServerData[portName];
            if (portValue === '' || (typeof portValue === 'number' && portValue <= 0)) {
                setError(`${portName} 必须是有效的正整数。`);
                return;
            }
        }
        // RCON password is required only if changed
        // Note: We don't get the current password, so we only send if user provides one.
        // Backend validation should handle if it's actually required for other changes.

        setActionLoading('saving');
        setError(null);

        try {
            const dataToSend = {
                name: editableServerData.name,
                installPath: editableServerData.installPath,
                gamePort: Number(editableServerData.gamePort),
                queryPort: Number(editableServerData.queryPort),
                rconPort: Number(editableServerData.rconPort),
                beaconPort: Number(editableServerData.beaconPort),
                // Only send password if user entered something
                rconPassword: editableServerData.rconPassword ? editableServerData.rconPassword : undefined,
                // Send empty string if trimmed value is empty, null, or undefined
                extraArgs: editableServerData.extraArgs?.trim() ?? '',
            };

            await updateServerInstance(serverId, dataToSend);
            setIsEditing(false); // Exit edit mode on success
            await fetchServerDetails(true); // Refresh data after save
            // TODO: Show success message?
        } catch (err: any) {
            console.error("保存更改失败:", err);
            setError(err.response?.data?.message || '保存服务器配置失败。');
        } finally {
            setActionLoading('idle');
        }
     };

    // --- Player List Logic ---
    const parseListPlayers = (rawOutput: string): { active: PlayerInfo[], disconnected: PlayerInfo[] } => {
        const lines = rawOutput.split('\n');
        const active: PlayerInfo[] = [];
        const disconnected: PlayerInfo[] = [];
        // More precise section tracking
        let section: 'active' | 'disconnected' | 'other' = 'other';

        for (const line of lines) {
            const trimmedLine = line.trim(); // Trim whitespace
            if (trimmedLine.includes('----- Active Players -----')) {
                section = 'active';
                continue;
            }
            // Match the exact string including [Max of 15]
            if (trimmedLine.startsWith('----- Recently Disconnected Players [Max of 15] -----')) {
                section = 'disconnected';
                continue;
            }

            // Only process lines starting with ID within the correct section
            if (trimmedLine.startsWith('ID:') && (section === 'active' || section === 'disconnected')) {
                const idMatch = trimmedLine.match(/ID: (\d+)/);
                const eosMatch = trimmedLine.match(/EOS: ([a-f0-9]{32})/);
                const steamMatch = trimmedLine.match(/steam: (\d+)/);
                const nameMatch = trimmedLine.match(/Name: ([^|]+)/);
                const teamIdMatch = trimmedLine.match(/Team ID: (\d+|N\/A)/);
                const squadIdMatch = trimmedLine.match(/Squad ID: (\d+|N\/A)/);
                
                // Only try to match Team ID for active players
                let teamId = 'N/A';
                if (section === 'active') {
                    if (teamIdMatch) {
                        teamId = teamIdMatch[1];
                    } else {
                        // Skip active player if Team ID cannot be parsed?
                        // Or assign default? Let's assign 'N/A' for now.
                         console.warn("Could not parse Team ID for active player line:", trimmedLine);
                    }
                }

                // Proceed if basic info is found
                if (idMatch && eosMatch && steamMatch && nameMatch) {
                    const playerInfo: PlayerInfo = {
                        id: idMatch[1],
                        eosId: eosMatch[1],
                        steamId: steamMatch[1],
                        name: nameMatch[1].trim(),
                        teamId: teamId, // Assign parsed or default 'N/A'
                        squadId: squadIdMatch ? squadIdMatch[1] : 'N/A',
                    };
                    // Add to the correct array based on the current section
                    if (section === 'active') {
                        active.push(playerInfo);
                    } else if (section === 'disconnected') {
                        disconnected.push(playerInfo);
                    }
                }
            }
        }
        return { active, disconnected };
    };

    const fetchPlayers = async () => {
        console.log('[fetchPlayers] Attempting to fetch players...'); // Log start
        if (!serverId) {
            console.error('[fetchPlayers] Error: serverId is missing.');
            setPlayerListError("无效的服务器 ID。");
            return;
        }
        // Re-check status just before fetching
        if (!status?.isRunning || status?.rconStatus !== 'Connected') {
            console.warn('[fetchPlayers] Status check failed: isRunning:', status?.isRunning, 'rconStatus:', status?.rconStatus);
            setPlayerListError("无法获取玩家列表：服务器未运行或 RCON 未连接。");
            setActivePlayers(null);
            setDisconnectedPlayers(null);
            return;
        }
        setPlayerListLoading(true);
        setPlayerListError(null);
        setActivePlayers(null);
        setDisconnectedPlayers(null);
        try {
            console.log('[fetchPlayers] Sending ListPlayers RCON command...');
            const response = await sendRconCommand(serverId, 'ListPlayers');
            // Log the FULL raw response here
            console.log('--- [fetchPlayers] RAW RCON RESPONSE ---');
            console.log(response.data.response);
            console.log('--- END RAW RCON RESPONSE ---');
            // console.log('[fetchPlayers] RCON response received:', response.data.response?.substring(0, 100) + '...'); // Log snippet
            console.log('[fetchPlayers] Parsing RCON response...');
            const { active, disconnected } = parseListPlayers(response.data.response);
            console.log('[fetchPlayers] Parsing complete. Active:', active.length, 'Disconnected:', disconnected.length);
            setActivePlayers(active);
            setDisconnectedPlayers(disconnected);
        } catch (err: any) {
            console.error("[fetchPlayers] Error fetching or parsing players:", err);
            setPlayerListError(err.response?.data?.message || '获取或解析玩家列表失败。');
        } finally {
            setPlayerListLoading(false);
            console.log('[fetchPlayers] Fetch finished.');
        }
    };
    // --- End Player List Logic ---

    // --- Kick Player Logic ---
    const handleKickButtonClick = (playerId: string) => {
        setKickingPlayerId(playerId);
        setKickReason(''); // Clear previous reason
        setKickError(null); // Clear previous error
    };

    const handleCancelKick = () => {
        setKickingPlayerId(null);
        setKickReason('');
        setKickError(null);
    };

    const handleConfirmKick = async () => {
        if (!serverId || !kickingPlayerId || !kickReason.trim()) {
            setKickError("请输入踢出原因。");
            return;
        }
        setKickLoading(true);
        setKickError(null);
        try {
            const command = `AdminKickById ${kickingPlayerId} ${kickReason.trim()}`;
            await sendRconCommand(serverId, command);
            // Kick successful
            handleCancelKick(); // Close the kick input area
            // Optionally add a success message state or alert
            alert(`玩家 ${kickingPlayerId} 已被踢出，原因: ${kickReason.trim()}`);
            // Refresh player list after kicking, with a delay
            setTimeout(() => {
                fetchPlayers();
            }, 1500); // Delay for 1.5 seconds to allow server to update
        } catch (err: any) {
            console.error("踢出玩家失败:", err);
            setKickError(err.response?.data?.message || '踢出玩家失败。');
        } finally {
            setKickLoading(false);
        }
    };
    // --- End Kick Player Logic ---

    // --- Ban Player Logic ---
    const handleBanButtonClick = (playerId: string) => {
        setBanningPlayerId(playerId);
        setBanType('permanent'); // Reset to default
        setBanEndDate('');
        setBanReason('');
        setBanError(null);
    };

    const handleCancelBan = () => {
        setBanningPlayerId(null);
        setBanType('permanent');
        setBanEndDate('');
        setBanReason('');
        setBanError(null);
    };

    // Helper to calculate BanLength string (e.g., "0", "1d", "3m", "2y")
    const calculateBanLength = (): string => {
        if (banType === 'permanent') {
            return '0';
        }
        if (!banEndDate) {
            setBanError('请选择封禁截止日期。');
            return ''; // Indicate error
        }

        const endDate = new Date(banEndDate);
        const now = new Date();
        // Set hours, minutes, seconds to avoid issues with DST or exact time
        endDate.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);

        const diffTime = endDate.getTime() - now.getTime();

        if (diffTime <= 0) {
            setBanError('截止日期必须是将来的日期。');
            return ''; // Indicate error
        }

        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Simple approximation for Squad's format (doesn't handle complex mixes easily)
        // Prioritize longer units if close
        if (diffDays >= 365) {
            const years = Math.round(diffDays / 365);
            return `${years}y`;
        } else if (diffDays >= 30) {
            const months = Math.round(diffDays / 30);
            return `${months}m`;
        } else {
            return `${diffDays}d`;
        }
    };

    const handleConfirmBan = async () => {
        if (!serverId || !banningPlayerId || !banReason.trim()) {
            setBanError('请输入封禁原因。');
            return;
        }
        
        const banLength = calculateBanLength();
        if (!banLength) {
            // Error is set within calculateBanLength
            return; 
        }

        setBanLoading(true);
        setBanError(null);
        let success = true;
        try {
            const command = `AdminBanById ${banningPlayerId} "${banLength}" ${banReason.trim()}`;
            console.log('[handleConfirmBan] Sending command:', command);
            await sendRconCommand(serverId, command);
            
            alert(`玩家 ${banningPlayerId} 已被封禁，原因: ${banReason.trim()}, 时长: ${banLength === '0' ? '永久' : banLength}`);
            handleCancelBan(); // Close the ban UI
            // Move setTimeout outside the main try/catch/finally flow 
            // to avoid potential linter issues with return type in render context.
            // This might slightly delay the refresh if alert is slow, but should be fine.
            // setTimeout(fetchBanList, 1500); 
        } catch (err: any) {
            console.error("封禁玩家失败:", err);
            setBanError(err.response?.data?.message || '封禁玩家失败。');
            // Don't refresh list on error
            success = false;
        } finally {
            setBanLoading(false);
        }

        // Refresh ban list on success, after state updates
        if (success) {
            setTimeout(fetchBanList, 1500); 
        }
    };
    // --- End Ban Player Logic ---

    const handleRconSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!serverId || !rconCommand || !server?.isRunning || server?.rconStatus !== 'Connected' || actionLoading !== 'idle') return;
        setActionLoading('pending');
        setRconResponse('');
        setError(null);
        try {
            const response = await sendRconCommand(serverId, rconCommand);
            setRconResponse(response.data.response);
            setRconCommand('');
        } catch (err: any) {
            console.error("发送 RCON 命令失败:", err);
            setError(err.response?.data?.message || '发送 RCON 命令失败。');
             setRconResponse('');
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

    // Handler for unban action
    const handleUnban = async (lineContent: string) => {
        if (!serverId) return;
        try {
            await unbanPlayer(serverId, lineContent);
            alert('解 Ban 成功！列表将在稍后刷新。'); // Provide user feedback
            // Refresh the ban list after a short delay to allow file changes to settle?
            setTimeout(fetchBanList, 1000);
        } catch (err) {
             console.error("解 Ban 请求失败:", err);
             // Error is already alerted in BanList component, re-throwing might not be needed
             // throw err; // Re-throw to be caught by BanList component's handler? Or handle here.
        }
    };

    if (loading && !server) return (
        <div className="flex justify-center items-center p-fluent-3xl">
            <LoadingSpinner text="加载服务器详情..." size="large" />
        </div>
    );
    if (error && !server) return (
        <div className="p-fluent-3xl text-center">
            <AlertMessage type="error" message={error} className="mb-fluent-lg" />
            <Link to="/">
                <FluentButton variant="primary">返回仪表盘</FluentButton>
            </Link>
        </div>
    );
    if (!server) return (
        <div className="p-fluent-3xl text-center">
            <AlertMessage type="warning" title="未找到服务器" message="无法加载服务器信息。" className="mb-fluent-lg" />
            <Link to="/">
                <FluentButton variant="secondary">返回仪表盘</FluentButton>
            </Link>
        </div>
    );

    const isActionInProgress = actionLoading !== 'idle';
    const isServerRunning = !!status?.isRunning;

    return (
        <div className="space-y-fluent-lg">
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-fluent-lg">
                
                {/* --- Instance Info & Control Card (Column 1) --- */}
                <div className="lg:col-span-2">
                    <Card title="实例信息 & 控制">
                        {isEditing ? (
                            <form onSubmit={(e) => { e.preventDefault(); handleSaveChanges(); }} className="space-y-fluent-md">
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
                                <div className="grid grid-cols-2 gap-fluent-md">
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
                                <div className="flex justify-end space-x-3 pt-5 mt-6 bg-gradient-to-r from-transparent to-gray-50">
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
                                <div className="flex justify-between items-center pt-6 mt-6 bg-gradient-to-r from-white via-gray-50 to-white">
                                    <div className="flex space-x-fluent-sm">
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
                                                <FluentButton variant="warning" onClick={() => handleControlAction('stop')} disabled={isActionInProgress || loading || isEditing} icon={<LuSquare />}>
                                                    {actionLoading === 'pending' ? '停止中...' : '停止'}
                                                </FluentButton>
                                                <FluentButton variant="secondary" onClick={() => handleControlAction('restart')} disabled={isActionInProgress || loading || isEditing} icon={<LuPower />}>
                                                    {actionLoading === 'restarting' ? '重启中...' : '重启'}
                                                </FluentButton>
                                            </>
                                        )}
                                    </div>
                                    <FluentButton 
                                        variant="secondary" 
                                        onClick={toggleEditMode} 
                                        disabled={isActionInProgress || loading || isServerRunning}
                                        title={isServerRunning ? "停止服务器后才能编辑" : "编辑配置"}
                                        icon={<LuPencil />}
                                    >
                                        编辑
                                    </FluentButton>
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

                {/* --- Player List Card (Row 2, Span 2 cols) --- */}
                <div className="lg:col-span-2">
                     <Card title="玩家列表" actions={
                         <FluentButton variant="secondary" size="small" onClick={fetchPlayers} disabled={playerListLoading || !isServerRunning || status?.rconStatus !== 'Connected'} icon={<LuUsers />}>
                            {playerListLoading ? '刷新中...' : '刷新列表'}
                         </FluentButton>
                     }>
                        {playerListLoading && <LoadingSpinner text="加载玩家列表..." size="medium" className="my-fluent-lg" />}
                        {playerListError && <AlertMessage type="error" message={playerListError} className="mb-fluent-md" />}
                        
                        {(() => {
                            if (playerListLoading || playerListError) return null;

                            const isRunning = !!status?.isRunning;
                            const rconConnected = status?.rconStatus === 'Connected';
                            const shouldShowList = isRunning && rconConnected;

                            if (shouldShowList) {
                                if ((activePlayers === null || activePlayers.length === 0) && (disconnectedPlayers === null || disconnectedPlayers.length === 0)) {
                                    return <AlertMessage type="info" message="没有在线或最近断开连接的玩家。" />
                                }
                                return (
                                    <div className="space-y-fluent-lg">
                                        {activePlayers !== null && activePlayers.length > 0 && (
                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-fluent-lg">
                                                <div>
                                                    <h4 className="text-md font-semibold mb-fluent-sm text-neutral-foreground">队伍 1</h4>
                                                    {activePlayers.filter(p => p.teamId === '1').length > 0 ? (
                                                        <FluentTable headers={["ID", "Name", "Steam ID", "Squad ID", "操作"]}>
                                                            {activePlayers.filter(p => p.teamId === '1').map((player) => (
                                                                <FluentRow key={`${player.id}-t1`}>
                                                                    <td className="whitespace-nowrap text-gray-700">{player.id}</td>
                                                                    <td className="whitespace-nowrap text-gray-700 max-w-xs truncate" title={player.name}>{player.name}</td>
                                                                    <td className="whitespace-nowrap text-gray-500">{player.steamId}</td>
                                                                    <td className="whitespace-nowrap text-gray-500">{player.squadId}</td>
                                                                    <td className="whitespace-nowrap text-right">
                                                                        <div className="flex justify-end space-x-2">
                                                                            <FluentButton
                                                                                variant="warning"
                                                                                size="small"
                                                                                onClick={() => handleKickButtonClick(player.id)}
                                                                                disabled={!!kickingPlayerId || !isServerRunning}
                                                                            >
                                                                                踢出
                                                                            </FluentButton>
                                                                            <FluentButton
                                                                                variant="danger"
                                                                                size="small"
                                                                                onClick={() => handleBanButtonClick(player.id)}
                                                                                disabled={!!banningPlayerId || !isServerRunning}
                                                                            >
                                                                                封禁
                                                                            </FluentButton>
                                                                        </div>
                                                                    </td>
                                                                </FluentRow>
                                                            ))}
                                                        </FluentTable>
                                                    ) : (
                                                        <p className="text-sm text-neutral-secondary italic">队伍 1 没有玩家在线。</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <h4 className="text-md font-semibold mb-fluent-sm text-neutral-foreground">队伍 2</h4>
                                                    {activePlayers.filter(p => p.teamId === '2').length > 0 ? (
                                                        <FluentTable headers={["ID", "Name", "Steam ID", "Squad ID", "操作"]}>
                                                            {activePlayers.filter(p => p.teamId === '2').map((player) => (
                                                                 <FluentRow key={`${player.id}-t2`}>
                                                                    <td className="whitespace-nowrap text-gray-700">{player.id}</td>
                                                                    <td className="whitespace-nowrap text-gray-700 max-w-xs truncate" title={player.name}>{player.name}</td>
                                                                    <td className="whitespace-nowrap text-gray-500">{player.steamId}</td>
                                                                    <td className="whitespace-nowrap text-gray-500">{player.squadId}</td>
                                                                    <td className="whitespace-nowrap text-right">
                                                                        <div className="flex justify-end space-x-2">
                                                                            <FluentButton
                                                                                variant="warning"
                                                                                size="small"
                                                                                onClick={() => handleKickButtonClick(player.id)}
                                                                                disabled={!!kickingPlayerId || !isServerRunning}
                                                                            >
                                                                                踢出
                                                                            </FluentButton>
                                                                            <FluentButton
                                                                                variant="danger"
                                                                                size="small"
                                                                                onClick={() => handleBanButtonClick(player.id)}
                                                                                disabled={!!banningPlayerId || !isServerRunning}
                                                                            >
                                                                                封禁
                                                                            </FluentButton>
                                                                        </div>
                                                                    </td>
                                                                </FluentRow>
                                                            ))}
                                                        </FluentTable>
                                                    ) : (
                                                        <p className="text-sm text-neutral-secondary italic">队伍 2 没有玩家在线。</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {kickingPlayerId !== null && (
                                            <div className="mt-6 p-5 rounded-xl bg-gradient-to-r from-amber-50 to-amber-100 shadow-md space-y-3">
                                                <h4 className="text-md font-semibold text-amber-700">踢出玩家: {activePlayers?.find(p => p.id === kickingPlayerId)?.name || `ID: ${kickingPlayerId}`}</h4>
                                                <FluentInput 
                                                    label="原因:" 
                                                    id="kickReason" 
                                                    value={kickReason} 
                                                    onChange={(e) => setKickReason(e.target.value)} 
                                                    placeholder="输入踢出原因" 
                                                    disabled={kickLoading} 
                                                    className="!mb-0"
                                                />
                                                {kickError && <AlertMessage type="error" message={kickError} className="text-xs !p-3 !mt-2" />}
                                                <div className="flex justify-end space-x-3 pt-3">
                                                    <FluentButton variant="secondary" onClick={handleCancelKick} disabled={kickLoading}>
                                                        取消
                                                    </FluentButton>
                                                    <FluentButton variant="warning" onClick={handleConfirmKick} disabled={kickLoading || !kickReason.trim()}>
                                                       {kickLoading ? '踢出中...' : '确认踢出'}
                                                    </FluentButton>
                                                </div>
                                            </div>
                                        )}

                                        {banningPlayerId !== null && (
                                            <div className="mt-6 p-5 rounded-xl bg-gradient-to-r from-red-50 to-red-100 shadow-md space-y-3">
                                                 <h4 className="text-md font-semibold text-red-700">封禁玩家: {activePlayers?.find(p => p.id === banningPlayerId)?.name || `ID: ${banningPlayerId}`}</h4>
                                                <div className="flex space-x-6 text-sm">
                                                    <label className="flex items-center space-x-2 cursor-pointer">
                                                        <input type="radio" name="banType" value="permanent" checked={banType === 'permanent'} onChange={() => setBanType('permanent')} disabled={banLoading} className="focus:ring-red-500 text-red-600"/>
                                                        <span>永久封禁</span>
                                                    </label>
                                                    <label className="flex items-center space-x-2 cursor-pointer">
                                                        <input type="radio" name="banType" value="duration" checked={banType === 'duration'} onChange={() => setBanType('duration')} disabled={banLoading} className="focus:ring-red-500 text-red-600"/>
                                                        <span>持续时间</span>
                                                    </label>
                                                </div>
                                                {banType === 'duration' && (
                                                    <FluentInput 
                                                        label="截止日期:" 
                                                        type="date" 
                                                        id="banEndDate" 
                                                        value={banEndDate} 
                                                        onChange={(e) => setBanEndDate(e.target.value)} 
                                                        disabled={banLoading} 
                                                        min={new Date().toISOString().split('T')[0]}
                                                        className="!mb-0 max-w-xs"
                                                    />
                                                )}
                                                <FluentInput 
                                                    label="原因:" 
                                                    id="banReason" 
                                                    value={banReason} 
                                                    onChange={(e) => setBanReason(e.target.value)} 
                                                    placeholder="输入封禁原因 (必填)" 
                                                    disabled={banLoading} 
                                                    required
                                                    className="!mb-0"
                                                />
                                                {banError && <AlertMessage type="error" message={banError} className="text-xs !p-3 !mt-2" />}
                                                <div className="flex justify-end space-x-3 pt-3">
                                                    <FluentButton variant="secondary" onClick={handleCancelBan} disabled={banLoading}>
                                                        取消
                                                    </FluentButton>
                                                    <FluentButton variant="danger" onClick={handleConfirmBan} disabled={banLoading || !banReason.trim() || (banType === 'duration' && !banEndDate)}>
                                                       {banLoading ? '封禁中...' : '确认封禁'}
                                                    </FluentButton>
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-fluent-xl">
                                            <h4 className="text-md font-semibold mb-fluent-sm text-neutral-foreground">最近断开连接的玩家</h4>
                                            {disconnectedPlayers !== null && disconnectedPlayers.length > 0 && (
                                               <FluentTable headers={["ID", "Name", "Steam ID", "EOS ID"]}>
                                                   {disconnectedPlayers.map((player) => (
                                                        <FluentRow key={`${player.id}-disconnected`}>
                                                            <td className="whitespace-nowrap text-gray-700">{player.id}</td>
                                                            <td className="whitespace-nowrap text-gray-700 max-w-xs truncate" title={player.name}>{player.name}</td>
                                                            <td className="whitespace-nowrap text-gray-500">{player.steamId}</td>
                                                            <td className="whitespace-nowrap text-gray-500">{player.eosId}</td>
                                                        </FluentRow>
                                                    ))}
                                                </FluentTable>
                                            )}
                                        </div>

                                        {activePlayers === null && disconnectedPlayers === null && !playerListLoading && !playerListError && (
                                            <p className="text-sm text-neutral-secondary italic">点击刷新按钮加载玩家列表。</p>
                                        )}
                                    </div>
                                );
                            } else if (isRunning) {
                                return <AlertMessage type="warning" message={`RCON 未连接 (${status?.rconStatus || '未知'})，无法获取玩家列表。`} />;
                            } else {
                                return <AlertMessage type="info" message="服务器已停止，无法获取玩家列表。" />;
                            }
                        })()}
                     </Card>
                </div>

                 {/* --- RCON Card (Row 2, Span 1 col) --- */}
                <div className="lg:col-span-1">
                    <Card title="RCON 控制台" >
                         {isServerRunning && status?.rconStatus === 'Connected' ? (
                             <form onSubmit={handleRconSubmit} className="flex space-x-fluent-sm">
                                 <FluentInput
                                     name="rconCommand"
                                     type="text"
                                     value={rconCommand}
                                     onChange={(e) => setRconCommand(e.target.value)}
                                     placeholder="输入 RCON 命令"
                                     disabled={isActionInProgress || loading}
                                     className="flex-grow !mb-0"
                                 />
                                 <FluentButton type="submit" variant="primary" disabled={isActionInProgress || loading || !rconCommand} icon={<LuTerminal />}>
                                     发送
                                 </FluentButton>
                             </form>
                         ) : isServerRunning ? (
                              <AlertMessage type="warning" message={`RCON 未连接 (${status?.rconStatus || '未知'})。`} />
                         ) : (
                              <AlertMessage type="info" message="服务器已停止。" />
                         )}
                         {rconResponse && (
                             <pre className="mt-fluent-md p-fluent-sm bg-neutral-background rounded-fluent-sm text-xs text-neutral-foreground overflow-auto max-h-60 font-mono">
                                 {rconResponse}
                             </pre>
                         )}
                         {error && actionLoading === 'idle' && !rconResponse && (
                             <AlertMessage type="error" message={error} className="mt-fluent-md text-xs" />
                         )}
                    </Card>
                </div>

                {/* --- Settings Cards (Row 3, Span 3 cols) --- */} 
                <div className="lg:col-span-3">
                     <Card title="服务器设置">
                         <div className="space-y-fluent-lg">
                             <BanList 
                                 bans={banList} 
                                 onUnban={handleUnban} 
                                 isLoading={banListLoading} 
                                 error={banListError} 
                             />
                             {serverId !== null && (
                                 <AdminConfigManager 
                                     serverId={serverId}
                                     config={adminConfig} 
                                     isLoading={adminConfigLoading} 
                                     error={adminConfigError} 
                                     onConfigReload={fetchAdminConfig}
                                     addAdminGroupApi={addAdminGroup}
                                     deleteAdminGroupApi={deleteAdminGroup}
                                     addAdminApi={addAdmin}
                                     deleteAdminApi={deleteAdmin}
                                 />
                             )}
                         </div>
                     </Card>
                </div>

            </div>
        </div>
    );
}

export default ServerDetailsPage; 