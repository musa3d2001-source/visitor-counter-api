import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * (نواة بدون server-only لاستخدامها في الاختبارات والسكربتات)
 * التحقق بخطوتين بلا مكتبات: TOTP وفق RFC 6238 فوق HOTP من RFC 4226 باستخدام node:crypto وحده.
 * SHA-1، ٦ أرقام، ٣٠ ثانية، ونافذة خطوة واحدة قبل الوقت الحالي وبعده لتحمّل فرق الساعات.
 *
 * المفاتيح تُشتق من APP_SECRET عبر HKDF بوسم لكل غرض، فلا يخدم مفتاح غرضًا آخر.
 * تغيير APP_SECRET يبطل الأسرار ورموز الاسترداد المخزنة: الحل عندها scripts/reset-admin-2fa.ts.
 */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;
export const RECOVERY_CODE_COUNT = 10;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** ٣٢ حرفًا بلا حروف ملتبسة (0 و O و 1 و I)، و byte & 31 يبقي التوزيع متساويًا */
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
/** ١٦ حرفًا × ٥ بت = ٨٠ بت عشوائية */
const RECOVERY_LENGTH = 16;

const HKDF_SALT = "farqad:two-factor:v1";
const KEY_LABEL = { totpSecret: "totp-secret-encryption", recoveryHash: "recovery-code-hash" } as const;

export function deriveKey(appSecret: string, label: string): Buffer {
  return Buffer.from(hkdfSync("sha256", appSecret, HKDF_SALT, label, 32));
}

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    // نبقي البتات التي لم تُكتب بعد فقط
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/=+$/, "").toUpperCase()) {
    const digit = BASE32_ALPHABET.indexOf(ch);
    if (digit < 0) throw new Error("invalid base32");
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

/** ١٦٠ بت عشوائية، الطول الذي يوصي به RFC 4226 لـ HMAC-SHA-1 */
export function generateTotpSecret(): Buffer {
  return randomBytes(20);
}

export function timeStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const truncated = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(truncated % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** مقارنة بزمن ثابت: أي سر يُقارن عبر هذه الدالة */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * يعيد الخطوة الزمنية المطابقة للرمز، أو null. تُفحص النوافذ كلها دون خروج مبكر،
 * وعند تطابق أكثر من خطوة تُؤخذ الأحدث، لأن منع إعادة الاستخدام يقارن بآخر خطوة مقبولة.
 */
export function matchTotpStep(secret: Buffer, code: string, nowMs: number): number | null {
  const current = timeStep(nowMs);
  let matched: number | null = null;
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step++) {
    if (step >= 0 && constantTimeEqual(hotp(secret, step), code)) matched = step;
  }
  return matched;
}

/** الصيغة المخزنة: v1.nonce.ciphertext.tag. معرّف المستخدم بيانات مصادقة، فلا يُنقل السر بين حسابين */
export function sealTotpSecret(secret: Buffer, appSecret: string, userId: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(appSecret, KEY_LABEL.totpSecret), nonce);
  cipher.setAAD(Buffer.from(userId));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return ["v1", nonce.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

/** يرمي عند أي عبث أو مفتاح مختلف */
export function openTotpSecret(sealed: string, appSecret: string, userId: string): Buffer {
  const [version, nonce, ciphertext, tag] = sealed.split(".");
  if (version !== "v1" || !nonce || !ciphertext || !tag) throw new Error("unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(appSecret, KEY_LABEL.totpSecret), Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]);
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const chars = Array.from(randomBytes(RECOVERY_LENGTH), (b) => RECOVERY_ALPHABET[b & 31]).join("");
    return chars.match(/.{4}/g)!.join("-");
  });
}

/** مفتاح سري ومعرّف المستخدم داخل التجزئة: تسريب الجدول وحده لا يسمح بتجربة أي رمز */
export function hashRecoveryCode(normalized: string, appSecret: string, userId: string): string {
  return createHmac("sha256", deriveKey(appSecret, KEY_LABEL.recoveryHash)).update(`${userId}:${normalized}`).digest("hex");
}

export type SecondFactorInput = { kind: "totp"; code: string } | { kind: "recovery"; code: string };

/** يقبل الأرقام العربية والفارسية، والمسافات والشرطات والعلامات الخفية التي يضيفها النسخ من صفحة RTL */
export function parseSecondFactorCode(raw: unknown): SecondFactorInput | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  const cleaned = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\u200B-\u200F\u202A-\u202E\u2066-\u2069\-\u2010-\u2015]/g, "")
    .toUpperCase();
  if (new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(cleaned)) return { kind: "totp", code: cleaned };
  if (cleaned.length === RECOVERY_LENGTH && Array.from(cleaned).every((c) => RECOVERY_ALPHABET.includes(c))) return { kind: "recovery", code: cleaned };
  return null;
}

export function otpauthUri(input: { issuer: string; account: string; secretBase32: string }): string {
  const issuer = encodeURIComponent(input.issuer);
  const label = `${issuer}:${encodeURIComponent(input.account)}`;
  return `otpauth://totp/${label}?secret=${input.secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}

/** المفتاح اليدوي مجموعات من ٤ أحرف ليسهل نقله */
export function groupForDisplay(text: string): string {
  return text.match(/.{1,4}/g)?.join(" ") ?? text;
}
