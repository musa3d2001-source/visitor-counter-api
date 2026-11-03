"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, EyeOff, KeyRound } from "lucide-react";
import { usePreservingAction } from "./use-preserving-action";
import type { ActionState } from "@/lib/action-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * نموذج يعرض سرًا لمرة واحدة (كلمة مرور مؤقتة) ويبقيه ظاهرًا حتى يضغط المالك «تم»،
 * ثم يحدّث الصفحة. الإجراء لا يعيد تحميل الصفحة بنفسه حتى لا تضيع كلمة المرور.
 * السر يعيش في حالة React فقط: لا يُحفظ في التخزين المحلي ولا في الرابط.
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
          <div className="relative overflow-hidden rounded-[1.4rem] border-2 border-dashed border-[#F0C766] bg-[linear-gradient(160deg,#fffaf0,#fff1cf)] p-3.5">
            <p className="mb-2.5 flex items-center gap-2 font-display text-[0.9rem] font-black text-[#6e4700]">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#FFD25E] to-[#EB9B00] text-[#3D2A00] shadow-[inset_0_-2px_0_rgb(0_0_0/0.14)]">
                <KeyRound className="size-4" aria-hidden />
              </span>
              كلمة المرور المؤقتة
            </p>
            <code
              className="num block rounded-xl bg-white px-3 py-2.5 text-center font-mono text-[1.05rem] font-bold tracking-wide break-all text-ink shadow-xs ring-1 ring-[#F0C766]/60"
              dir="ltr"
              data-testid="one-time-secret"
            >
              {secret}
            </code>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={copied ? "soft" : "outline"}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(secret);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "تم النسخ" : "نسخ"}
              </Button>
              <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[0.78rem] leading-5 text-[#6e4700]">
                <EyeOff className="size-3.5 shrink-0" aria-hidden />
                تظهر مرة واحدة فقط، انسخها الآن.
              </p>
            </div>
          </div>
        ) : null}
        <Button type="button" size="md" className="w-full" onClick={() => router.refresh()}>
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
