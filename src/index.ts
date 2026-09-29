import express, { Request, Response } from 'express';
import { validateSignature } from '@line/bot-sdk';
import { config, validateConfig } from './config.js';
import { handleLineEvent } from './lineService.js';
import { isGlobalBotEnabled, setGlobalBotEnabled } from './sessionManager.js';

const app = express();

// ตรวจสอบความถูกต้องของ Configuration
validateConfig();

// Admin Dashboard สำหรับสลับโหมด พัก AI / เปิด AI ได้จากมือถือหรือบราวเซอร์
app.get('/admin', (_req: Request, res: Response) => {
  const isEnabled = isGlobalBotEnabled();
  res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>สวิตช์เปิด-ปิด LINE AI Bot</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: white; border-radius: 16px; padding: 30px; max-width: 420px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.08); text-align: center; }
        h1 { font-size: 22px; color: #1c1e21; margin-bottom: 8px; }
        p { color: #65676b; font-size: 15px; margin-top: 0; }
        .status-badge { display: inline-block; padding: 8px 18px; border-radius: 50px; font-weight: bold; font-size: 16px; margin: 15px 0 25px; }
        .status-on { background: #e7f7ed; color: #0f9d58; }
        .status-off { background: #fce8e6; color: #d93025; }
        .btn { display: block; width: 100%; padding: 16px; border: none; border-radius: 12px; font-size: 18px; font-weight: bold; cursor: pointer; transition: all 0.2s; text-decoration: none; color: white; margin-bottom: 12px; box-sizing: border-box; }
        .btn-pause { background: #ea4335; }
        .btn-pause:hover { background: #d93025; }
        .btn-start { background: #00c300; }
        .btn-start:hover { background: #00aa00; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🤖 ไม้เทียม Koyo Decor</h1>
        <p>สวิตช์ควบคุมการตอบแชท AI ประจำร้าน</p>
        <div>
          สถานะปัจจุบัน:<br/>
          <span class="status-badge ${isEnabled ? 'status-on' : 'status-off'}">
            ${isEnabled ? '🟢 AI กำลังทำงาน (ตอบอัตโนมัติ)' : '🔴 AI กำลังพัก (แอดมินตอบเอง)'}
          </span>
        </div>
        ${
          isEnabled
            ? '<a href="/admin/toggle?action=disable" class="btn btn-pause">🛑 กดเพื่อ "พัก AI" (แอดมินตอบเอง)</a>'
            : '<a href="/admin/toggle?action=enable" class="btn btn-start">▶️ กดเพื่อ "เปิด AI" (ทำงานตามปกติ)</a>'
        }
        <p style="font-size: 13px; color: #888; margin-top: 15px;">
          * เมื่อกดพัก AI แล้ว AI จะหยุดตอบลูกค้าทุกคนทันที ทำให้แอดมินคุยกับลูกค้าได้อย่างสบายใจไม่มีบอทมาแทรกครับ
        </p>
      </div>
    </body>
    </html>
  `);
});

app.get('/admin/toggle', (req: Request, res: Response) => {
  const action = req.query.action as string;
  if (action === 'disable') {
    setGlobalBotEnabled(false);
  } else if (action === 'enable') {
    setGlobalBotEnabled(true);
  }
  res.redirect('/admin');
});

// Health Check Endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    message: 'LINE AI Bot (ไม้เทียม Koyo Decor) is running!',
    model: config.geminiModel,
    diagnostics: {
      hasSecret: Boolean(config.lineChannelSecret),
      secretLength: config.lineChannelSecret.length,
      secretPrefix: config.lineChannelSecret.slice(0, 4),
      hasSecretFallback: Boolean(config.lineChannelSecretFallback),
      hasToken: Boolean(config.lineChannelAccessToken),
      tokenLength: config.lineChannelAccessToken.length,
      hasGeminiKey: Boolean(config.geminiApiKey),
    },
    timestamp: new Date().toISOString(),
  });
});

// LINE Webhook Endpoint
// ใช้ express.raw เพื่ออ่านข้อมูลดิบและคำนวณ HMAC-SHA256 ตรวจสอบความถูกต้องของ x-line-signature
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
      // ในบางกรณีที่ทดสอบยิงเองโดยไม่มี header
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
  console.log('====================================================');
});

// ดักจับการปิดโปรแกรม
process.on('SIGINT', () => {
  server.close(() => {
    console.log('\n🛑 ปิดการทำงานของ LINE AI Bot Server');
    process.exit(0);
  });
});
