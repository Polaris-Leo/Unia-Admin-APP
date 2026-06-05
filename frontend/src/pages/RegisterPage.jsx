import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { register } from '../services/api';
import './AuthPage.css';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [form, setForm] = useState({ username: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) setError('邀请链接无效或已过期');
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('两次密码不一致'); return; }
    if (form.password.length < 6) { setError('密码至少 6 位'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await register(token, form.username, form.password);
      localStorage.setItem('token', res.data.token);
      if (window.electronAPI) {
        const cfg = await window.electronAPI.loadConfig();
        await window.electronAPI.saveConfig({ ...cfg, authToken: res.data.token });
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">注册房管账户</h1>
        <p className="auth-subtitle">通过邀请链接完成注册</p>
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
          <div className="auth-field">
            <label>确认密码</label>
            <input
              type="password"
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              required
            />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-btn" disabled={loading || !token}>
            {loading ? '注册中...' : '完成注册'}
          </button>
        </form>
      </div>
    </div>
  );
}
