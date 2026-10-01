import express from 'express';
import { validateSignature } from '@line/bot-sdk';
import { config, validateConfig } from './config.js';
import { handleLineEvent } from './lineService.js';
import { isGlobalBotEnabled, setGlobalBotEnabled, pauseGlobalBot, resumeGlobalBot, getGlobalBotStatus, } from './sessionManager.js';
const app = express();
// ตรวจสอบความถูกต้องของ Configuration
validateConfig();
// ==========================================
// Basic Authentication Middleware สำหรับ Admin
// ==========================================
function basicAuthMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Koyo Admin Dashboard"');
        res.status(401).send('กรุณาล็อกอินก่อนเข้าใช้งานครับ');
        return;
    }
    const base64 = authHeader.slice('Basic '.length);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const [username, password] = decoded.split(':');
    if (username === config.adminUsername && password === config.adminPassword) {
        next();
    }
    else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Koyo Admin Dashboard"');
        res.status(401).send('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้องครับ');
    }
}
// ==========================================
// Admin Dashboard — ต้อง Login ก่อนเข้า
// ==========================================
app.get('/admin', basicAuthMiddleware, (_req, res) => {
    const status = getGlobalBotStatus();
    const quickPauseUrl = `/pause?key=${encodeURIComponent(config.adminPassword)}&mins=30`;
    const resumeUrl = `/resume?key=${encodeURIComponent(config.adminPassword)}`;
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>สวิตช์เปิด-ปิด LINE AI Bot</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: white; border-radius: 16px; padding: 28px 24px; max-width: 440px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.08); text-align: center; }
        h1 { font-size: 22px; color: #1c1e21; margin-bottom: 6px; }
        p { color: #65676b; font-size: 14px; margin-top: 0; }
        .status-badge { display: inline-block; padding: 8px 18px; border-radius: 50px; font-weight: bold; font-size: 15px; margin: 12px 0 20px; }
        .status-on { background: #e7f7ed; color: #0f9d58; }
        .status-off { background: #fce8e6; color: #d93025; }
        .btn { display: block; width: 100%; padding: 14px; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer; transition: all 0.2s; text-decoration: none; color: white; margin-bottom: 10px; box-sizing: border-box; }
        .btn-pause-30 { background: #ea4335; }
        .btn-pause-30:hover { background: #d93025; }
        .btn-pause-60 { background: #f27011; }
        .btn-pause-60:hover { background: #e06000; }
        .btn-pause-inf { background: #757575; font-size: 14px; padding: 10px; }
        .btn-start { background: #00c300; }
        .btn-start:hover { background: #00aa00; }
        .info-box { background: #f8f9fa; border-radius: 10px; padding: 14px; font-size: 13px; color: #444; margin-top: 18px; text-align: left; line-height: 1.6; border: 1px solid #e9ecef; }
        .quick-link-box { background: #e8f4fd; border-radius: 8px; padding: 10px; font-size: 12px; word-break: break-all; margin-top: 8px; color: #1a73e8; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🤖 ไม้เทียม Koyo Decor</h1>
        <p>ระบบควบคุมการตอบแชท AI ประจำร้าน</p>
        <div>
          สถานะปัจจุบัน:<br/>
          <span class="status-badge ${status.isEnabled ? 'status-on' : 'status-off'}">
            ${status.isEnabled ? '🟢 AI กำลังทำงาน (ตอบอัตโนมัติ)' : `🔴 AI กำลังพัก (เหลือ ${status.remainingMinutes} นาที จะเปิดอัตโนมัติ)`}
          </span>
        </div>

        ${status.isEnabled
        ? `
              <a href="/admin/toggle?action=pause30" class="btn btn-pause-30">🛑 พัก AI 30 นาที (เปิดอัตโนมัติ)</a>
              <a href="/admin/toggle?action=pause60" class="btn btn-pause-60">⏳ พัก AI 1 ชั่วโมง (เปิดอัตโนมัติ)</a>
              <a href="/admin/toggle?action=disable" class="btn btn-pause-inf">🛑 พัก AI แบบไม่จำกัดเวลา</a>
            `
        : `
              <a href="/admin/toggle?action=enable" class="btn btn-start">▶️ เปิด AI ทันที (กลับมาตอบตามปกติ)</a>
            `}

        <div class="info-box">
          <b>⚡ วิธีสั่งพัก 30 นาที โดยไม่ต้องเข้าหน้านี้:</b>
          <br/>
          1. <b>บันทึก Link ลัดไว้บนมือถือ (กดครั้งเดียว พัก 30 นาทีทันที):</b>
          <div class="quick-link-box">
            <a href="${quickPauseUrl}" target="_blank">คลิกเพื่อพัก 30 นาที (ไม่ต้องพิมพ์รหัส)</a>
          </div>
          <br/>
          2. <b>หรือพิมพ์สั่งใน LINE:</b> พิมพ์คำว่า <code>พัก 30</code> หรือ <code>เปิด</code> ส่งให้บอทใน LINE ได้เลยครับ
        </div>
      </div>
    </body>
    </html>
  `);
});
app.get('/admin/toggle', basicAuthMiddleware, (req, res) => {
    const action = req.query.action;
    if (action === 'pause30') {
        pauseGlobalBot(30 * 60 * 1000);
    }
    else if (action === 'pause60') {
        pauseGlobalBot(60 * 60 * 1000);
    }
    else if (action === 'disable') {
        setGlobalBotEnabled(false, 0); // ไม่จำกัดเวลา
    }
    else if (action === 'enable') {
        resumeGlobalBot();
    }
    res.redirect('/admin');
});
// ==========================================
// 1-Tap Quick Pause & Resume Endpoints (ไม่ต้องล็อกอิน)
// สามารถบันทึกเป็น Bookmark บนมือถือ หรือส่งลิงก์ไว้ใน LINE กดทีเดียวพัก 30 นาทีได้ทันที
// ==========================================
app.get('/pause', (req, res) => {
    const key = req.query.key;
    if (!key || key !== config.adminPassword) {
        res.status(403).send('❌ รหัสความปลอดภัย (key) ไม่ถูกต้องครับ');
        return;
    }
    const mins = parseInt(req.query.mins || '30', 10);
    const result = pauseGlobalBot(mins * 60 * 1000);
    const endTimeStr = new Date(result.pausedUntil).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const resumeUrl = `/resume?key=${encodeURIComponent(config.adminPassword)}`;
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>พัก AI ชั่วคราว</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: white; border-radius: 20px; padding: 35px 25px; max-width: 380px; width: 100%; box-shadow: 0 10px 30px rgba(217,48,37,0.12); text-align: center; border-top: 6px solid #ea4335; }
        h1 { font-size: 24px; color: #d93025; margin-bottom: 8px; }
        p { color: #555; font-size: 15px; line-height: 1.6; }
        .badge { background: #fce8e6; color: #d93025; font-size: 18px; font-weight: bold; padding: 10px 20px; border-radius: 50px; display: inline-block; margin: 15px 0; }
        .btn { display: block; width: 100%; padding: 16px; border: none; border-radius: 12px; font-size: 17px; font-weight: bold; cursor: pointer; text-decoration: none; color: white; margin-top: 20px; box-sizing: border-box; background: #00c300; }
        .btn:hover { background: #00aa00; }
        .note { font-size: 13px; color: #888; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🛑 พัก AI ชั่วคราวเรียบร้อย</h1>
        <p>AI หยุดตอบอัตโนมัติแล้ว แอดมินคุยกับลูกค้าได้เลยครับ</p>
        <div class="badge">⏰ พัก ${mins} นาที (ถึงเวลา ${endTimeStr} น.)</div>
        <p class="note">เมื่อครบ ${mins} นาที AI จะกลับมาเปิดทำงานตอบลูกค้าเองอัตโนมัติ 100% โดยไม่ต้องกดเปิดครับ</p>
        <a href="${resumeUrl}" class="btn">▶️ เปิด AI ทันที (หากคุยเสร็จก่อน)</a>
      </div>
    </body>
    </html>
  `);
});
app.get('/resume', (req, res) => {
    const key = req.query.key;
    if (!key || key !== config.adminPassword) {
        res.status(403).send('❌ รหัสความปลอดภัย (key) ไม่ถูกต้องครับ');
        return;
    }
    resumeGlobalBot();
    const pauseUrl = `/pause?key=${encodeURIComponent(config.adminPassword)}&mins=30`;
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>เปิด AI เรียบร้อย</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f0faf4; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: white; border-radius: 20px; padding: 35px 25px; max-width: 380px; width: 100%; box-shadow: 0 10px 30px rgba(15,157,88,0.12); text-align: center; border-top: 6px solid #00c300; }
        h1 { font-size: 24px; color: #0f9d58; margin-bottom: 8px; }
        p { color: #555; font-size: 15px; line-height: 1.6; }
        .badge { background: #e7f7ed; color: #0f9d58; font-size: 18px; font-weight: bold; padding: 10px 20px; border-radius: 50px; display: inline-block; margin: 15px 0; }
        .btn { display: block; width: 100%; padding: 16px; border: none; border-radius: 12px; font-size: 17px; font-weight: bold; cursor: pointer; text-decoration: none; color: white; margin-top: 20px; box-sizing: border-box; background: #ea4335; }
        .btn:hover { background: #d93025; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🟢 เปิด AI เรียบร้อยแล้ว</h1>
        <p>บอท AI กลับมาทำงานและพร้อมตอบลูกค้าตามปกติแล้วครับ</p>
        <div class="badge">พร้อมใช้งาน</div>
        <a href="${pauseUrl}" class="btn">🛑 พัก AI 30 นาที</a>
      </div>
    </body>
    </html>
  `);
});
// ==========================================
// Health Check Endpoint
// ==========================================
app.get('/', (_req, res) => {
    res.json({
        status: 'online',
        message: 'LINE AI Bot (ไม้เทียม Koyo Decor) is running!',
        model: config.geminiModel,
        botEnabled: isGlobalBotEnabled(),
        timestamp: new Date().toISOString(),
    });
});
// ==========================================
// LINE Webhook Endpoint
// ==========================================
app.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
    const signature = req.headers['x-line-signature'];
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf-8') : (req.body || '');
    // รายการ Channel Secrets สำหรับตรวจสอบ
    const secrets = [config.lineChannelSecret, config.lineChannelSecretFallback].filter(Boolean);
    let isValid = false;
    if (!signature) {
        console.warn('⚠️ ได้รับ Request ที่ไม่มี x-line-signature header');
    }
    else {
        for (const secret of secrets) {
            try {
                if (validateSignature(rawBody, secret, signature)) {
                    isValid = true;
                    break;
                }
            }
            catch {
                // ข้ามหาก secret ไม่ตรง
            }
        }
    }
    if (signature && !isValid) {
        console.error('❌ การตรวจสอบ LINE Signature ล้มเหลว (Invalid signature)');
        return res.status(401).json({ error: 'Invalid signature' });
    }
    let parsedBody;
    try {
        parsedBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    }
    catch (parseError) {
        console.error('❌ แปลงข้อมูล JSON ล้มเหลว:', parseError);
        return res.status(400).json({ error: 'Invalid JSON' });
    }
    const events = parsedBody?.events || [];
    if (events.length === 0) {
        return res.status(200).json({ status: 'ok', message: 'No events' });
    }
    // ประมวลผลทุก Event พร้อมกัน
    await Promise.all(events.map(async (event) => {
        try {
            await handleLineEvent(event);
        }
        catch (eventError) {
            console.error('❌ ข้อผิดพลาดในการประมวลผล Event:', eventError);
        }
    }));
    return res.status(200).json({ status: 'success' });
});
// เริ่มต้น Express Server
const server = app.listen(config.port, () => {
    console.log('====================================================');
    console.log(`🚀 LINE AI Bot Server กำลังทำงานที่พอร์ต: ${config.port}`);
    console.log(`🌐 ตรวจสอบสถานะเซิร์ฟเวอร์: http://localhost:${config.port}/`);
    console.log(`📡 Webhook URL ปลายทาง: http://localhost:${config.port}/webhook`);
    console.log(`🔐 Admin Dashboard: http://localhost:${config.port}/admin`);
    console.log('====================================================');
});
// ดักจับการปิดโปรแกรม
process.on('SIGINT', () => {
    server.close(() => {
        console.log('\n🛑 ปิดการทำงานของ LINE AI Bot Server');
        process.exit(0);
    });
});
//# sourceMappingURL=index.js.map