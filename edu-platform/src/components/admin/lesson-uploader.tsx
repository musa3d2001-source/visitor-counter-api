"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileVideo, LoaderCircle, Upload } from "lucide-react";
import { fmtSize, uploadFile, type UploadPhase } from "./file-uploader";
import { ar } from "@/lib/design";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

/**
 * إضافة درس فيديو:
 *  - provider = file  : رفع MP4 إلى التخزين الخاص للمنصة (جاهز فور التحقق)
 *  - provider = bunny : رفع TUS مباشر إلى Bunny Stream ثم انتظار اكتمال المعالجة
 */
export function LessonUploader({ productId, provider = "file", maxLabel = "2 جيجابايت" }: { productId: string; provider?: "file" | "bunny"; maxLabel?: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [phase, setPhase] = useState<UploadPhase | null>(null);
  const [retry, setRetry] = useState<{ attempt: number; of: number } | undefined>();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    const title = String(fd.get("title") ?? "").trim();
    if (!(file instanceof File) || file.size === 0) return setResult({ ok: false, text: "اختر ملف الفيديو" });
    if (title.length < 2) return setResult({ ok: false, text: "عنوان الدرس مطلوب" });
    setResult(null);
    setPct(0);
    const res = await uploadFile(
      file,
      {
        target: "lesson",
        productId,
        extra: {
          title,
          unitTitle: String(fd.get("unitTitle") ?? ""),
          description: String(fd.get("description") ?? ""),
          isFreePreview: fd.get("isFreePreview") === "on",
        },
      },
      (p, ph, r) => {
        setPct(p);
        setPhase(ph);
        setRetry(r);
      },
    );
    setPct(null);
    setPhase(null);
    if (res.ok) {
      setResult({ ok: true, text: res.message });
      formRef.current?.reset();
      setPicked(null);
      router.refresh();
    } else setResult({ ok: false, text: res.error });
  }

  const busy = pct !== null;
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <Field label="عنوان الدرس" htmlFor="l-title" required>
        <Input id="l-title" name="title" maxLength={160} disabled={busy} />
      </Field>
      <Field label="الوحدة (اختياري)" htmlFor="l-unit">
        <Input id="l-unit" name="unitTitle" maxLength={120} disabled={busy} placeholder="الوحدة الأولى" />
      </Field>
      <Field label="وصف مختصر" htmlFor="l-desc" className="sm:col-span-2">
        <Textarea id="l-desc" name="description" rows={2} maxLength={2000} disabled={busy} />
      </Field>
      <Field
        label={provider === "bunny" ? "ملف الفيديو (MP4 / MOV / WEBM حتى 8 جيجابايت)" : `ملف الفيديو (MP4 حتى ${maxLabel})`}
        htmlFor="l-file"
        className="sm:col-span-2"
        required
        hint={provider === "bunny" ? "يُرفع مباشرة إلى Bunny Stream ويُعالَج بجودات متعددة تلقائيًا" : undefined}
      >
        {/* الحقل الأصلي مخفي بصريًا (يبقى للنموذج والاختبارات)، ومنطقة الإفلات بالعربية مثل FileUploader */}
        <input
          ref={fileRef}
          id="l-file"
          name="file"
          type="file"
          accept={provider === "bunny" ? "video/mp4,video/quicktime,video/webm" : "video/mp4"}
          className="peer sr-only"
          disabled={busy}
          aria-describedby="l-file-status"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPicked(f ? { name: f.name, size: f.size } : null);
          }}
          data-testid="upload-lesson"
        />
        <label
          htmlFor="l-file"
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const input = fileRef.current;
            const f = e.dataTransfer.files?.[0];
            if (!input || !f || busy) return;
            const dt = new DataTransfer();
            dt.items.add(f);
            input.files = dt.files;
            setPicked({ name: f.name, size: f.size });
          }}
          className={cn(
            "group flex min-h-20 cursor-pointer flex-wrap items-center gap-3 rounded-[1.4rem] border-2 border-dashed px-3.5 py-3 transition-[border-color,background-color,transform] duration-150",
            "peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 peer-focus-visible:outline-solid",
            "peer-disabled:pointer-events-none peer-disabled:opacity-70",
            drag
              ? "scale-[1.01] border-brand-500 bg-brand-50 motion-reduce:scale-100"
              : picked
                ? "border-brand-400 bg-brand-50/70"
                : "border-brand-200 bg-[linear-gradient(160deg,#fff,var(--color-brand-50))] hover:border-brand-400",
          )}
        >
          <span
            className="grid size-11 shrink-0 place-items-center rounded-[0.95rem] bg-linear-to-br from-brand-400 to-brand-600 text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.14),0_10px_18px_-10px_var(--brand-edge)] transition-transform group-hover:-translate-y-0.5 motion-reduce:transform-none [&_svg]:size-5"
            aria-hidden
          >
            {picked ? <FileVideo /> : <Upload />}
          </span>
          <span className="flex min-w-[9rem] flex-1 flex-col gap-0.5" aria-hidden>
            <span className="font-display text-[0.95rem] font-extrabold text-ink">{picked ? "الملف المختار" : "اسحب الفيديو هنا أو اضغط للاختيار"}</span>
            <span className="flex min-w-0 items-center gap-2 text-[0.8rem] leading-6 text-muted">
              <span className="truncate" dir="auto">
                {picked ? picked.name : "لم يُختر ملف بعد"}
              </span>
              {picked ? <span className="num shrink-0">{fmtSize(picked.size)}</span> : null}
            </span>
          </span>
          <span className="btn btn-3d btn-soft btn-sm pointer-events-none shrink-0 max-[380px]:w-full" aria-hidden>
            {picked ? "تغيير الملف" : "اختر ملف الفيديو"}
          </span>
        </label>
        <span id="l-file-status" className="sr-only" aria-live="polite">
          {picked ? `الملف المختار: ${picked.name}` : "لم يُختر ملف بعد"}
        </span>
      </Field>
      <div className="flex items-end">
        <Checkbox
          name="isFreePreview"
          label="درس مجاني للمعاينة"
          disabled={busy}
          className="min-h-14 w-full rounded-[0.9rem] border-2 border-[#FFE08A] bg-[#FFFBEA] px-4 font-display font-bold text-[#6E4700]"
        />
      </div>
      {busy ? (
        <div className="sm:col-span-2">
          <div className="h-3 overflow-hidden rounded-full bg-mist" role="progressbar" aria-label="تقدم رفع الفيديو" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-linear-to-l from-brand-400 to-brand-600 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {phase === "offline" ? (
              "انقطعت الشبكة. سيُستأنف الرفع تلقائيًا عند عودتها، أبقِ الصفحة مفتوحة."
            ) : phase === "retrying" ? (
              <>تعثر الاتصال، جارٍ إعادة المحاولة {retry ? `(${ar(retry.attempt)} من ${ar(retry.of)})` : ""}، أبقِ الصفحة مفتوحة.</>
            ) : phase === "processing" ? (
              "جارٍ التحقق من الملف…"
            ) : (
              <>
                جارٍ الرفع <span className="num">{pct}%</span>، لا تغلق الصفحة
              </>
            )}
          </p>
        </div>
      ) : null}
      {result ? (
        <Alert tone={result.ok ? "success" : "danger"} className="sm:col-span-2">
          {result.text}
        </Alert>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Upload aria-hidden />} رفع وإضافة الدرس
        </Button>
      </div>
    </form>
  );
}
