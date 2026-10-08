const sessions = new Map();
const MAX_HISTORY = 16;
const DEFAULT_PAUSE_DURATION = 30 * 60 * 1000; // ค่าเริ่มต้นพัก 30 นาที
const DEBOUNCE_WAIT_MS = 3500; // รอ 3.5 วินาทีเพื่อรวมข้อความรัวๆ
// Rate Limiting: จำกัดสูงสุด 10 ข้อความ ต่อ 1 นาที ต่อผู้ใช้
const RATE_LIMIT_COUNT = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
// Session Cleanup: ล้าง session ที่ไม่ active เกิน 24 ชั่วโมง
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // cleanup ทุก 30 นาที
let isGlobalEnabled = true;
let globalPausedUntil = 0; // timestamp ที่จะสิ้นสุดการพักบอททั้งระบบ
let dynamicAdminLineUserId = ''; // จำ userId ของแอดมินจากการส่งคำสั่งยืนยันตัวตนใน LINE
/**
 * ดึง LINE User ID ของแอดมิน (จาก Dynamic หรือ Environment Variable)
 */
export function getAdminLineUserId() {
    return dynamicAdminLineUserId;
}
/**
 * บันทึก LINE User ID ของแอดมินที่ล็อกอินผ่านแชท
 */
export function setAdminLineUserId(userId) {
    dynamicAdminLineUserId = userId;
    console.log(`🔑 ผูกบัญชีแอดมินสำเร็จกับ LINE User ID: ${userId.slice(-8)}`);
}
/**
 * ตรวจสอบว่าระบบบอทเปิดทำงานอยู่หรือไม่ (พร้อมระบบนับถอยหลังเปิดอัตโนมัติ)
 */
export function isGlobalBotEnabled() {
    if (!isGlobalEnabled) {
        // กรณีตั้งเวลาพักไว้ หากเลยเวลาแล้ว ให้เปิดอัตโนมัติ
        if (globalPausedUntil > 0 && Date.now() >= globalPausedUntil) {
            isGlobalEnabled = true;
            globalPausedUntil = 0;
            console.log('⏰ ครบกำหนดเวลาพัก AI (30 นาที) แล้ว -> ระบบเปิดทำงานอัตโนมัติตามปกติ');
            return true;
        }
        return false;
    }
    return true;
}
/**
 * สั่งพักบอททั้งระบบตามระยะเวลาที่กำหนด (ค่าเริ่มต้น 30 นาที)
 */
export function pauseGlobalBot(durationMs = DEFAULT_PAUSE_DURATION) {
    isGlobalEnabled = false;
    globalPausedUntil = durationMs > 0 ? Date.now() + durationMs : 0;
    const minutes = Math.round(durationMs / 60000);
    console.log(`🛑 พักการทำงานบอททั้งระบบเป็นเวลา ${minutes > 0 ? `${minutes} นาที` : 'ไม่มีกำหนด'} (จนถึง ${globalPausedUntil ? new Date(globalPausedUntil).toLocaleTimeString('th-TH') : 'แอดมินสั่งเปิด'})`);
    return { pausedUntil: globalPausedUntil, minutes };
}
/**
 * สั่งเปิดบอททั้งระบบให้กลับมาทำงานทันที
 */
export function resumeGlobalBot() {
    isGlobalEnabled = true;
    globalPausedUntil = 0;
    console.log('▶️ เปิดการทำงานของบอท AI ทั้งระบบเรียบร้อย');
}
/**
 * สั่งเปิดหรือปิดการทำงานของบอททั้งระบบ (รองรับความเข้ากันได้ย้อนหลัง)
 */
export function setGlobalBotEnabled(enabled, durationMs = DEFAULT_PAUSE_DURATION) {
    if (enabled) {
        resumeGlobalBot();
    }
    else {
        pauseGlobalBot(durationMs);
    }
}
/**
 * ดึงสถานะปัจจุบันของบอททั้งระบบ
 */
export function getGlobalBotStatus() {
    const enabled = isGlobalBotEnabled();
    const remainingMs = Math.max(0, globalPausedUntil - Date.now());
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    return {
        isEnabled: enabled,
        pausedUntil: globalPausedUntil,
        remainingMinutes: enabled ? 0 : remainingMinutes,
    };
}
function getOrCreateSession(userId) {
    let session = sessions.get(userId);
    if (!session) {
        session = {
            userId,
            isPaused: false,
            pausedUntil: 0,
            messageBuffer: [],
            lastReplyToken: '',
            debounceTimer: null,
            history: [],
            lastActive: Date.now(),
            messageTimestamps: [],
            lastCustomerMessageAt: 0,
        };
        sessions.set(userId, session);
    }
    session.lastActive = Date.now();
    return session;
}
/**
 * ตรวจสอบว่าห้องแชทของลูกค้ารายนี้กำลังอยู่ในโหมด "พักบอท" หรือไม่
 */
export function isUserPaused(userId) {
    const session = sessions.get(userId);
    if (!session)
        return false;
    if (session.isPaused) {
        if (Date.now() < session.pausedUntil) {
            return true;
        }
        else {
            // หมดเวลาพักแล้ว ให้เปิดบอทอัตโนมัติ
            session.isPaused = false;
            session.pausedUntil = 0;
            return false;
        }
    }
    return false;
}
/**
 * สั่งพักบอทสำหรับลูกค้ารายนี้ (เช่น แอดมินเข้าไปคุยเอง หรือลูกค้าขอคุยกับคน)
 */
export function pauseUser(userId, durationMs = DEFAULT_PAUSE_DURATION) {
    const session = getOrCreateSession(userId);
    session.isPaused = true;
    session.pausedUntil = Date.now() + durationMs;
    if (session.debounceTimer) {
        clearTimeout(session.debounceTimer);
        session.debounceTimer = null;
    }
    session.messageBuffer = [];
}
/**
 * สั่งยกเลิกการพักบอท เพื่อให้ AI กลับมาตอบแชทตามปกติ
 */
export function unpauseUser(userId) {
    const session = getOrCreateSession(userId);
    session.isPaused = false;
    session.pausedUntil = 0;
}
/**
 * ถ้าห้องนี้กำลังพักบอทอยู่ ให้ต่อเวลาพักออกไปใหม่ (นับใหม่จากตอนนี้)
 * ใช้ตอนลูกค้าพิมพ์เข้ามาระหว่างที่แอดมินคุยอยู่ เพื่อไม่ให้บอทกลับมาตอบแทรกกลางบทสนทนา
 * คืนค่า true หากห้องนี้กำลังพักอยู่
 */
export function extendUserPauseIfActive(userId, durationMs = DEFAULT_PAUSE_DURATION) {
    if (!isUserPaused(userId))
        return false;
    const session = getOrCreateSession(userId);
    session.pausedUntil = Date.now() + durationMs;
    return true;
}
/**
 * ดึงเวลาที่ห้องนี้จะเลิกพักบอท (0 = ไม่ได้พัก)
 */
export function getUserPausedUntil(userId) {
    return isUserPaused(userId) ? sessions.get(userId).pausedUntil : 0;
}
/**
 * รหัสสั้นของลูกค้า (6 ตัวท้ายของ userId) ใช้อ้างอิงห้องแชทในคำสั่งแอดมิน
 */
export function getShortCode(userId) {
    return userId.slice(-6).toUpperCase();
}
/**
 * ค้นหา userId จากรหัสสั้น 6 ตัว (เฉพาะลูกค้าที่มี session อยู่ในระบบ)
 */
export function findUserIdByShortCode(code) {
    const target = code.trim().toUpperCase();
    for (const userId of sessions.keys()) {
        if (getShortCode(userId) === target)
            return userId;
    }
    return null;
}
/**
 * บันทึกว่าลูกค้าส่งข้อความเข้ามา และคืนค่า true หากเป็นการเริ่มคุยรอบใหม่
 * (ไม่เคยคุย หรือเงียบไปนานเกิน 30 นาที)
 */
export function markCustomerMessage(userId) {
    const session = getOrCreateSession(userId);
    const now = Date.now();
    const isNew = now - session.lastCustomerMessageAt > DEFAULT_PAUSE_DURATION;
    session.lastCustomerMessageAt = now;
    return isNew;
}
/**
 * ดึงประวัติการคุยล่าสุด
 */
export function getChatHistory(userId) {
    const session = getOrCreateSession(userId);
    return session.history;
}
/**
 * บันทึกข้อความลงประวัติการสนทนา
 */
export function appendChatHistory(userId, role, text) {
    const session = getOrCreateSession(userId);
    session.history.push({ role, parts: text });
    if (session.history.length > MAX_HISTORY) {
        session.history = session.history.slice(session.history.length - MAX_HISTORY);
    }
}
/**
 * ตรวจสอบ Rate Limit: คืน true หากส่งข้อความมากเกิน 10 ครั้ง/นาที
 */
export function isRateLimited(userId) {
    const session = getOrCreateSession(userId);
    const now = Date.now();
    // กรองเฉพาะ timestamps ภายใน window
    session.messageTimestamps = session.messageTimestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
    if (session.messageTimestamps.length >= RATE_LIMIT_COUNT) {
        return true;
    }
    session.messageTimestamps.push(now);
    return false;
}
/**
 * บัฟเฟอร์ข้อความเพื่อรวบรวมข้อความที่ส่งมาติดๆ กันใน 3.5 วินาที
 */
export function bufferMessage(userId, text, replyToken, onDebounceDone) {
    const session = getOrCreateSession(userId);
    session.messageBuffer.push(text);
    session.lastReplyToken = replyToken;
    if (session.debounceTimer) {
        clearTimeout(session.debounceTimer);
    }
    session.debounceTimer = setTimeout(() => {
        const combined = session.messageBuffer.join(' ');
        const token = session.lastReplyToken;
        session.messageBuffer = [];
        session.debounceTimer = null;
        if (combined.trim()) {
            onDebounceDone(combined.trim(), token);
        }
    }, DEBOUNCE_WAIT_MS);
}
/**
 * ล้าง session ที่ไม่มีการใช้งานเกิน SESSION_TTL_MS (24 ชั่วโมง)
 * เพื่อป้องกัน Memory Leak
 */
function cleanupInactiveSessions() {
    const now = Date.now();
    let cleaned = 0;
    for (const [userId, session] of sessions.entries()) {
        if (now - session.lastActive > SESSION_TTL_MS) {
            // ยกเลิก debounce timer ก่อนลบ
            if (session.debounceTimer) {
                clearTimeout(session.debounceTimer);
            }
            sessions.delete(userId);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 Session Cleanup: ล้าง ${cleaned} session ที่ไม่ active (เหลือ ${sessions.size} sessions)`);
    }
}
// เริ่ม cleanup interval ทุก 30 นาที
setInterval(cleanupInactiveSessions, CLEANUP_INTERVAL_MS);
console.log(`⏰ Session Cleanup เริ่มทำงานทุก ${CLEANUP_INTERVAL_MS / 60000} นาที`);
//# sourceMappingURL=sessionManager.js.map