# 🤖 LINE AI Chatbot (Node.js + TypeScript + Google Gemini)

ระบบบอท AI สำหรับตอบแชทใน LINE Official Account อัตโนมัติ ขับเคลื่อนด้วย **Google Gemini API** และพัฒนาด้วย **Node.js (Express + TypeScript)**

---

## 📁 โครงสร้างโปรเจกต์

```text
chat boot line/
├── src/
│   ├── config.ts         # โหลดและตรวจสอบค่า Environment Variables (.env)
│   ├── geminiService.ts  # เชื่อมต่อกับ Google Gemini API และ System Prompt
│   ├── lineService.ts    # รับและประมวลผลข้อความจาก LINE แล้วส่งคำตอบกลับ
│   └── index.ts          # Express Web Server และเส้นทาง /webhook
├── .env                  # ไฟล์ตั้งค่า Secret Keys และ System Prompt
├── .env.example          # ตัวอย่างไฟล์ตั้งค่า
├── package.json          # รายการแพ็กเกจและคำสั่งรันระบบ
├── tsconfig.json         # การตั้งค่า TypeScript
└── README.md             # คู่มือการติดตั้งและใช้งานฉบับสมบูรณ์
```

---

## 🛠️ ขั้นตอนการติดตั้งและตั้งค่า (Step-by-Step)

### 1. ขอ Gemini API Key (ฟรี)
1. เข้าไปที่ [Google AI Studio](https://aistudio.google.com/app/apikey)
2. ล็อกอินด้วยบัญชี Google
3. คลิกปุ่ม **"Create API key"**
4. คัดลอก API Key ที่ได้มา

---

### 2. สร้าง LINE Messaging API Channel
1. เข้าสู่ระบบ [LINE Developers Console](https://developers.line.biz/console/)
2. คลิกเลือกหรือสร้าง **Provider**
3. คลิก **"Create a new channel"** แล้วเลือก **"Messaging API"**
4. กรอกข้อมูลบอทของคุณ (ชื่อบอท, รูปภาพ, อีเมล, หมวดหมู่) แล้วกดยอมรับเงื่อนไข
5. เมื่อสร้างเสร็จแล้ว ให้เข้าไปที่ Channel ของคุณ:
   - **แท็บ Basic settings**: เลื่อนลงไปดูที่หัวข้อ **Channel secret** แล้วกดคัดลอกค่ามา
   - **แท็บ Messaging API**: เลื่อนลงไปล่างสุดที่หัวข้อ **Channel access token** คลิกปุ่ม **Issue** แล้วคัดลอกค่า Token มา

---

### 3. ใส่ค่าลงในไฟล์ `.env`
เปิดไฟล์ [`.env`](file:///c:/Users/SEREE_2/Downloads/chat%20boot%20line/.env) แล้วนำค่าที่ได้มาใส่แทนที่:

```env
PORT=3000

# จาก LINE Developers Console
LINE_CHANNEL_SECRET=ใส่_Channel_Secret_ที่ได้จาก_LINE
LINE_CHANNEL_ACCESS_TOKEN=ใส่_Channel_Access_Token_ที่ได้จาก_LINE

# จาก Google AI Studio
GEMINI_API_KEY=ใส่_API_Key_ที่ได้จาก_Google_AI_Studio

# โมเดล Gemini ที่แนะนำ
GEMINI_MODEL=gemini-2.5-flash

# กำหนดบทบาท บุคลิก และข้อมูลร้านค้า/ธุรกิจ
BOT_SYSTEM_PROMPT="คุณคือ AI Assistant ประจำ LINE Official Account ที่เป็นมิตร สุภาพ พูดจาไพเราะ ตอบคำถามด้วยภาษาไทยที่เข้าใจง่าย กระชับ และตรงประเด็น หากมีคำถามเกี่ยวกับข้อมูลเฉพาะที่คุณไม่ทราบ ให้แนะนำให้ลูกค้าติดต่อเจ้าหน้าที่โดยตรง"
```

---

### 4. รัน Webhook Server
เปิด PowerShell หรือ Terminal ในโฟลเดอร์นี้ แล้วรันคำสั่ง:

```bash
npm run dev
```

คุณจะเห็นข้อความ:
```text
🚀 LINE AI Bot Server กำลังทำงานที่พอร์ต: 3000
🌐 ตรวจสอบสถานะเซิร์ฟเวอร์: http://localhost:3000/
📡 Webhook URL ปลายทาง: http://localhost:3000/webhook
```

---

### 5. เปิด Port สู่ภายนอกด้วย ngrok (สำหรับการทดสอบในเครื่อง)
เนื่องจาก LINE ต้องส่ง Webhook มายัง URL แบบ `https://` ที่เข้าถึงได้จากอินเทอร์เน็ต:

1. หากยังไม่มี ngrok สามารถดาวน์โหลดได้ที่ [ngrok.com](https://ngrok.com/) หรือติดตั้งผ่านคำสั่ง:
   ```bash
   winget install ngrok.ngrok
   ```
2. รันคำสั่ง Forward พอร์ต 3000:
   ```bash
   ngrok http 3000
   ```
3. คัดลอก URL แบบ `https://...` ที่ ngrok ให้มา เช่น:
   `https://a1b2-c3d4.ngrok-free.app`

---

### 6. ตั้งค่า Webhook URL ใน LINE Developers Console
1. กลับไปที่ [LINE Developers Console](https://developers.line.biz/console/) > เลือก Channel ของคุณ > ไปที่แท็บ **Messaging API**
2. ในหัวข้อ **Webhook settings**:
   - ใส่ **Webhook URL**: นำ URL จาก ngrok มาต่อท้ายด้วย `/webhook` เช่น:
     `https://a1b2-c3d4.ngrok-free.app/webhook`
   - คลิกปุ่ม **Update**
   - เปิดสวิตช์ **Use webhook** ให้เป็น **ON**
   - คลิกปุ่ม **Verify** เพื่อทดสอบการเชื่อมต่อ (ระบบควรแสดงคำว่า `Success`)
3. ในหัวข้อ **LINE Official Account features**:
   - ในส่วน **Auto-reply messages** ให้คลิก Edit แล้วตั้งค่า:
     - **Response mode**: เลือก **Bot**
     - **Auto-response**: เลือก **Disabled** (ปิดการตอบกลับอัตโนมัติของระบบเดิม เพื่อให้ AI ตอบแทน)
     - **Webhook**: เลือก **Enabled**

---

### 7. ทดสอบพูดคุยกับ AI Bot
1. สแกน QR Code จากแท็บ Messaging API เพื่อเพิ่มเพื่อนบอทใน LINE
2. ส่งข้อความทักทายหรือสอบถามเรื่องต่างๆ
3. บอท AI จะประมวลผลผ่าน Gemini และตอบกลับทันที 🎉

---

## 💡 การปรับแต่งข้อมูลและบุคลิกของบอท (Prompt Customization)

คุณสามารถแก้ไขข้อความใน `BOT_SYSTEM_PROMPT` ของไฟล์ `.env` ได้อย่างอิสระ เช่น การเพิ่มข้อมูลร้านค้า:

```env
BOT_SYSTEM_PROMPT="คุณเป็นผู้ช่วยแอดมินร้าน ABC Store 
- เวลาเปิดทำการ: ทุกวัน 09:00 - 20:00 น.
- มีบริการจัดส่งทั่วประเทศฟรี เมื่อซื้อครบ 500 บาท
- สินค้าหลักคือ: เสื้อผ้าแฟชั่นและเครื่องประดับ
- พูดจาสุภาพ ลงท้ายด้วยครับ/ค่ะ เสมอ"
```
เมื่อแก้ไขไฟล์ `.env` แล้ว เซิร์ฟเวอร์จะอัปเดตและเริ่มตอบตามข้อมูลใหม่ทันที
