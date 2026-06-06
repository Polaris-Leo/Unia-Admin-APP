import { useState, useEffect, useRef } from 'react';
import { getBilibiliQRCode, pollBilibiliQRCode, bilibiliLogout } from '../services/api';
import './BilibiliLoginModal.css';

const QR_STATUS = {
  86101: { text: '请使用 B 站 APP 扫码', type: 'wait' },
  86090: { text: '已扫码，请在手机上确认', type: 'scanned' },
  86038: { text: '二维码已过期，请刷新', type: 'expired' },
  0:     { text: '登录成功！', type: 'success' },
};

export default function BilibiliLoginModal({ cookieStatus, onClose, onLoginSuccess }) {
  const isLocalAuthed = cookieStatus?.local?.authenticated;
  const localUid = cookieStatus?.local?.uid;

  const [qrData, setQrData] = useState(null);
  const [statusCode, setStatusCode] = useState(86101);
  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  // 已登录时是否强制展示扫码区（用于切换账号）
  const [showQR, setShowQR] = useState(!isLocalAuthed);
  const pollRef = useRef(null);

  const fetchQRCode = async () => {
    setLoading(true);
    clearInterval(pollRef.current);
    try {
      const res = await getBilibiliQRCode();
      setQrData(res.data.data);
      setStatusCode(86101);
      startPolling(res.data.data.qrcode_key);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (key) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await pollBilibiliQRCode(key);
        const code = res.data.data?.code;
        setStatusCode(code);
        if (code === 0) {
          clearInterval(pollRef.current);
          setTimeout(() => { onLoginSuccess?.(); onClose(); }, 1200);
        }
        if (code === 86038) clearInterval(pollRef.current);
      } catch {}
    }, 2000);
  };

  // 仅在未登录或用户主动展开扫码区时才生成二维码
  useEffect(() => {
    if (showQR) fetchQRCode();
    return () => clearInterval(pollRef.current);
  }, [showQR]);

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await bilibiliLogout();
      onLoginSuccess?.();
    } catch {}
    setLogoutLoading(false);
  };

  const handleShowQR = () => {
    setQrData(null);
    setStatusCode(86101);
    setShowQR(true);
  };

  const status = QR_STATUS[statusCode] || { text: `状态: ${statusCode}`, type: 'wait' };

  return (
    <div className="blmodal-overlay" onClick={onClose}>
      <div className="blmodal" onClick={e => e.stopPropagation()}>
        <div className="blmodal-header">
          <span className="blmodal-title">B 站账号登录</span>
          <button className="blmodal-close" onClick={onClose}>×</button>
        </div>

        {/* Cookie 来源状态 */}
        <div className="blmodal-sources">
          <div className={`blmodal-source ${cookieStatus?.remote?.connected ? 'active' : 'inactive'}`}>
            <span className="blmodal-source-dot" />
            <span className="blmodal-source-label">BiliCookie 服务</span>
            {cookieStatus?.remote?.connected
              ? <span className="blmodal-source-val">UID: {cookieStatus.remote.uid}</span>
              : <span className="blmodal-source-val">{cookieStatus?.remote?.configured ? '无法连接' : '未配置'}</span>
            }
          </div>
          {cookieStatus?.remote?.configured && !cookieStatus?.remote?.configuredUid && (
            <div className="blmodal-warn">
              ⚠️ 未配置 BILI_COOKIE_UID，禁言操作可能无权限
            </div>
          )}
          <div className={`blmodal-source ${isLocalAuthed ? 'active' : 'inactive'}`}>
            <span className="blmodal-source-dot" />
            <span className="blmodal-source-label">本地扫码</span>
            {isLocalAuthed
              ? <span className="blmodal-source-val">UID: {localUid || '已登录'}</span>
              : <span className="blmodal-source-val">未登录</span>
            }
          </div>
        </div>

        <div className="blmodal-divider" />

        {/* 已登录且未主动展开扫码：展示已登录状态 */}
        {isLocalAuthed && !showQR ? (
          <div className="blmodal-authed-section">
            <div className="blmodal-authed-info">
              <span className="blmodal-authed-icon">✓</span>
              <div>
                <div className="blmodal-authed-title">本地账号已登录</div>
                {localUid && <div className="blmodal-authed-uid">UID: {localUid}</div>}
              </div>
            </div>
            <div className="blmodal-authed-actions">
              <button className="blmodal-logout-btn" onClick={handleLogout} disabled={logoutLoading}>
                {logoutLoading ? '退出中...' : '退出登录'}
              </button>
              <button className="blmodal-relogin-btn" onClick={handleShowQR}>
                切换账号
              </button>
            </div>
          </div>
        ) : (
          /* 扫码区 */
          <div className="blmodal-qr-section">
            <p className="blmodal-qr-tip">使用 B 站 APP 扫码登录（兜底 Cookie，优先级低于 BiliCookie 服务）</p>
            <div className="blmodal-qr-wrap">
              {loading && <div className="blmodal-qr-placeholder">生成中...</div>}
              {!loading && qrData?.qrcode_image && (
                <img
                  src={qrData.qrcode_image}
                  alt="B站扫码登录"
                  className={`blmodal-qr-img ${status.type === 'expired' ? 'expired' : ''}`}
                />
              )}
              {status.type === 'expired' && (
                <div className="blmodal-qr-expired-mask">
                  <button className="blmodal-refresh-btn" onClick={fetchQRCode}>点击刷新</button>
                </div>
              )}
            </div>
            <div className={`blmodal-qr-status ${status.type}`}>{status.text}</div>
            {status.type !== 'expired' && (
              <button className="blmodal-refresh-link" onClick={fetchQRCode} disabled={loading}>
                刷新二维码
              </button>
            )}
            {isLocalAuthed && (
              <button className="blmodal-refresh-link" onClick={() => setShowQR(false)} style={{ marginTop: 2 }}>
                返回已登录状态
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
