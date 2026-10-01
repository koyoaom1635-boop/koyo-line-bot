import { ChatMessage } from './sessionManager.js';
/**
 * ส่งข้อความไปยัง Google Gemini API พร้อม System Instruction, ประวัติการคุยต่อเนื่อง และ Knowledge Base
 */
export declare function askGemini(userMessage: string, history?: ChatMessage[]): Promise<string>;
/**
 * ส่งรูปภาพ + ข้อความไปยัง Gemini Vision API เพื่อวิเคราะห์รูปหน้างานของลูกค้า
 */
export declare function askGeminiWithImage(imageBase64: string, mimeType: string, captionText: string, history?: ChatMessage[]): Promise<string>;
