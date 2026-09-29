import { webhook } from '@line/bot-sdk';
/**
 * ฟังก์ชันจัดการ Webhook Event ที่ได้รับจาก LINE Platform
 */
export declare function handleLineEvent(event: webhook.Event): Promise<void>;
