import "server-only";
import { computeDiscount } from "@/lib/money";
import { sql, type Db } from "../db";
import { INVOICE_TTL_MINUTES, ORDER_LIFETIME_HOURS } from "../payments/limits";

export type CouponRow = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  min_order_fils: number;
  max_redemptions: number | null;
  max_per_user: number;
  starts_at: Date | null;
  ends_at: Date | null;
  is_active: boolean;
};

export type CouponCheck =
  | { ok: true; coupon: CouponRow; discountFils: number }
  | { ok: false; error: string };

type CouponUsage = { redeemed: number; held: number; user_redeemed: number; user_held: number };

/**
 * استهلاك الكود: الاستخدامات المكتملة، والطلبات المفتوحة التي تحجزه ولم تُستخدم بعد.
 * الحجز لطلب pending خلال عمره، ولطلب فشل دفعه ما دام عليه رابط يمكن دفعه: الرفض لا يُنهي الفاتورة، ودفعة عليها تستهلك الكود.
 * الطلب الذي انتهت مدته أو أُغلق يحرر الكود. excludeOrderId يستثني حجز الطلب نفسه عند إعادة حساب حجزه.
 */
async function couponUsage(db: Db, couponId: string, userId: string | null, excludeOrderId: string | null = null): Promise<CouponUsage> {
  const [usage] = await db<CouponUsage[]>`
    with used as (
      select user_id from coupon_redemptions where coupon_id = ${couponId}
    ), holds as (
      select o.user_id from orders o
      where o.coupon_id = ${couponId}
        and o.created_at > now() - make_interval(hours => ${ORDER_LIFETIME_HOURS})
        and (${excludeOrderId}::uuid is null or o.id <> ${excludeOrderId}::uuid)
        and (o.status = 'pending' or (o.status = 'failed' and exists (
          select 1 from payments p
          where p.order_id = o.id and p.gateway_invoice_id is not null and p.status in ('pending', 'failed')
            and coalesce(p.expires_at, p.created_at + make_interval(mins => ${INVOICE_TTL_MINUTES})) > now()
        )))
    )
    select
      (select count(*)::int from used) as redeemed,
      (select count(*)::int from holds) as held,
      (select count(*)::int from used where user_id = ${userId}::uuid) as user_redeemed,
      (select count(*)::int from holds where user_id = ${userId}::uuid) as user_held
  `;
  return usage;
}

/**
 * طلب فشل دفعه يعيد حجز كوده تحت قفل الكود قبل أي محاولة دفع جديدة، ولا يُحسب حجزه هو عليه.
 * قفل FOR NO KEY UPDATE لا يتعارض مع إدراج coupon_redemptions (مفتاح أجنبي)، فلا يوقف تأكيد دفعة جارية.
 */
export async function reacquireCouponHold(db: Db, input: { couponId: string; userId: string; orderId: string }): Promise<boolean> {
  const [coupon] = await db<CouponRow[]>`select * from coupons where id = ${input.couponId} for no key update`;
  if (!coupon) return false;
  const usage = await couponUsage(db, coupon.id, input.userId, input.orderId);
  if (coupon.max_redemptions !== null && usage.redeemed + usage.held >= coupon.max_redemptions) return false;
  return usage.user_redeemed + usage.user_held < coupon.max_per_user;
}

/**
 * التحقق من كوبون الخصم على الخادم (لا نثق بأي قيمة من المتصفح).
 * lock يقفل صف الكود حتى نهاية المعاملة: إنشاء الطلب يمر به، فلا يتجاوز تزامن الطلبات الحد الكلي ولا حد الطالب.
 */
export async function evaluateCoupon(
  code: string,
  userId: string | null,
  subtotalFils: number,
  db: Db = sql,
  opts: { lock?: boolean } = {},
): Promise<CouponCheck> {
  const clean = code.trim();
  if (!/^[a-z0-9_-]{3,32}$/i.test(clean)) return { ok: false, error: "كود الخصم غير صحيح" };
  const [c] = await db<CouponRow[]>`select * from coupons where code = ${clean} ${opts.lock ? db`for no key update` : db``}`;
  if (!c || !c.is_active) return { ok: false, error: "كود الخصم غير صحيح أو غير مفعّل" };
  const now = Date.now();
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { ok: false, error: "كود الخصم لم يبدأ بعد" };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { ok: false, error: "انتهت صلاحية كود الخصم" };
  if (subtotalFils < c.min_order_fils) return { ok: false, error: "قيمة الطلب أقل من الحد الأدنى لاستخدام هذا الكود" };
  const usage = await couponUsage(db, c.id, userId);
  if (c.max_redemptions !== null) {
    if (usage.redeemed >= c.max_redemptions) return { ok: false, error: "انتهى عدد مرات استخدام هذا الكود" };
    if (usage.redeemed + usage.held >= c.max_redemptions) return { ok: false, error: "هذا الكود محجوز الآن في طلبات لم تكتمل. جرّب لاحقًا" };
  }
  if (userId) {
    if (usage.user_redeemed >= c.max_per_user) return { ok: false, error: "سبق لك استخدام هذا الكود" };
    if (usage.user_redeemed + usage.user_held >= c.max_per_user) return { ok: false, error: "لديك طلب مفتوح يستخدم هذا الكود. أكمله أو ألغه أولًا" };
  }
  const discountFils = computeDiscount(subtotalFils, c.kind, c.value);
  if (discountFils <= 0) return { ok: false, error: "لا ينطبق الكود على هذا الطلب" };
  return { ok: true, coupon: c, discountFils };
}
