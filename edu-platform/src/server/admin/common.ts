import "server-only";
import { assertAdmin } from "../auth/guards";
import { assertStaff, PermissionError, type Actor } from "../auth/permissions";
import type { ActionState } from "@/lib/action-state";
import { clientIp } from "../http";
import { reportError } from "../platform/report-error";
import { isDatabaseBusy } from "../db-busy";
import { DB_BUSY_MESSAGE } from "@/lib/busy";
import { StampBusyError } from "../access/stamp-gate";

/**
 * غلاف موحد لـ Server Actions الخاصة بالإدارة:
 * يتحقق من صلاحية المدير أولًا، ويحوّل الأخطاء إلى رسائل مفهومة.
 */
export class AdminError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(userMessage);
    this.name = "AdminError";
  }
}

export type AdminCtx = { adminId: string; ip: string };

function isNextControlFlow(err: unknown) {
  return Boolean(
    err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && String((err as { digest: string }).digest).startsWith("NEXT_"),
  );
}

async function toActionError(err: unknown): Promise<ActionState> {
  if (err instanceof AdminError) return { error: err.userMessage, fieldErrors: err.fieldErrors };
  if (err instanceof PermissionError) return { error: err.userMessage };
  // إعادة رمي أخطاء التوجيه الخاصة بـ Next.js (redirect/notFound)
  if (isNextControlFlow(err)) throw err;
  // مؤقت: لا يُسجل خطأً في الإجراء، ويُطلب من المالك إعادة المحاولة بعد لحظات
  if (isDatabaseBusy(err)) return { error: DB_BUSY_MESSAGE };
  // حد أعمال PDF الثقيلة على هذه النسخة (فحص ملف، توليد معاينة): مؤقت مثل انشغال قاعدة البيانات
  if (err instanceof StampBusyError) return { error: "المنصة تجهز ملفات كثيرة الآن. حاول مرة أخرى بعد دقيقة." };
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === "23505") return { error: "القيمة مستخدمة مسبقًا (مثل الرابط أو الكود). اختر قيمة أخرى." };
  if (pgCode === "23503") return { error: "لا يمكن تنفيذ العملية لارتباط هذا العنصر ببيانات أخرى." };
  if (pgCode === "23514") return { error: "إحدى القيم لا تحقق شروط الحفظ. راجع الحقول." };
  const msg = err instanceof Error ? err.message : "";
  if (/bundle cycle detected/.test(msg)) return { error: "لا يمكن الإضافة: سيؤدي ذلك إلى احتواء دائري (المحتوى يضم الحاوية نفسها)." };
  if (/bundle nesting too deep/.test(msg)) return { error: "لا يمكن الإضافة: الحد الأقصى للتداخل أربعة مستويات." };
  if (/container must be/.test(msg)) return { error: "هذا النوع لا يمكن أن يضم منتجات أخرى." };
  await reportError("admin:action", err);
  return { error: "حدث خطأ غير متوقع. حاول مرة أخرى." };
}

/** إجراء خاص بالمالك فقط (المعلم يُرفض) */
export async function adminAction(fn: (ctx: AdminCtx) => Promise<ActionState | void>): Promise<ActionState> {
  let admin;
  try {
    admin = await assertAdmin();
  } catch (err) {
    if (isDatabaseBusy(err)) return { error: DB_BUSY_MESSAGE };
    return { error: "غير مصرح لك بتنفيذ هذا الإجراء" };
  }
  try {
    const ip = await clientIp().catch(() => "unknown");
    const res = await fn({ adminId: admin.id, ip });
    return res ?? { ok: true, message: "تم الحفظ بنجاح" };
  } catch (err) {
    return toActionError(err);
  }
}

export type StaffCtx = { actor: Actor; ip: string };

/** إجراء متاح للمالك والمعلم — كل دالة مسؤولة عن تقييد المعلم بمحتواه */
export async function staffAction(fn: (ctx: StaffCtx) => Promise<ActionState | void>): Promise<ActionState> {
  let actor: Actor;
  try {
    actor = await assertStaff();
  } catch (err) {
    if (isDatabaseBusy(err)) return { error: DB_BUSY_MESSAGE };
    return { error: "غير مصرح لك بتنفيذ هذا الإجراء" };
  }
  try {
    const ip = await clientIp().catch(() => "unknown");
    const res = await fn({ actor, ip });
    return res ?? { ok: true, message: "تم الحفظ بنجاح" };
  } catch (err) {
    return toActionError(err);
  }
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function int(fd: FormData, key: string, fallback = 0): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export { isUuid, UUID_RE } from "@/lib/uuid";
