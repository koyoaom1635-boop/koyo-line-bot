const sessions = new Map();
const MAX_HISTORY = 10;
const DEFAULT_PAUSE_DURATION = 60 * 60 * 1000; // 1 ชั่วโมง
const DEBOUNCE_WAIT_MS = 3500; // รอ 3.5 วินาทีเพื่อรวมข้อความรัวๆ
// Rate Limiting: จำกัดสูงสุด 10 ข้อความ ต่อ 1 นาที ต่อผู้ใช้
const RATE_LIMIT_COUNT = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
// Session Cleanup: ล้าง session ที่ไม่ active เกิน 24 ชั่วโมง
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // cleanup ทุก 30 นาที
let isGlobalEnabled = true;
/**
 * ตรวจสอบว่าระบบบอทเปิดทำงานอยู่หรือไม่ (Master Switch)
 */
export function isGlobalBotEnabled() {
    return isGlobalEnabled;
}
/**
 * สั่งเปิดหรือปิดการทำงานของบอททั้งระบบ
 */
export function setGlobalBotEnabled(enabled) {
    isGlobalEnabled = enabled;
    console.log(`🌐 เปลี่ยนสถานะบอททั้งระบบเป็น: ${enabled ? 'เปิดใช้งาน (ON)' : 'พักการทำงาน (OFF)'}`);
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