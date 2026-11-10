/**
 * آخر ما عرفه هذا المتصفح عن السلة بعد إضافة من الزر، بلا إعادة رسم الصفحة.
 * العدد يظل صالحًا ما دام الرأس المرسوم هو نفسه الذي كان ظاهرًا وقت الإضافة (stamp). أي رسم أحدث من الخادم أصدق منه.
 * البصمة تخص صفحتي السلة والدفع: تُستهلك مرة واحدة، فلا تتكرر إعادة الجلب.
 */
export type CartSnapshot = { count: number; signature: string | null; stamp: string | null };

let latest: CartSnapshot | null = null;
let mountedStamp: string | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getCartSnapshot = (): CartSnapshot | null => latest;

/** نتيجة إضافة ناجحة من الخادم */
export function recordCart(count: number, signature: string) {
  latest = { count, signature, stamp: mountedStamp };
  emit();
}

/** الرأس المعروض الآن. الإضافة قد تسبق وصول الجزء المتدفق من الرأس، فتُنسب إلى أول رأس يظهر بعدها */
export function registerHeaderStamp(stamp: string) {
  mountedStamp = stamp;
  if (latest && latest.stamp === null) {
    latest = { ...latest, stamp };
    emit();
  }
}

/** العدد المعروض: آخر إضافة إن كانت بعد هذا الرسم، وإلا فما قاله الخادم */
export function visibleCartCount(serverCount: number, stamp: string, snapshot: CartSnapshot | null): number {
  return snapshot && snapshot.stamp === stamp ? snapshot.count : serverCount;
}

/** هل نسخة صفحة السلة المعروضة أقدم من آخر إضافة؟ الجواب يُستهلك: مرة واحدة لكل إضافة */
export function cartPageIsStale(signature: string): boolean {
  if (!latest || latest.signature === null) return false;
  const stale = latest.signature !== signature;
  latest = { ...latest, signature: null };
  return stale;
}

/** للاختبارات */
export function resetCartStoreForTests() {
  latest = null;
  mountedStamp = null;
  listeners.clear();
}
