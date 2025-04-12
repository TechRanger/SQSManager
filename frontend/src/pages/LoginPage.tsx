import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// Import the login API function
import { loginUser } from '../services/api'; 
import { useAuth } from '../context/AuthContext'; // Import useAuth
// Import shared UI components
import FluentInput from '../components/ui/FluentInput';
import FluentButton from '../components/ui/FluentButton';

function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { login } = useAuth(); // Get login function from context

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!username || !password) {
            setError('请输入用户名和密码。');
            return;
        }

        setLoading(true);
        try {
            // Placeholder for API call
            console.log('Attempting login with:', username, password);
            const response = await loginUser({ username, password }); // Call the actual API
            const token = response.data.access_token; // Get token from response
            
            // --- Simulate successful login for now ---
            // const token = 'fake-jwt-token-replace-later'; 
            // --- End Simulation ---

            if (!token) {
                throw new Error('登录响应中未找到 token。');
            }

            // Call the login function from AuthContext
            login(token);
            console.log('Login successful, called auth context login.');

            // Redirect to dashboard
            navigate('/'); 

        } catch (err: any) {
            console.error("登录失败:", err);
            setError(err.response?.data?.message || '登录失败，请检查用户名或密码。');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-background">
            <div className="bg-white p-fluent-xl rounded-fluent-lg shadow-fluent-md w-full max-w-md border border-neutral-stroke">
                <h2 className="text-2xl font-semibold text-neutral-foreground mb-fluent-xl text-center">SQSManager 登录</h2>
                {error && (
                    <div className="bg-danger-background text-danger p-fluent-md rounded-fluent-sm border border-red-300 mb-fluent-lg text-sm">
                        {error}
                    </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-fluent-lg">
                    <FluentInput 
                        label="用户名:"
                        id="username" 
                        type="text" 
                        value={username} 
                        onChange={(e) => setUsername(e.target.value)} 
                        required 
                        disabled={loading}
                        placeholder="输入您的用户名"
                        // Override default margin if needed from the form spacing
                        className="!mb-0"
                    />
                    <FluentInput 
                        label="密码:"
                        id="password" 
                        type="password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                        disabled={loading}
                        placeholder="输入您的密码"
                        className="!mb-0"
                    />
                    <FluentButton 
                        type="submit" 
                        variant="primary" 
                        disabled={loading} 
                        className="w-full"
                    >
                        {loading ? '登录中...' : '登录'}
                    </FluentButton>
                </form>
            </div>
        </div>
    );
}

export default LoginPage; 