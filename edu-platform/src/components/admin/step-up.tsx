"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertDialog } from "radix-ui";
import { LoaderCircle, ShieldCheck, Smartphone } from "lucide-react";
import type * as React from "react";
import { proveStepUpAction } from "@/app/admin/security/actions";
import { count, W } from "@/lib/design";
import { STEP_UP_FIELD, STEP_UP_PROOF_MINUTES, TWO_FACTOR_SETUP_PATH } from "@/lib/two-factor";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

type Need = "proof" | "enrol";
type Outcome = "proved" | "cancelled";
type Pending = { id: number; need: Need; resolve: (o: Outcome) => void };

const StepUpContext = createContext<{ request: (need: Need) => Promise<Outcome> } | null>(null);

/** خارج اللوحة لا توجد خطوة، فيظهر رفض الخادم رسالةً عادية */
export function useStepUp() {
  return useContext(StepUpContext);
}

const PROOF_FAILED = "تعذر التحقق الآن. حاول مرة أخرى.";

function ProofForm({ onProved }: { onProved: () => void }) {
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  // ليس useActionState عمدًا: الخطوة تظهر والأمر الأصلي ما زال action معلقًا، وReact يؤجل تحديثات كل action حتى ينتهي، فلن يكتمل أي منهما
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fd = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      const res = await proveStepUpAction(null, fd);
      if (res?.ok) return onProved();
      setError(res?.error ?? PROOF_FAILED);
    } catch {
      setError(PROOF_FAILED);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-3" data-testid="step-up-proof-form">
      <Field label={recovery ? "رمز استرداد" : "الرمز من تطبيق المصادقة"} htmlFor="step-up-proof-code" hint={recovery ? "كل رمز استرداد يعمل مرة واحدة" : "٦ أرقام، ويتغير كل ٣٠ ثانية"}>
        <Input
          key={recovery ? "recovery" : "totp"}
          id="step-up-proof-code"
          name={STEP_UP_FIELD}
          dir="ltr"
          className="num text-start"
          inputMode={recovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={32}
          data-testid="step-up-proof-code"
        />
      </Field>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap-reverse items-center justify-between gap-2.5">
        <Button type="button" variant="ghost" size="sm" onClick={() => setRecovery((v) => !v)} data-testid="step-up-use-recovery">
          {recovery ? "استخدام الرمز من التطبيق" : "ضاع جوالي، استخدام رمز استرداد"}
        </Button>
        <div className="flex gap-2.5">
          <AlertDialog.Cancel asChild>
            <Button type="button" variant="outline" size="md">
              إلغاء
            </Button>
          </AlertDialog.Cancel>
          <Button type="submit" disabled={busy} aria-busy={busy} data-testid="step-up-proof-submit">
            {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {busy ? "جارٍ التحقق…" : "تأكيد"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * خطوة الإثبات: نافذة صغيرة فوق الأمر الذي طلبها، بلا مغادرة للصفحة ولا فقدان لما كُتب في النموذج.
 * تعيش في تخطيط اللوحة، فتعمل مع كل نماذج الإدارة عبر usePreservingAction.
 */
export function StepUpProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const current = useRef<Pending | null>(null);
  const seq = useRef(0);

  const close = useCallback((outcome: Outcome) => {
    const open = current.current;
    current.current = null;
    setPending(null);
    open?.resolve(outcome);
  }, []);

  const request = useCallback((need: Need) => {
    return new Promise<Outcome>((resolve) => {
      current.current?.resolve("cancelled");
      seq.current += 1;
      const next = { id: seq.current, need, resolve };
      current.current = next;
      setPending(next);
    });
  }, []);

  const value = useMemo(() => ({ request }), [request]);
  const onProved = useCallback(() => close("proved"), [close]);

  return (
    <StepUpContext.Provider value={value}>
      {children}
      <AlertDialog.Root open={pending !== null} onOpenChange={(open) => (open ? undefined : close("cancelled"))}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-[rgb(6_30_29/0.45)] backdrop-blur-[3px]" />
          <AlertDialog.Content
            dir="rtl"
            data-testid="step-up-sheet"
            data-need={pending?.need}
            className="fixed left-1/2 top-1/2 z-[60] max-h-[90dvh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.75rem] border border-white bg-surface p-6 shadow-pop outline-none sm:p-7"
          >
            <span className="mb-4 grid size-14 place-items-center rounded-[1.15rem] bg-linear-to-br from-brand-400 to-brand-600 text-white shadow-[inset_0_-4px_0_rgb(0_0_0/0.14),0_12px_22px_-12px_var(--brand-edge)] [&_svg]:size-7" aria-hidden>
              {pending?.need === "enrol" ? <Smartphone /> : <ShieldCheck />}
            </span>
            <AlertDialog.Title className="font-display text-[1.35rem] leading-snug font-black text-ink">{pending?.need === "enrol" ? "فعّل التحقق بخطوتين أولًا" : "أكّد أنك صاحب الحساب"}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-[0.95rem] leading-7 text-ink-soft">
              {pending?.need === "enrol" ? "هذا الأمر لا يعمل دون تطبيق مصادقة على جوالك. فعّله مرة واحدة، ثم عد إلى هنا." : `هذا أمر حساس. بعد التأكيد تعمل الأوامر الحساسة ${count(STEP_UP_PROOF_MINUTES, W.minute)} على هذا الجهاز فقط.`}
            </AlertDialog.Description>
            {pending?.need === "enrol" ? (
              <div className="mt-6 flex flex-wrap-reverse justify-end gap-2.5">
                <AlertDialog.Cancel asChild>
                  <Button type="button" variant="outline" size="md">
                    إلغاء
                  </Button>
                </AlertDialog.Cancel>
                <Button asChild size="md">
                  <Link prefetch={false} href={TWO_FACTOR_SETUP_PATH} data-testid="step-up-enrol-link">
                    تفعيل التحقق بخطوتين
                  </Link>
                </Button>
              </div>
            ) : pending ? (
              <ProofForm key={pending.id} onProved={onProved} />
            ) : null}
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </StepUpContext.Provider>
  );
}
