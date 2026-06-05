import { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { useNavigate } from 'react-router-dom';
import { startDanmaku, stopDanmaku, getDanmakuSession, silentUser } from '../services/api';
import api from '../services/api';
import UserActionPopup from '../components/UserActionPopup';
import CustomSelect from '../components/CustomSelect';
import { isSmallEmote } from '../utils/emoteUtils';
import { formatTime } from '../utils/timeUtils';
import './DanmakuPage.css';

let globalIdCounter = 0;
const genId = () => `m-${Date.now()}-${globalIdCounter++}`;

const PAGE = 100;    // 每次加载的弹幕条数
const MAX_LIVE = 3000; // 直播新消息保留上限

const GUARD_LABELS = { 1: '总督', 2: '提督', 3: '舰长' };
const GUARD_COLORS = { 1: '#f0a500', 2: '#9b59b6', 3: '#3498db' };

const GUARD_ICONS = {
  1: 'https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/governor-DpDXKEdA.png',
  2: 'https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/supervisor-u43ElIjU.png',
  3: 'https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/captain-Bjw5Byb5.png',
};

function getSCColor(price) {
  if (price >= 2000) return { bg: '#B01E34', bodyBg: '#FFD4D7', text: '#fff' };
  if (price >= 1000) return { bg: '#E54D4D', bodyBg: '#FFD9D9', text: '#fff' };
  if (price >= 500)  return { bg: '#E09443', bodyBg: '#FFEBD6', text: '#fff' };
  if (price >= 100)  return { bg: '#E2B52B', bodyBg: '#FFF7E3', text: '#333' };
  if (price >= 50)   return { bg: '#427D9E', bodyBg: '#ECF6F9', text: '#fff' };
  return               { bg: '#2A60B2', bodyBg: '#EDF5FF', text: '#fff' };
}

function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function renderEmotes(content, emots) {
  if (!content) return null;
  if (!emots) return content;
  const parts = content.split(/(\[+[^\]]+\]+)/);
  return parts.map((part, i) => {
    const emot = part.startsWith('[') && part.endsWith(']') ? emots[part] : null;
    if (emot) {
      return (
        <img key={i} src={emot.url} alt={part} title={part}
          className={isSmallEmote(emot.url) ? 'dm-emote' : 'dm-emote dm-emote-big'}
          referrerPolicy="no-referrer" />
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function copySheetsTo(pipDoc) {
  document.querySelectorAll('style').forEach(el => {
    const s = pipDoc.createElement('style');
    s.textContent = el.textContent;
    pipDoc.head.appendChild(s);
  });
  document.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
    pipDoc.head.appendChild(el.cloneNode(true));
  });
  const base = pipDoc.createElement('style');
  base.textContent = [
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    'html, body { height: 100%; overflow: hidden; }',
    "body { color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; font-size: 14px; line-height: 1.5; }",
    'button { cursor: pointer; border: none; outline: none; font-family: inherit; font-size: 13px; }',
  ].join('\n');
  pipDoc.head.appendChild(base);
}

function PipView({ danmakuList, roomId, fontSize, onBanSuccess, onFilterUser, onViewHistory }) {
  const listRef = useRef(null);
  const isAutoScrollRef = useRef(true);
  const prevLengthRef = useRef(0);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [selectedMsg, setSelectedMsg] = useState(null);

  useEffect(() => {
    const prev = prevLengthRef.current;
    const curr = danmakuList.length;
    prevLengthRef.current = curr;
    if (curr < prev) {
      // 列表被重置（断线重连）
      setUnreadCount(0);
      isAutoScrollRef.current = true;
      setIsAutoScroll(true);
      return;
    }
    if (isAutoScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    } else if (curr > prev) {
      setUnreadCount(c => c + (curr - prev));
    }
  }, [danmakuList]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    isAutoScrollRef.current = atBottom;
    setIsAutoScroll(atBottom);
    if (atBottom) setUnreadCount(0);
  };

  const scrollToBottom = () => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    isAutoScrollRef.current = true;
    setIsAutoScroll(true);
    setUnreadCount(0);
  };

  const handleUserClick = (e, user, msg) => {
    e.stopPropagation();
    const win = e.target.ownerDocument.defaultView || window;
    const rect = e.currentTarget.getBoundingClientRect();
    let x = rect.left;
    let y = rect.bottom + 6;
    if (x + 252 > win.innerWidth) x = win.innerWidth - 262;
    if (y + 360 > win.innerHeight) y = Math.max(10, rect.top - 360);
    setPopupPos({ x, y });
    setSelectedUser(user);
    setSelectedMsg(msg);
  };

  const recent = danmakuList.slice(-150);

  return (
    <div className="pip-view">
      <div className="pip-header">
        <span className="pip-title">弹幕监控</span>
        <span className="pip-count">{danmakuList.length} 条</span>
      </div>
      <div className="pip-list-wrap">
        <div className="pip-list" ref={listRef} onScroll={handleScroll}
          style={{ fontSize: `${fontSize}px` }}>
          {recent.map(msg => {
            if (msg.type === 'divider') {
              return <div key={msg._id} className="dm-divider"><span>{msg.content}</span></div>;
            }
            return (
              <div key={msg._id} className="dm-row pip-row">
                <span className="dm-time">{formatTime(msg.timestamp)}</span>
                <div className="dm-user" onClick={e => handleUserClick(e, msg.user, msg)}>
                  {msg.user?.face && (
                    <img src={msg.user.face} alt="" className="dm-avatar" referrerPolicy="no-referrer"
                      onError={e => e.target.style.display = 'none'} />
                  )}
                  {msg.user?.guardLevel > 0 && (
                    <span className="dm-guard-badge"
                      style={{ background: GUARD_COLORS[msg.user.guardLevel] }}>
                      {GUARD_LABELS[msg.user.guardLevel]}
                    </span>
                  )}
                  <span className="dm-username">{msg.user?.username}</span>
                </div>
                <span className="dm-content">{renderEmotes(msg.content, msg.emots)}</span>
              </div>
            );
          })}
        </div>
        {!isAutoScroll && unreadCount > 0 && (
          <button className="pip-new-msg-btn" onClick={scrollToBottom}>
            ↓ {unreadCount} 条新消息
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
          onBanSuccess={(uid) => { onBanSuccess?.(uid); setSelectedUser(null); }}
          onFilterUser={uid => { onFilterUser?.(uid); setSelectedUser(null); }}
          onViewHistory={uid => { onViewHistory?.(uid); setSelectedUser(null); }}
        />
      )}
    </div>
  );
}

export default function DanmakuPage() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [liveStatus, setLiveStatus] = useState(0);
  const [liveStartTime, setLiveStartTime] = useState(0);
  const [liveDuration, setLiveDuration] = useState('00:00:00');
  const [roomInfo, setRoomInfo] = useState(null);
  const [watchedCount, setWatchedCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [rankCount, setRankCount] = useState(0);

  const [danmakuList, setDanmakuList] = useState([]);
  const [scList, setScList] = useState([]);
  const [giftList, setGiftList] = useState([]);

  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterUid, setFilterUid] = useState(null);

  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const [selectedUser, setSelectedUser] = useState(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [bannedUids, setBannedUids] = useState(new Set());

  const [pipOpen, setPipOpen] = useState(false);
  const pipRootRef = useRef(null);
  const pipWindowRef = useRef(null);

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('dm-font-size')) || 15);
  const [scrollDir, setScrollDir] = useState(() => localStorage.getItem('dm-scroll-dir') || 'up');
  const [scDisplayMode, setScDisplayMode] = useState(() => localStorage.getItem('dm-sc-mode') || 'card');
  const [giftDisplayMode, setGiftDisplayMode] = useState(() => localStorage.getItem('dm-gift-mode') || 'text');
  const [overlayOpacity, setOverlayOpacity] = useState(0.85);

  const wsRef = useRef(null);
  const listRef = useRef(null);
  const isAutoScrollRef = useRef(true);
  const reconnectRef = useRef(null);
  const reconnectCount = useRef(0);

  const loadedStartOffsetRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const hasMoreRef = useRef(false);

  // ── 读取 Electron 悬浮窗设置，并监听其他窗口保存后的配置变化 ─────────────
  useEffect(() => {
    if (!window.electronAPI) return;
    let cancelled = false;
    window.electronAPI.loadConfig().then(cfg => {
      if (cancelled) return;
      if (cfg.overlayOpacity != null) setOverlayOpacity(cfg.overlayOpacity);
    });
    const off = window.electronAPI.onConfigUpdated?.((cfg) => {
      if (cfg.overlayOpacity != null) setOverlayOpacity(cfg.overlayOpacity);
    });
    return () => { cancelled = true; off?.(); };
  }, []);

  const sendOverlaySnapshot = useCallback(() => {
    if (!window.electronAPI?.sendOverlaySnapshot) return;
    window.electronAPI.sendOverlaySnapshot({
      danmakuList: danmakuList.slice(-500),
      connected,
      roomId,
      fontSize,
    });
  }, [danmakuList, connected, roomId, fontSize]);

  // 主界面收到弹幕后，实时推送给悬浮窗；悬浮窗打开时也会主动请求一次快照
  useEffect(() => { sendOverlaySnapshot(); }, [sendOverlaySnapshot]);
  useEffect(() => {
    if (!window.electronAPI?.onOverlaySyncRequest) return;
    return window.electronAPI.onOverlaySyncRequest(sendOverlaySnapshot);
  }, [sendOverlaySnapshot]);

  // Live duration timer
  useEffect(() => {
    if (!liveStartTime || liveStatus !== 1) return;
    const timer = setInterval(() => {
      setLiveDuration(formatDuration(Math.floor((Date.now() / 1000) - liveStartTime)));
    }, 1000);
    return () => clearInterval(timer);
  }, [liveStartTime, liveStatus]);

  const addMessage = useCallback((msg) => {
    const withId = { ...msg, _id: genId() };
    if (msg.type === 'danmaku' || msg.type === 'divider') {
      setDanmakuList(prev => {
        const next = [...prev, withId];
        return next.length > MAX_LIVE ? next.slice(-MAX_LIVE) : next;
      });
      if (!isAutoScrollRef.current) {
        setUnreadCount(c => c + 1);
      }
    } else if (msg.type === 'superchat') {
      setScList(prev => [...prev.slice(-199), withId]);
    } else if (msg.type === 'gift') {
      setGiftList(prev => [...prev.slice(-199), withId]);
    }
  }, []);

  const connectWS = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    // 在 Electron 远程模式下使用配置的后端地址，否则使用当前 origin
    const backendUrl = window.electronAPI ? localStorage.getItem('backendUrl') : null;
    let wsUrl;
    if (backendUrl) {
      wsUrl = backendUrl.replace(/^https/, 'wss').replace(/^http/, 'ws') + `/ws/danmaku?token=${token}`;
    } else {
      const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
      wsUrl = `${wsProto}://${location.host}/ws/danmaku?token=${token}`;
    }
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => { reconnectCount.current = 0; };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'live_status') {
          setLiveStatus(msg.liveStatus);
          if (msg.liveStartTime) setLiveStartTime(msg.liveStartTime);
        } else if (msg.type === 'room_info') {
          setRoomInfo(msg);
        } else if (msg.type === 'watched') {
          setWatchedCount(msg.count || 0);
        } else if (msg.type === 'like') {
          setLikeCount(msg.count || 0);
        } else if (msg.type === 'rank_count') {
          setRankCount(msg.count || 0);
        } else {
          addMessage(msg);
        }
      } catch {}
    };
    ws.onclose = (e) => {
      if (wsRef.current !== ws) return; // 已被新连接替换，忽略此次关闭
      if (e.code === 4001 || e.reason === 'Unauthorized') return;
      const delay = Math.min(1000 * Math.pow(2, reconnectCount.current++), 30000);
      if (reconnectCount.current <= 5) {
        reconnectRef.current = setTimeout(connectWS, delay);
      }
    };
    ws.onerror = () => {};
  }, [addMessage]);

  const loadOlderItems = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    const currentStart = loadedStartOffsetRef.current;
    if (currentStart <= 0) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    const newStart = Math.max(0, currentStart - PAGE);
    const count = currentStart - newStart;

    try {
      const r = await getDanmakuSession(newStart, count);
      const { danmaku: older = [] } = r.data;
      if (older.length) {
        // 在 setState 前同步记录当前滚动位置，渲染后通过 RAF 补偿高度差，避免内容跳动
        const el = listRef.current;
        const oldScrollHeight = el ? el.scrollHeight : 0;
        const oldScrollTop = el ? el.scrollTop : 0;
        setDanmakuList(prev => [
          ...older.map(m => ({ ...m, _id: genId() })),
          ...prev,
        ]);
        requestAnimationFrame(() => {
          if (listRef.current) {
            listRef.current.scrollTop = oldScrollTop + (listRef.current.scrollHeight - oldScrollHeight);
          }
        });
      }
      loadedStartOffsetRef.current = newStart;
      const more = newStart > 0;
      setHasMore(more);
      hasMoreRef.current = more;
    } catch {}
    finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, []);

  useEffect(() => {
    api.get('/danmaku/rooms').then(r => {
      if (r.data.configured) setRoomId(r.data.configured);
      setConnected(r.data.connected);
    }).catch(() => {});

    (async () => {
      try {
        // 第一次请求：获取 total + SC + 礼物，以及前 PAGE 条弹幕
        const r0 = await getDanmakuSession(0, PAGE);
        const { danmaku: c0 = [], total = 0, superchat = [], gift = [] } = r0.data;
        if (superchat.length) setScList(superchat.map(m => ({ ...m, _id: genId() })));
        if (gift.length) setGiftList(gift.map(m => ({ ...m, _id: genId() })));

        if (total <= PAGE) {
          // 全部数据已在首次请求中
          setDanmakuList(c0.map(m => ({ ...m, _id: genId() })));
          loadedStartOffsetRef.current = 0;
        } else {
          // 只加载最新的 PAGE 条
          const startOffset = total - PAGE;
          const r1 = await getDanmakuSession(startOffset, PAGE);
          const { danmaku: last = [] } = r1.data;
          setDanmakuList(last.map(m => ({ ...m, _id: genId() })));
          loadedStartOffsetRef.current = startOffset;
          setHasMore(true);
          hasMoreRef.current = true;
        }
      } catch {}
    })();

    connectWS();
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connectWS]);

  // Auto-scroll（感知方向）
  const scrollDirRef = useRef(scrollDir);
  useEffect(() => { scrollDirRef.current = scrollDir; }, [scrollDir]);

  useEffect(() => {
    if (!isAutoScrollRef.current || !listRef.current) return;
    if (scrollDirRef.current === 'up') {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    } else {
      listRef.current.scrollTop = 0;
    }
  }, [danmakuList]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    let atEdge, nearOldEnd;
    if (scrollDirRef.current === 'up') {
      atEdge = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      nearOldEnd = el.scrollTop < 120;
    } else {
      atEdge = el.scrollTop < 80;
      nearOldEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    }
    isAutoScrollRef.current = atEdge;
    setIsAutoScroll(atEdge);
    if (atEdge) setUnreadCount(0);
    if (nearOldEnd) loadOlderItems();
  };

  const scrollToEdge = () => {
    if (!listRef.current) return;
    if (scrollDirRef.current === 'up') {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    } else {
      listRef.current.scrollTop = 0;
    }
    isAutoScrollRef.current = true;
    setIsAutoScroll(true);
    setUnreadCount(0);
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await startDanmaku();
      setConnected(true);
      setDanmakuList([]);
      setScList([]);
      setGiftList([]);
      setHasMore(false);
      hasMoreRef.current = false;
      loadedStartOffsetRef.current = 0;
    } catch (e) {
      alert(e.response?.data?.error || '连接失败');
    } finally {
      setReconnecting(false);
    }
  };

  const handleUserClick = (e, user, msg) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    let x = rect.left;
    let y = rect.bottom + 6;
    if (x + 280 > window.innerWidth) x = window.innerWidth - 290;
    if (y + 360 > window.innerHeight) y = Math.max(10, rect.top - 360);
    setPopupPos({ x, y });
    setSelectedUser(user);
    setSelectedMsg(msg);
  };

  const handleBanSuccess = useCallback((uid) => {
    setBannedUids(prev => new Set([...prev, uid]));
  }, []);

  const handleFontSize = (v) => {
    setFontSize(v);
    localStorage.setItem('dm-font-size', v);
  };

  const handleScrollDir = (v) => {
    setScrollDir(v);
    localStorage.setItem('dm-scroll-dir', v);
    // 切换方向后立即跳到对应边缘
    setTimeout(() => {
      if (!listRef.current) return;
      if (v === 'up') listRef.current.scrollTop = listRef.current.scrollHeight;
      else listRef.current.scrollTop = 0;
    }, 0);
  };

  const handleScMode = (v) => { setScDisplayMode(v); localStorage.setItem('dm-sc-mode', v); };
  const handleGiftMode = (v) => { setGiftDisplayMode(v); localStorage.setItem('dm-gift-mode', v); };

  async function saveElectronConfig(patch) {
    if (!window.electronAPI) return;
    const cfg = await window.electronAPI.loadConfig();
    await window.electronAPI.saveConfig({ ...cfg, ...patch });
  }

  const handleOverlayOpacity = (v) => {
    setOverlayOpacity(v);
    saveElectronConfig({ overlayOpacity: v });
  };

  const openPip = async () => {
    // Electron 模式：使用原生透明悬浮窗，不依赖 documentPictureInPicture
    if (window.electronAPI) {
      window.electronAPI.openOverlay();
      return;
    }
    if (!('documentPictureInPicture' in window)) {
      alert('当前浏览器不支持此功能，请使用 Chrome 116+ 或 Edge');
      return;
    }
    if (pipWindowRef.current) {
      pipWindowRef.current.close();
      return;
    }
    try {
      const pipWin = await window.documentPictureInPicture.requestWindow({
        width: 360,
        height: 560,
        disallowReturnToOpener: false,
      });
      const theme = document.documentElement.getAttribute('data-theme') || 'light';
      pipWin.document.documentElement.setAttribute('data-theme', theme);
      copySheetsTo(pipWin.document);

      const container = pipWin.document.createElement('div');
      container.style.cssText = 'height:100%;display:flex;flex-direction:column;';
      pipWin.document.body.appendChild(container);

      const root = createRoot(container);
      pipRootRef.current = root;
      pipWindowRef.current = pipWin;
      setPipOpen(true);

      root.render(
        <PipView
          danmakuList={danmakuList}
          roomId={roomId}
          fontSize={fontSize}
          onBanSuccess={handleBanSuccess}
          onFilterUser={uid => { setFilterUid(uid); }}
          onViewHistory={uid => { navigate('/history', { state: { uid } }); }}
        />
      );

      const themeObserver = new MutationObserver(() => {
        const t = document.documentElement.getAttribute('data-theme') || 'light';
        pipWin.document.documentElement.setAttribute('data-theme', t);
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

      pipWin.addEventListener('pagehide', () => {
        themeObserver.disconnect();
        root.unmount();
        pipRootRef.current = null;
        pipWindowRef.current = null;
        setPipOpen(false);
      });
    } catch {}
  };

  useEffect(() => {
    if (!pipRootRef.current) return;
    pipRootRef.current.render(
      <PipView
        danmakuList={danmakuList}
        roomId={roomId}
        fontSize={fontSize}
        onBanSuccess={handleBanSuccess}
        onFilterUser={uid => { setFilterUid(uid); }}
        onViewHistory={uid => { navigate('/history', { state: { uid } }); }}
      />
    );
  }, [danmakuList, roomId, fontSize, handleBanSuccess, navigate]);

  const filterDanmaku = (list) => {
    return list.filter(msg => {
      if (msg.type === 'divider') return true;
      if (filterType !== 'all' && msg.type !== filterType) return false;
      if (filterUid && msg.user?.uid !== filterUid) return false;
      if (filterText) {
        const t = filterText.toLowerCase();
        const inContent = msg.content?.toLowerCase().includes(t);
        const inUser = msg.user?.username?.toLowerCase().includes(t) ||
                       String(msg.user?.uid).includes(t);
        if (!inContent && !inUser) return false;
      }
      return true;
    });
  };

  const highlight = (text) => {
    if (!filterText || !text) return text;
    const idx = text.toLowerCase().indexOf(filterText.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="dm-highlight">{text.slice(idx, idx + filterText.length)}</mark>
        {text.slice(idx + filterText.length)}
      </>
    );
  };

  const renderContent = (content, emots) => {
    if (!content) return null;
    if (!emots) return highlight(content);
    const parts = content.split(/(\[+[^\]]+\]+)/);
    return parts.map((part, i) => {
      const emot = part.startsWith('[') && part.endsWith(']') ? emots[part] : null;
      if (emot) {
        return (
          <img key={i} src={emot.url} alt={part} title={part}
            className={isSmallEmote(emot.url) ? 'dm-emote' : 'dm-emote dm-emote-big'}
            referrerPolicy="no-referrer" />
        );
      }
      return <span key={i}>{highlight(part)}</span>;
    });
  };

  const filteredBase = filterDanmaku(danmakuList);
  const filtered = scrollDir === 'down' ? [...filteredBase].reverse() : filteredBase;

  return (
    <div className="dm-page">
      {/* Top bar */}
      <div className="dm-topbar">
        {/* 左：主播信息 */}
        <div className="dm-left">
          <img
            src={roomInfo?.anchorFace || 'https://i0.hdslb.com/bfs/face/member/noface.jpg'}
            alt={roomInfo?.anchorName || ''}
            className="dm-anchor-avatar"
            referrerPolicy="no-referrer"
            onError={e => e.target.src = 'https://i0.hdslb.com/bfs/face/member/noface.jpg'}
          />
          <span className={`dm-status-dot ${liveStatus === 1 ? 'live' : liveStatus === 2 ? 'replay' : ''}`} />
          {roomInfo?.anchorName && <span className="dm-anchor">{roomInfo.anchorName}</span>}
          <div className="dm-divider-v" />
          <span className="dm-stat-item">在线 <b>{watchedCount.toLocaleString()}</b></span>
          <span className="dm-stat-item">点赞 <b>{likeCount.toLocaleString()}</b></span>
          <span className="dm-stat-item">高能 <b>{rankCount.toLocaleString()}</b></span>
          {roomInfo?.guardCount > 0 && <span className="dm-stat-item">舰长 <b>{roomInfo.guardCount}</b></span>}
          {liveStatus === 1 && <span className="dm-stat-item">时长 <b className="dm-duration">{liveDuration}</b></span>}
        </div>

        {/* 中：搜索筛选 */}
        <div className="dm-center">
          {filterUid && (
            <span className="dm-filter-tag">UID: {filterUid}</span>
          )}
          <input
            className="dm-filter-input"
            placeholder="搜索用户名 / UID / 弹幕内容"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
          <CustomSelect
            value={filterType}
            onChange={setFilterType}
            options={[
              { value: 'all',      label: '全部' },
              { value: 'danmaku',  label: '弹幕' },
              { value: 'gift',     label: '礼物' },
              { value: 'superchat',label: 'SC'   },
              { value: 'guard',    label: '上舰' },
            ]}
          />
          {(filterText || filterUid || filterType !== 'all') && (
            <button className="dm-filter-clear" onClick={() => { setFilterText(''); setFilterUid(null); setFilterType('all'); }}>
              ×
            </button>
          )}
        </div>

        {/* 右：工具按钮 */}
        <div className="dm-right">
          <button
            className={`dm-pip-btn${pipOpen ? ' active' : ''}`}
            onClick={openPip}
            title={pipOpen ? '关闭悬浮窗' : '弹出悬浮窗'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="14" rx="2" ry="2"/>
              <rect x="11" y="11" width="10" height="6" rx="1" fill="currentColor" stroke="none"/>
            </svg>
          </button>
          <button
            className={`dm-settings-btn${settingsOpen ? ' active' : ''}`}
            onClick={() => setSettingsOpen(v => !v)}
            title="显示设置"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="dm-main">
        {/* Danmaku list */}
        <div className="dm-col dm-col-danmaku">
          <div className="dm-col-header">
            弹幕 <span className="dm-col-count">{danmakuList.length}</span>
            {hasMore && !loadingOlder && (
              <span className="dm-preload-hint">向上滚动加载更多</span>
            )}
          </div>
          <div className="dm-list" ref={listRef} onScroll={handleScroll}
            style={{ fontSize: `${fontSize}px` }}>
            {loadingOlder && scrollDir !== 'down' && (
              <div className="dm-loading-older"><span className="dm-loading-spinner" />加载更早的消息</div>
            )}
            {filtered.map(msg => {
              if (msg.type === 'divider') {
                return (
                  <div key={msg._id} className="dm-divider">
                    <span>{msg.content}</span>
                  </div>
                );
              }
              const isBanned = bannedUids.has(msg.user?.uid);
              return (
                <div key={msg._id} className={`dm-row ${isBanned ? 'dm-row-banned' : ''}`}>
                  <span className="dm-time">{formatTime(msg.timestamp)}</span>
                  <div
                    className="dm-user"
                    onClick={e => handleUserClick(e, msg.user, msg)}
                  >
                    {msg.user?.face && (
                      <img src={msg.user.face} alt="" className="dm-avatar" referrerPolicy="no-referrer"
                        onError={e => e.target.style.display = 'none'} />
                    )}
                    {msg.user?.guardLevel > 0 && (
                      <span
                        className="dm-guard-badge"
                        style={{ background: GUARD_COLORS[msg.user.guardLevel] }}
                      >
                        {GUARD_LABELS[msg.user.guardLevel]}
                      </span>
                    )}
                    <span className="dm-username">{highlight(msg.user?.username)}</span>
                  </div>
                  <span className="dm-content">{renderContent(msg.content, msg.emots)}</span>
                </div>
              );
            })}
            {loadingOlder && scrollDir === 'down' && (
              <div className="dm-loading-older"><span className="dm-loading-spinner" />加载更早的消息</div>
            )}
          </div>
          {!isAutoScroll && unreadCount > 0 && (
            <button className="dm-new-msg-btn" onClick={scrollToEdge}>
              {scrollDir === 'up' ? '↓' : '↑'} {unreadCount} 条新消息
            </button>
          )}
        </div>

        {/* SC list */}
        <div className="dm-col dm-col-sc">
          <div className="dm-col-header">醒目留言 <span className="dm-col-count">{scList.length}</span></div>
          <div className="dm-list" style={{ fontSize: `${fontSize}px` }}>
            {scList.map(msg => {
              if (msg.type === 'divider') {
                return <div key={msg._id} className="dm-divider"><span>{msg.content}</span></div>;
              }
              if (scDisplayMode === 'card') {
                const colors = getSCColor(msg.price);
                return (
                  <div key={msg._id} className="dm-sc-row">
                    <div className="dm-sc-header" style={{ background: colors.bg }}>
                      <div className="dm-sc-header-left">
                        {msg.user?.face && (
                          <img src={msg.user.face} alt="" className="dm-sc-avatar" referrerPolicy="no-referrer"
                            onError={e => e.target.style.display = 'none'} />
                        )}
                        <span className="dm-sc-user" style={{ color: colors.text }}
                          onClick={e => handleUserClick(e, msg.user, msg)}>
                          {msg.user?.username}
                        </span>
                      </div>
                      <span className="dm-sc-price" style={{ color: colors.text }}>¥{msg.price}</span>
                    </div>
                    <div className="dm-sc-content" style={{ background: colors.bodyBg, color: '#333' }}>{msg.message}</div>
                  </div>
                );
              }
              // text mode
              return (
                <div key={msg._id} className="dm-sc-text-row"
                  onClick={e => msg.user && handleUserClick(e, msg.user, msg)}>
                  <span className="dm-time">{formatTime(msg.time)}</span>
                  <span className="dm-sc-text-price" style={{ color: getSCColor(msg.price).bg }}>¥{msg.price}</span>
                  <span className="dm-username">{msg.user?.username}</span>
                  <span className="dm-sc-text-msg">{msg.message}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gift list */}
        <div className="dm-col dm-col-gift">
          <div className="dm-col-header">礼物 <span className="dm-col-count">{giftList.length}</span></div>
          <div className="dm-list" style={{ fontSize: `${fontSize}px` }}>
            {giftList.map(msg => {
              if (msg.type === 'divider') {
                return <div key={msg._id} className="dm-divider"><span>{msg.content}</span></div>;
              }
              if (giftDisplayMode === 'icon') {
                const isGuard = msg.type === 'guard';
                const iconSrc = isGuard
                  ? GUARD_ICONS[msg.guardLevel]
                  : (msg.giftIconStatic || msg.giftIcon);
                return (
                  <div key={msg._id} className="dm-gift-icon-row"
                    onClick={e => msg.user && handleUserClick(e, msg.user, msg)}>
                    {iconSrc && (
                      <img className="dm-gift-icon-img" src={iconSrc} alt={msg.giftName}
                        referrerPolicy="no-referrer" onError={e => e.target.style.display = 'none'} />
                    )}
                    <div className="dm-gift-icon-info">
                      <span className="dm-gift-user">{msg.user?.username}</span>
                      <span className="dm-gift-name"> {isGuard ? msg.giftName : `赠送 ${msg.giftName}`}</span>
                      <span className="dm-gift-count"> ×{msg.num}</span>
                      {msg.coinType === 'gold' && (msg.totalCoin || msg.price) > 0 && (
                        <span className="dm-gift-icon-price"> ¥{((msg.totalCoin || msg.price) / 1000).toFixed(1).replace(/\.0$/, '')}</span>
                      )}
                      {isGuard && msg.price > 0 && (
                        <span className="dm-gift-icon-price"> ¥{(msg.price / 1000).toFixed(0)}</span>
                      )}
                    </div>
                  </div>
                );
              }
              // text mode (default)
              return (
                <div key={msg._id} className="dm-gift-row"
                  onClick={e => msg.user && handleUserClick(e, msg.user, msg)}>
                  <span className="dm-gift-user">{msg.user?.username}</span>
                  <span className="dm-gift-name"> 赠送 {msg.giftName}</span>
                  <span className="dm-gift-count"> ×{msg.num}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Settings panel */}
      <div className={`dm-settings-panel${settingsOpen ? ' open' : ''}`}>
        <div className="dm-settings-header">
          <span>显示设置</span>
          <button className="dm-settings-close" onClick={() => setSettingsOpen(false)}>×</button>
        </div>

        <div className="dm-settings-body">
          <div className="dm-settings-group">
            <div className="dm-settings-label">
              弹幕字号
              <span className="dm-settings-value">{(fontSize - 15) / 2 > 0 ? '+' : ''}{(fontSize - 15) / 2}</span>
            </div>
            <input
              type="range" min="-5" max="5" step="1"
              value={(fontSize - 15) / 2}
              onChange={e => handleFontSize(15 + Number(e.target.value) * 2)}
              className="dm-settings-slider"
            />
          </div>

          <div className="dm-settings-group">
            <div className="dm-settings-label">显示方向</div>
            <div className="dm-settings-radio-group">
              <label className={`dm-settings-radio${scrollDir === 'up' ? ' active' : ''}`}>
                <input type="radio" name="scrollDir" value="up"
                  checked={scrollDir === 'up'}
                  onChange={() => handleScrollDir('up')} />
                <span>向上滚动</span>
                <span className="dm-settings-radio-hint">新弹幕在底部</span>
              </label>
              <label className={`dm-settings-radio${scrollDir === 'down' ? ' active' : ''}`}>
                <input type="radio" name="scrollDir" value="down"
                  checked={scrollDir === 'down'}
                  onChange={() => handleScrollDir('down')} />
                <span>向下滚动</span>
                <span className="dm-settings-radio-hint">新弹幕在顶部</span>
              </label>
            </div>
          </div>

          <div className="dm-settings-group">
            <div className="dm-settings-label">SC 显示方式</div>
            <div className="dm-settings-radio-group">
              <label className={`dm-settings-radio${scDisplayMode === 'card' ? ' active' : ''}`}>
                <input type="radio" name="scMode" value="card"
                  checked={scDisplayMode === 'card'}
                  onChange={() => handleScMode('card')} />
                <span>卡片</span>
                <span className="dm-settings-radio-hint">彩色卡片</span>
              </label>
              <label className={`dm-settings-radio${scDisplayMode === 'text' ? ' active' : ''}`}>
                <input type="radio" name="scMode" value="text"
                  checked={scDisplayMode === 'text'}
                  onChange={() => handleScMode('text')} />
                <span>文字</span>
                <span className="dm-settings-radio-hint">紧凑文字行</span>
              </label>
            </div>
          </div>

          <div className="dm-settings-group">
            <div className="dm-settings-label">礼物显示方式</div>
            <div className="dm-settings-radio-group">
              <label className={`dm-settings-radio${giftDisplayMode === 'text' ? ' active' : ''}`}>
                <input type="radio" name="giftMode" value="text"
                  checked={giftDisplayMode === 'text'}
                  onChange={() => handleGiftMode('text')} />
                <span>文字</span>
                <span className="dm-settings-radio-hint">紧凑文字行</span>
              </label>
              <label className={`dm-settings-radio${giftDisplayMode === 'icon' ? ' active' : ''}`}>
                <input type="radio" name="giftMode" value="icon"
                  checked={giftDisplayMode === 'icon'}
                  onChange={() => handleGiftMode('icon')} />
                <span>图标</span>
                <span className="dm-settings-radio-hint">含礼物图标</span>
              </label>
            </div>
          </div>

          {window.electronAPI && (
            <>
              <div className="dm-settings-section-title">悬浮窗</div>

              <div className="dm-settings-group">
                <div className="dm-settings-label">
                  悬浮窗透明度
                  <span className="dm-settings-value">{Math.round(overlayOpacity * 100)}%</span>
                </div>
                <input
                  type="range" min="0.1" max="1" step="0.05"
                  value={overlayOpacity}
                  onChange={e => handleOverlayOpacity(Number(e.target.value))}
                  className="dm-settings-slider"
                />
              </div>
            </>
          )}

        </div>
      </div>
      {settingsOpen && <div className="dm-settings-mask" onClick={() => setSettingsOpen(false)} />}

      {selectedUser && (
        <UserActionPopup
          user={selectedUser}
          msg={selectedMsg}
          position={popupPos}
          roomId={roomId}
          onClose={() => setSelectedUser(null)}
          onBanSuccess={handleBanSuccess}
          onFilterUser={(uid) => { setFilterUid(uid); setSelectedUser(null); }}
          onViewHistory={(uid) => { navigate('/history', { state: { uid } }); setSelectedUser(null); }}
        />
      )}

    </div>
  );
}
