import { CalendarClock, MailCheck, MailWarning, Send } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { lastMailSentAt, listMailFailures, mailHealth } from "@/server/platform/mail-status";
import { env } from "@/server/env";
import { AdminPageHeader, Section, StatGrid, StatTile } from "@/components/admin/page-header";
import { DataList, DataRow } from "@/components/admin/data-list";
import { ToneIcon } from "@/components/admin/icon-tile";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ar } from "@/lib/design";
import { EMAIL_TEMPLATE_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { PageBand } from "../_components/overview/bands";

export const metadata = { title: "البريد الصادر" };

/** صفحة المالك: هل تخرج رسائل المنصة، وما الذي تعذر إرساله. لا تعرض نص أي رسالة ولا أي رابط */
export default async function MailPage() {
  await requireOwnerPage();
  const [health, failures, lastSent] = await Promise.all([mailHealth(), listMailFailures(), lastMailSentAt()]);
  const real = health.driver === "smtp";

  return (
    <div className="space-y-6" data-testid="mail-page">
      <PageBand tone="sky" art="settings">
        <AdminPageHeader title="البريد الصادر" description="هل تصل رسائل المنصة إلى أصحابها، وما الذي تعذر إرساله." className="mb-0" />
      </PageBand>

      {real ? null : (
        <Alert tone="warning" title="البريد غير مفعّل على هذا النشر">
          <p>تُسجَّل الرسائل داخل المنصة ولا تصل إلى أحد: لا روابط استعادة ولا إيصالات ولا تأكيد بريد.</p>
          <p>إلى أن يُفعَّل، تعيد كلمة مرور الطالب من صفحته في «الطلاب». للتفعيل اضبط MAIL_DRIVER=smtp و SMTP_HOST و MAIL_FROM في بيئة النشر.</p>
        </Alert>
      )}

      <StatGrid cols={3}>
        <StatTile label="طريقة الإرسال" tone={real ? "green" : "gold"} icon={real ? <MailCheck /> : <MailWarning />} value={<span>{real ? "SMTP" : "سجل داخلي"}</span>} hint={real ? <bdi dir="ltr">{env().MAIL_FROM}</bdi> : "لا تصل أي رسالة إلى أحد"} />
        <StatTile label={`تعذر إرسالها (آخر ${ar(health.recentDays)} أيام)`} tone={health.failedRecently ? "coral" : "green"} icon={<Send />} value={<span className="num">{ar(health.failedRecently)}</span>} />
        <StatTile label="آخر إرسال ناجح" tone="sky" icon={<CalendarClock />} value={<span className="text-[1.05rem] sm:text-[1.15rem]">{lastSent ? formatDateTime(lastSent) : "لا يوجد بعد"}</span>} />
      </StatGrid>

      <Section title="رسائل تعذر إرسالها" description="أحدث ١٠٠ رسالة: المستلم ونوع الرسالة وسبب الفشل فقط، بلا نص الرسالة وبلا روابط." icon={<MailWarning />} tone="coral">
        {failures.length === 0 ? (
          <EmptyState art="generic" compact title="لا توجد رسائل فاشلة." />
        ) : (
          <DataList>
            {failures.map((f) => (
              <DataRow
                key={f.id}
                leading={
                  <ToneIcon tone="coral" size="sm">
                    <MailWarning />
                  </ToneIcon>
                }
                title={<bdi dir="ltr">{f.to_email}</bdi>}
                sub={
                  <>
                    {EMAIL_TEMPLATE_LABELS[f.template] ?? f.template} · <span className="whitespace-nowrap">{formatDateTime(f.created_at)}</span>
                  </>
                }
                footer={f.error ? <code className="block text-[0.8rem] leading-6 break-all text-ink-soft" dir="ltr">{f.error}</code> : undefined}
              />
            ))}
          </DataList>
        )}
      </Section>
    </div>
  );
}
