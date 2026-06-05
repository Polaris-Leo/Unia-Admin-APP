import { Router } from 'express';
import { generateQRCode, pollQRCode, fetchBuvid } from '../services/bilibiliAuth.js';
import { saveCookies, loadLocalCookies, clearCookies } from '../utils/cookieStorage.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// 生成扫码二维码（需登录工具账号）
router.get('/qrcode', requireAuth, async (req, res, next) => {
  try {
    const data = await generateQRCode();
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// 轮询扫码结果
router.get('/qrcode/poll', requireAuth, async (req, res, next) => {
  try {
    const { qrcode_key } = req.query;
    if (!qrcode_key) return res.status(400).json({ error: '缺少 qrcode_key' });

    const result = await pollQRCode(qrcode_key);

    if (result.data.code === 0 && result.cookies) {
      const cookieObj = {};
      result.cookies.forEach(c => { cookieObj[c.name] = c.value; });

      // 获取 buvid3/buvid4
      const buvid = await fetchBuvid(cookieObj);
      if (buvid) {
        cookieObj.buvid3 = buvid.buvid3;
        cookieObj.buvid4 = buvid.buvid4;
      }

      saveCookies(cookieObj);
      console.log('✅ B站扫码登录成功，Cookie 已保存');
    }

    res.json({ success: true, data: result.data });
  } catch (e) { next(e); }
});

// 获取当前本地扫码 Cookie 状态（只检查本地文件）
router.get('/auth-status', requireAuth, (req, res, next) => {
  try {
    const cookies = loadLocalCookies();
    const hasAuth = !!(cookies?.SESSDATA && cookies?.bili_jct);
    res.json({
      authenticated: hasAuth,
      uid: cookies?.DedeUserID || null,
      sessdataPreview: cookies?.SESSDATA ? cookies.SESSDATA.substring(0, 8) + '...' : null
    });
  } catch (e) { next(e); }
});

// 清除本地 Cookie（退出 B站账号）
router.post('/logout', requireAuth, (req, res, next) => {
  try {
    clearCookies();
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
