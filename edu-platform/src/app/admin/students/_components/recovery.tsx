"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, EyeOff, KeyRound, Mail } from "lucide-react";
import { correctStudentEmailAction, resetStudentPasswordAction } from "../actions";
import type { ActionState } from "@/lib/action-state";
import { ActionForm } from "@/components/admin/action-form";
import { ToneIcon } from "@/components/admin/icon-tile";
import { usePreservingAction } from "@/components/admin/use-preserving-action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

function CardTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-2.5 font-display text-[1.1rem] font-black text-ink">
      <ToneIcon tone="gold" size="sm">
        {icon}
      </ToneIcon>
      {children}
    </h3>
  );
}

function SecretRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1.5 font-display text-[0.9rem] font-black text-[#6e4700]">{label}</p>
      <code className="num block rounded-xl bg-white px-3 py-2.5 text-center font-mono text-[0.95rem] font-bold break-all text-ink shadow-xs ring-1 ring-[#F0C766]/60" dir="ltr" data-testid={testId}>
        {value}
      </code>
      <Button
        type="button"
        size="sm"
        variant={copied ? "soft" : "outline"}
        className="mt-2"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "تم النسخ" : "نسخ"}
      </Button>
    </div>
  );
}

/** الأسرار تعيش في حالة React فقط، وتبقى ظاهرة حتى يضغط المالك «تم» */
export function StudentPasswordReset({ userId }: { userId: string }) {
  const router = useRouter();
  const { state, formAction, formRef } = usePreservingAction(resetStudentPasswordAction);
  // router.refresh لا يمسح حالة React، فنخفي هذه النتيجة بعينها ويبقى إصدار جديد ممكنًا
  const [dismissed, setDismissed] = useState<ActionState>(null);
  const secrets = state?.ok && state !== dismissed ? state.secrets : undefined;

  if (secrets) {
    return (
      <div className="min-w-0 space-y-3 rounded-[1.5rem] border-2 border-dashed border-[#F0C766] bg-[linear-gradient(160deg,#fffaf0,#fff1cf)] p-4 sm:p-5" data-testid="student-reset-secrets">
        <Alert tone="success">{state?.message}</Alert>
        <SecretRow label="رابط تعيين كلمة مرور جديدة" value={secrets.link} testId="student-reset-link" />
        <SecretRow label="أو كلمة مرور مؤقتة" value={secrets.temporaryPassword} testId="student-temp-password" />
        <p className="flex items-start gap-1.5 text-[0.85rem] leading-6 text-[#6e4700]">
          <EyeOff className="mt-1 size-3.5 shrink-0" aria-hidden />
          يظهران مرة واحدة فقط. أرسل أحدهما للطالب: كلاهما يعمل مرة واحدة خلال ٢٤ ساعة، واستخدام أحدهما يلغي الآخر.
        </p>
        <Button
          type="button"
          size="md"
          className="w-full"
          onClick={() => {
            setDismissed(state);
            router.refresh();
          }}
        >
          تم، متابعة
        </Button>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="min-w-0 rounded-[1.5rem] border border-line bg-surface p-4 shadow-xs sm:p-5" data-testid="student-reset-form">
      <input type="hidden" name="userId" value={userId} />
      <CardTitle icon={<KeyRound />}>إعادة تعيين كلمة المرور</CardTitle>
      <p className="mb-4 text-[0.9rem] leading-7 text-ink-soft">تتوقف كلمته الحالية عن العمل ويُسجَّل خروجه من كل الأجهزة. ستحصل على رابط وكلمة مؤقتة، ترسل أحدهما إليه بالهاتف أو واتساب.</p>
      <Field label="السبب (إلزامي)" htmlFor="reset-reason" required hint="مثال: طلب ولي الأمر عبر واتساب بعد التحقق من رقم الهاتف">
        <Textarea id="reset-reason" name="reason" rows={2} minLength={3} maxLength={500} required />
      </Field>
      <SubmitButton size="md" variant="accent" className="mt-4" pendingText="جارٍ الإصدار…">
        إصدار رابط وكلمة مؤقتة
      </SubmitButton>
      {state?.error ? (
        <Alert tone="danger" className="mt-3">
          {state.error}
        </Alert>
      ) : null}
    </form>
  );
}

export function StudentEmailCorrection({ userId, currentEmail }: { userId: string; currentEmail: string }) {
  return (
    <ActionForm action={correctStudentEmailAction} resetOnSuccess className="min-w-0 rounded-[1.5rem] border border-line bg-surface p-4 shadow-xs sm:p-5">
      {(state) => (
        <div className="grid gap-3">
          <input type="hidden" name="userId" value={userId} />
          <div>
            <CardTitle icon={<Mail />}>تصحيح البريد الإلكتروني</CardTitle>
            <p className="text-[0.9rem] leading-7 text-ink-soft">
              البريد الحالي: <bdi dir="ltr" className="font-bold break-all">{currentEmail}</bdi>. يصبح البريد الجديد غير مؤكد حتى يفتح الطالب رابط التأكيد.
            </p>
          </div>
          <Field label="البريد الصحيح" htmlFor="correct-email" required error={state?.fieldErrors?.email}>
            <Input id="correct-email" name="email" type="email" dir="ltr" autoComplete="off" required />
          </Field>
          <Field label="السبب (إلزامي)" htmlFor="correct-reason" required>
            <Textarea id="correct-reason" name="reason" rows={2} minLength={3} maxLength={500} required />
          </Field>
          <div>
            <SubmitButton size="md" variant="outline" pendingText="جارٍ الحفظ…">
              حفظ البريد الصحيح
            </SubmitButton>
          </div>
        </div>
      )}
    </ActionForm>
  );
}
