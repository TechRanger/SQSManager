import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { DeployInstanceDto } from '../types/deploy-instance.dto';
// Import shared UI components
import FluentInput from '../components/ui/FluentInput';
import FluentButton from '../components/ui/FluentButton';
import Card from '../components/ui/Card'; // Use Card for structure
import { useAuth } from '../context/AuthContext'; // 引入 Auth Context
import AlertMessage from '../components/ui/AlertMessage'; // 引入 Alert 组件
import { getDeployUrl } from '../services/api'; // 引入 API 函数

// Define a type for the deployment status
type DeploymentStatus = 'idle' | 'deploying' | 'success' | 'error';

function DeployServerPage() {
    const { hasPermission } = useAuth(); // 获取权限检查函数
    const navigate = useNavigate();
    const [formData, setFormData] = useState<Partial<DeployInstanceDto>>({
        name: '',
        installPath: '',
        gamePort: 7787,
        queryPort: 27165,
        rconPort: 21114,
        beaconPort: 15000,
        rconPassword: '',
        extraArgs: '',
        steamCmdPath: '',
    });
    const [status, setStatus] = useState<DeploymentStatus>('idle');
    const [outputLog, setOutputLog] = useState<string[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    // Add ref for the log container element
    const logContainerRef = useRef<HTMLPreElement>(null);

    // Handle input changes
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => {
            let processedValue: string | number = value;
            if (type === 'number') {
                // Allow empty string for clearing the input
                if (value === '') {
                    processedValue = ''; // Allow empty value temporarily
                } else {
                    const parsed = parseInt(value, 10);
                    // Check if NaN or <= 0 (except for empty string case)
                    if (isNaN(parsed) || parsed <= 0) {
                        // Optionally show validation message or just prevent invalid number submission
                        // For now, let's just store the potentially invalid string/number
                        // Validation will happen on submit
                        processedValue = value; // Store the invalid value as is for now
                    } else {
                        processedValue = parsed;
                    }
                }
            } else if (type === 'textarea' || type === 'text' || type === 'password') {
                 processedValue = value; // Handle text/password/textarea directly
             }
            return {
                 ...prev,
                 [name]: processedValue,
             };
        });
    };

    // Cleanup EventSource on component unmount
    useEffect(() => {
        return () => {
            eventSourceRef.current?.close();
        };
    }, []);

    // Auto-scroll log container to bottom when new logs arrive
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [outputLog]); // Run this effect whenever outputLog changes

    const handleDeploySubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setOutputLog([]);
        setErrorMessage(null);

        // Frontend Validation
        const errors: string[] = [];
        if (!formData.name?.trim()) errors.push('实例名称不能为空。');
        if (!formData.installPath?.trim()) errors.push('安装路径不能为空。');
        if (!formData.steamCmdPath?.trim()) errors.push('SteamCMD路径不能为空。');
        if (!formData.rconPassword) errors.push('RCON 密码不能为空。');
        if (!formData.gamePort || formData.gamePort <= 0) errors.push('游戏端口必须是有效的正整数。');
        if (!formData.queryPort || formData.queryPort <= 0) errors.push('查询端口必须是有效的正整数。');
        if (!formData.rconPort || formData.rconPort <= 0) errors.push('RCON 端口必须是有效的正整数。');
        if (!formData.beaconPort || formData.beaconPort <= 0) errors.push('信标端口必须是有效的正整数。');

        if (errors.length > 0) {
            setErrorMessage(errors.join(' '));
            setStatus('error');
            return;
        }
        
        setStatus('deploying'); // Set deploying status only after validation passes

        // Get the auth token from localStorage
        const authToken = localStorage.getItem('authToken');
        if (!authToken) {
            setErrorMessage('用户未登录或认证令牌丢失。');
            setStatus('error');
            return;
        }

        // Close previous connection if exists
        eventSourceRef.current?.close();

        try {
            // Prepare DTO - Convert potentially empty strings or invalid numbers from state
             const deployDto: DeployInstanceDto = {
                 name: formData.name!.trim(),
                 installPath: formData.installPath!.trim(),
                 gamePort: Number(formData.gamePort),
                 queryPort: Number(formData.queryPort),
                 rconPort: Number(formData.rconPort),
                 beaconPort: Number(formData.beaconPort),
                 rconPassword: formData.rconPassword!,
                 extraArgs: formData.extraArgs?.trim() || '',
                 steamCmdPath: formData.steamCmdPath!.trim(),
             };

            // 使用更安全的方式获取SSE URL
            const sseUrl = getDeployUrl();
            
            // 使用POST请求创建一个新的部署任务并获取任务ID
            const headers = new Headers();
            headers.append('Content-Type', 'application/json');
            headers.append('Authorization', `Bearer ${authToken}`);
            
            // 首先发送POST请求创建部署任务
            const response = await fetch(`${sseUrl}/create`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(deployDto),
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`创建部署任务失败: ${response.statusText}`);
            }
            
            const { taskId } = await response.json();
            
            // 然后使用任务ID创建EventSource连接来监听部署进度
            console.log('Connecting to SSE endpoint:', `${sseUrl}/${taskId}`);
            
            // Establish SSE connection with task ID and token as query parameter for authentication
            const evtSource = new EventSource(`${sseUrl}/${taskId}?token=${encodeURIComponent(authToken)}`, { withCredentials: true });
            eventSourceRef.current = evtSource;

            evtSource.onmessage = (event) => {
                const data = event.data;
                console.log('SSE Message:', data);

                if (data.startsWith('DEPLOYMENT_ERROR:')) {
                    setErrorMessage(data.substring('DEPLOYMENT_ERROR:'.length).trim());
                    setStatus('error');
                    evtSource.close();
                } else if (data.startsWith('DATABASE_ERROR:')) {
                     setErrorMessage(data.substring('DATABASE_ERROR:'.length).trim());
                     setStatus('error'); // Still an error, but after partial success
                     evtSource.close();
                 } else if (data === 'DEPLOYMENT_SUCCESS') {
                    setStatus('success');
                    setOutputLog(prev => [...prev, '\n*** 部署成功完成！ ***']);
                    evtSource.close();
                    // 显示提示并延长跳转时间
                    alert('部署成功！即将返回仪表板...');
                    setTimeout(() => navigate('/'), 5000);
                } else {
                    setOutputLog(prev => [...prev, data]);
                }
            };

            evtSource.onerror = (error) => {
                console.error('EventSource failed:', error);
                setErrorMessage('连接部署服务失败，请检查后端是否运行以及网络连接。');
                setStatus('error');
                evtSource.close();
            };

        } catch (error) {
            console.error("Deployment setup error:", error);
            setErrorMessage('启动部署时发生错误。');
            setStatus('error');
        }
    }, [formData, navigate]);

    const isLoading = status === 'deploying';

    // 检查用户是否有部署权限
    if (!hasPermission('deployment:manage')) {
        return (
            <div className="space-y-fluent-lg">
                <Card>
                    <AlertMessage 
                        type="error" 
                        message="错误，没有相关权限。您需要 'deployment:manage' 权限才能访问此页面。" 
                        className="mb-4"
                    />
                    <FluentButton 
                        onClick={() => navigate('/')}
                        className="bg-blue-600 text-white"
                    >
                        返回首页
                    </FluentButton>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-fluent-lg">
            {/* 部署状态为空闲时显示配置表单，否则只显示日志 */}
            {status === 'idle' ? (
                <Card title="配置新服务器实例">
                    <form onSubmit={handleDeploySubmit} className="space-y-6">
                        <FluentInput 
                            label="实例名称:"
                            name="name" 
                            id="name" 
                            value={formData.name || ''} 
                            onChange={handleChange} 
                            required 
                            disabled={isLoading}
                            placeholder="给你的服务器起个名字"
                        />
                        <FluentInput 
                            label="安装路径:"
                            name="installPath" 
                            id="installPath" 
                            value={formData.installPath || ''} 
                            onChange={handleChange} 
                            required 
                            disabled={isLoading}
                            placeholder="例如: C:\squad-servers\server1 或 /home/user/squad-servers/server1"
                        />
                        <FluentInput 
                            label="SteamCMD路径:"
                            name="steamCmdPath" 
                            id="steamCmdPath" 
                            value={formData.steamCmdPath || ''} 
                            onChange={handleChange} 
                            required
                            disabled={isLoading}
                            placeholder="例如: C:\steamcmd\steamcmd.exe 或 /usr/bin/steamcmd"
                        />
                         {/* Ports Grid */}
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <FluentInput 
                                label="游戏端口:"
                                type="number" 
                                name="gamePort" 
                                id="gamePort" 
                                value={formData.gamePort ?? ''} 
                                onChange={handleChange} 
                                required 
                                min="1"
                                disabled={isLoading}
                                className="!mb-0" // Override margin from grid gap
                            />
                             <FluentInput 
                                label="查询端口:"
                                type="number" 
                                name="queryPort" 
                                id="queryPort" 
                                value={formData.queryPort ?? ''} 
                                onChange={handleChange} 
                                required 
                                min="1"
                                disabled={isLoading}
                                className="!mb-0"
                            />
                             <FluentInput 
                                label="RCON 端口:"
                                type="number" 
                                name="rconPort" 
                                id="rconPort" 
                                value={formData.rconPort ?? ''} 
                                onChange={handleChange} 
                                required 
                                min="1"
                                disabled={isLoading}
                                className="!mb-0"
                            />
                             <FluentInput 
                                label="信标端口:"
                                type="number" 
                                name="beaconPort" 
                                id="beaconPort" 
                                value={formData.beaconPort ?? ''} 
                                onChange={handleChange} 
                                required 
                                min="1"
                                disabled={isLoading}
                                className="!mb-0"
                            />
                        </div>
                        <FluentInput 
                            label="RCON 密码:"
                            type="password" 
                            name="rconPassword" 
                            id="rconPassword" 
                            value={formData.rconPassword || ''} 
                            onChange={handleChange} 
                            required 
                            disabled={isLoading}
                            placeholder="设置 RCON 管理员密码"
                        />
                        <FluentInput 
                            label="额外启动参数 (可选):"
                            name="extraArgs" 
                            id="extraArgs" 
                            value={formData.extraArgs || ''} 
                            onChange={handleChange} 
                            disabled={isLoading}
                            placeholder="例如: -DisableVAC -Mods=..."
                        />

                        {/* Submit Button */}
                        <div className="flex justify-center">
                             <FluentButton 
                                type="submit" 
                                variant="primary"
                                disabled={isLoading}
                                className="!bg-blue-600 !text-white font-bold"
                            >
                                {isLoading ? '正在部署...' : '开始部署'}
                            </FluentButton>
                        </div>
                    </form>
                </Card>
            ) : (
                <Card title="服务器部署日志">
                    <div className="mb-4">
                        {status === 'success' && (
                            <AlertMessage 
                                type="success" 
                                title="部署成功" 
                                message="服务器部署成功完成。正在跳转到仪表板..." 
                            />
                        )}
                        {status === 'error' && (
                            <AlertMessage 
                                type="error" 
                                title="部署失败" 
                                message={errorMessage || '部署过程中发生未知错误。'} 
                            />
                        )}
                    </div>
                    <pre
                        ref={logContainerRef}
                        className="bg-gray-900 text-white font-mono text-xs p-4 rounded-md overflow-auto h-96 whitespace-pre-wrap border border-gray-700"
                    >
                        {outputLog.join('\n')}
                    </pre>
                    {(status === 'success' || status === 'error') && (
                        <div className="mt-4 flex justify-center">
                            <Link to="/">
                                <FluentButton variant="primary">返回仪表板</FluentButton>
                            </Link>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
}

export default DeployServerPage; 