import axios from 'axios';

// 在 Electron 远程模式下，backendUrl 通过 URL 参数传入并存入 localStorage
// 本地模式必须清掉旧的 backendUrl，避免从远程模式切回本地后 API/WS 仍然打到旧服务器。
function initBackendUrl() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const url = params.get('backendUrl');
  if (url) {
    const clean = url.replace(/\/$/, '');
    localStorage.setItem('backendUrl', clean);
    // 持久化到 Electron 配置，确保整页刷新后仍能恢复
    if (window.electronAPI) {
      window.electronAPI.loadConfig()
        .then(cfg => window.electronAPI.saveConfig({ ...cfg, backendUrl: clean }))
        .catch(() => {});
    }
  } else if (window.electronAPI && mode === 'local') {
    localStorage.removeItem('backendUrl');
    window.electronAPI.loadConfig()
      .then(cfg => window.electronAPI.saveConfig({ ...cfg, backendUrl: null }))
      .catch(() => {});
  }
}
initBackendUrl();

function getBaseURL() {
  // Electron 环境且配置了远程地址时，使用绝对 URL
  if (typeof window !== 'undefined' && window.electronAPI) {
    const backendUrl = localStorage.getItem('backendUrl');
    if (backendUrl) return backendUrl.replace(/\/$/, '') + '/api';
  }
  return '/api';
}

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  config.baseURL = getBaseURL();
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.electronAPI) {
        window.electronAPI.loadConfig()
          .then(cfg => window.electronAPI.saveConfig({ ...cfg, authToken: null }))
          .catch(() => {});
      }
      // 用 hash 跳转而非整页刷新，避免 URL query params 丢失导致 backendUrl 无法从 URL 恢复
      if (window.location.pathname !== '/login') {
        window.location.replace('/login');
      }
    }
    return Promise.reject(err);
  }
);

export default api;

export const login = (username, password) =>
  api.post('/auth/login', { username, password });

export const register = (token, username, password) =>
  api.post('/auth/register', { token, username, password });

export const getMe = () => api.get('/auth/me');
export const updateMyProfile = (data) => api.patch('/auth/me', data);
export const createInvite = (expiresHours) => api.post('/auth/invite', { expiresHours });

export const startDanmaku = () => api.post('/danmaku/start', {});
export const stopDanmaku  = () => api.post('/danmaku/stop');
export const getDanmakuRecent   = () => api.get('/danmaku/recent');
export const getDanmakuSession  = (offset = 0, limit = 300) =>
  api.get('/danmaku/session', { params: { offset, limit } });

export const silentUser   = (data) => api.post('/ban/silent', data);
export const unsilentUser = (data) => api.post('/ban/unsilent', data);
export const getBanList   = (roomId, page = 1) => api.get('/ban/list', { params: { roomId, page } });
export const getBanLogs   = (params) => api.get('/ban/logs', { params });

export const getHistorySessions = (roomId) => api.get(`/history/${roomId}/sessions`);
export const getHistoryData     = (roomId, sessionId) => api.get(`/history/${roomId}/${sessionId}`);
export const searchHistory      = (params) => api.get('/history/search', { params });

export const getUserTags  = (uid) => api.get(`/tags/${uid}`);
export const addUserTag   = (uid, data) => api.post(`/tags/${uid}`, data);
export const deleteUserTag = (tagId) => api.delete(`/tags/${tagId}`);

export const getMods          = () => api.get('/mods');
export const createMod        = (data) => api.post('/mods', data);
export const updateModRole    = (modId, role) => api.patch(`/mods/${modId}/role`, { role });
export const updateModProfile = (modId, data) => api.patch(`/mods/${modId}/profile`, data);
export const disableMod       = (modId) => api.patch(`/mods/${modId}/disable`);
export const enableMod        = (modId) => api.patch(`/mods/${modId}/enable`);
export const deleteMod        = (modId) => api.delete(`/mods/${modId}`);
export const getInvites       = () => api.get('/mods/invites');
export const deleteInvite     = (id) => api.delete(`/mods/invites/${id}`);

export const getCookieStatus       = () => api.get('/cookie-status');
export const getBilibiliQRCode     = () => api.get('/bilibili/qrcode');
export const pollBilibiliQRCode    = (qrcode_key) =>
  api.get('/bilibili/qrcode/poll', { params: { qrcode_key } });
export const getBilibiliAuthStatus = () => api.get('/bilibili/auth-status');
export const bilibiliLogout        = () => api.post('/bilibili/logout');
