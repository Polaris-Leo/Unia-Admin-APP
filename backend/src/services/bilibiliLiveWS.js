import WebSocket from 'ws';
import axios from 'axios';
import pako from 'pako';
import zlib from 'zlib';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getCookieString } from '../utils/cookieStorage.js';
import { saveMessage, getLastSessionId, moveStrayData } from '../utils/historyStorage.js';

// B站官方标准小表情白名单（emoji-wrap 全包 + emotion-wrap 公共包），其余均为大表情
const SMALL_EMOTE_HASHES = new Set([
  // emoji-wrap 标准颜文字包
  '4428c84e694fbf4e0ef6c06e958d9352c3582740',
  '7dd2ef03e13998575e4d8a803c6e12909f94e72b',
  '08f735d950a0fba267dda140673c9ab2edf6410d',
  '650c3e22c06edcbca9756365754d38952fc019c3',
  '1daaa5d284dafaa16c51409447da851ff1ec557f',
  'b159f90431148a973824f596288e7ad6a8db014b',
  '4255ce6ed5d15b60311728a803d03dd9a24366b2',
  '69312e99a00d1db2de34ef2db9220c5686643a3f',
  'a7feb260bb5b15f97d7119b444fc698e82516b9f',
  '4e029593562283f00d39b99e0557878c4199c71d',
  '2dd666d3651bafe8683acf770b7f4163a5f49809',
  '8624fd172037573c8600b2597e3731ef0e5ea983',
  'ffb53c252b085d042173379ac724694ce3196194',
  'c5436c6806c32b28d471bb23d42f0f8f164a187a',
  'e6073c6849f735ae6cb7af3a20ff7dcec962b4c5',
  'b51824125d09923a4ca064f0c0b49fc97d3fab79',
  'e2ba16f947a23179cdc00420b71cc1d627d8ae25',
  'e2589d086df0db8a7b5ca2b1273c02d31d4433d4',
  '9c75761c5b6e1ff59b29577deb8e6ad996b86bd7',
  'b5b44f099059a1bafb2c2722cfe9a6f62c1dc531',
  '492b10d03545b7863919033db7d1ae3ef342df2f',
  'c6bed64ffb78c97c93a83fbd22f6fdf951400f31',
  'a4df45c035b0ca0c58f162b5fb5058cf273d0d09',
  'bc26f29f62340091737c82109b8b91f32e6675ad',
  '84c92239591e5ece0f986c75a39050a5c61c803c',
  'b6226219384befa5da1d437cb2ff4ba06c303844',
  '5935e6a4103d024955f749d428311f39e120a58a',
  '204413d3cf330e122230dcc99d29056f2a60e6f2',
  'a2ad0cc7e390a303f6d243821479452d31902a5f',
  'bb8e95fa54512ffea07023ea4f2abee4a163e7a0',
  '2b6b4cc33be42c3257dc1f6ef3a39d666b6b4b1a',
  'f4ed20a70d0cb85a22c0c59c628aedfe30566b37',
  '84fe12ecde5d3875e1090d83ac9027cb7d7fba9f',
  '98fd92c6115b0d305f544b209c78ec322e4bb4ff',
  'b804118a1bdb8f3bec67d9b108d5ade6e3aa93a9',
  '86268b09e35fbe4215815a28ef3cf25ec71c124f',
  'f605dd8229fa0115e57d2f16cb019da28545452b',
  '05ef7849e7313e9c32887df922613a7c1ad27f12',
  '8b99266ea7b9e86cf9d25c3d1151d80c5ba5c9a1',
  '17435e60dcc28ce306762103a2a646046ff10b0a',
  'a91a27f83c38b5576f4cd08d4e11a2880de78918',
  '8d436de0c3701d87e4ca9c1be01c01b199ac198e',
  'c409425ba1ad2c6534f0df7de350ba83a9c949e5',
  '4781a77be9c8f0d4658274eb4e3012c47a159f23',
  '6e496946725cd66e7ff1b53021bf1cc0fc240288',
  '8e88e6a137463703e96d4f27629f878efa323456',
  'bea1f0497888f3e9056d3ce14ba452885a485c02',
  '10662d9c0d6ddb3203ecf50e77788b959d4d1928',
  'a0c456b6d9e3187399327828a9783901323bfdb5',
  '57dee478868ed9f1ce3cf25a36bc50bde489c404',
  '0d5123cddf389302df6f605087189fd10919dc3c',
  'f408e2af700adcc2baeca15510ef620bed8d4c43',
  '7fa907ae85fa6327a0466e123aee1ac32d7c85f7',
  'd581d0bc30c8f9712b46ec02303579840c72c42d',
  '816402551e6ce30d08b37a917f76dea8851fe529',
  '179c7e2d232cd74f30b672e12fc728f8f62be9ec',
  'b00e2e02904096377061ec5f93bf0dd3321f1964',
  '2c69dad2e5c0f72f01b92746bc9d148aee1993b2',
  'fbc3c8bc4152a65bbf4a9fd5a5d27710fbff2119',
  'd8ce9b05c0e40cec61a15ba1979c8517edd270bf',
  'a51af0d7d9e60ce24f139c468a3853f9ba9bb184',
  'f547cc853cf43e70f1e39095d9b3b5ac1bf70a8d',
  'b6e8131897a9a718ee280f2510bfa92f1d84429b',
  'fd35718ac5a278fd05fe5287ebd41de40a59259d',
  '5e01c237642c8b662a69e21b8e0fbe6e7dbc2aa1',
  '5776481e380648c0fb3d4ad6173475f69f1ce149',
  'abddb0b621b389fc8c2322b1cfcf122d8936ba91',
  '4f2155b108047d60c1fa9dccdc4d7abba18379a0',
  '1e0a2baf088a34d56e2cc226b2de36a5f8d6c926',
  '6df760280b17a6cbac8c1874d357298f982ba4cf',
  '0a1ab3f0f2f2e29de35c702ac1ecfec7f90e325d',
  '98f842994035505c728e32e32045d649e371ecd6',
  '23ae12d3a71b9d7a22c8773343969fcbb94b20d0',
  '29533893115c4609a4af336f49060ea13173ca78',
  '5d86d55ba9a2f99856b523d8311cf75cfdcccdbc',
  '607f74ccf5eec7d2b17d91b9bb36be61a5dd196b',
  '3b2fedf09b0ac79679b5a47f5eb3e8a38e702387',
  '5e61223561203c50340b4c9b41ba7e4b05e48ae2',
  '241b13adb4933e38b7ea6f5204e0648725e76fbf',
  '3f170894dd08827ee293afcb5a3d2b60aecdb5b1',
  'd1ba5f4c54332a21ed2ca0dcecaedd2add587839',
  'eb2d84ba623e2335a48f73fb5bef87bcf53c1239',
  // emotion-wrap 公共直播间表情包
  'cbf2746062242e77bdcb9eb08edbf9b151fe0c2e',
  'dea7fbbc1c3d3c80f4c7b27263e13460f21874e4',
  '38d84a4cd2f40069202ee13bbdca5b23d29710fb',
  'a69423be39b0f2a87dc74f2e44ead70de0eb0d4f',
  '650399e68d0d93df4b3f9e95e7437e83be7fbb1a',
  '2ce08b31618d3ad0d34877bf949ef0089a0438b7',
  '82c38fc930ae764b4c6215f544bf8e1dba73b51c',
  'fa3febe6c62f3bcd042953141930d96fb8451e60',
  'b3495aaa935b045bfc2e1d52738ea7b124e0d552',
  'c3cfa182d16564301d39e4c7e4c186dfb9fabf96',
  'bbd9045570d0c022a984c637e406cb0e1f208aa9',
  '7b7a2567ad1520f962ee226df777eaf3ca368fbc',
  '39e518474a3673c35245bf6ef8ebfff2c003fdc3',
  'e91cbe30b2db1e624bd964ad1f949661501f42f8',
  'aa93b9af7ba03b50df23b64e9afd0d271955cd71',
  '1d4c71243548a1241f422e90cd8ba2b75c282f6b',
  '38cf68c25d9ff5d364468a062fc79571db942ff3',
  '8fedede4028a72e71dae31270eedff5f706f7d18',
  'a98e35996545509188fe4d24bd1a56518ea5af48',
  'fa1eb4dce3ad198bb8650499830560886ce1116c',
  '4609dad97c0dfa61f8da0b52ab6fff98e0cf1e58',
  '328e93ce9304090f4035e3aa7ef031d015bbc915',
  'b371151503978177b237afb85185b0f5431d0106',
  '7251dc7df587388a3933743bf38394d12a922cd7',
  '6a644577437d0bd8a314990dd8ccbec0f3b30c92',
  '18af5576a4582535a3c828c3ae46a7855d9c6070',
  '0e28444c8e2faef3169e98e1a41c487144d877d4',
  '1ba5126b10e5efe3e4e29509d033a37f128beab2',
  '7db4188c050f55ec59a1629fbc5a53661e4ba780',
  '08f1aebaa4d9c170aa79cbafe521ef0891bdf2b5',
  '61e790813c51eab55ebe0699df1e9834c90b68ba',
  '88b49dac03bfd5d4cb49672956f78beb2ebd0d0b',
  '343f7f7e87fa8a07df63f9cba6b776196d9066f0',
  '625989e78079e3dc38d75cb9ac392fe8c1aa4a75',
  'c2650bf9bbc79b682a4b67b24df067fdd3e5e9ca',
  'cc2652cef69b22117f1911391567bd2957f27e08',
  'eff44c1fc03311573e8817ca8010aca72404f65c',
  '83d5b9cdaaa820c2756c013031d34dac1fd4156b',
]);

function isSmallEmote(url) {
  if (!url) return false;
  const m = url.match(/\/([0-9a-f]{40})\.png/i);
  return m ? SMALL_EMOTE_HASHES.has(m[1]) : false;
}

/**
 * B站直播间弹幕WebSocket客户端
 */
export class BilibiliLiveWS {
  constructor(roomId, cookies = null) {
    this.roomId = roomId;
    this.cookies = cookies;
    this.ws = null;
    this.heartbeatTimer = null;
    this.isConnected = false;
    this.authInfo = null;
    this.userFaceCache = new Map();  // 用户头像URL缓存
    this.faceCacheFile = path.join(process.cwd(), 'data', 'face-cache.json');
    this.loadFaceCache();  // 加载持久化缓存

    this.emoteCache = new Map(); // 表情包缓存
    this.emoteCacheFile = path.join(process.cwd(), 'data', 'emote-cache.json');
    this.loadEmoteCache();

    this.giftCache = new Map(); // 礼物缓存
    this.giftCacheFile = path.join(process.cwd(), 'data', 'gift-cache.json');
    this.loadGiftCache();

    this.isRateLimited = false;  // 是否处于限速状态
    this.rateLimitTime = null;   // 限速触发时间
    this.rateLimitCD = 5 * 60 * 1000;  // CD时间：5分钟
    this._intentionalDisconnect = false; // 是否为主动断开（防止误触重连）
    
    this.currentSessionId = null; // 当前直播场次ID (开播时间戳)
    this.lastSessionId = null;    // 上一次直播场次ID
    this.lastSessionEndTime = 0;  // 上一次直播结束(或最后活跃)时间
    this.sessionTimeout = 15 * 60 * 1000; // 会话延续阈值：15分钟
    this.isLive = false;          // 当前是否在直播

    // 事件回调
    this.onDanmaku = null;      // 弹幕消息
    this.onGift = null;          // 礼物消息
    this.onGuard = null;         // 上舰消息
    this.onWelcome = null;       // 欢迎消息
    this.onSuperChat = null;     // SC醒目留言
    this.onLike = null;          // 点赞消息
    this.onWatched = null;       // 看过人数
    this.onRankCount = null;     // 高能榜人数
    this.onRoomInfo = null;      // 直播间信息（主播名、舰长数等）
    this.onEntry = null;         // 进场特效
    this.onPopularity = null;    // 人气值
    this.onLiveStatus = null;    // 直播状态变化
    this.onError = null;         // 错误
    this.onConnect = null;       // 连接成功
    this.onClose = null;         // 连接关闭
    this.onAuthError = null;     // Cookie失效/认证错误回调
    this.buvid = '';             // buvid3 cookie（新版认证包需要）
    this._wbiKey = '';           // WBI签名密钥缓存
    this._wbiKeyExpiry = 0;      // WBI密钥过期时间
    this.anchorId = null;        // 主播UID
  }

  /**
   * 更新Cookie（登录后或Cookie管理器刷新后调用）
   */
  updateCookies(newCookies) {
    this.cookies = newCookies;
    this.buvid = newCookies?.buvid3 || this.buvid || '';
    console.log('🍪 Cookie已更新');
  }

  /**
   * 获取直播间详细信息（包含开播状态和时间）
   */
  async getLiveStatus() {
    try {
      // 使用 room_init 接口获取更准确的信息（包括开播时间戳）
      const response = await axios.get('https://api.live.bilibili.com/room/v1/Room/room_init', {
        params: { id: this.roomId },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.data.code === 0) {
        const data = response.data.data;
        this.anchorId = data.uid; // 保存主播UID
        this.roomId = data.room_id; // 更新为真实房间号
        
        // 更新当前会话ID
        if (data.live_status === 1) {
          this.isLive = true;
          const newSessionId = data.live_time;
          const now = Date.now();
          const prevSessionId = this.currentSessionId; // 记录变更前的会话，用于判断是否需要插入开始分界线

          // 尝试从磁盘恢复 lastSessionId (如果内存中没有)
          if (!this.lastSessionId) {
             const lastDiskSession = await getLastSessionId(this.roomId);
             if (lastDiskSession) {
                // 只有当磁盘上的最新会话不是当前会话时，才将其视为上一场
                if (String(lastDiskSession) !== String(newSessionId)) {
                    this.lastSessionId = lastDiskSession;
                }
             }
          }

          // 检查是否可以延续上一场直播 (断流重连逻辑)
          if (this.lastSessionId && this.lastSessionEndTime > 0 && (now - this.lastSessionEndTime < this.sessionTimeout)) {
            console.log(`🔄 延续上一场直播会话: ${this.lastSessionId} (间隔: ${Math.floor((now - this.lastSessionEndTime)/1000)}秒)`);
            this.currentSessionId = this.lastSessionId;
          } else {
            // 新的直播场次
            if (this.lastSessionId && String(this.lastSessionId) !== String(newSessionId)) {
                console.log(`检测到新场次 ${newSessionId}，正在检查上一场 ${this.lastSessionId} 是否有残留数据...`);
                await moveStrayData(this.roomId, this.lastSessionId, newSessionId);
            }

            this.currentSessionId = newSessionId;
            this.lastSessionId = newSessionId;
          }

          // 更新最后活跃时间
          this.lastSessionEndTime = now;
        } else {
          this.isLive = false;
          // 下播状态下，不重置 currentSessionId，以便记录下播后的弹幕
          // this.currentSessionId = null;
        }

        return {
          liveStatus: data.live_status, // 1: 直播中, 0: 未开播, 2: 轮播
          liveStartTime: data.live_time, // Unix时间戳
          title: '' // room_init 不返回标题，如果需要标题可能需要另外获取，但这里主要为了状态和时间
        };
      }
    } catch (error) {
      console.error('获取直播状态失败:', error.message);
    }
    return null;
  }

  /**
   * 获取高能榜人数 (API方式)
   */
  async getRankCount() {
    if (!this.anchorId) {
      await this.getLiveStatus(); // 尝试获取主播ID
    }
    
    if (!this.anchorId) return null;

    try {
      const response = await axios.get('https://api.live.bilibili.com/xlive/general-interface/v1/rank/getOnlineGoldRank', {
        params: { 
          roomId: this.roomId,
          ruid: this.anchorId,
          page: 1,
          pageSize: 1
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.data.code === 0 && response.data.data) {
        return {
          type: 'rank_count',
          count: response.data.data.onlineNum
        };
      }
    } catch (error) {
      console.error('获取高能榜人数失败:', error.message);
    }
    return null;
  }

  /**
   * 获取直播间综合信息（主播名、舰长数、粉丝团数等）
   */
  async getRoomInfo() {
    if (!this.roomId) return null;

    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      // 添加Cookie以获取完整权限
      if (this.cookies) {
        const cookieStr = getCookieString(this.cookies);
        headers['Cookie'] = cookieStr;
      }

      const response = await axios.get('https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom', {
        params: { room_id: this.roomId },
        headers
      });

      if (response.data.code === 0) {
        const data = response.data.data;
        const anchorInfo = data.anchor_info?.base_info || {};
        const guardInfo = data.guard_info || {};
        const medalInfo = data.anchor_info?.medal_info || {};
        
        let faceUrl = anchorInfo.face || '';
        if (faceUrl && faceUrl.startsWith('http://')) {
          faceUrl = faceUrl.replace('http://', 'https://');
        }

        console.log(`[RoomInfo] Fetched for ${this.roomId}: ${anchorInfo.uname}, Face: ${faceUrl}`);

        // 尝试获取粉丝团人数
        const fansClubCount = medalInfo.fansclub || 0;
        const followerCount = data.anchor_info?.relation_info?.attention || 0;

        return {
          anchorName: anchorInfo.uname || '未知主播',
          anchorFace: faceUrl,
          guardCount: guardInfo.count || 0,
          fansClubCount: fansClubCount,
          followerCount: followerCount,
          watchedCount: data.room_info?.online || 0
        };
      }
    } catch (error) {
      console.error('获取直播间信息失败:', error.message);
    }
    return null;
  }

  /**
   * 加载持久化的头像缓存
   */
  loadFaceCache() {
    try {
      if (fs.existsSync(this.faceCacheFile)) {
        const data = JSON.parse(fs.readFileSync(this.faceCacheFile, 'utf-8'));
        this.userFaceCache = new Map(Object.entries(data));
        console.log(`📦 已加载 ${this.userFaceCache.size} 个头像缓存`);
      }
    } catch (error) {
      console.log('⚠️  加载头像缓存失败:', error.message);
    }
  }

  /**
   * 保存头像缓存到文件
   */
  saveFaceCache() {
    try {
      const dir = path.dirname(this.faceCacheFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Object.fromEntries(this.userFaceCache);
      fs.writeFileSync(this.faceCacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.log('⚠️  保存头像缓存失败:', error.message);
    }
  }

  /**
   * 加载表情包缓存
   */
  loadEmoteCache() {
    try {
      if (fs.existsSync(this.emoteCacheFile)) {
        const data = JSON.parse(fs.readFileSync(this.emoteCacheFile, 'utf-8'));
        this.emoteCache = new Map(Object.entries(data));
        console.log(`📦 已加载 ${this.emoteCache.size} 个表情缓存`);
      }
    } catch (error) {
      console.log('⚠️  加载表情缓存失败:', error.message);
    }
  }

  /**
   * 保存表情包缓存
   */
  saveEmoteCache() {
    try {
      const dir = path.dirname(this.emoteCacheFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Object.fromEntries(this.emoteCache);
      fs.writeFileSync(this.emoteCacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.log('⚠️  保存表情缓存失败:', error.message);
    }
  }

  /**
   * 加载礼物缓存
   */
  loadGiftCache() {
    try {
      if (fs.existsSync(this.giftCacheFile)) {
        const data = JSON.parse(fs.readFileSync(this.giftCacheFile, 'utf-8'));
        this.giftCache = new Map(Object.entries(data));
        console.log(`📦 已加载 ${this.giftCache.size} 个礼物缓存`);
      }
    } catch (error) {
      console.log('⚠️  加载礼物缓存失败:', error.message);
    }
  }

  /**
   * 保存礼物缓存
   */
  saveGiftCache() {
    try {
      const dir = path.dirname(this.giftCacheFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Object.fromEntries(this.giftCache);
      fs.writeFileSync(this.giftCacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.log('⚠️  保存礼物缓存失败:', error.message);
    }
  }

  /**
   * 获取用户头像URL
   * @param {number} uid 用户UID
   * @param {boolean} shouldWait 是否等待网络请求（如果缓存未命中）
   */
  async getUserFace(uid, shouldWait = false) {
    // 检查缓存
    if (this.userFaceCache.has(uid)) {
      let faceUrl = this.userFaceCache.get(uid);
      // Ensure HTTPS from cache
      if (faceUrl && faceUrl.startsWith('http://')) {
        faceUrl = faceUrl.replace('http://', 'https://');
      }
      return faceUrl;
    }

    const defaultFace = 'https://i0.hdslb.com/bfs/face/member/noface.jpg';

    if (shouldWait) {
      // 如果需要等待（如上舰消息），则直接请求API
      const faceUrl = await this._fetchUserFaceFromApi(uid);
      return faceUrl || defaultFace;
    } else {
      // 否则返回默认头像，后台异步获取真实头像
      this.fetchUserFaceInBackground(uid);
      return defaultFace;
    }
  }

  /**
   * 后台异步获取用户头像（带延迟）
   */
  async fetchUserFaceInBackground(uid) {
    // 添加随机延迟，避免频率限制（1-3秒）
    const delay = 1000 + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, delay));
    await this._fetchUserFaceFromApi(uid);
  }

  /**
   * 从API获取用户头像（内部方法）
   */
  async _fetchUserFaceFromApi(uid) {
    console.log(`🔍 获取头像: uid=${uid}`);
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.bilibili.com'
    };
    
    if (this.cookies) {
      headers['Cookie'] = getCookieString(this.cookies);
    }

    let candidateFace = null;

    // Helper to check if face is valid (not default noface)
    const isRealFace = (url) => {
      return url && !url.includes('noface') && !url.includes('akari.jpg');
    };

    // 1. 优先尝试直播 API (live_user/v1/Master/info)
    try {
      const response = await axios.get('https://api.live.bilibili.com/live_user/v1/Master/info', {
        params: { uid: uid },
        headers,
        timeout: 3000 // Fast timeout
      });

      if (response.data.code === 0 && response.data.data && response.data.data.info && response.data.data.info.face) {
        const face = response.data.data.info.face;
        if (isRealFace(face)) {
           return this._processAndCacheFace(uid, face);
        }
        candidateFace = face; // Keep as backup
      }
    } catch (error) {
      console.log(`⚠️ 直播API获取头像失败(${uid}): ${error.message}`);
    }

    // 2. 尝试主站 API (x/space/acc/info)
    try {
      const response = await axios.get('https://api.bilibili.com/x/space/acc/info', {
        params: { mid: uid },
        headers,
        timeout: 3000
      });

      if (response.data.code === 0 && response.data.data && response.data.data.face) {
        const face = response.data.data.face;
        if (isRealFace(face)) {
           return this._processAndCacheFace(uid, face);
        }
        if (!candidateFace) candidateFace = face;
      }
    } catch (error) {
      console.log(`⚠️ 主站API获取头像失败(${uid}): ${error.message}`);
    }

    // 3. 尝试 Web Interface Card API (x/web-interface/card)
    try {
      const response = await axios.get('https://api.bilibili.com/x/web-interface/card', {
        params: { mid: uid },
        headers,
        timeout: 3000
      });

      if (response.data.code === 0 && response.data.data && response.data.data.card && response.data.data.card.face) {
        const face = response.data.data.card.face;
        if (isRealFace(face)) {
           return this._processAndCacheFace(uid, face);
        }
        if (!candidateFace) candidateFace = face;
      }
    } catch (error) {
      console.log(`⚠️ Card API获取头像失败(${uid}): ${error.message}`);
    }

    // If we found a candidate (even if it's noface), use it
    if (candidateFace) {
        return this._processAndCacheFace(uid, candidateFace);
    }

    console.log(`❌ 所有途径获取头像失败(${uid})`);
    return null;
  }

  _processAndCacheFace(uid, faceUrl) {
      if (faceUrl && faceUrl.startsWith('http://')) {
          faceUrl = faceUrl.replace('http://', 'https://');
      }
      this.userFaceCache.set(uid, faceUrl);
      this.saveFaceCache();
      console.log(`✅ 获取头像成功: uid=${uid}`);
      return faceUrl;
  }

  /**
   * 连接直播间
   */
  async connect() {
    // 如果已有连接，先断开（标记为主动断开，防止触发重连）
    if (this.ws) {
      console.log('⚠️ 检测到已有连接，正在断开...');
      this._intentionalDisconnect = true;
      this.disconnect();
    }
    this._intentionalDisconnect = false; // 重置标志，新连接关闭时才允许触发重连

    try {
      // 1. 获取真实房间号
      const realRoomId = await this.getRealRoomId();
      this.roomId = realRoomId;
      console.log(`🏠 真实房间号: ${realRoomId}`);

      // 2. 获取 buvid（如果还没有）
      if (!this.buvid) {
        await this.initBuvid();
      }

      // 3. 获取认证信息（新接口 + WBI签名）
      this.authInfo = await this.getDanmuInfo();
      
      // 4. 选择服务器
      const host = this.authInfo.host_list[0];
      const wsUrl = `wss://${host.host}:${host.wss_port}/sub`;
      
      console.log(`🔌 正在连接直播间 ${this.roomId}...`);

      // 5. 建立WebSocket连接
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';
      
      this.ws.onopen = () => this.onOpen();
      this.ws.onmessage = (event) => this.onMessage(event);
      this.ws.onerror = (error) => this.handleError(error);
      this.ws.onclose = () => this.handleClose();
      
    } catch (error) {
      console.error('❌ 连接失败:', error);
      if (error.isAuthError && this.onAuthError) {
        this.onAuthError(error);
      } else if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * 获取真实房间号
   */
  async getRealRoomId() {
    const url = 'https://api.live.bilibili.com/room/v1/Room/room_init';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    const response = await axios.get(url, {
      params: { id: this.roomId },
      headers
    });
    
    if (response.data.code !== 0) {
      throw new Error(`获取房间信息失败: ${response.data.message || '未知错误'}`);
    }
    
    const data = response.data.data;
    this.anchorId = data.uid; // 保存主播UID
    return data.room_id;
  }

  /**
   * 获取 buvid（访问 bilibili.com 主站，让服务器种下 buvid3 cookie）
   */
  async initBuvid() {
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };
      if (this.cookies) {
        headers['Cookie'] = getCookieString(this.cookies);
      }
      const response = await axios.get('https://www.bilibili.com/', { headers, timeout: 5000 });
      // 从 Set-Cookie 头提取 buvid3
      const setCookies = response.headers['set-cookie'] || [];
      for (const c of setCookies) {
        const m = c.match(/buvid3=([^;]+)/);
        if (m) {
          this.buvid = m[1];
          console.log('🍪 已获取 buvid3');
          return;
        }
      }
      // 如果 cookie 中已有 buvid3，直接用
      if (this.cookies && this.cookies.buvid3) {
        this.buvid = this.cookies.buvid3;
      }
    } catch (e) {
      console.log('⚠️  获取 buvid3 失败:', e.message);
    }
  }

  /**
   * 获取 WBI 签名密钥（有效期约12小时，会自动缓存）
   */
  async getWbiKey() {
    const now = Date.now();
    if (this._wbiKey && now < this._wbiKeyExpiry) {
      return this._wbiKey;
    }
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };
      if (this.cookies) {
        headers['Cookie'] = getCookieString(this.cookies);
      }
      const response = await axios.get('https://api.bilibili.com/x/web-interface/nav', { headers, timeout: 5000 });
      const wbiImg = response.data?.data?.wbi_img;
      if (!wbiImg) throw new Error('wbi_img not found');

      const imgKey = wbiImg.img_url.split('/').pop().split('.')[0];
      const subKey = wbiImg.sub_url.split('/').pop().split('.')[0];
      const shuffled = imgKey + subKey;
      const KEY_INDEX = [
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
        27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13
      ];
      this._wbiKey = KEY_INDEX.map(i => shuffled[i] || '').join('');
      this._wbiKeyExpiry = now + 11.5 * 60 * 60 * 1000; // 缓存11.5小时
      console.log('🔑 WBI密钥已更新');
      return this._wbiKey;
    } catch (e) {
      console.log('⚠️  获取WBI密钥失败:', e.message);
      return '';
    }
  }

  /**
   * 对参数进行 WBI 签名
   */
  async addWbiSign(params) {
    const wbiKey = await this.getWbiKey();
    if (!wbiKey) return params;

    const wts = String(Math.floor(Date.now() / 1000));
    const paramsToSign = { ...params, wts };
    const sorted = Object.keys(paramsToSign).sort().reduce((acc, k) => {
      // 过滤特殊字符
      acc[k] = String(paramsToSign[k]).replace(/[!'()*]/g, '');
      return acc;
    }, {});
    const query = new URLSearchParams(sorted).toString();
    const wRid = crypto.createHash('md5').update(query + wbiKey).digest('hex');
    return { ...params, wts, w_rid: wRid };
  }

  /**
   * 获取弹幕服务器信息（新版接口 + WBI签名）
   */
  async getDanmuInfo() {
    const url = 'https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `https://live.bilibili.com/${this.roomId}`,
      'Origin': 'https://live.bilibili.com'
    };

    if (this.cookies) {
      const cookieStr = getCookieString(this.cookies);
      headers['Cookie'] = cookieStr;
      console.log('🍪 使用Cookie请求弹幕服务器信息');
      console.log('   - SESSDATA:', this.cookies.SESSDATA ? '✅ 存在' : '❌ 缺失');
      console.log('   - DedeUserID:', this.cookies.DedeUserID || '❌ 缺失');
      console.log('   - bili_jct:', this.cookies.bili_jct ? '✅ 存在' : '❌ 缺失');
    } else {
      console.log('⚠️  未使用Cookie，将以游客身份连接，用户信息将被脱敏！');
    }

    const params = await this.addWbiSign({ id: this.roomId, type: 0 });

    const response = await axios.get(url, { params, headers, timeout: 8000 });

    if (response.data.code !== 0) {
      const code = response.data.code;
      const err = new Error(`获取弹幕服务器信息失败: ${code} - ${response.data.message || response.data.msg || '未知错误'}`);
      // -101: 账号未登录; -400: 请求错误(通常是cookie问题); -403: 无权限
      if (code === -101 || code === -400 || code === -403) {
        err.isAuthError = true;
      }
      throw err;
    }

    const data = response.data.data;
    return {
      token: data.token,
      host_list: data.host_list || []
    };
  }

  /**
   * WebSocket连接成功
   */
  onOpen() {
    console.log('✅ WebSocket连接成功');
    this.isConnected = true;
    
    // 发送认证包
    this.sendAuth();
    
    // 启动心跳
    this.startHeartbeat();
    
    if (this.onConnect) this.onConnect();
  }

  /**
   * 发送认证包
   */
  sendAuth() {
    // 从Cookie中提取uid
    let uid = 0;
    if (this.cookies && this.cookies.DedeUserID) {
      uid = parseInt(this.cookies.DedeUserID) || 0;
    }
    
    if (uid === 0) {
      console.log('⚠️  使用游客身份 (uid=0) 连接，用户信息将被*** 隐藏！');
      console.log('   原因: Cookie中缺少 DedeUserID 字段');
      console.log('   解决: 请确保已正确登录并保存Cookie');
    } else {
      console.log('🔑 认证信息 - UID:', uid, '房间:', this.roomId);
    }
    
    const authData = {
      uid: uid,  // 使用真实uid或游客身份
      roomid: this.roomId,
      protover: 3,  // 使用brotli压缩
      platform: 'web',
      type: 2,
      key: this.authInfo.token,
      ...(this.buvid ? { buvid: this.buvid } : {})
    };
    
    const authStr = JSON.stringify(authData);
    const packet = this.createPacket(authStr, 7);
    this.ws.send(packet);
    
    console.log('📤 已发送认证包');
  }

  /**
   * 创建数据包
   */
  createPacket(data, operation) {
    const body = typeof data === 'string' ? Buffer.from(data) : data;
    const header = Buffer.alloc(16);
    
    header.writeUInt32BE(header.length + body.length, 0); // 总长度
    header.writeUInt16BE(16, 4);                          // 头部长度
    header.writeUInt16BE(1, 6);                           // 协议版本
    header.writeUInt32BE(operation, 8);                   // 操作码
    header.writeUInt32BE(1, 12);                          // sequence
    
    return Buffer.concat([header, body]);
  }

  /**
   * 启动心跳
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        // 心跳包发送空Buffer
        const packet = this.createPacket(Buffer.alloc(0), 2);
        this.ws.send(packet);

        // 如果当前正在直播，更新最后活跃时间
        if (this.isLive && this.currentSessionId) {
          this.lastSessionEndTime = Date.now();
        }
      }
    }, 30000); // 30秒一次
  }

  /**
   * 处理WebSocket消息
   */
  async onMessage(event) {
    const buffer = Buffer.from(event.data);
    await this.parsePacket(buffer);
  }

  /**
   * 解析数据包
   */
  async parsePacket(buffer, depth = 0) {
    let offset = 0;
    const indent = '  '.repeat(depth);
    
    while (offset < buffer.length) {
      const remaining = buffer.length - offset;
      
      // 如果剩余数据不足16字节（包头大小）
      if (remaining < 16) {
        if (remaining > 0) {
          console.log(`${indent}⚠️  剩余 ${remaining} 字节 (不足16字节包头)`);
          // 输出剩余字节的十六进制，帮助调试
          console.log(`${indent}   剩余数据(hex):`, buffer.slice(offset, offset + remaining).toString('hex'));
        }
        break;
      }
      
      const packLen = buffer.readUInt32BE(offset);
      const headerLen = buffer.readUInt16BE(offset + 4);
      const ver = buffer.readUInt16BE(offset + 6);
      const op = buffer.readUInt32BE(offset + 8);
      
      // 验证包长度的合理性
      if (packLen < 16) {
        console.log(`${indent}⚠️  包长度过小: ${packLen} (最小应为16)`);
        console.log(`${indent}   包头(hex):`, buffer.slice(offset, offset + 16).toString('hex'));
        break;
      }
      
      if (packLen > remaining) {
        console.log(`${indent}⚠️  包长度 ${packLen} 超出剩余数据 ${remaining}`);
        console.log(`${indent}   这可能表示数据包跨越了边界或数据损坏`);
        break;
      }
      
      // 验证headerLen的合理性
      if (headerLen < 16 || headerLen > packLen) {
        console.log(`${indent}⚠️  无效的包头长度: ${headerLen} (包长: ${packLen})`);
        break;
      }
      
      const body = buffer.slice(offset + headerLen, offset + packLen);
      
      // 处理不同操作码
      switch (op) {
        case 3: // 心跳回复(人气值)
          if (body.length >= 4) {
            const popularity = body.readUInt32BE(0);
            console.log(`${indent}💓 心跳回复 - 人气值:`, popularity);
            if (this.onPopularity) this.onPopularity(popularity);
          }
          break;
          
        case 5: // 普通消息
          console.log(`${indent}📦 收到消息包 - 版本: ${ver}, 长度: ${body.length}, 包总长: ${packLen}`);
          await this.handleMessage(body, ver, depth);
          break;
          
        case 8: // 认证回复
          const authReply = JSON.parse(body.toString());
          if (authReply.code === 0) {
            console.log(`${indent}✅ 认证成功`);
          }
          break;
          
        default:
          console.log(`${indent}⚠️  未知操作码: ${op}, 包长度: ${packLen}`);
          break;
      }
      
      offset += packLen;
    }
  }

  /**
   * 处理消息
   */
  async handleMessage(body, ver, depth = 0) {
    const indent = '  '.repeat(depth);
    
    // 根据协议版本解压
    if (ver === 2) {
      // zlib压缩
      try {
        console.log(`${indent}🗜️  解压 zlib 数据 (原始: ${body.length} 字节)...`);
        const unzipped = pako.inflate(body);
        console.log(`${indent}   解压后: ${unzipped.length} 字节`);
        await this.parsePacket(Buffer.from(unzipped), depth + 1);
        return;
      } catch (e) {
        console.error(`${indent}❌ zlib解压失败:`, e.message);
        return;
      }
    } else if (ver === 3) {
      // brotli压缩
      try {
        console.log(`${indent}🗜️  解压 brotli 数据 (原始: ${body.length} 字节)...`);
        const unzipped = zlib.brotliDecompressSync(body);
        console.log(`${indent}   解压后: ${unzipped.length} 字节`);
        await this.parsePacket(Buffer.from(unzipped), depth + 1);
        return;
      } catch (e) {
        console.error(`${indent}❌ brotli解压失败:`, e.message);
        return;
      }
    }
    
    // 解析JSON
    try {
      const json = JSON.parse(body.toString());
      await this.handleCommand(json);
    } catch (e) {
      console.error(`${indent}❌ JSON解析失败:`, e.message);
    }
  }

  /**
   * 处理命令
   */
  async handleCommand(data) {
    const cmd = data.cmd;
    console.log('📨 收到消息:', cmd);
    
    switch (cmd) {
      case 'PREPARING': { // 直播准备中（下播）
        console.log('💤 直播准备中 (PREPARING)');
        this.isLive = false;
        this.lastSessionEndTime = Date.now();

        if (this.currentSessionId) {
          const timeStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 16);
          const divider = {
            type: 'divider',
            content: `直播结束 ${timeStr}`,
            timestamp: Math.floor(Date.now() / 1000)
          };
          saveMessage(this.roomId, this.currentSessionId, 'danmaku', divider);
          if (this.onDanmaku) this.onDanmaku(divider);
          // 不重置 currentSessionId，以便记录下播后的弹幕
        }

        if (this.onLiveStatus) this.onLiveStatus({ liveStatus: 0, liveStartTime: 0 });
        break;
      }

      case 'LIVE': { // 直播开始
        console.log('▶️ 直播开始 (LIVE)');
        this.isLive = true;
        // 捕获当前 session（在延迟前），用于判断本次 LIVE 事件是否产生了新场次
        const preSessionId = this.currentSessionId;
        setTimeout(async () => {
          const status = await this.getLiveStatus();
          // 只有当 LIVE 事件导致 session 切换时才插入"直播开始"分界线
          // 不在后端启动/重连时触发，仅响应真实的开播事件
          if (this.currentSessionId && String(this.currentSessionId) !== String(preSessionId)) {
            const liveStartTs = Number(this.currentSessionId);
            const timeStr = new Date(liveStartTs * 1000 + 8 * 3600 * 1000).toISOString().slice(11, 16);
            const divider = {
              type: 'divider',
              content: `直播开始 ${timeStr}`,
              timestamp: liveStartTs
            };
            saveMessage(this.roomId, this.currentSessionId, 'danmaku', divider);
            if (this.onDanmaku) this.onDanmaku(divider);
            console.log(`📌 已插入直播开始分界线 (${preSessionId ?? 'null'} → ${this.currentSessionId}, ${timeStr})`);
          }
          if (status && this.onLiveStatus) this.onLiveStatus(status);
        }, 2000);
        break;
      }

      case 'DANMU_MSG': // 弹幕
        const info = data.info;
        
        // 方式1: 从 info[0][13] 获取单个表情（大表情，通常是单独发送的）
        let emots = {};
        let content = info[1]; // 弹幕内容
        
        if (info[0] && info[0][13] && info[0][13].emoticon_unique) {
          const emoticon = info[0][13];
          // 当有 info[0][13] 时，说明这是一个大表情弹幕
          // 弹幕内容本身就是表情的文本（如"乐"、"摆"）
          // 我们需要将内容包装成 [xxx] 格式，这样前端才能匹配
          const emotKey = (content.startsWith('[') && content.endsWith(']'))
            ? content
            : `[${content}]`;
          let emotUrl = emoticon.url;
          if (emotUrl && emotUrl.startsWith('http://')) {
            emotUrl = emotUrl.replace('http://', 'https://');
          }
          
          emots[emotKey] = {
            url: emotUrl,
            width: emoticon.width || 60,
            height: emoticon.height || 60,
            emoticon_id: emoticon.emoticon_id,
            emoticon_unique: emoticon.emoticon_unique,
            big: !isSmallEmote(emotUrl)
          };
          // 修改内容为带方括号的格式，让前端能匹配
          content = emotKey;
          console.log('🎨 大表情弹幕:', emotKey, '->', emoticon.url);
        }
        
        // 方式2: 从 info[0][15].extra.emots 获取多个小表情
        try {
          if (info[0] && info[0][15] && info[0][15].extra) {
            const extra = typeof info[0][15].extra === 'string' 
              ? JSON.parse(info[0][15].extra) 
              : info[0][15].extra;
            
            // extra.emots 包含文本中的小表情
            if (extra.emots && Object.keys(extra.emots).length > 0) {
              // 确保所有表情URL都是HTTPS
              Object.keys(extra.emots).forEach(key => {
                if (extra.emots[key].url && extra.emots[key].url.startsWith('http://')) {
                  extra.emots[key].url = extra.emots[key].url.replace('http://', 'https://');
                }
              });
              // 合并到 emots 对象
              Object.assign(emots, extra.emots);
              console.log('🎨 文本小表情:', Object.keys(extra.emots).join(', '));
            }
          }
        } catch (e) {
          console.log('⚠️  表情包解析失败:', e.message);
        }
        
        // 如果没有任何表情，设为 null
        const finalEmots = Object.keys(emots).length > 0 ? emots : null;
        
        // 缓存表情
        if (finalEmots) {
          let hasNewEmote = false;
          Object.entries(finalEmots).forEach(([key, value]) => {
            if (!this.emoteCache.has(key)) {
              this.emoteCache.set(key, value);
              hasNewEmote = true;
            }
          });
          if (hasNewEmote) {
            this.saveEmoteCache();
          }
        }

        // 从协议中直接获取用户信息（包括头像）
        const uid = info[2][0];
        const userInfo = info[0]?.[15]?.user?.base;
        let face = userInfo?.face || 'https://i0.hdslb.com/bfs/face/member/noface.jpg';  // 协议中的头像或默认头像
        if (face && face.startsWith('http://')) {
          face = face.replace('http://', 'https://');
        }
        
        const danmaku = {
          type: 'danmaku',
          user: {
            uid: uid,
            username: info[2][1],
            isAdmin: info[2][2] === 1,
            isVip: info[2][3] === 1,
            isSvip: info[2][4] === 1,
            isAnchor: uid === this.anchorId, // 是否为主播
            guardLevel: info[7] || 0,  // 大航海等级: 0=无, 1=总督, 2=提督, 3=舰长
            face: face  // 优先使用协议中的头像，fallback到API
          },
          content: content,  // 使用修改后的内容
          timestamp: info[9].ts,
          medal: info[3] && info[3].length > 0 ? {
            level: info[3][0],
            name: info[3][1],
            upName: info[3][2],
            roomId: info[3][3]
          } : null,
          emots: finalEmots  // 使用合并后的表情信息
        };
        
        console.log('💬 弹幕:', danmaku.user.username, '-', danmaku.content);
        if (danmaku.emots) {
          console.log('🎨 表情包:', Object.keys(danmaku.emots));
        }
        
        // 保存到历史记录
        if (this.currentSessionId) {
          saveMessage(this.roomId, this.currentSessionId, 'danmaku', danmaku);
        }

        if (this.onDanmaku) this.onDanmaku(danmaku);
        break;
        
      case 'SEND_GIFT': // 礼物
        const giftData = data.data;
        
        // 基础图标（通常是静态）
        const basicIcon = giftData.gift_icon || 
                         (giftData.batch_combo_send && giftData.batch_combo_send.gift_icon) ||
                         (giftData.blind_gift && giftData.blind_gift.original_gift_icon) ||
                         giftData.img_basic || 
                         giftData.gift_def_img ||
                         giftData.tag_image;

        // 尝试获取更具体的动静资源
        // 如果有 gift_info，优先用里面的 webp 做动态图，img_basic 做静态图
        // 否则回退到 basicIcon
        let iconDynamic = (giftData.gift_info && giftData.gift_info.webp) || giftData.webp || basicIcon;
        let iconStatic = (giftData.gift_info && giftData.gift_info.img_basic) || giftData.img_basic || basicIcon;

        // 确保图标链接是 HTTPS
        if (iconDynamic && iconDynamic.startsWith('http://')) {
          iconDynamic = iconDynamic.replace('http://', 'https://');
        }
        if (iconStatic && iconStatic.startsWith('http://')) {
          iconStatic = iconStatic.replace('http://', 'https://');
        }

        console.log(`🎁 收到礼物: ${giftData.giftName} (ID: ${giftData.giftId}, 价格: ${giftData.price})`);
        console.log(`   - 图标: ${iconDynamic || '无'}`);
        
        // 缓存礼物图标
        if (iconDynamic || iconStatic) {
          const giftIdStr = String(giftData.giftId);
          if (!this.giftCache.has(giftIdStr)) {
            this.giftCache.set(giftIdStr, {
              name: giftData.giftName,
              icon: iconDynamic || iconStatic,
              staticIcon: iconStatic,
              dynamicIcon: iconDynamic
            });
            this.saveGiftCache();
          }
        }

        let giftUserFace = giftData.face;
        if (giftUserFace && giftUserFace.startsWith('http://')) {
          giftUserFace = giftUserFace.replace('http://', 'https://');
        }

        const gift = {
          type: 'gift',
          user: {
            uid: giftData.uid,
            username: giftData.uname,
            face: giftUserFace
          },
          giftName: giftData.giftName,
          giftId: giftData.giftId,
          giftIcon: iconDynamic,       // 默认使用动态
          giftIconStatic: iconStatic,  // 专用静态字段
          giftIconDynamic: iconDynamic,// 专用动态字段
          blindGift: giftData.blind_gift, // 盲盒信息
          num: giftData.num,
          price: giftData.price,
          coinType: giftData.coin_type,
          totalCoin: giftData.total_coin,
          timestamp: giftData.timestamp || Math.floor(Date.now() / 1000)
        };
        
        // 保存到历史记录
        if (this.currentSessionId) {
          saveMessage(this.roomId, this.currentSessionId, 'gift', gift);
        }

        if (this.onGift) this.onGift(gift);
        break;
        
      case 'USER_TOAST_MSG': // 续费/开通舰长 (比 GUARD_BUY 信息更全，价格更准)
        const toastData = data.data;
        const toastUid = toastData.uid;
        
        // Try to get face from data first, otherwise fetch
        let toastFace = toastData.face || toastData.user_info?.face;
        if (toastFace && toastFace.startsWith('http://')) {
            toastFace = toastFace.replace('http://', 'https://');
        }
        
        // If face is missing OR it is the default noface image, try to fetch fresh one
        // 如果头像缺失或者它是默认的 noface 图像，请尝试获取新的图像
        if (!toastFace || toastFace.includes('noface')) {
            const fetchedFace = await this.getUserFace(toastUid, true);
            // Only use fetched face if it's not the default one (unless we have nothing else)
            // 仅当获取的头像不是默认头像时才使用它（除非我们没有其他头像）
            if (fetchedFace && !fetchedFace.includes('noface')) {
                toastFace = fetchedFace;
            } else if (!toastFace) {
                toastFace = fetchedFace || 'https://i0.hdslb.com/bfs/face/member/noface.jpg';
            }
        }
        
        // Parse days from toast_msg
        // 从 toast_msg 解析陪伴天数
        // Example: "<%user%> 在主播xxx的直播间开通了舰长，今天是TA陪伴主播的第1天"
        let days = 0;
        if (toastData.toast_msg) {
            const match = toastData.toast_msg.match(/陪伴主播的第(\d+)天/);
            if (match) {
                days = parseInt(match[1], 10);
            }
        }

        const toastGuard = {
          type: 'guard',
          user: {
            uid: toastUid,
            username: toastData.username,
            face: toastFace
          },
          guardLevel: toastData.guard_level,
          num: toastData.num,
          unit: toastData.unit,
          op_type: toastData.op_type,
          price: toastData.price, // 金瓜子数 (1000 = 1元)
          giftName: toastData.role_name, // 舰长/提督/总督
          days: days,
          timestamp: Math.floor(Date.now() / 1000)
        };

        if (this.currentSessionId) {
          saveMessage(this.roomId, this.currentSessionId, 'guard', toastGuard);
        }

        if (this.onGuard) this.onGuard(toastGuard);
        break;

      case 'GUARD_BUY': // 上舰 (已废弃，使用 USER_TOAST_MSG)
        // const guardUid = data.data.uid;
        // ...
        break;
        
      case 'INTERACT_WORD': // 进房欢迎
      case 'INTERACT_WORD_V2': // 进房欢迎V2
        const username = data.data.uname || data.data.name || '';
        // 过滤掉空用户名、默认用户名和脱敏用户名
        if (!username || username === '用户' || username.includes('*')) {
          // 静默跳过
          break;
        }
        
        const welcome = {
          type: 'welcome',
          user: {
            uid: data.data.uid || 0,
            username: username
          },
          msgType: data.data.msg_type || 1, // 1:进入 2:关注 3:分享
          timestamp: data.data.timestamp
        };
        if (this.onWelcome) this.onWelcome(welcome);
        break;
        
      case 'SUPER_CHAT_MESSAGE': // SC醒目留言
        let scFace = data.data.user_info.face;
        if (scFace && scFace.startsWith('http://')) {
          scFace = scFace.replace('http://', 'https://');
        }

        const sc = {
          type: 'superchat',
          user: {
            uid: data.data.uid,
            username: data.data.user_info.uname,
            face: scFace
          },
          price: data.data.price,
          message: data.data.message,
          time: data.data.ts || data.data.start_time || Math.floor(Date.now() / 1000),
          backgroundColor: data.data.background_bottom_color
        };
        console.log('💎 SC:', sc.user.username, '-', sc.price, '元 -', sc.message);
        
        // 保存到历史记录
        if (this.currentSessionId) {
          saveMessage(this.roomId, this.currentSessionId, 'superchat', sc);
        }

        if (this.onSuperChat) this.onSuperChat(sc);
        break;
        
      case 'LIKE_INFO_V3_CLICK': // 点赞
        // 过滤掉点赞消息，不显示
        break;
        
      case 'WATCHED_CHANGE': // 看过人数变化
        const watched = {
          type: 'watched',
          num: data.data.num,
          textSmall: data.data.text_small,
          textLarge: data.data.text_large
        };
        if (this.onWatched) this.onWatched(watched);
        break;
        
      case 'ONLINE_RANK_COUNT': // 高能榜人数
        const rankCount = {
          type: 'rank_count',
          count: data.data.count
        };
        if (this.onRankCount) this.onRankCount(rankCount);
        break;
        
      case 'ENTRY_EFFECT': // 进场特效
        // 过滤掉进场特效消息，不显示
        break;
        
      case 'LIKE_INFO_V3_UPDATE': // 点赞数更新
        // 静默处理，不输出
        break;
        
      case 'ONLINE_RANK_V3': // 高能榜V3
      case 'STOP_LIVE_ROOM_LIST': // 停播房间列表
        // 这些消息数据量大但用处不大，静默处理
        break;
      
      default:
        // 只记录真正未处理的消息类型
        if (cmd && !cmd.startsWith('_') && !cmd.includes('ONLINE_RANK') && !cmd.includes('ROOM_LIST')) {
          console.log('ℹ️  未知消息:', cmd);
        }
        break;
    }
  }

  /**
   * 错误处理
   */
  handleError(error) {
    console.error('❌ WebSocket错误:', error);
    if (this.onError) this.onError(error);
  }

  /**
   * 连接关闭
   */
  handleClose() {
    console.log('🔌 WebSocket连接已关闭');
    this.isConnected = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // 仅在非主动断开时触发 onClose（防止 connect() 内部 disconnect() 误触重连）
    if (!this._intentionalDisconnect) {
      if (this.onClose) this.onClose();
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.ws) {
      this.ws.onclose = null; // 解除回调，避免触发 handleClose
      this.ws.close();
      this.ws = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.isConnected = false;
  }
}
