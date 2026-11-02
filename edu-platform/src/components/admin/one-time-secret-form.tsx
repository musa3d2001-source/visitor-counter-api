"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { usePreservingAction } from "./use-preserving-action";
import type { ActionState } from "@/lib/action-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * نموذج يعرض سرًا لمرة واحدة (كلمة مرور مؤقتة) ويبقيه ظاهرًا حتى يضغط المالك «تم»،
 * ثم يحدّث الصفحة. الإجراء لا يعيد تحميل الصفحة بنفسه حتى لا تضيع كلمة المرور.
 */
export function OneTimeSecretForm({ action, children, className }: { action: ServerAction; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const { state, formAction, formRef } = usePreservingAction(action);
  const [copied, setCopied] = useState(false);
  const secret = state?.ok ? (state.message?.match(/:\s*(\S+)$/)?.[1] ?? null) : null;
  if (state?.ok) {
    return (
      <div className="space-y-3" role="status">
        <Alert tone="success">{state.message}</Alert>
        {secret ? (
          <div className="flex items-center gap-2 rounded-lg border-2 border-dashed border-brand-300 bg-brand-50 p-3">
            <KeyRound className="size-4 shrink-0 text-brand-700" aria-hidden />
            <code className="num flex-1 font-bold break-all" dir="ltr" data-testid="one-time-secret">
              {secret}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              <Copy aria-hidden /> {copied ? "تم النسخ" : "نسخ"}
            </Button>
          </div>
        ) : null}
        <Button type="button" size="sm" onClick={() => router.refresh()}>
          تم، متابعة
        </Button>
      </div>
    );
  }
  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      {state?.error ? (
        <Alert tone="danger" className="mt-3">
          {state.error}
        </Alert>
      ) : null}
    </form>
  );
}
