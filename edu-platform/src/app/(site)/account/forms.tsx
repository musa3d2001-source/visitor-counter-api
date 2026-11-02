"use client";

import { useActionState } from "react";
import { changePasswordAction, updateProfileAction } from "./actions";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";

export function ProfileForm({ user, grades }: { user: { fullName: string; phone: string | null; gradeId: string | null }; grades: { id: string; name: string }[] }) {
  const [state, action] = useActionState(updateProfileAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}
      <Field label="الاسم" htmlFor="fullName" error={fe.fullName}>
        <Input id="fullName" name="fullName" defaultValue={user.fullName} required />
      </Field>
      <Field label="رقم الهاتف" htmlFor="phone" error={fe.phone} hint="اختياري، رقم كويتي">
        <Input id="phone" name="phone" type="tel" dir="ltr" defaultValue={user.phone?.replace("+965", "") ?? ""} />
      </Field>
      <Field label="الصف الدراسي" htmlFor="gradeId">
        <Select id="gradeId" name="gradeId" defaultValue={user.gradeId ?? ""}>
          <option value="">غير محدد</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton className="w-fit">حفظ</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="كلمة المرور الحالية" htmlFor="currentPassword" error={fe.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" dir="ltr" autoComplete="current-password" required />
      </Field>
      <Field label="كلمة المرور الجديدة" htmlFor="newPassword" error={fe.newPassword}>
        <Input id="newPassword" name="newPassword" type="password" dir="ltr" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="تأكيد كلمة المرور الجديدة" htmlFor="confirmPassword" error={fe.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" dir="ltr" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-fit">تغيير كلمة المرور</SubmitButton>
    </form>
  );
}
