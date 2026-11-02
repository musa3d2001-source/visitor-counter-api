"use client";

import { useActionState, useEffect, useRef } from "react";
import type * as React from "react";
import type { ActionState } from "@/lib/action-state";
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
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} id={id} noValidate={false}>
      {typeof children === "function" ? children(state, pending) : children}
      {state?.error ? (
        compact ? (
          <p role="alert" className="mt-2 text-sm text-danger">
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
          <p role="status" className={cn("mt-2 text-sm text-success")}>
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
