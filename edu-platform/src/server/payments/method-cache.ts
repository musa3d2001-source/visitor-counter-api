import "server-only";
import { sql } from "../db";

export type PaymentMethodOption = { id: number; nameAr: string; code: string; imageUrl: string };

/**
 * وسائل الدفع المعروضة بحسب شريحة المبلغ (K071). طبقتان:
 *  - ذاكرة النسخة: أسرع، لكنها تبدأ فارغة في كل نسخة جديدة.
 *  - صف مشترك في قاعدة البيانات: نسخة باردة تقرأه بدل أن تنتظر البوابة.
 * النسخ قد تختلف لدقائق، ولا ضرر: القائمة للعرض، و startPayment يتحقق من الوسيلة المختارة بنفسه وإلا استعمل رابط الدفع العام.
 * لا بيانات شخصية هنا، فلا مانع من مشاركتها بين النسخ.
 */

/** الحدود بالفلس (١، ٥، ١٠، ٢٥، ٥٠، ١٠٠، ٢٥٠ د.ك): البوابة قد تعرض وسائل مختلفة بحسب المبلغ، لكن ليس لكل فلس */
const BAND_EDGES_FILS = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000];
export const METHODS_FRESH_MS = 10 * 60_000;
/** أقدم من هذا لا يُعرض حتى مؤقتًا: الوسائل قد تكون تغيرت فعلًا */
export const METHODS_STALE_LIMIT_MS = 24 * 3600_000;

export function amountBand(amountFils: number): number {
  const index = BAND_EDGES_FILS.findIndex((edge) => amountFils < edge);
  return index === -1 ? BAND_EDGES_FILS.length : index;
}

type Entry = { at: number; methods: PaymentMethodOption[] };

const memory = new Map<string, Entry>();
const keyOf = (environment: string, band: number) => `${environment}:${band}`;

export function freshInMemory(environment: string, band: number): PaymentMethodOption[] | null {
  const entry = memory.get(keyOf(environment, band));
  return entry && Date.now() - entry.at <= METHODS_FRESH_MS ? entry.methods : null;
}

export function resetMethodMemory() {
  memory.clear();
}

/** لا يرمي: تعذر حفظ النسخة المشتركة لا يمنع عرض الوسائل */
export async function rememberMethods(environment: string, band: number, methods: PaymentMethodOption[]): Promise<void> {
  memory.set(keyOf(environment, band), { at: Date.now(), methods });
  try {
    await sql`
      insert into payment_method_cache (environment, band, methods, fetched_at)
      values (${environment}, ${band}, ${sql.json(methods as never)}, now())
      on conflict (environment, band) do update set methods = excluded.methods, fetched_at = now()
    `;
  } catch {
    // الذاكرة المحلية كافية لهذه النسخة
  }
}

/** النسخة المشتركة مع عمرها، null إن لم توجد أو تجاوزت حد القدم. تدخل ذاكرة هذه النسخة إن كانت طازجة */
export async function readSharedMethods(environment: string, band: number): Promise<{ methods: PaymentMethodOption[]; fresh: boolean } | null> {
  const [row] = await sql<{ methods: PaymentMethodOption[]; age_ms: number }[]>`
    select methods, (extract(epoch from now() - fetched_at) * 1000)::float8 as age_ms from payment_method_cache where environment = ${environment} and band = ${band}
  `;
  if (!row || row.age_ms > METHODS_STALE_LIMIT_MS) return null;
  const fresh = row.age_ms <= METHODS_FRESH_MS;
  if (fresh) memory.set(keyOf(environment, band), { at: Date.now() - row.age_ms, methods: row.methods });
  return { methods: row.methods, fresh };
}
