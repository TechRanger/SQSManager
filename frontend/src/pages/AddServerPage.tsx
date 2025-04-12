import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom'; // Import Link
import { createServerInstance, readRconConfig } from '../services/api'; // Import readRconConfig
// import './AddServerPage.css'; // Use App.css or index.css for general styles

interface FormData {
    name: string;
    installPath: string;
    gamePort: number | ''; // Allow empty string for initial state
    queryPort: number | '';
    rconPort?: number | ''; // Make optional, will be auto-fetched
    beaconPort?: number | '';
    rconPassword?: string; 
    extraArgs: string;
}

// Debounce function
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise((resolve) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        timeoutId = null;
        resolve(func(...args));
      }, waitFor);
    });
}

function AddServerPage() {
    const [formData, setFormData] = useState<FormData>({
        name: '',
        installPath: '',
        gamePort: 7787,
        queryPort: 27165,
        rconPort: '', // Initialize as empty
        beaconPort: 15000,
        rconPassword: '', 
        extraArgs: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rconFetchStatus, setRconFetchStatus] = useState<'idle' | 'fetching' | 'success' | 'error'>('idle');
    const [rconFetchError, setRconFetchError] = useState<string | null>(null);
    const navigate = useNavigate();

    // --- Fetch RCON Config Logic ---
    const fetchRconConfigCallback = useCallback(async (path: string) => {
        if (!path || path.length < 3) {
             setRconFetchStatus('idle');
             // Clear both password and port if path is invalid
             setFormData(prev => ({ ...prev, rconPassword: '', rconPort: '' })); 
            return;
        }
        setRconFetchStatus('fetching');
        setRconFetchError(null);
        try {
            const response = await readRconConfig(path);
            const { password, port } = response.data;
            
            let fetchError = false;
            let errorMsg = '';

            if (password !== undefined && password !== '') {
                setFormData(prev => ({ ...prev, rconPassword: password }));
            } else {
                errorMsg += '未能从 Rcon.cfg 文件中找到有效的密码。 ';
                 fetchError = true;
                 setFormData(prev => ({ ...prev, rconPassword: '' })); // Clear on error
            }

            if (port !== undefined && port > 0) {
                setFormData(prev => ({ ...prev, rconPort: port }));
             } else {
                 errorMsg += '未能从 Rcon.cfg 文件中找到有效的端口号。 ';
                 fetchError = true;
                 setFormData(prev => ({ ...prev, rconPort: '' })); // Clear on error
             }

            if (fetchError) {
                 setRconFetchError(errorMsg.trim());
                 setRconFetchStatus('error');
            } else {
                setRconFetchStatus('success');
            }

        } catch (err: any) {
             console.error("读取 RCON 配置失败:", err);
             setRconFetchError(err.response?.data?.message || '读取 Rcon.cfg 文件失败。');
             setRconFetchStatus('error');
             // Clear both on API error
             setFormData(prev => ({ ...prev, rconPassword: '', rconPort: '' })); 
        }
    }, []);

    // Debounced version of the fetch function
    const debouncedFetchRconConfig = useCallback(debounce(fetchRconConfigCallback, 1000), [fetchRconConfigCallback]);

    // Effect to trigger fetch when installPath changes
    useEffect(() => {
        debouncedFetchRconConfig(formData.installPath);
    }, [formData.installPath, debouncedFetchRconConfig]);
    // --- End Fetch RCON Config Logic ---

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            // Exclude rconPort from manual number conversion as it's auto-fetched
            [name]: (name === 'gamePort' || name === 'queryPort' || name === 'beaconPort') 
                      ? (value === '' ? '' : parseInt(value, 10) || 0)
                      : value,
        }));
         if (name === 'installPath') {
             setRconFetchStatus('idle');
             setRconFetchError(null);
         }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Basic client-side validation
        if (!formData.name || !formData.installPath) {
            setError("名称和安装路径不能为空。");
            return;
        }
        // Check if RCON config was successfully fetched
        if (rconFetchStatus !== 'success') {
             setError("无法获取 RCON 配置 (密码和端口)。请检查安装路径或 Rcon.cfg 文件。");
            return; 
        }
        // Check if fetched values are valid before submitting
        if (!formData.rconPassword || !formData.rconPort || Number(formData.rconPort) <= 0) {
             setError("获取到的 RCON 密码或端口无效。");
            return;
        }
        
        // Validate other ports individually
        if (formData.gamePort === '' || Number(formData.gamePort) <= 0) {
            setError("游戏端口必须是有效的正整数。");
            return;
        }
        if (formData.queryPort === '' || Number(formData.queryPort) <= 0) {
            setError("查询端口必须是有效的正整数。");
            return;
        }
        // Validate beaconPort: must be a positive number if provided (allow empty or default)
        if (formData.beaconPort !== '' && Number(formData.beaconPort) <= 0) {
            setError("信标端口（如果填写）必须是有效的正整数。");
            return;
        }

        setLoading(true);

        try {
            // Prepare data for API, ensure ports are numbers
            const dataToSend = {
                ...formData,
                gamePort: Number(formData.gamePort),
                queryPort: Number(formData.queryPort),
                rconPort: Number(formData.rconPort),
                // Only send beaconPort if it's not the default 15000 or empty
                beaconPort: formData.beaconPort !== '' && Number(formData.beaconPort) !== 15000 ? Number(formData.beaconPort) : undefined,
                extraArgs: formData.extraArgs.trim() || undefined, // Send undefined if empty
            };

            await createServerInstance(dataToSend);
            navigate('/'); // Navigate back to dashboard on success
        } catch (err: any) {
            console.error("添加服务器失败:", err);
            setError(err.response?.data?.message || '添加服务器失败，请检查输入或后端服务。');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h2>添加新 Squad 服务器实例</h2>
            {error && <p className="error-message">{error}</p>}
            <form onSubmit={handleSubmit} className="add-server-form" style={{maxWidth: '600px'}}>
                <div className="form-group" style={{marginBottom: '15px'}}>
                    <label htmlFor="name" style={{display: 'block', marginBottom: '5px'}}>名称 <span style={{color: 'red'}}>*</span>:</label>
                    <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} required style={{width: '100%', padding: '8px', boxSizing: 'border-box'}}/>
                    <span style={{fontSize: '0.85em', color: '#777'}}>给这个服务器实例起一个易于识别的名字。</span>
                </div>
                <div className="form-group" style={{marginBottom: '15px'}}>
                    <label htmlFor="installPath" style={{display: 'block', marginBottom: '5px'}}>安装路径 <span style={{color: 'red'}}>*</span>:</label>
                    <input type="text" id="installPath" name="installPath" value={formData.installPath} onChange={handleChange} required style={{width: '100%', padding: '8px', boxSizing: 'border-box'}}/>
                    <span style={{fontSize: '0.85em', color: '#777'}}>Squad 服务器文件的根目录 (例如 C:\squad_server 或 /home/user/squad_server)。</span>
                    {/* RCON Fetch Status Indicator */}
                    <div style={{marginTop: '5px', fontSize: '0.85em'}}>
                         {rconFetchStatus === 'fetching' && <span style={{color: 'blue'}}>正在读取 RCON 配置...</span>}
                         {rconFetchStatus === 'success' && <span style={{color: 'green'}}>已成功读取 RCON 配置 (密码和端口)。</span>}
                         {rconFetchStatus === 'error' && <span style={{color: 'red'}}>读取 RCON 配置失败: {rconFetchError}</span>}
                    </div>
                </div>
                <div className="form-group" style={{marginBottom: '15px'}}>
                    <label htmlFor="gamePort" style={{display: 'block', marginBottom: '5px'}}>游戏端口:</label>
                    <input type="number" id="gamePort" name="gamePort" value={formData.gamePort} onChange={handleChange} placeholder="7787" required min="1" style={{width: '100%', padding: '8px', boxSizing: 'border-box'}}/>
                    <span style={{fontSize: '0.85em', color: '#777'}}>(默认: 7787)</span>
                </div>
                <div className="form-group" style={{marginBottom: '15px'}}>
                    <label htmlFor="queryPort" style={{display: 'block', marginBottom: '5px'}}>查询端口:</label>
                    <input type="number" id="queryPort" name="queryPort" value={formData.queryPort} onChange={handleChange} placeholder="27165" required min="1" style={{width: '100%', padding: '8px', boxSizing: 'border-box'}}/>
                    <span style={{fontSize: '0.85em', color: '#777'}}>(默认: 27165)</span>
                </div>
                <div className="form-group" style={{marginBottom: '15px'}}>
                    <label htmlFor="beaconPort" style={{display: 'block', marginBottom: '5px'}}>信标端口 (Beacon Port):</label>
                    <input type="number" id="beaconPort" name="beaconPort" value={formData.beaconPort} onChange={handleChange} placeholder="15000" required min="1" style={{width: '100%', padding: '8px', boxSizing: 'border-box'}}/>
                    <span style={{fontSize: '0.85em', color: '#777'}}>(默认: 15000) 用于服务器浏览器发现，通常不需要修改。</span>
                </div>
                <div className="form-group" style={{marginBottom: '15px'}}>
                    <label htmlFor="extraArgs" style={{display: 'block', marginBottom: '5px'}}>额外启动参数 (可选):</label>
                    <textarea id="extraArgs" name="extraArgs" value={formData.extraArgs} onChange={handleChange} placeholder="例如: FIXEDMAXPLAYERS=100 RANDOM=NONE" style={{width: '100%', padding: '8px', minHeight: '60px', boxSizing: 'border-box'}}/>
                    <span style={{fontSize: '0.85em', color: '#777'}}>每个参数用空格分隔。</span>
                </div>
                <button type="submit" disabled={loading}>
                    {loading ? '正在添加...' : '确认添加'}
                </button>
                 <Link to="/"><button type="button" style={{marginLeft: '10px', backgroundColor: '#7f8c8d'}} disabled={loading}>取消</button></Link>
            </form>
        </div>
    );
}


export default AddServerPage; 