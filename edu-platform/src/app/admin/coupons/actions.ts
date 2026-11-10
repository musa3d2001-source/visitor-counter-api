"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { formValues } from "@/lib/action-state";
import { parseKwdToFils } from "@/lib/money";
import { sql } from "@/server/db";
import { audit } from "@/server/platform/audit";
import { kuwaitDayStart } from "@/server/admin/stats";
import { AdminError, adminAction, bool, isUuid, str } from "@/server/admin/common";
import { assertFreshProof } from "@/server/auth/step-up";

const KEYS = ["code", "kind", "value", "minOrder", "maxRedemptions", "maxPerUser", "startsAt", "endsAt", "note"];

type CouponInput = {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  minOrderFils: number;
  maxRedemptions: number | null;
  maxPerUser: number;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  note: string;
};

function parseCoupon(fd: FormData): CouponInput {
  const errors: Record<string, string> = {};
  const code = str(fd, "code").toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) errors.code = "الكود: 3-32 حرفًا إنجليزيًا أو أرقامًا (بدون مسافات)";
  const kind = str(fd, "kind") === "fixed" ? "fixed" : "percent";
  let value = 0;
  if (kind === "percent") {
    value = Number(str(fd, "value"));
    if (!Number.isInteger(value) || value < 1 || value > 100) errors.value = "النسبة من 1 إلى 100";
  } else {
    const f = parseKwdToFils(str(fd, "value"));
    if (f === null || f <= 0) errors.value = "قيمة الخصم بالدينار غير صحيحة";
    else value = f;
  }
  const minOrder = str(fd, "minOrder") ? parseKwdToFils(str(fd, "minOrder")) : 0;
  if (minOrder === null) errors.minOrder = "الحد الأدنى غير صحيح";
  const maxRed = str(fd, "maxRedemptions") ? Number(str(fd, "maxRedemptions")) : null;
  if (maxRed !== null && (!Number.isInteger(maxRed) || maxRed < 1)) errors.maxRedemptions = "رقم صحيح أكبر من صفر";
  const perUser = Number(str(fd, "maxPerUser") || "1");
  if (!Number.isInteger(perUser) || perUser < 1) errors.maxPerUser = "رقم صحيح أكبر من صفر";
  const startsAt = str(fd, "startsAt") ? kuwaitDayStart(str(fd, "startsAt")) : null;
  const endsDay = str(fd, "endsAt") ? kuwaitDayStart(str(fd, "endsAt")) : null;
  // تاريخ الانتهاء يشمل اليوم كاملًا
  const endsAt = endsDay ? new Date(endsDay.getTime() + 86400_000 - 1000) : null;
  if (startsAt && endsAt && endsAt <= startsAt) errors.endsAt = "تاريخ الانتهاء يجب أن يكون بعد البداية";
  const note = str(fd, "note").slice(0, 300);
  if (Object.keys(errors).length) throw new AdminError("راجع حقول الكوبون", errors);
  return { code, kind, value, minOrderFils: minOrder ?? 0, maxRedemptions: maxRed, maxPerUser: perUser, startsAt, endsAt, isActive: bool(fd, "isActive"), note };
}

export async function saveCouponAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let redirectTo: string | null = null;
  const res = await adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "id");
    const c = parseCoupon(fd);
    if (id && !isUuid(id)) throw new AdminError("طلب غير صالح");
    // كوبون ١٠٠٪ يوزَّع يساوي منح كل المحتوى مجانًا
    await assertFreshProof({ adminId, ip, command: "coupon.save" });
    if (id) {
      await sql`
        update coupons set code = ${c.code}, kind = ${c.kind}, value = ${c.value}, min_order_fils = ${c.minOrderFils},
          max_redemptions = ${c.maxRedemptions}, max_per_user = ${c.maxPerUser}, starts_at = ${c.startsAt}, ends_at = ${c.endsAt},
          is_active = ${c.isActive}, note = ${c.note}
        where id = ${id}
      `;
      await audit({ actorId: adminId, action: "coupon.update", entityType: "coupon", entityId: id, metadata: { ...c } });
      revalidatePath(`/admin/coupons/${id}`);
      revalidatePath("/admin/coupons");
      return { ok: true, message: "تم حفظ الكوبون" };
    }
    const [row] = await sql<{ id: string }[]>`
      insert into coupons (code, kind, value, min_order_fils, max_redemptions, max_per_user, starts_at, ends_at, is_active, note)
      values (${c.code}, ${c.kind}, ${c.value}, ${c.minOrderFils}, ${c.maxRedemptions}, ${c.maxPerUser}, ${c.startsAt}, ${c.endsAt}, ${c.isActive}, ${c.note})
      returning id
    `;
    await audit({ actorId: adminId, action: "coupon.create", entityType: "coupon", entityId: row.id, metadata: { ...c } });
    revalidatePath("/admin/coupons");
    redirectTo = "/admin/coupons?created=1";
  });
  if (redirectTo) redirect(redirectTo);
  return res?.ok ? res : res ? { ...res, values: formValues(fd, KEYS) } : res;
}

export async function toggleCouponAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "id");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    const active = str(fd, "active") === "1";
    if (active) await assertFreshProof({ adminId, ip, command: "coupon.activate" });
    await sql`update coupons set is_active = ${active} where id = ${id}`;
    await audit({ actorId: adminId, action: active ? "coupon.activate" : "coupon.deactivate", entityType: "coupon", entityId: id });
    revalidatePath("/admin/coupons");
    return { ok: true, message: active ? "تم التفعيل" : "تم الإيقاف" };
  });
}

export async function deleteCouponAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const id = str(fd, "id");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from coupon_redemptions where coupon_id = ${id}`;
    const [{ o }] = await sql<{ o: number }[]>`select count(*)::int as o from orders where coupon_id = ${id}`;
    if (n > 0 || o > 0) {
      await sql`update coupons set is_active = false where id = ${id}`;
      await audit({ actorId: adminId, action: "coupon.deactivate", entityType: "coupon", entityId: id, reason: "مستخدم في طلبات، إيقاف بدل الحذف" });
      revalidatePath("/admin/coupons");
      return { ok: true, message: "الكوبون مستخدم في طلبات سابقة، لذلك تم إيقافه بدل حذفه" };
    }
    await sql`delete from coupons where id = ${id}`;
    await audit({ actorId: adminId, action: "coupon.delete", entityType: "coupon", entityId: id });
    revalidatePath("/admin/coupons");
    return { ok: true, message: "تم حذف الكوبون" };
  });
}
