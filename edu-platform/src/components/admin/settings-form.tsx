"use client";

import { usePreservingAction } from "./use-preserving-action";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

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
  footer_note: string;
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <legend className="sr-only">{title}</legend>
      <h2 className="mb-4 text-lg font-bold" aria-hidden>
        {title}
      </h2>
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
      <Card title="الهوية والنصوص">
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

      <Card title="الألوان">
        <div className="grid gap-6 sm:grid-cols-2">
          {[
            { id: "primary_color", label: "اللون الأساسي", value: primary, set: setPrimary },
            { id: "accent_color", label: "اللون المساعد", value: accent, set: setAccent },
          ].map((c) => (
            <Field key={c.id} label={c.label} htmlFor={c.id} error={fe[c.id]}>
              <div className="flex items-center gap-3">
                <input type="color" id={c.id} value={c.value} onChange={(e) => c.set(e.target.value)} className="h-11 w-14 cursor-pointer rounded-xl border border-line-strong bg-surface p-1" />
                <Input name={c.id} value={c.value} onChange={(e) => c.set(e.target.value)} dir="ltr" className="num w-32 text-start" pattern="#[0-9a-fA-F]{6}" aria-label={`${c.label} (HEX)`} />
              </div>
            </Field>
          ))}
        </div>
        <div className="mt-5 rounded-2xl border border-line p-4" style={{ "--brand": primary, "--accent": accent } as React.CSSProperties} aria-label="معاينة الألوان">
          <p className="mb-3 text-xs font-semibold text-muted">معاينة مباشرة</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white">زر أساسي</span>
            <span className="inline-flex h-10 items-center rounded-xl bg-accent-600 px-4 text-sm font-semibold text-ink">زر مساعد</span>
            <span className="inline-flex h-10 items-center rounded-xl bg-brand-50 px-4 text-sm font-semibold text-brand-700">زر ثانوي</span>
            <span className="rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-800">خصم 25%</span>
            <span className="flex gap-1">
              {["bg-brand-50", "bg-brand-100", "bg-brand-300", "bg-brand-600", "bg-brand-800"].map((c) => (
                <span key={c} className={`size-6 rounded-md ${c}`} />
              ))}
            </span>
          </div>
        </div>
      </Card>

      <Card title="التواصل">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="رقم واتساب (بالصيغة الدولية)" htmlFor="whatsapp_number" error={fe.whatsapp_number} hint="مثال: 96550000000 — فارغ لإخفاء زر واتساب">
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

      <Card title="الدراسة والمحتوى">
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

      <Card title="الأسئلة الشائعة">
        <input type="hidden" name="faq" value={JSON.stringify(faq.filter((f) => f.q.trim() || f.a.trim()))} />
        <ol className="space-y-3">
          {faq.map((f, i) => (
            <li key={i} className="rounded-xl border border-line p-3">
              <div className="flex items-start gap-2">
                <span className="num mt-2 text-sm font-bold text-muted">{i + 1}</span>
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
      <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <SubmitButton pendingText="جارٍ الحفظ…">حفظ الإعدادات</SubmitButton>
      </div>
    </form>
  );
}
