"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "../actions";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";

export function ForgotForm() {
  const [state, action] = useActionState(forgotPasswordAction, null);
  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{state.message}</Alert>
        <Link href="/login" className="text-center text-sm font-semibold text-brand-700 hover:underline">
          العودة لتسجيل الدخول
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="البريد الإلكتروني" htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" dir="ltr" required defaultValue={state?.values?.email} />
      </Field>
      <SubmitButton size="lg" pendingText="جارٍ الإرسال…">إرسال رابط الاستعادة</SubmitButton>
      <Link href="/login" className="text-center text-sm font-semibold text-brand-700 hover:underline">
        العودة لتسجيل الدخول
      </Link>
    </form>
  );
}
