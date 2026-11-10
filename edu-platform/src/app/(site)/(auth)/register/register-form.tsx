"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { GraduationCap, KeyRound, LockKeyhole, LogIn, Mail, Phone, Sparkles, UserRound } from "lucide-react";
import { loginAction, registerAction } from "../actions";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { BIG_INPUT, FieldIcon, IconInput, PasswordInput } from "../_components/auth-fields";
import { OrDivider, SwitchCard } from "../_components/auth-bits";
import { GUARDIAN_ACCOUNT_HINT, GUARDIAN_ACCOUNT_TEXT } from "@/lib/consent";
import { STUDENT_PASSWORD_HINT } from "@/lib/password-policy";

/**
 * بعد الإرسال: الجواب نفسه لبريد جديد ومسجل (K029)، والدخول بضغطة واحدة بكلمة المرور التي كتبها الطالب للتو.
 * الكلمة تبقى في ذاكرة هذه الصفحة، ولا تعود من الخادم. بلا JavaScript يبقى رابط صفحة الدخول.
 */
function RegisterDone({ email, password, next, message }: { email: string; password: string; next: string; message: string }) {
  const [state, action] = useActionState(loginAction, null);
  const loginHref = `/login${next !== "/library" ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <div className="flex flex-col gap-5" data-testid="register-done">
      <Alert tone="success">{message}</Alert>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {password ? (
        <form action={action}>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="password" value={password} />
          <SubmitButton size="xl" pendingText="جارٍ الدخول…" className="w-full">
            ادخل إلى حسابك
            <LogIn aria-hidden />
          </SubmitButton>
        </form>
      ) : null}
      <SwitchCard question="نسيت كلمة المرور أو تريد بريدًا آخر؟" href={loginHref} label="صفحة الدخول" icon={<LogIn />} />
    </div>
  );
}

export function RegisterForm({ next, grades }: { next: string; grades: { id: string; name: string }[] }) {
  const [state, action] = useActionState(registerAction, null);
  const [password, setPassword] = useState("");
  const fe = state?.fieldErrors ?? {};
  // React يفرّغ النموذج بعد كل action حتى عند الخطأ: من نسي مربعًا لا يعيد كتابة كلمته. بلا JavaScript يبقى الإرسال العادي
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPassword(String(fd.get("password") ?? ""));
    startTransition(() => action(fd));
  };
  if (state?.ok) return <RegisterDone email={state.values?.email ?? ""} password={password} next={next} message={state.message ?? ""} />;
  return (
    <form action={action} onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="الاسم" htmlFor="fullName" error={fe.fullName} required>
        <IconInput icon={<UserRound />} tone="coral">
          <Input id="fullName" name="fullName" autoComplete="name" required className={BIG_INPUT} defaultValue={state?.values?.fullName} aria-invalid={Boolean(fe.fullName)} />
        </IconInput>
      </Field>
      <Field label="البريد الإلكتروني" htmlFor="email" error={fe.email} required>
        <IconInput icon={<Mail />} tone="teal">
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" dir="ltr" required placeholder="name@example.com" className={BIG_INPUT} defaultValue={state?.values?.email} aria-invalid={Boolean(fe.email)} />
        </IconInput>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
        <Field label="كلمة المرور" htmlFor="password" error={fe.password} hint={STUDENT_PASSWORD_HINT} required>
          <PasswordInput id="password" name="password" icon={<KeyRound />} autoComplete="new-password" dir="ltr" required minLength={8} aria-invalid={Boolean(fe.password)} />
        </Field>
        <Field label="تأكيد كلمة المرور" htmlFor="passwordConfirm" error={fe.passwordConfirm} required>
          <PasswordInput id="passwordConfirm" name="passwordConfirm" icon={<LockKeyhole />} autoComplete="new-password" dir="ltr" required aria-invalid={Boolean(fe.passwordConfirm)} />
        </Field>
      </div>

      {/* بيانات اختيارية في لوح كريمي منفصل حتى لا يظن الطالب أنها إلزامية */}
      <fieldset className="rounded-[1.4rem] border border-dashed border-line-strong bg-[#fffaf1] px-4 pt-3 pb-4 sm:px-5">
        <legend className="flex items-center gap-2 rounded-full bg-white px-3 py-1 font-display text-[0.88rem] font-extrabold text-ink-soft shadow-xs">
          <Sparkles className="size-4 text-accent-700" aria-hidden />
          بيانات اختيارية
        </legend>
        <div className="mt-1 grid gap-5 sm:grid-cols-2 sm:gap-4">
          <Field label="رقم الهاتف (اختياري)" htmlFor="phone" error={fe.phone} hint="رقم كويتي من ٨ أرقام">
            <IconInput icon={<Phone />} tone="sky">
              <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" dir="ltr" placeholder="9XXXXXXX" className={BIG_INPUT} defaultValue={state?.values?.phone} aria-invalid={Boolean(fe.phone)} />
            </IconInput>
          </Field>
          <Field label="صفك الدراسي (اختياري)" htmlFor="gradeId" error={fe.gradeId}>
            <div className="relative">
              <Select id="gradeId" name="gradeId" className="h-13 ps-14 text-[1.02rem]" defaultValue={state?.values?.gradeId ?? ""}>
                <option value="">اختر الصف</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
              <FieldIcon icon={<GraduationCap />} tone="violet" />
            </div>
          </Field>
        </div>
      </fieldset>

      <div className="rounded-2xl border border-brand-100 bg-brand-50/60 px-3.5 py-1.5">
        <Checkbox
          name="terms"
          required
          label={
            <>
              أوافق على{" "}
              <Link prefetch={false} href="/terms" target="_blank" className="font-bold text-brand-700 underline underline-offset-4">
                الشروط والأحكام
              </Link>{" "}
              و
              <Link prefetch={false} href="/privacy" target="_blank" className="font-bold text-brand-700 underline underline-offset-4">
                سياسة الخصوصية
              </Link>
            </>
          }
        />
        {fe.terms ? (
          <p className="mb-1.5 text-sm font-medium text-danger" role="alert">
            {fe.terms}
          </p>
        ) : null}
        <Checkbox name="guardianAccount" required label={GUARDIAN_ACCOUNT_TEXT} />
        <p className="mb-1.5 text-[0.88rem] leading-6 text-muted">{GUARDIAN_ACCOUNT_HINT}</p>
        {fe.guardianAccount ? (
          <p className="mb-1.5 text-sm font-medium text-danger" role="alert">
            {fe.guardianAccount}
          </p>
        ) : null}
      </div>
      <SubmitButton size="xl" pendingText="جارٍ إنشاء الحساب…" className="w-full">
        إنشاء الحساب
        <Sparkles aria-hidden />
      </SubmitButton>
      <OrDivider label="مسجّل من قبل؟" />
      <SwitchCard question="لديك حساب؟" href={`/login${next !== "/library" ? `?next=${encodeURIComponent(next)}` : ""}`} label="سجّل الدخول" icon={<LogIn />} />
    </form>
  );
}
