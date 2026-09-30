import { messagingApi } from '@line/bot-sdk';
import { config } from './config.js';
import { askGemini } from './geminiService.js';
import { isGlobalBotEnabled, isUserPaused, pauseUser, unpauseUser, getChatHistory, appendChatHistory, bufferMessage, } from './sessionManager.js';
const { MessagingApiClient } = messagingApi;
let clientInstance = null;
function getLineClient() {
    if (!clientInstance) {
        clientInstance = new MessagingApiClient({
            channelAccessToken: config.lineChannelAccessToken,
        });
    }
    return clientInstance;
}
// คำสำคัญที่ลูกค้าใช้เพื่อขอคุยกับคนจริง
const HUMAN_REQUEST_KEYWORDS = [
    'ขอคุยกับคน',
    'คุยกับคน',
    'ติดต่อคน',
    'ติดต่อแอดมิน',
    'คุยกับแอดมิน',
    'ขอคุยแอดมิน',
    'แอดมินอยู่ไหม',
    'ติดต่อเจ้าหน้าที่',
    'ขอสายแอดมิน',
    'คุยกับเจ้าหน้าที่',
    'มีคนอยู่ไหม',
];
/**
 * ฟังก์ชันแยกข้อความตอบกลับของ AI เป็นหลายบับเบิ้ลตามตัวคั่น หรือตามโครงสร้างเนื้อหา
 */
function splitAiResponse(aiResponse) {
    if (!aiResponse)
        return [];
    // 1. หากมี delimiter ---SPLIT--- จากโมเดล
    if (aiResponse.includes('---SPLIT---')) {
        return aiResponse
            .split(/---+SPLIT---+/gi)
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
    }
    // 2. หากมีพิกัดแผนที่ ให้แยกบับเบิ้ลคำตอบกับบับเบิ้ลแผนที่ออกจากกันให้อ่านง่าย
    const mapIdx = aiResponse.search(/(📍\s*โชว์รูม|https:\/\/maps\.app\.goo\.gl)/);
    if (mapIdx > 15) {
        const part1 = aiResponse.slice(0, mapIdx).trim();
        const part2 = aiResponse.slice(mapIdx).trim();
        if (part1 && part2) {
            return [part1, part2];
        }
    }
    // 3. หากมีการเว้นบรรทัดห่างมาก (3 บรรทัดขึ้นไป)
    if (/\n{3,}/.test(aiResponse)) {
        return aiResponse
            .split(/\n{3,}/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
    }
    return [aiResponse.trim()];
}
/**
 * ส่งข้อความตอบกลับไปยัง LINE โดยลอง replyMessage ก่อน หากไม่สำเร็จจะ fallback ไป pushMessage
 */
async function sendLineReply(userId, replyToken, text) {
    const client = getLineClient();
    try {
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: text }],
        });
    }
    catch (replyError) {
        console.warn('⚠️ replyMessage ไม่สำเร็จ กำลังส่งผ่าน pushMessage แทน...');
        try {
            await client.pushMessage({
                to: userId,
                messages: [{ type: 'text', text: text }],
            });
        }
        catch (pushError) {
            console.error('❌ pushMessage เกิดข้อผิดพลาด:', pushError?.message || pushError);
        }
    }
}
/**
 * ส่งข้อความต่อเนื่องแบบมีจังหวะหน่วงเวลา (Sequential with delay) เพื่อให้อ่านง่ายและเป็นธรรมชาติ
 */
async function sendSequentialLineReply(userId, replyToken, chunks, delayMs = 1200) {
    if (!chunks || chunks.length === 0)
        return;
    const client = getLineClient();
    // กรณีมีบับเบิ้ลเดียว ส่งตามปกติทันที
    if (chunks.length === 1) {
        await sendLineReply(userId, replyToken, chunks[0]);
        return;
    }
    // ส่งบับเบิ้ลแรกผ่าน replyMessage
    try {
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: chunks[0] }],
        });
    }
    catch (err) {
        console.warn('⚠️ replyMessage บับเบิ้ลแรกไม่สำเร็จ กำลังส่งผ่าน pushMessage แทน...');
        try {
            await client.pushMessage({
                to: userId,
                messages: [{ type: 'text', text: chunks[0] }],
            });
        }
        catch (pushErr) {
            console.error('❌ pushMessage บับเบิ้ลแรกไม่สำเร็จ:', pushErr?.message || pushErr);
        }
    }
    // หน่วงเวลาและส่งบับเบิ้ลถัดไปผ่าน pushMessage
    for (let i = 1; i < chunks.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        try {
            await client.pushMessage({
                to: userId,
                messages: [{ type: 'text', text: chunks[i] }],
            });
        }
        catch (pushErr) {
            console.error(`❌ pushMessage บับเบิ้ลที่ ${i + 1} ไม่สำเร็จ:`, pushErr?.message || pushErr);
        }
    }
}
/**
 * ฟังก์ชันจัดการ Webhook Event ที่ได้รับจาก LINE Platform
 */
export async function handleLineEvent(event) {
    // ถ้าปิดบอททั้งระบบอยู่ ไม่ต้องตอบข้อความใดๆ ทั้งสิ้น (แอดมินตอบเอง)
    if (!isGlobalBotEnabled()) {
        console.log('🛑 บอทอยู่ในโหมดพักการทำงานทั้งระบบ -> ไม่ตอบแทรก');
        return;
    }
    const client = getLineClient();
    const userId = event.source?.userId || 'unknown_user';
    // กรณีผู้ใช้เพิ่มเพื่อน (Follow Event)
    if (event.type === 'follow') {
        if ('replyToken' in event && event.replyToken) {
            await client.replyMessage({
                replyToken: event.replyToken,
                messages: [
                    {
                        type: 'text',
                        text: 'สวัสดีครับ! ยินดีต้อนรับสู่ ร้านไม้เทียม Koyo Decor ครับ 🙏✨\nสนใจสอบถามข้อมูลไม้เทียม WPC, ไม้ ASA หรือแผ่นผนังรุ่นไหน พิมพ์บอกขนาดพื้นที่หรือสิ่งที่ต้องการได้เลยครับ!',
                    },
                ],
            });
        }
        return;
    }
    // รองรับเฉพาะประเภท message
    if (event.type !== 'message') {
        return;
    }
    const message = event.message;
    const replyToken = event.replyToken;
    if (!replyToken) {
        return;
    }
    // กรณีไม่ใช่ข้อความตัวอักษร
    if (message.type !== 'text') {
        // ถ้าบอทถูกสั่งพักอยู่ ไม่ต้องตอบแทรก
        if (isUserPaused(userId))
            return;
        let nonTextReply = 'ขอบคุณสำหรับข้อความครับ หากต้องการสอบถามข้อมูลสินค้า สามารถพิมพ์เป็นข้อความสอบถามได้เลยนะครับ 😊';
        if (message.type === 'image') {
            nonTextReply = 'ได้รับรูปภาพเรียบร้อยแล้วครับ หากมีขนาดพื้นที่หรือต้องการให้ช่วยประเมินราคา สามารถพิมพ์ระบุเพิ่มเติมได้เลยครับ 📷';
        }
        await sendLineReply(userId, replyToken, nonTextReply);
        return;
    }
    const rawText = message.text.trim();
    const lowerText = rawText.toLowerCase();
    // ==========================================
    // 1. คำสั่งสำหรับแอดมิน: สั่งพัก / สั่งเริ่มบอท
    // ==========================================
    if (lowerText === '#พัก' || lowerText === '#pause' || lowerText === '#หยุด' || lowerText === '#stop') {
        pauseUser(userId, 60 * 60 * 1000); // พัก 1 ชั่วโมง
        console.log(`🛑 แอดมินสั่งพักบอทสำหรับ User: ${userId}`);
        await sendLineReply(userId, replyToken, '🛑 พักการทำงานของ AI สำหรับห้องแชทนี้ชั่วคราว 1 ชั่วโมงครับ แอดมินสามารถคุยกับลูกค้าได้เลยครับ (หากต้องการเปิดบอทใหม่ให้พิมพ์ #เริ่ม)');
        return;
    }
    if (lowerText === '#เริ่ม' || lowerText === '#start' || lowerText === '#resume' || lowerText === '#on') {
        unpauseUser(userId);
        console.log(`▶️ แอดมินสั่งเปิดบอทสำหรับ User: ${userId}`);
        await sendLineReply(userId, replyToken, '▶️ บอท AI กลับมาทำงานและพร้อมตอบลูกค้าตามปกติแล้วครับ');
        return;
    }
    // ==========================================
    // 2. ถ้าห้องแชทนี้ "กำลังพักบอทอยู่" -> เงียบ ไม่ตอบแทรก
    // ==========================================
    if (isUserPaused(userId)) {
        console.log(`🤫 ห้องแชท ${userId} อยู่ในโหมดพักบอท -> AI ไม่ตอบแทรก`);
        return;
    }
    // ==========================================
    // 3. ตรวจจับคำขอคุยกับคนจริง (Auto Pause on Human Request)
    // ==========================================
    const isRequestingHuman = HUMAN_REQUEST_KEYWORDS.some((kw) => rawText.includes(kw));
    if (isRequestingHuman) {
        pauseUser(userId, 60 * 60 * 1000); // พัก 1 ชั่วโมง
        console.log(`🙋 ลูกค้าขอคุยกับคนจริง -> พักบอทอัตโนมัติสำหรับ User: ${userId}`);
        await sendLineReply(userId, replyToken, 'รับทราบครับผม ขออนุญาตประสานงานให้แอดมินเข้ามาดูแลสักครู่นะครับ 🙏 เจ้าหน้าที่จะรีบตอบกลับให้เร็วที่สุดครับ');
        return;
    }
    // ==========================================
    // 4. บัฟเฟอร์ข้อความ (Debounce 3.5s) เพื่อรวมข้อความที่พิมพ์รัวๆ
    // ==========================================
    console.log(`📩 ได้รับข้อความจาก [${userId.slice(-6)}]: "${rawText}" (เข้าคิวบัฟเฟอร์)`);
    bufferMessage(userId, rawText, replyToken, async (combinedText, latestToken) => {
        try {
            console.log(`🚀 กำลังประมวลผลข้อความรวม: "${combinedText}"`);
            const history = getChatHistory(userId);
            const aiResponse = await askGemini(combinedText, history);
            console.log(`🤖 AI ตอบกลับ: "${aiResponse.slice(0, 70)}..."`);
            // บันทึกประวัติการคุย
            appendChatHistory(userId, 'user', combinedText);
            appendChatHistory(userId, 'model', aiResponse);
            // แยกข้อความเป็นบับเบิ้ล (ถ้ามีตัวคั่น ---SPLIT--- หรือท่อนแยก)
            const chunks = splitAiResponse(aiResponse);
            console.log(`💬 ส่งข้อความทั้งหมด ${chunks.length} บับเบิ้ล (หน่วงเวลา 1.2 วินาทีระหว่างข้อความ)`);
            // ส่งคำตอบต่อเนื่องแบบมีจังหวะหน่วงเวลาให้อ่านง่าย
            await sendSequentialLineReply(userId, latestToken, chunks, 1200);
        }
        catch (err) {
            console.error('❌ ข้อผิดพลาดในการตอบกลับ:', err?.message || err);
        }
    });
}
//# sourceMappingURL=lineService.js.map