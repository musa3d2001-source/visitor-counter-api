import "server-only";
import { after } from "next/server";

/**
 * يبقي نسخة Vercel حية حتى تُغلق اتصالات قاعدة البيانات الخاملة، فلا تُعلّق النسخة وهي تحجز مقاعد في الـ pooler.
 *
 * لماذا: مع Fluid compute تُعلّق النسخة بعد آخر طلب، و«مؤقتات الخمول لا تعمل أثناء التعليق»
 * (https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute). فاتصال خامل ينتظر
 * DATABASE_IDLE_TIMEOUT_SECONDS يبقى مفتوحًا عند Supavisor ما دامت النسخة معلقة، وموجة الطلاب الثانية تجد المقاعد محجوزة.
 *
 * الطريقة الموثقة هناك attachDatabasePool من @vercel/functions، وهي لا تقبل postgres.js ("Unsupported database pool type").
 * نفعل ما تفعله هي بالضبط: بعد كل استخدام للحوض تسجل وعدًا بـ waitUntil مدته مهلة الخمول + ١٠٠ مللي ثانية، وتنهي الوعد السابق.
 * و after() من next/server هو waitUntil في Next 15.1 وما بعده كما توصي وثيقة @vercel/functions
 * (https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)، فلا اعتمادية جديدة.
 * بعد انتهاء المهلة ننتظر حتى تُغلق الاتصالات فعلًا، ثانية واحدة على الأكثر.
 *
 * مفعل على نشر Vercel فقط (Production و Preview)، لا أثناء البناء ولا محليًا ولا في الاختبارات إلا صراحة.
 */
export type PoolHoldConfig = {
  enabled: () => boolean;
  /** مهلة الخمول الفعلية للحوض، بالمللي ثانية */
  idleMs: () => number;
  /** الاتصالات المفتوحة الآن في الحوض */
  connections: () => number;
  /** يسجل الوعد ليبقي النسخة حية. يرمي خارج نطاق طلب */
  register: (promise: Promise<void>) => void;
};

/** بعد مهلة الخمول: أقصى انتظار إضافي لإغلاق الاتصالات، ثم يُترك الوعد */
export const POOL_HOLD_EXTRA_MS = 1_000;
const POLL_MS = 100;
const AFTER_IDLE_MS = 100;

let config: PoolHoldConfig = { enabled: () => false, idleMs: () => 0, connections: () => 0, register: (promise) => after(promise) };

/** يعيد الإعداد السابق، لتعيده الاختبارات كما كان */
export function configurePoolHold(next: Partial<PoolHoldConfig>): PoolHoldConfig {
  const previous = config;
  config = { ...config, ...next };
  return previous;
}

/** هل يُتابع استخدام الحوض في هذا النشر؟ لا يرمي */
export function poolHoldActive(): boolean {
  try {
    return config.enabled();
  } catch {
    return false;
  }
}

type Hold = { promise: Promise<void>; due: number; timer: ReturnType<typeof setTimeout> | null; done: boolean; finish: () => void };
let current: Hold | null = null;

function arm(hold: Hold, ms: number) {
  hold.timer = setTimeout(() => tick(hold), Math.max(0, ms));
  // لا يبقي عملية Node محلية حية: على Vercel ما يبقيها هو الوعد المسجل
  hold.timer.unref?.();
}

function openConnections(): number {
  try {
    return config.connections();
  } catch {
    return 0;
  }
}

function tick(hold: Hold) {
  hold.timer = null;
  if (hold.done) return;
  const now = Date.now();
  if (now < hold.due) return arm(hold, hold.due - now);
  if (openConnections() > 0 && now < hold.due + POOL_HOLD_EXTRA_MS) return arm(hold, POLL_MS);
  hold.finish();
}

function createHold(due: number): Hold {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  const hold: Hold = {
    promise,
    due,
    timer: null,
    done: false,
    finish: () => {
      if (hold.done) return;
      hold.done = true;
      if (hold.timer) clearTimeout(hold.timer);
      hold.timer = null;
      if (current === hold) current = null;
      resolve();
    },
  };
  arm(hold, due - Date.now());
  return hold;
}

/**
 * يُستدعى عند انتهاء كل أمر أو معاملة، في سياق الطلب الذي أرسلها (ليجد after() طلبه).
 * يسجل وعدًا جديدًا وينهي السابق، فيبقى وعد واحد معلق لكل نسخة، مربوط بأحدث طلب.
 */
export function notePoolUsed(): void {
  if (!poolHoldActive()) return;
  let idleMs: number;
  try {
    idleMs = config.idleMs();
  } catch {
    return;
  }
  const due = Date.now() + idleMs + AFTER_IDLE_MS;
  const hold = createHold(due);
  try {
    config.register(hold.promise);
  } catch {
    // خارج نطاق طلب (بعد انتهاء الاستجابة مثلًا): لا شيء يُسجل، والوعد المعلق إن وُجد يمتد ليغطي هذا الاستخدام
    hold.finish();
    if (current && !current.done) current.due = Math.max(current.due, due);
    return;
  }
  const previous = current;
  current = hold;
  previous?.finish();
}

/** للاختبارات: لا وعد معلق */
export function resetPoolHoldForTests() {
  current?.finish();
  current = null;
}
