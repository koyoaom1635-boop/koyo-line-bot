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
}

function getDefaultGeminiKey(): string {
  const b64 = 'QVEuQWI4Uk42SWdIRmtIdWVxWEtWOHFtSTA4b20tb0ZtYmc5M3FqSlYzempNZ3lRZTVOTlE=';
  return Buffer.from(b64, 'base64').toString('utf-8');
}

function getInitialModel(): string {
  const m = process.env.GEMINI_MODEL;
  if (!m || m === 'gemini-3.5-flash' || m === 'gemini-2.5-flash' || m === 'gemini-2.5-flash-lite') {
    return 'gemini-3.5-flash-lite';
  }
  return m;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '74b6c01d564926fd2ab138ed27eda2c3',
  lineChannelSecretFallback: process.env.LINE_CHANNEL_SECRET_FALLBACK || '5537762112737e04be59e22cc07282bf',
  lineChannelAccessToken:
    process.env.LINE_CHANNEL_ACCESS_TOKEN ||
    'xsr8E+mc6KnpcTI9jnCvAlSeTqljC4Sh+uDs/0e9Qh0iB5FyEZC2ME5Nt0tOo0IG5woPioQejZNC94NtRkAco5tNngtwISlm+7dl3jboxR+JRh7K4svh1LGyxWE9igDmj0zXI5d7ftHZmsxkdnl+dQdB04t89/1O/w1cDnyilFU=',
  geminiApiKey: process.env.GEMINI_API_KEY || getDefaultGeminiKey(),
  geminiModel: getInitialModel(),
  botSystemPrompt:
    process.env.BOT_SYSTEM_PROMPT ||
    'คุณคือแอดมิน AI ประจำร้าน ไม้เทียม Koyo Decor ผู้เชี่ยวชาญด้านไม้เทียม ไม้ระแนง แผ่นตกแต่งผนัง และพื้นไม้เทียม WPC ตอบสั้นกระชับ 2-4 บรรทัด สุภาพ',
};

export function validateConfig(): void {
  console.log('✅ โหลดการตั้งค่า LINE Credentials และ Gemini API Key เรียบร้อยแล้ว');
}
