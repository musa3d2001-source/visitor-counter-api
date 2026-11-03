"use client";

import { usePreservingAction } from "./use-preserving-action";
import { useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, CircleHelp, Palette, Percent, Phone, Plus, Sparkles, Trash2, Type } from "lucide-react";
import { ToneIcon } from "./icon-tile";
import type { AdminTone } from "./tones";
import type { ActionState } from "@/lib/action-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ar } from "@/lib/design";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export type SettingsValues = {
  site_name: string;
  tagline: string;
  hero_title: string;
  hero_subtitle: string;
  primary_color: string;
  accent_color: string;
  whatsapp_number: string;
  contact_email: string;
  contact_phone: string;
  instagram_url: string;
  academic_year: string;
  videos_enabled: boolean;
  watermark_enabled: boolean;
  faq: { q: string; a: string }[];
  /** نسبة الرسوم كنص (مثال "2.5") والرسوم الثابتة بالدينار (مثال "0.100") */
  fee_percent: string;
  fee_fixed: string;
  footer_note: string;
};

const PREVIEW_VARS = (primary: string, accent: string) =>
  ({
    "--brand": primary,
    "--accent": accent,
    // الدرجات المشتقة تُحسب على :root؛ نعيد تعريفها هنا حتى تتبع المعاينة اللونين المختارين
    "--brand-hi": "color-mix(in oklab, var(--brand) 62%, #4fe3d2)",
    "--brand-glow": "color-mix(in oklab, var(--brand) 22%, #c4fff0)",
    "--brand-edge": "color-mix(in oklab, var(--brand) 72%, black)",
    "--brand-deep": "color-mix(in oklab, var(--brand) 58%, black)",
    "--accent-hi": "color-mix(in oklab, var(--accent) 70%, #fff3c4)",
    "--accent-edge": "color-mix(in oklab, var(--accent) 80%, #a35f00)",
    "--accent-text": "color-mix(in oklab, var(--accent) 38%, #4a2c00)",
    "--accent-ink": "color-mix(in oklab, var(--accent) 14%, #231600)",
  }) as React.CSSProperties;

function Card({ title, icon, tone = "teal", description, children }: { title: string; icon: React.ReactNode; tone?: AdminTone; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 rounded-[1.75rem] border border-[rgb(23_32_38/0.06)] bg-surface p-4 shadow-card sm:p-6">
      <legend className="sr-only">{title}</legend>
      <div className="mb-5 flex items-center gap-3" aria-hidden>
        <ToneIcon tone={tone} size="sm">
          {icon}
        </ToneIcon>
        <div className="min-w-0">
          <h2 className="font-display text-[1.2rem] leading-snug font-black text-ink sm:text-[1.3rem]">{title}</h2>
          {description ? <p className="mt-0.5 text-[0.85rem] leading-6 text-muted">{description}</p> : null}
        </div>
      </div>
      {children}
    </fieldset>
  );
}

export function SettingsForm({ action, values }: { action: ServerAction; values: SettingsValues }) {
  const { state, formAction, formRef } = usePreservingAction(action);
  const [primary, setPrimary] = useState(values.primary_color);
  const [accent, setAccent] = useState(values.accent_color);
  const [faq, setFaq] = useState(values.faq);
  const fe = state?.fieldErrors ?? {};

  const move = (i: number, d: -1 | 1) =>
    setFaq((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      <Card title="الهوية والنصوص" icon={<Type />} tone="teal" description="اسم المنصة وعبارات الصفحة الرئيسية والتذييل.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المنصة" htmlFor="site_name" error={fe.site_name} required>
            <Input id="site_name" name="site_name" defaultValue={values.site_name} maxLength={60} />
          </Field>
          <Field label="الشعار النصي (Tagline)" htmlFor="tagline" error={fe.tagline}>
            <Input id="tagline" name="tagline" defaultValue={values.tagline} maxLength={140} />
          </Field>
          <Field label="عنوان الصفحة الرئيسية" htmlFor="hero_title" error={fe.hero_title} required className="sm:col-span-2">
            <Input id="hero_title" name="hero_title" defaultValue={values.hero_title} maxLength={120} />
          </Field>
          <Field label="النص التعريفي أسفل العنوان" htmlFor="hero_subtitle" error={fe.hero_subtitle} className="sm:col-span-2">
            <Textarea id="hero_subtitle" name="hero_subtitle" defaultValue={values.hero_subtitle} maxLength={300} rows={2} />
          </Field>
          <Field label="نص التذييل" htmlFor="footer_note" error={fe.footer_note} className="sm:col-span-2">
            <Input id="footer_note" name="footer_note" defaultValue={values.footer_note} maxLength={300} />
          </Field>
        </div>
      </Card>

      <Card title="الألوان" icon={<Palette />} tone="pink" description="لون الهوية الأساسي واللون المساعد (الذهبي)، تُشتق منهما بقية الدرجات تلقائيًا.">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { id: "primary_color", label: "اللون الأساسي", value: primary, set: setPrimary },
            { id: "accent_color", label: "اللون المساعد", value: accent, set: setAccent },
          ].map((c) => (
            <Field key={c.id} label={c.label} htmlFor={c.id} error={fe[c.id]}>
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-field p-2">
                <input
                  type="color"
                  id={c.id}
                  value={c.value}
                  onChange={(e) => c.set(e.target.value)}
                  className="h-12 w-16 shrink-0 cursor-pointer rounded-xl border-2 border-white bg-surface p-0.5 shadow-[0_3px_0_var(--color-line-strong)]"
                />
                <Input name={c.id} value={c.value} onChange={(e) => c.set(e.target.value)} dir="ltr" className="num min-w-0 flex-1 text-start" pattern="#[0-9a-fA-F]{6}" aria-label={`${c.label} (HEX)`} />
              </div>
            </Field>
          ))}
        </div>
        <div role="group" className="mt-5 overflow-hidden rounded-[1.5rem] border border-line" style={PREVIEW_VARS(primary, accent)} aria-label="معاينة الألوان">
          <div className="on-dark bg-teal-night relative isolate flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <p className="flex items-center gap-2 font-display text-[0.95rem] font-black text-white">
              <Sparkles className="size-4 text-[#FFD25E]" aria-hidden /> معاينة مباشرة
            </p>
            <span className="chip chip-gold">خصم ٢٥٪</span>
          </div>
          <div className="bg-sunny space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="btn btn-3d btn-primary btn-md">زر أساسي</span>
              <span className="btn btn-3d btn-accent btn-md">زر مساعد</span>
              <span className="btn btn-3d btn-soft btn-md">زر ثانوي</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="eyebrow-pill">
                <span className="eyebrow-icon">
                  <Sparkles aria-hidden />
                </span>
                تسمية قسم
              </span>
              <span className="font-display text-[1.1rem] font-black text-ink">
                عنوان <span className="text-hl">مميز</span>
              </span>
              <span className="flex gap-1" aria-hidden>
                {["bg-brand-50", "bg-brand-100", "bg-brand-300", "bg-brand-600", "bg-brand-800", "bg-accent-100", "bg-accent-600"].map((c) => (
                  <span key={c} className={`size-7 rounded-lg shadow-[inset_0_-2px_0_rgb(0_0_0/0.1)] ${c}`} />
                ))}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card title="التواصل" icon={<Phone />} tone="green" description="تظهر في التذييل وزر واتساب.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="رقم واتساب (بالصيغة الدولية)" htmlFor="whatsapp_number" error={fe.whatsapp_number} hint="مثال: 96550000000، فارغ لإخفاء زر واتساب">
            <Input id="whatsapp_number" name="whatsapp_number" defaultValue={values.whatsapp_number} dir="ltr" className="num text-start" inputMode="tel" />
          </Field>
          <Field label="البريد الإلكتروني" htmlFor="contact_email" error={fe.contact_email}>
            <Input id="contact_email" name="contact_email" type="email" defaultValue={values.contact_email} dir="ltr" className="text-start" />
          </Field>
          <Field label="هاتف التواصل" htmlFor="contact_phone" error={fe.contact_phone}>
            <Input id="contact_phone" name="contact_phone" defaultValue={values.contact_phone} dir="ltr" className="num text-start" maxLength={30} />
          </Field>
          <Field label="رابط إنستغرام" htmlFor="instagram_url" error={fe.instagram_url}>
            <Input id="instagram_url" name="instagram_url" type="url" defaultValue={values.instagram_url} dir="ltr" className="text-start" placeholder="https://instagram.com/..." />
          </Field>
        </div>
      </Card>

      <Card title="الدراسة والمحتوى" icon={<BookOpen />} tone="sky">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="العام الدراسي الحالي" htmlFor="academic_year" error={fe.academic_year} hint="يُستخدم افتراضيًا عند إضافة منتجات جديدة">
            <Input id="academic_year" name="academic_year" defaultValue={values.academic_year} dir="ltr" className="num text-start" placeholder="2026-2027" />
          </Field>
          <div className="flex flex-col justify-center gap-3">
            <Checkbox name="watermark_enabled" defaultChecked={values.watermark_enabled} label="ختم علامة مائية بهوية المشتري على ملفات PDF" />
            <Checkbox name="videos_enabled" defaultChecked={values.videos_enabled} label="تفعيل قسم دروس الفيديو للطلاب" />
          </div>
        </div>
      </Card>

      <Card title="الرسوم المعتمدة لحساب أرباح المعلمين" icon={<Percent />} tone="gold">
        <p className="mb-4 text-sm leading-7 text-muted">
          تُخصم من قيمة كل طلب قبل احتساب حصة المعلم (مثل رسوم بوابة الدفع). تُطبق على المبيعات الجديدة فقط ولا تغيّر السجلات السابقة.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نسبة الرسوم من قيمة الطلب (%)" htmlFor="fee_percent" error={fe.fee_percent_bps} hint="مثال: 2.5، الحد الأقصى 20%">
            <Input id="fee_percent" name="fee_percent" defaultValue={values.fee_percent} inputMode="decimal" dir="ltr" className="num text-start" />
          </Field>
          <Field label="رسوم ثابتة لكل طلب (د.ك)" htmlFor="fee_fixed" error={fe.fee_fixed_fils} hint="مثال: 0.100، اتركه 0 إن لم توجد">
            <Input id="fee_fixed" name="fee_fixed" defaultValue={values.fee_fixed} inputMode="decimal" dir="ltr" className="num text-start" />
          </Field>
        </div>
      </Card>

      <Card title="الأسئلة الشائعة" icon={<CircleHelp />} tone="violet" description="تظهر في الصفحة الرئيسية بالترتيب نفسه.">
        <input type="hidden" name="faq" value={JSON.stringify(faq.filter((f) => f.q.trim() || f.a.trim()))} />
        <ol className="space-y-3">
          {faq.map((f, i) => (
            <li key={i} className="rounded-[1.25rem] border border-line bg-canvas/60 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 grid size-8 shrink-0 place-items-center rounded-[0.7rem] bg-linear-to-br from-[#B28CFF] to-[#6A3FE0] font-display text-[0.95rem] font-black text-white" aria-hidden>{ar(i + 1)}</span>
                <div className="grid flex-1 gap-2">
                  <Input value={f.q} onChange={(e) => setFaq((p) => p.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} placeholder="السؤال" aria-label={`السؤال ${i + 1}`} maxLength={200} />
                  <Textarea value={f.a} onChange={(e) => setFaq((p) => p.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} placeholder="الإجابة" aria-label={`الإجابة ${i + 1}`} rows={2} maxLength={1500} />
                </div>
                <div className="flex flex-col gap-1">
                  <Button type="button" size="icon" variant="ghost" onClick={() => move(i, -1)} aria-label="تحريك لأعلى">
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => move(i, 1)} aria-label="تحريك لأسفل">
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setFaq((p) => p.filter((_, j) => j !== i))} aria-label="حذف السؤال">
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setFaq((p) => [...p, { q: "", a: "" }])} disabled={faq.length >= 30}>
          <Plus aria-hidden /> إضافة سؤال
        </Button>
      </Card>

      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <SubmitButton pendingText="جارٍ الحفظ…" size="lg" className="max-sm:w-full">حفظ الإعدادات</SubmitButton>
      </div>
    </form>
  );
}
