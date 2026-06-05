'use strict';

// ── 常量 ──────────────────────────────────────────────────────────────────
const MAX_MSGS = 200;
const GUARD_LABELS = { 1: '总督', 2: '提督', 3: '舰长' };
const GUARD_COLORS = { 1: '#ff7b7b', 2: '#7b9cff', 3: '#7bccff' };

// ── 状态 ──────────────────────────────────────────────────────────────────
let config     = {};
let token      = null;
let ws         = null;
let roomId     = null;
let messages   = [];
let autoScroll = true;
let unread     = 0;
let reconnectTimer = null;
let activeBanPopup = null;
let pinned = true;

// ── DOM 快捷引用 ──────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const loginView    = $('login-view');
const mainView     = $('main-view');
const serverInput  = $('server-input');
const usernameInput = $('username-input');
const passwordInput = $('password-input');
const loginError   = $('login-error');
const loginBtn     = $('login-btn');
const connDot      = $('conn-status');
const msgCount     = $('msg-count');
const msgList      = $('msg-list');
const newMsgBtn    = $('new-msg-btn');
const settingsPanel = $('settings-panel');
const opacitySlider = $('opacity-slider');
const opacityLabel  = $('opacity-label');
const fontSizeSlider = $('font-size-slider');
const fontSizeLabel  = $('font-size-label');

// ── 初始化 ────────────────────────────────────────────────────────────────
async function init() {
  config = await window.electronAPI.loadConfig();

  applyTheme(config.dark !== false);
  applyOpacity(config.bgOpacity ?? 0.85);
  applyFontSize(config.fontSize ?? 14);

  if (config.serverUrl && config.token) {
    token = config.token;
    showMain();
    fetchRoomId().then(connectWS);
  } else {
    showLogin();
  }
}

// ── 视图切换 ──────────────────────────────────────────────────────────────
function showLogin() {
  loginView.classList.remove('hidden');
  mainView.classList.add('hidden');
  if (config.serverUrl) serverInput.value = config.serverUrl;
  if (config.username)  usernameInput.value = config.username;
}

function showMain() {
  loginView.classList.add('hidden');
  mainView.classList.remove('hidden');
}

// ── 登录 ──────────────────────────────────────────────────────────────────
async function login() {
  const serverUrl = serverInput.value.trim().replace(/\/$/, '');
  const username  = usernameInput.value.trim();
  const password  = passwordInput.value;
  if (!serverUrl || !username || !password) {
    loginError.textContent = '请填写所有字段';
    return;
  }
  loginError.textContent = '';
  loginBtn.disabled = true;
  loginBtn.textContent = '连接中...';

  try {
    const res = await fetch(`${serverUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '登录失败');

    token  = data.token;
    config = { ...config, serverUrl, username, token };
    await window.electronAPI.saveConfig(config);

    showMain();
    await fetchRoomId();
    connectWS();
  } catch (e) {
    loginError.textContent = e.message;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = '连接';
  }
}

// ── 获取当前房间号 ─────────────────────────────────────────────────────────
async function fetchRoomId() {
  try {
    const res = await fetch(`${config.serverUrl}/api/danmaku/rooms`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.roomId) { roomId = data.roomId; config.roomId = data.roomId; }
  } catch {}
}

// ── WebSocket ─────────────────────────────────────────────────────────────
function connectWS() {
  clearTimeout(reconnectTimer);
  if (ws) { ws.onclose = null; ws.onerror = null; ws.close(); ws = null; }

  const wsBase = (config.serverUrl || '')
    .replace(/^https/, 'wss')
    .replace(/^http/, 'ws');

  ws = new WebSocket(`${wsBase}/ws/danmaku?token=${encodeURIComponent(token)}`);

  ws.onopen = () => {
    connDot.className = 'conn-dot connected';
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'danmaku') addMessage(msg);
      if (msg.type === 'room_info' && msg.roomId) { roomId = msg.roomId; config.roomId = msg.roomId; }
    } catch {}
  };

  ws.onclose = (evt) => {
    connDot.className = 'conn-dot disconnected';
    ws = null;
    if (evt.code === 4001) {
      token = null;
      config.token = null;
      window.electronAPI.saveConfig(config);
      showLogin();
      loginError.textContent = '会话已过期，请重新登录';
    } else {
      reconnectTimer = setTimeout(connectWS, 3000);
    }
  };

  ws.onerror = () => {};
}

// ── 消息渲染 ──────────────────────────────────────────────────────────────
function addMessage(msg) {
  messages.push(msg);
  if (messages.length > MAX_MSGS) {
    messages = messages.slice(-MAX_MSGS);
    rebuildList();
    return;
  }
  msgList.appendChild(createRow(msg));
  msgCount.textContent = `${messages.length} 条`;
  if (autoScroll) {
    msgList.scrollTop = msgList.scrollHeight;
  } else {
    unread++;
    updateNewMsgBtn();
  }
}

function rebuildList() {
  msgList.innerHTML = '';
  for (const msg of messages) msgList.appendChild(createRow(msg));
  msgCount.textContent = `${messages.length} 条`;
  if (autoScroll) msgList.scrollTop = msgList.scrollHeight;
}

function createRow(msg) {
  if (msg.type === 'divider') {
    const d = document.createElement('div');
    d.className = 'dm-divider';
    d.textContent = msg.content;
    return d;
  }

  const row = document.createElement('div');
  row.className = 'dm-row';

  // 时间
  const t = document.createElement('span');
  t.className = 'dm-time';
  t.textContent = formatTime(msg.timestamp);
  row.appendChild(t);

  // 用户
  const userEl = document.createElement('div');
  userEl.className = 'dm-user';

  if (msg.user?.guardLevel > 0) {
    const badge = document.createElement('span');
    badge.className = 'dm-guard';
    badge.textContent = GUARD_LABELS[msg.user.guardLevel] || '';
    badge.style.background = GUARD_COLORS[msg.user.guardLevel] || '';
    userEl.appendChild(badge);
  }

  const nameEl = document.createElement('span');
  nameEl.className = 'dm-username';
  nameEl.textContent = msg.user?.username || '';
  nameEl.addEventListener('click', (e) => {
    e.stopPropagation();
    showBanPopup(e, msg.user, msg);
  });
  userEl.appendChild(nameEl);
  row.appendChild(userEl);

  // 内容
  const content = document.createElement('span');
  content.className = 'dm-content';
  renderContent(content, msg.content, msg.emots);
  row.appendChild(content);

  return row;
}

function renderContent(el, content, emots) {
  if (!content) return;
  if (!emots || Object.keys(emots).length === 0) {
    el.textContent = content;
    return;
  }
  const parts = content.split(/(\[+[^\]]+\]+)/);
  for (const part of parts) {
    const emot = (part.startsWith('[') && part.endsWith(']')) ? emots[part] : null;
    if (emot?.url) {
      const img = document.createElement('img');
      img.src = emot.url;
      img.alt = part;
      img.title = part;
      img.referrerPolicy = 'no-referrer';
      img.className = (Number(emot.height) <= 30) ? 'dm-emote' : 'dm-emote dm-emote-big';
      el.appendChild(img);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  }
}

function formatTime(ts) {
  const d = new Date((ts || 0) * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── 禁言弹出窗口 ──────────────────────────────────────────────────────────
function showBanPopup(e, user, msg) {
  closeBanPopup();

  const popup = document.createElement('div');
  popup.className = 'ban-popup';

  // 用户信息头
  const header = document.createElement('div');
  header.className = 'ban-popup-header';

  const avatar = document.createElement('img');
  avatar.className = 'ban-popup-avatar';
  avatar.src = user?.face || 'https://i0.hdslb.com/bfs/face/member/noface.jpg';
  avatar.referrerPolicy = 'no-referrer';
  avatar.onerror = () => { avatar.src = 'https://i0.hdslb.com/bfs/face/member/noface.jpg'; };

  const info = document.createElement('div');
  info.className = 'ban-popup-info';
  const nameDiv = document.createElement('div');
  nameDiv.className = 'ban-popup-name';
  nameDiv.textContent = user?.username || '';
  const uidDiv = document.createElement('div');
  uidDiv.className = 'ban-popup-uid';
  uidDiv.textContent = `UID: ${user?.uid || ''}`;
  info.appendChild(nameDiv);
  info.appendChild(uidDiv);

  header.appendChild(avatar);
  header.appendChild(info);
  popup.appendChild(header);

  // 分隔线
  const sep = document.createElement('div');
  sep.className = 'ban-popup-sep';
  popup.appendChild(sep);

  // 禁言标签
  const label = document.createElement('div');
  label.className = 'ban-popup-label';
  label.textContent = '禁言';
  popup.appendChild(label);

  // 禁言按钮
  const btns = document.createElement('div');
  btns.className = 'ban-popup-btns';
  [{ label: '本场', hours: 0 }, { label: '1小时', hours: 1 }, { label: '12小时', hours: 12 }, { label: '永久', hours: -1 }]
    .forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'ban-btn';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => doBan(user, msg, opt.hours, popup));
      btns.appendChild(btn);
    });
  popup.appendChild(btns);

  // Toast
  const toast = document.createElement('div');
  toast.className = 'ban-toast hidden';
  popup.appendChild(toast);

  document.body.appendChild(popup);
  activeBanPopup = popup;

  // 定位
  const rect = e.currentTarget.getBoundingClientRect();
  const pw = 240, ph = 150;
  let x = rect.left, y = rect.bottom + 6;
  if (x + pw > window.innerWidth)  x = window.innerWidth - pw - 8;
  if (y + ph > window.innerHeight) y = Math.max(8, rect.top - ph - 6);
  popup.style.left = `${x}px`;
  popup.style.top  = `${y}px`;
}

function closeBanPopup() {
  if (activeBanPopup) { activeBanPopup.remove(); activeBanPopup = null; }
}

async function doBan(user, msg, hours, popup) {
  const toast = popup.querySelector('.ban-toast');
  const btns = popup.querySelectorAll('.ban-btn');
  btns.forEach(b => b.disabled = true);

  if (!roomId) {
    await fetchRoomId();
    if (!roomId) { showToast(toast, '未获取到房间号，请稍后重试'); btns.forEach(b => b.disabled = false); return; }
  }

  try {
    const res = await fetch(`${config.serverUrl}/api/ban/silent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ roomId, uid: user.uid, username: user.username, content: msg?.content || '', hours }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '禁言失败');
    const lbl = hours === -1 ? '永久' : hours === 0 ? '本场' : `${hours}小时`;
    showToast(toast, `已禁言 ${user.username} (${lbl})`);
    setTimeout(() => closeBanPopup(), 1500);
  } catch (err) {
    showToast(toast, err.message);
    btns.forEach(b => b.disabled = false);
  }
}

function showToast(el, text) {
  el.textContent = text;
  el.classList.remove('hidden');
}

// ── 滚动处理 ──────────────────────────────────────────────────────────────
msgList.addEventListener('scroll', () => {
  const el = msgList;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  autoScroll = atBottom;
  if (atBottom) { unread = 0; updateNewMsgBtn(); }
});

function updateNewMsgBtn() {
  if (!autoScroll && unread > 0) {
    newMsgBtn.textContent = `↓ ${unread} 条新消息`;
    newMsgBtn.classList.remove('hidden');
  } else {
    newMsgBtn.classList.add('hidden');
  }
}

newMsgBtn.addEventListener('click', () => {
  msgList.scrollTop = msgList.scrollHeight;
  autoScroll = true;
  unread = 0;
  updateNewMsgBtn();
});

// ── 关闭弹窗（点击外部） ──────────────────────────────────────────────────
document.addEventListener('click', (e) => {
  if (activeBanPopup && !activeBanPopup.contains(e.target)) closeBanPopup();
});

// ── 设置 ──────────────────────────────────────────────────────────────────
$('settings-btn').addEventListener('click', () => settingsPanel.classList.toggle('open'));

opacitySlider.addEventListener('input', (e) => {
  const v = Number(e.target.value);
  applyOpacity(v);
  config.bgOpacity = v;
  window.electronAPI.saveConfig(config);
});

fontSizeSlider.addEventListener('input', (e) => {
  const v = Number(e.target.value);
  applyFontSize(v);
  config.fontSize = v;
  window.electronAPI.saveConfig(config);
});

$('theme-btn').addEventListener('click', () => {
  const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
  applyTheme(dark);
  config.dark = dark;
  window.electronAPI.saveConfig(config);
});

$('pin-btn').addEventListener('click', () => {
  pinned = !pinned;
  window.electronAPI.toggleAlwaysOnTop(pinned);
  $('pin-btn').classList.toggle('active', pinned);
});

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  $('theme-btn').textContent = dark ? '☽' : '☀';
}

function applyOpacity(v) {
  document.documentElement.style.setProperty('--bg-alpha', v);
  opacitySlider.value = v;
  opacityLabel.textContent = `${Math.round(v * 100)}%`;
}

function applyFontSize(v) {
  document.documentElement.style.setProperty('--font-size', `${v}px`);
  fontSizeSlider.value = v;
  fontSizeLabel.textContent = `${v}px`;
}

// ── 窗口控件 ──────────────────────────────────────────────────────────────
$('lv-close').addEventListener('click', () => window.electronAPI.closeWindow());
$('lv-minimize').addEventListener('click', () => window.electronAPI.minimizeWindow());
$('mv-close').addEventListener('click', () => window.electronAPI.closeWindow());
$('mv-minimize').addEventListener('click', () => window.electronAPI.minimizeWindow());

$('logout-btn').addEventListener('click', () => {
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  clearTimeout(reconnectTimer);
  token = null;
  config.token = null;
  window.electronAPI.saveConfig(config);
  messages = [];
  msgList.innerHTML = '';
  msgCount.textContent = '0 条';
  showLogin();
});

// ── 登录事件 ──────────────────────────────────────────────────────────────
loginBtn.addEventListener('click', login);
passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

// ── 启动 ──────────────────────────────────────────────────────────────────
init();
