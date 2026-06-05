import { useState, useEffect } from 'react';
import { searchHistory, getHistorySessions, getHistoryData } from '../services/api';
import { formatTs } from '../utils/timeUtils';
import './HistoryDrawer.css';

const TYPE_LABELS = { danmaku: '弹幕', superchat: 'SC', gift: '礼物', guard: '上舰' };

export default function HistoryDrawer({ initUid, roomId, onClose }) {
  const [tab, setTab] = useState(initUid ? 'search' : 'sessions');

  // 历史场次 tab
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [msgType, setMsgType] = useState('danmaku');

  // 搜索 tab
  const [uid, setUid] = useState(initUid || '');
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (tab === 'sessions' && roomId && sessions.length === 0) {
      loadSessions();
    }
  }, [tab]);

  useEffect(() => {
    if (initUid && roomId) handleSearch({ uid: initUid, roomId });
  }, []);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await getHistorySessions(roomId);
      setSessions(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setSessionsLoading(false);
    }
  };

  const selectSession = async (sessionId) => {
    if (selectedSession === sessionId) return;
    setSelectedSession(sessionId);
    setSessionData(null);
    setSessionLoading(true);
    try {
      const res = await getHistoryData(roomId, sessionId);
      setSessionData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setSessionLoading(false);
    }
  };

  const handleSearch = async (overrides = {}) => {
    const params = {
      uid: overrides.uid !== undefined ? overrides.uid : uid,
      keyword,
      roomId: overrides.roomId !== undefined ? overrides.roomId : roomId,
    };
    if (!params.roomId) return;
    setSearchLoading(true);
    try {
      const res = await searchHistory(params);
      setResults(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setSearchLoading(false);
    }
  };

  const currentList = sessionData?.[msgType] || [];

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-tabs">
            <button className={`drawer-tab ${tab === 'sessions' ? 'active' : ''}`} onClick={() => setTab('sessions')}>历史场次</button>
            <button className={`drawer-tab ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>搜索</button>
          </div>
          <button className="drawer-close" onClick={onClose}>×</button>
        </div>

        {tab === 'sessions' && (
          <div className="drawer-sessions-layout">
            <div className="drawer-session-list">
              {sessionsLoading && <div className="drawer-list-empty">加载中...</div>}
              {!sessionsLoading && sessions.length === 0 && <div className="drawer-list-empty">无记录</div>}
              {sessions.map(s => (
                <div
                  key={s}
                  className={`drawer-session-item ${selectedSession === s ? 'active' : ''}`}
                  onClick={() => selectSession(s)}
                >
                  {formatTs(s)}
                </div>
              ))}
            </div>

            <div className="drawer-session-view">
              {!selectedSession && <div className="drawer-empty">选择左侧场次查看弹幕</div>}
              {selectedSession && (
                <>
                  <div className="drawer-type-tabs">
                    {Object.entries(TYPE_LABELS).map(([key, label]) => (
                      <button
                        key={key}
                        className={`drawer-type-tab ${msgType === key ? 'active' : ''}`}
                        onClick={() => setMsgType(key)}
                      >
                        {label}
                        {sessionData && (
                          <span className="drawer-type-count">{sessionData[key]?.filter(m => m.type !== 'divider').length || 0}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="drawer-results">
                    {sessionLoading && <div className="drawer-empty">加载中...</div>}
                    {!sessionLoading && currentList.length === 0 && <div className="drawer-empty">无数据</div>}
                    {currentList.filter(m => m.type !== 'divider').map((msg, i) => (
                      <div key={i} className="drawer-row">
                        <span className="drawer-row-time">{formatTs(msg.timestamp || msg.time)}</span>
                        <span className="drawer-row-user">{msg.user?.username}</span>
                        <span className="drawer-row-content">
                          {msgType === 'danmaku' && msg.content}
                          {msgType === 'superchat' && `¥${msg.price}  ${msg.message}`}
                          {msgType === 'gift' && `${msg.giftName} ×${msg.num}`}
                          {msgType === 'guard' && msg.giftName}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'search' && (
          <>
            <div className="drawer-filters">
              <div className="drawer-filter-row">
                <input className="drawer-input" placeholder="UID（可选）" value={uid} onChange={e => setUid(e.target.value)} />
                <input
                  className="drawer-input drawer-input-wide"
                  placeholder="关键词（内容/用户名）"
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <button className="drawer-search-btn" onClick={() => handleSearch()} disabled={searchLoading}>
                  {searchLoading ? '搜索中...' : '搜索'}
                </button>
              </div>
            </div>
            <div className="drawer-results">
              {results.length === 0 && !searchLoading && <div className="drawer-empty">无结果</div>}
              {results.map((msg, i) => (
                <div key={i} className="drawer-row">
                  <span className="drawer-row-time">{formatTs(msg.timestamp)}</span>
                  <span className="drawer-row-user">{msg.user?.username}</span>
                  <span className="drawer-row-content">{msg.content}</span>
                </div>
              ))}
              {results.length >= 500 && <div className="drawer-limit">已显示最多 500 条结果</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
