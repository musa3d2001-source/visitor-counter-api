"use client";

import { usePreservingAction } from "./use-preserving-action";
import { useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

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

export function CouponForm({ action, defaults, submitLabel }: { action: ServerAction; defaults: CouponDefaults; submitLabel: string }) {
  const { state, formAction, formRef } = usePreservingAction(action);
  const v = { ...defaults, ...(state?.values ?? {}) } as CouponDefaults;
  const [kind, setKind] = useState<"percent" | "fixed">(v.kind);
  const fe = state?.fieldErrors ?? {};
  return (
    <form ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" noValidate>
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <Field label="الكود" htmlFor="c-code" error={fe.code} required>
        <Input id="c-code" name="code" defaultValue={v.code} dir="ltr" className="text-start uppercase" placeholder="EXAM2026" />
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
      <Field label="أقصى عدد استخدامات" htmlFor="c-max" error={fe.maxRedemptions} hint="فارغ = بلا حد">
        <Input id="c-max" name="maxRedemptions" type="number" min={1} defaultValue={v.maxRedemptions} className="num" />
      </Field>
      <Field label="مرات لكل طالب" htmlFor="c-per" error={fe.maxPerUser}>
        <Input id="c-per" name="maxPerUser" type="number" min={1} defaultValue={v.maxPerUser} className="num" />
      </Field>
      <Field label="يبدأ في" htmlFor="c-start" error={fe.startsAt} hint="اختياري">
        <Input id="c-start" name="startsAt" type="date" defaultValue={v.startsAt} className="num" />
      </Field>
      <Field label="ينتهي في (شامل اليوم)" htmlFor="c-end" error={fe.endsAt} hint="اختياري">
        <Input id="c-end" name="endsAt" type="date" defaultValue={v.endsAt} className="num" />
      </Field>
      <Field label="ملاحظة داخلية" htmlFor="c-note" className="sm:col-span-2 lg:col-span-3">
        <Input id="c-note" name="note" defaultValue={v.note} maxLength={300} />
      </Field>
      <div className="flex items-end pb-2">
        <Checkbox name="isActive" defaultChecked={v.isActive} label="مفعّل" />
      </div>
      {state?.error ? (
        <Alert tone="danger" className="sm:col-span-2 lg:col-span-4">
          {state.error}
        </Alert>
      ) : null}
      {state?.ok && state.message ? (
        <Alert tone="success" className="sm:col-span-2 lg:col-span-4">
          {state.message}
        </Alert>
      ) : null}
      <div className="sm:col-span-2 lg:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
