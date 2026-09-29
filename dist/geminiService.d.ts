import { ChatMessage } from './sessionManager.js';
/**
 * ส่งข้อความไปยัง Google Gemini API พร้อม System Instruction, ประวัติการคุยต่อเนื่อง และ Knowledge Base
 */
export declare function askGemini(userMessage: string, history?: ChatMessage[]): Promise<string>;
