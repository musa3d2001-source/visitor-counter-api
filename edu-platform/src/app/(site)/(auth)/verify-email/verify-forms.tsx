"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BadgeCheck, CreditCard, Library, LockKeyhole, Mail, PencilLine, Send } from "lucide-react";
import { confirmEmailAction, correctEmailAction, resendVerificationAction } from "./actions";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { BIG_INPUT, IconInput, PasswordInput } from "../_components/auth-fields";

export function ResendForm({ first, toAccountAddress }: { first: boolean; toAccountAddress: string | null }) {
  const [state, action] = useActionState(resendVerificationAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <SubmitButton size="xl" pendingText="جارٍ الإرسال…" className="w-full">
        <Send aria-hidden />
        {toAccountAddress ? "إرسال الرابط إلى بريد حسابك" : first ? "إرسال رابط التأكيد" : "إرسال رابط جديد"}
      </SubmitButton>
      {toAccountAddress ? (
        <p className="text-[0.88rem] leading-6 text-ink-soft" data-testid="resend-account-hint">
          يصل هذا الزر إلى <bdi dir="ltr">{toAccountAddress}</bdi> ويلغي الرابط السابق. لإرسال رابط جديد إلى العنوان الجديد، اكتبه مع كلمة مرورك في النموذج أدناه.
        </p>
      ) : null}
    </form>
  );
}

export function CorrectEmailForm() {
  const [state, action] = useActionState(correctEmailAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <details className="group rounded-2xl border-2 border-line bg-field" open={Boolean(state?.ok || state?.error || state?.fieldErrors)}>
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-display text-[1rem] font-extrabold text-ink">
        <PencilLine className="size-4.5 text-brand-700" aria-hidden />
        كتبت بريدك خطأ؟
      </summary>
      <form action={action} className="flex flex-col gap-4 px-4 pb-4" noValidate>
        {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}
        {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <Field label="البريد الصحيح" htmlFor="email" error={fe.email}>
          <IconInput icon={<Mail />} tone="sky">
            <Input id="email" name="email" type="email" dir="ltr" autoComplete="email" required defaultValue={state?.values?.email} className={BIG_INPUT} />
          </IconInput>
        </Field>
        <Field label="كلمة مرور حسابك" htmlFor="currentPassword" error={fe.currentPassword}>
          <PasswordInput id="currentPassword" name="currentPassword" icon={<LockKeyhole />} autoComplete="current-password" dir="ltr" required />
        </Field>
        <SubmitButton size="lg" variant="outline" pendingText="جارٍ الإرسال…" className="w-full">
          إرسال رابط إلى البريد الصحيح
        </SubmitButton>
      </form>
    </details>
  );
}

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState(confirmEmailAction, null);
  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4" data-testid="email-confirmed">
        <Alert tone="success" title={state.message} />
        <Link prefetch={false} href="/checkout" className="btn btn-3d btn-primary btn-lg w-full">
          <CreditCard aria-hidden />
          متابعة الشراء
        </Link>
        <Link prefetch={false} href="/library" className="btn btn-outline btn-md w-full">
          <Library aria-hidden />
          مكتبتي
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state?.error ? (
        <div className="flex flex-col gap-3">
          <Alert tone="danger">{state.error}</Alert>
          <Link prefetch={false} href="/verify-email" className="btn btn-outline btn-md w-full">
            صفحة تأكيد البريد
          </Link>
        </div>
      ) : null}
      <SubmitButton size="xl" pendingText="جارٍ التأكيد…" className="w-full">
        <BadgeCheck aria-hidden />
        تأكيد البريد
      </SubmitButton>
    </form>
  );
}
