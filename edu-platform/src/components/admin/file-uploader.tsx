"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle, TriangleAlert, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export type UploadTargetName = "main" | "preview" | "cover" | "lesson" | "logo";

type InitResponse = { key: string; method: "PUT"; url: string; headers: Record<string, string>; error?: string };

/** رفع ملف واحد: تجهيز ← رفع مباشر بمؤشر تقدم ← تأكيد وتحقق على الخادم */
export async function uploadFile(
  file: File,
  opts: { target: UploadTargetName; productId?: string | null; extra?: Record<string, unknown> },
  onProgress: (pct: number, phase: "uploading" | "processing") => void,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  let init: InitResponse;
  try {
    const res = await fetch("/api/admin/uploads/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: opts.target, productId: opts.productId ?? null, fileName: file.name, size: file.size, mime }),
    });
    init = (await res.json()) as InitResponse;
    if (!res.ok) return { ok: false, error: init.error ?? "تعذر تجهيز الرفع" };
  } catch {
    return { ok: false, error: "تعذر الاتصال بالخادم" };
  }

  const putOk = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method, init.url);
    for (const [k, v] of Object.entries(init.headers)) xhr.setRequestHeader(k, v);
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
      body: JSON.stringify({ target: opts.target, key: init.key, productId: opts.productId ?? null, originalName: file.name, ...opts.extra }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? "تعذر التحقق من الملف" };
    return { ok: true, message: data.message ?? "تم الرفع" };
  } catch {
    return { ok: false, error: "تعذر الاتصال بالخادم أثناء التحقق" };
  }
}

type Item = { name: string; size: number; pct: number; phase: "queued" | "uploading" | "processing" | "done" | "error"; message?: string };

function fmtSize(n: number) {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} م.ب`;
  return `${Math.max(1, Math.round(n / 1024))} ك.ب`;
}

export function FileUploader({
  target,
  productId,
  accept,
  multiple,
  label,
  hint,
  compact,
}: {
  target: UploadTargetName;
  productId?: string | null;
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
    setItems((prev) => [...prev, ...list.map((f) => ({ name: f.name, size: f.size, pct: 0, phase: "queued" as const }))]);
    let anyOk = false;
    for (let i = 0; i < list.length; i++) {
      const idx = start + i;
      const update = (patch: Partial<Item>) => setItems((prev) => prev.map((it, j) => (j === idx ? { ...it, ...patch } : it)));
      update({ phase: "uploading" });
      const res = await uploadFile(list[i], { target, productId }, (pct, phase) => update({ pct, phase }));
      if (res.ok) {
        anyOk = true;
        update({ phase: "done", pct: 100, message: res.message });
      } else update({ phase: "error", message: res.error });
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (anyOk) router.refresh();
  }

  return (
    <div>
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
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 text-center transition-colors",
          compact ? "py-4" : "py-8",
          drag ? "border-brand-500 bg-brand-50" : "border-line-strong bg-canvas/60 hover:border-brand-300 hover:bg-brand-50/50",
          busy && "pointer-events-none opacity-70",
        )}
      >
        <span className="grid size-11 place-items-center rounded-xl bg-surface text-brand-700 shadow-sm">
          {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Upload className="size-5" aria-hidden />}
        </span>
        <span className="text-sm font-bold text-ink">{label}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
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
            <li key={i} className="rounded-xl border border-line bg-surface p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  {it.phase === "done" ? (
                    <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
                  ) : it.phase === "error" ? (
                    <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden />
                  ) : (
                    <LoaderCircle className="size-4 shrink-0 animate-spin text-brand-600" aria-hidden />
                  )}
                  <span className="truncate font-semibold" dir="auto">
                    {it.name}
                  </span>
                </span>
                <span className="num shrink-0 text-xs text-muted">{fmtSize(it.size)}</span>
              </div>
              {it.phase === "uploading" || it.phase === "processing" || it.phase === "queued" ? (
                <div className="mt-2">
                  <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={it.pct}>
                    <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${it.pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {it.phase === "queued" ? "في الانتظار…" : it.phase === "processing" ? "جارٍ التحقق من الملف…" : <>جارٍ الرفع <span className="num">{it.pct}%</span></>}
                  </p>
                </div>
              ) : it.message ? (
                <p className={cn("mt-1 text-xs", it.phase === "error" ? "text-danger" : "text-success")} role={it.phase === "error" ? "alert" : undefined}>
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
