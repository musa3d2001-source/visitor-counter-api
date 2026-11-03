"use client";

import { useEffect } from "react";
import { usePreservingAction } from "./use-preserving-action";
import type * as React from "react";
import type { ActionState } from "@/lib/action-state";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * نموذج موحد للإدارة: يعرض رسالة النجاح/الخطأ ويمرر أخطاء الحقول للأبناء.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  compact,
  id,
}: {
  action: ServerAction;
  children: React.ReactNode | ((state: ActionState, pending: boolean) => React.ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  compact?: boolean;
  id?: string;
}) {
  const { state, formAction, pending, formRef: ref } = usePreservingAction(action);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} id={id} noValidate={false}>
      {typeof children === "function" ? children(state, pending) : children}
      {state?.error ? (
        compact ? (
          <p role="alert" className="mt-2 inline-flex items-start gap-1.5 rounded-xl bg-danger-50 px-2.5 py-1.5 text-[0.85rem] leading-6 font-bold text-danger">
            <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
        ) : (
          <Alert tone="danger" className="mt-4">
            {state.error}
          </Alert>
        )
      ) : null}
      {state?.ok && state.message ? (
        compact ? (
          <p role="status" className={cn("mt-2 inline-flex items-start gap-1.5 rounded-xl bg-success-50 px-2.5 py-1.5 text-[0.85rem] leading-6 font-bold text-success")}>
            <CircleCheck className="mt-1 size-4 shrink-0" aria-hidden />
            {state.message}
          </p>
        ) : (
          <Alert tone="success" className="mt-4">
            {state.message}
          </Alert>
        )
      ) : null}
    </form>
  );
}
