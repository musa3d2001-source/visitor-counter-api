import { createHash, createHmac, randomBytes } from "node:crypto";
import { constantTimeEqual, deriveKey } from "./two-factor-core";

/**
 * (نواة بدون server-only لاستخدامها في الاختبارات)
 * إثبات أن هذا المتصفح أدخل كلمة المرور الصحيحة لهذا الحساب من قبل (Device Cookie حسب توصية OWASP).
 *
 * المشكلة: حد ١٠٠ حساب فاشل لكل IP يوقف تجربة كلمة واحدة على قائمة حسابات، لكنه يوقف معها فصلًا كاملًا
 * خلف عنوان مدرسة واحد. ولا يصح أن تتجاوزه كلمة المرور الصحيحة، لأن ذلك يلغي الحد: المهاجم يجرب حتى تصح.
 * الإثبات يتجاوز حظر الشبكة فقط، ولحساب واحد فقط، وقد سبق لهذا المتصفح أن أثبت كلمته.
 * وله عدّاد إخفاقات خاص به بدل عدّاد الزوج (حساب + IP) (R004): غريب على العنوان نفسه لا يقفله، وتخميناته هو
 * تقفله وحده بالسياسة نفسها. كلمة المرور تُفحص كالعادة في كل حال.
 * لكل إثبات رقم عشوائي، فلا يشترك متصفحان في عدّاد واحد. الإثبات القديم بلا رقم يُقبل حتى ينتهي (٩٠ يومًا على الأكثر).
 */
export const DEVICE_PROOF_DAYS = 90;

const KEY_LABEL = "login-device-proof";

const NONCE = /^[A-Za-z0-9_-]{22}$/;

/** nonce null: الصيغة القديمة (expires.mac). النص الموقّع يختلف بين الصيغتين، فلا تصلح إحداهما للأخرى */
function mac(email: string, expires: string, nonce: string | null, appSecret: string) {
  const body = nonce === null ? `${email.toLowerCase()}|${expires}` : `v2|${email.toLowerCase()}|${expires}|${nonce}`;
  return createHmac("sha256", deriveKey(appSecret, KEY_LABEL)).update(body).digest("base64url");
}

export function issueDeviceProof(email: string, appSecret: string, nowMs = Date.now()): string {
  const expires = String(Math.floor(nowMs / 1000) + DEVICE_PROOF_DAYS * 86400);
  const nonce = randomBytes(16).toString("base64url");
  return `${expires}.${nonce}.${mac(email, expires, nonce, appSecret)}`;
}

export function verifyDeviceProof(proof: string | undefined, email: string, appSecret: string, nowMs = Date.now()): boolean {
  if (!proof || proof.length > 120) return false;
  const parts = proof.split(".");
  if (parts.length !== 2 && parts.length !== 3) return false;
  const expires = parts[0]!;
  if (!/^\d{1,12}$/.test(expires)) return false;
  if (Number(expires) * 1000 <= nowMs) return false;
  const nonce = parts.length === 3 ? parts[1]! : null;
  if (nonce !== null && !NONCE.test(nonce)) return false;
  return constantTimeEqual(parts.at(-1)!, mac(email, expires, nonce, appSecret));
}

/** اسم عدّاد إخفاقات هذا المتصفح: بصمة الإثبات لا الإثبات نفسه، فلا يُكتب الإثبات في قاعدة البيانات */
export function deviceProofKey(proof: string): string {
  return createHash("sha256").update(proof).digest("hex").slice(0, 32);
}
