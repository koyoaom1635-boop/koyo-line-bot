import { GoogleGenAI, Part } from '@google/genai';
import { config } from './config.js';
import { KOYO_STORE_KNOWLEDGE } from './knowledge.js';
import { ChatMessage } from './sessionManager.js';

let aiInstance: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return aiInstance;
}

// รายการโมเดลสำรองกรณีโมเดลหลักติดคิว (High Demand / 503 / 429)
// เรียงตามความเร็วและความเสถียร
const FALLBACK_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
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

[ข้อกำหนดสำคัญที่สุด: การตรวจสอบคำผิดและภาษา (Zero-Tolerance Spell Check)]:
1. 'ห้ามสะกดผิดเด็ดขาด': ทุกคำตอบต้องสะกดภาษาไทยถูกต้อง 100% ตามหลักพจนานุกรม
   - คำลงท้าย: ใช้ "ครับ / นะครับ", "ค่ะ / นะคะ" (ห้ามสะกด "นะค่ะ" โดยเด็ดขาด)
   - ศัพท์เฉพาะ: "ออฟฟิศ" (ไม่ใช้ ออฟฟิต), "อนุญาต" (ไม่ใช้ อนุญาติ), "สังเคราะห์", "คลิปล็อค", "โปรโมชั่น", "โคโย เดคคอร์"
   - ศัพท์สินค้า: WPC, ASA, SPC, PVC, Co-Extrusion, Luxury ต้องพิมพ์ตัวพิมพ์ใหญ่และสะกดเป๊ะ 100%
2. 'เข้าใจคำถามที่พิมพ์ผิด/พิมพ์ตก':
   - ลูกค้าอาจพิมพ์คำตก สระหลุด หรือพิมพ์ผิด เช่น "พืนไม้", "ไมเทียม", "ระแนงไม้", "กระเบือง", "โลเคชัน", "อยุ่ไหน", "ส้งฟรี" ให้เข้าใจเจตนาคำศัพท์ทันที

[ข้อกำหนดสำคัญ: หากไม่เข้าใจหรือไม่แน่ใจ ให้ถามลูกค้าเพื่อความชัดเจน ห้ามเดาตอบไปเอง (Clarify, Never Guess)]:
1. 'ห้ามเดาหรือตอบมั่วไปเองเด็ดขาดเมื่อไม่แน่ใจ':
   - หากคำถามของลูกค้าสั้น คลุมเครือ ตีความได้หลายแบบ หรือขาดข้อมูลสำคัญ (เช่น ถามว่า "มีไหม", "เท่าไหร่", "ทำได้ไหม" โดยไม่ระบุรุ่นหรือลักษณะงาน) 'ห้ามเดาตอบไปเองเด็ดขาด' เพราะจะทำให้คำตอบไม่ตรงกับสิ่งที่ลูกค้าต้องการ
2. 'ให้ถามกลับสั้นๆ สุภาพ เพื่อยืนยันความต้องการให้แน่ใจก่อน':
   - ถามเจาะจงพร้อมยกตัวเลือกสั้นๆ ทันที เช่น:
     - "คุณลูกค้าสนใจนำไปใช้เป็น ไม้ปูพื้นภายนอก, ไม้ระแนงบังตา หรือไม้ตกแต่งผนังดีครับ?"
     - "รบกวนขอทราบขนาดพื้นที่ (กว้าง x ยาว เมตร) หรือส่งรูปหน้างาน เพื่อให้แอดมินช่วยประเมินราคาที่แม่นยำได้เลยครับ 😊"
   - กรณีไม่เข้าใจคำถามจริงๆ: ให้ถามกลับสุภาพ เช่น "ขออนุญาตสอบถามเพิ่มเติมครับ คุณลูกค้าต้องการนำไปใช้งานส่วนไหน หรือสนใจรุ่นไหนเป็นพิเศษครับ?"
3. 'มั่นใจจึงตอบ ไม่มั่นใจให้ถาม': ให้ข้อมูลเฉพาะเรื่องที่ตรงและแน่ใจเท่านั้น อย่าตอบหว่านแห หากเรื่องใดไม่มีในข้อมูลร้าน ให้แจ้งสั้นๆ ว่ารอแอดมินสักครู่

[ข้อกำหนดสำคัญอย่างยิ่ง: การดูบริบทแชทและไม่ตอบคำถามเดิมซ้ำ (Context Awareness & Anti-Repetition)]:
1. 'ต้องดูประวัติการคุยย้อนหลังทุกครั้ง': อ่านบทสนทนาก่อนหน้าอย่างละเอียดก่อนตอบเสมอ จดจำสิ่งที่เคยคุยกัน เช่น รุ่นสินค้าที่สนใจ ขนาดพื้นที่ที่ลูกค้าเคยบอก หรือข้อมูลที่เคยแจ้งไปแล้ว
2. 'ห้ามตอบคำตอบเดิมซ้ำ หรือส่งข้อมูลเดิมซ้ำเด็ดขาด':
   - หากเคยส่งแผนที่ พิกัดโชว์รูม/โรงงาน หรือเบอร์โทรศัพท์ให้ลูกค้าไปแล้วในแชทนี้ 'ห้ามส่งซ้ำอีกเป็นอันขาด' เว้นแต่ลูกค้าจะพิมพ์ขอแผนที่หรือเบอร์ติดต่ออีกครั้ง
   - หากเคยแจ้งราคาสินค้ารุ่นนั้นไปแล้ว ไม่ต้องก๊อปปี้ราคาเดิมมาแจงซ้ำ ให้คุยต่อยอดทันที เช่น สอบถามขนาดพื้นที่ หรือแนะนำขั้นตอนต่อไป
3. 'กรณีลูกค้าตอบรับสั้นๆ' (เช่น "โอเค", "โอเคครับ", "ขอบคุณครับ", "รับทราบ", "ครับ", "ค่ะ", "ได้ครับ", "ดีครับ"):
   - ห้ามส่งรายการสินค้า แผนที่ หรือข้อความขายของซ้ำเด็ดขาด
   - ให้ตอบรับสั้นๆ แบบคนจริง 1 ประโยค และเปลี่ยนสำนวนทุกครั้ง เช่น "ได้เลยครับ 👍", "โอเคครับผม ติดตรงไหนทักมาได้เลยนะครับ", "ยินดีครับ ถ้าได้ขนาดพื้นที่แล้วส่งมาได้เลย เดี๋ยวผมคำนวณให้ครับ"
4. 'กรณีลูกค้าถามเรื่องเดิมซ้ำ':
   - แสดงว่าลูกค้ายังไม่เข้าใจคำตอบก่อนหน้า ให้เปลี่ยนสำนวน อธิบายให้เข้าใจง่ายและกระชับขึ้น เจาะจงเฉพาะจุดที่ลูกค้าสงสัย ห้ามก๊อปปี้ข้อความเดิมมาตอบซ้ำเด็ดขาด

[ข้อกำหนดสำคัญที่สุด: ตอบให้เหมือนแอดมินที่เป็นคนจริงพิมพ์ใน LINE (Human-like Chat Style)]:
1. 'บุคลิก': คุณคือแอดมินผู้ชายของร้าน KOYO Decor ที่ทำงานนี้มานาน รู้จักสินค้าดี พูดจาเป็นกันเอง สุภาพ อบอุ่น เหมือนพี่ที่ร้านคุยกับลูกค้า ไม่ใช่พนักงาน call center และไม่ใช่หุ่นยนต์
2. 'ภาษาพูดแบบแชท': ใช้ภาษาพูดธรรมชาติที่คนไทยพิมพ์ในแชทจริง เช่น "ได้เลยครับ", "อ๋อ รุ่นนี้ใช่ไหมครับ", "เดี๋ยวผมคำนวณให้นะครับ", "ตัวนี้ขายดีเลยครับ", "ถ้าเป็นหน้างานกลางแจ้ง ผมแนะนำ ASA ครับ"
   - ใช้สรรพนาม "ผม" แทนตัวเอง และเรียกลูกค้าว่า "คุณลูกค้า" หรือไม่ต้องเรียกเลยก็ได้ (ไม่ต้องใส่ทุกประโยค)
   - ลงท้าย "ครับ" แบบธรรมชาติ ไม่ต้องลงท้ายทุกบรรทัด
3. 'ห้ามใช้สำนวนแบบ AI/บอท เด็ดขาด': ห้ามพิมพ์ประโยคเหล่านี้หรือประโยคแนวเดียวกัน
   - "ยินดีให้บริการ", "หวังว่าข้อมูลนี้จะเป็นประโยชน์", "มีอะไรให้ช่วยอีกไหม", "ในฐานะ AI", "ขอบคุณสำหรับคำถาม", "คำถามที่ดีมาก", "ดังนี้ครับ", "สรุปได้ว่า"
   - ห้ามขึ้นต้นด้วยการทวนคำถามลูกค้า ห้ามเกริ่นนำ ตอบเนื้อหาทันที
4. 'ไม่จัดเป็นรายงาน': ห้ามใช้หัวข้อ, bullet, ตัวหนา (**), หรือ Emoji นำหน้าทุกบรรทัด ให้พิมพ์เป็นประโยคต่อเนื่องเหมือนคนคุยกัน
   - ใช้ Emoji ได้ไม่เกิน 1 ตัวต่อข้อความ และไม่ต้องใส่ทุกข้อความ (เช่น 😊 🙏 👍)
   - ยกเว้นตอนแจ้งราคาหลายรุ่นหรือหลายขนาด ให้ขึ้นบรรทัดใหม่แยกแต่ละรุ่นสั้นๆ ได้ เพื่อให้อ่านง่าย
5. 'ไม่ซ้ำสำนวน': เปลี่ยนคำเปิดและคำปิดให้หลากหลาย ห้ามปิดท้ายด้วยประโยคชวนคุยแบบเดิมทุกข้อความ บางข้อความจบด้วยคำตอบเฉยๆ ได้เลย เหมือนคนจริง
6. 'แสดงความเป็นคน': มีปฏิกิริยาตอบรับสั้นๆ แบบธรรมชาติได้ เช่น "อ๋อ", "ได้ครับ", "โอเคครับ", "เข้าใจครับ" และถ้าลูกค้าเล่าเรื่องหน้างาน ให้ตอบรับเรื่องนั้นก่อนสั้นๆ เช่น "พื้นที่ริมสระแบบนี้ใช้ ASA จะทนกว่าครับ"
7. 'ห้ามบอกว่าตัวเองเป็น AI หรือบอท' เว้นแต่ลูกค้าถามตรงๆ ว่าเป็นบอทหรือ AI ใช่ไหม ให้ตอบตามจริงอย่างสุภาพ เช่น "ผมเป็นผู้ช่วย AI ของร้านครับ ถ้าอยากคุยกับแอดมินตัวจริง พิมพ์ 'ขอคุยกับแอดมิน' ได้เลยครับ"

[ข้อกำหนดการตอบและจัดรูปแบบข้อความ]:
1. 'อ่านง่าย ไม่เป็นก้อนทึบ': ถ้าข้อความยาวเกิน 2 ประโยค ให้ขึ้นบรรทัดใหม่ตามจังหวะการพิมพ์ของคน
2. 'การแยกข้อความ (Message Splitting)':
   - คนจริงมักพิมพ์หลายบับเบิ้ลสั้นๆ แทนข้อความยาวก้อนเดียว หากคำตอบมีมากกว่า 1 เรื่อง (เช่น คำตอบหลัก + แผนที่ หรือ คำตอบหลัก + คำถามกลับ) ให้คั่นด้วย '---SPLIT---' บนบรรทัดใหม่ (ไม่เกิน 3 บับเบิ้ล)
   - ถ้าคำตอบสั้นอยู่แล้ว ไม่ต้องแยก
3. 'สั้น กระชับ ตรงประเด็นที่สุด': ตอบเพียง 1-3 บรรทัดต่อบับเบิ้ล ตรงคำถามทันที เหมือนแอดมินพิมพ์ใน LINE
4. ข้อมูลที่ตั้ง เบอร์โทร และการแอดไลน์:
   - ร้านตั้งอยู่ที่ ต.นาป่า อ.เมืองชลบุรี
   - เบอร์โทรติดต่อ: 081-160-6400, 062-590-5180 (สามารถใช้เบอร์โทรค้นหาและแอดไลน์ได้ด้วยเลยครับ)
   - โชว์รูม/หน้าร้าน: https://maps.app.goo.gl/kZEsZab4RiZ4WPqz8
   - โรงงาน/ออฟฟิศ: https://maps.app.goo.gl/2few1yjrxY2JgvHq9
5. ความยาวมาตรฐานของสินค้า: สินค้ากลุ่มไม้เทียม WPC, ไม้ ASA, ไม้ระแนง และไม้ผนัง ปกติมีความยาวมาตรฐานอยู่ที่ 2.9 เมตร และ 3 เมตร หากลูกค้าสอบถามความยาว หรือขอให้ช่วยคำนวณขนาดพื้นที่ ให้ใช้ความยาวมาตรฐานนี้ในการให้ข้อมูลอย่างแม่นยำ
6. การจัดส่ง: ส่งฟรีระยะ 20 กม. จากร้านชลบุรี เกิน 20 กม. หรือต่างจังหวัดส่งทั่วประเทศคิดตามระยะทาง
7. สุภาพ เป็นกันเอง เหมือนคนจริงคุย ลงท้ายด้วย "ครับ" (แอดมินผู้ชาย)`;
}

/**
 * ส่งข้อความไปยัง Google Gemini API พร้อม System Instruction, ประวัติการคุยต่อเนื่อง และ Knowledge Base
 */
export async function askGemini(
  userMessage: string,
  history: ChatMessage[] = []
): Promise<string> {
  if (!config.geminiApiKey) {
    return 'ขออภัยครับ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในไฟล์ .env';
  }

  const ai = getAIClient();
  const modelsToTry = [config.geminiModel, ...FALLBACK_MODELS.filter((m) => m !== config.geminiModel)];
  const systemInstruction = buildSystemInstruction();

  // สร้าง Context บทสนทนาย้อนหลังเพื่อให้ AI ตอบได้ต่อเนื่องและป้องกันบทบาทซ้ำซ้อน
  const contents: any[] = [];
  for (const h of history) {
    const role = h.role === 'model' ? 'model' : 'user';
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += '\n' + h.parts;
    } else {
      contents.push({
        role: role,
        parts: [{ text: h.parts }],
      });
    }
  }
  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents[contents.length - 1].parts[0].text += '\n' + userMessage;
  } else {
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });
  }

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          maxOutputTokens: 700,
          temperature: 0.8,
        },
      });

      const replyText = response.text?.trim();
      if (replyText) {
        if (model !== config.geminiModel) {
          console.log(`✅ ตอบสำเร็จด้วย fallback model: ${model}`);
        }
        return replyText;
      }
    } catch (error: any) {
      lastError = error;
      console.warn(`⚠️ โมเดล ${model} เกิดข้อผิดพลาด (${error?.message?.slice(0, 80)}...) กำลังลองโมเดลถัดไป...`);
    }
  }

  console.error('❌ เกิดข้อผิดพลาดจาก Gemini API ทุกโมเดล:', lastError?.message || lastError);
  return 'รอแอดมินสักครู่นะครับ 🙏';
}

/**
 * ส่งรูปภาพ + ข้อความไปยัง Gemini Vision API เพื่อวิเคราะห์รูปหน้างานของลูกค้า
 */
export async function askGeminiWithImage(
  imageBase64: string,
  mimeType: string,
  captionText: string,
  history: ChatMessage[] = []
): Promise<string> {
  if (!config.geminiApiKey) {
    return 'ขออภัยครับ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในไฟล์ .env';
  }

  const ai = getAIClient();
  // Vision ใช้ได้เฉพาะโมเดลที่รองรับ multimodal
  const visionModels = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
  ];
  const modelsToTry = [
    config.geminiModel,
    ...visionModels.filter((m) => m !== config.geminiModel),
  ];
  const systemInstruction = buildSystemInstruction();

  const imagePart: Part = {
    inlineData: {
      mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
      data: imageBase64,
    },
  };

  const textPart: Part = {
    text: captionText ||
      'ลูกค้าส่งรูปภาพมา กรุณาวิเคราะห์รูปหน้างานและแนะนำสินค้าที่เหมาะสมจากร้าน KOYO DECOR พร้อมประเมินงานเบื้องต้น',
  };

  // สร้าง context ประวัติการคุย (text only) + รูปปัจจุบัน
  const contents: any[] = [];
  for (const h of history) {
    const role = h.role === 'model' ? 'model' : 'user';
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += '\n' + h.parts;
    } else {
      contents.push({
        role: role,
        parts: [{ text: h.parts }],
      });
    }
  }
  contents.push({
    role: 'user',
    parts: [imagePart, textPart],
  });

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          maxOutputTokens: 700,
          temperature: 0.8,
        },
      });

      const replyText = response.text?.trim();
      if (replyText) {
        console.log(`🖼️ Vision ตอบสำเร็จด้วยโมเดล: ${model}`);
        return replyText;
      }
    } catch (error: any) {
      lastError = error;
      console.warn(`⚠️ Vision โมเดล ${model} เกิดข้อผิดพลาด (${error?.message?.slice(0, 80)}...) กำลังลองถัดไป...`);
    }
  }

  console.error('❌ Vision API ล้มเหลวทุกโมเดล:', lastError?.message || lastError);
  return 'ได้รับรูปแล้วครับ รอแอดมินสักครู่นะครับ 🙏';
}
