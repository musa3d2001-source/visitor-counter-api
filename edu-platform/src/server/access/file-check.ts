import "server-only";
import { sql, type Db } from "../db";
import { storage } from "../storage";
import { inspectPdf, type PdfProblem } from "./pdf";

/**
 * نتيجة فحص ملفات PDF المخزنة. الملفات الجديدة تُفحص عند الرفع،
 * والقديمة تُفحص من صفحة سلامة المحتوى أو قبل نشرها، أو تُعلَّم عند أول فشل في تسليمها لمشترٍ.
 */
export type FileCheckStatus = "unchecked" | "ok" | "encrypted" | "corrupt" | "too_complex" | "missing";
export type FlaggedStatus = Exclude<FileCheckStatus, "unchecked" | "ok">;

export const FLAGGED_STATUSES: FlaggedStatus[] = ["encrypted", "corrupt", "too_complex", "missing"];

export const isFlagged = (s: string) => (FLAGGED_STATUSES as string[]).includes(s);

/** سبب العيب كما يظهر للمالك والمعلم */
export const FILE_PROBLEM_LABELS: Record<FlaggedStatus, string> = {
  encrypted: "الملف محمي بكلمة مرور أو قيود",
  corrupt: "الملف تالف أو ناقص",
  too_complex: "الملف ثقيل جدًا على ختم هوية المشتري",
  missing: "الملف غير موجود في التخزين",
};

/** رسالة رفض الرفع: تقول المشكلة وما يجب فعله */
export const UPLOAD_REJECTION: Record<PdfProblem, string> = {
  not_pdf: "هذا الملف ليس PDF حقيقيًا، حتى لو كان اسمه ينتهي بـ .pdf. احفظه بصيغة PDF ثم ارفعه من جديد.",
  encrypted: "هذا الملف محمي بكلمة مرور أو قيود، ولن يفتح عند الطالب بعد ختمه باسمه. أزل الحماية، أو احفظ نسخة PDF جديدة بدون حماية، ثم ارفعه من جديد.",
  corrupt: "هذا الملف تالف أو لم يكتمل. افتحه للتأكد منه، أو صدّره بصيغة PDF من جديد ثم ارفعه.",
  too_complex: "هذا الملف ثقيل جدًا ولا يمكن ختمه باسم الطالب في وقت معقول. قسّمه إلى ملفين أو أكثر، أو صدّره بحجم أصغر ثم ارفعه.",
};

export const statusForProblem = (p: PdfProblem): FlaggedStatus => (p === "not_pdf" ? "corrupt" : p);

export async function recordFileCheck(fileId: string, status: FileCheckStatus, db: Db = sql) {
  await db`update product_files set check_status = ${status}, checked_at = now() where id = ${fileId}`;
}

/** يفحص ملفًا مخزنًا ويسجل النتيجة. خطأ التخزين العابر يُرمى ولا يُسجَّل، فلا يوصف ملف سليم بأنه معيب */
export async function checkStoredFile(file: { id: string; storage_key: string }): Promise<FileCheckStatus> {
  const stat = await storage().stat("private", file.storage_key);
  if (!stat) {
    await recordFileCheck(file.id, "missing");
    return "missing";
  }
  const result = await inspectPdf(await storage().read("private", file.storage_key));
  const status: FileCheckStatus = result.ok ? "ok" : statusForProblem(result.problem);
  await recordFileCheck(file.id, status);
  return status;
}

/** قبل النشر: كل ملف رئيسي لم يُفحص بعد يُفحص الآن، حتى لا يصل ملف قديم معيب إلى مشترٍ */
export async function ensureProductFilesChecked(productId: string): Promise<void> {
  const files = await sql<{ id: string; storage_key: string }[]>`
    select id, storage_key from product_files where product_id = ${productId} and kind = 'main' and check_status = 'unchecked'
  `;
  for (const f of files) await checkStoredFile(f);
}
