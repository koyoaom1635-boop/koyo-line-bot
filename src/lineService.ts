import { messagingApi, webhook } from '@line/bot-sdk';
import { config } from './config.js';
import { askGemini, askGeminiWithImage } from './geminiService.js';
import {
  isGlobalBotEnabled,
  isUserPaused,
  isRateLimited,
  pauseUser,
  unpauseUser,
  getChatHistory,
  appendChatHistory,
  bufferMessage,
  pauseGlobalBot,
  resumeGlobalBot,
  getGlobalBotStatus,
  getAdminLineUserId,
  setAdminLineUserId,
} from './sessionManager.js';
import { sanitizeText } from './spellChecker.js';

const { MessagingApiClient } = messagingApi;

let clientInstance: messagingApi.MessagingApiClient | null = null;

function getLineClient(): messagingApi.MessagingApiClient {
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
 * ส่งการแจ้งเตือนไปยัง LINE ของแอดมิน พร้อมปุ่ม/ลิงก์ลัดกดพัก AI 30 นาทีทันที
 */
async function notifyAdmin(message: string): Promise<void> {
  const adminId = getAdminLineUserId() || config.adminLineUserId;
  if (!adminId) return;
  try {
    const client = getLineClient();
    const quickPauseUrl = `https://koyo-line-bot.onrender.com/pause?key=${encodeURIComponent(config.adminPassword)}&mins=30`;
    await client.pushMessage({
      to: adminId,
      messages: [
        {
          type: 'text',
          text: `${message}\n\n🛑 กดเพื่อพัก AI 30 นาที (ไม่ต้องพิมพ์รหัส):\n${quickPauseUrl}`,
        },
      ],
    });
    console.log(`🔔 แจ้งเตือนแอดมินสำเร็จ (${adminId.slice(-8)})`);
  } catch (err: any) {
    console.warn(`⚠️ แจ้งเตือนแอดมินไม่สำเร็จ: ${err?.message}`);
  }
}

/**
 * ดึงข้อมูลรูปภาพจาก LINE Content API แล้วแปลงเป็น base64
 */
async function fetchLineImageAsBase64(messageId: string): Promise<{ base64: string; mimeType: string } | null> {
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
  } catch (err: any) {
    console.error(`❌ fetchLineImageAsBase64 error: ${err?.message}`);
    return null;
  }
}

/**
 * ฟังก์ชันแยกข้อความตอบกลับของ AI เป็นหลายบับเบิ้ลตามตัวคั่น หรือตามโครงสร้างเนื้อหา
 */
function splitAiResponse(aiResponse: string): string[] {
  if (!aiResponse) return [];

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
async function sendLineReply(
  userId: string,
  replyToken: string,
  text: string
): Promise<void> {
  const cleanText = sanitizeText(text);
  const client = getLineClient();
  try {
    await client.replyMessage({
      replyToken: replyToken,
      messages: [{ type: 'text', text: cleanText }],
    });
  } catch (replyError: any) {
    console.warn('⚠️ replyMessage ไม่สำเร็จ กำลังส่งผ่าน pushMessage แทน...');
    try {
      await client.pushMessage({
        to: userId,
        messages: [{ type: 'text', text: cleanText }],
      });
    } catch (pushError: any) {
      console.error('❌ pushMessage เกิดข้อผิดพลาด:', pushError?.message || pushError);
    }
  }
}

/**
 * ส่งข้อความต่อเนื่องแบบมีจังหวะหน่วงเวลา (Sequential with delay) เพื่อให้อ่านง่ายและเป็นธรรมชาติ
 */
async function sendSequentialLineReply(
  userId: string,
  replyToken: string,
  chunks: string[],
  delayMs: number = 1200
): Promise<void> {
  if (!chunks || chunks.length === 0) return;

  const cleanChunks = chunks.map((c) => sanitizeText(c)).filter((c) => c.length > 0);
  if (cleanChunks.length === 0) return;

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
  } catch (err: any) {
    console.warn('⚠️ replyMessage บับเบิ้ลแรกไม่สำเร็จ กำลังส่งผ่าน pushMessage แทน...');
    try {
      await client.pushMessage({
        to: userId,
        messages: [{ type: 'text', text: cleanChunks[0] }],
      });
    } catch (pushErr: any) {
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
    } catch (pushErr: any) {
      console.error(`❌ pushMessage บับเบิ้ลที่ ${i + 1} ไม่สำเร็จ:`, pushErr?.message || pushErr);
    }
  }
}

/**
 * ฟังก์ชันจัดการ Webhook Event ที่ได้รับจาก LINE Platform
 */
export async function handleLineEvent(event: webhook.Event): Promise<void> {
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
    await sendLineReply(
      userId,
      replyToken,
      '⏳ ส่งข้อความถี่เกินไปครับ กรุณารอสักครู่แล้วลองใหม่อีกครั้งนะครับ 🙏'
    );
    return;
  }

  // =========================================
  // 2. จัดการรูปภาพ (Vision AI)
  // =========================================
  if (message.type === 'image') {
    if (isUserPaused(userId)) return;

    console.log(`🖼️ ได้รับรูปภาพจาก [${userId.slice(-6)}] — กำลังวิเคราะห์ด้วย Gemini Vision...`);
    await sendLineReply(
      userId,
      replyToken,
      '📷 ได้รับรูปภาพแล้วครับ กำลังวิเคราะห์หน้างานให้สักครู่นะครับ...'
    );

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
      if (i > 0) await new Promise((r) => setTimeout(r, 1200));
      await client.pushMessage({
        to: userId,
        messages: [{ type: 'text', text: sanitizeText(chunks[i]) }],
      });
    }
    return;
  }

  // กรณีไม่ใช่ข้อความตัวอักษร และไม่ใช่รูปภาพ (sticker, video, audio ฯลฯ)
  if (message.type !== 'text') {
    if (isUserPaused(userId)) return;
    await sendLineReply(
      userId,
      replyToken,
      'ขอบคุณสำหรับข้อความครับ หากต้องการสอบถามข้อมูลสินค้า สามารถพิมพ์เป็นข้อความหรือส่งรูปหน้างานมาได้เลยนะครับ 😊'
    );
    return;
  }

  const rawText = message.text.trim();
  const lowerText = rawText.toLowerCase();

  // ==========================================
  // 3. คำสั่งสำหรับแอดมิน: สั่งพัก / สั่งเริ่มบอท ผ่านแชท LINE โดยตรง
  // ==========================================
  const currentAdminId = getAdminLineUserId() || config.adminLineUserId;
  const hasAdminPassword = config.adminPassword && rawText.includes(config.adminPassword);
  const isSenderAdmin = (currentAdminId && userId === currentAdminId) || hasAdminPassword;

  if (isSenderAdmin) {
    // บันทึก userId ของแอดมินอัตโนมัติเมื่อพิมพ์คำสั่งที่มีรหัสผ่าน
    if (!getAdminLineUserId()) {
      setAdminLineUserId(userId);
    }

    // ตัดรหัสผ่านออกจากข้อความคำสั่ง (ถ้ามี)
    const cleanCmd = (hasAdminPassword ? rawText.replace(config.adminPassword, '') : rawText)
      .replace(/^#/, '')
      .trim()
      .toLowerCase();

    // 3.1 สั่งพัก AI 30 นาที (ทั้งระบบ)
    if (
      cleanCmd === 'พัก 30' ||
      cleanCmd === 'พัก' ||
      cleanCmd === 'หยุด' ||
      cleanCmd === 'หยุด 30' ||
      cleanCmd === 'pause 30' ||
      cleanCmd === 'pause' ||
      cleanCmd === 'stop' ||
      cleanCmd === 'พักครึ่งชั่วโมง' ||
      cleanCmd === 'พักครึ่งชม' ||
      cleanCmd === '30'
    ) {
      const result = pauseGlobalBot(30 * 60 * 1000);
      const timeStr = new Date(result.pausedUntil).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      await sendLineReply(
        userId,
        replyToken,
        `🛑 สั่งพัก AI ทั้งระบบ 30 นาที เรียบร้อยแล้วครับ!\n\nแอดมินสามารถคุยกับลูกค้าได้เลยโดยบอทจะไม่ตอบแทรกครับ\n⏰ ระบบจะเปิดตัวเองอัตโนมัติเวลา ${timeStr} น. (หรือพิมพ์ "เปิด" หากคุยเสร็จก่อนครับ)`
      );
      return;
    }

    // 3.2 สั่งพัก AI 1 ชั่วโมง (ทั้งระบบ)
    if (cleanCmd === 'พัก 60' || cleanCmd === 'พัก 1 ชม' || cleanCmd === 'พัก 1 ชั่วโมง' || cleanCmd === 'pause 60' || cleanCmd === '60') {
      const result = pauseGlobalBot(60 * 60 * 1000);
      const timeStr = new Date(result.pausedUntil).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      await sendLineReply(
        userId,
        replyToken,
        `⏳ สั่งพัก AI ทั้งระบบ 1 ชั่วโมง เรียบร้อยแล้วครับ!\n\n⏰ ระบบจะเปิดตัวเองอัตโนมัติเวลา ${timeStr} น.`
      );
      return;
    }

    // 3.3 สั่งเปิด AI ทันที (ทั้งระบบ)
    if (
      cleanCmd === 'เปิด' ||
      cleanCmd === 'เริ่ม' ||
      cleanCmd === 'resume' ||
      cleanCmd === 'start' ||
      cleanCmd === 'on'
    ) {
      resumeGlobalBot();
      await sendLineReply(
        userId,
        replyToken,
        '▶️ เปิดการทำงาน AI ทั้งระบบเรียบร้อยแล้วครับ! บอทพร้อมตอบลูกค้าตามปกติต่อเนื่องทันที 🟢'
      );
      return;
    }

    // 3.4 สั่งตรวจสอบสถานะ
    if (cleanCmd === 'สถานะ' || cleanCmd === 'status') {
      const status = getGlobalBotStatus();
      if (status.isEnabled) {
        await sendLineReply(
          userId,
          replyToken,
          '🟢 สถานะ AI: กำลังทำงานตามปกติ (พร้อมตอบลูกค้าทุกคน)'
        );
      } else {
        const timeStr = status.pausedUntil > 0 ? new Date(status.pausedUntil).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : 'ไม่จำกัดเวลา';
        await sendLineReply(
          userId,
          replyToken,
          `🔴 สถานะ AI: กำลังพักการทำงาน\n⏳ เหลือเวลาอีกประมาณ ${status.remainingMinutes} นาที (จะเปิดอัตโนมัติเวลา ${timeStr} น.)\n\n💡 พิมพ์ "เปิด" เพื่อเปิดบอททันที`
        );
      }
      return;
    }

    // 3.5 กรณีพิมพ์รหัสผ่านเพื่อจับคู่แอดมิน
    if (cleanCmd === '' || cleanCmd === 'admin') {
      await sendLineReply(
        userId,
        replyToken,
        '🔑 ยืนยันตัวตนแอดมินสำเร็จแล้วครับ! จากนี้คุณสามารถสั่งงานบอทใน LINE นี้ได้เลยครับ:\n\n- พิมพ์ "พัก 30" เพื่อพักบอท 30 นาที\n- พิมพ์ "เปิด" เพื่อเปิดบอททันที\n- พิมพ์ "สถานะ" เพื่อเช็คเวลาที่เหลือ'
      );
      return;
    }
  }

  // คำสั่งพักเฉพาะห้องแชทนี้ (สำหรับกรณีแอดมินหรือลูกค้าพิมพ์ #พัก ในห้องลูกค้า)
  if (lowerText === '#พัก' || lowerText === '#pause' || lowerText === '#หยุด' || lowerText === '#stop') {
    pauseUser(userId, 30 * 60 * 1000); // พัก 30 นาที
    console.log(`🛑 สั่งพักบอทสำหรับห้องแชท User: ${userId} (30 นาที)`);
    await sendLineReply(
      userId,
      replyToken,
      '🛑 พักการทำงานของ AI สำหรับห้องแชทนี้ชั่วคราว 30 นาทีครับ แอดมินสามารถคุยกับลูกค้าได้เลยครับ ระบบจะเปิดตัวเองอัตโนมัติเมื่อครบเวลา (หรือพิมพ์ #เริ่ม เพื่อเปิดทันที)'
    );
    return;
  }

  if (lowerText === '#เริ่ม' || lowerText === '#start' || lowerText === '#resume' || lowerText === '#on') {
    unpauseUser(userId);
    console.log(`▶️ สั่งเปิดบอทสำหรับ User: ${userId}`);
    await sendLineReply(
      userId,
      replyToken,
      '▶️ บอท AI กลับมาทำงานและพร้อมตอบลูกค้าตามปกติแล้วครับ'
    );
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
  // 5. ตรวจจับคำขอคุยกับคนจริง (Auto Pause 30 นาที + แจ้งเตือนแอดมิน)
  // ==========================================
  const isRequestingHuman = HUMAN_REQUEST_KEYWORDS.some((kw) => rawText.includes(kw));
  if (isRequestingHuman) {
    pauseUser(userId, 30 * 60 * 1000); // พัก 30 นาที
    console.log(`🙋 ลูกค้าขอคุยกับคนจริง -> พักบอทอัตโนมัติ 30 นาทีสำหรับ User: ${userId}`);

    // แจ้งเตือนแอดมินทันที
    await notifyAdmin(
      `🙋 ลูกค้าขอคุยกับแอดมิน!\n` +
      `User ID: ...${userId.slice(-8)}\n` +
      `ข้อความ: "${rawText}"\n` +
      `เวลา: ${new Date().toLocaleString('th-TH')}\n` +
      `⚠️ AI พักการตอบห้องนี้ 30 นาทีแล้ว รอแอดมินเข้าดูแลครับ`
    );

    await sendLineReply(
      userId,
      replyToken,
      'รับทราบครับผม ขออนุญาตประสานงานให้แอดมินเข้ามาดูแลสักครู่นะครับ 🙏 เจ้าหน้าที่จะรีบตอบกลับให้เร็วที่สุดครับ'
    );
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
    } catch (err: any) {
      console.error('❌ ข้อผิดพลาดในการตอบกลับ:', err?.message || err);
    }
  });
}
