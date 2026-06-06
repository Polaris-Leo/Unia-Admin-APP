import { useState, useEffect, useRef } from 'react';
import UserActionPopup from '../components/UserActionPopup';
import './OverlayPage.css';

const MAX_MSGS = 500;
const GUARD_LABELS = { 1: '总督', 2: '提督', 3: '舰长' };
const GUARD_COLORS = { 1: '#f0a500', 2: '#9b59b6', 3: '#3498db' };

function renderEmotes(content, emots) {
  if (!content) return null;
  if (!emots || !Object.keys(emots).length) return content;
  const parts = content.split(/(\[+[^\]]+\]+)/);
  return parts.map((part, i) => {
    const emot = (part.startsWith('[') && part.endsWith(']')) ? emots[part] : null;
    if (emot?.url) {
      return <img key={i} src={emot.url} alt={part} title={part}
        className={Number(emot.height) <= 30 ? 'ov-emote' : 'ov-emote ov-emote-big'}
        referrerPolicy="no-referrer" />;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function OverlayPage() {
  const [msgs, setMsgs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [unread, setUnread] = useState(0);
  const [pinned, setPinned] = useState(true);
  const [locked, setLocked] = useState(false);
  const [bgOpacity, setBgOpacity] = useState(0.85);
  const [fontSize, setFontSize] = useState(14);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [selectedMsg, setSelectedMsg] = useState(null);

  const listRef    = useRef(null);
  const autoRef    = useRef(true);
  const prevLenRef = useRef(0);

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  useEffect(() => {
    document.documentElement.classList.add('unia-overlay-page');
    document.body.classList.add('unia-overlay-page');
    return () => {
      document.documentElement.classList.remove('unia-overlay-page');
      document.body.classList.remove('unia-overlay-page');
    };
  }, []);

  useEffect(() => {
    async function loadCfg() {
      if (!isElectron) return;
      const cfg = await window.electronAPI.loadConfig();
      applyConfig(cfg);
    }
    loadCfg();
    const off = window.electronAPI?.onConfigUpdated?.(applyConfig);
    return () => off?.();
  }, [isElectron]);

  function applyConfig(cfg = {}) {
    if (cfg.overlayOpacity != null) setBgOpacity(cfg.overlayOpacity);
    if (cfg.overlayPinned != null) setPinned(cfg.overlayPinned);
  }

  useEffect(() => {
    const off = window.electronAPI?.onOverlaySnapshot?.((data = {}) => {
      const next = Array.isArray(data.danmakuList) ? data.danmakuList.slice(-MAX_MSGS) : [];
      const oldLen = prevLenRef.current;
      prevLenRef.current = next.length;
      setMsgs(next);
      setConnected(!!data.connected);
      setRoomId(data.roomId || '');
      if (data.fontSize) setFontSize(data.fontSize);
      setHasSnapshot(true);

      if (!autoRef.current && next.length > oldLen) {
        setUnread(c => c + (next.length - oldLen));
      }
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--ov-bg-alpha', bgOpacity);
    document.documentElement.style.setProperty('--ov-font-size', `${fontSize}px`);
  }, [bgOpacity, fontSize]);

  useEffect(() => {
    if (autoRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [msgs]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    autoRef.current = atBottom;
    setIsAutoScroll(atBottom);
    if (atBottom) setUnread(0);
  }

  function scrollToBottom() {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    autoRef.current = true;
    setIsAutoScroll(true);
    setUnread(0);
  }

  function handleLock() {
    setLocked(prev => !prev);
  }

  function handlePin() {
    const next = !pinned;
    setPinned(next);
    window.electronAPI?.toggleOverlayPin(next);
    window.electronAPI?.loadConfig().then(cfg => {
      window.electronAPI.saveConfig({ ...cfg, overlayPinned: next });
    });
  }

  // 与 DanmakuPage 相同的定位逻辑
  function handleUserClick(e, user, msg) {
    if (!user) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    let x = rect.left;
    let y = rect.bottom + 6;
    if (x + 252 > window.innerWidth)  x = window.innerWidth - 262;
    if (y + 360 > window.innerHeight) y = Math.max(10, rect.top - 360);
    setPopupPos({ x, y });
    setSelectedUser(user);
    setSelectedMsg(msg);
  }

  const waiting = !hasSnapshot || msgs.length === 0;

  return (
    <div className={`ov-root${locked ? ' ov-locked' : ''}`}>
      <div className="ov-header drag">
        <div className="ov-header-left no-drag">
          <span className={`ov-dot ${connected ? 'connected' : 'disconnected'}`} />
          <span className="ov-title">弹幕监控</span>
          <span className="ov-count">{msgs.length} 条</span>
        </div>
        <div className="ov-header-right no-drag">
          {isElectron && (
            <button
              className={`ov-icon-btn ov-lock-btn ${locked ? 'active' : ''}`}
              title={locked ? '点击解锁（防误触已开启）' : '开启防误触锁定'}
              onClick={handleLock}
            >
              <svg className="ov-lock-svg" viewBox="0 0 1024 1024" aria-hidden="true">
                <path d="M742.4 409.6H716.8V332.8C716.8 205.7728 613.4272 102.4 486.4 102.4S256 205.7728 256 332.8V409.6h-25.6C188.0576 409.6 153.6 444.0576 153.6 486.4v409.6c0 42.3424 34.4576 76.8 76.8 76.8h512c42.3424 0 76.8-34.4576 76.8-76.8v-409.6c0-42.3424-34.4576-76.8-76.8-76.8zM307.2 332.8C307.2 233.984 387.584 153.6 486.4 153.6S665.6 233.984 665.6 332.8V409.6H307.2V332.8z m460.8 563.2a25.6 25.6 0 0 1-25.6 25.6h-512a25.6 25.6 0 0 1-25.6-25.6v-409.6a25.6 25.6 0 0 1 25.6-25.6h512a25.6 25.6 0 0 1 25.6 25.6v409.6z" />
              </svg>
            </button>
          )}
          {isElectron && (
            <button
              className={`ov-icon-btn ${pinned ? 'active' : ''}`}
              title="置顶"
              onClick={handlePin}
            >
              <svg className="ov-pin-svg" viewBox="0 0 1024 1024" aria-hidden="true">
                <path d="M498.279267 901.235543c-11.554302 0-21.664316-8.665726-21.664316-20.220028V324.964739c0-10.110014 7.221439-18.77574 15.887165-21.664316 8.665726-4.332863 20.220028-1.444288 25.997179 4.332863l262.860366 257.083216c7.221439 7.221439 8.665726 20.220028 0 27.441467-7.221439 7.221439-20.220028 7.221439-27.441466 0L519.943583 362.51622v519.943583c0 10.110014-10.110014 18.77574-21.664316 18.77574z" />
                <path d="M225.308886 580.603667c-5.777151 0-10.110014-1.444288-14.442878-5.777151-7.221439-7.221439-7.221439-20.220028 0-27.441467l173.314528-171.870239c7.221439-7.221439 20.220028-7.221439 27.441467 0s7.221439 20.220028 0 27.441466l-173.314528 171.87024c-2.888575 4.332863-8.665726 5.777151-12.998589 5.777151z" />
                <path d="M735.142454 245.528914h-476.61495c-11.554302 0-20.220028-10.110014-20.220029-21.664316s8.665726-21.664316 20.220029-21.664316h475.170662c11.554302 0 20.220028 10.110014 20.220029 21.664316s-8.665726 21.664316-18.775741 21.664316z" />
              </svg>
            </button>
          )}
          {isElectron && <>
            <button className="ov-win-btn" title="最小化" onClick={() => window.electronAPI.minimizeOverlay()}>─</button>
            <button className="ov-win-btn close" title="关闭" onClick={() => window.electronAPI.closeOverlay()}>✕</button>
          </>}
        </div>
      </div>

      <div className="ov-list-wrap">
        {waiting && (
          <div className="ov-empty">
            <div className="ov-empty-orb" />
            <div className="ov-empty-title">等待主界面弹幕同步</div>
            <div className="ov-empty-desc">请在主界面进入弹幕页并连接直播间</div>
          </div>
        )}
        <div className="ov-list" ref={listRef} onScroll={handleScroll}
          style={{ fontSize: 'var(--ov-font-size)' }}>
          {msgs.map(msg => {
            if (msg.type === 'divider') {
              return <div key={msg._id} className="ov-divider"><span>{msg.content}</span></div>;
            }
            return (
              <div key={msg._id} className="ov-row">
                {/* 左侧头像，占两行高度 */}
                <div className="ov-avatar-slot">
                  {msg.user?.face && (
                    <img src={msg.user.face} alt="" className="ov-avatar"
                      referrerPolicy="no-referrer"
                      onError={e => e.target.style.display = 'none'} />
                  )}
                </div>

                {/* 第一行：用户名 */}
                <div className="ov-row-meta">
                  <div className="ov-user no-drag" onClick={e => handleUserClick(e, msg.user, msg)}>
                    {msg.user?.guardLevel > 0 && (
                      <span className="ov-guard"
                        style={{ background: GUARD_COLORS[msg.user.guardLevel] }}>
                        {GUARD_LABELS[msg.user.guardLevel]}
                      </span>
                    )}
                    <span className="ov-username">{msg.user?.username}</span>
                  </div>
                </div>

                {/* 第二行：弹幕内容 */}
                <span className="ov-content">{renderEmotes(msg.content, msg.emots)}</span>
              </div>
            );
          })}
        </div>
        {!isAutoScroll && unread > 0 && (
          <button className="ov-new-msg" onClick={scrollToBottom}>
            ↓ {unread} 条新消息
          </button>
        )}
      </div>

      {selectedUser && (
        <UserActionPopup
          user={selectedUser}
          msg={selectedMsg}
          position={popupPos}
          roomId={roomId}
          onClose={() => setSelectedUser(null)}
          onBanSuccess={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}
