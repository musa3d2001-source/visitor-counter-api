"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { usePreservingAction } from "./use-preserving-action";
import { AlertDialog } from "radix-ui";
import { LoaderCircle } from "lucide-react";
import type * as React from "react";
import type { ActionState } from "@/lib/action-state";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";

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
  fields?: { name: string; label: string; placeholder?: string; ltr?: boolean }[];
}) {
  const { state, formAction, pending, formRef } = usePreservingAction(action);
  const [open, setOpen] = useState(false);
  const formId = useId();
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
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
          <AlertDialog.Content dir="rtl" className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-lift outline-none">
            <AlertDialog.Title className="text-lg font-bold">{title}</AlertDialog.Title>
            {description ? <AlertDialog.Description className="mt-2 text-sm leading-7 text-ink-soft">{description}</AlertDialog.Description> : <AlertDialog.Description className="sr-only">{title}</AlertDialog.Description>}
            {requireReason ? (
              <div className="mt-4">
                <label htmlFor={`${formId}-reason`} className="mb-1.5 block text-sm font-semibold text-ink-soft">
                  {reasonLabel}
                </label>
                <Textarea id={`${formId}-reason`} name="reason" form={formId} required minLength={3} maxLength={500} rows={3} />
              </div>
            ) : null}
            {fields?.map((f) => (
              <div key={f.name} className="mt-4">
                <label htmlFor={`${formId}-${f.name}`} className="mb-1.5 block text-sm font-semibold text-ink-soft">
                  {f.label}
                </label>
                <Input id={`${formId}-${f.name}`} name={f.name} form={formId} placeholder={f.placeholder} dir={f.ltr ? "ltr" : undefined} className={f.ltr ? "num text-start" : undefined} />
              </div>
            ))}
            {state?.error ? (
              <p role="alert" className="mt-3 text-sm text-danger">
                {state.error}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button type="button" variant="ghost" size="sm">
                  إلغاء
                </Button>
              </AlertDialog.Cancel>
              <Button type="submit" form={formId} variant={variant === "primary" || variant === "accent" ? variant : "danger"} size="sm" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                {confirmLabel}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {!open && state?.error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state?.ok && state.message ? (
        <p role="status" className="mt-1 text-xs text-success">
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
        <p role="alert" className="mt-1 max-w-56 text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
