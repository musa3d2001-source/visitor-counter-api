"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Eraser, TriangleAlert } from "lucide-react";
import { anonymizeStudentAction } from "../actions";
import { usePreservingAction } from "@/components/admin/use-preserving-action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ANONYMIZATION_BLOCKER_LABELS, type AnonymizationBlocker } from "@/lib/anonymize";

const DELETED = [
  "الاسم والبريد والهاتف والصف وكلمة المرور، وتحل محلها قيم لا تدل على أحد ولا يمكن الدخول بها.",
  "كل جلسات الدخول وروابط الاستعادة، فيخرج الطالب من كل الأجهزة.",
  "تقدم القراءة والدروس وسجل الوصول للمحتوى وسجل الرسائل المرسلة إليه.",
  "عناوين IP وبيانات الجهاز المحفوظة مع موافقاته، وبيانات العميل في ردود بوابة الدفع المحفوظة لدينا.",
  "صلاحيات المكتبة: تُسحب لأن الحساب لن يُفتح مرة أخرى.",
];

const KEPT = [
  { title: "الطلبات والمدفوعات والفواتير والاستردادات واستخدام الكوبونات", why: "نحتفظ بها لأنها سجلات مالية، وتبقى بلا اسم أو بريد أو هاتف. ما يلزم حفظه ومدته ما زالا بانتظار رأي المحامي." },
  { title: "سجل الموافقات", why: "يثبت نوع الموافقة ونسختها ووقتها وطلبها، بلا عنوان IP ولا بيانات جهاز." },
  { title: "سجل التدقيق وأرباح المعلمين", why: "لتبقى قرارات الإدارة والحسابات قابلة للمراجعة." },
];

export function StudentAnonymize({ userId, email, blockers }: { userId: string; email: string; blockers: AnonymizationBlocker[] }) {
  const { state, formAction, formRef } = usePreservingAction(anonymizeStudentAction);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-[1.5rem] border border-line bg-surface p-4 shadow-xs sm:p-5">
          <h3 className="font-display text-[1.05rem] font-black text-ink">ما يُحذف</h3>
          <ul className="mt-2 list-disc space-y-1.5 ps-5 text-[0.92rem] leading-7 text-ink-soft" data-testid="anonymize-deleted-list">
            {DELETED.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 rounded-[1.5rem] border border-line bg-surface p-4 shadow-xs sm:p-5">
          <h3 className="font-display text-[1.05rem] font-black text-ink">ما يبقى ولماذا</h3>
          <ul className="mt-2 space-y-2 text-[0.92rem] leading-7 text-ink-soft" data-testid="anonymize-kept-list">
            {KEPT.map((k) => (
              <li key={k.title}>
                <span className="font-bold text-ink">{k.title}:</span> {k.why}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Alert tone="warning" title="حدود هذا الإجراء">
        لا يمكن التراجع عنه. ما أُرسل إلى ماي فاتورة من اسم وبريد وهاتف يبقى في سجلاتها ولا نستطيع حذفه من هنا. ونسخ قاعدة البيانات الاحتياطية تبقى كما هي حتى تنتهي مدتها. وما كتبته الإدارة في أسباب الإجراءات يبقى بعد إزالة الاسم والبريد والهاتف إن وردت بنصها، أما أي تفاصيل أخرى عن الطالب فلا تُزال تلقائيًا.
      </Alert>

      {blockers.length ? (
        <div data-testid="anonymize-blockers">
          <Alert tone="danger" title="لا يمكن الحذف الآن">
            <ul className="list-disc space-y-1 ps-5">
              {blockers.map((b, i) => (
                <li key={`${b.kind}-${b.orderNumber}-${i}`}>
                  {ANONYMIZATION_BLOCKER_LABELS[b.kind]}:{" "}
                  <Link href={`/admin/orders/${b.orderId}`} className="num inline-flex min-h-11 items-center font-bold underline underline-offset-4">
                    <bdi>{b.orderNumber}</bdi>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2">احسم الاسترداد والدفعة الزائدة والتنبيه من صفحة الطلب. الطلب المفتوح يُغلق حين يلغيه الطالب، أو عند الفحص الدوري للطلبات بعد مرور ٧٢ ساعة على إنشائه.</p>
          </Alert>
        </div>
      ) : !confirming ? (
        <Button type="button" variant="danger-outline" size="md" onClick={() => setConfirming(true)} data-testid="anonymize-start">
          <Eraser aria-hidden /> حذف بيانات الطالب
        </Button>
      ) : (
        <form ref={formRef} action={formAction} className="min-w-0 rounded-[1.5rem] border-2 border-danger/40 bg-danger-50 p-4 sm:p-5" data-testid="anonymize-form">
          <input type="hidden" name="userId" value={userId} />
          <h3 className="mb-3 flex items-center gap-2 font-display text-[1.05rem] font-black text-danger">
            <TriangleAlert className="size-5 shrink-0" aria-hidden /> الخطوة الأخيرة
          </h3>
          <div className="grid gap-3">
            <Field label="اكتب بريد الطالب للتأكيد" htmlFor="anonymize-confirm-email" required error={state?.fieldErrors?.confirmEmail}>
              <p className="mb-2 text-[0.88rem] leading-6 text-ink-soft">
                البريد: <bdi dir="ltr" className="font-bold break-all">{email}</bdi>
              </p>
              <Input id="anonymize-confirm-email" name="confirmEmail" type="email" dir="ltr" autoComplete="off" required value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="anonymize-confirm-email" />
            </Field>
            <Field label="السبب (إلزامي)" htmlFor="anonymize-reason" required hint="مثال: طلب ولي الأمر حذف الحساب. لا تكتب هنا بيانات الطالب.">
              <Textarea id="anonymize-reason" name="reason" rows={2} minLength={3} maxLength={500} required data-testid="anonymize-reason" />
            </Field>
          </div>
          {state?.error ? (
            <Alert tone="danger" className="mt-3">
              {state.error}
            </Alert>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <SubmitButton size="md" variant="danger" disabled={!matches} pendingText="جارٍ الحذف…" data-testid="anonymize-submit">
              حذف البيانات نهائيًا
            </SubmitButton>
            <Button type="button" variant="ghost" size="md" onClick={() => setConfirming(false)}>
              <ArrowRight aria-hidden /> رجوع
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
