import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { HASH_BUSY_RETRY_AFTER_SECONDS } from "@/lib/busy";
import { DatabaseBusyError } from "../db-busy";
import { noteSaturation } from "../platform/saturation";

/**
 * حد تجزئة كلمات المرور على نسخة الخادم الواحدة. كل عملية scrypt (ذاكرة ٣٢ ميغابايت وثلاث دورات) تشغل المعالج،
 * فموجة دخول قبل امتحان تملأ الذاكرة وتعطل بقية الموقع إن جرت كلها معًا. لا نخفف التجزئة، بل ننظم الدور:
 * لا يجري منها أكثر من slots في وقت واحد، وما زاد ينتظر دوره، وما زاد على الطابور أو طال انتظاره يُرفض قبل أي عمل.
 *
 * الطابور: مكانان × ٥ ثوانٍ ÷ نحو ٠٫٢ ثانية للعملية = ٥٠. من يقف بعد الخمسين ستنتهي مهلته قبل دوره، فرفضه فورًا أرحم به.
 * الحد لكل نسخة: Vercel يشغل نسخًا كثيرة، لكل منها ذاكرتها ومعالجها، فلا يحتاج الحد إلى اتفاق بينها.
 *
 * الرفض DatabaseBusyError("hash"): كل معالجة «المنصة مشغولة» الموجودة تعمل عليه، ومسارات كلمة المرور تحوله إلى رسالة ودية.
 * يحدث الرفض قبل أي كتابة وقبل البحث عن الحساب: لا يُحتسب إخفاقًا، ولا يختلف بين بريد مسجل وغير مسجل.
 */
export const HASH_GATE_DEFAULTS = { slots: 2, queue: 50, waitMs: 5_000 } as const;

let limits: { slots: number; queue: number; waitMs: number } = { ...HASH_GATE_DEFAULTS };

type Waiter = { grant: () => void; timer: ReturnType<typeof setTimeout> };

let active = 0;
const waiting: Waiter[] = [];

/** من يحمل مكانًا لا ينتظر مكانًا ثانيًا لتجزئته الداخلية. live تُطفأ عند التحرير، فعمل منفصل بقي بعده لا يتخطى الدور */
const holder = new AsyncLocalStorage<{ live: boolean }>();

export function hashGateState() {
  return { active, waiting: waiting.length, ...limits };
}

/** للاختبارات فقط: حدود أصغر وأقصر */
export function configureHashGateForTests(next: Partial<typeof limits> | null) {
  limits = { ...HASH_GATE_DEFAULTS, ...(next ?? {}) };
}

function refusal() {
  noteSaturation("login_shed");
  return new DatabaseBusyError("hash");
}

function acquire(): Promise<void> {
  if (active < limits.slots && waiting.length === 0) {
    active++;
    return Promise.resolve();
  }
  if (waiting.length >= limits.queue) return Promise.reject(refusal());
  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      grant: () => {
        clearTimeout(waiter.timer);
        resolve();
      },
      timer: setTimeout(() => {
        const at = waiting.indexOf(waiter);
        if (at >= 0) waiting.splice(at, 1);
        reject(refusal());
      }, limits.waitMs),
    };
    waiting.push(waiter);
  });
}

function release() {
  // المكان ينتقل مباشرة إلى أول المنتظرين، فلا يسبقه طلب وصل للتو
  const next = waiting.shift();
  if (next) next.grant();
  else active--;
}

/**
 * يشغل work بعد الحصول على مكان. يلف العمل الذي يجب ألا يبدأ لطلب سيُرفض (حجز عدّادات الإخفاق، البحث عن الحساب)
 * مع التجزئة نفسها، ويعاد المكان فور انتهاء الفحص لا بعد الرد.
 */
export async function withHashSlot<T>(work: () => Promise<T>): Promise<T> {
  if (holder.getStore()?.live) return work();
  await acquire();
  const held = { live: true };
  try {
    return await holder.run(held, work);
  } finally {
    held.live = false;
    release();
  }
}

/** رفض البوابة، لا أي انشغال آخر في قاعدة البيانات */
export function isHashBusy(err: unknown): boolean {
  return err instanceof DatabaseBusyError && err.reason === "hash";
}

export { HASH_BUSY_RETRY_AFTER_SECONDS };
