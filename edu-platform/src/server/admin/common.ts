import "server-only";
import { assertAdmin } from "../auth/guards";
import type { ActionState } from "@/lib/action-state";
import { clientIp } from "../http";

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

export async function adminAction(fn: (ctx: AdminCtx) => Promise<ActionState | void>): Promise<ActionState> {
  let admin;
  try {
    admin = await assertAdmin();
  } catch {
    return { error: "غير مصرح لك بتنفيذ هذا الإجراء" };
  }
  try {
    const ip = await clientIp().catch(() => "unknown");
    const res = await fn({ adminId: admin.id, ip });
    return res ?? { ok: true, message: "تم الحفظ بنجاح" };
  } catch (err) {
    if (err instanceof AdminError) return { error: err.userMessage, fieldErrors: err.fieldErrors };
    // إعادة رمي أخطاء التوجيه الخاصة بـ Next.js (redirect/notFound)
    if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && String((err as { digest: string }).digest).startsWith("NEXT_")) {
      throw err;
    }
    const pgCode = (err as { code?: string })?.code;
    if (pgCode === "23505") return { error: "القيمة مستخدمة مسبقًا (مثل الرابط أو الكود). اختر قيمة أخرى." };
    if (pgCode === "23503") return { error: "لا يمكن تنفيذ العملية لارتباط هذا العنصر ببيانات أخرى." };
    if (pgCode === "23514") return { error: "إحدى القيم لا تحقق شروط الحفظ. راجع الحقول." };
    console.error("[admin-action]", err);
    return { error: "حدث خطأ غير متوقع. حاول مرة أخرى." };
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

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string | null | undefined): v is string {
  return Boolean(v && UUID_RE.test(v));
}
