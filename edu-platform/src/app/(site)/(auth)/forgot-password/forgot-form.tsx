"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, Mail, MailSearch, Send } from "lucide-react";
import { forgotPasswordAction } from "../actions";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { BIG_INPUT, IconInput } from "../_components/auth-fields";
import { MailArt, ResetSteps } from "../_components/auth-bits";

export function ForgotForm() {
  const [state, action] = useActionState(forgotPasswordAction, null);
  if (state?.ok) {
    return (
      <div className="flex flex-col gap-5">
        <div className="mx-auto h-32 w-40">
          <MailArt />
        </div>
        <Alert tone="success">{state.message}</Alert>
        <p className="flex items-start gap-2.5 rounded-2xl bg-[#fffaf1] px-4 py-3 text-[0.92rem] leading-7 text-ink-soft">
          <MailSearch className="mt-1 size-4.5 shrink-0 text-accent-700" aria-hidden />
          لم تصلك الرسالة؟ تحقّق من مجلد الرسائل غير المرغوب فيها، أو أعد المحاولة بعد قليل.
        </p>
        <Link href="/login" className="btn btn-3d btn-primary btn-lg w-full">
          <ArrowRight aria-hidden />
          العودة لتسجيل الدخول
        </Link>
      </div>
    );
  }
  return (
    <>
      <ResetSteps />
      <form action={action} className="flex flex-col gap-5" noValidate>
        <Field label="البريد الإلكتروني" htmlFor="email" error={state?.fieldErrors?.email}>
          <IconInput icon={<Mail />} tone="teal">
            <Input id="email" name="email" type="email" autoComplete="email" dir="ltr" required placeholder="name@example.com" className={BIG_INPUT} defaultValue={state?.values?.email} />
          </IconInput>
        </Field>
        <SubmitButton size="xl" pendingText="جارٍ الإرسال…" className="w-full">
          إرسال رابط الاستعادة
          <Send className="-scale-x-100" aria-hidden />
        </SubmitButton>
        <Link href="/login" className="mx-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[0.95rem] font-bold text-brand-700 hover:bg-brand-50">
          <ArrowRight className="size-4.5" aria-hidden />
          العودة لتسجيل الدخول
        </Link>
      </form>
    </>
  );
}
