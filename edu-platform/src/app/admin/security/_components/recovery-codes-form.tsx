"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { STEP_UP_FIELD } from "@/lib/two-factor";
import { usePreservingAction } from "@/components/admin/use-preserving-action";
import { RecoveryCodesPanel } from "@/components/site/recovery-codes";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { regenerateRecoveryCodesAction } from "../actions";

export function RecoveryCodesForm() {
  const router = useRouter();
  const { state, formAction, formRef } = usePreservingAction(regenerateRecoveryCodesAction);
  // refresh يحدّث العدد المتبقي ولا يمسح حالة النموذج، فنخفي الرموز صراحة
  const [saved, setSaved] = useState<ActionState>(null);
  const codes = state?.ok && state !== saved ? state.secrets?.recoveryCodes?.split("\n") : undefined;
  if (codes) {
    return (
      <RecoveryCodesPanel
        codes={codes}
        doneLabel="حفظتها"
        onDone={() => {
          setSaved(state);
          router.refresh();
        }}
      />
    );
  }
  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3" data-testid="regenerate-recovery-form">
      <Field label="رمز التحقق أو رمز استرداد" htmlFor="regenerate-code" className="min-w-[min(100%,15rem)] flex-1">
        <Input id="regenerate-code" name={STEP_UP_FIELD} dir="ltr" className="num text-start" autoComplete="one-time-code" required maxLength={32} data-testid="regenerate-code" />
      </Field>
      <SubmitButton pendingText="جارٍ الإصدار…" variant="outline" data-testid="regenerate-submit">
        <KeyRound aria-hidden /> إصدار رموز جديدة
      </SubmitButton>
      {state?.error ? (
        <Alert tone="danger" className="w-full">
          {state.error}
        </Alert>
      ) : null}
    </form>
  );
}
