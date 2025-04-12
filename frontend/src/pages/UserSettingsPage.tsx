import React, { useState } from 'react';
import { changePassword } from '../services/api';
import { useAuth } from '../context/AuthContext';
// Import shared UI components
import FluentInput from '../components/ui/FluentInput';
import FluentButton from '../components/ui/FluentButton';
import Card from '../components/ui/Card';
import AlertMessage from '../components/ui/AlertMessage'; // Import AlertMessage
import { LuSave } from 'react-icons/lu'; // Import icon

function UserSettingsPage() {
    const { user } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (newPassword !== confirmPassword) {
            setError('新密码和确认密码不匹配。');
            return;
        }
        if (newPassword.length < 6) {
             setError('新密码长度至少为 6 位。');
             return;
        }

        setIsLoading(true);
        try {
            const response = await changePassword({ currentPassword, newPassword });
            setSuccessMessage(response.message || '密码修改成功！');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            console.error("修改密码失败:", err);
            setError(err.response?.data?.message || '修改密码失败，请检查当前密码是否正确。');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-fluent-lg max-w-2xl"> {/* Removed mx-auto to align left */} 
            <Card title="修改密码">
                 <form onSubmit={handleSubmit} className="space-y-fluent-md">
                     {/* Use AlertMessage for error */} 
                     {error && (
                        <AlertMessage type="error" message={error} />
                     )}
                     {/* Use AlertMessage for success */} 
                     {successMessage && (
                         <AlertMessage type="success" message={successMessage} />
                     )}
                     
                     <FluentInput 
                        label="当前密码:" 
                        type="password" 
                        id="currentPassword" 
                        value={currentPassword} 
                        onChange={(e) => setCurrentPassword(e.target.value)} 
                        required 
                        disabled={isLoading}
                        autoComplete="current-password"
                        className="!mb-0 border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                    />
                    <FluentInput 
                        label="新密码:" 
                        type="password" 
                        id="newPassword" 
                        value={newPassword} 
                        onChange={(e) => setNewPassword(e.target.value)} 
                        required 
                        minLength={6}
                        disabled={isLoading}
                        autoComplete="new-password"
                        className="!mb-0 border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                    />
                    <FluentInput 
                        label="确认新密码:" 
                        type="password" 
                        id="confirmPassword" 
                        value={confirmPassword} 
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                        required 
                        minLength={6}
                        disabled={isLoading}
                        autoComplete="new-password"
                        className="!mb-0 border border-neutral-stroke rounded-fluent-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                    />
                    <div className="pt-fluent-md flex justify-center">
                        <FluentButton 
                            type="submit" 
                            variant="primary" 
                            disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
                            icon={<LuSave />} 
                            className="!bg-blue-600 !text-white font-bold shadow-none hover:shadow-md"
                        >
                            {isLoading ? '正在提交...' : '确认修改密码'}
                         </FluentButton>
                    </div>
                 </form>
            </Card>
        </div>
    );
}

// Remove old style objects
// const formStyle: React.CSSProperties = { ... };
// const formRowStyle: React.CSSProperties = { ... };

export default UserSettingsPage; 