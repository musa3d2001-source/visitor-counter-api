"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { emailSchema, fieldErrors, fullNameSchema } from "@/lib/validation";
import { filsToKwdString, parseKwdToFils } from "@/lib/money";
import { AdminError, adminAction, bool, int, isUuid, str } from "@/server/admin/common";
import {
  createTeacher,
  enableTeacherAccount,
  resetTeacherPassword,
  setTeacherAccountActive,
  setTeacherCanUpload,
  setTeacherPhoto,
  switchToManaged,
  updateTeacher,
  type TeacherInput,
} from "@/server/admin/teachers";
import { PayoutRefused, recordPayout, voidPayout } from "@/server/commerce/earnings";

/** كل إجراءات هذا الملف للمالك فقط (adminAction يرفض المعلم) */

const teacherSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^([a-z0-9][a-z0-9-]{0,62})?$/, "الرابط: أحرف إنجليزية صغيرة وأرقام وشرطات فقط")
    .optional(),
  displayName: z.string().trim().min(2, "اسم المعلم قصير جدًا").max(80, "الاسم طويل جدًا"),
  headline: z.string().trim().max(140, "العنوان التعريفي طويل جدًا"),
  bio: z.string().trim().max(3000, "النبذة طويلة جدًا"),
  revenueShare: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v.replace("٫", ".").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        ctx.addIssue({ code: "custom", message: "النسبة بين 0 و 100" });
        return z.NEVER;
      }
      return Math.round(n * 100);
    }),
  sortOrder: z.number().int().min(-10000).max(10000),
});

function parseTeacher(fd: FormData): TeacherInput {
  const parsed = teacherSchema.safeParse({
    slug: str(fd, "slug") || undefined,
    displayName: str(fd, "displayName"),
    headline: str(fd, "headline"),
    bio: str(fd, "bio"),
    revenueShare: str(fd, "revenueShare") || undefined,
    sortOrder: int(fd, "sortOrder", 0),
  });
  if (!parsed.success) throw new AdminError("راجع الحقول المظللة", fieldErrors(parsed.error));
  const subjectIds = [...fd.keys()].filter((k) => k.startsWith("s:")).map((k) => k.slice(2)).filter(isUuid);
  return {
    slug: parsed.data.slug || undefined,
    displayName: parsed.data.displayName,
    headline: parsed.data.headline,
    bio: parsed.data.bio,
    isPublished: bool(fd, "isPublished"),
    canUpload: bool(fd, "canUpload"),
    revenueShareBps: parsed.data.revenueShare,
    sortOrder: parsed.data.sortOrder,
    subjectIds: [...new Set(subjectIds)],
  };
}

export async function createTeacherAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let id: string | null = null;
  const res = await adminAction(async ({ adminId, ip }) => {
    id = await createTeacher(parseTeacher(fd), adminId, ip);
  });
  if (id) {
    revalidatePath("/admin/teachers");
    redirect(`/admin/teachers/${id}?created=1`);
  }
  return res;
}

export async function updateTeacherAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    if (!isUuid(id)) throw new AdminError("المعلم غير موجود");
    await updateTeacher(id, parseTeacher(fd), adminId, ip);
    revalidatePath(`/admin/teachers/${id}`);
    revalidatePath("/admin/teachers");
    revalidatePath("/", "layout");
    return { ok: true, message: "تم حفظ بيانات المعلم" };
  });
}

const accountSchema = z.object({ email: emailSchema, fullName: fullNameSchema });

export async function enableAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "teacherId");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    const parsed = accountSchema.safeParse({ email: str(fd, "email"), fullName: str(fd, "fullName") });
    if (!parsed.success) throw new AdminError("راجع البيانات", fieldErrors(parsed.error));
    const res = await enableTeacherAccount(id, { ...parsed.data, confirmLinkExisting: bool(fd, "confirmLinkExisting") }, adminId, ip);
    // لا نعيد تحميل الصفحة هنا حتى تبقى كلمة المرور ظاهرة للمالك (يحدّثها زر «تم»)
    const opening = res.linkedExisting
      ? `تمت ترقية الحساب الموجود (${res.email}) إلى حساب معلم، واستُبدلت كلمة مروره. ${res.noticeSent ? "أرسلنا إشعارًا إلى بريده." : "لم يخرج إشعار بالبريد، فأخبره بنفسك."}`
      : `تم إنشاء حساب المعلم (${res.email}).`;
    return { ok: true, message: `${opening} يعمل الدخول بها مرة واحدة خلال ٢٤ ساعة، ثم يختار المعلم كلمته الخاصة. كلمة المرور المؤقتة، انسخها الآن ولن تظهر مرة أخرى: ${res.password}` };
  });
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "teacherId");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    const password = await resetTeacherPassword(id, adminId, ip);
    return { ok: true, message: `تعمل مرة واحدة خلال ٢٤ ساعة، ثم يختار المعلم كلمته الخاصة. كلمة المرور المؤقتة، انسخها الآن ولن تظهر مرة أخرى: ${password}` };
  });
}

export async function switchToManagedAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "teacherId");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    await switchToManaged(id, adminId, ip);
    revalidatePath(`/admin/teachers/${id}`);
    revalidatePath("/admin/teachers");
    return { ok: true, message: "تم التحويل إلى «يديره المالك». المحتوى والمبيعات لم تتأثر." };
  });
}

export async function setAccountActiveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "teacherId");
    const reason = str(fd, "reason");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    if (reason.length < 3) throw new AdminError("اكتب سبب الإجراء");
    const active = str(fd, "active") === "1";
    await setTeacherAccountActive(id, active, adminId, reason, ip);
    revalidatePath(`/admin/teachers/${id}`);
    revalidatePath("/admin/teachers");
    return { ok: true, message: active ? "تم تفعيل الحساب" : "تم تعطيل الحساب وتسجيل خروجه، المحتوى باقٍ كما هو" };
  });
}

export async function setCanUploadAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "teacherId");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    const can = str(fd, "canUpload") === "1";
    await setTeacherCanUpload(id, can, adminId, ip);
    revalidatePath(`/admin/teachers/${id}`);
    revalidatePath("/admin/teachers");
    return { ok: true, message: can ? "تم تفعيل صلاحية الرفع" : "تم إيقاف صلاحية الرفع" };
  });
}

export async function removeTeacherPhotoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const id = str(fd, "teacherId");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    await setTeacherPhoto(id, null, adminId);
    revalidatePath(`/admin/teachers/${id}`);
    return { ok: true, message: "تمت إزالة الصورة" };
  });
}

export async function recordPayoutAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "teacherId");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    const amount = parseKwdToFils(str(fd, "amount"));
    if (amount === null || amount <= 0) throw new AdminError("أدخل مبلغ التسوية بالدينار، مثال: 25.000");
    const method = str(fd, "method");
    if (!["bank_transfer", "cash", "other"].includes(method)) throw new AdminError("اختر طريقة التسوية");
    const reference = str(fd, "reference").slice(0, 120);
    const note = str(fd, "reason").slice(0, 500);
    try {
      await recordPayout({ teacherId: id, amountFils: amount, method: method as "bank_transfer" | "cash" | "other", reference, note, ownerId: adminId, ip, confirmOverBalance: bool(fd, "confirmOverBalance") });
    } catch (err) {
      throw payoutError(err);
    }
    revalidatePath(`/admin/teachers/${id}`);
    revalidatePath("/admin/teachers");
    return { ok: true, message: "تم تسجيل التسوية" };
  });
}

export async function voidPayoutAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "payoutId");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    let teacherId: string;
    try {
      teacherId = await voidPayout({ payoutId: id, reason: str(fd, "reason"), ownerId: adminId, ip });
    } catch (err) {
      throw payoutError(err);
    }
    revalidatePath(`/admin/teachers/${teacherId}`);
    revalidatePath("/admin/teachers");
    return { ok: true, message: "تم إلغاء التسوية وعاد مبلغها إلى الرصيد" };
  });
}

function payoutError(err: unknown) {
  if (!(err instanceof PayoutRefused)) return err;
  if (err.reason === "over_balance") {
    return new AdminError(`المبلغ أكبر من الرصيد المستحق الآن (${filsToKwdString(Math.max(err.payableFils, 0))} د.ك). راجع المبلغ، أو أشّر خانة التأكيد لتسجيله دفعة زائدة.`);
  }
  if (err.reason === "bank_details") return new AdminError("لا تكتب الآيبان أو بيانات الحساب البنكي هنا. اكتب رقم عملية التحويل فقط.");
  if (err.reason === "void_reason") return new AdminError("اكتب سبب الإلغاء");
  return new AdminError("هذه التسوية ملغاة مسبقًا أو غير موجودة");
}
