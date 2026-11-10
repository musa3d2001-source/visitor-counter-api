import "server-only";

/**
 * حاجز في الذاكرة لرفض إشعارات Bunny غير الصحيحة قبل قراءة أجسامها.
 * لكل نسخة خادم عدادها، وهذا مقصود: اختلاف النسخ يعني فقط أن الحد الفعلي مضروب في عددها، ولا يمر توقيع خاطئ بسببه.
 * الإشعارات الموقعة لا تُعد، فلا يُحظر Bunny بسبب ضغطه. عنوان "unknown" لا يُحظر، لأن كل الزوار يصبحون عنوانًا واحدًا.
 * منفصل عن حاجز الدفع حتى لا يستهلك هذا ميزانية ذاك.
 */
const WINDOW_MS = 60_000;
export const BUNNY_WEBHOOK_REJECTIONS_PER_ADDRESS = 30;
const MAX_TRACKED = 5_000;

type Entry = { startedAt: number; rejected: number };
const tracked = new Map<string, Entry>();

export function resetBunnyWebhookGate() {
  tracked.clear();
}

const usable = (ip: string) => ip !== "" && ip !== "unknown";

/** هل تجاوز هذا العنوان حد الرفض؟ لا يغيّر شيئًا، ويُسأل قبل قراءة الجسم */
export function bunnyWebhookRefused(ip: string, now = Date.now()): { refused: boolean; retryAfterSeconds: number } {
  if (!usable(ip)) return { refused: false, retryAfterSeconds: 0 };
  const entry = tracked.get(ip);
  if (!entry || now - entry.startedAt >= WINDOW_MS || entry.rejected < BUNNY_WEBHOOK_REJECTIONS_PER_ADDRESS) return { refused: false, retryAfterSeconds: 0 };
  return { refused: true, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - entry.startedAt)) / 1000)) };
}

export function recordBunnyWebhookRejection(ip: string, now = Date.now()) {
  if (!usable(ip)) return;
  let entry = tracked.get(ip);
  if (entry && now - entry.startedAt >= WINDOW_MS) {
    tracked.delete(ip);
    entry = undefined;
  }
  if (!entry) {
    if (tracked.size >= MAX_TRACKED) tracked.delete(tracked.keys().next().value!);
    entry = { startedAt: now, rejected: 0 };
    tracked.set(ip, entry);
  }
  entry.rejected++;
}
