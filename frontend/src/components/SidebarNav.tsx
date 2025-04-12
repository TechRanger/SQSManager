import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LuLayoutDashboard, LuUsers, LuSettings, LuLogOut, LuGamepad2 } from "react-icons/lu";
import { useAuth } from '../context/AuthContext';

interface SidebarNavProps {
  user: any;
  onLogout: () => void;
}

const SidebarNav: React.FC<SidebarNavProps> = ({ user, onLogout }) => {
  const location = useLocation();
  const { hasPermission } = useAuth();

  const isActive = (path: string) => {
    // Simplified isActive logic for clarity
    return location.pathname === path || (location.pathname === '/' && path === '/dashboard'); // Adjust default as needed
  };

  // Define navigation items
  const navItems = [
    { path: "/dashboard", label: "仪表盘", icon: <LuLayoutDashboard /> },
    { path: "/game-sessions", label: "对局管理", icon: <LuGamepad2 />, requiredPermission: 'game_session:view' },
    { path: "/users", label: "用户管理", icon: <LuUsers />, requiredPermission: 'user:manage' },
    { path: "/settings", label: "用户设置", icon: <LuSettings />, requiredPermission: null },
  ];

  return (
    <div className="h-full bg-gray-50 flex flex-col shadow-lg border-r border-gray-200">
      {/* Logo Section */}
      <div className="p-6 border-b border-gray-200">
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
          fontSize: '15px',
          color: '#6b7280',
          marginTop: '12px',
          fontWeight: 600,
          letterSpacing: '0.05em',
        }}>让天下没有难开的服</div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-grow p-4 space-y-2">
        {user && navItems.map(item => {
          let canView = true; // Default to true

          if (item.path === '/dashboard') {
            // Custom check for Dashboard: requires view_details AND view_all
            canView = hasPermission('server:view_details') && hasPermission('server:view_all');
          } else if (item.requiredPermission) {
            // Standard check for other items
            canView = hasPermission(item.requiredPermission);
          }

          if (!canView) {
             return null; // Hide if permission check fails
           }
           
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-4 py-3 rounded-md transition-all duration-150 group ${
                active
                  ? 'bg-blue-600 text-white shadow-sm' // Active state like primary button
                  : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900' // Inactive and hover state
              }`}
            >
              <span className={`text-xl mr-3 ${active ? 'text-white' : 'text-gray-500 group-hover:text-gray-700'}`}>
                {item.icon}
              </span>
              <span className={`${active ? 'font-medium text-white' : ''}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-gray-200 mt-auto">
        <div className="space-y-3">
          <div className="text-sm text-gray-700 p-3 bg-white rounded-md border border-gray-200">
            <div className="font-medium text-gray-900 mb-1">{user?.username}</div>
            <div className="text-xs text-gray-500">角色: {user?.role || 'N/A'}</div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-2 p-2 rounded-md text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 hover:border-red-300 transition-colors duration-150 shadow-sm font-medium"
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