import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';
import './AuthPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isElectron = !!window.electronAPI;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(form.username, form.password);
      localStorage.setItem('token', res.data.token);
      if (window.electronAPI) {
        const cfg = await window.electronAPI.loadConfig();
        await window.electronAPI.saveConfig({ ...cfg, authToken: res.data.token });
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Unia Admin</h1>
        <p className="auth-subtitle">直播房管工具</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label>用户名</label>
            <input
              type="text"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              autoFocus
              required
            />
          </div>
          <div className="auth-field">
            <label>密码</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
        {isElectron && (
          <div className="auth-mode-switch-wrap">
            <button
              className="auth-mode-switch"
              onClick={() => window.electronAPI.resetMode()}
            >
              更改服务器地址
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
