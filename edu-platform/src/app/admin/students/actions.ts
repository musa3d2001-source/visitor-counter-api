"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { sql } from "@/server/db";
import { adminGrant, adminRevoke } from "@/server/access/entitlements";
import { invalidateAllUserSessions } from "@/server/auth/session";
import { audit } from "@/server/platform/audit";
import { AdminError, adminAction, isUuid, str } from "@/server/admin/common";

function requireReason(fd: FormData) {
  const reason = str(fd, "reason");
  if (reason.length < 3) throw new AdminError("اكتب سبب الإجراء (3 أحرف على الأقل)، يُحفظ في سجل التدقيق");
  if (reason.length > 500) throw new AdminError("السبب طويل جدًا");
  return reason;
}

export async function grantAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const userId = str(fd, "userId");
    const productId = str(fd, "productId");
    if (!isUuid(userId)) throw new AdminError("طلب غير صالح");
    if (!isUuid(productId)) throw new AdminError("اختر المنتج");
    const reason = requireReason(fd);
    const [u] = await sql<{ role: string }[]>`select role from users where id = ${userId}`;
    if (!u) throw new AdminError("المستخدم غير موجود");
    const res = await adminGrant({ userId, productId, adminId, reason, ip });
    revalidatePath(`/admin/students/${userId}`);
    return {
      ok: true,
      message: res.granted.length ? `تم منح الصلاحية (${res.granted.length} منتج)` : "الطالب يملك هذا المنتج مسبقًا، لم يتغير شيء",
    };
  });
}

export async function revokeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const userId = str(fd, "userId");
    const productId = str(fd, "productId");
    if (!isUuid(userId) || !isUuid(productId)) throw new AdminError("طلب غير صالح");
    const reason = requireReason(fd);
    const count = await adminRevoke({ userId, productId, adminId, reason, ip });
    revalidatePath(`/admin/students/${userId}`);
    return { ok: true, message: count ? `تم سحب ${count} صلاحية` : "لا توجد صلاحية نشطة لسحبها" };
  });
}

export async function setActiveAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const userId = str(fd, "userId");
    if (!isUuid(userId)) throw new AdminError("طلب غير صالح");
    if (userId === adminId) throw new AdminError("لا يمكنك إيقاف حسابك");
    const active = str(fd, "active") === "1";
    const reason = active ? str(fd, "reason") || null : requireReason(fd);
    const [u] = await sql<{ role: string }[]>`update users set is_active = ${active} where id = ${userId} returning role`;
    if (!u) throw new AdminError("المستخدم غير موجود");
    if (!active) await invalidateAllUserSessions(userId);
    await audit({ actorId: adminId, action: active ? "user.activate" : "user.suspend", entityType: "user", entityId: userId, reason, ip });
    revalidatePath(`/admin/students/${userId}`);
    revalidatePath("/admin/students");
    return { ok: true, message: active ? "تم تفعيل الحساب" : "تم إيقاف الحساب وتسجيل خروجه من كل الأجهزة" };
  });
}
