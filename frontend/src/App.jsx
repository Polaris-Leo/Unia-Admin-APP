import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DanmakuPage from './pages/DanmakuPage';
import BanLogPage from './pages/BanLogPage';
import ModsPage from './pages/ModsPage';
import HistoryPage from './pages/HistoryPage';
import OverlayPage from './pages/OverlayPage';
import NavBar from './components/NavBar';
import './App.css';

function RequireAuth({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        {/* 透明弹幕悬浮窗（Electron overlay 窗口专用路由） */}
        <Route path="/overlay"  element={<OverlayPage />} />
        <Route path="/*" element={
          <RequireAuth>
            <div className="app-layout">
              <NavBar />
              <div className="app-content">
                <Routes>
                  <Route path="/"          element={<DanmakuPage />} />
                  <Route path="/history"   element={<HistoryPage />} />
                  <Route path="/ban-logs"  element={<BanLogPage />} />
                  <Route path="/mods"      element={<ModsPage />} />
                  <Route path="*"          element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </div>
          </RequireAuth>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
