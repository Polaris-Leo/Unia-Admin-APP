import fs from 'fs';
import path from 'path';
import readline from 'readline';

const DATA_DIR = path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'history');

/**
 * 确保目录存在
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 获取会话目录
 */
function getSessionDir(roomId, sessionId) {
  return path.join(DATA_DIR, String(roomId), String(sessionId));
}

/**
 * 获取指定房间的所有历史会话列表
 * @param {string|number} roomId 
 * @returns {Promise<Array>} 会话ID(时间戳)列表，按时间倒序排列
 */
export async function getSessions(roomId) {
  const roomDir = path.join(DATA_DIR, String(roomId));
  if (!fs.existsSync(roomDir)) {
    return [];
  }

  try {
    const files = await fs.promises.readdir(roomDir);
    // 过滤出数字命名的文件夹（时间戳）
    const sessions = files
      .filter(file => /^\d+$/.test(file) && fs.statSync(path.join(roomDir, file)).isDirectory())
      .map(file => parseInt(file, 10))
      .sort((a, b) => b - a); // 倒序排列

    return sessions;
  } catch (error) {
    console.error(`[History] Failed to get sessions for room ${roomId}:`, error);
    return [];
  }
}

/**
 * 保存消息到历史记录 (追加模式)
 * @param {string|number} roomId 直播间ID
 * @param {string|number} sessionId 会话ID (通常是开播时间戳)
 * @param {string} type 消息类型 (danmaku, superchat, gift, guard)
 * @param {object} data 消息数据
 */
export function saveMessage(roomId, sessionId, type, data) {
  if (!roomId || !sessionId) return;

  const sessionDir = getSessionDir(roomId, sessionId);
  ensureDir(sessionDir);

  const filePath = path.join(sessionDir, `${type}.jsonl`);
  const line = JSON.stringify(data) + '\n';

  fs.appendFile(filePath, line, (err) => {
    if (err) {
      console.error(`[History] Failed to save ${type} message:`, err);
    }
  });
}

/**
 * 加载会话历史记录
 * @param {string|number} roomId 直播间ID
 * @param {string|number} sessionId 会话ID
 * @returns {Promise<object>} 包含各类消息数组的对象
 */
export async function loadHistory(roomId, sessionId) {
  if (!roomId || !sessionId) return null;

  const sessionDir = getSessionDir(roomId, sessionId);
  if (!fs.existsSync(sessionDir)) return null;

  const history = {
    danmaku: [],
    superchat: [],
    gift: [],
    guard: []
  };

  const types = ['danmaku', 'superchat', 'gift', 'guard'];

  await Promise.all(types.map(async (type) => {
    const filePath = path.join(sessionDir, `${type}.jsonl`);
    if (fs.existsSync(filePath)) {
      try {
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });

        const seen = new Set();

        for await (const line of rl) {
          if (line.trim()) {
            try {
              const item = JSON.parse(line);
              
              // 生成唯一指纹用于去重
              let fingerprint = '';
              if (type === 'danmaku') {
                // 弹幕：时间戳 + 用户UID + 内容
                fingerprint = `${item.timestamp}-${item.user?.uid}-${item.content}`;
              } else if (type === 'gift') {
                // 礼物：时间戳 + 用户UID + 礼物ID + 数量 + 价格
                fingerprint = `${item.timestamp}-${item.user?.uid}-${item.giftId}-${item.num}-${item.price}`;
              } else if (type === 'superchat') {
                // SC：时间 + 用户UID + 价格
                fingerprint = `${item.time}-${item.user?.uid}-${item.price}`;
              } else if (type === 'guard') {
                // 上舰：时间戳 + 用户UID + 等级
                fingerprint = `${item.timestamp}-${item.user?.uid}-${item.guardLevel}`;
              } else {
                // 其他：直接序列化
                fingerprint = JSON.stringify(item);
              }

              if (!seen.has(fingerprint)) {
                seen.add(fingerprint);
                history[type].push(item);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      } catch (err) {
        console.error(`[History] Failed to load ${type} history:`, err);
      }
    }
  }));

  return history;
}

/**
 * 加载当前会话最近 N 条弹幕 + 全部 SC / 礼物（已废弃，保留兼容）
 */
export async function loadRecentHistory(roomId, sessionId, danmakuLimit = 100) {
  const data = await loadSessionChunk(roomId, sessionId, 0, danmakuLimit, true);
  if (!data) return null;
  return { danmaku: data.danmaku, superchat: data.superchat, gift: data.gift };
}

/**
 * 分块加载当前会话弹幕，首块同时返回 SC / 礼物
 * @param {string|number} roomId
 * @param {string|number} sessionId
 * @param {number} offset  起始行号（0-based）
 * @param {number} limit   最多返回条数
 * @param {boolean} fromTail 为 true 时 offset 从末尾算（兼容旧逻辑）
 */
export async function loadSessionChunk(roomId, sessionId, offset = 0, limit = 300, fromTail = false) {
  if (!roomId || !sessionId) return null;
  const sessionDir = getSessionDir(roomId, sessionId);
  if (!fs.existsSync(sessionDir)) return null;

  const readJsonl = async (filename) => {
    const fp = path.join(sessionDir, filename);
    if (!fs.existsSync(fp)) return [];
    const content = await fs.promises.readFile(fp, 'utf-8');
    return content.split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  };

  const danmakuAll = await readJsonl('danmaku.jsonl');
  const total = danmakuAll.length;

  const realOffset = fromTail ? Math.max(0, total - limit) : offset;
  const chunk = danmakuAll.slice(realOffset, realOffset + limit);

  const result = { danmaku: chunk, total };

  if (offset === 0) {
    const [superchat, gift] = await Promise.all([
      readJsonl('superchat.jsonl'),
      readJsonl('gift.jsonl'),
    ]);
    result.superchat = superchat;
    result.gift = gift;
  } else {
    result.superchat = [];
    result.gift = [];
  }

  return result;
}

/**
 * 获取最新的会话ID
 */
export async function getLastSessionId(roomId) {
  const sessions = await getSessions(roomId);
  return sessions.length > 0 ? sessions[0] : null;
}

/**
 * 移动误入上一场会话的数据到当前会话
 * @param {string|number} roomId 房间号
 * @param {string|number} oldSessionId 上一场会话ID
 * @param {string|number} newSessionId 当前会话ID (作为时间戳阈值)
 */
export async function moveStrayData(roomId, oldSessionId, newSessionId) {
  if (!oldSessionId || !newSessionId || oldSessionId === newSessionId) return;
  
  const oldDir = getSessionDir(roomId, oldSessionId);
  const newDir = getSessionDir(roomId, newSessionId);
  
  if (!fs.existsSync(oldDir)) return;
  ensureDir(newDir);

  const files = ['danmaku.jsonl', 'gift.jsonl', 'guard.jsonl', 'superchat.jsonl'];
  let movedCount = 0;

  for (const file of files) {
    const oldFilePath = path.join(oldDir, file);
    const newFilePath = path.join(newDir, file);
    
    if (!fs.existsSync(oldFilePath)) continue;

    try {
      const content = await fs.promises.readFile(oldFilePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      const keepLines = [];
      const moveLines = [];
      const moveItems = [];

      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          // 兼容不同类型的 timestamp 字段
          const ts = Number(item.timestamp || item.time || 0);
          // 归一化为秒 (如果是毫秒则转换)
          const normalizedTs = ts > 10000000000 ? Math.floor(ts / 1000) : ts;
          const threshold = Number(newSessionId);
          const normalizedThreshold = threshold > 10000000000 ? Math.floor(threshold / 1000) : threshold;

          if (normalizedTs >= normalizedThreshold) {
            moveLines.push(line);
            moveItems.push(item);
          } else {
            keepLines.push(line);
          }
        } catch (e) {
          keepLines.push(line); // 解析失败的保留
        }
      }

      if (moveLines.length > 0) {
        // 1. 重写旧文件
        await fs.promises.writeFile(oldFilePath, keepLines.join('\n') + (keepLines.length > 0 ? '\n' : ''));
        
        // 2. 读取新文件现有内容 (如果存在)
        let existingItems = [];
        if (fs.existsSync(newFilePath)) {
          const newContent = await fs.promises.readFile(newFilePath, 'utf-8');
          const newLines = newContent.split('\n').filter(l => l.trim());
          existingItems = newLines.map(l => {
             try { return JSON.parse(l); } catch(e) { return null; }
          }).filter(Boolean);
        }

        // 3. 合并并排序
        const allItems = [...existingItems, ...moveItems].sort((a, b) => {
           const tsA = Number(a.timestamp || a.time || 0);
           const tsB = Number(b.timestamp || b.time || 0);
           return tsA - tsB;
        });

        // 4. 写入新文件
        const newContent = allItems.map(item => JSON.stringify(item)).join('\n') + '\n';
        await fs.promises.writeFile(newFilePath, newContent);
        
        movedCount += moveLines.length;
        console.log(`[History] Moved ${moveLines.length} items from ${oldSessionId} to ${newSessionId} in ${file}`);
      }
    } catch (error) {
      console.error(`[History] Failed to move data for ${file}:`, error);
    }
  }
  
  if (movedCount > 0) {
    console.log(`✅ 成功从 ${oldSessionId} 迁移了 ${movedCount} 条数据到 ${newSessionId}`);
  }
}

/**
 * 对指定会话的所有数据文件进行按时间戳排序
 */
export async function sortSessionFiles(roomId, sessionId) {
    const sessionDir = getSessionDir(roomId, sessionId);
    if (!fs.existsSync(sessionDir)) return;

    const files = ['danmaku.jsonl', 'gift.jsonl', 'guard.jsonl', 'superchat.jsonl'];
    
    for (const file of files) {
        const filePath = path.join(sessionDir, file);
        if (!fs.existsSync(filePath)) continue;

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            if (lines.length === 0) continue;

            const items = lines.map(line => {
                try { return JSON.parse(line); } catch (e) { return null; }
            }).filter(Boolean);

            // 排序
            items.sort((a, b) => {
                const tsA = Number(a.timestamp || a.time || 0);
                const tsB = Number(b.timestamp || b.time || 0);
                return tsA - tsB;
            });

            const newContent = items.map(item => JSON.stringify(item)).join('\n') + '\n';
            await fs.promises.writeFile(filePath, newContent);
        } catch (e) {
            console.error(`Failed to sort ${filePath}:`, e);
        }
    }
}

/**
 * 修复所有重叠的会话数据
 * 遍历所有场次，将属于下一场（或更晚）的数据移动到正确的文件夹
 */
export async function repairOverlappingSessions() {
    console.log('🔧 开始检查并修复重叠的直播场次...');
    if (!fs.existsSync(DATA_DIR)) return;

    try {
        const rooms = await fs.promises.readdir(DATA_DIR);
        for (const roomId of rooms) {
            const roomDir = path.join(DATA_DIR, roomId);
            const stats = await fs.promises.stat(roomDir);
            if (!stats.isDirectory()) continue;

            // 获取所有场次ID，按时间正序排列
            const sessions = (await fs.promises.readdir(roomDir))
                .filter(f => /^\d+$/.test(f))
                .map(Number)
                .sort((a, b) => a - b);

            // 遍历每一对相邻的场次
            for (let i = 0; i < sessions.length - 1; i++) {
                const currentSession = sessions[i];
                const nextSession = sessions[i + 1];
                
                // 将 currentSession 中所有时间戳 >= nextSession 的数据移动到 nextSession
                await moveStrayData(roomId, currentSession, nextSession);
            }
        }
        console.log('✅ 重叠场次修复完成');
    } catch (error) {
        console.error('修复重叠场次失败:', error);
    }
}

/**
 * 整理所有历史数据的顺序
 */
export async function sortAllHistory() {
    console.log('🧹 开始整理历史数据顺序...');
    if (!fs.existsSync(DATA_DIR)) return;
    
    try {
        const rooms = await fs.promises.readdir(DATA_DIR);
        for (const roomId of rooms) {
            const roomDir = path.join(DATA_DIR, roomId);
            const stats = await fs.promises.stat(roomDir);
            if (!stats.isDirectory()) continue;
            
            const sessions = await fs.promises.readdir(roomDir);
            for (const sessionId of sessions) {
                 if (/^\d+$/.test(sessionId)) {
                     await sortSessionFiles(roomId, sessionId);
                 }
            }
        }
        console.log('✨ 历史数据整理完成');
    } catch (error) {
        console.error('整理历史数据失败:', error);
    }
}
