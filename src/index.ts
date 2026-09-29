import express, { Request, Response } from 'express';
import { validateSignature } from '@line/bot-sdk';
import { config, validateConfig } from './config.js';
import { handleLineEvent } from './lineService.js';

const app = express();

// ตรวจสอบความถูกต้องของ Configuration
validateConfig();

// Health Check Endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    message: 'LINE AI Bot (ไม้เทียม Koyo Decor) is running!',
    model: config.geminiModel,
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
