/**
 * الطلبات الصادرة (بوابة الدفع، Bunny، Supabase Storage) — مساعد واحد صغير.
 *
 *  - مهلة واحدة تغطي الاتصال والترويسات والجسم كله: المؤقت لا يُلغى عند وصول الترويسات بل عند اكتمال قراءة الجسم،
 *    فرد يرسل ترويسات ثم يتوقف ينتهي بخطأ ولا يعلق حتى حد المنصة.
 *  - سقف لحجم الجسم يُفرض أثناء القراءة (لا يُوثق بـ Content-Length وحده).
 *  - لا يتبع التحويلات (3xx) إلا إذا طُلب صراحة: تحويل غير متوقع من واجهة API خطأ، لا مكان جديد نرسل إليه المفتاح.
 *  - idleMs اختياري للتنزيلات الطويلة: يُقطع التنزيل إن لم يصل بايت جديد خلالها.
 *
 * بلا "server-only" لأن سكربتات النسخ الاحتياطي في scripts/ تستورده أيضًا. لا يرسل شيئًا إلى السجل: رسائل الخطأ
 * لا تحمل الرابط (قد يحمل توقيعًا) ولا الترويسات (تحمل المفاتيح).
 */

export type OutboundFailure = "timeout" | "stalled" | "too_large" | "redirect" | "network";

export class OutboundError extends Error {
  constructor(
    readonly kind: OutboundFailure,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "OutboundError";
  }
}

export type OutboundOptions = {
  /** المهلة الكلية بالمللي ثانية، من بدء الطلب حتى آخر بايت. 0 يعني بلا مهلة كلية (للمهام الطويلة الصريحة، ومعها idleMs) */
  timeoutMs: number;
  /** أقصى حجم للجسم بالبايت */
  maxBytes: number;
  /** true: يقرأ حتى maxBytes ثم يتوقف بهدوء بدل الخطأ (قراءة أول بايتات من ملف) */
  truncate?: boolean;
  /** يقطع الطلب إن مرت هذه المدة دون بايت جديد في الجسم */
  idleMs?: number;
  /** يتبع التحويلات. الافتراضي لا */
  followRedirects?: boolean;
};

const MESSAGES: Record<OutboundFailure, string> = {
  timeout: "انتهت مهلة الطلب الصادر",
  stalled: "توقف وصول الرد قبل اكتماله",
  too_large: "الرد أكبر من الحد المسموح",
  redirect: "رد بتحويل غير متوقع",
  network: "تعذر الاتصال",
};

function describe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err.cause as { code?: unknown } | undefined)?.code ?? (err as { code?: unknown }).code;
    return typeof code === "string" ? `${err.name} ${code}` : err.name;
  }
  return "unknown";
}

/**
 * fetch بحدود. يعيد Response عاديًا جسمه محدود بالمهلة والحجم، فيصلح أن يُمرر إلى مكتبة تقرأ الجسم بنفسها
 * (عميل Supabase عبر global.fetch). الأخطاء كلها OutboundError.
 */
export async function boundedFetch(input: string | URL | Request, init: RequestInit | undefined, opts: OutboundOptions): Promise<Response> {
  const controller = new AbortController();
  let failure: OutboundFailure | null = null;
  const fail = (kind: OutboundFailure) => {
    if (failure) return;
    failure = kind;
    controller.abort(new OutboundError(kind, MESSAGES[kind]));
  };
  const timer = opts.timeoutMs > 0 ? setTimeout(() => fail("timeout"), opts.timeoutMs) : null;
  timer?.unref?.();
  let idle: ReturnType<typeof setTimeout> | null = null;
  const armIdle = () => {
    if (!opts.idleMs) return;
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => fail("stalled"), opts.idleMs);
    idle.unref?.();
  };
  const finish = () => {
    if (timer) clearTimeout(timer);
    if (idle) clearTimeout(idle);
  };
  // إلغاء المستدعي (مثل signal من مكتبة) يوقف الطلب أيضًا
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
  }
  const asError = (err: unknown): Error => (failure ? new OutboundError(failure, MESSAGES[failure], { cause: err }) : err instanceof OutboundError ? err : outer?.aborted ? (err as Error) : new OutboundError("network", `${MESSAGES.network}: ${describe(err)}`, { cause: err }));

  armIdle();
  let res: Response;
  try {
    res = await fetch(input, { ...init, signal: controller.signal, redirect: opts.followRedirects ? "follow" : "manual" });
  } catch (err) {
    finish();
    throw asError(err);
  }
  if (!opts.followRedirects && res.status >= 300 && res.status < 400) {
    finish();
    await res.body?.cancel().catch(() => {});
    throw new OutboundError("redirect", `${MESSAGES.redirect} (${res.status})`);
  }
  const declared = Number(res.headers.get("content-length"));
  if (!opts.truncate && Number.isFinite(declared) && declared > opts.maxBytes) {
    finish();
    await res.body?.cancel().catch(() => {});
    throw new OutboundError("too_large", MESSAGES.too_large);
  }
  if (!res.body) {
    finish();
    return res;
  }
  armIdle();
  const reader = res.body.getReader();
  let received = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        finish();
        ctrl.error(asError(err));
        return;
      }
      if (chunk.done) {
        finish();
        ctrl.close();
        return;
      }
      armIdle();
      const room = opts.maxBytes - received;
      if (chunk.value.byteLength > room) {
        finish();
        if (opts.truncate) {
          if (room > 0) ctrl.enqueue(chunk.value.subarray(0, room));
          received = opts.maxBytes;
          ctrl.close();
          // ما بعد السقف لا نحتاجه: نوقف التنزيل
          controller.abort();
          reader.cancel().catch(() => {});
          return;
        }
        fail("too_large");
        ctrl.error(new OutboundError("too_large", MESSAGES.too_large));
        reader.cancel().catch(() => {});
        return;
      }
      received += chunk.value.byteLength;
      ctrl.enqueue(chunk.value);
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason).catch(() => {});
    },
  });
  // 204 و304 لا يقبلان جسمًا في Response
  return new Response(res.status === 204 || res.status === 304 ? null : body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

export type OutboundText = { status: number; ok: boolean; headers: Headers; text: string };

/** يقرأ الرد نصًا كاملًا داخل المهلة نفسها */
export async function fetchText(input: string | URL, init: RequestInit | undefined, opts: OutboundOptions): Promise<OutboundText> {
  const res = await boundedFetch(input, init, opts);
  const text = await res.text();
  return { status: res.status, ok: res.ok, headers: res.headers, text };
}

export type OutboundBytes = { status: number; ok: boolean; headers: Headers; bytes: Uint8Array };

export async function fetchBytes(input: string | URL, init: RequestInit | undefined, opts: OutboundOptions): Promise<OutboundBytes> {
  const res = await boundedFetch(input, init, opts);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, ok: res.ok, headers: res.headers, bytes };
}

/**
 * fetch لعميل Supabase Storage (global.fetch): مهلة لكل نوع من الطلبات.
 * التحكم (توقيع، معلومات، قائمة، حذف) قصير وصغير؛ التنزيل والرفع أطول، والتنزيل يُقطع إن توقف وصول البايتات.
 */
export type StorageFetchLimits = {
  controlMs: number;
  /** 0: بلا مهلة كلية للنقل (مهمة طويلة صريحة)، ويبقى idleMs */
  transferMs: number;
  idleMs: number;
  maxDownloadBytes: number;
};

export const STORAGE_LIMITS: StorageFetchLimits = { controlMs: 10_000, transferMs: 60_000, idleMs: 15_000, maxDownloadBytes: 128 * 1024 * 1024 };

/**
 * بث ملف من التخزين إلى المتصفح (نسخة PDF مختومة أو الأصل للمالك): البث يسير بسرعة هاتف الطالب،
 * فالمهلة الكلية قريبة من مهلة الدالة (300 ثانية) لا من مهلة النقل الداخلي، ويُقطع إن توقف 30 ثانية.
 */
export const DELIVERY_STREAM_LIMITS: OutboundOptions = { timeoutMs: 280_000, maxBytes: 128 * 1024 * 1024, idleMs: 30_000 };

const CONTROL_BYTES = 1024 * 1024;

/** هل الطلب تنزيل لملف كائن؟ GET على /object/... عدا info و sign و list */
export function isStorageDownload(method: string, url: string): boolean {
  if (method.toUpperCase() !== "GET") return false;
  const path = new URL(url).pathname;
  return /\/storage\/v1\/object\//.test(path) && !/\/storage\/v1\/object\/(info|sign|list|upload\/sign)\//.test(path);
}

export function isStorageUpload(method: string, url: string): boolean {
  const m = method.toUpperCase();
  if (m !== "POST" && m !== "PUT") return false;
  const path = new URL(url).pathname;
  return /\/storage\/v1\/object\//.test(path) && !/\/storage\/v1\/object\/(info|sign|list|move|copy|upload\/sign)\b/.test(path);
}

export function storageFetch(limits: StorageFetchLimits = STORAGE_LIMITS): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (isStorageDownload(method, url)) return boundedFetch(input, init, { timeoutMs: limits.transferMs, maxBytes: limits.maxDownloadBytes, idleMs: limits.idleMs });
    if (isStorageUpload(method, url)) return boundedFetch(input, init, { timeoutMs: limits.transferMs, maxBytes: CONTROL_BYTES });
    return boundedFetch(input, init, { timeoutMs: limits.controlMs, maxBytes: CONTROL_BYTES });
  }) as typeof fetch;
}
