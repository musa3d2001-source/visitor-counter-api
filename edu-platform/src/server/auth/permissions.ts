import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { sql } from "../db";
import { getCurrentUser, type SessionUser } from "./session";
import { requireUser } from "./guards";

/**
 * صلاحيات فريق المحتوى (لوحة واحدة بصلاحيات حسب الدور):
 *  - owner  (role = 'admin'): تحكم كامل
 *  - teacher (role = 'teacher' + ملف معلم بوضع self_managed مرتبط بحسابه): محتواه فقط
 * القاعدة: كل استعلام/إجراء للمعلم يُقيَّد بـ teacher_id على الخادم — لا اعتماد على إخفاء الأزرار.
 */
export type Actor =
  | { kind: "owner"; userId: string; name: string; email: string; teacherId: null; canUpload: true }
  | { kind: "teacher"; userId: string; name: string; email: string; teacherId: string; teacherName: string; canUpload: boolean };

export class PermissionError extends Error {
  constructor(public readonly userMessage = "لا تملك صلاحية تنفيذ هذا الإجراء") {
    super(userMessage);
    this.name = "PermissionError";
  }
}

async function actorFor(user: SessionUser): Promise<Actor | null> {
  if (!user.isActive) return null;
  if (user.role === "admin") return { kind: "owner", userId: user.id, name: user.fullName, email: user.email, teacherId: null, canUpload: true };
  if (user.role !== "teacher") return null;
  const [t] = await sql<{ id: string; display_name: string; can_upload: boolean; mode: string }[]>`
    select id, display_name, can_upload, mode from teachers where user_id = ${user.id}
  `;
  if (!t || t.mode !== "self_managed") return null;
  return { kind: "teacher", userId: user.id, name: user.fullName, email: user.email, teacherId: t.id, teacherName: t.display_name, canUpload: t.can_upload };
}

/** الفاعل الحالي في لوحة التحكم (مالك أو معلم مفعّل) أو null */
export const getActor = cache(async (): Promise<Actor | null> => {
  const user = await getCurrentUser();
  return user ? actorFor(user) : null;
});

/** للصفحات: يتطلب مالكًا أو معلمًا مفعّلًا — الطالب يحصل على 404 */
export async function requireStaff(): Promise<Actor> {
  await requireUser("/admin");
  const actor = await getActor();
  if (!actor) notFound();
  return actor;
}

/** للصفحات المخصصة للمالك فقط */
export async function requireOwnerPage(): Promise<Actor & { kind: "owner" }> {
  const actor = await requireStaff();
  if (actor.kind !== "owner") notFound();
  return actor;
}

/** لـ Server Actions و API: يرمي خطأ بدل التحويل */
export async function assertStaff(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new PermissionError("غير مصرح لك بتنفيذ هذا الإجراء");
  return actor;
}

export async function assertOwner(): Promise<Actor & { kind: "owner" }> {
  const actor = await assertStaff();
  if (actor.kind !== "owner") throw new PermissionError("هذا الإجراء متاح للمالك فقط");
  return actor;
}

export function isOwner(actor: Actor): actor is Actor & { kind: "owner" } {
  return actor.kind === "owner";
}

/** الحالات التي يستطيع المعلم تعديل محتواه فيها (المسودة أو المعاد للتعديل) */
export const TEACHER_EDITABLE_STATUSES = ["draft"] as const;

export type ProductAccessNeed = "view" | "edit" | "upload";

export type ScopedProduct = { id: string; teacher_id: string | null; status: string; type: string; title: string };

/**
 * التحقق من صلاحية الفاعل على منتج:
 *  - view   : المالك دائمًا، والمعلم لمنتجاته فقط
 *  - edit   : المعلم فقط لمسوداته
 *  - upload : edit + صلاحية الرفع مفعّلة
 */
export async function assertProductAccess(actor: Actor, productId: string, need: ProductAccessNeed): Promise<ScopedProduct> {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) throw new PermissionError("المنتج غير موجود");
  const [p] = await sql<ScopedProduct[]>`select id, teacher_id, status, type, title from products where id = ${productId}`;
  if (!p) throw new PermissionError("المنتج غير موجود");
  if (actor.kind === "owner") return p;
  // المعلم لا يرى وجود منتجات غيره (نفس الرسالة)
  if (p.teacher_id !== actor.teacherId) throw new PermissionError("المنتج غير موجود");
  if (need === "view") return p;
  if (!(TEACHER_EDITABLE_STATUSES as readonly string[]).includes(p.status)) {
    throw new PermissionError(p.status === "in_review" ? "المحتوى قيد المراجعة ولا يمكن تعديله الآن" : "لا يمكن تعديل محتوى منشور، تواصل مع إدارة المنصة");
  }
  if (need === "upload" && !actor.canUpload) throw new PermissionError("صلاحية الرفع موقوفة لحسابك حاليًا");
  return p;
}

/** قيد SQL جاهز لتقييد الاستعلامات بمنتجات المعلم */
export function teacherScope(actor: Actor): string | null {
  return actor.kind === "teacher" ? actor.teacherId : null;
}
