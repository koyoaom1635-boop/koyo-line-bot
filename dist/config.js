import dotenv from 'dotenv';
dotenv.config();
export const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '',
    lineChannelSecretFallback: process.env.LINE_CHANNEL_SECRET_FALLBACK || '',
    lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    botSystemPrompt: process.env.BOT_SYSTEM_PROMPT ||
        'คุณคือ AI Assistant ประจำ LINE Official Account ที่เป็นมิตร สุภาพ พูดจาไพเราะ ตอบคำถามด้วยภาษาไทยที่เข้าใจง่าย กระชับ และตรงประเด็น',
};
export function validateConfig() {
    const missingKeys = [];
    if (!config.lineChannelSecret || config.lineChannelSecret.includes('your_line_channel_secret')) {
        missingKeys.push('LINE_CHANNEL_SECRET');
    }
    if (!config.lineChannelAccessToken || config.lineChannelAccessToken.includes('your_line_channel_access_token')) {
        missingKeys.push('LINE_CHANNEL_ACCESS_TOKEN');
    }
    if (!config.geminiApiKey || config.geminiApiKey.includes('your_gemini_api_key')) {
        missingKeys.push('GEMINI_API_KEY');
    }
    if (missingKeys.length > 0) {
        console.warn('\n⚠️ [คำเตือนการตั้งค่า] พบตัวแปรใน .env ที่ยังไม่ได้ระบุค่าที่แท้จริง:');
        missingKeys.forEach((key) => console.warn(`   - ${key}`));
        console.warn('👉 กรุณาใส่ค่าจริงในไฟล์ .env ก่อนเริ่มส่งข้อความทดสอบกับ LINE Bot\n');
    }
    else {
        console.log('✅ โหลดการตั้งค่า LINE Credentials และ Gemini API Key เรียบร้อยแล้ว');
    }
}
//# sourceMappingURL=config.js.map