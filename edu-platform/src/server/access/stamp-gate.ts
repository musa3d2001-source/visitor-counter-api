import "server-only";
import { noteSaturation } from "../platform/saturation";

/**
 * حد أعمال PDF الثقيلة الجارية على نسخة الخادم الواحدة: ختم نسخة مشترٍ، فحص ملف مرفوع، بناء معاينة.
 * كل منها يحمّل الملف كله في الذاكرة ويشغل المعالج الوحيد، فلا يجري منها أكثر من slots في وقت واحد.
 * ما زاد ينتظر في طابور قصير، وما زاد على الطابور أو طال انتظاره يُرفض فورًا بـ StampBusyError
 * فيجيب الطلب 503 مع Retry-After، والقارئ يعيد المحاولة وحده.
 *
 * الحد لكل نسخة: Vercel يشغل نسخًا كثيرة، لكل منها ذاكرتها، فلا يحتاج الحد إلى اتفاق بينها.
 * المكان لا يُحرر قبل أن يتوقف العمل نفسه (الختم يفحص مهلته من داخل pdf-lib)، فالعدد لا يكذب.
 * الاشتقاق في lib/pdf-limits.ts و docs/PDF_STAMPING.md.
 */
export const STAMP_GATE_DEFAULTS = { slots: 2, queue: 6, waitMs: 20_000, retryAfterSeconds: 10 } as const;

let limits: { slots: number; queue: number; waitMs: number; retryAfterSeconds: number } = { ...STAMP_GATE_DEFAULTS };

export class StampBusyError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("pdf work is at capacity on this instance");
    this.name = "StampBusyError";
  }
}

type Waiter = { grant: () => void; timer: ReturnType<typeof setTimeout> };

let active = 0;
const waiting: Waiter[] = [];

export function stampGateState() {
  return { active, waiting: waiting.length, ...limits };
}

/** للاختبارات فقط: حدود أصغر وأقصر */
export function configureStampGateForTests(next: Partial<typeof limits> | null) {
  limits = { ...STAMP_GATE_DEFAULTS, ...(next ?? {}) };
}

function refusal() {
  noteSaturation("stamp_shed");
  return new StampBusyError(limits.retryAfterSeconds);
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

export async function withStampSlot<T>(work: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await work();
  } finally {
    release();
  }
}
