import { messagingApi } from '@line/bot-sdk';
import { config } from './config.js';
import { askGemini, askGeminiWithImage } from './geminiService.js';
import { isGlobalBotEnabled, isUserPaused, isRateLimited, pauseUser, unpauseUser, getChatHistory, appendChatHistory, bufferMessage, } from './sessionManager.js';
import { sanitizeText } from './spellChecker.js';
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
// คำสำคัญที่ลูกค้าใช้เพื่อขอคุยกับคนจริง (รวมคำที่สะกดผิด พิมพ์ตก หรือภาษาแชท)
const HUMAN_REQUEST_KEYWORDS = [
    'ขอคุยกับคน',
    'คุยกับคน',
    'คุยกะคน',
    'คุยกับคนจิง',
    'ขอคุยคน',
    'ติดต่อคน',
    'ติดต่อแอดมิน',
    'คุยกับแอดมิน',
    'คุยกะแอดมิน',
    'ขอคุยแอดมิน',
    'แอดมินอยู่ไหม',
    'แอดมินอยุ่ไหม',
    'แอดมินยุไหม',
    'ติดต่อเจ้าหน้าที่',
    'ติดต่อจนท',
    'ขอสายแอดมิน',
    'คุยกับเจ้าหน้าที่',
    'มีคนอยู่ไหม',
    'มีคนอยุ่ไหม',
    'มีคนมั้ย',
    'มีคนป่าว',
    'ช่วยด้วย',
    'รีบด่วน',
];
/**
 * ส่งการแจ้งเตือนไปยัง LINE ของแอดมิน (กรณีตั้งค่า ADMIN_LINE_USER_ID ไว้)
 */
async function notifyAdmin(message) {
    if (!config.adminLineUserId)
        return;
    try {
        const client = getLineClient();
        await client.pushMessage({
            to: config.adminLineUserId,
            messages: [{ type: 'text', text: message }],
        });
        console.log(`🔔 แจ้งเตือนแอดมินสำเร็จ`);
    }
    catch (err) {
        console.warn(`⚠️ แจ้งเตือนแอดมินไม่สำเร็จ: ${err?.message}`);
    }
}
/**
 * ดึงข้อมูลรูปภาพจาก LINE Content API แล้วแปลงเป็น base64
 */
async function fetchLineImageAsBase64(messageId) {
    try {
        const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${config.lineChannelAccessToken}`,
            },
        });
        if (!response.ok) {
            console.warn(`⚠️ ดึงรูปภาพจาก LINE ไม่สำเร็จ: ${response.status}`);
            return null;
        }
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return { base64, mimeType: contentType };
    }
    catch (err) {
        console.error(`❌ fetchLineImageAsBase64 error: ${err?.message}`);
        return null;
    }
}
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
    const cleanText = sanitizeText(text);
    const client = getLineClient();
    try {
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: cleanText }],
        });
    }
    catch (replyError) {
        console.warn('⚠️ replyMessage ไม่สำเร็จ กำลังส่งผ่าน pushMessage แทน...');
        try {
            await client.pushMessage({
                to: userId,
                messages: [{ type: 'text', text: cleanText }],
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
    const cleanChunks = chunks.map((c) => sanitizeText(c)).filter((c) => c.length > 0);
    if (cleanChunks.length === 0)
        return;
    const client = getLineClient();
    // กรณีมีบับเบิ้ลเดียว ส่งตามปกติทันที
    if (cleanChunks.length === 1) {
        await sendLineReply(userId, replyToken, cleanChunks[0]);
        return;
    }
    // ส่งบับเบิ้ลแรกผ่าน replyMessage
    try {
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: cleanChunks[0] }],
        });
    }
    catch (err) {
        console.warn('⚠️ replyMessage บับเบิ้ลแรกไม่สำเร็จ กำลังส่งผ่าน pushMessage แทน...');
        try {
            await client.pushMessage({
                to: userId,
                messages: [{ type: 'text', text: cleanChunks[0] }],
            });
        }
        catch (pushErr) {
            console.error('❌ pushMessage บับเบิ้ลแรกไม่สำเร็จ:', pushErr?.message || pushErr);
        }
    }
    // หน่วงเวลาและส่งบับเบิ้ลถัดไปผ่าน pushMessage
    for (let i = 1; i < cleanChunks.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        try {
            await client.pushMessage({
                to: userId,
                messages: [{ type: 'text', text: cleanChunks[i] }],
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
    // =========================================
    // กรณีผู้ใช้เพิ่มเพื่อน (Follow Event)
    // =========================================
    if (event.type === 'follow') {
        console.log(`👤 ผู้ใช้ใหม่ Follow: ${userId}`);
        // แจ้งแอดมินมีลูกค้าใหม่
        await notifyAdmin(`👤 มีลูกค้าใหม่ Add LINE ร้าน!\nUser ID: ${userId.slice(-8)}\nเวลา: ${new Date().toLocaleString('th-TH')}`);
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
    // =========================================
    // 1. Rate Limiting — กันสแปม
    // =========================================
    if (isRateLimited(userId)) {
        console.warn(`🚫 Rate Limited: ${userId.slice(-6)} ส่งข้อความเกิน 10 ครั้ง/นาที`);
        await sendLineReply(userId, replyToken, '⏳ ส่งข้อความถี่เกินไปครับ กรุณารอสักครู่แล้วลองใหม่อีกครั้งนะครับ 🙏');
        return;
    }
    // =========================================
    // 2. จัดการรูปภาพ (Vision AI)
    // =========================================
    if (message.type === 'image') {
        if (isUserPaused(userId))
            return;
        console.log(`🖼️ ได้รับรูปภาพจาก [${userId.slice(-6)}] — กำลังวิเคราะห์ด้วย Gemini Vision...`);
        await sendLineReply(userId, replyToken, '📷 ได้รับรูปภาพแล้วครับ กำลังวิเคราะห์หน้างานให้สักครู่นะครับ...');
        const imageData = await fetchLineImageAsBase64(message.id);
        if (!imageData) {
            await client.pushMessage({
                to: userId,
                messages: [{
                        type: 'text',
                        text: 'ขออภัยครับ ดาวน์โหลดรูปภาพไม่สำเร็จ กรุณาส่งรูปใหม่อีกครั้ง หรือแจ้งขนาดพื้นที่เป็นตัวเลขได้เลยครับ',
                    }],
            });
            return;
        }
        const history = getChatHistory(userId);
        const visionCaption = 'ลูกค้าส่งรูปหน้างานมา กรุณาวิเคราะห์รูปและแนะนำสินค้าของ KOYO DECOR ที่เหมาะสม พร้อมถามขนาดพื้นที่เพื่อประเมินงบประมาณเบื้องต้น';
        const aiResponse = await askGeminiWithImage(imageData.base64, imageData.mimeType, visionCaption, history);
        appendChatHistory(userId, 'user', '[ลูกค้าส่งรูปภาพหน้างานมา]');
        appendChatHistory(userId, 'model', aiResponse);
        const chunks = splitAiResponse(aiResponse);
        await new Promise((r) => setTimeout(r, 800)); // รอก่อนส่งคำตอบ Vision
        for (let i = 0; i < chunks.length; i++) {
            if (i > 0)
                await new Promise((r) => setTimeout(r, 1200));
            await client.pushMessage({
                to: userId,
                messages: [{ type: 'text', text: sanitizeText(chunks[i]) }],
            });
        }
        return;
    }
    // กรณีไม่ใช่ข้อความตัวอักษร และไม่ใช่รูปภาพ (sticker, video, audio ฯลฯ)
    if (message.type !== 'text') {
        if (isUserPaused(userId))
            return;
        await sendLineReply(userId, replyToken, 'ขอบคุณสำหรับข้อความครับ หากต้องการสอบถามข้อมูลสินค้า สามารถพิมพ์เป็นข้อความหรือส่งรูปหน้างานมาได้เลยนะครับ 😊');
        return;
    }
    const rawText = message.text.trim();
    const lowerText = rawText.toLowerCase();
    // ==========================================
    // 3. คำสั่งสำหรับแอดมิน: สั่งพัก / สั่งเริ่มบอท
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
    // 4. ถ้าห้องแชทนี้ "กำลังพักบอทอยู่" -> เงียบ ไม่ตอบแทรก
    // ==========================================
    if (isUserPaused(userId)) {
        console.log(`🤫 ห้องแชท ${userId} อยู่ในโหมดพักบอท -> AI ไม่ตอบแทรก`);
        return;
    }
    // ==========================================
    // 5. ตรวจจับคำขอคุยกับคนจริง (Auto Pause + แจ้งเตือนแอดมิน)
    // ==========================================
    const isRequestingHuman = HUMAN_REQUEST_KEYWORDS.some((kw) => rawText.includes(kw));
    if (isRequestingHuman) {
        pauseUser(userId, 60 * 60 * 1000); // พัก 1 ชั่วโมง
        console.log(`🙋 ลูกค้าขอคุยกับคนจริง -> พักบอทอัตโนมัติสำหรับ User: ${userId}`);
        // แจ้งเตือนแอดมินทันที
        await notifyAdmin(`🙋 ลูกค้าขอคุยกับแอดมิน!\n` +
            `User ID: ...${userId.slice(-8)}\n` +
            `ข้อความ: "${rawText}"\n` +
            `เวลา: ${new Date().toLocaleString('th-TH')}\n` +
            `⚠️ AI หยุดตอบแล้ว รอแอดมินเข้าดูแลด้วยครับ`);
        await sendLineReply(userId, replyToken, 'รับทราบครับผม ขออนุญาตประสานงานให้แอดมินเข้ามาดูแลสักครู่นะครับ 🙏 เจ้าหน้าที่จะรีบตอบกลับให้เร็วที่สุดครับ');
        return;
    }
    // ==========================================
    // 6. บัฟเฟอร์ข้อความ (Debounce 3.5s) เพื่อรวมข้อความที่พิมพ์รัวๆ
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