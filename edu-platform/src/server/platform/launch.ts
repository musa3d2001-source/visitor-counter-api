import "server-only";
import { CONSENT_VERSIONS } from "@/lib/consent";
import { MANUAL_VERSIONS, REQUIRED_MIGRATIONS, launchSteps, launchVerdict, type LaunchFacts, type LaunchStep, type LaunchTick, type LaunchTicks, type LaunchVerdict, type ManualKey, type SellerField } from "@/lib/launch";
import { contentHealthCounts } from "../admin/content-health";
import { unsellableProductIds } from "../commerce/cart";
import { sql } from "../db";
import { adminTwoFactorRequired, env } from "../env";
import { webhookDeliveryStatus } from "../payments/monitoring";
import { paymentsConfig } from "../payments/service";
import { bunnyConfigured } from "../video/bunny";
import { paidVideoWithoutStreaming, videoHostingBlocked } from "../video/policy";
import { audit } from "./audit";
import { siteIndexable } from "./indexing";
import { alertDelivery, jobViews, opsConfig } from "./ops-status";
import { reportError } from "./report-error";
import { JOB_LABELS, reconcileCadence, type JobName } from "./scheduled-jobs";
import { readSettings, type PlatformSettings } from "./settings";

/**
 * حقائق صفحة الإطلاق من النشر الذي تُفتح منه وقاعدة بياناته.
 * لا يخرج من هنا إلا قيم منطقية وأعداد وتواريخ: وجود المفتاح لا قيمته ولا طوله.
 * كل قسم مستقل: تعذّر قراءته يسجل الخطأ ويظهر «تعذر الفحص» في خطوته فقط، ولا يسقط الصفحة.
 */
async function safe<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    await reportError(`launch:${what}`, err);
    return null;
  }
}

const filled = (value: string | null | undefined) => Boolean(value && value.trim());

function sellerMissing(s: PlatformSettings): SellerField[] {
  const fields: [SellerField, string][] = [
    ["legal_name", s.seller_legal_name],
    ["license_number", s.seller_license_number],
    ["address", s.seller_address],
    ["mail_provider", s.mail_provider_name],
  ];
  return fields.filter(([, value]) => !filled(value)).map(([field]) => field);
}

async function migrationsFact(): Promise<LaunchFacts["migrations"]> {
  const rows = await sql<{ name: string }[]>`select name from schema_migrations where name = any(${[...REQUIRED_MIGRATIONS]}::text[])`;
  return { applied: rows.map((row) => row.name) };
}

async function mailFact(driver: "log" | "smtp"): Promise<LaunchFacts["mail"]> {
  const [row] = await sql<{ sent: Date | null; failed: Date | null }[]>`
    select max(created_at) filter (where status = 'sent') as sent, max(created_at) filter (where status = 'failed') as failed from email_log
  `;
  return { driver, lastSentAt: row.sent, lastFailedAt: row.failed };
}

async function adminsFact(): Promise<LaunchFacts["admins"]> {
  const [row] = await sql<{ total: number; enrolled: number }[]>`
    select count(*)::int as total, count(t.user_id)::int as enrolled
    from users u left join user_totp t on t.user_id = u.id and t.enabled_at is not null
    where u.role = 'admin' and u.is_active
  `;
  return row;
}

/**
 * إشعار دفع وإشعار استرداد يخصان فاتورة حقيقية (live): إشعارات بيئة الاختبار لا تثبت أن إعداد لوحة الإنتاج صحيح.
 * الاسترداد يحمل الفاتورة الأصلية في ReferencedInvoice، والدفع في Invoice.
 */
async function webhooksFact(): Promise<LaunchFacts["webhooks"]> {
  const [delivery, rows, [dispute]] = await Promise.all([
    webhookDeliveryStatus(),
    sql<{ code: string; at: Date }[]>`
      select e.code, max(e.received_at) as at
      from (
        select payload #>> '{Event,Code}' as code, coalesce(payload #>> '{Data,Invoice,Id}', payload #>> '{Data,ReferencedInvoice,Id}') as invoice_id, received_at
        from payment_events where provider = 'myfatoorah' and signature_valid
      ) e
      join payments p on p.provider = 'myfatoorah' and p.environment = 'live' and p.gateway_invoice_id = e.invoice_id
      where e.code in ('1', '2')
      group by e.code
    `,
    sql<{ at: Date | null }[]>`select max(received_at) as at from payment_events where provider = 'myfatoorah' and signature_valid and payload #>> '{Event,Code}' = '6'`,
  ]);
  const at = (code: string) => rows.find((row) => row.code === code)?.at ?? null;
  return { lastValidAt: delivery.lastValid?.at ?? null, livePayment: at("1"), liveRefund: at("2"), dispute: dispute.at, rejectedLast24h: delivery.rejectedLast24h };
}

/** ما يبقى بعد أمر purge-test-orders: هذه الأعداد كلها صفر بعده مباشرة */
async function testOrdersFact(): Promise<LaunchFacts["testOrders"]> {
  const [row] = await sql<NonNullable<LaunchFacts["testOrders"]>[]>`
    select
      (select count(*)::int from orders where is_test and status in ('pending', 'failed')) as "openOrders",
      (select count(*)::int from payments p join orders o on o.id = p.order_id where o.is_test and p.status in ('initiated', 'pending')) as "openPayments",
      (select count(*)::int from entitlements e join orders o on o.id = e.order_id where o.is_test and e.revoked_at is null) as entitlements,
      (select count(*)::int from coupon_redemptions r join orders o on o.id = r.order_id where o.is_test) as redemptions
  `;
  return row;
}

/**
 * المعلمون الذين يُباع محتواهم الآن، بالقاعدة نفسها التي توقف البيع (defectiveProductIds):
 * منتج منشور مدفوع، أو أي منتج مدفوع داخله بأي عمق.
 * الاتفاقية مطلوبة ممن له حساب يرفع منه (self_managed)، فالمعلم الذي يديره المالك لا يدخل المنصة.
 */
async function teachersFact(): Promise<LaunchFacts["teachers"]> {
  const [row] = await sql<NonNullable<LaunchFacts["teachers"]>[]>`
    with recursive c(root, id) as (
      select p.id, p.id from products p where p.status = 'published' and not p.is_free
      union
      select c.root, bi.product_id from c join bundle_items bi on bi.bundle_id = c.id
    ),
    selling as (
      select distinct t.id, t.mode, t.user_id, t.revenue_share_bps
      from c join products item on item.id = c.id join teachers t on t.id = item.teacher_id
      where not item.is_free
    )
    select
      count(*)::int as selling,
      count(*) filter (where revenue_share_bps is null)::int as "missingShare",
      count(*) filter (
        where mode = 'self_managed' and not exists (
          select 1 from consent_records r where r.user_id = selling.user_id and r.kind = 'teacher_agreement' and r.document_version = ${CONSENT_VERSIONS.teacher_agreement}
        )
      )::int as "missingAgreement",
      count(*) filter (where mode = 'managed')::int as "managedSelling"
    from selling
  `;
  return row;
}

/** المنشور، وما لا يُباع منه الآن: عيب، أو إغلاق الفيديو، أو انتهاء تاريخ الإتاحة */
async function catalogFact(settings: PlatformSettings): Promise<LaunchFacts["catalog"]> {
  const rows = await sql<{ id: string; sale_ended: boolean }[]>`
    select id, (access_mode = 'until_date' and access_until is not null and access_until <= now()) as sale_ended
    from products where status = 'published'
  `;
  const blocked = await unsellableProductIds(
    rows.map((row) => row.id),
    sql,
    settings,
  );
  return { published: rows.length, stopped: rows.filter((row) => row.sale_ended || blocked.has(row.id)).length };
}

export async function launchFacts(): Promise<LaunchFacts> {
  const e = env();
  const payments = paymentsConfig();
  const ops = opsConfig();
  const settings = await safe("settings", () => readSettings());

  const [migrations, mail, admins, webhooks, testOrders, teachers, catalog, content, jobs, opsAlertDelivery, paidWithoutStreaming] = await Promise.all([
    safe("migrations", migrationsFact),
    safe("mail", () => mailFact(e.MAIL_DRIVER)),
    safe("admins", adminsFact),
    safe("webhooks", webhooksFact),
    safe("test_orders", testOrdersFact),
    safe("teachers", teachersFact),
    settings ? safe("catalog", () => catalogFact(settings)) : Promise.resolve(null),
    safe("content", async () => {
      const counts = await contentHealthCounts();
      return { unchecked: counts.unchecked, flagged: counts.flagged, badPreviews: counts.badPreviews };
    }),
    safe("jobs", async () => (await jobViews()).map((job) => ({ job: job.job, title: JOB_LABELS[job.job as JobName]?.title ?? job.job, status: job.status, lastSuccessAt: job.last_success_at }))),
    safe("ops_alert_delivery", alertDelivery),
    safe("paid_video", () => paidVideoWithoutStreaming(sql, e.VIDEO_PROVIDER === "bunny" && bunnyConfigured())),
  ]);

  return {
    deployment: { vercelEnv: e.VERCEL_ENV ? e.VERCEL_ENV : null },
    migrations,
    appUrl: e.APP_URL,
    indexing: { indexable: siteIndexable(), disabledBySetting: !e.SITE_INDEXABLE },
    trustProxy: e.TRUST_PROXY,
    cronSecret: ops.cronConfigured,
    jobs,
    reconcile: reconcileCadence(),
    opsAlertEmail: ops.alertEmailConfigured,
    opsAlertDelivery,
    mail,
    admins,
    twoFactorRequired: adminTwoFactorRequired(),
    payments: {
      mode: e.PAYMENTS_MODE,
      enabled: payments.enabled,
      environment: payments.environment,
      reason: payments.enabled ? null : payments.reason,
      apiKey: filled(e.MYFATOORAH_API_KEY),
      webhookSecret: filled(e.MYFATOORAH_WEBHOOK_SECRET),
      liveConfirmed: e.MYFATOORAH_LIVE_CONFIRMED,
      baseUrlSet: filled(e.MYFATOORAH_BASE_URL),
    },
    webhooks,
    testOrders,
    settings: settings
      ? {
          feeRulesConfirmed: settings.fee_rules_confirmed_at !== null,
          sellerMissing: sellerMissing(settings),
          contactEmail: filled(settings.contact_email),
          contactPhone: filled(settings.whatsapp_number) || filled(settings.contact_phone),
          videosEnabled: settings.videos_enabled,
        }
      : null,
    catalog,
    teachers,
    content,
    video: {
      provider: e.VIDEO_PROVIDER,
      allowFileVideo: e.ALLOW_FILE_VIDEO,
      hostingBlocked: videoHostingBlocked(),
      bunnyKeys: bunnyConfigured(),
      bunnyCdnHost: filled(e.BUNNY_STREAM_CDN_HOSTNAME),
      paidWithoutStreaming,
    },
  };
}

/** التأشيرات اليدوية الحالية. null = تعذرت القراءة، فتظهر الخطوات اليدوية «تعذر الفحص» وتبقى لازمة */
export async function launchTicks(): Promise<LaunchTicks> {
  return safe("ticks", async () => {
    const rows = await sql<{ key: string; version: string; done: boolean; changed_at: Date; changed_by_name: string | null }[]>`
      select c.key, c.version, c.done, c.changed_at, u.full_name as changed_by_name
      from launch_checks c left join users u on u.id = c.changed_by
    `;
    const ticks: Partial<Record<ManualKey, LaunchTick>> = {};
    for (const row of rows) {
      if (!(row.key in MANUAL_VERSIONS)) continue;
      ticks[row.key as ManualKey] = { done: row.done, version: row.version, changedAt: row.changed_at, changedBy: row.changed_by_name };
    }
    return ticks;
  });
}

export type LaunchStatus = { steps: LaunchStep[]; verdict: LaunchVerdict };

export async function launchStatus(): Promise<LaunchStatus> {
  const [facts, ticks] = await Promise.all([launchFacts(), launchTicks()]);
  const steps = launchSteps(facts, ticks);
  return { steps, verdict: launchVerdict(steps) };
}

/**
 * تأشير خطوة يدوية أو إعادة فتحها. التأشير يحفظ نسخة نص الخطوة الحالية، فإن تغير النص لاحقًا عادت مفتوحة.
 * التكرار لا يكتب شيئًا ولا يسجل حدثًا ثانيًا. كل تغيير يُسجَّل في audit_logs في المعاملة نفسها.
 */
export async function setLaunchCheck(input: { key: ManualKey; done: boolean; actorId: string; ip?: string | null }): Promise<"changed" | "unchanged"> {
  const version = MANUAL_VERSIONS[input.key];
  return sql.begin(async (tx) => {
    const rows = input.done
      ? await tx<{ key: string }[]>`
          insert into launch_checks as c (key, version, done, changed_by, changed_at)
          values (${input.key}, ${version}, true, ${input.actorId}, now())
          on conflict (key) do update set version = excluded.version, done = true, changed_by = excluded.changed_by, changed_at = now()
          where c.done is distinct from true or c.version is distinct from excluded.version
          returning key
        `
      : await tx<{ key: string }[]>`
          update launch_checks set done = false, version = ${version}, changed_by = ${input.actorId}, changed_at = now()
          where key = ${input.key} and done
          returning key
        `;
    if (rows.length === 0) return "unchanged" as const;
    await audit({ actorId: input.actorId, action: input.done ? "launch.step_done" : "launch.step_reopened", entityType: "launch_check", entityId: input.key, metadata: { version }, ip: input.ip ?? null }, tx);
    return "changed" as const;
  }) as Promise<"changed" | "unchanged">;
}
