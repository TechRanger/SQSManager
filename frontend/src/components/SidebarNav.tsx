import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LuLayoutDashboard, LuCloudCog, LuUsers, LuSettings, LuLogOut, LuGamepad2 } from "react-icons/lu";
import { useAuth } from '../context/AuthContext';

interface SidebarNavProps {
  user: any;
  onLogout: () => void;
}

const SidebarNav: React.FC<SidebarNavProps> = ({ user, onLogout }) => {
  const location = useLocation();
  const { hasPermission } = useAuth();

  const isActive = (path: string) => {
    if (location.pathname === '/') {
      if (path === '/dashboard' && hasPermission('server:control')) {
        return true;
      }
      if (path === '/game-sessions' && !hasPermission('server:control')) {
        return true;
      }
      return false;
    }
    return location.pathname === path;
  };

  // Define navigation items
  const navItems = [
    { path: "/dashboard", label: "仪表盘", icon: <LuLayoutDashboard />, requiredPermission: 'server:control' },
    { path: "/game-sessions", label: "对局管理", icon: <LuGamepad2 />, requiredPermission: 'game_session:view' },
    { path: "/users", label: "用户管理", icon: <LuUsers />, requiredPermission: ['user:view', 'user:create', 'user:delete', 'user:assign_role'] },
    { path: "/settings", label: "用户设置", icon: <LuSettings />, requiredPermission: null },
  ];

  return (
    <div className="h-full bg-neutral-background flex flex-col shadow-xl">
      <div className="p-6 border-b border-neutral-stroke bg-gradient-to-r from-gray-50 to-white">
        <div className="font-bold text-neutral-foreground" style={{ fontSize: '28px' }}>
          <div className="flex items-center">
            <span className="text-blue-600 mr-1">SQS</span>
            <span>Manager</span>
          </div>
          <div className="flex justify-start mt-1">
            <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-sm">
              Beta
            </span>
          </div>
        </div>
        <div style={{ 
          fontSize: '14px', 
          color: '#4a5568', 
          marginTop: '12px', 
          fontWeight: 500, 
          fontStyle: 'italic', 
          letterSpacing: '0.05em',
          fontFamily: 'Georgia, serif'
        }}>让天下没有难开的服</div>
      </div>
      
      <nav className="flex-grow p-4 space-y-1">
        {user && navItems.map(item => {
          const canView = item.requiredPermission ? hasPermission(item.requiredPermission) : true;
          if (!canView) return null;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-4 py-3 rounded-md transition-all duration-200 hover:bg-gray-100 group sidebar-nav-link ${
                isActive(item.path) 
                  ? 'bg-blue-50 text-blue-600 font-medium border-l-4 border-blue-600 pl-3 sidebar-nav-active' 
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              <span className={`text-xl mr-3 sidebar-nav-icon ${isActive(item.path) ? 'text-blue-600' : 'text-gray-500 group-hover:text-blue-500'}`}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              {isActive(item.path) && (
                <span className="ml-auto bg-blue-600 h-2 w-2 rounded-full"></span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-neutral-stroke mt-auto bg-gray-50">
        <div className="space-y-3">
          <div className="text-sm text-gray-600 p-2 bg-white rounded-md shadow-sm">
            <div className="font-medium text-gray-800 mb-1">{user?.username}</div>
            <div className="text-xs text-gray-500">角色: {user?.role || 'N/A'}</div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-2 p-2 rounded-md text-red-600 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 transition-colors duration-200 shadow-sm"
          >
            <LuLogOut />
            <span>登出</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SidebarNav; 