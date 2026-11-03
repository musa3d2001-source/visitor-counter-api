"use client";

import { usePreservingAction } from "./use-preserving-action";
import { useState } from "react";
import { CalendarRange, Gauge, Percent, StickyNote } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { toneStyle, type AdminTone } from "./tones";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export type CouponDefaults = {
  id?: string;
  code: string;
  kind: "percent" | "fixed";
  value: string;
  minOrder: string;
  maxRedemptions: string;
  maxPerUser: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  note: string;
};

/** مجموعة حقول ملوّنة بعنوان صغير (عرض فقط) */
function Group({ title, icon, tone, className, children }: { title: string; icon: React.ReactNode; tone: AdminTone; className?: string; children: React.ReactNode }) {
  return (
    <div style={toneStyle(tone)} className={cn("rounded-[1.4rem] border border-[color-mix(in_oklab,var(--b)_14%,white)] bg-[linear-gradient(165deg,#fff,var(--soft))] p-4", className)}>
      <p className="mb-3 flex items-center gap-2 font-display text-[0.95rem] font-extrabold text-[var(--tink)]">
        <span className="grid size-7 place-items-center rounded-[0.6rem] bg-linear-to-br from-[var(--a)] to-[var(--b)] text-[var(--icon)] [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
        {title}
      </p>
      {children}
    </div>
  );
}

export function CouponForm({ action, defaults, submitLabel }: { action: ServerAction; defaults: CouponDefaults; submitLabel: string }) {
  const { state, formAction, formRef } = usePreservingAction(action);
  const v = { ...defaults, ...(state?.values ?? {}) } as CouponDefaults;
  const [kind, setKind] = useState<"percent" | "fixed">(v.kind);
  const fe = state?.fieldErrors ?? {};
  return (
    <form ref={formRef} action={formAction} className="grid gap-4 lg:grid-cols-2" noValidate>
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <Group title="الكود والخصم" icon={<Percent />} tone="coral" className="lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="الكود" htmlFor="c-code" error={fe.code} required>
            <Input id="c-code" name="code" defaultValue={v.code} dir="ltr" className="text-start font-display font-extrabold tracking-[0.08em] uppercase" placeholder="EXAM2026" />
          </Field>
          <Field label="نوع الخصم" htmlFor="c-kind">
            <Select id="c-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "percent" | "fixed")}>
              <option value="percent">نسبة مئوية %</option>
              <option value="fixed">مبلغ ثابت (د.ك)</option>
            </Select>
          </Field>
          <Field label={kind === "percent" ? "النسبة (1-100)" : "قيمة الخصم (د.ك)"} htmlFor="c-value" error={fe.value} required>
            <Input id="c-value" name="value" defaultValue={v.value} inputMode="decimal" dir="ltr" className="num text-start" />
          </Field>
          <Field label="الحد الأدنى للطلب (د.ك)" htmlFor="c-min" error={fe.minOrder} hint="اختياري">
            <Input id="c-min" name="minOrder" defaultValue={v.minOrder} inputMode="decimal" dir="ltr" className="num text-start" />
          </Field>
        </div>
      </Group>
      <Group title="حدود الاستخدام" icon={<Gauge />} tone="violet">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="أقصى عدد استخدامات" htmlFor="c-max" error={fe.maxRedemptions} hint="فارغ = بلا حد">
            <Input id="c-max" name="maxRedemptions" type="number" min={1} defaultValue={v.maxRedemptions} className="num" />
          </Field>
          <Field label="مرات لكل طالب" htmlFor="c-per" error={fe.maxPerUser}>
            <Input id="c-per" name="maxPerUser" type="number" min={1} defaultValue={v.maxPerUser} className="num" />
          </Field>
        </div>
      </Group>
      <Group title="فترة الصلاحية" icon={<CalendarRange />} tone="sky">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="يبدأ في" htmlFor="c-start" error={fe.startsAt} hint="اختياري">
            <Input id="c-start" name="startsAt" type="date" defaultValue={v.startsAt} className="num" />
          </Field>
          <Field label="ينتهي في (شامل اليوم)" htmlFor="c-end" error={fe.endsAt} hint="اختياري">
            <Input id="c-end" name="endsAt" type="date" defaultValue={v.endsAt} className="num" />
          </Field>
        </div>
      </Group>
      <Group title="ملاحظة وتفعيل" icon={<StickyNote />} tone="gold" className="lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="ملاحظة داخلية" htmlFor="c-note">
            <Input id="c-note" name="note" defaultValue={v.note} maxLength={300} />
          </Field>
          <Checkbox name="isActive" defaultChecked={v.isActive} label="مفعّل" className="min-h-12 rounded-[0.9rem] bg-surface px-4 font-display font-bold ring-1 ring-line" />
        </div>
      </Group>
      {state?.error ? (
        <Alert tone="danger" className="lg:col-span-2">
          {state.error}
        </Alert>
      ) : null}
      {state?.ok && state.message ? (
        <Alert tone="success" className="lg:col-span-2">
          {state.message}
        </Alert>
      ) : null}
      <div className="lg:col-span-2">
        <SubmitButton size="lg">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
