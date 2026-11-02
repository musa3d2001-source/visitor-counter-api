"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "../actions";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="البريد الإلكتروني" htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" dir="ltr" required defaultValue={state?.values?.email} aria-invalid={Boolean(state?.fieldErrors?.email)} aria-describedby="email-error" />
      </Field>
      <Field label="كلمة المرور" htmlFor="password" error={state?.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" dir="ltr" required aria-invalid={Boolean(state?.fieldErrors?.password)} />
      </Field>
      <div className="-mt-1 text-start">
        <Link href="/forgot-password" className="text-sm font-semibold text-brand-700 hover:underline">
          نسيت كلمة المرور؟
        </Link>
      </div>
      <SubmitButton size="lg" pendingText="جارٍ الدخول…">تسجيل الدخول</SubmitButton>
      <p className="text-center text-sm text-muted">
        ليس لديك حساب؟{" "}
        <Link href={`/register${next !== "/library" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">
          أنشئ حسابًا مجانيًا
        </Link>
      </p>
    </form>
  );
}
