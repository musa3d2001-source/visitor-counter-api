import "server-only";
import { after } from "next/server";
import { isDatabaseBusy } from "../db-busy";
import { env } from "../env";
import { reportError } from "./report-error";

/**
 * ذاكرة للقراءات العامة بين الطلبات: ما يراه أي زائر مجهول دون أي فرق بين زائر وآخر.
 * تُستدعى من catalog/public-data.ts و platform/public-settings.ts وحدهما. اختبار public-cache-boundary يفشل إن ظهرت في غيرهما.
 *
 * لماذا في ذاكرة النسخة لا unstable_cache: يعمل مع force-dynamic، لكنه على Vercel مخزن إقليمي بحصة،
 * وعمر 60 ثانية يستهلك حصة الكتابة في خطة Hobby خلال يومين فيتوقف المخزن بقية الشهر، وكل قراءة منه ذهاب وإياب على الشبكة،
 * ويعيد القيمة القديمة مرة بعد انتهاء عمرها مهما طال غياب الزوار، فلا يضمن حدًا لعمرها.
 *
 * ما يضمنه هذا الملف:
 *  - لا تُقدَّم قيمة بعد انتهاء عمرها أبدًا، حتى لو تعطلت قاعدة البيانات. العمر يُحسب من قبل بدء القراءة لا من نهايتها.
 *  - التحميل المتزامن للمفتاح نفسه قراءة واحدة، والتحديث في الخلفية بعد نصف العمر فلا ينتظر الزائر.
 *  - الإبطال يمنع أي قراءة بدأت قبله من أن تُحفظ أو يلحق بها أحد: تعديل المالك لا تعيده قراءة أقدم منه.
 *  - أي خلل في الذاكرة نفسها يسقط إلى قاعدة البيانات، لا إلى صفحة خطأ.
 *  - الذاكرة محدودة العدد والحجم، والقيم مجمدة فلا يغير طلب ما يراه طلب آخر.
 *
 * كل نسخة من الخادم لها ذاكرتها، والإبطال يصل نسخته فقط. لذلك الحد الأعلى للتأخير في النسخ الأخرى هو العمر نفسه.
 */

const MAX_ENTRIES = 1000;
const MAX_TOTAL_CHARS = 12_000_000;
const MAX_ENTRY_CHARS = 2_000_000;
/** تحديثات الخلفية المتزامنة في النسخة: لا تسرق حوض الاتصالات الصغير من الطلبات الحية */
const MAX_BACKGROUND_REFRESHES = 2;
/** قراءة أطول من مهلة الانتظار والأمر معًا لا يلحق بها أحد، فلا يعلق المفتاح خلف قراءة ضائعة */
const FLIGHT_GIVE_UP_MS = 15_000;

type Entry = { value: unknown; bornAt: number; chars: number };
type Flight = { promise: Promise<unknown>; generation: number; startedAt: number };

type Stats = { hits: number; staleHits: number; misses: number; joined: number; backgroundRefreshes: number; stored: number; notStored: number; internalFailures: number };

type State = {
  entries: Map<string, Entry>;
  flights: Map<string, Flight>;
  generation: number;
  totalChars: number;
  refreshing: number;
  stats: Stats;
};

const blankStats = (): Stats => ({ hits: 0, staleHits: 0, misses: 0, joined: 0, backgroundRefreshes: 0, stored: 0, notStored: 0, internalFailures: 0 });

// على globalThis لأن Next يحزّم طبقات الخادم منفصلة: إجراء الإدارة ومسار الرفع يبطلان ما تقرؤه الصفحات
const holder = globalThis as unknown as { __publicCache?: State };

function state(): State {
  return (holder.__publicCache ??= { entries: new Map(), flights: new Map(), generation: 0, totalChars: 0, refreshing: 0, stats: blankStats() });
}

export type PublicCacheOptions<T> = {
  /** قيمة لا تُحفظ: نتيجة «غير موجود» لرابط عشوائي لا تأخذ مكانًا، ومنتج نُشر الآن يظهر فورًا */
  skipStore?: (value: T) => boolean;
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

/** false إن احتوت القيمة ما لا يُجمَّد (مصفوفة بايتات): تعود لطالبها ولا تُحفظ */
function tryFreeze(value: unknown): boolean {
  try {
    deepFreeze(value);
    return true;
  } catch {
    return false;
  }
}

function lifetimeMs(): number {
  return env().PUBLIC_CACHE_SECONDS * 1000;
}

function forget(s: State, key: string, entry: Entry) {
  s.entries.delete(key);
  s.totalChars -= entry.chars;
}

function remember(s: State, key: string, value: unknown, bornAt: number, generation: number) {
  try {
    if (generation !== s.generation) return;
    const chars = JSON.stringify(value)?.length ?? 0;
    if (chars > MAX_ENTRY_CHARS) {
      s.stats.notStored++;
      return;
    }
    const existing = s.entries.get(key);
    if (existing) {
      // قراءتان تداخلتا: تبقى الأحدث بدءًا
      if (existing.bornAt > bornAt) return;
      forget(s, key, existing);
    }
    s.entries.set(key, { value, bornAt, chars });
    s.totalChars += chars;
    s.stats.stored++;
    for (const [oldestKey, oldest] of s.entries) {
      if (s.entries.size <= MAX_ENTRIES && s.totalChars <= MAX_TOTAL_CHARS) break;
      forget(s, oldestKey, oldest);
    }
  } catch {
    // قيمة لا تُسلسل (BigInt مثلًا) تعود للطالب وتُقرأ من قاعدة البيانات في المرة القادمة
    s.stats.notStored++;
  }
}

function liveFlight(s: State, key: string, now: number): Flight | null {
  const flight = s.flights.get(key);
  return flight && flight.generation === s.generation && now - flight.startedAt < FLIGHT_GIVE_UP_MS ? flight : null;
}

function startFlight<T>(s: State, key: string, loader: () => Promise<T>, options: PublicCacheOptions<T>): Promise<T> {
  const generation = s.generation;
  const startedAt = performance.now();
  const run = async () => {
    const value = await loader();
    if (!tryFreeze(value)) s.stats.notStored++;
    else if (!options.skipStore?.(value)) remember(s, key, value, startedAt, generation);
    return value;
  };
  const flight: Flight = { generation, startedAt, promise: Promise.resolve() };
  const promise = run().finally(() => {
    if (s.flights.get(key) === flight) s.flights.delete(key);
  });
  flight.promise = promise;
  s.flights.set(key, flight);
  return promise;
}

async function reportRefreshFailure(err: unknown) {
  if (isDatabaseBusy(err)) return;
  await reportError("public-cache:refresh", err).catch(() => undefined);
}

function refreshInBackground<T>(s: State, key: string, loader: () => Promise<T>, options: PublicCacheOptions<T>, now: number) {
  if (s.refreshing >= MAX_BACKGROUND_REFRESHES || liveFlight(s, key, now)) return;
  s.refreshing++;
  s.stats.backgroundRefreshes++;
  const work = startFlight(s, key, loader, options)
    .then(() => undefined, reportRefreshFailure)
    .finally(() => {
      s.refreshing--;
    });
  try {
    after(() => work);
  } catch {
    // خارج سياق طلب: الوعد يكمل وحده
  }
}

/** متزامنة عمدًا: ما يرميه هذا الجزء خلل في الذاكرة نفسها، أما خطأ قاعدة البيانات فيصل في الوعد المرجع */
function lookup<T>(key: string, loader: () => Promise<T>, options: PublicCacheOptions<T>, lifetime: number): Promise<T> {
  const s = state();
  const now = performance.now();
  const entry = s.entries.get(key);
  if (entry) {
    const age = now - entry.bornAt;
    if (age < lifetime) {
      s.entries.delete(key);
      s.entries.set(key, entry);
      if (age >= lifetime / 2) {
        s.stats.staleHits++;
        refreshInBackground(s, key, loader, options, now);
      } else {
        s.stats.hits++;
      }
      return Promise.resolve(entry.value as T);
    }
    forget(s, key, entry);
  }
  const flight = liveFlight(s, key, now);
  if (flight) {
    s.stats.joined++;
    return flight.promise as Promise<T>;
  }
  s.stats.misses++;
  return startFlight(s, key, loader, options);
}

function tryLookup<T>(key: string, loader: () => Promise<T>, options: PublicCacheOptions<T>): Promise<T> | null {
  try {
    const lifetime = lifetimeMs();
    return lifetime > 0 ? lookup(key, loader, options, lifetime) : null;
  } catch {
    try {
      state().stats.internalFailures++;
    } catch {
      // العداد للاختبارات فقط
    }
    return null;
  }
}

/**
 * key يجب أن يصف الطلب كله بقيم عامة فقط، والمحمّل يجب ألا يعتمد على المستخدم أو الجلسة أو السلة.
 * المحمّل يقرأ قاعدة البيانات مباشرة ولا يستدعي نسخة مخزنة أخرى، حتى لا يتراكم عمر فوق عمر.
 * عند العمر صفر لا يُحفظ شيء، لكن التجميد يبقى: الاختبارات تكشف أي صفحة تعدّل ما قرأته.
 */
export async function publicCached<T>(key: string, loader: () => Promise<T>, options: PublicCacheOptions<T> = {}): Promise<T> {
  const pending = tryLookup(key, loader, options);
  if (pending) return pending;
  const value = await loader();
  tryFreeze(value);
  return value;
}

/** بعد تعديل من الإدارة. لا يرمي أبدًا: التعديل حُفظ، وأقصى أثر للفشل بقاء القديم حتى نهاية عمره */
export function invalidatePublicCache(): void {
  try {
    const s = state();
    s.generation++;
    s.entries.clear();
    s.flights.clear();
    s.totalChars = 0;
  } catch {
    // لا شيء يمكن فعله هنا
  }
}

/** للاختبارات */
export function publicCacheStats(): Stats & { entries: number; totalChars: number } {
  const s = state();
  return { ...s.stats, entries: s.entries.size, totalChars: s.totalChars };
}

/** للاختبارات: بداية نظيفة بلا أثر من اختبار سابق */
export function resetPublicCacheForTests(): void {
  invalidatePublicCache();
  const s = state();
  s.stats = blankStats();
  s.refreshing = 0;
}
