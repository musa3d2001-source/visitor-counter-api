import "server-only";

/**
 * حدود في الذاكرة لرفض إشعارات البوابة غير الصحيحة، قبل أي كتابة في قاعدة البيانات.
 * لكل نسخة خادم عدادها، وهذا مقصود: اختلاف النسخ يعني فقط أن الحد الفعلي مضروب في عددها، ولا يمر توقيع خاطئ بسببه.
 * عداد في قاعدة البيانات كان سيجعل كل طلب مرفوض كتابة، وهي الكلفة التي نمنعها.
 *
 * الإشعارات الموقعة لا تُعد هنا: البوابة لا تُحظر بسبب ضغطها، وعنوان يرسل توقيعًا صحيحًا لا يصل إلى الحد.
 * عنوان "unknown" (لا نعرف الوكيل) لا يُحظر، لأن كل الزوار يصبحون عنوانًا واحدًا، ويحده السقف العام للكتابات.
 */
const WINDOW_MS = 60_000;
/** بعدها ترد الصفحة 429 قبل قراءة الجسم */
export const WEBHOOK_REJECTIONS_PER_ADDRESS = 30;
/** كتابات في حلقة الرفض لكل عنوان ولكل نسخة خادم في الدقيقة */
export const RING_WRITES_PER_ADDRESS = 3;
export const RING_WRITES_PER_MINUTE = 20;
/** عناوين تتذكرها النسخة، والأقدم يُنسى أولًا: الذاكرة محدودة مهما تغيرت العناوين */
const MAX_TRACKED = 5_000;

type Entry = { startedAt: number; rejected: number; written: number };
const tracked = new Map<string, Entry>();
let windowStartedAt = 0;
let writesThisWindow = 0;

export function resetWebhookGate() {
  tracked.clear();
  windowStartedAt = 0;
  writesThisWindow = 0;
}

const usable = (ip: string) => ip !== "" && ip !== "unknown";

function entryFor(ip: string, now: number): Entry {
  let entry = tracked.get(ip);
  if (entry && now - entry.startedAt >= WINDOW_MS) {
    tracked.delete(ip);
    entry = undefined;
  }
  if (!entry) {
    if (tracked.size >= MAX_TRACKED) tracked.delete(tracked.keys().next().value!);
    entry = { startedAt: now, rejected: 0, written: 0 };
    tracked.set(ip, entry);
  }
  return entry;
}

/** هل تجاوز هذا العنوان حد الرفض؟ لا يغيّر شيئًا، ويُسأل قبل قراءة الجسم */
export function webhookAddressRefused(ip: string, now = Date.now()): { refused: boolean; retryAfterSeconds: number } {
  if (!usable(ip)) return { refused: false, retryAfterSeconds: 0 };
  const entry = tracked.get(ip);
  if (!entry || now - entry.startedAt >= WINDOW_MS || entry.rejected < WEBHOOK_REJECTIONS_PER_ADDRESS) return { refused: false, retryAfterSeconds: 0 };
  return { refused: true, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - entry.startedAt)) / 1000)) };
}

/** يُحتسب الرفض، ويعيد true إن كان مسموحًا بكتابته في الحلقة */
export function admitRejectionWrite(ip: string, now = Date.now()): boolean {
  if (now - windowStartedAt >= WINDOW_MS) {
    windowStartedAt = now;
    writesThisWindow = 0;
  }
  if (usable(ip)) {
    const entry = entryFor(ip, now);
    entry.rejected++;
    if (entry.written >= RING_WRITES_PER_ADDRESS) return false;
    if (writesThisWindow >= RING_WRITES_PER_MINUTE) return false;
    entry.written++;
  } else if (writesThisWindow >= RING_WRITES_PER_MINUTE) {
    return false;
  }
  writesThisWindow++;
  return true;
}

const UNKNOWN_RETURNS_PER_ADDRESS = 30;
const unknownReturns = new Map<string, { startedAt: number; count: number }>();

export function resetPaymentReturnGate() {
  unknownReturns.clear();
}

/**
 * عودة من الدفع برقم لا يخص أي فاتورة عندنا. يُحتسب بعد البحث عن الرقم، فرقم حقيقي لا يمر من هنا أبدًا،
 * ومدرسة أو شبكة جوال خلف عنوان واحد لا يحجب أحد أبناؤها الآخر عن التحقق من دفعته. true: تجاوز الحد.
 */
export function unknownReturnRefused(ip: string, now = Date.now()): boolean {
  if (!usable(ip)) return false;
  let entry = unknownReturns.get(ip);
  if (entry && now - entry.startedAt >= WINDOW_MS) {
    unknownReturns.delete(ip);
    entry = undefined;
  }
  if (!entry) {
    if (unknownReturns.size >= MAX_TRACKED) unknownReturns.delete(unknownReturns.keys().next().value!);
    entry = { startedAt: now, count: 0 };
    unknownReturns.set(ip, entry);
  }
  entry.count++;
  return entry.count > UNKNOWN_RETURNS_PER_ADDRESS;
}
