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
 * ตรวจสอบว่าระบบบอทเปิดทำงานอยู่หรือไม่ (Master Switch)
 */
export declare function isGlobalBotEnabled(): boolean;
/**
 * สั่งเปิดหรือปิดการทำงานของบอททั้งระบบ
 */
export declare function setGlobalBotEnabled(enabled: boolean): void;
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
