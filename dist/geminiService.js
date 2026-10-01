import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';
import { KOYO_STORE_KNOWLEDGE } from './knowledge.js';
let aiInstance = null;
function getAIClient() {
    if (!aiInstance) {
        aiInstance = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }
    return aiInstance;
}
// รายการโมเดลสำรองกรณีโมเดลหลักติดคิว (High Demand / 503 / 429)
// เรียงตามลำดับความสามารถ → ประหยัด
const FALLBACK_MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro',
];
/**
 * สร้าง System Instruction ที่ผสมผสานกฎการตอบแชท และฐานข้อมูลสินค้าจากเว็บไซต์ koyodecor.com
 */
function buildSystemInstruction() {
    const customPrompt = process.env.BOT_SYSTEM_PROMPT || config.botSystemPrompt;
    return `${customPrompt}

---
[ฐานข้อมูลสินค้าและข้อมูลร้านค้าอย่างเป็นทางการจาก koyodecor.com]
${KOYO_STORE_KNOWLEDGE}

[ข้อกำหนดสำคัญที่สุด: การตรวจสอบคำผิดและภาษา (Zero-Tolerance Spell Check)]:
1. 'ห้ามสะกดผิดเด็ดขาด': ทุกคำตอบต้องสะกดภาษาไทยถูกต้อง 100% ตามหลักพจนานุกรม
   - คำลงท้าย: ใช้ "ครับ / นะครับ", "ค่ะ / นะคะ" (ห้ามสะกด "นะค่ะ" โดยเด็ดขาด)
   - ศัพท์เฉพาะ: "ออฟฟิศ" (ไม่ใช้ ออฟฟิต), "อนุญาต" (ไม่ใช้ อนุญาติ), "สังเคราะห์", "คลิปล็อค", "โปรโมชั่น", "โคโย เดคคอร์"
   - ศัพท์สินค้า: WPC, ASA, SPC, PVC, Co-Extrusion, Luxury ต้องพิมพ์ตัวพิมพ์ใหญ่และสะกดเป๊ะ 100%
2. 'เข้าใจคำถามลูกค้าที่พิมพ์ผิด/พิมพ์ตก':
   - ลูกค้าอาจพิมพ์คำตก สระหลุด หรือพิมพ์ผิด เช่น "พืนไม้", "ไมเทียม", "ระแนงไม้", "กระเบือง", "โลเคชัน", "อยุ่ไหน", "ส้งฟรี" ให้เข้าใจเจตนาลูกค้าทันที
   - หากลูกค้าพิมพ์ผิดหรือคลุมเครือจนจับใจความยาก ให้ตอบอย่างเข้าใจและเดาใจลูกค้าเบื้องต้น พร้อมเสนอตัวเลือกช่วยเหลือ เช่น "ลูกค้าต้องการสอบถามเรื่องพื้นไม้เทียมภายนอก หรือระแนงบังตาครับ?"

[ข้อกำหนดการตอบและจัดรูปแบบข้อความ]:
1. 'อ่านง่าย สบายตา ไม่เป็นก้อนทึบ': แบ่งวรรคและขึ้นบรรทัดใหม่ให้ชัดเจน
2. 'ใช้ Emoji นำสายตาจัดเป็นหัวข้อ': 
   - 📌 สำหรับชื่อรุ่น / สินค้าที่แนะนำ
   - 💰 สำหรับราคา / โปรโมชั่น
   - 📏 สำหรับขนาด / สเปก / พื้นที่
   - 🚚 สำหรับการจัดส่ง
   - 📍 สำหรับแผนที่ / โลเคชั่น
   - 📞 สำหรับเบอร์ติดต่อ
3. 'การแยกข้อความ (Message Splitting)':
   - หากมีคำตอบหลัก และข้อมูลเสริม (เช่น แผนที่/โลเคชั่น หรือคำถามเชิญชวนส่งรูปหน้างาน/ประเมินราคา) ให้ใส่คั่นด้วย '---SPLIT---' บนบรรทัดใหม่ เพื่อให้ระบบแยกส่ง 2 บับเบิ้ลตามหลังกันอย่างเป็นธรรมชาติ
4. 'สั้น กระชับ ตรงประเด็น': เหมือนแอดมินคนจริงพิมพ์ใน LINE ห้ามทักทายเกริ่นนำยาวยืด
5. ข้อมูลที่ตั้ง เบอร์โทร และการแอดไลน์:
   - ร้านตั้งอยู่ที่ ต.นาป่า อ.เมืองชลบุรี
   - เบอร์โทรติดต่อ: 081-160-6400, 062-590-5180 (สามารถใช้เบอร์โทรค้นหาและแอดไลน์ได้ด้วยเลยครับ)
   - โชว์รูม/หน้าร้าน: https://maps.app.goo.gl/kZEsZab4RiZ4WPqz8
   - โรงงาน/ออฟฟิศ: https://maps.app.goo.gl/2few1yjrxY2JgvHq9
6. การจัดส่ง: ส่งฟรีระยะ 20 กม. จากร้านชลบุรี เกิน 20 กม. หรือต่างจังหวัดส่งทั่วประเทศคิดตามระยะทาง
7. สุภาพ ไพเราะ เป็นกันเอง ลงท้ายด้วยครับ/ค่ะ`;
}
/**
 * ส่งข้อความไปยัง Google Gemini API พร้อม System Instruction, ประวัติการคุยต่อเนื่อง และ Knowledge Base
 */
export async function askGemini(userMessage, history = []) {
    if (!config.geminiApiKey) {
        return 'ขออภัยครับ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในไฟล์ .env';
    }
    const ai = getAIClient();
    const modelsToTry = [config.geminiModel, ...FALLBACK_MODELS.filter((m) => m !== config.geminiModel)];
    const systemInstruction = buildSystemInstruction();
    // สร้าง Context บทสนทนาย้อนหลังเพื่อให้ AI ตอบได้ต่อเนื่อง
    const contents = [];
    for (const h of history) {
        contents.push({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: h.parts }],
        });
    }
    contents.push({
        role: 'user',
        parts: [{ text: userMessage }],
    });
    let lastError = null;
    for (const model of modelsToTry) {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: contents,
                config: {
                    systemInstruction: systemInstruction,
                    maxOutputTokens: 700,
                    temperature: 0.6,
                },
            });
            const replyText = response.text?.trim();
            if (replyText) {
                if (model !== config.geminiModel) {
                    console.log(`✅ ตอบสำเร็จด้วย fallback model: ${model}`);
                }
                return replyText;
            }
        }
        catch (error) {
            lastError = error;
            console.warn(`⚠️ โมเดล ${model} เกิดข้อผิดพลาด (${error?.message?.slice(0, 80)}...) กำลังลองโมเดลถัดไป...`);
        }
    }
    console.error('❌ เกิดข้อผิดพลาดจาก Gemini API ทุกโมเดล:', lastError?.message || lastError);
    return 'ขออภัยครับ ขณะนี้ระบบขัดข้องชั่วคราว กรุณารอแอดมินสักครู่นะครับ 🙏';
}
/**
 * ส่งรูปภาพ + ข้อความไปยัง Gemini Vision API เพื่อวิเคราะห์รูปหน้างานของลูกค้า
 */
export async function askGeminiWithImage(imageBase64, mimeType, captionText, history = []) {
    if (!config.geminiApiKey) {
        return 'ขออภัยครับ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในไฟล์ .env';
    }
    const ai = getAIClient();
    // Vision ใช้ได้เฉพาะโมเดลที่รองรับ multimodal
    const visionModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-flash'];
    const modelsToTry = [
        config.geminiModel,
        ...visionModels.filter((m) => m !== config.geminiModel),
    ];
    const systemInstruction = buildSystemInstruction();
    const imagePart = {
        inlineData: {
            mimeType: mimeType,
            data: imageBase64,
        },
    };
    const textPart = {
        text: captionText ||
            'ลูกค้าส่งรูปภาพมา กรุณาวิเคราะห์รูปหน้างานและแนะนำสินค้าที่เหมาะสมจากร้าน KOYO DECOR พร้อมประเมินงานเบื้องต้น',
    };
    // สร้าง context ประวัติการคุย (text only) + รูปปัจจุบัน
    const contents = [];
    for (const h of history) {
        contents.push({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: h.parts }],
        });
    }
    contents.push({
        role: 'user',
        parts: [imagePart, textPart],
    });
    let lastError = null;
    for (const model of modelsToTry) {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: contents,
                config: {
                    systemInstruction: systemInstruction,
                    maxOutputTokens: 700,
                    temperature: 0.6,
                },
            });
            const replyText = response.text?.trim();
            if (replyText) {
                console.log(`🖼️ Vision ตอบสำเร็จด้วยโมเดล: ${model}`);
                return replyText;
            }
        }
        catch (error) {
            lastError = error;
            console.warn(`⚠️ Vision โมเดล ${model} เกิดข้อผิดพลาด (${error?.message?.slice(0, 80)}...) กำลังลองถัดไป...`);
        }
    }
    console.error('❌ Vision API ล้มเหลวทุกโมเดล:', lastError?.message || lastError);
    return 'ได้รับรูปภาพเรียบร้อยแล้วครับ 📷 ขออภัยที่ระบบวิเคราะห์รูปชั่วคราวไม่พร้อม กรุณาแจ้งขนาดพื้นที่ (กว้าง x ยาว เมตร) เพิ่มเติมเพื่อให้แอดมินช่วยประเมินราคาได้ครับ';
}
//# sourceMappingURL=geminiService.js.map