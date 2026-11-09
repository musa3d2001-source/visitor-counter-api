"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { usePreservingAction } from "./use-preserving-action";
import { AlertDialog } from "radix-ui";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import type * as React from "react";
import type { ActionState } from "@/lib/action-state";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * زر لإجراء حساس: يفتح نافذة تأكيد، ويمكن أن يطلب سببًا إلزاميًا (يُحفظ في سجل التدقيق).
 */
export function ConfirmButton({
  action,
  hidden,
  label,
  title,
  description,
  confirmLabel = "تأكيد",
  variant = "danger-outline",
  size = "sm",
  requireReason,
  reasonLabel = "السبب (إلزامي)",
  icon,
  fields,
  selectField,
}: {
  action: ServerAction;
  hidden?: Record<string, string>;
  label: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  requireReason?: boolean;
  reasonLabel?: string;
  icon?: React.ReactNode;
  /** حقول إضافية داخل نافذة التأكيد (مرتبطة بالنموذج عبر سمة form) */
  fields?: { name: string; label: string; placeholder?: string; ltr?: boolean; required?: boolean; autoComplete?: string; maxLength?: number; testId?: string }[];
  /** قائمة اختيار داخل نافذة التأكيد */
  selectField?: { name: string; label: string; options: { value: string; label: string }[] };
}) {
  const { state, formAction, pending, formRef } = usePreservingAction(action);
  const [open, setOpen] = useState(false);
  const formId = useId();
  const calm = variant === "primary" || variant === "accent";
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  return (
    <div className="inline-flex flex-col items-start">
      <form id={formId} ref={formRef} action={formAction}>
        {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      </form>
      <AlertDialog.Root open={open} onOpenChange={setOpen}>
        <AlertDialog.Trigger asChild>
          <Button type="button" variant={variant} size={size} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
            {label}
          </Button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-[rgb(6_30_29/0.45)] backdrop-blur-[3px]" />
          <AlertDialog.Content
            dir="rtl"
            className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.75rem] border border-white bg-surface p-6 shadow-pop outline-none sm:p-7"
          >
            <span
              className={cn(
                "mb-4 grid size-14 place-items-center rounded-[1.15rem] [&_svg]:size-7",
                calm
                  ? "bg-linear-to-br from-brand-400 to-brand-600 text-white shadow-[inset_0_-4px_0_rgb(0_0_0/0.14),0_12px_22px_-12px_var(--brand-edge)]"
                  : "bg-linear-to-br from-[#FFA07A] to-[#D9412F] text-white shadow-[inset_0_-4px_0_rgb(0_0_0/0.14),0_12px_22px_-12px_#B4322A]",
              )}
              aria-hidden
            >
              {calm ? <CircleCheck /> : <TriangleAlert />}
            </span>
            <AlertDialog.Title className="font-display text-[1.35rem] leading-snug font-black text-ink">{title}</AlertDialog.Title>
            {description ? <AlertDialog.Description className="mt-2 text-[0.95rem] leading-7 text-ink-soft">{description}</AlertDialog.Description> : <AlertDialog.Description className="sr-only">{title}</AlertDialog.Description>}
            {requireReason ? (
              <div className="mt-4">
                <label htmlFor={`${formId}-reason`} className="mb-1.5 block font-display text-sm font-bold text-ink-soft">
                  {reasonLabel}
                </label>
                <Textarea id={`${formId}-reason`} name="reason" form={formId} required minLength={3} maxLength={500} rows={3} />
              </div>
            ) : null}
            {selectField ? (
              <div className="mt-4">
                <label htmlFor={`${formId}-${selectField.name}`} className="mb-1.5 block font-display text-sm font-bold text-ink-soft">
                  {selectField.label}
                </label>
                <Select id={`${formId}-${selectField.name}`} name={selectField.name} form={formId}>
                  {selectField.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            {fields?.map((f) => (
              <div key={f.name} className="mt-4">
                <label htmlFor={`${formId}-${f.name}`} className="mb-1.5 block font-display text-sm font-bold text-ink-soft">
                  {f.label}
                </label>
                <Input id={`${formId}-${f.name}`} name={f.name} form={formId} placeholder={f.placeholder} dir={f.ltr ? "ltr" : undefined} className={f.ltr ? "num text-start" : undefined} required={f.required} autoComplete={f.autoComplete} maxLength={f.maxLength} data-testid={f.testId} />
              </div>
            ))}
            {state?.error ? (
              <p role="alert" className="mt-3 rounded-xl bg-danger-50 px-3 py-2 text-sm font-bold text-danger">
                {state.error}
              </p>
            ) : null}
            <div className="mt-7 flex flex-wrap-reverse justify-end gap-2.5">
              <AlertDialog.Cancel asChild>
                <Button type="button" variant="outline" size="md">
                  إلغاء
                </Button>
              </AlertDialog.Cancel>
              <Button type="submit" form={formId} variant={calm ? (variant as "primary" | "accent") : "danger"} size="md" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                {confirmLabel}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {!open && state?.error ? (
        <p role="alert" className="mt-1 text-xs font-bold text-danger">
          {state.error}
        </p>
      ) : null}
      {state?.ok && state.message ? (
        <p role="status" className="mt-1 text-xs font-bold text-success">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

/** زر إجراء سريع بدون تأكيد (نشر/إخفاء/ترتيب) */
export function QuickAction({
  action,
  hidden,
  label,
  variant = "outline",
  size = "sm",
  icon,
  title,
}: {
  action: ServerAction;
  hidden?: Record<string, string>;
  label?: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  icon?: React.ReactNode;
  title?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-start">
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      <Button type="submit" variant={variant} size={size} disabled={pending} title={title} aria-label={title}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
        {label}
      </Button>
      {state?.error ? (
        <p role="alert" className="mt-1 max-w-56 text-xs font-bold text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
