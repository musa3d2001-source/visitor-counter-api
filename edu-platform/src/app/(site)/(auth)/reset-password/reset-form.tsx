"use client";

import Link from "next/link";
import { useActionState } from "react";
import { KeyRound, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import { resetPasswordAction } from "../actions";
import { Field } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { PasswordInput } from "../_components/auth-fields";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="token" value={token} />
      {state?.error ? (
        <div className="flex flex-col gap-3">
          <Alert tone="danger">{state.error}</Alert>
          <Link href="/forgot-password" className="btn btn-outline btn-md w-full">
            <RotateCcw aria-hidden />
            إرسال رابط جديد
          </Link>
        </div>
      ) : null}
      <Field label="كلمة المرور الجديدة" htmlFor="password" error={state?.fieldErrors?.password} hint="٨ أحرف على الأقل وليست أرقامًا فقط، و١٢ لحسابات المعلمين">
        <PasswordInput id="password" name="password" icon={<KeyRound />} autoComplete="new-password" dir="ltr" required minLength={8} />
      </Field>
      <Field label="تأكيد كلمة المرور" htmlFor="passwordConfirm" error={state?.fieldErrors?.passwordConfirm}>
        <PasswordInput id="passwordConfirm" name="passwordConfirm" icon={<LockKeyhole />} tone="teal" autoComplete="new-password" dir="ltr" required />
      </Field>
      <p className="flex items-start gap-2.5 rounded-2xl bg-brand-50/70 px-4 py-3 text-[0.92rem] leading-7 text-ink-soft">
        <ShieldCheck className="mt-1 size-4.5 shrink-0 text-brand-700" aria-hidden />
        اختر كلمة لا تستخدمها في موقع آخر، وامزج فيها الحروف والأرقام.
      </p>
      <SubmitButton size="xl" pendingText="جارٍ الحفظ…" className="w-full">
        حفظ كلمة المرور
      </SubmitButton>
    </form>
  );
}
