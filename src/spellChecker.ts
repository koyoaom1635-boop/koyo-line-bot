/**
 * โมดูลตรวจสอบและแก้ไขคำผิดภาษาไทยอัตโนมัติ (Thai Spell Checker & Sanitizer)
 * สำหรับระบบแชทบอท KOYO DECOR
 */

interface ReplacementRule {
  pattern: RegExp;
  replacement: string;
}

// รายการคำที่มักสะกดผิดบ่อย พร้อมคำที่ถูกต้อง
const SPELL_RULES: ReplacementRule[] = [
  // คำลงท้ายและไวยากรณ์
  { pattern: /นะค่ะ/g, replacement: 'นะคะ' },
  { pattern: /น่ะค่ะ/g, replacement: 'นะคะ' },

  // คำศัพท์ทั่วไป
  { pattern: /ออฟฟิต/g, replacement: 'ออฟฟิศ' },
  { pattern: /อนุญาติ/g, replacement: 'อนุญาต' },
  { pattern: /สังเคราะ(?!ห์)/g, replacement: 'สังเคราะห์' },
  { pattern: /โปรโมชั้น/g, replacement: 'โปรโมชั่น' },
  { pattern: /สัมผัด/g, replacement: 'สัมผัส' },
  { pattern: /โอกาศ/g, replacement: 'โอกาส' },
  { pattern: /กระดาน/g, replacement: 'กระดาน' },

  // ชื่อแบรนด์และบริษัท
  { pattern: /โคโย\s*เดคอ(?!ร์)/g, replacement: 'โคโย เดคคอร์' },
  { pattern: /โคโยเดคคอ(?!ร์)/g, replacement: 'โคโย เดคคอร์' },
  { pattern: /koyo\s*decor/gi, replacement: 'KOYO Decor' },

  // ศัพท์เทคนิคและสินค้า
  { pattern: /\bwpc\b/g, replacement: 'WPC' },
  { pattern: /\basa\b/g, replacement: 'ASA' },
  { pattern: /\bspc\b/g, replacement: 'SPC' },
  { pattern: /\bpvc\b/g, replacement: 'PVC' },
  { pattern: /คลิ๊ปล็อค|คลิปล๊อก|คลิปบล็อค/g, replacement: 'คลิปล็อค' },
  { pattern: /โคเอ็กซ์ทรูชั่น|โค-เอ็กซ์ทรูชั่น/g, replacement: 'Co-Extrusion' },
];

/**
 * ตรวจสอบและแก้ไขคำผิดในข้อความก่อนส่งให้ลูกค้า
 */
export function sanitizeText(text: string): string {
  if (!text) return '';

  let sanitized = text;

  // วิ่งผ่านกฎการแก้ไขคำผิด
  for (const rule of SPELL_RULES) {
    sanitized = sanitized.replace(rule.pattern, rule.replacement);
  }

  // ลบช่องว่างหรือบรรทัดว่างเกินความจำเป็น
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');

  return sanitized;
}
