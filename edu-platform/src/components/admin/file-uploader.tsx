"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, ImageUp, LoaderCircle, TriangleAlert, Upload } from "lucide-react";
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

/** رفع TUS مباشر إلى Bunny Stream (قابل للاستئناف عند انقطاع الاتصال) */
async function tusUpload(file: File, init: Extract<InitResponse, { method: "TUS" }>, onProgress: (pct: number) => void): Promise<{ ok: boolean; error?: string }> {
  const { Upload } = await import("tus-js-client");
  return new Promise((resolve) => {
    const upload = new Upload(file, {
      endpoint: init.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: 50 * 1024 * 1024,
      headers: init.headers,
      metadata: {
        ...init.metadata,
        filetype: file.type || init.metadata.filetype || "video/mp4",
      },
      onProgress: (sent, total) => onProgress(total ? Math.round((sent / total) * 100) : 0),
      onError: (err) =>
        resolve({
          ok: false,
          error: `فشل رفع الفيديو: ${String((err as Error)?.message ?? err).slice(0, 120)}`,
        }),
      onSuccess: () => resolve({ ok: true }),
    });
    upload.start();
  });
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
  onProgress: (pct: number, phase: "uploading" | "processing") => void,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const lower = file.name.toLowerCase();
  const mime = file.type || (lower.endsWith(".pdf") ? "application/pdf" : lower.endsWith(".mp4") ? "video/mp4" : "");
  const ids = {
    productId: opts.productId ?? null,
    teacherId: opts.teacherId ?? null,
    lessonId: opts.lessonId ?? null,
  };
  let init: InitResponse;
  try {
    const res = await fetch("/api/admin/uploads/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: opts.target,
        ...ids,
        fileName: file.name,
        size: file.size,
        mime,
        ...(opts.extra ?? {}),
      }),
    });
    init = (await res.json()) as InitResponse;
    if (!res.ok) return { ok: false, error: init.error ?? "تعذر تجهيز الرفع" };
  } catch {
    return { ok: false, error: "تعذر الاتصال بالخادم" };
  }

  const putOk =
    init.method === "TUS"
      ? await tusUpload(file, init, (pct) => onProgress(pct, "uploading"))
      : await new Promise<{ ok: boolean; error?: string }>((resolve) => {
          const xhr = new XMLHttpRequest();
          const put = init as Extract<InitResponse, { method: "PUT" }>;
          xhr.open(put.method, put.url);
          for (const [k, v] of Object.entries(put.headers)) xhr.setRequestHeader(k, v);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100), "uploading");
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true });
            else {
              let msg = "فشل رفع الملف";
              try {
                msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
              } catch {
                /* ignore */
              }
              resolve({ ok: false, error: `${msg} (${xhr.status})` });
            }
          };
          xhr.onerror = () => resolve({ ok: false, error: "انقطع الاتصال أثناء الرفع" });
          xhr.send(file);
        });
  if (!putOk.ok) return { ok: false, error: putOk.error ?? "فشل رفع الملف" };

  onProgress(100, "processing");
  try {
    const res = await fetch("/api/admin/uploads/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: opts.target,
        key: init.key,
        ...ids,
        originalName: file.name,
        ...opts.extra,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      message?: string;
      error?: string;
    };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? "تعذر التحقق من الملف" };
    return { ok: true, message: data.message ?? "تم الرفع" };
  } catch {
    return { ok: false, error: "تعذر الاتصال بالخادم أثناء التحقق" };
  }
}

type Item = {
  name: string;
  size: number;
  pct: number;
  phase: "queued" | "uploading" | "processing" | "done" | "error";
  message?: string;
};

function fmtSize(n: number) {
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
      const idx = start + i;
      const update = (patch: Partial<Item>) => setItems((prev) => prev.map((it, j) => (j === idx ? { ...it, ...patch } : it)));
      update({ phase: "uploading" });
      const res = await uploadFile(list[i], { target, productId, teacherId, lessonId }, (pct, phase) => update({ pct, phase }));
      if (res.ok) {
        anyOk = true;
        update({ phase: "done", pct: 100, message: res.message });
      } else update({ phase: "error", message: res.error });
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (anyOk) router.refresh();
  }

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
                  ) : (
                    <LoaderCircle className="size-5 shrink-0 animate-spin text-brand-600" aria-hidden />
                  )}
                  <span className="truncate font-display font-bold text-ink" dir="auto">
                    {it.name}
                  </span>
                </span>
                <span className="num shrink-0 text-xs text-muted">{fmtSize(it.size)}</span>
              </div>
              {it.phase === "uploading" || it.phase === "processing" || it.phase === "queued" ? (
                <div className="mt-2">
                  <div className="h-2.5 overflow-hidden rounded-full bg-mist" role="progressbar" aria-label={`تقدم رفع ${it.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={it.pct}>
                    <div className="h-full rounded-full bg-linear-to-l from-brand-400 to-brand-600 transition-[width]" style={{ width: `${it.pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {it.phase === "queued" ? (
                      "في الانتظار…"
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
                <p className={cn("mt-1 text-xs font-bold", it.phase === "error" ? "text-danger" : "text-success")} role={it.phase === "error" ? "alert" : undefined}>
                  {it.message}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
