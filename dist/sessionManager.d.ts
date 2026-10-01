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
    messageTimestamps: number[];
}
/**
 * ดึง LINE User ID ของแอดมิน (จาก Dynamic หรือ Environment Variable)
 */
export declare function getAdminLineUserId(): string;
/**
 * บันทึก LINE User ID ของแอดมินที่ล็อกอินผ่านแชท
 */
export declare function setAdminLineUserId(userId: string): void;
/**
 * ตรวจสอบว่าระบบบอทเปิดทำงานอยู่หรือไม่ (พร้อมระบบนับถอยหลังเปิดอัตโนมัติ)
 */
export declare function isGlobalBotEnabled(): boolean;
/**
 * สั่งพักบอททั้งระบบตามระยะเวลาที่กำหนด (ค่าเริ่มต้น 30 นาที)
 */
export declare function pauseGlobalBot(durationMs?: number): {
    pausedUntil: number;
    minutes: number;
};
/**
 * สั่งเปิดบอททั้งระบบให้กลับมาทำงานทันที
 */
export declare function resumeGlobalBot(): void;
/**
 * สั่งเปิดหรือปิดการทำงานของบอททั้งระบบ (รองรับความเข้ากันได้ย้อนหลัง)
 */
export declare function setGlobalBotEnabled(enabled: boolean, durationMs?: number): void;
/**
 * ดึงสถานะปัจจุบันของบอททั้งระบบ
 */
export declare function getGlobalBotStatus(): {
    isEnabled: boolean;
    pausedUntil: number;
    remainingMinutes: number;
};
/**
 * ตรวจสอบว่าห้องแชทของลูกค้ารายนี้กำลังอยู่ในโหมด "พักบอท" หรือไม่
 */
export declare function isUserPaused(userId: string): boolean;
/**
 * สั่งพักบอทสำหรับลูกค้ารายนี้ (เช่น แอดมินเข้าไปคุยเอง หรือลูกค้าขอคุยกับคน)
 */
export declare function pauseUser(userId: string, durationMs?: number): void;
/**
 * สั่งยกเลิกการพักบอท เพื่อให้ AI กลับมาตอบแชทตามปกติ
 */
export declare function unpauseUser(userId: string): void;
/**
 * ดึงประวัติการคุยล่าสุด
 */
export declare function getChatHistory(userId: string): ChatMessage[];
/**
 * บันทึกข้อความลงประวัติการสนทนา
 */
export declare function appendChatHistory(userId: string, role: 'user' | 'model', text: string): void;
/**
 * ตรวจสอบ Rate Limit: คืน true หากส่งข้อความมากเกิน 10 ครั้ง/นาที
 */
export declare function isRateLimited(userId: string): boolean;
/**
 * บัฟเฟอร์ข้อความเพื่อรวบรวมข้อความที่ส่งมาติดๆ กันใน 3.5 วินาที
 */
export declare function bufferMessage(userId: string, text: string, replyToken: string, onDebounceDone: (combinedText: string, latestReplyToken: string) => void): void;
