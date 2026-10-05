import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  port: number;
  lineChannelSecret: string;
  lineChannelSecretFallback: string;
  lineChannelAccessToken: string;
  geminiApiKey: string;
  geminiModel: string;
  botSystemPrompt: string;
  adminUsername: string;
  adminPassword: string;
  adminLineUserId: string;
}

function getInitialModel(): string {
  const m = process.env.GEMINI_MODEL;
  // โมเดลเริ่มต้น: gemini-flash-lite-latest (เร็ว เสถียร ตอบไวมากสำหรับแชทบอท)
  const validModels = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash',
  ];
  if (m && validModels.includes(m)) return m;
  return 'gemini-flash-lite-latest';
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),

  // LINE Credentials — ต้องตั้งค่าใน .env (เครื่องตัวเอง) หรือ Environment บน Render เท่านั้น ห้ามใส่ค่าจริงในโค้ด
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '',
  lineChannelSecretFallback: process.env.LINE_CHANNEL_SECRET_FALLBACK || '',
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',

  // Gemini API
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: getInitialModel(),

  // System Prompt
  botSystemPrompt:
    process.env.BOT_SYSTEM_PROMPT ||
    'คุณคือแอดมิน AI ประจำร้าน ไม้เทียม Koyo Decor ตอบสั้นกระชับ 1-3 บรรทัด ตรงประเด็น สุภาพ จดจำประวัติการคุย ไม่ตอบซ้ำ หากคำถามไม่ชัดเจนหรือไม่แน่ใจให้ถามกลับเพื่อยืนยันทันที ห้ามเดาตอบไปเอง',

  // Admin Dashboard Auth
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',

  // LINE User ID ของแอดมิน (สำหรับส่งการแจ้งเตือน)
  adminLineUserId: process.env.ADMIN_LINE_USER_ID || '',
};

const REQUIRED_ENV_VARS = [
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'GEMINI_API_KEY',
  'ADMIN_PASSWORD',
] as const;

export function validateConfig(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ ยังไม่ได้ตั้งค่า Environment Variables ที่จำเป็น:');
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error('   👉 ใส่ในไฟล์ .env (เครื่องตัวเอง) หรือ Render > Environment (บนเซิร์ฟเวอร์)');
    process.exit(1);
  }

  if (config.adminPassword.length < 8) {
    console.warn('⚠️ ADMIN_PASSWORD สั้นเกินไป แนะนำอย่างน้อย 8 ตัวอักษร');
  }

  console.log('✅ โหลดการตั้งค่า LINE และ Gemini API Key เรียบร้อยแล้ว');
  console.log(`   🤖 Gemini Model: ${config.geminiModel}`);
  if (config.adminLineUserId) {
    console.log(`   🔔 Admin LINE UID: ${config.adminLineUserId.slice(0, 8)}...`);
  }
}

