// 所有时间显示统一使用北京时间（UTC+8）
// 用 ISO 字符串偏移法，不依赖系统 locale / 时区设置
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

function toCST(ts) {
  const ms = ts > 1e10 ? ts : ts * 1000;
  return new Date(ms + CST_OFFSET_MS);
}

/** "HH:MM:SS" */
export function formatTime(ts) {
  if (!ts) return '';
  return toCST(ts).toISOString().slice(11, 19);
}

/** "YYYY-MM-DD HH:MM:SS" */
export function formatTs(ts) {
  if (!ts) return '';
  return toCST(ts).toISOString().replace('T', ' ').slice(0, 19);
}

/** "YYYY-MM-DD" — 用于文件名等 */
export function formatDateOnly() {
  return toCST(Date.now() / 1000).toISOString().slice(0, 10);
}

/** 将日期筛选框输入（YYYY-MM-DD）解析为 Unix 秒，按北京时间当天 00:00:00 */
export function parseDateStart(dateStr) {
  return Math.floor(new Date(dateStr + 'T00:00:00+08:00').getTime() / 1000);
}

/** 将日期筛选框输入（YYYY-MM-DD）解析为 Unix 秒，按北京时间当天 23:59:59 */
export function parseDateEnd(dateStr) {
  return Math.floor(new Date(dateStr + 'T23:59:59+08:00').getTime() / 1000);
}
