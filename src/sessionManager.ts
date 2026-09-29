export interface ChatMessage {
  role: 'user' | 'model';
  parts: string;
}

export interface UserSession {
  userId: string;
  isPaused: boolean;
  pausedUntil: number;
  messageBuffer: string[];
  lastReplyToken: string;
  debounceTimer: NodeJS.Timeout | null;
  history: ChatMessage[];
  lastActive: number;
}

const sessions = new Map<string, UserSession>();

const MAX_HISTORY = 8;
const DEFAULT_PAUSE_DURATION = 60 * 60 * 1000; // 1 ชั่วโมง
const DEBOUNCE_WAIT_MS = 3500; // รอ 3.5 วินาทีเพื่อรวมข้อความรัวๆ

let isGlobalEnabled = true;

/**
 * ตรวจสอบว่าระบบบอทเปิดทำงานอยู่หรือไม่ (Master Switch)
 */
export function isGlobalBotEnabled(): boolean {
  return isGlobalEnabled;
}

/**
 * สั่งเปิดหรือปิดการทำงานของบอททั้งระบบ
 */
export function setGlobalBotEnabled(enabled: boolean): void {
  isGlobalEnabled = enabled;
  console.log(`🌐 เปลี่ยนสถานะบอททั้งระบบเป็น: ${enabled ? 'เปิดใช้งาน (ON)' : 'พักการทำงาน (OFF)'}`);
}

function getOrCreateSession(userId: string): UserSession {
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
    };
    sessions.set(userId, session);
  }
  session.lastActive = Date.now();
  return session;
}

/**
 * ตรวจสอบว่าห้องแชทของลูกค้ารายนี้กำลังอยู่ในโหมด "พักบอท" หรือไม่
 */
export function isUserPaused(userId: string): boolean {
  const session = sessions.get(userId);
  if (!session) return false;

  if (session.isPaused) {
    if (Date.now() < session.pausedUntil) {
      return true;
    } else {
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
export function pauseUser(userId: string, durationMs: number = DEFAULT_PAUSE_DURATION): void {
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
export function unpauseUser(userId: string): void {
  const session = getOrCreateSession(userId);
  session.isPaused = false;
  session.pausedUntil = 0;
}

/**
 * ดึงประวัติการคุยล่าสุด
 */
export function getChatHistory(userId: string): ChatMessage[] {
  const session = getOrCreateSession(userId);
  return session.history;
}

/**
 * บันทึกข้อความลงประวัติการสนทนา
 */
export function appendChatHistory(userId: string, role: 'user' | 'model', text: string): void {
  const session = getOrCreateSession(userId);
  session.history.push({ role, parts: text });
  if (session.history.length > MAX_HISTORY) {
    session.history = session.history.slice(session.history.length - MAX_HISTORY);
  }
}

/**
 * บัฟเฟอร์ข้อความเพื่อรวบรวมข้อความที่ส่งมาติดๆ กันใน 3.5 วินาที
 */
export function bufferMessage(
  userId: string,
  text: string,
  replyToken: string,
  onDebounceDone: (combinedText: string, latestReplyToken: string) => void
): void {
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
