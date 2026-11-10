"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { KeyRound, LogIn, Mail, UserPlus } from "lucide-react";
import { loginAction } from "../actions";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { BIG_INPUT, IconInput, PasswordInput } from "../_components/auth-fields";
import { OrDivider, SwitchCard } from "../_components/auth-bits";
import { count, W } from "@/lib/design";

export function LoginForm({ next }: { next: string }) {
  // الدالة نفسها بلا تغليف: النموذج يعمل قبل أن تكتمل JavaScript على هاتف بطيء
  const [state, action] = useActionState(loginAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const typed = useRef("");

  // المنصة مشغولة: الزر ينتظر المدة التي طلبها الخادم بدل أن يضيف محاولة أخرى إلى الزحام
  const [seen, setSeen] = useState(state);
  const [wait, setWait] = useState(state?.retryAfter ?? 0);
  if (state !== seen) {
    setSeen(state);
    setWait(state?.retryAfter ?? 0);
  }
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  // React يفرغ النموذج بعد كل إرسال. كلمة لم تُفحص أصلًا تبقى في مكانها، ولا تعود من الخادم أبدًا
  useEffect(() => {
    const field = formRef.current?.elements.namedItem("password");
    if (state?.retryAfter && field instanceof HTMLInputElement && typed.current) field.value = typed.current;
    typed.current = "";
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(event) => {
        typed.current = String(new FormData(event.currentTarget).get("password") ?? "");
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <input type="hidden" name="next" value={next} />
      {state?.error && state.retryAfter ? (
        <Alert tone="warning" data-testid="login-busy" data-retry-after={state.retryAfter}>
          {state.error}
        </Alert>
      ) : state?.error ? (
        <Alert tone="danger">{state.error}</Alert>
      ) : null}
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
      <SubmitButton size="xl" pendingText="جارٍ الدخول…" className="w-full" disabled={wait > 0}>
        {wait > 0 ? (
          <span data-testid="login-wait">{`أعد المحاولة بعد ${count(wait, W.second)}`}</span>
        ) : (
          <>
            تسجيل الدخول
            <LogIn aria-hidden />
          </>
        )}
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
