import React, { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
    children: ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { isLoggedIn, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        // Show a loading indicator while checking auth status
        return <div>加载认证状态中...</div>; 
    }

    if (!isLoggedIn) {
        // Redirect them to the /login page, but save the current location they were
        // trying to go to in the state property. This allows us to send them
        // along to that page after they login, which is a nicer user experience
        // than dropping them off on the home page.
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>; // Render the children if logged in
};

export default ProtectedRoute; 