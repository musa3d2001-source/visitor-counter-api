import "server-only";
import { after } from "next/server";
import { ar } from "@/lib/design";
import { sql } from "../db";
import { env, opsAlertEmail } from "../env";
import { sendMail } from "./mailer";

/**
 * رسائل تنبيه المالك (OPS_ALERT_EMAIL). ثلاث قواعد لا تُكسر:
 *  - رسالة واحدة لكل نوع في كل فترة، بمطالبة ذرّية في قاعدة البيانات. أقصى مجموع يومي ثابت (MAX_ALERTS_PER_DAY)، فلا تستنزف عاصفة أخطاء حصة البريد.
 *  - المسار باتجاه واحد: reportError يستدعي هذا الملف، وهذا الملف لا يستدعي reportError أبدًا، فلا يتغذى التنبيه على فشله.
 *  - لا تحوي الرسالة إلا نصًا ثابتًا وعددًا ورابطًا إلى لوحة المالك: لا أسماء ولا بريد ولا أرقام طلبات ولا رموز.
 *
 * counts: يخص الأحداث (يُعد ما لم تُرسل عنه رسالة ويُذكر في الرسالة التالية).
 * الحالات المستمرة (وظيفة متأخرة، استرداد معلق) تذكير يومي ما دامت قائمة، فلا معنى لعدها مع كل فحص.
 */
export const OPS_ALERTS = {
  server_error: {
    periodMinutes: 180,
    counts: true,
    path: "/admin/ops",
    subject: "خطأ جديد في الموقع",
    body: "سجل الخادم خطأ لم يظهر مؤخرًا. قد لا يكون الموقع متوقفًا، لكن هناك طلبًا لم يكتمل.",
  },
  payment_dispute: {
    periodMinutes: 180,
    counts: true,
    path: "/admin/orders#payment-alerts",
    subject: "نزاع جديد على دفعة",
    body: "وصل من بوابة الدفع إشعار نزاع على دفعة، أو تغيرت حالة نزاع قائم. لم يتغير أي طلب أو وصول تلقائيًا، والقرار لك.",
  },
  extra_payment: {
    periodMinutes: 180,
    counts: true,
    path: "/admin/orders#extra-payments",
    subject: "دفعة زائدة تحتاج إلى قرارك",
    body: "أكدت بوابة الدفع مبلغًا لا يكمل طلبًا، مثل دفعة ثانية لطلب مدفوع. سُجل المبلغ ولم يضع، ويمكنك استرداده من صفحة الطلبات.",
  },
  refund_unknown: {
    periodMinutes: 1440,
    counts: false,
    path: "/admin/orders#refund-queue",
    subject: "استرداد نتيجته غير مؤكدة",
    body: "يوجد استرداد أُرسل إلى بوابة الدفع ولم نعرف نتيجته بعد. لا تُعد إرساله قبل «إعادة التحقق» من صفحة الطلبات، حتى لا يتكرر.",
  },
  job_failed: {
    periodMinutes: 360,
    counts: true,
    path: "/admin/ops",
    subject: "فشلت وظيفة مجدولة",
    body: "بدأت إحدى الوظائف المجدولة ولم تكتمل. ستحاول مرة أخرى في موعدها القادم، والسبب في صفحة صحة المنصة.",
  },
  job_stale: {
    periodMinutes: 1440,
    counts: false,
    path: "/admin/ops",
    subject: "وظيفة مجدولة لم تعمل في موعدها",
    body: "لم تنجح إحدى الوظائف المجدولة منذ أكثر من يوم. تأكد من ضبط CRON_SECRET في بيئة Production، ومن تبويب Cron Jobs في Vercel.",
  },
} as const;

export type OpsAlertKind = keyof typeof OPS_ALERTS;

/** أقصى عدد رسائل في اليوم لو تحققت أسوأ حالة في كل الأنواع معًا طوال اليوم، وهو أقل بكثير من حصص البريد المجانية */
export const MAX_ALERTS_PER_DAY = 30;

const SEND_TIMEOUT_MS = 15_000;

function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** المطالبة بفرصة الإرسال. ذرّية: مهما تزامن من أحداث، ينجح واحد فقط في كل فترة */
async function claimSend(kind: OpsAlertKind, followUp: boolean): Promise<{ claimed: boolean; earlier: number }> {
  const rows = await sql<{ earlier: number }[]>`
    with prev as (select suppressed from ops_alert_state where kind = ${kind})
    insert into ops_alert_state as s (kind, last_sent_at, suppressed)
    values (${kind}, now(), 0)
    on conflict (kind) do update set last_sent_at = now(), suppressed = 0, last_suppressed_at = null
    where (s.last_sent_at is null or s.last_sent_at < now() - make_interval(mins => ${OPS_ALERTS[kind].periodMinutes}))
      and (not ${followUp} or s.suppressed > 0)
    returning coalesce((select suppressed from prev), 0)::int as earlier
  `;
  return rows[0] ? { claimed: true, earlier: rows[0].earlier } : { claimed: false, earlier: 0 };
}

function compose(kind: OpsAlertKind, earlier: number, followUp: boolean) {
  const spec = OPS_ALERTS[kind];
  const more = earlier > 0 ? `\n\nومنذ آخر رسالة من هذا النوع: ${ar(earlier)} من الأحداث المشابهة لم نرسل عنها رسالة.` : "";
  const lead = followUp ? `${spec.subject}: متابعة لتنبيه سابق.` : spec.body;
  return {
    subject: `تنبيه تشغيل: ${spec.subject}`,
    text: `${lead}${more}\n\nالتفاصيل في لوحة المالك:\n${env().APP_URL}${spec.path}\n\nهذه الرسالة لا تحوي بيانات أي طالب أو دفعة.`,
  };
}

/** إرسال تنبيه إن حان وقته. لا يرمي أبدًا، ويعيد true فقط إن خرجت رسالة */
export async function sendOpsAlert(kind: OpsAlertKind, opts: { followUp?: boolean } = {}): Promise<boolean> {
  try {
    // المعاينات قد تشارك قاعدة بيانات الإنتاج، وأخطاؤها ليست ما يجب أن يوقظ المالك
    if (env().VERCEL_ENV === "preview") return false;
    const to = opsAlertEmail();
    if (!to) return false;
    const followUp = opts.followUp ?? false;
    const { claimed, earlier } = await claimSend(kind, followUp);
    if (!claimed) {
      if (OPS_ALERTS[kind].counts && !followUp) {
        await sql`update ops_alert_state set suppressed = suppressed + 1, last_suppressed_at = now() where kind = ${kind}`;
      }
      return false;
    }
    const message = compose(kind, earlier, followUp);
    return await within(sendMail({ to, subject: message.subject, text: message.text, template: "ops_alert" }), SEND_TIMEOUT_MS, false);
  } catch (err) {
    // لا نستدعي reportError هنا: هذا ما يمنع التنبيه من أن يتغذى على فشله
    console.error("[ops-alert] not sent", kind, err instanceof Error ? err.name : "unknown");
    return false;
  }
}

/** التنبيه بعد إرسال الرد إن أمكن، حتى لا يؤخر خادم بريد بطيء رد Webhook. خارج سياق الطلب يعمل مباشرة */
export async function alertAfterResponse(kind: OpsAlertKind): Promise<void> {
  try {
    after(() => sendOpsAlert(kind));
  } catch {
    await sendOpsAlert(kind);
  }
}

/** ما تأجل بسبب حد الفترة يُرسل حين تنتهي الفترة، حتى لا يبقى حدث بلا رسالة إن لم يتبعه حدث آخر */
export async function flushSuppressedAlerts(): Promise<void> {
  const rows = await sql<{ kind: string }[]>`select kind from ops_alert_state where suppressed > 0`;
  for (const { kind } of rows) {
    if (kind in OPS_ALERTS) await sendOpsAlert(kind as OpsAlertKind, { followUp: true });
  }
}
