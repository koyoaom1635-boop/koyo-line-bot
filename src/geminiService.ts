import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';
import { KOYO_STORE_KNOWLEDGE } from './knowledge.js';

let aiInstance: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return aiInstance;
}

// รายการโมเดลสำรองกรณีโมเดลหลักติดคิว (High Demand / 503)
const FALLBACK_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.7-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.8-flash',
];

/**
 * สร้าง System Instruction ที่ผสมผสานกฎการตอบแชท และฐานข้อมูลสินค้าจากเว็บไซต์ koyodecor.com
 */
function buildSystemInstruction(): string {
  const customPrompt = process.env.BOT_SYSTEM_PROMPT || config.botSystemPrompt;

  return `${customPrompt}

---
[ฐานข้อมูลสินค้าและข้อมูลร้านค้าอย่างเป็นทางการจาก koyodecor.com]
${KOYO_STORE_KNOWLEDGE}

[ข้อกำหนดการตอบสำคัญ]:
1. ตอบให้ 'สั้น กระชับ ตรงประเด็น' 2-4 บรรทัดเท่านั้น เหมือนแอดมินคนจริงพิมพ์ใน LINE
2. ห้ามทักทายเกริ่นนำยาวยืด (ห้ามพูดคำว่า 'ยินดีต้อนรับสู่...' ซ้ำซาก) ให้เข้าเรื่องทันที
3. สามารถดึงข้อมูลสินค้า ราคา รุ่น หรือคุณสมบัติจากฐานข้อมูลด้านบนมาตอบได้ถูกต้องแม่นยำ
4. หากลูกค้าถามสถานที่ เบอร์โทร หรือเวลาทำการ ให้บอกข้อมูลของร้านที่ชลบุรีและเบอร์โทรได้ทันที
5. หากลูกค้าแจ้งขนาดพื้นที่ ให้คำนวณ ตร.ม. สั้นๆ แล้วแนะนำสินค้าที่เหมาะกับงานภายนอก/ภายใน พร้อมชวนส่งรูปหน้างาน
6. สุภาพ ไพเราะ เป็นกันเอง ลงท้ายด้วยครับ/ค่ะ`;
}

/**
 * ส่งข้อความไปยัง Google Gemini API พร้อม System Instruction และ Knowledge Base
 */
export async function askGemini(userMessage: string): Promise<string> {
  if (!config.geminiApiKey || config.geminiApiKey.includes('your_gemini_api_key')) {
    return 'ขออภัยครับ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในไฟล์ .env';
  }

  const ai = getAIClient();
  const modelsToTry = [config.geminiModel, ...FALLBACK_MODELS.filter((m) => m !== config.geminiModel)];
  const systemInstruction = buildSystemInstruction();

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: userMessage,
        config: {
          systemInstruction: systemInstruction,
          maxOutputTokens: 300,
          temperature: 0.6,
        },
      });

      const replyText = response.text?.trim();
      if (replyText) {
        return replyText;
      }
    } catch (error: any) {
      lastError = error;
      console.warn(`⚠️ โมเดล ${model} เกิดข้อผิดพลาด (${error?.message?.slice(0, 80)}...) กำลังลองโมเดลถัดไป...`);
    }
  }

  console.error('❌ เกิดข้อผิดพลาดจาก Gemini API ทุกโมเดล:', lastError?.message || lastError);
  return 'ขออภัยครับ ขณะนี้ระบบขัดข้องชั่วคราว กรุณารอแอดมินสักครู่นะครับ 🙏';
}
