import { messagingApi, webhook } from '@line/bot-sdk';
import { config } from './config.js';
import { askGemini } from './geminiService.js';

const { MessagingApiClient } = messagingApi;

let clientInstance: messagingApi.MessagingApiClient | null = null;

function getLineClient(): messagingApi.MessagingApiClient {
  if (!clientInstance) {
    clientInstance = new MessagingApiClient({
      channelAccessToken: config.lineChannelAccessToken,
    });
  }
  return clientInstance;
}

/**
 * ฟังก์ชันจัดการ Webhook Event ที่ได้รับจาก LINE Platform
 */
export async function handleLineEvent(event: webhook.Event): Promise<void> {
  const client = getLineClient();

  // กรณีผู้ใช้เพิ่มเพื่อน (Follow Event)
  if (event.type === 'follow') {
    if ('replyToken' in event && event.replyToken) {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: 'สวัสดีครับ! ยินดีต้อนรับครับ 🙏✨\nผมคือ AI Assistant พร้อมตอบคำถามและให้ข้อมูล สามารถพิมพ์สิ่งที่ต้องการสอบถามมาได้เลยครับ!',
          },
        ],
      });
    }
    return;
  }

  // รองรับเฉพาะประเภท message
  if (event.type !== 'message') {
    return;
  }

  const message = event.message;
  const replyToken = event.replyToken;

  if (!replyToken) {
    return;
  }

  // กรณีเป็นข้อความตัวอักษร (Text Message)
  if (message.type === 'text') {
    const userText = message.text.trim();
    console.log(`📩 ได้รับข้อความ: "${userText}"`);

    // ส่งข้อความไปประมวลผลด้วย Gemini AI
    const aiResponse = await askGemini(userText);
    console.log(`🤖 AI ตอบกลับ: "${aiResponse.slice(0, 60)}..."`);

    await client.replyMessage({
      replyToken: replyToken,
      messages: [
        {
          type: 'text',
          text: aiResponse,
        },
      ],
    });
    return;
  }

  // กรณีส่งเป็นสติกเกอร์ หรือ รูปภาพ
  let replyText = 'ขอบคุณสำหรับข้อความครับ หากต้องการสอบถามข้อมูล สามารถพิมพ์เป็นข้อความสอบถามได้เลยนะครับ 😊';
  if (message.type === 'sticker') {
    replyText = 'ขอบคุณสำหรับสติกเกอร์น่ารักๆ ครับ มีข้อความหรือคำถามอะไรให้ช่วยตอบ พิมพ์ถามได้เลยนะครับ! ✨';
  } else if (message.type === 'image') {
    replyText = 'ได้รับรูปภาพเรียบร้อยแล้วครับ หากมีคำถามเกี่ยวกับรูปภาพหรือบริการ สามารถพิมพ์แจ้งรายละเอียดได้เลยครับ 📷';
  }

  await client.replyMessage({
    replyToken: replyToken,
    messages: [
      {
        type: 'text',
        text: replyText,
      },
    ],
  });
}
