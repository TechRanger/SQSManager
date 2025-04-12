import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LuLayoutDashboard, LuCloudCog, LuUsers, LuSettings, LuLogOut } from "react-icons/lu";
import { useAuth } from '../context/AuthContext';

interface SidebarNavProps {
  user: any;
  onLogout: () => void;
}

const SidebarNav: React.FC<SidebarNavProps> = ({ user, onLogout }) => {
  const location = useLocation();
  const { hasPermission } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  // Define navigation items
  const navItems = [
    { path: "/", label: "仪表盘", icon: <LuLayoutDashboard />, requiredPermission: null },
    { path: "/deploy", label: "一键部署", icon: <LuCloudCog />, requiredPermission: 'deployment:manage' },
    { path: "/users", label: "用户管理", icon: <LuUsers />, requiredPermission: ['user:view', 'user:create', 'user:delete', 'user:assign_role'] },
    { path: "/settings", label: "用户设置", icon: <LuSettings />, requiredPermission: null },
  ];

  return (
    <div className="h-full bg-neutral-background flex flex-col shadow-fluent-md">
      <div className="p-fluent-lg border-b border-neutral-stroke">
        <h1 className="text-xl font-semibold text-neutral-foreground">SQSManager</h1>
      </div>
      
      <nav className="flex-grow p-fluent-md space-y-fluent-xs">
        {user && navItems.map(item => {
          const canView = item.requiredPermission ? hasPermission(user.permissions, item.requiredPermission) : true;
          if (!canView) return null;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-fluent-sm p-fluent-sm rounded-fluent-sm text-neutral-secondary hover:bg-brand-light hover:text-brand ${isActive(item.path) ? 'bg-brand-light text-brand font-semibold' : ''}`}
            >
              {item.icon && <span className="text-lg">{item.icon}</span>}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-fluent-lg border-t border-neutral-stroke mt-auto">
        <div className="space-y-fluent-sm">
          <div className="text-sm text-neutral-secondary">
            用户: {user?.username} (角色: {user?.role || 'N/A'})
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-fluent-sm p-fluent-sm rounded-fluent-sm text-danger bg-danger-background hover:bg-red-200 hover:text-danger-dark transition-colors duration-150"
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