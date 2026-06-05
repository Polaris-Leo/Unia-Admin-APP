import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from './utils/theme.js';
import App from './App.jsx';

initTheme();

// Electron 每次启动可能使用不同本地端口，localStorage 会按端口隔离。
// 渲染前先从 Electron 配置恢复登录 token，避免每次启动都要求重新登录。
async function restoreElectronAuth() {
  if (!window.electronAPI) return;
  try {
    const cfg = await window.electronAPI.loadConfig();
    // 远程模式下先恢复 backendUrl，确保 API 请求打到正确服务器
    if (cfg.backendUrl) {
      localStorage.setItem('backendUrl', cfg.backendUrl);
    } else {
      localStorage.removeItem('backendUrl');
    }
    if (cfg.authToken && !localStorage.getItem('token')) {
      localStorage.setItem('token', cfg.authToken);
    }
  } catch {}
}

restoreElectronAuth().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
