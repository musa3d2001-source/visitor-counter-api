"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Upload } from "lucide-react";
import { uploadFile } from "./file-uploader";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

/**
 * إضافة درس فيديو:
 *  - provider = file  : رفع MP4 إلى التخزين الخاص للمنصة (جاهز فور التحقق)
 *  - provider = bunny : رفع TUS مباشر إلى Bunny Stream ثم انتظار اكتمال المعالجة
 */
export function LessonUploader({ productId, provider = "file" }: { productId: string; provider?: "file" | "bunny" }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [phase, setPhase] = useState<"uploading" | "processing" | null>(null);
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
      (p, ph) => {
        setPct(p);
        setPhase(ph);
      },
    );
    setPct(null);
    setPhase(null);
    if (res.ok) {
      setResult({ ok: true, text: res.message });
      formRef.current?.reset();
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
        label={provider === "bunny" ? "ملف الفيديو (MP4 / MOV / WEBM حتى 8 جيجابايت)" : "ملف الفيديو (MP4 حتى 2 جيجابايت)"}
        htmlFor="l-file"
        required
        hint={provider === "bunny" ? "يُرفع مباشرة إلى Bunny Stream ويُعالَج بجودات متعددة تلقائيًا" : undefined}
      >
        <Input
          id="l-file"
          name="file"
          type="file"
          accept={provider === "bunny" ? "video/mp4,video/quicktime,video/webm" : "video/mp4"}
          className="h-auto min-h-14 cursor-pointer border-2 border-dashed border-brand-200 bg-white py-2 ps-2 text-sm text-ink-soft file:me-3 file:min-h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-brand-50 file:px-4 file:font-display file:font-extrabold file:text-brand-800 hover:file:bg-brand-100"
          disabled={busy}
          data-testid="upload-lesson"
        />
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
            {phase === "processing" ? (
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
