import "server-only";
import { computeDiscount } from "@/lib/money";
import { sql, type Db } from "../db";

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

/** التحقق من كوبون الخصم على الخادم (لا نثق بأي قيمة من المتصفح) */
export async function evaluateCoupon(
  code: string,
  userId: string | null,
  subtotalFils: number,
  db: Db = sql,
): Promise<CouponCheck> {
  const clean = code.trim();
  if (!/^[a-z0-9_-]{3,32}$/i.test(clean)) return { ok: false, error: "كود الخصم غير صحيح" };
  const [c] = await db<CouponRow[]>`select * from coupons where code = ${clean}`;
  if (!c || !c.is_active) return { ok: false, error: "كود الخصم غير صحيح أو غير مفعّل" };
  const now = Date.now();
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { ok: false, error: "كود الخصم لم يبدأ بعد" };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { ok: false, error: "انتهت صلاحية كود الخصم" };
  if (subtotalFils < c.min_order_fils) return { ok: false, error: "قيمة الطلب أقل من الحد الأدنى لاستخدام هذا الكود" };
  if (c.max_redemptions !== null) {
    const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from coupon_redemptions where coupon_id = ${c.id}`;
    if (n >= c.max_redemptions) return { ok: false, error: "انتهى عدد مرات استخدام هذا الكود" };
  }
  if (userId) {
    const [{ n }] = await db<{ n: number }[]>`
      select count(*)::int as n from coupon_redemptions where coupon_id = ${c.id} and user_id = ${userId}
    `;
    if (n >= c.max_per_user) return { ok: false, error: "سبق لك استخدام هذا الكود" };
  }
  const discountFils = computeDiscount(subtotalFils, c.kind, c.value);
  if (discountFils <= 0) return { ok: false, error: "لا ينطبق الكود على هذا الطلب" };
  return { ok: true, coupon: c, discountFils };
}
