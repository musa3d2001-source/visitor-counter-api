import Link from "next/link";
import { CircleCheck, Clock3, KeyRound, ShieldCheck, ShieldOff, TriangleAlert } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { getTwoFactorStatus } from "@/server/auth/two-factor";
import { RECOVERY_CODE_COUNT } from "@/server/auth/two-factor-core";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { StatusPill } from "@/components/admin/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ar, count, W } from "@/lib/design";
import { STEP_UP_CONFIRM_FIELD, TWO_FACTOR_SETUP_PATH } from "@/lib/two-factor";
import { formatDateTime } from "@/lib/utils";
import { PageBand } from "../_components/overview/bands";
import { disableTwoFactorAction } from "./actions";
import { RecoveryCodesForm } from "./_components/recovery-codes-form";

export const metadata = { title: "أمان الحساب" };

const LOW_RECOVERY_CODES = 3;

export default async function AdminSecurityPage() {
  const owner = await requireOwnerPage();
  const status = await getTwoFactorStatus(owner.userId);

  return (
    <div className="space-y-6">
      <PageBand tone="teal" art="settings">
        <AdminPageHeader
          title="أمان الحساب"
          description="التحقق بخطوتين يحمي لوحة التحكم وعمليات الاسترداد حتى لو عرف أحد كلمة مرورك."
          className="mb-0"
        />
      </PageBand>

      <Section
        title="التحقق بخطوتين"
        icon={<ShieldCheck />}
        tone="teal"
        actions={
          status.enabled ? (
            <StatusPill tone="success" icon={<CircleCheck aria-hidden />}>
              مفعّل
            </StatusPill>
          ) : (
            <StatusPill tone="warning" icon={<TriangleAlert aria-hidden />}>
              غير مفعّل
            </StatusPill>
          )
        }
      >
        <div data-testid="two-factor-status" data-enabled={status.enabled}>
          {status.enabled ? (
            <div className="space-y-4">
              <p className="text-[0.98rem] leading-8 text-ink-soft">
                {status.enabledAt ? <>مفعّل منذ {formatDateTime(status.enabledAt)}. </> : null}
                يُطلب الرمز عند كل دخول وعند كل أمر استرداد يخرج مالًا.
              </p>
              <div className="border-t border-dashed border-line-strong pt-4">
                <ConfirmButton
                  action={disableTwoFactorAction}
                  label="إيقاف التحقق بخطوتين"
                  icon={<ShieldOff aria-hidden />}
                  title="إيقاف التحقق بخطوتين؟"
                  description={
                    status.required
                      ? "التحقق إلزامي في هذا النشر، فستنتقل مباشرة لتسجيله من جديد بجوالك الجديد. تنتهي كل جلسة أخرى وتبطل رموز الاسترداد الحالية."
                      : "ستكفي كلمة المرور وحدها للدخول، وتخرج أوامر الاسترداد بلا رمز. تنتهي كل جلسة أخرى وتبطل رموز الاسترداد الحالية."
                  }
                  fields={[STEP_UP_CONFIRM_FIELD]}
                  confirmLabel="إيقاف"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert tone="warning" title="كلمة المرور وحدها تكفي للدخول إلى حسابك الآن">
                التحقق بخطوتين غير إلزامي في هذا النشر، ولم تفعّله على حسابك، فأوامر الاسترداد تخرج بلا رمز تحقق.
              </Alert>
              <Button asChild>
                <Link href={TWO_FACTOR_SETUP_PATH}>
                  <ShieldCheck aria-hidden /> تفعيل التحقق بخطوتين
                </Link>
              </Button>
            </div>
          )}
        </div>
      </Section>

      {status.enabled ? (
        <Section title="رموز الاسترداد" description="تستخدم بدل الرمز من التطبيق إن ضاع جوالك. كل رمز يعمل مرة واحدة." icon={<KeyRound />} tone="gold">
          <p className="mb-4 text-[0.98rem] leading-8 text-ink-soft" data-testid="recovery-remaining">
            المتبقي: <strong className="font-display text-ink">{status.recoveryRemaining === 0 ? "لا يوجد" : ar(status.recoveryRemaining)}</strong> من {ar(RECOVERY_CODE_COUNT)}.
          </p>
          {status.recoveryRemaining <= LOW_RECOVERY_CODES ? (
            <Alert tone="warning" className="mb-4">
              بقي عدد قليل من الرموز. أصدر رموزًا جديدة واحفظها، فبدونها وبدون جوالك لا يعود الدخول إلا بأمر من الخادم.
            </Alert>
          ) : null}
          <RecoveryCodesForm />
        </Section>
      ) : null}

      <Section title="مدة الجلسة" icon={<Clock3 />} tone="sky">
        <p className="text-[0.98rem] leading-8 text-ink-soft">تنتهي جلسة لوحة التحكم بعد {count(12, W.hour)} من الدخول، ثم يُطلب الدخول من جديد.</p>
      </Section>
    </div>
  );
}
