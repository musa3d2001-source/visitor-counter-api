"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "../actions";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {state?.error ? (
        <Alert tone="danger">
          {state.error} <Link href="/forgot-password">طلب رابط جديد</Link>
        </Alert>
      ) : null}
      <Field label="كلمة المرور الجديدة" htmlFor="password" error={state?.fieldErrors?.password} hint="8 أحرف على الأقل">
        <Input id="password" name="password" type="password" autoComplete="new-password" dir="ltr" required minLength={8} />
      </Field>
      <Field label="تأكيد كلمة المرور" htmlFor="passwordConfirm" error={state?.fieldErrors?.passwordConfirm}>
        <Input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" dir="ltr" required />
      </Field>
      <SubmitButton size="lg" pendingText="جارٍ الحفظ…">حفظ كلمة المرور</SubmitButton>
    </form>
  );
}
