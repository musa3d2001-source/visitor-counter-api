"use client";

import Link from "next/link";
import { useActionState } from "react";
import { KeyRound, LogIn, Mail, UserPlus } from "lucide-react";
import { loginAction } from "../actions";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { BIG_INPUT, IconInput, PasswordInput } from "../_components/auth-fields";
import { OrDivider, SwitchCard } from "../_components/auth-bits";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="البريد الإلكتروني" htmlFor="email" error={state?.fieldErrors?.email}>
        <IconInput icon={<Mail />} tone="teal">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            required
            placeholder="name@example.com"
            className={BIG_INPUT}
            defaultValue={state?.values?.email}
            aria-invalid={Boolean(state?.fieldErrors?.email)}
            aria-describedby="email-error"
          />
        </IconInput>
      </Field>
      <div>
        <Field label="كلمة المرور" htmlFor="password" error={state?.fieldErrors?.password}>
          <PasswordInput id="password" name="password" icon={<KeyRound />} autoComplete="current-password" dir="ltr" required aria-invalid={Boolean(state?.fieldErrors?.password)} />
        </Field>
        <div className="mt-1 flex justify-end">
          <Link prefetch={false} href="/forgot-password" className="inline-flex min-h-11 items-center rounded-xl px-2 text-[0.92rem] font-bold text-brand-700 underline-offset-4 hover:bg-brand-50 hover:underline">
            نسيت كلمة المرور؟
          </Link>
        </div>
      </div>
      <SubmitButton size="xl" pendingText="جارٍ الدخول…" className="w-full">
        تسجيل الدخول
        <LogIn aria-hidden />
      </SubmitButton>
      <OrDivider label="جديد على المنصة؟" />
      <SwitchCard
        question="ليس لديك حساب؟"
        href={`/register${next !== "/library" ? `?next=${encodeURIComponent(next)}` : ""}`}
        label="أنشئ حسابًا مجانيًا"
        icon={<UserPlus />}
      />
    </form>
  );
}
