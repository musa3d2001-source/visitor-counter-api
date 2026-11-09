import { Activity, BellRing, CalendarClock, ServerCrash } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { jobViews, opsConfig, type JobView } from "@/server/platform/ops-status";
import { listErrorEvents } from "@/server/platform/report-error";
import { JOB_LABELS, type JobName, type JobStatus } from "@/server/platform/scheduled-jobs";
import { AdminPageHeader, Section, StatGrid, StatTile } from "@/components/admin/page-header";
import { DataList, DataRow } from "@/components/admin/data-list";
import { ToneIcon } from "@/components/admin/icon-tile";
import { StatusPill, type StatusTone } from "@/components/admin/status-badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ar, count, type CountWord } from "@/lib/design";
import { formatDateTime } from "@/lib/utils";
import { PageBand } from "../_components/overview/bands";

export const metadata = { title: "صحة المنصة" };

const JOB_STATUS: Record<JobStatus, { label: string; tone: StatusTone }> = {
  ok: { label: "تعمل", tone: "success" },
  failed: { label: "فشلت آخر مرة", tone: "danger" },
  late: { label: "متأخرة عن موعدها", tone: "warning" },
  never: { label: "لم تعمل بعد", tone: "neutral" },
};

const TIMES: CountWord = { one: "مرة", two: "مرتان", plural: "مرات", acc: "مرة", oneSuffix: "واحدة" };

function JobFact({ label, at }: { label: string; at: Date | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.76rem] leading-5 text-muted">{label}</dt>
      <dd className="text-[0.84rem] leading-6 font-bold text-ink-soft">{at ? formatDateTime(at) : "لا يوجد بعد"}</dd>
    </div>
  );
}

function JobRow({ job }: { job: JobView }) {
  const label = JOB_LABELS[job.job as JobName];
  const status = JOB_STATUS[job.status];
  return (
    <DataRow
      leading={
        <ToneIcon tone={job.status === "ok" ? "green" : job.status === "never" ? "slate" : "coral"} size="sm">
          <CalendarClock />
        </ToneIcon>
      }
      title={label.title}
      sub={label.description}
      aside={
        <span data-testid="ops-job" data-job={job.job} data-status={job.status}>
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        </span>
      }
      footer={
        <>
          <dl className="grid grid-cols-1 gap-2 border-t border-[rgb(23_32_38/0.06)] pt-2.5 sm:grid-cols-3">
            <JobFact label="آخر بدء" at={job.last_started_at} />
            <JobFact label="آخر نجاح" at={job.last_success_at} />
            <JobFact label="آخر فشل" at={job.last_error_at} />
          </dl>
          {job.status === "failed" && job.last_error ? (
            <p className="mt-2 text-[0.82rem] leading-6 break-words text-danger">
              <bdi>{job.last_error}</bdi>
            </p>
          ) : null}
        </>
      }
    />
  );
}

/** صفحة المالك: هل تعمل الوظائف المجدولة وما الأخطاء التي سجلها الخادم. لا تعرض بيانات طالب أو رابط طلب أو سرًا */
export default async function OpsPage() {
  await requireOwnerPage();
  const config = opsConfig();
  const [jobs, errors] = await Promise.all([jobViews(), listErrorEvents()]);
  const okJobs = jobs.filter((job) => job.status === "ok").length;
  const dayAgo = Date.now() - 24 * 3600_000;
  const errorsToday = errors.filter((event) => event.last_seen_at.getTime() > dayAgo).length;

  return (
    <div className="space-y-6" data-testid="ops-page">
      <PageBand tone="coral" art="settings">
        <AdminPageHeader title="صحة المنصة" description="هل تعمل الوظائف المجدولة، وما الأخطاء التي سجلها الخادم." className="mb-0" />
      </PageBand>

      {config.cronConfigured ? null : (
        <Alert tone="danger" title="الوظائف المجدولة لا تعمل على هذا النشر" data-testid="ops-warning-cron">
          <p>CRON_SECRET غير مضبوط أو أقصر من ١٦ حرفًا، فتُرفض كل وظيفة مجدولة: لا تسوية للمدفوعات، ولا إغلاق للطلبات المنتهية، ولا تنظيف للبيانات القديمة.</p>
          <p>الموقع نفسه يعمل. للتفعيل أضف CRON_SECRET في بيئة Production على Vercel ثم أعد النشر.</p>
        </Alert>
      )}

      {config.alertEmailConfigured ? null : (
        <Alert tone="warning" title="لن تصلك رسالة عند حدوث مشكلة" data-testid="ops-warning-alert-email">
          <p>OPS_ALERT_EMAIL غير مضبوط. الأخطاء تُسجل في هذه الصفحة، ولا تصلك عنها رسالة. للتفعيل أضفه في بيئة Production على Vercel ثم أعد النشر.</p>
        </Alert>
      )}

      {config.alertEmailConfigured && !config.mailIsReal ? (
        <Alert tone="warning" title="رسائل التنبيه لا تخرج من المنصة" data-testid="ops-warning-mail">
          <p>البريد في وضع السجل الداخلي، فلا تصل رسائل التنبيه إلى أحد حتى يُفعَّل SMTP. التفاصيل في صفحة «البريد الصادر».</p>
        </Alert>
      ) : null}

      {config.liveWithDailyReconcile ? (
        <Alert tone="danger" title="الدفع الحقيقي مفعّل والتسوية مرة واحدة في اليوم" data-testid="ops-warning-reconcile">
          <p>الدفعة التي لا يصلنا إشعارها تنتظر حتى اليوم التالي. بعد الترقية إلى Vercel Pro غيّر جدول التسوية في vercel.json إلى كل ١٥ دقيقة، كما في README.</p>
        </Alert>
      ) : null}

      <StatGrid cols={3}>
        <StatTile label="وظائف تعمل كما يجب" tone={okJobs === jobs.length ? "green" : "gold"} icon={<CalendarClock />} value={<span className="num">{`${ar(okJobs)} من ${ar(jobs.length)}`}</span>} />
        <StatTile label="أخطاء ظهرت آخر ٢٤ ساعة" tone={errorsToday > 0 ? "coral" : "green"} icon={<ServerCrash />} value={<span className="num">{ar(errorsToday)}</span>} />
        <StatTile label="رسائل التنبيه" tone={config.alertEmailConfigured && config.mailIsReal ? "green" : "gold"} icon={<BellRing />} value={<span className="text-[1.05rem] sm:text-[1.15rem]">{config.alertEmailConfigured && config.mailIsReal ? "مفعّلة" : "غير مفعّلة"}</span>} />
      </StatGrid>

      <Section title="الوظائف المجدولة" description="كل وظيفة تسجل هنا آخر مرة بدأت ونجحت وفشلت. الموعد اليومي قد يتأخر حتى ساعة." icon={<CalendarClock />} tone="sky">
        <DataList>
          {jobs.map((job) => (
            <JobRow key={job.job} job={job} />
          ))}
        </DataList>
      </Section>

      <Section title="الأخطاء المسجلة" description="أحدث ١٠٠ خطأ مختلف، والخطأ المتكرر صف واحد مع عدد مراته. تُنقّى قبل الحفظ من البريد والأرقام والروابط والرموز." icon={<ServerCrash />} tone="coral">
        {errors.length === 0 ? (
          <EmptyState art="generic" compact title="لا توجد أخطاء مسجلة." />
        ) : (
          <DataList>
            {errors.map((event) => (
              <DataRow
                key={event.id}
                leading={
                  <ToneIcon tone="coral" size="sm">
                    <ServerCrash />
                  </ToneIcon>
                }
                title={
                  <bdi dir="auto" className="break-words" data-testid="ops-error">
                    {event.message}
                  </bdi>
                }
                sub={
                  <>
                    <bdi dir="ltr" className="break-all">
                      {event.route ?? event.source}
                    </bdi>{" "}
                    · <span className="whitespace-nowrap">آخر ظهور {formatDateTime(event.last_seen_at)}</span>
                  </>
                }
                aside={<StatusPill tone="neutral">{count(event.occurrences, TIMES)}</StatusPill>}
                footer={
                  <details className="text-[0.82rem] leading-6 text-ink-soft">
                    <summary className="flex min-h-11 cursor-pointer items-center font-bold text-brand-700">تفاصيل للمطور</summary>
                    <p className="break-words">
                      <bdi dir="auto">{event.message}</bdi>
                    </p>
                    <p>
                      أول ظهور: <span className="whitespace-nowrap">{formatDateTime(event.first_seen_at)}</span>
                    </p>
                    <p>
                      المصدر: <bdi dir="ltr">{event.source}</bdi>
                    </p>
                    {event.digest ? (
                      <p>
                        الرمز: <bdi dir="ltr">{event.digest}</bdi>
                      </p>
                    ) : null}
                    {event.stack ? (
                      <pre className="mt-1 overflow-x-auto rounded-xl bg-sand p-3 text-[0.76rem] leading-5 break-all whitespace-pre-wrap" dir="ltr">
                        {event.stack}
                      </pre>
                    ) : null}
                  </details>
                }
              />
            ))}
          </DataList>
        )}
      </Section>

      <Alert tone="info" title="ما لا تكشفه هذه الصفحة">
        <p>
          إذا توقف الموقع أو قاعدة البيانات كليًا فلن يُسجَّل شيء ولن تصل رسالة. لتعرف ذلك اربط خدمة مراقبة خارجية برابط <bdi dir="ltr">/api/health</bdi>، وهو يجيب بالعمل أو التوقف فقط.
        </p>
      </Alert>
    </div>
  );
}
