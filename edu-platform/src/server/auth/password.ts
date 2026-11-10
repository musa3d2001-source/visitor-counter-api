import "server-only";
import { burnPasswordTime as burnCore, hashPassword as hashCore, verifyPassword as verifyCore } from "./password-core";
import { withHashSlot } from "./hash-gate";

/**
 * كل تجزئة كلمة مرور في الموقع تمر من هنا فتخضع لحد النسخة (hash-gate.ts).
 * password-core يبقى بلا حد للسكربتات، ولا يستورده من src غير هذا الملف (يفرض ذلك اختبار).
 */
export function hashPassword(password: string): Promise<string> {
  return withHashSlot(() => hashCore(password));
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return withHashSlot(() => verifyCore(password, stored));
}

export function burnPasswordTime(password: string): Promise<void> {
  return withHashSlot(() => burnCore(password));
}
