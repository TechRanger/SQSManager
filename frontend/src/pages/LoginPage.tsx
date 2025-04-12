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
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="bg-white p-8 rounded-2xl shadow-[0_10px_40px_-15px_rgba(0,0,0,0.15)] w-full max-w-md transition-all duration-300 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.2)]">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white mb-4 transform transition-transform duration-300 hover:scale-110">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
                            <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-bold text-gray-800 mb-1">SQSManager</h2>
                    <p className="text-gray-500 text-sm">请登录您的账户</p>
                </div>
                
                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 mb-6 text-sm animate-[pulse_1s_ease-in-out]">
                        {error}
                    </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="transition-all duration-200 hover:translate-y-[-2px]">
                        <FluentInput 
                            label="用户名"
                            id="username" 
                            type="text" 
                            value={username} 
                            onChange={(e) => setUsername(e.target.value)} 
                            required 
                            disabled={loading}
                            placeholder="输入您的用户名"
                            className="!mb-0 focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="transition-all duration-200 hover:translate-y-[-2px]">
                        <FluentInput 
                            label="密码"
                            id="password" 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                            disabled={loading}
                            placeholder="输入您的密码"
                            className="!mb-0 focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="pt-4">
                        <FluentButton 
                            type="submit" 
                            variant="primary" 
                            disabled={loading} 
                            className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl transition-all duration-300 hover:shadow-lg transform hover:translate-y-[-2px]"
                        >
                            {loading ? '登录中...' : '登录'}
                        </FluentButton>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default LoginPage; 