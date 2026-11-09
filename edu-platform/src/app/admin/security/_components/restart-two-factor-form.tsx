"use client";

import { Smartphone } from "lucide-react";
import { ActionForm } from "@/components/admin/action-form";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { restartTwoFactorAction } from "../actions";

/** يظهر فقط لجلسة فتحها آخر رمز استرداد. الخادم يتحقق من ذلك من جديد */
export function RestartTwoFactorForm() {
  return (
    <ActionForm action={restartTwoFactorAction} className="mt-5 border-t border-dashed border-line-strong pt-4">
      <div className="flex flex-wrap items-end gap-3" data-testid="restart-two-factor-form">
        <Field label="كلمة المرور" htmlFor="restart-password" className="min-w-[min(100%,15rem)] flex-1">
          <Input id="restart-password" name="currentPassword" type="password" dir="ltr" autoComplete="current-password" required maxLength={128} data-testid="restart-password" />
        </Field>
        <SubmitButton variant="accent" pendingText="جارٍ التنفيذ…" data-testid="restart-submit">
          <Smartphone aria-hidden /> التسجيل بجوال جديد
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
