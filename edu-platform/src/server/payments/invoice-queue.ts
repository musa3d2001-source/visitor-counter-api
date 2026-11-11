import "server-only";
import { sql, type Db } from "../db";
import { INVOICE_TTL_MINUTES, ORDER_LIFETIME_HOURS } from "./limits";

/**
 * من يستحق سؤال البوابة الآن؟ تعريف واحد تشترك فيه وظيفة التسوية وفحص زيارة المشتري وصفحة المالك،
 * والمطالبة نفسها (reconcile_claimed_at) واحدة، فلا يسأل مساران عن الفاتورة نفسها في الوقت نفسه.
 *
 * حياة الفاتورة غير المؤكدة:
 *  - حية: رابطها يقبل الدفع أو مضى عليه أقل من LINK_STILL_PAYABLE_HOURS. تُفحص كل RECHECK_AFTER_MINUTES.
 *  - ميتة: انتهت المهلة. تُفحص مرة أخيرة واحدة بعد موتها ثم تخرج من الطابور، وهذا هو ما يجعل الطابور يفرغ.
 *    الوظيفة قد تعمل مرة واحدة في اليوم، فلا يكفي أن تُتابع داخل نافذة المهلة: قد تقع النافذة كلها بين جولتين.
 *  - طلب مفتوح انقضى عمره: كل فواتيره تُفحص مرة بعد انقضائه، لأن الإغلاق لا يتم بدون ذلك (closeExpiredOrders).
 *  - لا تعرفها البوابة (F28): تُسأل كالمعتاد لكن في آخر الطابور دائمًا، فلا تأخذ وقت فاتورة حقيقية. إن تكرر الجواب مرتين بينهما
 *    UNKNOWN_TERMINAL_AFTER_HOURS، وآخرهما بعد انقضاء عمر الطلب وموت الرابط، صار أمرها منتهيًا (unknownTerminal): لا تبقي طلبها مفتوحًا
 *    ولا تتصدر الطابور، وتُسأل مرة في الأسبوع لمدة PARKED_FOR_DAYS فقط، حتى إذا صُحح مفتاح البوابة ظهرت دفعة عليها ولم تضع.
 */

/** بعد موت الرابط بهذه المدة لا نلاحق فاتورة لم يصل فحصها الأخير: انقطاع طويل أو رقم لا تعرفه البوابة لا يبقى في الطابور إلى الأبد */
const FINAL_CHECK_WINDOW_DAYS = 7;
const CLAIM_LEASE_MINUTES = 5;
/** فاتورة طلب أُغلق تُتابَع حتى هذه المدة بعد انتهاء رابطها، لالتقاط دفعة تأخر تأكيدها */
export const LINK_STILL_PAYABLE_HOURS = 3;
export const RECHECK_AFTER_MINUTES = 10;

/** جوابان «لا أعرفها» بينهما هذه المدة على الأقل: يوم كامل يكفي المالك ليرى تنبيه أول جواب ويصحح المفتاح إن كان خطأ */
export const UNKNOWN_TERMINAL_AFTER_HOURS = 24;
/** فاتورة انتهى أمرها تُسأل مرة كل أسبوع، ولشهر بعد موت رابطها وانقضاء عمر طلبها، ثم يبقى القرار لتنبيه المالك */
const PARKED_RECHECK_DAYS = 7;
const PARKED_FOR_DAYS = 30;

const UNVERIFIED = ["initiated", "pending", "failed", "expired"];
const SETTLED = ["paid", "refunded"];

/** بعدها لا يُنتظر دفع على الفاتورة: انتهاء الرابط ومهلة LINK_STILL_PAYABLE_HOURS. المرجع q (payments) */
export const linkDeadAt = (db: Db) => db`(coalesce(q.expires_at, q.created_at + make_interval(mins => ${INVOICE_TTL_MINUTES})) + make_interval(hours => ${LINK_STILL_PAYABLE_HOURS}))`;
const notCheckedSince = (db: Db, moment: ReturnType<typeof linkDeadAt>) => db`(q.last_checked_at is null or q.last_checked_at < ${moment})`;
const notClaimed = (db: Db) => db`(q.reconcile_claimed_at is null or q.reconcile_claimed_at < now() - make_interval(mins => ${CLAIM_LEASE_MINUTES}))`;
const ours = (db: Db, environment: string) => db`q.provider = 'myfatoorah' and q.gateway_invoice_id is not null and q.environment = ${environment}`;
const lifeEndOf = (db: Db) => db`(o.created_at + make_interval(hours => ${ORDER_LIFETIME_HOURS}))`;

/**
 * فاتورة انتهى أمرها لأن البوابة لا تعرفها (F28): أجابت بذلك مرتين بينهما UNKNOWN_TERMINAL_AFTER_HOURS على الأقل،
 * وآخر الجوابين بعد انقضاء عمر الطلب وبعد موت رابطها، فلا يُنتظر عليها دفع بعده. أي جواب ناجح من البوابة يمسح العمودين.
 * المرجعان q (payments) و o (orders) يجب أن يكونا في الاستعلام.
 */
export function unknownTerminal(db: Db) {
  return db`coalesce(
    q.gateway_unknown_first_at is not null
    and q.gateway_unknown_last_at >= q.gateway_unknown_first_at + make_interval(hours => ${UNKNOWN_TERMINAL_AFTER_HOURS})
    and q.gateway_unknown_last_at >= greatest(${lifeEndOf(db)}, ${linkDeadAt(db)}),
  false)`;
}

/** الفواتير غير المؤكدة المستحقة للفحص. المرجعان q (payments) و o (orders) يجب أن يكونا في الاستعلام */
export function unverifiedDue(db: Db, environment: string, recheckMinutes: number = RECHECK_AFTER_MINUTES) {
  const dead = linkDeadAt(db);
  const lifeEnd = lifeEndOf(db);
  const terminal = unknownTerminal(db);
  return db`
    ${ours(db, environment)}
    and q.status = any(${UNVERIFIED}::text[])
    and (q.last_checked_at is null or q.last_checked_at < now() - make_interval(mins => ${recheckMinutes}))
    and ${notClaimed(db)}
    and (
      (not ${terminal} and (
        now() <= ${dead}
        or (${notCheckedSince(db, dead)} and now() <= ${dead} + make_interval(days => ${FINAL_CHECK_WINDOW_DAYS}))
        or (o.status in ('pending', 'failed') and now() >= ${lifeEnd} and ${notCheckedSince(db, lifeEnd)})
      ))
      or (${terminal}
        and q.gateway_unknown_last_at < now() - make_interval(days => ${PARKED_RECHECK_DAYS})
        and now() <= greatest(${lifeEnd}, ${dead}) + make_interval(days => ${PARKED_FOR_DAYS}))
    )
  `;
}

/** ترتيب الطابور: ما تعرفه البوابة أولًا دائمًا، ثم ما لم يُسأل عنه أبدًا، ثم الأقدم فحصًا، ثم الأقدم إنشاءً */
export const queueOrder = (db: Db) => db`(q.gateway_unknown_last_at is not null) asc, q.last_checked_at asc nulls first, q.created_at asc`;

/** فاتورة مدفوعة تُفحص مرة واحدة بعد موت رابطها: عملية ثانية عليها لا يكشفها غير البوابة إن ضاع Webhook. لا تأخذ من وقت المال الذي لم يصل */
function settledFinalCheckDue(db: Db, environment: string) {
  const dead = linkDeadAt(db);
  return db`
    ${ours(db, environment)}
    and q.status = any(${SETTLED}::text[])
    and now() > ${dead} and now() <= ${dead} + make_interval(days => ${FINAL_CHECK_WINDOW_DAYS})
    and ${notCheckedSince(db, dead)}
    and ${notClaimed(db)}
  `;
}

export type ClaimedInvoice = { id: string; gateway_invoice_id: string; last_checked_at: Date | null; created_at: Date; gateway_unknown_last_at: Date | null };

const oldestFirst = (a: ClaimedInvoice, b: ClaimedInvoice) =>
  Number(a.gateway_unknown_last_at !== null) - Number(b.gateway_unknown_last_at !== null) ||
  (a.last_checked_at?.getTime() ?? 0) - (b.last_checked_at?.getTime() ?? 0) ||
  a.created_at.getTime() - b.created_at.getTime();

/**
 * المطالبة بدفعة من الطابور بترتيب queueOrder: فاتورة لا تعرفها البوابة لا تتقدم أبدًا على فاتورة تعرفها.
 * الدفعة MATERIALIZED تُحسب مرة واحدة: داخل IN قد يعيد المخطط تنفيذها لكل صف، فيتخطى القفل ما حدّثه الأمر نفسه ويتجاوز الحد.
 */
export async function claimDueInvoices(environment: string, lane: "unverified" | "settled", limit: number): Promise<ClaimedInvoice[]> {
  const claimed = await sql<ClaimedInvoice[]>`
    with batch as materialized (
      select q.id from payments q
      join orders o on o.id = q.order_id
      where ${lane === "unverified" ? unverifiedDue(sql, environment) : settledFinalCheckDue(sql, environment)}
      order by ${queueOrder(sql)}
      limit ${limit}
      for update of q skip locked
    )
    update payments p set reconcile_claimed_at = now()
    from batch where p.id = batch.id
    returning p.id, p.gateway_invoice_id, p.last_checked_at, p.created_at, p.gateway_unknown_last_at
  `;
  return [...claimed].sort(oldestFirst);
}

export async function releaseClaims(ids: string[]): Promise<void> {
  if (ids.length) await sql`update payments set reconcile_claimed_at = null where id = any(${ids}::uuid[])`;
}
