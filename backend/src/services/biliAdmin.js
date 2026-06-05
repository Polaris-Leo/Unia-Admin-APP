import axios from 'axios';
import { loadCookies, getCookieString } from '../utils/cookieStorage.js';

async function getHeaders() {
  const cookies = await loadCookies();
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': getCookieString(cookies || {}),
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://live.bilibili.com'
  };
}

async function getCsrf() {
  const cookies = await loadCookies();
  return cookies?.bili_jct || '';
}

export async function addSilentUser({ roomId, tuid, hours, msg = '' }) {
  const [headers, csrf] = await Promise.all([getHeaders(), getCsrf()]);
  const params = new URLSearchParams({
    room_id: String(roomId),
    tuid: String(tuid),
    msg,
    mobile_app: 'web',
    hour: String(hours),
    csrf_token: csrf,
    csrf,
    visit_id: ''
  });
  const res = await axios.post(
    'https://api.live.bilibili.com/xlive/web-ucenter/v1/banned/AddSilentUser',
    params.toString(),
    { headers }
  );
  if (res.data.code !== 0) throw new Error(res.data.message || '禁言失败');
  return res.data;
}

export async function delSilentUser({ roomId, banId }) {
  const [headers, csrf] = await Promise.all([getHeaders(), getCsrf()]);
  const params = new URLSearchParams({
    roomid: String(roomId),
    id: String(banId),
    csrf_token: csrf,
    csrf,
    visit_id: ''
  });
  const res = await axios.post(
    'https://api.live.bilibili.com/banned_service/v1/Silent/del_room_block_user',
    params.toString(),
    { headers }
  );
  if (res.data.code !== 0) throw new Error(res.data.message || '解禁失败');
  return res.data;
}

export async function getSilentUserList({ roomId, page = 1 }) {
  const [headers, csrf] = await Promise.all([getHeaders(), getCsrf()]);
  const params = new URLSearchParams({
    room_id: String(roomId),
    ps: String(page),
    csrf_token: csrf,
    csrf,
    visit_id: ''
  });
  const res = await axios.post(
    'https://api.live.bilibili.com/xlive/web-ucenter/v1/banned/GetSilentUserList',
    params.toString(),
    { headers }
  );
  if (res.data.code !== 0) throw new Error(res.data.message || '获取禁言列表失败');
  return res.data.data;
}
