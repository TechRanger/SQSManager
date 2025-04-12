import React from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import ServerDetailsPage from './pages/ServerDetailsPage';
import LoginPage from './pages/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import UserSettingsPage from './pages/UserSettingsPage';
import UserManagementPage from './pages/UserManagementPage';
import DeployServerPage from './pages/DeployServerPage';
import NotFoundPage from './pages/NotFoundPage';
import './App.css';
import './index.css';
import SidebarNav from './components/SidebarNav';

function App() {
  const { isLoggedIn, user, logout } = useAuth();
  const location = useLocation();

  if (!isLoggedIn && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  if (isLoggedIn && location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex">
      {/* 固定宽度的侧边栏，固定在左侧 */}
      <div className="fixed left-0 top-0 h-screen w-64">
        <SidebarNav user={user} onLogout={logout} />
      </div>
      
      {/* 主内容区域，添加左边距以避开侧边栏 */}
      <main className="flex-1 ml-64">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/servers/:id" element={<ServerDetailsPage />} />
          <Route path="/deploy" element={<DeployServerPage />} />
          <Route path="/users" element={<UserManagementPage />} />
          <Route path="/settings" element={<UserSettingsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
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
