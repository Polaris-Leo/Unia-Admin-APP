import { useState, useEffect } from 'react';
import { getBanLogs, unsilentUser } from '../services/api';
import { formatTs } from '../utils/timeUtils';
import './BanLogPage.css';

const BAN_HOUR_LABEL = (h) => h === -1 ? '永久' : h === 0 ? '本场' : `${h}小时`;

export default function BanLogPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ modUsername: '', targetUid: '', targetName: '' });

  const pageSize = 50;

  const fetchLogs = async (p = page) => {
    setLoading(true);
    try {
      const params = { page: p, pageSize, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v.trim())) };
      const res = await getBanLogs(params);
      setRows(res.data.rows);
      setTotal(res.data.total);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchLogs(1); }, []);

  const handleSearch = () => { setPage(1); fetchLogs(1); };

  const handleUnban = async (row) => {
    if (!row.bilibili_ban_id) { alert('无可用禁言记录 ID'); return; }
    try {
      await unsilentUser({ roomId: row.room_id, banId: row.bilibili_ban_id, logId: row.id });
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, unsilenced_at: Date.now() } : r));
    } catch (e) {
      alert(e.response?.data?.error || '解禁失败');
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="banlog-page">
      <div className="banlog-header">
        <span className="banlog-title">禁言日志</span>
        <span className="banlog-total">共 {total} 条记录</span>
        <div className="banlog-filters">
          <input
            className="banlog-input" placeholder="房管用户名"
            value={filters.modUsername}
            onChange={e => setFilters(f => ({ ...f, modUsername: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <input
            className="banlog-input" placeholder="被禁用户UID"
            value={filters.targetUid}
            onChange={e => setFilters(f => ({ ...f, targetUid: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <input
            className="banlog-input" placeholder="被禁用户名"
            value={filters.targetName}
            onChange={e => setFilters(f => ({ ...f, targetName: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button className="banlog-search-btn" onClick={handleSearch}>搜索</button>
        </div>
      </div>

      <div className="banlog-table-wrap">
        <table className="banlog-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>房管</th>
              <th>被禁用户UID</th>
              <th>被禁用户名</th>
              <th>触发弹幕</th>
              <th>时长</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="banlog-loading">加载中...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="banlog-loading">暂无记录</td></tr>
            )}
            {rows.map(row => (
              <tr key={row.id} className={row.unsilenced_at ? 'banlog-row-unsilenced' : ''}>
                <td className="banlog-time">{formatTs(row.created_at)}</td>
                <td>{row.mod_name}</td>
                <td>
                  <button className="banlog-user-link" onClick={() => {
                    const url = `https://space.bilibili.com/${row.target_uid}`;
                    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
                    else window.open(url, '_blank', 'noopener,noreferrer');
                  }}>
                    {row.target_uid}
                  </button>
                </td>
                <td>{row.target_name}</td>
                <td className="banlog-content">{row.trigger_content || '—'}</td>
                <td>
                  <span className={`banlog-hours ${row.ban_hours === -1 ? 'banlog-hours-perm' : ''}`}>
                    {BAN_HOUR_LABEL(row.ban_hours)}
                  </span>
                </td>
                <td>
                  {row.unsilenced_at
                    ? <span className="banlog-unsilenced-tag">已解禁</span>
                    : <button className="banlog-unban-btn" onClick={() => handleUnban(row)}>解禁</button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="banlog-pagination">
          <button disabled={page <= 1} onClick={() => { setPage(p => p - 1); fetchLogs(page - 1); }}>上一页</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { setPage(p => p + 1); fetchLogs(page + 1); }}>下一页</button>
        </div>
      )}
    </div>
  );
}
