import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import ServerDetailsPage from './pages/ServerDetailsPage';
import LoginPage from './pages/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import UserSettingsPage from './pages/UserSettingsPage';
import UserManagementPage from './pages/UserManagementPage';
import DeployServerPage from './pages/DeployServerPage';
import GameSessionManagementPage from './pages/GameSessionManagementPage';
import GameSessionDetailsPage from './pages/GameSessionDetailsPage';
import ServerUpdatePage from './pages/ServerUpdatePage';
import NotFoundPage from './pages/NotFoundPage';
import './App.css';
import './index.css';
import SidebarNav from './components/SidebarNav';
import ProtectedRoute from './components/ProtectedRoute';

// 新增：自动重定向组件
function HomeRedirect() {
  const { hasPermission } = useAuth();
  
  // 如果用户有 server:control 权限，重定向到仪表盘
  // 否则重定向到对局管理页面
  return hasPermission('server:control') 
    ? <Navigate to="/dashboard" replace /> 
    : <Navigate to="/game-sessions" replace />;
}

function App() {
  const { isLoggedIn, user, logout } = useAuth();
  const location = useLocation();

  // 未登录时重定向到登录页面
  if (!isLoggedIn && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  // 已登录时访问登录页面，重定向到主页
  if (isLoggedIn && location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  // 登录页面使用特殊布局（没有侧边栏）
  if (location.pathname === '/login') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </div>
    );
  }

  // 已登录状态的标准布局（带侧边栏）
  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* 固定宽度的侧边栏，固定在左侧 */}
      <div className="fixed left-0 top-0 h-screen w-64 z-10">
        <SidebarNav user={user} onLogout={logout} />
      </div>
      
      {/* 主内容区域，添加左边距以避开侧边栏，内容左对齐 */}
      <main className="flex-1 ml-64 min-h-screen">
        <div className="p-8 text-left w-full">
          <Routes>
            {/* 根路径使用自动重定向组件 */}
            <Route path="/" element={<HomeRedirect />} />
            {/* 仪表盘专用路由 */}
            <Route path="/dashboard" element={
              <ProtectedRoute requiredPermission="server:control">
                <DashboardPage />
              </ProtectedRoute>
            } />
            {/* 服务器详情 */}
            <Route path="/servers/:id" element={
              <ProtectedRoute requiredPermission="server:view_details">
                <ServerDetailsPage />
              </ProtectedRoute>
            } />
            {/* 新增：服务器更新页面 */}
            <Route path="/servers/:id/update" element={
              <ProtectedRoute requiredPermission="server:update">
                <ServerUpdatePage />
              </ProtectedRoute>
            } />
            {/* 部署页面 */}
            <Route path="/deploy" element={
              <ProtectedRoute requiredPermission="deployment:manage">
                <DeployServerPage />
              </ProtectedRoute>
            } />
            {/* 对局管理 */}
            <Route path="/game-sessions" element={
              <ProtectedRoute requiredPermission="game_session:view">
                <GameSessionManagementPage />
              </ProtectedRoute>
            } />
            {/* 对局详情 */}
            <Route path="/game-sessions/:id" element={
              <ProtectedRoute requiredPermission="game_session:view">
                <GameSessionDetailsPage />
              </ProtectedRoute>
            } />
            {/* 用户管理 */}
            <Route path="/users" element={
              <ProtectedRoute requiredPermission="user:manage">
                <UserManagementPage />
              </ProtectedRoute>
            } />
            {/* 用户设置 */}
            <Route path="/settings" element={<UserSettingsPage />} />
            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function AppWrapper() {
  return (
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  );
}

export default AppWrapper;
