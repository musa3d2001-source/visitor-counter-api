import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/site/auth-card";
import { Alert } from "@/components/ui/alert";
import { ContactLinks, realContactLinks } from "@/components/site/payment-unavailable-notice";
import { requireUser } from "@/server/auth/guards";
import { verificationState } from "@/server/auth/email-verification";
import { getSettings } from "@/server/platform/settings";
import { safeNextPath } from "@/lib/utils";
import { CorrectEmailForm, ResendForm } from "./verify-forms";

export const metadata: Metadata = { title: "تأكيد البريد الإلكتروني", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/checkout");
  const user = await requireUser(`/verify-email?next=${encodeURIComponent(next)}`);
  const state = await verificationState(user.id);
  // لا شيء مطلوب: البريد غير مفعّل على النشر، أو مؤكد، أو للحساب طلب مدفوع سابق
  if (!state.required) redirect(next);
  const settings = await getSettings();
  const target = state.pendingEmail ?? state.email;

  return (
    <AuthCard title="أكّد بريدك قبل الدفع" subtitle="إيصالاتك وروابط استعادة حسابك تصل إلى هذا البريد، فنتأكد أولًا أنه يصلك">
      <div className="flex flex-col gap-5" data-testid="verify-email-page">
        <Alert tone="info" title={state.linkSent ? "افتح رسالة التأكيد" : "لم يصلك رابط بعد"}>
          <p>
            {state.linkSent ? "أرسلنا رابطًا إلى " : "اطلب رابطًا يصلك على "}
            <bdi dir="ltr" className="font-bold break-all" data-testid="verify-target">
              {target}
            </bdi>
            {state.linkSent ? ". افتحه واضغط «تأكيد البريد»، ثم عد لإكمال الشراء. يعمل الرابط ٢٤ ساعة." : ". الروابط صالحة ٢٤ ساعة."}
          </p>
          {state.pendingEmail ? <p>يبقى بريد حسابك {state.email} حتى تفتح الرابط من العنوان الجديد.</p> : null}
        </Alert>
        <ResendForm first={!state.linkSent} toAccountAddress={state.pendingEmail ? state.email : null} />
        <CorrectEmailForm />
        <div className="text-[0.92rem] leading-7 text-ink-soft">
          <p>لا تجد الرسالة؟ افحص مجلد الرسائل غير المرغوب فيها، أو اطلب رابطًا جديدًا بعد دقيقة.</p>
          {realContactLinks(settings).length ? (
            <div className="mt-2">
              <ContactLinks settings={settings} testId="verify-contacts" />
            </div>
          ) : null}
        </div>
      </div>
    </AuthCard>
  );
}
