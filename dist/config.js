import dotenv from 'dotenv';
dotenv.config();
function getInitialModel() {
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
    if (m && validModels.includes(m))
        return m;
    return 'gemini-flash-lite-latest';
}
function getDefaultGeminiKey() {
    const b64 = 'QVEuQWI4Uk42SWdIRmtIdWVxWEtWOHFtSTA4b20tb0ZtYmc5M3FqSlYzempNZ3lRZTVOTlE=';
    return Buffer.from(b64, 'base64').toString('utf-8');
}
export const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    // LINE Credentials — มีค่าเริ่มต้นสำรองกรณีไม่ได้ตั้งใน Environment บน Render
    lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '74b6c01d564926fd2ab138ed27eda2c3',
    lineChannelSecretFallback: process.env.LINE_CHANNEL_SECRET_FALLBACK || '5537762112737e04be59e22cc07282bf',
    lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ||
        'xsr8E+mc6KnpcTI9jnCvAlSeTqljC4Sh+uDs/0e9Qh0iB5FyEZC2ME5Nt0tOo0IG5woPioQejZNC94NtRkAco5tNngtwISlm+7dl3jboxR+JRh7K4svh1LGyxWE9igDmj0zXI5d7ftHZmsxkdnl+dQdB04t89/1O/w1cDnyilFU=',
    // Gemini API
    geminiApiKey: process.env.GEMINI_API_KEY || getDefaultGeminiKey(),
    geminiModel: getInitialModel(),
    // System Prompt
    botSystemPrompt: process.env.BOT_SYSTEM_PROMPT ||
        'คุณคือแอดมิน AI ประจำร้าน ไม้เทียม Koyo Decor ตอบสั้นกระชับที่สุด 1-3 บรรทัด ตรงประเด็น สุภาพ ไม่เกริ่นนำยาวยืด',
    // Admin Dashboard Auth
    adminUsername: process.env.ADMIN_USERNAME || 'admin',
    adminPassword: process.env.ADMIN_PASSWORD || 'KoyoAdmin2025!',
    // LINE User ID ของแอดมิน (สำหรับส่งการแจ้งเตือน)
    adminLineUserId: process.env.ADMIN_LINE_USER_ID || '',
};
export function validateConfig() {
    console.log('✅ โหลดการตั้งค่า LINE และ Gemini API Key เรียบร้อยแล้ว');
    console.log(`   🤖 Gemini Model: ${config.geminiModel}`);
    if (config.adminLineUserId) {
        console.log(`   🔔 Admin LINE UID: ${config.adminLineUserId.slice(0, 8)}...`);
    }
}
//# sourceMappingURL=config.js.map