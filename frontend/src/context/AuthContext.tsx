import React, { createContext, useState, useContext, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode'; // Use jwt-decode library
import api from '../services/api'; // Import axios instance

// Interface for JWT payload (basic info)
interface AuthTokenPayload {
    username: string;
    sub: number; // User ID
    // role is no longer directly stored here, fetched via profile
    // role: string; 
    iat: number;
    exp: number;
}

// Interface for the detailed user profile from API
interface UserProfile {
    id: number;
    username: string;
    role: string | null;
    permissions: string[];
}

interface AuthContextType {
    token: string | null;
    user: UserProfile | null; // Store the full profile now
    // permissions: string[] | null; // Permissions are part of user profile
    isLoggedIn: boolean;
    isLoading: boolean;
    login: (token: string) => void;
    logout: () => void;
    hasPermission: (permissions: string | string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('authToken'));
    // State now holds the full UserProfile or null
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    // Decode token just to check validity and expiration
    const isTokenValid = useCallback((tokenToCheck: string | null): boolean => {
        if (!tokenToCheck) return false;
        try {
            const decoded = jwtDecode<AuthTokenPayload>(tokenToCheck);
            return decoded.exp * 1000 >= Date.now();
        } catch (error) {
            console.error("Token validation error:", error);
            return false;
        }
    }, []);

    // Fetch user profile when token changes and is valid
    useEffect(() => {
        const fetchUserProfile = async () => {
            setIsLoading(true);
            try {
                console.log("AuthContext: Fetching user profile...");
                const response = await api.get<UserProfile>('/users/profile');
                console.log("AuthContext: User profile received:", response.data);
                setUser(response.data); // Store the full profile including permissions
            } catch (error) {
                console.error("AuthContext: Failed to fetch user profile:", error);
                // If profile fetch fails (e.g., 401, 403), treat as logged out
                setUser(null);
                setToken(null); // Clear the invalid token
                localStorage.removeItem('authToken');
            } finally {
                setIsLoading(false);
            }
        };

        const currentToken = localStorage.getItem('authToken'); // Re-check storage
        if (isTokenValid(currentToken)) {
            // Ensure the token state matches storage if it was valid
            if (token !== currentToken) {
                setToken(currentToken);
            }
            fetchUserProfile(); // Call without the token argument
        } else {
            // Invalid or missing token
            setUser(null);
            if (token) {
                setToken(null); // Clear invalid token state
                localStorage.removeItem('authToken');
            }
            setIsLoading(false);
        }
    // Depend on token state and isTokenValid function reference
    }, [token, isTokenValid]);

    // Define logout first as login depends on it
    const logout = useCallback(() => {
        localStorage.removeItem('authToken');
        setToken(null);
        setUser(null);
        console.log("User logged out.");
    }, []);

    const login = useCallback((newToken: string) => {
        if (isTokenValid(newToken)) {
            localStorage.setItem('authToken', newToken);
            setToken(newToken); // Trigger useEffect to fetch profile
        } else {
            console.error("Attempted to login with an invalid token.");
            // Handle invalid token case (e.g., show error message)
            logout(); // Ensure clean state
        }
    // Keep logout in dependency array now that it's defined before login
    }, [isTokenValid, logout]);

    // Add hasPermission function
    const hasPermission = useCallback((permissions: string | string[]): boolean => {
        if (!user?.permissions) return false;
        
        // 检查是否有user:manage权限(包含所有user:*权限)
        const hasUserManage = user.permissions.includes('user:manage');
        
        if (typeof permissions === 'string') {
            // 如果请求的是user:开头的权限且用户有user:manage权限,直接返回true
            if (hasUserManage && permissions.startsWith('user:')) {
                return true;
            }
            return user.permissions.includes(permissions);
        }
        
        return permissions.every(permission => {
            // 如果请求的是user:开头的权限且用户有user:manage权限,直接返回true
            if (hasUserManage && permission.startsWith('user:')) {
                return true;
            }
            return user.permissions.includes(permission);
        });
    }, [user]);

    // Use useMemo to prevent unnecessary re-renders
    const value = useMemo(() => ({
        token,
        user,
        isLoggedIn: !!user,
        isLoading,
        login,
        logout,
        hasPermission,
    }), [token, user, isLoading, login, logout, hasPermission]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}; 