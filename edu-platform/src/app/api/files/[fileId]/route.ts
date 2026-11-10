import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { checkFileAccess } from "@/server/access/entitlements";
import { FILE_OPEN_LIMITS, openDeliverablePdf, OverStampLimitError, StampInProgressError, type PdfBody } from "@/server/access/delivery";
import { PdfUnusableError, StampDeadlineError } from "@/server/access/pdf";
import { StampBusyError, STAMP_GATE_DEFAULTS } from "@/server/access/stamp-gate";
import { recordFileCheck, statusForProblem } from "@/server/access/file-check";
import { logAccess } from "@/server/platform/audit";
import { reportError } from "@/server/platform/report-error";
import { noteSaturation } from "@/server/platform/saturation";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { ipFromHeaders } from "@/server/http";
import { isUuid } from "@/lib/uuid";
import { withBusyGuard } from "@/server/busy-response";
import { isDatabaseBusy } from "@/server/db-busy";
import { INLINE_PAGE_CSP } from "@/lib/security-headers";
import { FILE_BUSY_MESSAGE, FILE_PREPARING_MESSAGE, FILE_TOO_MANY_OPENS_MESSAGE } from "@/lib/reader-error";

/**
 * تسليم ملفات PDF:
 * - الهوية وحالة الحساب والصلاحية تُفحص على الخادم في كل طلب، قبل أي نسخة محفوظة، ولا تُخزَّن نتيجتها.
 *   استرداد أو سحب صلاحية يوقف التسليم فورًا ولو بقيت نسخة مختومة في التخزين.
 * - الملف المدفوع لا يُسلَّم إلا مختومًا بهوية المشتري (server/access/delivery.ts).
 * - لا روابط تخزين للمتصفح أبدًا: البايتات تمر عبر هذا المسار.
 * - الملف المدفوع لا يُخزن في المتصفح ولا في أي وسيط (no-store)، والمعاينة المجانية يعيد المتصفح استعمالها.
 */
const NO_STORE = {
  "cache-control": "private, no-store, max-age=0",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

/** المعاينة ليست سرًا ولا تحمل هوية: المتصفح وحده يحتفظ بها ساعة (private: لا CDN ولا وسيط مشترك) */
const PREVIEW_CACHE = "private, max-age=3600";

/**
 * مهلة التسليم: قراءة الملف + ختمه + بث النسخة إلى هاتف بطيء، والبث جزء من مدة الدالة.
 * 300 ثانية هي أقصى مهلة تسمح بها خطة Hobby في Vercel (Fluid Compute)، وتكفي الخطط الأعلى.
 * القياسات وحدود الملفات في docs/PDF_STAMPING.md
 */
export const maxDuration = 300;

/** فتح الرابط في المتصفح مباشرة (زر التنزيل على الهاتف) لا يجب أن ينتهي بنص JSON خام */
function isDocumentNavigation(req: NextRequest) {
  if (req.headers.get("x-reader") === "1") return false;
  return req.headers.get("sec-fetch-dest") === "document" || (req.headers.get("accept") ?? "").includes("text/html");
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** refreshSeconds: الصفحة تعيد الطلب وحدها بعد الانتظار (انشغال مؤقت)، ويقال ذلك للطالب */
function errorPage(status: number, message: string, refreshSeconds?: number, extraHeaders: Record<string, string> = {}) {
  const refresh = refreshSeconds ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : "";
  const title = refreshSeconds ? "لحظات ويُفتح الملف" : "تعذر فتح الملف";
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">${refresh}<title>${title}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7f6;color:#172026;font-family:system-ui,sans-serif"><main style="box-sizing:border-box;max-width:26rem;margin:16px;padding:24px;background:#fff;border-radius:20px;text-align:center"><h1 style="margin:0 0 12px;font-size:1.25rem">${title}</h1><p style="margin:0 0 20px;line-height:1.9">${escapeHtml(message)}</p><a href="/library" style="display:inline-block;padding:12px 20px;border-radius:14px;background:#0a6b66;color:#fff;text-decoration:none;font-weight:700">العودة إلى مكتبتي</a></main></body></html>`;
  // صفحة HTML ثابتة خارج proxy: سياسة خاصة بها (أنماط مضمنة فقط، لا سكربت)
  return new NextResponse(html, { status, headers: { ...NO_STORE, ...extraHeaders, "content-type": "text/html; charset=utf-8", "content-security-policy": INLINE_PAGE_CSP } });
}

function refuse(req: NextRequest, status: number, message: string) {
  return isDocumentNavigation(req) ? errorPage(status, message) : NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

/** رفض مؤقت: Retry-After دائمًا. القارئ المدمج يعيد المحاولة وحده، وصفحة الرابط المباشر تتحدث وحدها */
function retryLater(req: NextRequest, status: 429 | 503, retryAfterSeconds: number, message: string, autoRetry: boolean) {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  const headers = { "retry-after": String(seconds) };
  if (isDocumentNavigation(req)) return errorPage(status, message, autoRetry ? seconds : undefined, headers);
  return NextResponse.json({ error: message, retry: autoRetry }, { status, headers: { ...NO_STORE, ...headers } });
}

const previewTag = (storageKey: string) => `"p-${createHash("sha256").update(storageKey).digest("base64url").slice(0, 22)}"`;

async function handleGET(req: NextRequest, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;
  const user = await getCurrentUser();
  const ip = ipFromHeaders(req.headers);
  const ua = req.headers.get("user-agent");

  const limit = user
    ? await hitRateLimit(`files:${user.id}`, FILE_OPEN_LIMITS.perAccount, FILE_OPEN_LIMITS.windowSeconds)
    : await hitRateLimit(`files-ip:${ip}`, FILE_OPEN_LIMITS.perAnonymousIp, FILE_OPEN_LIMITS.windowSeconds);
  if (!limit.allowed) return retryLater(req, 429, limit.retryAfterSeconds, FILE_TOO_MANY_OPENS_MESSAGE, false);

  // الصلاحية قبل أي نسخة محفوظة، في كل طلب
  const access = await checkFileAccess(fileId, user);
  if (!access.ok) {
    if (access.reason === "forbidden") {
      await logAccess({ userId: user?.id ?? null, fileId: isUuid(fileId) ? fileId : null, action: "denied", ip, userAgent: ua });
      return refuse(req, 403, "لا تملك صلاحية الوصول لهذا الملف");
    }
    if (access.reason === "unauthenticated") return refuse(req, 401, "يجب تسجيل الدخول");
    return refuse(req, 404, "الملف غير موجود");
  }

  const wantDownload = req.nextUrl.searchParams.get("download") === "1";
  const isMain = access.file.kind === "main";
  const canDownload = !isMain || access.product.isDownloadable || user?.role === "admin";
  if (wantDownload && !canDownload) return refuse(req, 403, "هذا الملف متاح للقراءة داخل المنصة فقط");

  /*
   * ليس حماية: الترويستان (x-reader و sec-fetch-dest) يرسلهما أي سكربت، فمشترٍ له الصلاحية يستطيع حفظ نسخته
   * المختومة باسمه مهما فعلنا هنا. هذا فقط يرد من يفتح الرابط مباشرة في المتصفح إلى القارئ برسالة واضحة.
   * ما يحمي الملف فعلًا: فحص الصلاحية أعلاه في كل طلب، والختم بهوية المشتري. لا تصف هذا في أي نص بأنه منع للتنزيل.
   */
  if (isMain && !wantDownload && !access.product.isDownloadable && user?.role !== "admin") {
    if (req.headers.get("x-reader") !== "1" || req.headers.get("sec-fetch-dest") === "document") {
      return refuse(req, 400, "افتح الملف من صفحة «مكتبتي»");
    }
  }

  const isPreview = access.file.kind === "preview";
  const etag = isPreview ? previewTag(access.file.storageKey) : null;
  const filename = `${access.file.title}.pdf`.replace(/[\\/:*?"<>|\r\n]/g, "_");
  const disposition = `${wantDownload ? "attachment" : "inline"}; filename="file.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  if (etag && req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...NO_STORE, "cache-control": PREVIEW_CACHE, etag } });
  }

  let pdf: PdfBody;
  try {
    pdf = await openDeliverablePdf(
      { id: access.file.id, productId: access.product.id, storageKey: access.file.storageKey, kind: access.file.kind, sizeBytes: access.file.sizeBytes, pageCount: access.file.pageCount, checkStatus: access.file.checkStatus },
      user ? { id: user.id, email: user.email, role: user.role } : null,
    );
  } catch (err) {
    if (isDatabaseBusy(err)) throw err;
    // انشغال مؤقت على هذه النسخة أو ختم جارٍ للنسخة نفسها: لا خطأ يُسجل، والقارئ يعيد المحاولة
    if (err instanceof StampBusyError) return retryLater(req, 503, err.retryAfterSeconds, FILE_BUSY_MESSAGE, true);
    if (err instanceof StampInProgressError) return retryLater(req, 429, err.retryAfterSeconds, FILE_PREPARING_MESSAGE, true);
    if (err instanceof StampDeadlineError) noteSaturation("stamp_deadline");
    await reportError("files:delivery", err);
    // فوق حد الختم: لا يُسلَّم أصله أبدًا. يُعلَّم ليظهر للمالك في «سلامة المحتوى»
    if (err instanceof OverStampLimitError || (err instanceof PdfUnusableError && err.problem === "over_limit")) {
      if (access.file.checkStatus !== "too_complex") await recordFileCheck(access.file.id, "too_complex").catch((e) => reportError("files:flag", e));
      return refuse(req, 503, "هذا الملف يحتاج إلى إصلاح من إدارة المنصة، وقد سُجلت المشكلة لديهم. وصولك إليه محفوظ.");
    }
    // ملف نجح في الفحص لا يتلف وحده: تجاوز ختمه مهلته الآن بسبب الضغط، فيُعاد بعد قليل
    if (err instanceof StampDeadlineError && access.file.checkStatus === "ok") return retryLater(req, 503, STAMP_GATE_DEFAULTS.retryAfterSeconds, FILE_BUSY_MESSAGE, true);
    if (err instanceof PdfUnusableError && access.file.checkStatus !== "ok") {
      // ملف قديم لم يُفحص: يظهر للمالك فورًا في «سلامة المحتوى» بدل أن يفشل عند الطالب بصمت
      await recordFileCheck(access.file.id, statusForProblem(err.problem)).catch((e) => reportError("files:flag", e));
      return refuse(req, 503, "هذا الملف يحتاج إلى إصلاح من إدارة المنصة، وقد سُجلت المشكلة لديهم. وصولك إليه محفوظ.");
    }
    return refuse(req, 500, "تعذر تحميل الملف حاليًا. حاول مرة أخرى بعد قليل.");
  }

  try {
    await logAccess({
      userId: user?.id ?? null,
      productId: access.product.id,
      fileId: access.file.id,
      action: isPreview ? "preview" : wantDownload ? "download" : "view",
      ip,
      userAgent: ua,
    });
  } catch (err) {
    // البث من التخزين مفتوح: يُغلق ولا يبقى حتى مهلته
    await pdf.body.cancel().catch(() => {});
    throw err;
  }

  return new NextResponse(pdf.body, {
    status: 200,
    headers: {
      ...NO_STORE,
      ...(etag ? { "cache-control": PREVIEW_CACHE, etag } : {}),
      "content-type": "application/pdf",
      ...(pdf.size !== null ? { "content-length": String(pdf.size) } : {}),
      "content-disposition": disposition,
    },
  });
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const GET = withBusyGuard(handleGET);
