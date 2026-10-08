import express, { Request, Response, NextFunction } from 'express';
import { validateSignature } from '@line/bot-sdk';
import { config, validateConfig } from './config.js';
import { handleLineEvent } from './lineService.js';
import {
  isGlobalBotEnabled,
  setGlobalBotEnabled,
  pauseGlobalBot,
  resumeGlobalBot,
  getGlobalBotStatus,
  pauseUser,
  unpauseUser,
  getUserPausedUntil,
  getShortCode,
} from './sessionManager.js';

const app = express();

// ตรวจสอบความถูกต้องของ Configuration
validateConfig();

// ==========================================
// Basic Authentication Middleware สำหรับ Admin
// ==========================================
function basicAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
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
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Koyo Admin Dashboard"');
    res.status(401).send('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้องครับ');
  }
}

// ==========================================
// Admin Dashboard — หน้าควบคุม AI ประจำร้าน (เรียบง่าย สบายตา)
// ==========================================
app.get('/admin', basicAuthMiddleware, (_req: Request, res: Response) => {
  const status = getGlobalBotStatus();
  const endTimeStr = status.pausedUntil > 0 
    ? new Date(status.pausedUntil).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
    : '';

  res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ไม้เทียม Koyo Decor - ควบคุม AI</title>
      <style>
        * { box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
          background: #f0f2f5; 
          display: flex; 
          justify-content: center; 
          align-items: center; 
          min-height: 100vh; 
          margin: 0; 
          padding: 20px; 
        }
        .card { 
          background: white; 
          border-radius: 20px; 
          padding: 32px 26px; 
          max-width: 430px; 
          width: 100%; 
          box-shadow: 0 10px 30px rgba(0,0,0,0.08); 
          text-align: center; 
        }
        h1 { font-size: 23px; color: #1c1e21; margin: 0 0 6px; font-weight: 700; }
        p.subtitle { color: #65676b; font-size: 14px; margin: 0 0 16px; }
        .clock-bar {
          background: #f8f9fa;
          border-radius: 30px;
          padding: 6px 16px;
          font-size: 13px;
          color: #555;
          display: inline-block;
          margin-bottom: 18px;
          border: 1px solid #e9ecef;
        }
        .clock-bar b { color: #1c1e21; font-family: monospace; font-size: 14px; }
        .label { font-size: 14px; color: #65676b; margin-bottom: 8px; }
        .status-badge { 
          display: inline-block; 
          padding: 8px 22px; 
          border-radius: 50px; 
          font-weight: bold; 
          font-size: 15px; 
          margin-bottom: 18px; 
        }
        .status-on { background: #e7f7ed; color: #0f9d58; }
        .status-off { background: #fce8e6; color: #d93025; }
        .timer-container {
          background: #fff5f5;
          border: 1.5px dashed #ea4335;
          border-radius: 16px;
          padding: 16px 10px;
          margin-bottom: 20px;
        }
        .timer-label {
          font-size: 13px;
          color: #d93025;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .timer-display {
          font-size: 46px;
          font-weight: 800;
          color: #d93025;
          letter-spacing: 2px;
          line-height: 1.1;
          font-variant-numeric: tabular-nums;
        }
        .timer-info {
          font-size: 13px;
          color: #555;
          margin-top: 8px;
        }
        .timer-info b { color: #1c1e21; }
        .btn { 
          display: block; 
          width: 100%; 
          padding: 16px; 
          border: none; 
          border-radius: 14px; 
          font-size: 17px; 
          font-weight: bold; 
          cursor: pointer; 
          transition: all 0.15s; 
          text-decoration: none; 
          color: white; 
          margin-bottom: 12px; 
        }
        .btn:active { transform: scale(0.98); }
        .btn-pause { background: #ea4335; }
        .btn-pause:hover { background: #d93025; }
        .btn-reset { background: #1a73e8; }
        .btn-reset:hover { background: #1557b0; }
        .btn-start { background: #00c300; }
        .btn-start:hover { background: #00aa00; }
        .footer-note { 
          font-size: 13px; 
          color: #888; 
          margin-top: 16px; 
          line-height: 1.6; 
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🤖 ไม้เทียม Koyo Decor</h1>
        <p class="subtitle">สวิตช์ควบคุมการตอบแชท AI ประจำร้าน</p>

        <div class="clock-bar">
          🕒 เวลาปัจจุบัน: <b id="currentClock">--:--:--</b> น.
        </div>

        <div class="label">สถานะปัจจุบัน:</div>
        <div>
          <span class="status-badge ${status.isEnabled ? 'status-on' : 'status-off'}">
            ${status.isEnabled ? '🟢 AI กำลังทำงาน (ตอบอัตโนมัติ)' : '🔴 AI กำลังพัก (แอดมินตอบเอง)'}
          </span>
        </div>

        ${
          status.isEnabled
            ? `
              <a href="/admin/toggle?action=pause30" class="btn btn-pause">🛑 กดเพื่อ "พัก AI 30 นาที" (แอดมินตอบเอง)</a>
              <div class="footer-note">
                * เมื่อกดพัก AI จะหยุดตอบ 30 นาที และเปิดทำงานกลับมาตอบลูกค้าเองอัตโนมัติครับ
              </div>
            `
            : `
              <div class="timer-container">
                <div class="timer-label">⏳ เวลานับถอยหลังที่เหลือ:</div>
                <div class="timer-display" id="timer">--:--</div>
                <div class="timer-info">⏰ จะเปิดทำงานอัตโนมัติเวลา: <b>${endTimeStr} น.</b></div>
              </div>

              <a href="/admin/toggle?action=pause30" class="btn btn-reset">🔄 กดเพื่อ Reset นับ 30 นาทีใหม่</a>
              <a href="/admin/toggle?action=enable" class="btn btn-start">▶️ กดเพื่อ "เปิด AI" (ทำงานตามปกติ)</a>

              <div class="footer-note">
                * <b>เมื่อแอดมินตอบลูกค้าทุกครั้ง</b> ให้กดปุ่ม <b>"Reset นับ 30 นาทีใหม่"</b> เพื่อเริ่มนับเวลาใหม่เสมอครับ
              </div>

              <script>
                const target = ${status.pausedUntil};
                function tickTimer() {
                  const now = Date.now();
                  const remain = Math.max(0, target - now);
                  const totalSec = Math.floor(remain / 1000);
                  const m = Math.floor(totalSec / 60);
                  const s = totalSec % 60;
                  const el = document.getElementById('timer');
                  if (el) {
                    el.innerText = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
                    if (remain <= 0) {
                      location.reload();
                    }
                  }
                }
                setInterval(tickTimer, 1000);
                tickTimer();
              </script>
            `
        }
      </div>

      <script>
        function updateLiveClock() {
          const now = new Date();
          const timeStr = now.toLocaleTimeString('th-TH', { hour12: false });
          const clockEl = document.getElementById('currentClock');
          if (clockEl) clockEl.innerText = timeStr;
        }
        setInterval(updateLiveClock, 1000);
        updateLiveClock();
      </script>
    </body>
    </html>
  `);
});

app.get('/admin/toggle', basicAuthMiddleware, (req: Request, res: Response) => {
  const action = req.query.action as string;
  if (action === 'pause30' || action === 'disable') {
    // รีเซ็ตเริ่มนับ 30 นาทีใหม่เสมอ
    pauseGlobalBot(30 * 60 * 1000);
  } else if (action === 'enable') {
    resumeGlobalBot();
  }
  res.redirect('/admin');
});

// ==========================================
// 1-Tap Quick Pause & Resume Endpoints (ไม่ต้องล็อกอิน)
// สามารถบันทึกเป็น Bookmark บนมือถือ หรือส่งลิงก์ไว้ใน LINE กดทีเดียวพัก 30 นาทีได้ทันที
// ==========================================
app.get('/pause', (req: Request, res: Response) => {
  const key = req.query.key as string;
  if (!key || key !== config.adminPassword) {
    res.status(403).send('❌ รหัสความปลอดภัย (key) ไม่ถูกต้องครับ');
    return;
  }

  const targetUserId = req.query.userId as string;
  const mins = parseInt((req.query.mins as string) || '30', 10);
  
  if (targetUserId) {
    pauseUser(targetUserId, mins * 60 * 1000);
  } else {
    pauseGlobalBot(mins * 60 * 1000);
  }

  const pausedUntil = targetUserId ? getUserPausedUntil(targetUserId) : getGlobalBotStatus().pausedUntil;
  const endTimeStr = pausedUntil > 0 ? new Date(pausedUntil).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : 'ไม่กำหนด';
  const userParam = targetUserId ? `&userId=${encodeURIComponent(targetUserId)}` : '';
  const resumeUrl = `/resume?key=${encodeURIComponent(config.adminPassword)}${userParam}`;
  const resetUrl = `/pause?key=${encodeURIComponent(config.adminPassword)}&mins=${mins}${userParam}`;
  const scopeLabel = targetUserId ? `เฉพาะห้อง ${getShortCode(targetUserId)}` : 'ทั้งระบบ';

  res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>พัก AI 30 นาที (รีเซ็ตเวลาใหม่)</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: white; border-radius: 20px; padding: 32px 24px; max-width: 400px; width: 100%; box-shadow: 0 10px 30px rgba(217,48,37,0.12); text-align: center; border-top: 6px solid #ea4335; }
        h1 { font-size: 22px; color: #d93025; margin-bottom: 6px; }
        p { color: #555; font-size: 14px; line-height: 1.6; margin: 8px 0; }
        .timer-box { background: #fce8e6; color: #d93025; font-size: 32px; font-weight: bold; padding: 14px 20px; border-radius: 14px; margin: 16px 0 10px; letter-spacing: 1px; }
        .timer-sub { font-size: 13px; color: #777; margin-bottom: 20px; }
        .btn { display: block; width: 100%; padding: 14px; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer; text-decoration: none; color: white; margin-bottom: 10px; box-sizing: border-box; }
        .btn-reset { background: #1a73e8; }
        .btn-reset:hover { background: #1557b0; }
        .btn-start { background: #00c300; }
        .btn-start:hover { background: #00aa00; }
        .note { font-size: 12px; color: #888; margin-top: 14px; line-height: 1.5; background: #f8f9fa; padding: 10px; border-radius: 8px; text-align: left; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🔄 พัก AI (${scopeLabel}) เรียบร้อย!</h1>
        <p>AI หยุดตอบอัตโนมัติแล้ว แอดมินคุยกับลูกค้าได้เลยครับ</p>
        <div class="timer-box" id="countdown">30:00</div>
        <div class="timer-sub">⏳ จะเปิดทำงานอัตโนมัติเวลา: <b>${endTimeStr} น.</b></div>

        <a href="${resetUrl}" class="btn btn-reset">🔄 กดรีเซ็ตนับ 30 นาทีใหม่ (เมื่อตอบลูกค้า)</a>
        <a href="${resumeUrl}" class="btn btn-start">▶️ เปิด AI ทันที (คุยเสร็จแล้ว)</a>

        <div class="note">
          💡 <b>คำแนะนำ:</b> ทุกครั้งที่แอดมินพิมพ์คุยกับลูกค้า สามารถกดปุ่ม <b>"รีเซ็ตนับ 30 นาทีใหม่"</b> เพื่อขยายเวลาพักออกไปอีก 30 นาทีได้เสมอครับ
        </div>
      </div>

      <script>
        const targetTime = ${pausedUntil};
        function updateTimer() {
          const now = Date.now();
          const diff = Math.max(0, targetTime - now);
          const totalSec = Math.floor(diff / 1000);
          const mins = Math.floor(totalSec / 60);
          const secs = totalSec % 60;
          document.getElementById('countdown').innerText = 
            String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
          if (diff <= 0) {
            document.getElementById('countdown').innerText = 'เปิดใช้งานแล้ว';
            document.getElementById('countdown').style.color = '#0f9d58';
          }
        }
        setInterval(updateTimer, 1000);
        updateTimer();
      </script>
    </body>
    </html>
  `);
});

app.get('/resume', (req: Request, res: Response) => {
  const key = req.query.key as string;
  if (!key || key !== config.adminPassword) {
    res.status(403).send('❌ รหัสความปลอดภัย (key) ไม่ถูกต้องครับ');
    return;
  }

  const targetUserId = req.query.userId as string;
  if (targetUserId) {
    unpauseUser(targetUserId);
  } else {
    resumeGlobalBot();
  }
  const pauseUrl = `/pause?key=${encodeURIComponent(config.adminPassword)}&mins=30${targetUserId ? `&userId=${encodeURIComponent(targetUserId)}` : ''}`;

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
app.get('/', (_req: Request, res: Response) => {
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
app.post(
  '/webhook',
  express.raw({ type: '*/*' }),
  async (req: Request, res: Response) => {
    const signature = req.headers['x-line-signature'] as string;
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf-8') : (req.body || '');

    // รายการ Channel Secrets สำหรับตรวจสอบ
    const secrets = [config.lineChannelSecret, config.lineChannelSecretFallback].filter(Boolean);
    let isValid = false;

    if (!signature) {
      console.warn('⚠️ ได้รับ Request ที่ไม่มี x-line-signature header');
    } else {
      for (const secret of secrets) {
        try {
          if (validateSignature(rawBody, secret, signature)) {
            isValid = true;
            break;
          }
        } catch {
          // ข้ามหาก secret ไม่ตรง
        }
      }
    }

    if (signature && !isValid) {
      console.error('❌ การตรวจสอบ LINE Signature ล้มเหลว (Invalid signature)');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    let parsedBody: any;
    try {
      parsedBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch (parseError) {
      console.error('❌ แปลงข้อมูล JSON ล้มเหลว:', parseError);
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const events: any[] = parsedBody?.events || [];
    if (events.length === 0) {
      return res.status(200).json({ status: 'ok', message: 'No events' });
    }

    // ประมวลผลทุก Event พร้อมกัน
    await Promise.all(
      events.map(async (event) => {
        try {
          await handleLineEvent(event);
        } catch (eventError: any) {
          console.error('❌ ข้อผิดพลาดในการประมวลผล Event:', eventError);
        }
      })
    );

    return res.status(200).json({ status: 'success' });
  }
);

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
