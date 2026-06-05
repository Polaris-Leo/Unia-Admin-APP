import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { getHistorySessions, getHistoryData, searchHistory } from '../services/api';
import api from '../services/api';
import { isSmallEmote } from '../utils/emoteUtils';
import { formatTime, formatTs, formatDateOnly, parseDateStart, parseDateEnd } from '../utils/timeUtils';
import UserActionPopup from '../components/UserActionPopup';
import './DanmakuPage.css';
import './HistoryPage.css';

const GUARD_LABELS = { 1: '总督', 2: '提督', 3: '舰长' };
const GUARD_COLORS  = { 1: '#f0a500', 2: '#9b59b6', 3: '#3498db' };
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

const EMPTY_DRAFT = { sessionId: '', startDate: '', endDate: '', username: '', uid: '', keyword: '' };

function renderContent(content, emots) {
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

// ── 纯文本提取弹幕内容（表情替换为文字key）──
function extractText(content, emots) {
  if (!content) return '';
  if (!emots) return content;
  return content; // 原始文本已包含 [xxx] 形式
}

export default function HistoryPage() {
  const location = useLocation();
  const [roomId, setRoomId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [applied, setApplied] = useState(null);

  const [sessionData, setSessionData] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [selectedUser, setSelectedUser] = useState(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [bannedUids, setBannedUids] = useState(new Set());

  // Settings（与主页共用 localStorage key，保持一致）
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('dm-font-size')) || 15);
  const [scDisplayMode, setScDisplayMode] = useState(() => localStorage.getItem('dm-sc-mode') || 'card');
  const [giftDisplayMode, setGiftDisplayMode] = useState(() => localStorage.getItem('dm-gift-mode') || 'text');

  const handleFontSize = (v) => { setFontSize(v); localStorage.setItem('dm-font-size', v); };
  const handleScMode   = (v) => { setScDisplayMode(v);   localStorage.setItem('dm-sc-mode', v); };
  const handleGiftMode = (v) => { setGiftDisplayMode(v); localStorage.setItem('dm-gift-mode', v); };

  // Export
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTypes, setExportTypes] = useState({ danmaku: true, sc: true, gift: true });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    api.get('/danmaku/rooms').then(r => {
      const id = r.data.roomId || r.data.configured;
      if (id) {
        setRoomId(id);
        loadSessions(id);
        const initUid = location.state?.uid;
        if (initUid) {
          const initDraft = { ...EMPTY_DRAFT, uid: String(initUid) };
          setDraft(initDraft);
          runSearch(initDraft, id);
        }
      }
    }).catch(() => {});
  }, []);

  const loadSessions = async (rid) => {
    setSessionsLoading(true);
    try {
      const res = await getHistorySessions(rid);
      setSessions(res.data);
    } finally {
      setSessionsLoading(false);
    }
  };

  const runSearch = async (f, rid) => {
    const resolvedRid = rid ?? roomId;
    if (!resolvedRid) return;
    setApplied(f);

    if (f.sessionId) {
      setSessionData(null);
      setSessionLoading(true);
      try {
        const res = await getHistoryData(resolvedRid, f.sessionId);
        setSessionData(res.data);
      } finally {
        setSessionLoading(false);
      }
    } else {
      setSearchResults([]);
      if (!f.uid && !f.keyword && !f.username) return;
      setSearchLoading(true);
      try {
        const from = f.startDate ? parseDateStart(f.startDate) : undefined;
        const to   = f.endDate   ? parseDateEnd(f.endDate)     : undefined;
        const res = await searchHistory({
          uid: f.uid || undefined,
          keyword: f.keyword || f.username || undefined,
          roomId: resolvedRid,
          from,
          to,
        });
        let results = res.data || [];
        if (f.username && f.keyword) {
          const u = f.username.toLowerCase();
          results = results.filter(m => m.user?.username?.toLowerCase().includes(u));
        }
        setSearchResults(results);
      } finally {
        setSearchLoading(false);
      }
    }
  };

  const handleSearch = () => runSearch(draft);

  const handleReset = () => {
    setDraft(EMPTY_DRAFT);
    setApplied(null);
    setSessionData(null);
    setSearchResults([]);
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

  // ── Export ──
  const handleExport = () => {
    const hasData = mode === 'session'
      ? (filteredDanmaku.length || scList.length || giftList.length)
      : searchResults.length;
    if (!hasData) return;
    setExportTypes({ danmaku: true, sc: mode === 'session', gift: mode === 'session' });
    setShowExportModal(true);
  };

  const confirmExport = () => {
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const isCross = mode === 'search';

      if (exportTypes.danmaku) {
        const rows = isCross ? searchResults : filteredDanmaku;
        const headers = isCross
          ? ['时间', '场次', 'UID', '用户名', '舰长等级', '弹幕内容']
          : ['时间', 'UID', '用户名', '舰长等级', '弹幕内容'];
        const data = rows.map(m => {
          const base = [
            formatTs(m.timestamp),
            ...(isCross ? [formatTs(m.sessionId)] : []),
            String(m.user?.uid || ''),
            m.user?.username || '',
            GUARD_LABELS[m.user?.guardLevel] || '',
            extractText(m.content, m.emots),
          ];
          return base;
        });
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        ws['!cols'] = isCross
          ? [{ wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 8 }, { wch: 40 }]
          : [{ wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 8 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, ws, '弹幕');
      }

      if (exportTypes.sc && !isCross && scList.length) {
        const headers = ['时间', 'UID', '用户名', '金额(¥)', '内容'];
        const data = scList.map(m => [
          formatTs(m.timestamp || m.time),
          String(m.user?.uid || ''),
          m.user?.username || '',
          m.price ?? '',
          m.message || '',
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 50 }];
        XLSX.utils.book_append_sheet(wb, ws, 'SC醒目留言');
      }

      if (exportTypes.gift && !isCross && giftList.length) {
        const headers = ['时间', 'UID', '用户名', '礼物名称', '数量'];
        const data = giftList.map(m => [
          formatTs(m.timestamp),
          String(m.user?.uid || ''),
          m.user?.username || '',
          m.giftName || '',
          m.num ?? '',
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 8 }];
        XLSX.utils.book_append_sheet(wb, ws, '礼物');
      }

      if (wb.SheetNames.length === 0) { setExporting(false); return; }

      const label = applied?.sessionId
        ? formatTs(applied.sessionId).replace(/[/:]/g, '-').replace(/\s/g, '_')
        : `搜索_${formatDateOnly()}`;
      XLSX.writeFile(wb, `历史记录_${label}.xlsx`);
    } finally {
      setExporting(false);
      setShowExportModal(false);
    }
  };

  // ── Derived state ──
  const filteredSessionsForDropdown = sessions.filter(s => {
    const ts = Number(s);
    if (draft.startDate && ts < parseDateStart(draft.startDate)) return false;
    if (draft.endDate   && ts > parseDateEnd(draft.endDate))     return false;
    return true;
  });

  const danmakuList = sessionData?.danmaku || [];
  const scList      = sessionData?.superchat || [];
  const giftList    = sessionData?.gift || [];

  const filteredDanmaku = danmakuList.filter(msg => {
    if (msg.type === 'divider') return false;
    if (!applied) return true;
    if (applied.uid && String(msg.user?.uid) !== String(applied.uid)) return false;
    if (applied.username) {
      if (!msg.user?.username?.toLowerCase().includes(applied.username.toLowerCase())) return false;
    }
    if (applied.keyword) {
      const t = applied.keyword.toLowerCase();
      if (!msg.content?.toLowerCase().includes(t) && !msg.user?.username?.toLowerCase().includes(t)) return false;
    }
    if (applied.startDate && (msg.timestamp || 0) < parseDateStart(applied.startDate)) return false;
    if (applied.endDate   && (msg.timestamp || 0) > parseDateEnd(applied.endDate))     return false;
    return true;
  });

  const mode = applied === null ? 'placeholder'
    : applied.sessionId ? 'session'
    : 'search';

  const crossSearchNeedsInput = mode === 'search' && !applied.uid && !applied.keyword && !applied.username;

  const canExport = mode === 'session'
    ? !sessionLoading && (filteredDanmaku.length || scList.length || giftList.length)
    : mode === 'search' && !searchLoading && !crossSearchNeedsInput && searchResults.length > 0;

  return (
    <div className="history-page">

      {/* ── Export modal ── */}
      {showExportModal && (
        <div className="hx-modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="hx-modal" onClick={e => e.stopPropagation()}>
            <div className="hx-modal-header">
              <span>导出选项</span>
              <button className="hx-modal-close" onClick={() => setShowExportModal(false)}>×</button>
            </div>
            <div className="hx-modal-body">
              <p className="hx-modal-hint">选择要导出的内容（每类一个 Sheet）：</p>
              {[
                { key: 'danmaku', label: `弹幕`, count: mode === 'search' ? searchResults.length : filteredDanmaku.length },
                { key: 'sc',     label: `SC 醒目留言`, count: scList.length,  disabled: mode === 'search' },
                { key: 'gift',   label: `礼物`,        count: giftList.length, disabled: mode === 'search' },
              ].map(({ key, label, count, disabled }) => (
                <label
                  key={key}
                  className={`hx-check-row${disabled ? ' disabled' : ''}${exportTypes[key] && !disabled ? ' active' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={exportTypes[key] && !disabled}
                    disabled={disabled}
                    onChange={e => setExportTypes(t => ({ ...t, [key]: e.target.checked }))}
                  />
                  <span className="hx-check-label">{label}</span>
                  <span className="hx-check-count">{disabled ? '跨场次搜索不含此项' : `${count} 条`}</span>
                </label>
              ))}
            </div>
            <div className="hx-modal-footer">
              <button className="hf-btn-reset" onClick={() => setShowExportModal(false)}>取消</button>
              <button
                className="hf-btn-search"
                onClick={confirmExport}
                disabled={exporting || !Object.values(exportTypes).some(Boolean)}
              >
                {exporting ? '导出中...' : '确认导出'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Left sidebar: Filter panel ── */}
      <div className="history-sidebar">
        <div className="history-sidebar-header">筛选</div>

        <div className="hf-body">

          {/* 场次 */}
          <div className="hf-group">
            <div className="hf-label">场次</div>
            <div className="hf-session-dropdown" ref={dropdownRef}>
              <div
                className={`hf-dropdown-trigger ${isDropdownOpen ? 'active' : ''}`}
                onClick={() => setIsDropdownOpen(v => !v)}
              >
                <span>{draft.sessionId ? formatTs(draft.sessionId) : '全部场次'}</span>
                <svg className="hf-dropdown-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {isDropdownOpen && (
                <div className="hf-dropdown-options">
                  <div
                    className={`hf-dropdown-option ${!draft.sessionId ? 'selected' : ''}`}
                    onClick={() => { setDraft(d => ({ ...d, sessionId: '' })); setIsDropdownOpen(false); }}
                  >
                    全部场次
                  </div>
                  {sessionsLoading && (
                    <div className="hf-dropdown-option disabled">加载中...</div>
                  )}
                  {!sessionsLoading && filteredSessionsForDropdown.map(s => (
                    <div
                      key={s}
                      className={`hf-dropdown-option ${draft.sessionId === String(s) ? 'selected' : ''}`}
                      onClick={() => { setDraft(d => ({ ...d, sessionId: String(s) })); setIsDropdownOpen(false); }}
                    >
                      {formatTs(s)}
                    </div>
                  ))}
                  {!sessionsLoading && filteredSessionsForDropdown.length === 0 && (
                    <div className="hf-dropdown-option disabled">无符合条件的场次</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 日期范围 */}
          <div className="hf-group">
            <div className="hf-label">日期范围</div>
            <input
              type="date"
              className="hf-input"
              value={draft.startDate}
              onChange={e => setDraft(d => ({ ...d, startDate: e.target.value }))}
            />
            <div className="hf-date-sep">至</div>
            <input
              type="date"
              className="hf-input"
              value={draft.endDate}
              onChange={e => setDraft(d => ({ ...d, endDate: e.target.value }))}
            />
          </div>

          {/* 用户名 */}
          <div className="hf-group">
            <div className="hf-label">用户名</div>
            <input
              className="hf-input"
              placeholder="输入用户名"
              value={draft.username}
              onChange={e => setDraft(d => ({ ...d, username: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>

          {/* UID */}
          <div className="hf-group">
            <div className="hf-label">UID</div>
            <input
              className="hf-input"
              placeholder="输入 UID"
              value={draft.uid}
              onChange={e => setDraft(d => ({ ...d, uid: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>

          {/* 弹幕内容 */}
          <div className="hf-group">
            <div className="hf-label">弹幕内容</div>
            <input
              className="hf-input"
              placeholder="关键词"
              value={draft.keyword}
              onChange={e => setDraft(d => ({ ...d, keyword: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>

          {/* Buttons */}
          <div className="hf-actions">
            <button className="hf-btn-reset" onClick={handleReset}>重置</button>
            <button className="hf-btn-search" onClick={handleSearch}>查询</button>
          </div>

          {/* Export button */}
          {canExport && (
            <button className="hf-btn-export" onClick={handleExport}>
              导出 Excel
            </button>
          )}

        </div>

        {/* 设置弹出面板 */}
        {settingsOpen && (
          <div className="hf-settings-popup">
            <div className="dm-settings-group">
              <div className="dm-settings-label">
                弹幕字号
                <span className="dm-settings-value">{(fontSize - 15) / 2 > 0 ? '+' : ''}{(fontSize - 15) / 2}</span>
              </div>
              <input type="range" min="-5" max="5" step="1"
                value={(fontSize - 15) / 2}
                onChange={e => handleFontSize(15 + Number(e.target.value) * 2)}
                className="dm-settings-slider" />
            </div>

            <div className="dm-settings-group">
              <div className="dm-settings-label">SC 显示方式</div>
              <div className="dm-settings-radio-group">
                <label className={`dm-settings-radio${scDisplayMode === 'card' ? ' active' : ''}`}>
                  <input type="radio" name="hx-scMode" value="card"
                    checked={scDisplayMode === 'card'} onChange={() => handleScMode('card')} />
                  <span>卡片</span>
                  <span className="dm-settings-radio-hint">彩色卡片</span>
                </label>
                <label className={`dm-settings-radio${scDisplayMode === 'text' ? ' active' : ''}`}>
                  <input type="radio" name="hx-scMode" value="text"
                    checked={scDisplayMode === 'text'} onChange={() => handleScMode('text')} />
                  <span>文字</span>
                  <span className="dm-settings-radio-hint">紧凑文字行</span>
                </label>
              </div>
            </div>

            <div className="dm-settings-group">
              <div className="dm-settings-label">礼物显示方式</div>
              <div className="dm-settings-radio-group">
                <label className={`dm-settings-radio${giftDisplayMode === 'text' ? ' active' : ''}`}>
                  <input type="radio" name="hx-giftMode" value="text"
                    checked={giftDisplayMode === 'text'} onChange={() => handleGiftMode('text')} />
                  <span>文字</span>
                  <span className="dm-settings-radio-hint">紧凑文字行</span>
                </label>
                <label className={`dm-settings-radio${giftDisplayMode === 'icon' ? ' active' : ''}`}>
                  <input type="radio" name="hx-giftMode" value="icon"
                    checked={giftDisplayMode === 'icon'} onChange={() => handleGiftMode('icon')} />
                  <span>图标</span>
                  <span className="dm-settings-radio-hint">含礼物图标</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 设置按钮（固定在侧边栏左下角）*/}
        <button
          className={`hf-settings-btn${settingsOpen ? ' active' : ''}`}
          onClick={() => setSettingsOpen(v => !v)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          显示设置
        </button>
      </div>

      {/* ── Right main area ── */}
      <div className="history-main">

        {mode === 'placeholder' && (
          <div className="history-placeholder">设置筛选条件后点击查询</div>
        )}

        {mode === 'session' && (
          <>
            <div className="history-topbar">
              <span className="history-session-label">{formatTs(applied.sessionId)}</span>
              <span className="history-stats">
                弹幕 {danmakuList.filter(m => m.type !== 'divider').length}
                {scList.length > 0 && `  SC ${scList.length}`}
                {giftList.length > 0 && `  礼物 ${giftList.length}`}
              </span>
            </div>

            {sessionLoading && <div className="history-loading">加载中...</div>}

            {!sessionLoading && (
              <div className="dm-main">
                <div className="dm-col dm-col-danmaku">
                  <div className="dm-col-header">
                    弹幕
                    <span className="dm-col-count">{filteredDanmaku.length}</span>
                  </div>
                  <div className="dm-list" style={{ fontSize: `${fontSize}px` }}>
                    {filteredDanmaku.length === 0 && (
                      <div className="history-empty">无弹幕</div>
                    )}
                    {filteredDanmaku.map((msg, i) => {
                      const isBanned = bannedUids.has(msg.user?.uid);
                      return (
                        <div key={i} className={`dm-row ${isBanned ? 'dm-row-banned' : ''}`}>
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
                          <span className="dm-content">
                            {renderContent(msg.content, msg.emots)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="dm-col dm-col-sc">
                  <div className="dm-col-header">
                    醒目留言 <span className="dm-col-count">{scList.length}</span>
                  </div>
                  <div className="dm-list" style={{ fontSize: `${fontSize}px` }}>
                    {scList.length === 0 && <div className="history-empty">无 SC</div>}
                    {scList.map((msg, i) => {
                      if (scDisplayMode === 'card') {
                        const colors = getSCColor(msg.price);
                        return (
                          <div key={i} className="dm-sc-row">
                            <div className="dm-sc-header" style={{ background: colors.bg }}>
                              <div className="dm-sc-header-left">
                                {msg.user?.face && (
                                  <img src={msg.user.face} alt="" className="dm-sc-avatar"
                                    referrerPolicy="no-referrer" onError={e => e.target.style.display = 'none'} />
                                )}
                                <span className="dm-sc-user" style={{ color: colors.text }}>
                                  {msg.user?.username}
                                </span>
                              </div>
                              <span className="dm-sc-price" style={{ color: colors.text }}>¥{msg.price}</span>
                            </div>
                            <div className="dm-sc-content" style={{ background: colors.bodyBg, color: '#333' }}>{msg.message}</div>
                          </div>
                        );
                      }
                      return (
                        <div key={i} className="dm-sc-text-row">
                          <span className="dm-time">{formatTime(msg.time || msg.timestamp)}</span>
                          <span className="dm-sc-text-price" style={{ color: getSCColor(msg.price).bg }}>¥{msg.price}</span>
                          <span className="dm-username">{msg.user?.username}</span>
                          <span className="dm-sc-text-msg">{msg.message}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="dm-col dm-col-gift">
                  <div className="dm-col-header">
                    礼物 <span className="dm-col-count">{giftList.length}</span>
                  </div>
                  <div className="dm-list" style={{ fontSize: `${fontSize}px` }}>
                    {giftList.length === 0 && <div className="history-empty">无礼物</div>}
                    {giftList.map((msg, i) => {
                      if (giftDisplayMode === 'icon') {
                        const isGuard = msg.type === 'guard';
                        const iconSrc = isGuard ? GUARD_ICONS[msg.guardLevel] : (msg.giftIconStatic || msg.giftIcon);
                        return (
                          <div key={i} className="dm-gift-icon-row"
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
                      return (
                        <div key={i} className="dm-gift-row"
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
            )}
          </>
        )}

        {mode === 'search' && (
          <div className="history-search-results">
            <div className="history-topbar">
              <span className="history-session-label">跨场次搜索</span>
              {applied.uid && <span className="history-uid-tag">UID: {applied.uid}</span>}
              <span className="history-stats">
                {searchLoading ? '搜索中...' : crossSearchNeedsInput ? '' : `${searchResults.length} 条结果`}
              </span>
            </div>
            <div className="dm-list history-search-list">
              {searchLoading && <div className="history-empty">搜索中...</div>}
              {!searchLoading && crossSearchNeedsInput && (
                <div className="history-empty">跨场次搜索需要填写 UID、用户名或弹幕关键词</div>
              )}
              {!searchLoading && !crossSearchNeedsInput && searchResults.length === 0 && (
                <div className="history-empty">无结果</div>
              )}
              {searchResults.map((msg, i) => (
                <div key={i} className="dm-row">
                  <span className="dm-time">{formatTime(msg.timestamp)}</span>
                  <div className="dm-user" onClick={e => handleUserClick(e, msg.user, msg)}>
                    {msg.user?.face && (
                      <img src={msg.user.face} alt="" className="dm-avatar" referrerPolicy="no-referrer"
                        onError={e => e.target.style.display = 'none'} />
                    )}
                    <span className="dm-username">{msg.user?.username}</span>
                  </div>
                  <span className="dm-content">{renderContent(msg.content, msg.emots)}</span>
                  <span className="history-session-tag">{formatTs(msg.sessionId)}</span>
                </div>
              ))}
              {searchResults.length >= 500 && (
                <div className="history-empty">已显示最多 500 条结果</div>
              )}
            </div>
          </div>
        )}

      </div>

      {selectedUser && (
        <UserActionPopup
          user={selectedUser}
          msg={selectedMsg}
          position={popupPos}
          roomId={roomId}
          onClose={() => { setSelectedUser(null); setSelectedMsg(null); }}
          onBanSuccess={(uid) => setBannedUids(prev => new Set([...prev, uid]))}
          onFilterUser={(uid) => {
            const newDraft = { ...draft, uid: String(uid) };
            setDraft(newDraft);
            setSelectedUser(null);
            runSearch(newDraft);
          }}
          onViewHistory={(uid) => {
            const newDraft = { ...EMPTY_DRAFT, uid: String(uid) };
            setDraft(newDraft);
            setSelectedUser(null);
            runSearch(newDraft);
          }}
        />
      )}
    </div>
  );
}
