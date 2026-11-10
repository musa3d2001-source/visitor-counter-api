import "server-only";
import { sql, type Db } from "../db";
import { audit } from "../platform/audit";
import { IN_PROGRESS_GRACE_MINUTES, INVOICE_TTL_MINUTES } from "../payments/limits";
import { ANONYMIZATION_BLOCKER_LABELS, ANONYMIZED_PASSWORD_HASH, anonymizedEmail, anonymizedName, redactGatewayStatus, redactWebhookPayload, type AnonymizationBlocker } from "@/lib/anonymize";
import { displayPhone } from "@/lib/phone";
import { AdminError } from "./common";
import { doomUserCopies, sweepDoomedCopies } from "../access/delivery";
import { reportError } from "../platform/report-error";
import { enforceOwnerLimits } from "./student-accounts";

/**
 * حذف بيانات الطالب الشخصية بيد المالك مع بقاء السجلات المالية بلا هوية.
 *
 * مسودة بانتظار مراجعة المحامي: نفهم أن القانون الكويتي يلزم بحفظ المستندات المالية مدة خمس سنوات،
 * ولم نتحقق بعد من النص ولا من بدء المدة ولا مما إذا كانت تشمل بيانات المشتري نفسها. لهذا تبقى الطلبات
 * والمدفوعات والفواتير وسجلات الموافقة، بلا اسم أو بريد أو هاتف أو عنوان IP، ويحذف ما عداها.
 * ما أُرسل إلى بوابة الدفع يبقى لديها: هذا الإجراء لا يملك حذفه، والواجهة تقول ذلك للمالك.
 *
 * كل شيء في معاملة واحدة، فلا يبقى حساب محذوف نصفه. قفل صف الطالب أولًا ثم طلباته:
 * createOrder يأخذ قفل الطالب نفسه، فلا ينشأ طلب جديد بعد الفحص.
 */
export async function anonymizationBlockers(studentId: string, db: Db = sql): Promise<AnonymizationBlocker[]> {
  return db<AnonymizationBlocker[]>`
    select 'open_order' as kind, o.id as "orderId", o.number as "orderNumber" from orders o
    where o.user_id = ${studentId} and o.status in ('pending', 'failed')
    union all
    select 'payable_invoice', o.id, o.number from payments p join orders o on o.id = p.order_id
    where o.user_id = ${studentId} and o.status not in ('pending', 'failed') and p.provider = 'myfatoorah'
      and p.status not in ('paid', 'refunded') and p.gateway_invoice_id is not null
      and coalesce(p.expires_at, p.created_at + make_interval(mins => ${INVOICE_TTL_MINUTES})) + make_interval(mins => ${IN_PROGRESS_GRACE_MINUTES}) > now()
    union all
    select 'refund', o.id, o.number from refunds r join orders o on o.id = r.order_id
    where o.user_id = ${studentId} and r.status not in ('completed', 'dismissed')
    union all
    select 'extra_payment', o.id, o.number from payment_extras e join orders o on o.id = e.order_id
    where o.user_id = ${studentId} and e.state not in ('refunded', 'dismissed')
    union all
    select 'payment_alert', o.id, o.number from payment_alerts a join orders o on o.id = a.order_id
    where o.user_id = ${studentId} and a.resolved_at is null
  `;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

export async function anonymizeStudent(input: { studentId: string; adminId: string; confirmEmail: string; reason: string; ip?: string }): Promise<{ alreadyAnonymized: boolean }> {
  await enforceOwnerLimits("owner-anonymize", input.adminId, input.studentId);
  const id = input.studentId;

  const result = await sql.begin(async (tx) => {
    const [user] = await tx<{ email: string; full_name: string; phone: string | null; role: string; anonymized_at: Date | null }[]>`
      select email, full_name, phone, role, anonymized_at from users where id = ${id} for no key update
    `;
    if (!user) throw new AdminError("المستخدم غير موجود");
    if (user.role !== "student") throw new AdminError("هذا الإجراء لحسابات الطلاب فقط");
    if (user.anonymized_at) return { alreadyAnonymized: true };
    if (input.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new AdminError("البريد المكتوب لا يطابق بريد هذا الطالب", { confirmEmail: "اكتب بريد الطالب كما يظهر أعلاه" });
    }

    const orders = await tx<{ id: string; customer_name: string; customer_email: string; customer_phone: string | null }[]>`
      select id, customer_name, customer_email, customer_phone from orders where user_id = ${id} for update
    `;
    const blockers = await anonymizationBlockers(id, tx);
    if (blockers.length) {
      const first = blockers[0];
      throw new AdminError(`لا يمكن الحذف الآن: ${ANONYMIZATION_BLOCKER_LABELS[first.kind]} (${first.orderNumber}).`);
    }

    const orderIds = orders.map((o) => o.id);
    const extras = await tx<{ id: string }[]>`select id from payment_extras where order_id = any(${orderIds}::uuid[])`;
    const extraIds = extras.map((e) => e.id);
    const placeholderEmail = anonymizedEmail(id);
    const placeholderName = anonymizedName(id);

    // كل عنوان عُرف به الحساب، حتى ما صُحح لاحقًا: يبقى في سجلات التدقيق وسجل البريد ومفاتيح المحاولات
    const pastEmails = await tx<{ from_email: string | null; to_email: string | null }[]>`
      select metadata->>'from' as from_email, metadata->>'to' as to_email from audit_logs
      where entity_type = 'user' and entity_id = ${id} and action in ('student.email_corrected', 'user.email_corrected_by_student')
    `;
    const tokenEmails = await tx<{ email: string }[]>`select distinct email::text as email from email_verification_tokens where user_id = ${id}`;
    const rawEmails = unique([user.email, ...orders.map((o) => o.customer_email), ...pastEmails.flatMap((e) => [e.from_email, e.to_email]), ...tokenEmails.map((t) => t.email)]);
    const lowerEmails = unique(rawEmails.map((e) => e.toLowerCase()));
    // تدخل في نص JSON بعملية replace، فلا نقبل عنوانًا فيه ما يكسر JSON
    const jsonSafeEmails = unique([...rawEmails, ...lowerEmails]).filter((e) => !/["\\\s]/.test(e));

    const phones = unique([user.phone, ...orders.map((o) => o.customer_phone)]).flatMap((p) => [p, p.replace(/^\+/, ""), p.replace(/^\+965/, ""), displayPhone(p)]);
    const names = unique([user.full_name, ...orders.map((o) => o.customer_name)].map((n) => n?.trim())).filter((n) => n.length >= 3);
    // الأطول أولًا: الرقم الدولي قبل المحلي الذي هو جزء منه
    const longestFirst = (a: { from: string }, b: { from: string }) => b.from.length - a.from.length;
    const replacements = [
      ...jsonSafeEmails.map((from) => ({ from, to: placeholderEmail })),
      ...unique(phones).map((from) => ({ from, to: "[هاتف محذوف]" })),
      ...names.map((from) => ({ from, to: placeholderName })),
    ].sort(longestFirst);

    const scrub = (text: string) => replacements.reduce((out, r) => out.split(r.from).join(r.to), text);

    const counts = {
      sessions: (await tx`delete from sessions where user_id = ${id}`).count,
      resetLinks: (await tx`delete from password_reset_tokens where user_id = ${id}`).count,
      verificationLinks: (await tx`delete from email_verification_tokens where user_id = ${id}`).count,
      loginChallenges: (await tx`delete from login_challenges where user_id = ${id}`).count,
      readingProgress: (await tx`delete from reading_progress where user_id = ${id}`).count,
      lessonProgress: (await tx`delete from lesson_progress where user_id = ${id}`).count,
      accessLogs: (await tx`delete from access_logs where user_id = ${id}`).count,
      emailLog: (await tx`delete from email_log where lower(to_email) = any(${lowerEmails}::text[])`).count,
      entitlementsRevoked: 0,
      ordersAnonymized: orders.length,
      // نسخ المذكرات المختومة ببريده: لا تُستعمل بعد هذه المعاملة، وكائناتها تُحذف بعدها مباشرة
      stampedCopies: await doomUserCopies(id, tx),
    };
    await tx`delete from user_totp where user_id = ${id}`;
    await tx`delete from user_recovery_codes where user_id = ${id}`;
    // الحذف الذي طلبه تم الآن. والنسخة لم يعد ممكنًا إعدادها بعد الحذف. ما كتبه المالك في الملاحظات قد يحوي بياناته
    await tx`
      update account_data_requests
      set status = case when status <> 'open' then status when kind = 'delete' then 'done' else 'declined' end,
        closed_at = coalesce(closed_at, now()), closed_by = coalesce(closed_by, ${input.adminId}), close_note = null
      where user_id = ${id}
    `;
    await tx`delete from rate_limits where exists (select 1 from unnest(${[...lowerEmails, id]}::text[]) as needle where position(needle in lower(key)) > 0)`;

    // لا أحد يدخل بعد الآن. الصف يبقى لأنه يربط البيع بالمنتج، وأرباح المعلم لا تتغير: البيع نفسه لم يُلغَ
    counts.entitlementsRevoked = (await tx`
      update entitlements set revoked_at = now(), revoked_by = ${input.adminId}, revoke_reason = 'حُذفت بيانات الطالب'
      where user_id = ${id} and revoked_at is null
    `).count;

    await tx`update orders set customer_name = ${placeholderName}, customer_email = ${placeholderEmail}, customer_phone = null where user_id = ${id}`;

    const payments = await tx<{ id: string; gateway_invoice_id: string | null; last_gateway_status: unknown }[]>`
      select id, gateway_invoice_id, last_gateway_status from payments where order_id = any(${orderIds}::uuid[])
    `;
    for (const p of payments) {
      await tx`
        update payments set payment_url = null, last_gateway_status = ${p.last_gateway_status === null ? null : tx.json(redactGatewayStatus(p.last_gateway_status) as never)}
        where id = ${p.id}
      `;
    }
    const invoiceIds = unique(payments.map((p) => p.gateway_invoice_id));
    const events = await tx<{ id: string; payload: unknown }[]>`
      select id, payload from payment_events
      where payload #>> '{Data,Invoice,Id}' = any(${invoiceIds}::text[])
         or payload #>> '{Data,ReferencedInvoice,Id}' = any(${invoiceIds}::text[])
         or lower(payload #>> '{Data,Customer,Email}') = any(${lowerEmails}::text[])
    `;
    for (const e of events) await tx`update payment_events set payload = ${tx.json(redactWebhookPayload(e.payload) as never)} where id = ${e.id}`;

    const auditScope = () => tx`(
      (entity_type = 'user' and entity_id = ${id}) or actor_id = ${id}
      or (entity_type = 'order' and entity_id = any(${orderIds}::text[]))
      or (entity_type = 'payment_extra' and entity_id = any(${extraIds}::text[]))
      or (entity_type = 'teacher' and (metadata->>'userId' = ${id} or metadata->>'previousUserId' = ${id}))
    )`;
    await tx`update audit_logs set ip = null where actor_id = ${id} and ip is not null`;
    for (const email of jsonSafeEmails) {
      await tx`update audit_logs set metadata = replace(metadata::text, ${email}, ${placeholderEmail})::jsonb where ${auditScope()} and position(${email} in metadata::text) > 0`;
    }
    // ما كتبه المالك يبقى لأنه جزء من سجل القرار، بعد إزالة الاسم والبريد والهاتف إن وردت حرفيًا. الواجهة تقول هذا أيضًا
    for (const { from, to } of replacements) {
      await tx`update audit_logs set reason = replace(reason, ${from}, ${to}) where ${auditScope()} and position(${from} in reason) > 0`;
      await tx`
        update entitlements set grant_reason = replace(grant_reason, ${from}, ${to}), revoke_reason = replace(revoke_reason, ${from}, ${to})
        where user_id = ${id} and (position(${from} in grant_reason) > 0 or position(${from} in revoke_reason) > 0)
      `;
      await tx`update teacher_earnings set reversal_reason = replace(reversal_reason, ${from}, ${to}) where order_id = any(${orderIds}::uuid[]) and position(${from} in reversal_reason) > 0`;
    }

    // العمودان محدودان بـ ٥٠٠ حرف، والبديل قد يكون أطول من الأصل. الاستبدال كله أولًا ثم قص واحد بعدد الحروف، فلا يبقى جزء من اسم أو بريد
    const fitted = (text: string) => [...scrub(text)].slice(0, 500).join("");
    for (const r of await tx<{ id: string; reason: string }[]>`select id, reason from refunds where order_id = any(${orderIds}::uuid[])`) {
      const clean = fitted(r.reason);
      if (clean !== r.reason) await tx`update refunds set reason = ${clean} where id = ${r.id}`;
    }
    for (const e of await tx<{ id: string; refund_reason: string }[]>`select id, refund_reason from payment_extras where order_id = any(${orderIds}::uuid[]) and refund_reason is not null`) {
      const clean = fitted(e.refund_reason);
      if (clean !== e.refund_reason) await tx`update payment_extras set refund_reason = ${clean} where id = ${e.id}`;
    }

    await tx`
      update users set email = ${placeholderEmail}, full_name = ${placeholderName}, phone = null, password_hash = ${ANONYMIZED_PASSWORD_HASH},
        grade_id = null, is_active = false, email_verified_at = null, last_login_at = null,
        must_change_password = false, temp_password_expires_at = null, anonymized_at = now()
      where id = ${id}
    `;

    // بعد إغلاق الحساب، فالمشغّل لا يسمح بهذا التعديل قبله: ما يثبت الموافقة يبقى (النوع والنسخة والوقت والطلب)، وما يدل على الجهاز يُزال
    await tx`update consent_records set ip = null, user_agent = null where user_id = ${id} and (ip is not null or user_agent is not null)`;
    // معلم سابق عاد طالبًا: إقرار الحقوق يبقى دليلًا، بلا عنوان ولا جهاز
    await tx`update product_rights_attestations set ip = null, user_agent = null where user_id = ${id} and (ip is not null or user_agent is not null)`;

    await audit({ actorId: input.adminId, action: "student.anonymized", entityType: "user", entityId: id, reason: scrub(input.reason), metadata: { ...counts }, ip: input.ip ?? null }, tx);
    return { alreadyAnonymized: false };
  });
  // بعد المعاملة: حذف الكائنات من التخزين. إن تعثر يحذفها التنظيف اليومي، فالصفوف معلَّمة ولا تُسلَّم
  if (!result.alreadyAnonymized) await sweepDoomedCopies(500).catch((err) => reportError("anonymize:stamped-copies", err));
  return result;
}
