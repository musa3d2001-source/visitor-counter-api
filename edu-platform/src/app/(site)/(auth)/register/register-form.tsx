"use client";

import Link from "next/link";
import { useActionState } from "react";
import { GraduationCap, KeyRound, LockKeyhole, LogIn, Mail, Phone, Sparkles, UserRound } from "lucide-react";
import { registerAction } from "../actions";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { BIG_INPUT, FieldIcon, IconInput, PasswordInput } from "../_components/auth-fields";
import { OrDivider, SwitchCard } from "../_components/auth-bits";

export function RegisterForm({ next, grades }: { next: string; grades: { id: string; name: string }[] }) {
  const [state, action] = useActionState(registerAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
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
        <Field label="كلمة المرور" htmlFor="password" error={fe.password} hint="٨ أحرف على الأقل" required>
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
              <Link href="/terms" target="_blank" className="font-bold text-brand-700 underline underline-offset-4">
                الشروط والأحكام
              </Link>{" "}
              و
              <Link href="/privacy" target="_blank" className="font-bold text-brand-700 underline underline-offset-4">
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
