import dotenv from 'dotenv';
dotenv.config();
function getInitialModel() {
    const m = process.env.GEMINI_MODEL;
    // โมเดลเริ่มต้น: gemini-2.0-flash (เร็ว ประหยัด ดีสำหรับแชทบอท)
    const validModels = [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash',
        'gemini-1.5-flash-8b',
        'gemini-1.5-pro',
    ];
    if (m && validModels.includes(m))
        return m;
    return 'gemini-2.0-flash';
}
export const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    // LINE Credentials — ต้องกำหนดใน .env เสมอ
    lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '',
    lineChannelSecretFallback: process.env.LINE_CHANNEL_SECRET_FALLBACK || '',
    lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    // Gemini API
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: getInitialModel(),
    // System Prompt
    botSystemPrompt: process.env.BOT_SYSTEM_PROMPT ||
        'คุณคือแอดมิน AI ประจำร้าน ไม้เทียม Koyo Decor ผู้เชี่ยวชาญด้านไม้เทียม ไม้ระแนง แผ่นตกแต่งผนัง และพื้นไม้เทียม WPC ตอบสั้นกระชับ 2-4 บรรทัด สุภาพ',
    // Admin Dashboard Auth
    adminUsername: process.env.ADMIN_USERNAME || 'admin',
    adminPassword: process.env.ADMIN_PASSWORD || '',
    // LINE User ID ของแอดมิน (สำหรับส่งการแจ้งเตือน)
    adminLineUserId: process.env.ADMIN_LINE_USER_ID || '',
};
export function validateConfig() {
    const errors = [];
    if (!config.lineChannelSecret)
        errors.push('LINE_CHANNEL_SECRET');
    if (!config.lineChannelAccessToken)
        errors.push('LINE_CHANNEL_ACCESS_TOKEN');
    if (!config.geminiApiKey)
        errors.push('GEMINI_API_KEY');
    if (!config.adminPassword)
        errors.push('ADMIN_PASSWORD (สำหรับหน้า Admin Dashboard)');
    if (errors.length > 0) {
        console.error('❌ ตั้งค่าไม่ครบ! กรุณากำหนดค่าต่อไปนี้ใน .env:');
        errors.forEach((e) => console.error(`   - ${e}`));
        if (errors.includes('LINE_CHANNEL_SECRET') || errors.includes('LINE_CHANNEL_ACCESS_TOKEN') || errors.includes('GEMINI_API_KEY')) {
            process.exit(1);
        }
    }
    else {
        console.log('✅ โหลดการตั้งค่าทั้งหมดเรียบร้อยแล้ว');
        console.log(`   🤖 Gemini Model: ${config.geminiModel}`);
        console.log(`   🔔 Admin LINE UID: ${config.adminLineUserId ? config.adminLineUserId.slice(0, 8) + '...' : 'ไม่ได้ตั้งค่า (ปิดการแจ้งเตือน)'}`);
    }
}
//# sourceMappingURL=config.js.map