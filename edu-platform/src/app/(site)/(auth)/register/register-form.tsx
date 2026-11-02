"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "../actions";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";

export function RegisterForm({ next, grades }: { next: string; grades: { id: string; name: string }[] }) {
  const [state, action] = useActionState(registerAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="الاسم" htmlFor="fullName" error={fe.fullName} required>
        <Input id="fullName" name="fullName" autoComplete="name" required defaultValue={state?.values?.fullName} aria-invalid={Boolean(fe.fullName)} />
      </Field>
      <Field label="البريد الإلكتروني" htmlFor="email" error={fe.email} required>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" dir="ltr" required defaultValue={state?.values?.email} aria-invalid={Boolean(fe.email)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="كلمة المرور" htmlFor="password" error={fe.password} hint="8 أحرف على الأقل" required>
          <Input id="password" name="password" type="password" autoComplete="new-password" dir="ltr" required minLength={8} aria-invalid={Boolean(fe.password)} />
        </Field>
        <Field label="تأكيد كلمة المرور" htmlFor="passwordConfirm" error={fe.passwordConfirm} required>
          <Input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" dir="ltr" required aria-invalid={Boolean(fe.passwordConfirm)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="رقم الهاتف (اختياري)" htmlFor="phone" error={fe.phone} hint="رقم كويتي من 8 أرقام">
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" dir="ltr" placeholder="9XXXXXXX" defaultValue={state?.values?.phone} aria-invalid={Boolean(fe.phone)} />
        </Field>
        <Field label="صفك الدراسي (اختياري)" htmlFor="gradeId" error={fe.gradeId}>
          <Select id="gradeId" name="gradeId" defaultValue={state?.values?.gradeId ?? ""}>
            <option value="">اختر الصف</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div>
        <Checkbox
          name="terms"
          required
          label={
            <>
              أوافق على{" "}
              <Link href="/terms" target="_blank" className="font-semibold text-brand-700 underline">
                الشروط والأحكام
              </Link>{" "}
              و
              <Link href="/privacy" target="_blank" className="font-semibold text-brand-700 underline">
                سياسة الخصوصية
              </Link>
            </>
          }
        />
        {fe.terms ? <p className="mt-1 text-sm text-danger" role="alert">{fe.terms}</p> : null}
      </div>
      <SubmitButton size="lg" pendingText="جارٍ إنشاء الحساب…">إنشاء الحساب</SubmitButton>
      <p className="text-center text-sm text-muted">
        لديك حساب؟{" "}
        <Link href={`/login${next !== "/library" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">
          سجّل الدخول
        </Link>
      </p>
    </form>
  );
}
