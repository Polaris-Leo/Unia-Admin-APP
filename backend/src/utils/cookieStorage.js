import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';

// 使用 DATA_DIR 环境变量（Electron 模式）或回退到 cwd/data
function getDataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}
function getCookieFile() {
  return path.join(getDataDir(), 'cookies.json');
}

function getCookieManagerUrl() {
  return (process.env.COOKIE_MANAGER_URL || '').replace(/\/$/, '');
}

function fetchCookieFromManager() {
  const COOKIE_MANAGER_URL = getCookieManagerUrl();
  if (!COOKIE_MANAGER_URL) return Promise.resolve(null);

  const uid = (process.env.BILI_COOKIE_UID || '').trim();
  const endpoint = uid
    ? `${COOKIE_MANAGER_URL}/api/accounts/${uid}/cookie`
    : `${COOKIE_MANAGER_URL}/api/accounts/cookie`;

  return new Promise(resolve => {
    const mod = endpoint.startsWith('https') ? https : http;
    const req = mod.get(endpoint, { timeout: 3000 }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data.success && data.data?.cookies ? data.data.cookies : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function ensureDataDir() {
  const d = getDataDir();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

export function saveCookies(cookies) {
  try {
    ensureDataDir();
    fs.writeFileSync(getCookieFile(), JSON.stringify({
      cookies, timestamp: Date.now(), date: new Date().toISOString(),
    }, null, 2));
    console.log('✅ Cookies已保存到本地');
    return true;
  } catch (e) {
    console.error('❌ 保存Cookies失败:', e);
    return false;
  }
}

export function loadLocalCookies() {
  return loadCookiesFromFile();
}

function loadCookiesFromFile() {
  try {
    const f = getCookieFile();
    if (!fs.existsSync(f)) return null;
    const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
    const days = (Date.now() - data.timestamp) / 86400000;
    if (days > 30) return null;
    return data.cookies;
  } catch { return null; }
}

export async function loadCookies() {
  if (getCookieManagerUrl()) {
    const remote = await fetchCookieFromManager();
    if (remote) return remote;
  }
  return loadCookiesFromFile();
}

export async function loadCookiesWithSource() {
  if (getCookieManagerUrl()) {
    const remote = await fetchCookieFromManager();
    if (remote) return { cookies: remote, source: 'remote' };
  }
  const local = loadCookiesFromFile();
  return { cookies: local, source: local ? 'local' : null };
}

export function clearCookies() {
  try {
    const f = getCookieFile();
    if (fs.existsSync(f)) fs.unlinkSync(f);
    return true;
  } catch { return false; }
}

export function getCookieString(cookies) {
  if (!cookies) return '';
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}
