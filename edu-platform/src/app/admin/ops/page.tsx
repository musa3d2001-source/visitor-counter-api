import Link from "next/link";
import { BellRing, CalendarClock, CircleDollarSign, RefreshCw, Send, ServerCrash, Video } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { alertDelivery, heldVideoLessons, jobViews, lastAlertSendFailed, opsConfig, paidRawVideoCount, type AlertDelivery, type JobView } from "@/server/platform/ops-status";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { reconcileNowAction, sendTestAlertAction } from "./actions";
import { paymentsConfig } from "@/server/payments/service";
import { unhealedOrders, type PaidNotGrantedReason, type UnhealedRow } from "@/server/payments/unhealed";
import { listErrorEvents } from "@/server/platform/report-error";
import { JOB_LABELS, runOpsWatchdogAfterResponse, type JobName, type JobStatus } from "@/server/platform/scheduled-jobs";
import { AdminPageHeader, Section, StatGrid, StatTile } from "@/components/admin/page-header";
import { DataList, DataRow } from "@/components/admin/data-list";
import { ToneIcon } from "@/components/admin/icon-tile";
import { StatusPill, type StatusTone } from "@/components/admin/status-badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ar, count, type CountWord } from "@/lib/design";
import { formatDateTime } from "@/lib/utils";
import { filsToKwdString } from "@/lib/money";
import { PageBand } from "../_components/overview/bands";

export const metadata = { title: "صحة المنصة" };

/** زر «افحص الآن» يعمل حتى ٤٠ ثانية داخل طلب هذه الصفحة */
export const maxDuration = 60;

const REASON_TEXT: Record<PaidNotGrantedReason, string> = {
  payment_not_applied: "دفعة مؤكدة لم تكمل طلبها",
  needs_decision: "دفعة تنتظر قرارك",
  no_access: "طلب مدفوع ينقصه وصول",
};

const MINUTES: CountWord = { one: "دقيقة", two: "دقيقتان", plural: "دقائق", acc: "دقيقة", oneSuffix: "واحدة" };
const HOURS: CountWord = { one: "ساعة", two: "ساعتان", plural: "ساعات", acc: "ساعة", oneSuffix: "واحدة" };
const DAYS: CountWord = { one: "يوم", two: "يومان", plural: "أيام", acc: "يومًا", oneSuffix: "واحد" };
const PRODUCTS: CountWord = { one: "منتج", two: "منتجان", plural: "منتجات", acc: "منتجًا", oneSuffix: "واحد" };

function ageText(since: Date, now: number) {
  const minutes = Math.max(1, Math.floor((now - since.getTime()) / 60_000));
  if (minutes < 60) return count(minutes, MINUTES);
  if (minutes < 24 * 60) return count(Math.floor(minutes / 60), HOURS);
  return count(Math.floor(minutes / (24 * 60)), DAYS);
}

function UnhealedLine({ row, label, tone, now }: { row: UnhealedRow; label: string; tone: StatusTone; now: number }) {
  return (
    <DataRow
      leading={
        <ToneIcon tone={tone === "danger" ? "coral" : "gold"} size="sm">
          <CircleDollarSign />
        </ToneIcon>
      }
      title={
        <Link href={`/admin/orders/${row.order_id}`} className="num text-brand-700 hover:underline">
          {row.order_number}
        </Link>
      }
      sub={
        <>
          <span className="num">{filsToKwdString(row.amount_fils)}</span> د.ك · العمر: {ageText(row.since, now)}
          {row.is_test ? " · تجريبي" : ""}
        </>
      }
      aside={
        <span data-testid="ops-unhealed" data-order={row.order_id}>
          <StatusPill tone={tone}>{label}</StatusPill>
        </span>
      }
    />
  );
}

const JOB_STATUS: Record<JobStatus, { label: string; tone: StatusTone }> = {
  ok: { label: "تعمل", tone: "success" },
  failed: { label: "فشلت آخر مرة", tone: "danger" },
  late: { label: "متأخرة عن موعدها", tone: "warning" },
  never: { label: "لم تعمل بعد", tone: "neutral" },
};

const DELIVERY_TEXT: Record<AlertDelivery, string> = {
  sent: "قبل خادم البريد آخر رسالة إلى بريد التنبيهات.",
  failed: "آخر رسالة إلى بريد التنبيهات لم تخرج.",
  logged: "آخر رسالة إلى بريد التنبيهات سُجلت هنا ولم تخرج، لأن البريد في وضع السجل الداخلي.",
  none: "لم تخرج بعد أي رسالة إلى بريد التنبيهات.",
};

const TIMES: CountWord ={ one: "مرة", two: "مرتان", plural: "مرات", acc: "مرة", oneSuffix: "واحدة" };

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
  await runOpsWatchdogAfterResponse();
  const config = opsConfig();
  const paymentsOn = paymentsConfig().enabled;
  const [jobs, errors, alertFailed, delivery, unhealed, heldVideos, paidRawVideo] = await Promise.all([jobViews(), listErrorEvents(), lastAlertSendFailed(), alertDelivery(), unhealedOrders(), heldVideoLessons(), paidRawVideoCount()]);
  const now = Date.now();
  const alertsWork = config.alertEmailConfigured && config.mailIsReal && !alertFailed;
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

      {alertFailed ? (
        <Alert tone="danger" title="آخر رسالة تنبيه لم تخرج" data-testid="ops-warning-alert-failed">
          <p>رفضها خادم البريد أو لم يرد. لم يضع الحدث: تُعاد المحاولة في أول فحص بعد نصف ساعة. السبب في صفحة «البريد الصادر»، فتأكد من إعدادات SMTP في Vercel.</p>
        </Alert>
      ) : null}

      {config.liveWithDailyReconcile ? (
        <Alert tone="danger" title="الدفع الحقيقي مفعّل والتسوية مرة واحدة في اليوم" data-testid="ops-warning-reconcile">
          <p>الدفعة التي لا يصلنا إشعارها تُطبق حين يعود صاحبها إلى الموقع، ومن لا يعود ينتظر حتى اليوم التالي. بعد الترقية إلى Vercel Pro غيّر جدول التسوية في vercel.json إلى كل ١٠ دقائق، كما في README.</p>
        </Alert>
      ) : null}

      {config.unreadableVariables.length ? (
        <Alert tone="warning" title="قيمة متغير لم تُقرأ فسرت القيمة الافتراضية" data-testid="ops-warning-env">
          <p>
            <span dir="ltr">{config.unreadableVariables.join("، ")}</span>
            {": القيمة المضبوطة ليست رقمًا ضمن المدى المسموح، فيعمل الموقع بالقيمة الافتراضية. صحّحها أو احذفها في بيئة Production على Vercel ثم أعد النشر."}
          </p>
        </Alert>
      ) : null}

      {paidRawVideo > 0 ? (
        <Alert tone="danger" title="فيديو مدفوع بلا مزود بث" data-testid="ops-warning-raw-video">
          <p>
            {count(paidRawVideo, PRODUCTS)} يُباع وفيديوه ملف خام أو بلا مفاتيح Bunny. الملف الخام يمكن تنزيله، ولا جودات متعددة له، ولا يستكمل رفعه إن انقطع، فهو ليس لإطلاق مدفوع. انقل الدروس إلى Bunny Stream، أو أخفِ المنتج حتى تنتقل.
          </p>
        </Alert>
      ) : null}

      <StatGrid cols={3}>
        <StatTile label="وظائف تعمل كما يجب" tone={okJobs === jobs.length ? "green" : "gold"} icon={<CalendarClock />} value={<span className="num">{`${ar(okJobs)} من ${ar(jobs.length)}`}</span>} />
        <StatTile label="أخطاء ظهرت آخر ٢٤ ساعة" tone={errorsToday > 0 ? "coral" : "green"} icon={<ServerCrash />} value={<span className="num">{ar(errorsToday)}</span>} />
        <StatTile label="رسائل التنبيه" tone={alertsWork ? "green" : alertFailed ? "coral" : "gold"} icon={<BellRing />} value={<span className="text-[1.05rem] sm:text-[1.15rem]">{alertsWork ? "مفعّلة" : alertFailed ? "آخرها لم يخرج" : "غير مفعّلة"}</span>} />
      </StatGrid>

      {heldVideos.length ? (
        <Section id="video-held" title="دروس ينتظر فيديوها قرارك" description="تغيّر ملف الفيديو بعد اعتماده، فأخفينا الدرس عن الطلاب وأوقفنا بيع محتواه. افتح المحتوى، وشاهد الفيديو الحالي، ثم اقبله أو احذف الدرس." icon={<Video />} tone="coral">
          <div data-testid="ops-video-held">
            <DataList>
              {heldVideos.map((row) => (
                <DataRow
                  key={row.lesson_id}
                  leading={
                    <ToneIcon tone="coral" size="sm">
                      <Video />
                    </ToneIcon>
                  }
                  title={
                    <Link href={`/admin/products/${row.product_id}`} className="text-brand-700 hover:underline">
                      {row.lesson_title}
                    </Link>
                  }
                  sub={row.product_title}
                />
              ))}
            </DataList>
          </div>
        </Section>
      ) : null}

      <Section
        id="payments-unhealed"
        title="مدفوعات لم يكتمل أثرها"
        description="مال وصل ولم يتحول إلى وصول، وفواتير لم نتأكد من مصيرها بعد. تُحل وحدها حين يفتح المشتري مكتبته أو طلبه، أو في الجولة اليومية، أو بهذا الزر."
        icon={<CircleDollarSign />}
        tone="gold"
      >
        <div data-testid="ops-unhealed-section">
          {unhealed.paidNotGranted.length === 0 && unhealed.unverified.length === 0 ? (
            <EmptyState art="generic" compact title="لا شيء ينتظر الآن." />
          ) : (
            <DataList>
              {unhealed.paidNotGranted.map((row) => (
                <UnhealedLine key={`${row.reason}-${row.order_id}`} row={row} label={REASON_TEXT[row.reason]} tone="danger" now={now} />
              ))}
              {unhealed.unverified.map((row) => (
                <UnhealedLine key={`unverified-${row.order_id}-${row.since.getTime()}`} row={row} label={row.last_checked_at ? "لم يتأكد مصيرها بعد" : "لم تُفحص بعد"} tone="warning" now={now} />
              ))}
            </DataList>
          )}
          {unhealed.unverifiedTotal > unhealed.unverified.length ? <p className="mt-3 text-[0.84rem] leading-6 text-muted">تظهر هنا الأقدم فقط، والعدد الكلي للفواتير غير المؤكدة {ar(unhealed.unverifiedTotal)}.</p> : null}
          {paymentsOn ? (
            <ActionForm action={reconcileNowAction} className="mt-4">
              <SubmitButton variant="outline" pendingText="جارٍ الفحص…">
                <RefreshCw aria-hidden /> افحص الآن
              </SubmitButton>
            </ActionForm>
          ) : (
            <p className="mt-3 text-[0.92rem] leading-7 text-ink-soft">الدفع الإلكتروني غير مفعّل على هذا النشر، فلا توجد فواتير لفحصها.</p>
          )}
        </div>
      </Section>

      <Section id="test-alert" title="رسالة تجربة" description="تأكد أن رسائل التنبيه تصل إلى بريدك قبل أن تحتاجها." icon={<Send />} tone="violet">
        <p className="text-[0.92rem] leading-7 text-ink-soft" data-testid="ops-alert-delivery" data-delivery={delivery}>
          {DELIVERY_TEXT[delivery]}
        </p>
        <ActionForm action={sendTestAlertAction} className="mt-4">
          <SubmitButton variant="outline" pendingText="جارٍ الإرسال…">
            <Send aria-hidden /> أرسل رسالة تجربة
          </SubmitButton>
        </ActionForm>
      </Section>

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
