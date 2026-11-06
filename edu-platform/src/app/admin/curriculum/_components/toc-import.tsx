"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import type * as React from "react";
import { CircleCheck, FileSpreadsheet, FlaskConical, LoaderCircle, TriangleAlert, Upload, X } from "lucide-react";
import { CSV_MAX_BYTES, CSV_MAX_ROWS } from "@/server/questions/limits";
import type { TocPreview } from "@/server/questions/curriculum";
import { StatusPill } from "@/components/admin/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/form";
import { ar } from "@/lib/design";
import { cn } from "@/lib/utils";
import { applyTocAction, previewTocAction } from "../actions";
import type { TocActionState, TocSummaryLabels } from "./toc-types";
import { pagesLabel } from "./words";

/**
 * استيراد فهرس الكتاب: لصق نص CSV أو اختيار ملف، ثم «تشغيل تجريبي» يعرض ما سيحدث لكل صف،
 * ثم «تطبيق الاستيراد». الإرسال يدوي (onSubmit) حتى لا يُفرَّغ الملف أو النص الملصق بعد التشغيل التجريبي.
 */

const TOO_BIG = "حجم الملف أكبر من الحد المسموح (١ م.ب). قسّمه إلى ملفين.";
const EMPTY = "الصق محتوى الفهرس أو اختر ملف CSV";

const ACTION_LABEL = { create: "جديد", update: "تحديث", same: "بلا تغيير" } as const;
const ACTION_TONE = { create: "success", update: "warning", same: "neutral" } as const;

function byteLength(text: string) {
  return new TextEncoder().encode(text).byteLength;
}

export function TocImport({ textbookId }: { textbookId: string }) {
  const [state, dispatch, pending] = useActionState<TocActionState, FormData>(
    async (prev, fd) => (fd.get("mode") === "apply" ? applyTocAction(prev, fd) : previewTocAction(prev, fd)),
    null,
  );
  const [running, setRunning] = useState<"preview" | "apply" | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) {
      setFileName(null);
      return;
    }
    if (f.size > CSV_MAX_BYTES) {
      e.target.value = "";
      setFileName(null);
      setClientError(TOO_BIG);
      return;
    }
    setClientError(null);
    setFileName(f.name);
  }

  function clearFile() {
    if (fileRef.current) fileRef.current.value = "";
    setFileName(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const mode = submitter instanceof HTMLButtonElement && submitter.value === "apply" ? "apply" : "preview";
    const fd = new FormData(e.currentTarget);
    fd.set("mode", mode);
    const file = fileRef.current?.files?.[0];
    if (file) {
      // الملف يتقدم على النص الملصق؛ لا نرسل الاثنين معًا
      if (file.size > CSV_MAX_BYTES) return setClientError(TOO_BIG);
      fd.delete("csv");
    } else {
      fd.delete("file");
      const text = String(fd.get("csv") ?? "");
      if (!text.trim()) return setClientError(EMPTY);
      if (byteLength(text) > CSV_MAX_BYTES) return setClientError(TOO_BIG);
    }
    setClientError(null);
    setRunning(mode);
    startTransition(() => dispatch(fd));
  }

  const preview = state?.preview;
  const error = clientError ?? state?.error ?? null;

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4" aria-describedby="toc-help">
        <input type="hidden" name="textbookId" value={textbookId} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0">
            <Label htmlFor="toc-csv">الصق محتوى الملف هنا</Label>
            <Textarea
              id="toc-csv"
              name="csv"
              dir="ltr"
              rows={8}
              spellCheck={false}
              placeholder={"unit_number,unit_title,lesson_number,lesson_title,page_start,page_end\n1,الأعداد,1,القيمة المنزلية,8,13"}
              className="min-h-44 font-mono text-[0.85rem] leading-7"
              aria-invalid={state?.fieldErrors?.csv ? true : undefined}
            />
          </div>
          <div className="min-w-0">
            <span className="mb-2 block font-display text-[0.92rem] font-bold text-ink">أو اختر ملف CSV</span>
            <label
              htmlFor="toc-file"
              className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-[1.25rem] border-2 border-dashed border-brand-200 bg-[linear-gradient(160deg,var(--color-brand-50),#fff_75%)] p-4 text-center transition-colors hover:border-brand-400 has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600 has-[:focus-visible]:outline-solid"
            >
              <span className="grid size-12 place-items-center rounded-2xl bg-linear-to-br from-brand-400 to-brand-600 text-white shadow-[0_4px_0_var(--brand-edge)]" aria-hidden>
                <Upload className="size-6" />
              </span>
              <span className="font-display text-[0.95rem] font-extrabold text-ink">{fileName ? "تغيير الملف" : "اختيار ملف"}</span>
              <span className="text-[0.8rem] leading-6 text-muted">UTF-8، حتى ١ م.ب و{ar(CSV_MAX_ROWS)} صف</span>
              <input id="toc-file" ref={fileRef} type="file" name="file" accept=".csv,text/csv" onChange={onFileChange} className="sr-only" />
            </label>
            {fileName ? (
              <div className="mt-2 flex min-w-0 items-center gap-2 rounded-xl bg-success-50 py-1 ps-3 pe-1 text-[0.85rem] font-bold text-success">
                <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {fileName}
                </span>
                <Button type="button" variant="ghost" size="icon" onClick={clearFile} aria-label="إزالة الملف" title="إزالة الملف">
                  <X aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        {fileName ? <p className="text-[0.85rem] text-ink-soft">سيُستخدم الملف المختار بدل النص الملصق.</p> : null}

        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="submit" name="mode" value="preview" variant="soft" disabled={pending} aria-busy={pending && running === "preview"}>
            {pending && running === "preview" ? <LoaderCircle className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />}
            تشغيل تجريبي
          </Button>
          <Button type="submit" name="mode" value="apply" variant="primary" disabled={pending} aria-busy={pending && running === "apply"}>
            {pending && running === "apply" ? <LoaderCircle className="animate-spin" aria-hidden /> : <CircleCheck aria-hidden />}
            تطبيق الاستيراد
          </Button>
          <span className="text-[0.82rem] leading-6 text-muted">جرّب أولًا، ثم طبّق. لا يُحفظ شيء إذا كان في الملف أي خطأ.</span>
        </div>
      </form>

      <div aria-live="polite" className="space-y-4">
        {error ? (
          <Alert tone="danger" title={state?.mode === "apply" && !clientError ? "لم يُطبَّق الاستيراد" : undefined}>
            {error}
          </Alert>
        ) : null}
        {!error && state?.ok && state.message ? (
          <Alert tone={state.mode === "apply" ? "success" : preview?.summary.errors ? "warning" : "info"}>{state.message}</Alert>
        ) : null}
        {preview && preview.rows.length && !clientError ? <PreviewResult preview={preview} labels={state?.labels} /> : null}
      </div>
    </div>
  );
}

function PreviewResult({ preview, labels }: { preview: TocPreview; labels?: TocSummaryLabels }) {
  const [onlyErrors, setOnlyErrors] = useState(false);
  const s = preview.summary;
  const rows = onlyErrors ? preview.rows.filter((r) => r.errors.length) : preview.rows;
  return (
    <section aria-labelledby="toc-preview-h" className="rounded-[1.5rem] border border-line bg-canvas/60 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 id="toc-preview-h" className="font-display text-[1.1rem] font-black text-ink">
          نتيجة التشغيل التجريبي
        </h3>
        {s.errors ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="عرض الصفوف">
            <Button type="button" size="sm" variant={onlyErrors ? "outline" : "primary"} aria-pressed={!onlyErrors} onClick={() => setOnlyErrors(false)}>
              كل الصفوف
            </Button>
            <Button type="button" size="sm" variant={onlyErrors ? "primary" : "outline"} aria-pressed={onlyErrors} onClick={() => setOnlyErrors(true)}>
              الأخطاء فقط
            </Button>
          </div>
        ) : null}
      </div>

      <ul className="mb-4 flex flex-wrap gap-2" aria-label="ملخص التشغيل التجريبي">
        <li className="chip chip-white min-h-9 px-3">{labels?.units}</li>
        <li className="chip min-h-9 bg-success-50 px-3 text-success">جديد: {labels?.create}</li>
        <li className="chip min-h-9 bg-warning-50 px-3 text-warning">تحديث: {labels?.update}</li>
        <li className="chip min-h-9 bg-sand px-3 text-ink-soft">بلا تغيير: {labels?.same}</li>
        <li className={cn("chip min-h-9 px-3", s.errors ? "bg-danger-50 text-danger" : "bg-success-50 text-success")}>
          {s.errors ? (
            <>
              <TriangleAlert aria-hidden /> أخطاء في {labels?.errors}
            </>
          ) : (
            <>
              <CircleCheck aria-hidden /> لا أخطاء
            </>
          )}
        </li>
      </ul>

      {/* رأس الأعمدة على الشاشات العريضة؛ على الجوال كل صف بطاقة بتسمياته */}
      <div
        className="hidden rounded-xl bg-mist/70 px-3 py-2.5 font-display text-[0.8rem] font-extrabold text-ink-soft md:grid md:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_8rem_7.5rem] md:gap-3"
        aria-hidden
      >
        <span>السطر</span>
        <span>الوحدة</span>
        <span>الدرس</span>
        <span>الصفحات</span>
        <span>الإجراء</span>
      </div>
      <ol className="mt-2 space-y-2">
        {rows.map((r) => {
          const bad = r.errors.length > 0;
          return (
            <li
              key={r.line}
              className={cn(
                "grid gap-x-3 gap-y-1.5 rounded-[1.1rem] border bg-surface p-3 text-[0.9rem] grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_8rem_7.5rem] md:items-center",
                bad ? "border-danger/30 bg-danger-50/40" : "border-line",
              )}
            >
              <span className="font-display font-extrabold text-ink-soft max-md:col-span-2">
                <span className="md:sr-only">السطر </span>
                {ar(r.line)}
              </span>
              <span className="min-w-0 max-md:col-span-2">
                <span className="font-display text-[0.78rem] font-bold text-muted md:sr-only">الوحدة: </span>
                <span className="font-bold text-ink">{r.unitNumber ? `${ar(r.unitNumber)}. ` : ""}</span>
                <span className="break-words text-ink" dir="auto">
                  {r.unitTitle || "بلا عنوان"}
                </span>
              </span>
              <span className="min-w-0 max-md:col-span-2">
                <span className="font-display text-[0.78rem] font-bold text-muted md:sr-only">الدرس: </span>
                <span className="font-bold text-ink">{r.lessonNumber ? `${ar(r.lessonNumber)}. ` : ""}</span>
                <span className="break-words text-ink" dir="auto">
                  {r.lessonTitle || "بلا عنوان"}
                </span>
              </span>
              <span className="text-ink-soft">
                <span className="sr-only">الصفحات: </span>
                {r.pageStart && r.pageEnd ? pagesLabel(r.pageStart, r.pageEnd) : "غير صالحة"}
              </span>
              <span className="justify-self-end md:justify-self-start">
                <span className="sr-only">الإجراء: </span>
                {bad ? <StatusPill tone="danger">لن يُستورد</StatusPill> : <StatusPill tone={ACTION_TONE[r.action]}>{ACTION_LABEL[r.action]}</StatusPill>}
              </span>
              {bad ? (
                <ul className="col-span-full space-y-1 border-t border-dashed border-danger/25 pt-2 text-[0.85rem] leading-6 font-bold text-danger">
                  {r.errors.map((e, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <TriangleAlert className="mt-1 size-3.5 shrink-0" aria-hidden />
                      {e}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
