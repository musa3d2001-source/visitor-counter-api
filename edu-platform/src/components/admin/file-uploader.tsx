"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, ImageUp, LoaderCircle, RefreshCw, TriangleAlert, Upload, WifiOff } from "lucide-react";
import { ar } from "@/lib/design";
import { runTusUpload } from "@/lib/tus-upload";
import { classifyPutResponse, isTransientServerStatus, networkFailure, putWithRetry, retryDelayMs, UPLOAD_RETRY, type PutOutcome, type RetryNotice } from "@/lib/upload-retry";
import { takePickedFiles } from "@/lib/picked-files";
import { cn } from "@/lib/utils";

export type UploadTargetName = "main" | "preview" | "cover" | "lesson" | "logo" | "teacher_photo" | "lesson_thumb";

type InitResponse =
  | {
      key: string;
      method: "PUT";
      url: string;
      headers: Record<string, string>;
      error?: string;
    }
  | {
      key: string;
      method: "TUS";
      endpoint: string;
      headers: Record<string, string>;
      metadata: Record<string, string>;
      videoId: string;
      error?: string;
    };

export type UploadPhase = "uploading" | "processing" | "retrying" | "offline";
export type UploadProgress = (pct: number, phase: UploadPhase, retry?: { attempt: number; of: number }) => void;
/** ما يلزم لإكمال محاولة فشلت بدل البدء من الصفر */
export type UploadResume = {
  /** الملف وصل التخزين، والمتبقي تأكيده فقط */
  confirm?: { key: string; method: "PUT" | "TUS" };
  /** درس Bunny لم يكتمل رفعه، فلا يُنشأ درس آخر */
  videoId?: string;
};
export type UploadResult = { ok: true; message: string } | { ok: false; error: string; canRetry?: boolean; resume?: UploadResume };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function waitForOnline(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (back: boolean) => {
      window.removeEventListener("online", onOnline);
      clearTimeout(timer);
      resolve(back);
    };
    const onOnline = () => done(true);
    const timer = setTimeout(() => done(navigator.onLine), timeoutMs);
    window.addEventListener("online", onOnline);
  });
}

/** محاولة PUT واحدة، تنقطع إن توقف التقدم طويلًا (اتصال هاتف معلق لا يُعلن فشله) */
function putOnce(file: File, put: Extract<InitResponse, { method: "PUT" }>, attempt: number, onProgress: (pct: number) => void): Promise<PutOutcome> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let watchdog: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => xhr.abort(), UPLOAD_RETRY.stallMs);
    };
    xhr.open(put.method, put.url);
    for (const [k, v] of Object.entries(put.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      arm();
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      clearTimeout(watchdog);
      resolve(classifyPutResponse(xhr.status, xhr.responseText, attempt));
    };
    xhr.onerror = xhr.onabort = () => {
      clearTimeout(watchdog);
      resolve(networkFailure());
    };
    arm();
    xhr.send(file);
  });
}

/** طلب JSON إلى الخادم، يُعاد عند انقطاع الشبكة أو عطل البوابة فقط. أخطاء التحقق تعود كما هي */
async function postJson<T>(url: string, body: unknown, tries: number, onRetry?: (attempt: number, of: number) => void): Promise<{ res: Response; data: T } | null> {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!isTransientServerStatus(res.status) || attempt === tries) return { res, data: (await res.json().catch(() => ({}))) as T };
    } catch {
      if (attempt === tries) return null;
    }
    onRetry?.(attempt + 1, tries);
    await sleep(retryDelayMs(attempt));
  }
  return null;
}

/** رفع ملف واحد: تجهيز ← رفع مباشر بمؤشر تقدم ← تأكيد وتحقق على الخادم */
export async function uploadFile(
  file: File,
  opts: {
    target: UploadTargetName;
    productId?: string | null;
    teacherId?: string | null;
    lessonId?: string | null;
    extra?: Record<string, unknown>;
  },
  onProgress: UploadProgress,
  resume?: UploadResume,
): Promise<UploadResult> {
  const lower = file.name.toLowerCase();
  const mime = file.type || (lower.endsWith(".pdf") ? "application/pdf" : lower.endsWith(".mp4") ? "video/mp4" : "");
  const ids = {
    productId: opts.productId ?? null,
    teacherId: opts.teacherId ?? null,
    lessonId: opts.lessonId ?? null,
  };
  let confirm = resume?.confirm;
  if (!confirm) {
    // تجهيز الدرس قد يُنشئ سجلًا عند مزود الفيديو، فلا يُعاد تلقائيًا
    const initTries = opts.target === "lesson" ? 1 : 3;
    const started = await postJson<InitResponse>(
      "/api/admin/uploads/init",
      { target: opts.target, ...ids, fileName: file.name, size: file.size, mime, ...(opts.extra ?? {}), ...(resume?.videoId ? { resumeVideoId: resume.videoId } : {}) },
      initTries,
      (attempt, of) => onProgress(0, "retrying", { attempt, of }),
    );
    if (!started) return { ok: false, error: "تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.", canRetry: true, resume };
    if (!started.res.ok) return { ok: false, error: started.data.error ?? "تعذر تجهيز الرفع", canRetry: isTransientServerStatus(started.res.status), resume };
    const init = started.data;

    let lastPct = 0;
    const putOk =
      init.method === "TUS"
        ? await runTusUpload(file, init, (pct) => onProgress(pct, "uploading"))
        : await putWithRetry(
            (attempt) => {
              onProgress(attempt === 1 ? 0 : lastPct, "uploading");
              return putOnce(file, init, attempt, (pct) => {
                lastPct = pct;
                onProgress(pct, "uploading");
              });
            },
            {
              sleep,
              isOffline: () => navigator.onLine === false,
              waitForOnline,
              onNotice: (n: RetryNotice) => (n.reason === "offline" ? onProgress(lastPct, "offline") : onProgress(lastPct, "retrying", { attempt: n.attempt, of: n.of })),
            },
          );
    if (!putOk.ok) {
      if (init.method === "TUS") return { ok: false, error: putOk.error, canRetry: true, resume: { videoId: init.videoId } };
      return { ok: false, error: putOk.error ?? "فشل رفع الملف", canRetry: (putOk as { canRetry?: boolean }).canRetry === true };
    }
    confirm = { key: init.key, method: init.method };
  }

  onProgress(100, "processing");
  const finished = await postJson<{ ok?: boolean; message?: string; error?: string }>(
    "/api/admin/uploads/complete",
    { target: opts.target, key: confirm.key, ...ids, originalName: file.name, size: confirm.method === "PUT" ? file.size : undefined, ...opts.extra },
    3,
    (attempt, of) => onProgress(100, "retrying", { attempt, of }),
  );
  // الملف وصل التخزين: إعادة المحاولة تؤكده نفسه ولا ترفع نسخة ثانية بمفتاح جديد
  if (!finished) return { ok: false, error: "وصل الملف لكن تعذر تأكيده. تحقق من الشبكة ثم أعد المحاولة.", canRetry: true, resume: { confirm } };
  if (!finished.res.ok || !finished.data.ok) {
    const status = finished.res.status;
    const error = finished.data.error ?? "تعذر التحقق من الملف";
    if (status >= 500) return { ok: false, error, canRetry: true, resume: { confirm } };
    // 409: قال التخزين إن الملف لم يصل، فيلزم رفعه من جديد
    return { ok: false, error, canRetry: status === 409 };
  }
  return { ok: true, message: finished.data.message ?? "تم الرفع" };
}

type Item = {
  name: string;
  size: number;
  pct: number;
  phase: "queued" | "uploading" | "processing" | "retrying" | "offline" | "done" | "error";
  message?: string;
  retry?: { attempt: number; of: number };
  /** الملف نفسه محفوظ هنا لتكون إعادة المحاولة بضغطة واحدة */
  file?: File;
  resume?: UploadResume;
};

export function fmtSize(n: number) {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} م.ب`;
  return `${Math.max(1, Math.round(n / 1024))} ك.ب`;
}

export function FileUploader({
  target,
  productId,
  teacherId,
  lessonId,
  accept,
  multiple,
  label,
  hint,
  compact,
}: {
  target: UploadTargetName;
  productId?: string | null;
  teacherId?: string | null;
  lessonId?: string | null;
  accept: string;
  multiple?: boolean;
  label: string;
  hint?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  async function runItem(idx: number, file: File, resume?: UploadResume): Promise<boolean> {
    const update = (patch: Partial<Item>) => setItems((prev) => prev.map((it, j) => (j === idx ? { ...it, ...patch } : it)));
    update({ phase: "uploading", pct: 0, message: undefined, file: undefined, resume: undefined });
    const res = await uploadFile(file, { target, productId, teacherId, lessonId }, (pct, phase, retry) => update({ pct, phase, retry }), resume);
    if (res.ok) update({ phase: "done", pct: 100, message: res.message });
    else update({ phase: "error", message: res.error, file: res.canRetry ? file : undefined, resume: res.canRetry ? res.resume : undefined });
    return res.ok;
  }

  async function retryItem(idx: number, file: File, resume?: UploadResume) {
    if (busy) return;
    setBusy(true);
    const ok = await runItem(idx, file, resume);
    setBusy(false);
    if (ok) router.refresh();
  }

  async function handle(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length || busy) return;
    setBusy(true);
    const start = items.length;
    setItems((prev) => [
      ...prev,
      ...list.map((f) => ({
        name: f.name,
        size: f.size,
        pct: 0,
        phase: "queued" as const,
      })),
    ]);
    let anyOk = false;
    for (let i = 0; i < list.length; i++) {
      if (await runItem(start + i, list[i])) anyOk = true;
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (anyOk) router.refresh();
  }

  // ملف اختير قبل أن ترتبط الصفحة لا يصله حدث change، مرة واحدة عند الربط
  useEffect(() => {
    const picked = takePickedFiles(inputRef.current);
    if (picked.length) void handle(picked);
  }, []);

  const isImage = accept.startsWith("image/");
  return (
    <div className="@container">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handle(e.dataTransfer.files);
        }}
        className={cn(
          "group relative isolate flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-[1.4rem] border-2 border-dashed px-4 transition-[border-color,background-color,transform] duration-150",
          "has-[input:focus-visible]:outline-[3px] has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-brand-600 has-[input:focus-visible]:outline-solid",
          compact ? "min-h-20 py-3" : "flex-col justify-center py-8 text-center sm:py-10",
          drag ? "scale-[1.01] border-brand-500 bg-brand-50 motion-reduce:scale-100" : "border-brand-200 bg-[linear-gradient(160deg,#fff,var(--color-brand-50))] hover:border-brand-400",
          busy && "pointer-events-none opacity-70",
        )}
      >
        {compact ? null : (
          <span
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(color-mix(in_oklab,var(--brand)_16%,transparent)_1.2px,transparent_1.6px)] bg-[length:20px_20px] [mask-image:radial-gradient(60%_80%_at_50%_40%,#000,transparent)]"
            aria-hidden
          />
        )}
        <span
          className={cn(
            "grid shrink-0 place-items-center bg-linear-to-br from-brand-400 to-brand-600 text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.14),0_10px_18px_-10px_var(--brand-edge)] transition-transform group-hover:-translate-y-0.5 motion-reduce:transform-none",
            compact ? "size-11 rounded-[0.95rem] [&_svg]:size-5" : "size-16 rounded-[1.3rem] [&_svg]:size-7",
          )}
          aria-hidden
        >
          {busy ? <LoaderCircle className="animate-spin" /> : isImage ? <ImageUp /> : <Upload />}
        </span>
        <span className={cn("flex min-w-0 flex-col gap-0.5", compact ? "flex-1" : "items-center")}>
          <span className={cn("font-display font-extrabold text-ink", compact ? "text-[0.95rem]" : "text-[1.1rem]")}>{label}</span>
          {hint ? <span className="text-[0.8rem] leading-6 text-muted">{hint}</span> : null}
        </span>
        <span className={cn("btn btn-3d btn-soft btn-sm pointer-events-none shrink-0", compact ? "hidden @sm:inline-flex" : "mt-2")} aria-hidden>
          اختيار {multiple ? "ملفات" : "ملف"}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          disabled={busy}
          onChange={(e) => e.target.files && void handle(e.target.files)}
          data-testid={`upload-${target}`}
        />
      </label>
      {items.length ? (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {items.map((it, i) => (
            <li
              key={i}
              className={cn(
                "rounded-[1.1rem] border p-3 text-sm",
                it.phase === "done" ? "border-success/15 bg-success-50/60" : it.phase === "error" ? "border-danger/15 bg-danger-50/60" : "border-line bg-surface",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  {it.phase === "done" ? (
                    <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
                  ) : it.phase === "error" ? (
                    <TriangleAlert className="size-5 shrink-0 text-danger" aria-hidden />
                  ) : it.phase === "offline" ? (
                    <WifiOff className="size-5 shrink-0 text-warning" aria-hidden />
                  ) : (
                    <LoaderCircle className="size-5 shrink-0 animate-spin text-brand-600" aria-hidden />
                  )}
                  <span className="truncate font-display font-bold text-ink" dir="auto">
                    {it.name}
                  </span>
                </span>
                <span className="num shrink-0 text-xs text-muted">{fmtSize(it.size)}</span>
              </div>
              {it.phase === "uploading" || it.phase === "processing" || it.phase === "queued" || it.phase === "retrying" || it.phase === "offline" ? (
                <div className="mt-2">
                  <div className="h-2.5 overflow-hidden rounded-full bg-mist" role="progressbar" aria-label={`تقدم رفع ${it.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={it.pct}>
                    <div className="h-full rounded-full bg-linear-to-l from-brand-400 to-brand-600 transition-[width]" style={{ width: `${it.pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {it.phase === "queued" ? (
                      "في الانتظار…"
                    ) : it.phase === "offline" ? (
                      <span className="font-bold text-ink-soft" data-testid="upload-offline">انقطعت الشبكة. سيُستأنف الرفع تلقائيًا عند عودتها، أبقِ الصفحة مفتوحة.</span>
                    ) : it.phase === "retrying" ? (
                      <span className="font-bold text-ink-soft" data-testid="upload-retrying">
                        تعثر الاتصال، جارٍ إعادة المحاولة {it.retry ? `(${ar(it.retry.attempt)} من ${ar(it.retry.of)})` : ""}، أبقِ الصفحة مفتوحة.
                      </span>
                    ) : it.phase === "processing" ? (
                      "جارٍ التحقق من الملف…"
                    ) : (
                      <>
                        جارٍ الرفع <span className="num">{it.pct}%</span>
                      </>
                    )}
                  </p>
                </div>
              ) : it.message ? (
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <p className={cn("text-xs font-bold", it.phase === "error" ? "text-danger" : "text-success")} role={it.phase === "error" ? "alert" : undefined}>
                    {it.message}
                  </p>
                  {it.phase === "error" && it.file ? (
                    <button type="button" className="btn btn-3d btn-soft btn-sm min-h-11" disabled={busy} onClick={() => void retryItem(i, it.file as File, it.resume)} data-testid="upload-retry">
                      <RefreshCw className="size-4" aria-hidden /> إعادة المحاولة
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
