import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { installServer } from '../services/api'; // We need to add this to api.ts
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import AlertMessage from '../components/ui/AlertMessage';
import FluentButton from '../components/ui/FluentButton';

function DeploymentPage() {
    const { hasPermission } = useAuth(); // 获取权限检查函数
    const navigate = useNavigate();
    const [installPath, setInstallPath] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleDeploy = async () => {
        if (!installPath) {
            setError('请输入有效的安装路径。');
            return;
        }

        setIsLoading(true);
        setMessage(null);
        setError(null);

        try {
            const response = await installServer(installPath); // Call the API
            setMessage(response.data.message); // Display success message from backend
            setInstallPath(''); // Clear path on success maybe?
        } catch (err: any) {
            console.error("部署请求失败:", err);
            setError(err.response?.data?.message || '部署请求失败，请检查路径或后端服务/日志。');
        } finally {
            setIsLoading(false);
        }
    };

    // 检查用户是否有部署权限
    if (!hasPermission('deployment:manage')) {
        return (
            <div>
                <h2>部署新的 Squad 服务器</h2>
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
        <div>
            <h2>部署新的 Squad 服务器</h2>
            <p>此功能将使用 SteamCMD 下载或更新 Squad 专用服务器文件到指定目录。</p>
            <p><strong>重要提示:</strong></p>
            <ul>
                <li>请确保运行此面板的用户具有对目标安装路径的写入权限。</li>
                <li>请确保服务器上已安装 SteamCMD，并且 `steamcmd` (Linux) 或 `steamcmd.exe` (Windows) 在系统的 PATH 环境变量中。</li>
                <li>部署过程可能需要较长时间，并且会消耗网络带宽和磁盘空间。</li>
                <li>当前版本不会实时显示进度，请在任务开始后关注后端控制台日志。</li>
            </ul>

            <div className="form-group" style={{marginBottom: '20px'}}>
                <label htmlFor="installPath" style={{display: 'block', marginBottom: '5px'}}>安装路径 (绝对路径):</label>
                <input
                    type="text"
                    id="installPath"
                    name="installPath"
                    value={installPath}
                    onChange={(e) => setInstallPath(e.target.value)}
                    placeholder="例如: C:\squad_server 或 /home/user/squad_server"
                    required
                    disabled={isLoading}
                    style={{width: '100%', maxWidth: '500px', padding: '8px', boxSizing: 'border-box'}}
                />
            </div>

            <button onClick={handleDeploy} disabled={isLoading || !installPath}>
                {isLoading ? '正在部署中...' : '开始部署 / 更新'}
            </button>

            {message && <p style={{color: 'green', marginTop: '15px'}}>{message}</p>}
            {error && <p className="error-message" style={{marginTop: '15px'}}>{error}</p>}

             <div style={{marginTop: '30px'}}>
                 <Link to="/"><button type="button" disabled={isLoading}>返回仪表盘</button></Link>
             </div>
        </div>
    );
}

export default DeploymentPage; 