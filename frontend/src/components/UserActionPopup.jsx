import { useState, useEffect, useRef } from 'react';
import { silentUser, unsilentUser, getUserTags, addUserTag, deleteUserTag, getBanList } from '../services/api';
import { formatTs } from '../utils/timeUtils';
import './UserActionPopup.css';

const HOUR_OPTIONS = [
  { label: '本场', value: 0 },
  { label: '1小时', value: 1 },
  { label: '12小时', value: 12 },
  { label: '永久', value: -1 },
];

export default function UserActionPopup({
  user, msg, position, roomId, onClose, onBanSuccess, onFilterUser, onViewHistory
}) {
  const popupRef = useRef(null);
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [newNote, setNewNote] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [banStatus, setBanStatus] = useState(null);
  const [toast, setToast] = useState('');
  const [nameCopied, setNameCopied] = useState(false);
  const [uidCopied, setUidCopied] = useState(false);
  const [banning, setBanning] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    getUserTags(user.uid).then(r => setTags(r.data)).catch(() => {});
    if (roomId) {
      getBanList(roomId).then(r => {
        const found = r.data?.data?.find(b => String(b.tuid) === String(user.uid));
        setBanStatus(found || null);
      }).catch(() => {});
    }
  }, [user?.uid, roomId]);

  useEffect(() => {
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const showToast = (text) => {
    setToast(text);
    setTimeout(() => setToast(''), 2500);
  };

  const handleBan = async (hours) => {
    if (banning) return;
    setBanning(true);
    try {
      await silentUser({
        roomId,
        uid: user.uid,
        username: user.username,
        content: msg?.content || '',
        hours
      });
      const label = hours === -1 ? '永久' : hours === 0 ? '本场' : `${hours}小时`;
      showToast(`已禁言 ${user.username} (${label})`);
      onBanSuccess?.(user.uid);
      setBanStatus({ tuid: user.uid });
    } catch (e) {
      showToast(e.response?.data?.error || '禁言失败');
    } finally {
      setBanning(false);
    }
  };

  const handleUnban = async () => {
    if (!banStatus?.id) { showToast('无可用禁言记录 ID'); return; }
    try {
      await unsilentUser({ roomId, banId: banStatus.id });
      showToast('已解除禁言');
      setBanStatus(null);
    } catch (e) {
      showToast(e.response?.data?.error || '解禁失败');
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim() && !newNote.trim()) return;
    try {
      const res = await addUserTag(user.uid, {
        tag: newTag.trim() || null,
        note: newNote.trim() || null,
        targetName: user.username
      });
      setTags(prev => [...prev, { id: res.data.id, tag: newTag.trim() || null, note: newNote.trim() || null }]);
      setNewTag('');
      setNewNote('');
      setShowTagInput(false);
      setShowNoteInput(false);
    } catch {}
  };

  const handleDeleteTag = async (tagId) => {
    await deleteUserTag(tagId);
    setTags(prev => prev.filter(t => t.id !== tagId));
  };

  const copyName = () => {
    navigator.clipboard.writeText(user.username);
    setNameCopied(true);
    setTimeout(() => setNameCopied(false), 2000);
  };

  const copyUid = () => {
    navigator.clipboard.writeText(String(user.uid));
    setUidCopied(true);
    setTimeout(() => setUidCopied(false), 2000);
  };

  if (!user) return null;

  const style = { top: position.y, left: position.x };

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup" style={style} ref={popupRef} onClick={e => e.stopPropagation()}>
        {toast && <div className="popup-toast">{toast}</div>}

        {/* Header */}
        <div className="popup-header">
          <img
            src={user.face || 'https://i0.hdslb.com/bfs/face/member/noface.jpg'}
            alt="" className="popup-avatar"
            referrerPolicy="no-referrer"
            onError={e => e.target.src = 'https://i0.hdslb.com/bfs/face/member/noface.jpg'}
          />
          <div className="popup-info">
            <div className="popup-name-row">
              <a href={`https://space.bilibili.com/${user.uid}`} target="_blank" rel="noopener noreferrer" className="popup-name">
                {user.username}
              </a>
              <button className="popup-copy-btn" onClick={copyName}>{nameCopied ? '✓' : '复制'}</button>
            </div>
            <div className="popup-uid-row" onClick={copyUid}>
              <span className="popup-uid">UID: {user.uid}</span>
              <span className="popup-copy-tiny">{uidCopied ? '✓' : '复制'}</span>
            </div>
            {msg?.timestamp && (
              <div className="popup-time">
                {formatTs(msg.timestamp)}
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="popup-section">
          <div className="popup-tags-row">
            {tags.filter(t => t.tag).map(t => (
              <span key={t.id} className="popup-tag">
                {t.tag}
                <button className="popup-tag-del" onClick={() => handleDeleteTag(t.id)}>×</button>
              </span>
            ))}
            <button className="popup-tag-add" onClick={() => setShowTagInput(v => !v)}>+ 标签</button>
            <button className="popup-tag-add" onClick={() => setShowNoteInput(v => !v)}>+ 备注</button>
          </div>
          {tags.filter(t => t.note).map(t => (
            <div key={t.id} className="popup-note">
              {t.note}
              <button className="popup-tag-del" onClick={() => handleDeleteTag(t.id)}>×</button>
            </div>
          ))}
          {showTagInput && (
            <div className="popup-tag-input-row">
              <input
                className="popup-input" placeholder="标签名"
                value={newTag} onChange={e => setNewTag(e.target.value)}
                autoFocus
              />
              <button className="popup-tag-add" onClick={handleAddTag}>添加</button>
            </div>
          )}
          {showNoteInput && (
            <div className="popup-tag-input-row">
              <input
                className="popup-input" placeholder="备注内容"
                value={newNote} onChange={e => setNewNote(e.target.value)}
              />
              <button className="popup-tag-add" onClick={handleAddTag}>保存</button>
            </div>
          )}
        </div>

        <div className="popup-separator" />

        {/* Ban actions */}
        <div className="popup-section">
          <div className="popup-section-label">禁言</div>
          <div className="popup-ban-row">
            {HOUR_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className="popup-ban-btn"
                onClick={() => handleBan(opt.value)}
                disabled={banning}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {banStatus && (
            <button className="popup-unban-btn" onClick={handleUnban}>✓ 解除禁言</button>
          )}
        </div>

        <div className="popup-separator" />

        {/* Other actions */}
        <div className="popup-section popup-actions">
          <button className="popup-action-item" onClick={() => onViewHistory?.(user.uid)}>
            查看历史弹幕
          </button>
          <button className="popup-action-item" onClick={() => onFilterUser?.(user.uid)}>
            筛选该用户
          </button>
          <button
            className="popup-action-item"
            onClick={() => {
              const url = `https://space.bilibili.com/${user.uid}`;
              if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
              else window.open(url, '_blank', 'noopener,noreferrer');
            }}
          >
            跳转 B 站空间
          </button>
        </div>
      </div>
    </div>
  );
}
