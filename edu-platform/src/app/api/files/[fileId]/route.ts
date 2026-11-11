import { createHash, randomInt } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { checkFileAccess } from "@/server/access/entitlements";
import { FILE_OPEN_LIMITS, openDeliverablePdf, OverStampLimitError, StampInProgressError, type DeliverableFile, type DeliveryUser, type PdfDelivery } from "@/server/access/delivery";
import { PdfUnusableError, StampDeadlineError } from "@/server/access/pdf";
import { StampBusyError, STAMP_GATE_DEFAULTS } from "@/server/access/stamp-gate";
import { recordFileCheck, statusForProblem } from "@/server/access/file-check";
import { logAccess } from "@/server/platform/audit";
import { reportError } from "@/server/platform/report-error";
import { noteSaturation } from "@/server/platform/saturation";
import { hitRateLimit, refundRateLimit } from "@/server/auth/rate-limit";
import { storage, STAMPED_COPY_URL_MAX_SECONDS } from "@/server/storage";
import { ipFromHeaders } from "@/server/http";
import { isUuid } from "@/lib/uuid";
import { withBusyGuard } from "@/server/busy-response";
import { isDatabaseBusy } from "@/server/db-busy";
import { INLINE_PAGE_CSP } from "@/lib/security-headers";
import { FILE_BUSY_MESSAGE, FILE_NEEDS_REPAIR_MESSAGE, FILE_PREPARING_MESSAGE, FILE_TOO_MANY_OPENS_MESSAGE, READER_DELIVERY_HEADER, type FileAnswerCode, type FileLinkAnswer } from "@/lib/reader-error";

/**
 * تسليم ملفات PDF:
 * - الهوية وحالة الحساب والصلاحية تُفحص على الخادم في كل طلب، قبل أي نسخة محفوظة، ولا تُخزَّن نتيجتها.
 *   استرداد أو سحب صلاحية يوقف التسليم فورًا ولو بقيت نسخة مختومة في التخزين.
 * - الملف المدفوع لا يُسلَّم إلا مختومًا بهوية المشتري (server/access/delivery.ts).
 * - نسخة المشتري المختومة المحفوظة تُسلَّم برابط تخزين موقّع عمره ٦٠ ثانية على الأكثر (القرار F22، يحل محل قاعدة
 *   «لا روابط تخزين للمتصفح أبدًا»): يصدر في كل طلب بعد الفحص أعلاه وبعد تسجيل الوصول، لنسخة هذا المشتري وحده.
 *   الأصل لا يُوقَّع أبدًا (storage/types.ts يرفض أي مفتاح غير نسخة مختومة)، والرابط لا يُكتب في سجل ولا في صفحة.
 *   القارئ يأخذه JSON ويتبعه دون كوكي، والتنزيل والفتح المباشر في المتصفح يأخذانه 303.
 *   ما عدا ذلك (معاينة، أصل للمالك، نسخة لم تُحفظ، قارئ قديم، تعذر التوقيع) يمر بايتات عبر هذا المسار كما كان.
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
 * مهلة التسليم: قراءة الملف + ختمه + بث النسخة إلى هاتف بطيء حين لا يُسلَّم رابط، والبث جزء من مدة الدالة.
 * 300 ثانية هي أقصى مهلة تسمح بها خطة Hobby في Vercel (Fluid Compute)، وتكفي الخطط الأعلى.
 * النسخة المحفوظة تُسلَّم رابطًا، فطلبها ينتهي في أجزاء من الثانية. القياسات وحدود الملفات في docs/PDF_STAMPING.md
 */
export const maxDuration = 300;

/** عمر رابط النسخة المختومة: أقصى ما يسمح به القرار F22 */
const COPY_LINK_SECONDS = STAMPED_COPY_URL_MAX_SECONDS;

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

/** رفض نهائي لهذا الطلب. الشكل ثابت { error, code } (البند R017)، والرمز في lib/reader-error.ts */
function refuse(req: NextRequest, status: number, message: string, code: FileAnswerCode) {
  return isDocumentNavigation(req) ? errorPage(status, message) : NextResponse.json({ error: message, code }, { status, headers: NO_STORE });
}

/**
 * رفض مؤقت: Retry-After دائمًا، والشكل { error, code, retry }. القارئ المدمج يعيد المحاولة وحده، وصفحة الرابط المباشر تتحدث وحدها.
 * الإعادة التلقائية تنتظر المدة الأساسية وجزءًا عشوائيًا منها حتى ضعفها (البند R017): طلاب رُدوا في اللحظة نفسها
 * لا يعودون في اللحظة نفسها موجةً بعد موجة.
 */
function retryLater(req: NextRequest, status: 429 | 503, retryAfterSeconds: number, message: string, autoRetry: boolean, code: FileAnswerCode) {
  const base = Math.max(1, Math.ceil(retryAfterSeconds));
  const seconds = autoRetry ? base + randomInt(0, base + 1) : base;
  const headers = { "retry-after": String(seconds) };
  if (isDocumentNavigation(req)) return errorPage(status, message, autoRetry ? seconds : undefined, headers);
  return NextResponse.json({ error: message, code, retry: autoRetry }, { status, headers: { ...NO_STORE, ...headers } });
}

/**
 * رد «مشغول» لم يُسلَّم فيه شيء لا يُحتسب من حد الفتح (البند R010). للإعادات سقف خاص أعلى، فلا يصير الانشغال بابًا بلا حد.
 * بأفضل جهد: تعثرها لا يغير الرد، ويبقى الفتح محتسبًا كما كان.
 */
async function giveBackOpen(userId: string) {
  try {
    const retries = await hitRateLimit(`files-retry:${userId}`, FILE_OPEN_LIMITS.retriesPerAccount, FILE_OPEN_LIMITS.windowSeconds);
    if (retries.allowed) await refundRateLimit(`files:${userId}`);
  } catch (err) {
    if (!isDatabaseBusy(err)) await reportError("files:open-refund", err);
  }
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
  if (!limit.allowed) return retryLater(req, 429, limit.retryAfterSeconds, FILE_TOO_MANY_OPENS_MESSAGE, false, "too_many_opens");

  // الصلاحية قبل أي نسخة محفوظة وقبل أي رابط، في كل طلب
  const access = await checkFileAccess(fileId, user);
  if (!access.ok) {
    if (access.reason === "forbidden") {
      await logAccess({ userId: user?.id ?? null, fileId: isUuid(fileId) ? fileId : null, action: "denied", ip, userAgent: ua });
      return refuse(req, 403, "لا تملك صلاحية الوصول لهذا الملف", "denied");
    }
    if (access.reason === "unauthenticated") return refuse(req, 401, "يجب تسجيل الدخول", "signin");
    return refuse(req, 404, "الملف غير موجود", "not_found");
  }

  const wantDownload = req.nextUrl.searchParams.get("download") === "1";
  const isMain = access.file.kind === "main";
  const canDownload = !isMain || access.product.isDownloadable || user?.role === "admin";
  if (wantDownload && !canDownload) return refuse(req, 403, "هذا الملف متاح للقراءة داخل المنصة فقط", "read_only");

  /*
   * ليس حماية: الترويستان (x-reader و sec-fetch-dest) يرسلهما أي سكربت، فمشترٍ له الصلاحية يستطيع حفظ نسخته
   * المختومة باسمه مهما فعلنا هنا. هذا فقط يرد من يفتح الرابط مباشرة في المتصفح إلى القارئ برسالة واضحة.
   * ما يحمي الملف فعلًا: فحص الصلاحية أعلاه في كل طلب، والختم بهوية المشتري. لا تصف هذا في أي نص بأنه منع للتنزيل.
   */
  if (isMain && !wantDownload && !access.product.isDownloadable && user?.role !== "admin") {
    if (req.headers.get("x-reader") !== "1" || req.headers.get("sec-fetch-dest") === "document") {
      return refuse(req, 400, "افتح الملف من صفحة «مكتبتي»", "open_from_library");
    }
  }

  const isPreview = access.file.kind === "preview";
  const etag = isPreview ? previewTag(access.file.storageKey) : null;
  const filename = `${access.file.title}.pdf`.replace(/[\\/:*?"<>|\r\n]/g, "_");
  const disposition = `${wantDownload ? "attachment" : "inline"}; filename="file.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  if (etag && req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...NO_STORE, "cache-control": PREVIEW_CACHE, etag } });
  }

  // من يتبع رابطًا: القارئ الذي يقول ذلك، والتنزيل، والمتصفح يفتح الملف بنفسه. قارئ قديم (أو via=stream بعد تعثر الرابط) يأخذ البايتات
  const readerTakesLink = req.headers.get(READER_DELIVERY_HEADER) === "url";
  const followsLink = req.nextUrl.searchParams.get("via") !== "stream" && (readerTakesLink || wantDownload || isDocumentNavigation(req));
  const deliverable: DeliverableFile = {
    id: access.file.id,
    productId: access.product.id,
    storageKey: access.file.storageKey,
    kind: access.file.kind,
    sizeBytes: access.file.sizeBytes,
    pageCount: access.file.pageCount,
    checkStatus: access.file.checkStatus,
  };
  const who: DeliveryUser | null = user ? { id: user.id, email: user.email, role: user.role } : null;

  /** يفتح الملف ويحول كل تعثر إلى رد ثابت الشكل. ما يُرد هنا لم يُسلَّم فيه شيء */
  const open = async (preferStream: boolean): Promise<PdfDelivery | Response> => {
    try {
      return await openDeliverablePdf(deliverable, who, { preferStream });
    } catch (err) {
      if (isDatabaseBusy(err)) throw err;
      // انشغال مؤقت على هذه النسخة أو ختم جارٍ للنسخة نفسها: لا خطأ يُسجل، والقارئ يعيد المحاولة، ولا يُحتسب الفتح
      if (err instanceof StampBusyError) {
        if (user) await giveBackOpen(user.id);
        return retryLater(req, 503, err.retryAfterSeconds, FILE_BUSY_MESSAGE, true, "busy");
      }
      if (err instanceof StampInProgressError) {
        if (user) await giveBackOpen(user.id);
        return retryLater(req, 429, err.retryAfterSeconds, FILE_PREPARING_MESSAGE, true, "preparing");
      }
      if (err instanceof StampDeadlineError) noteSaturation("stamp_deadline");
      await reportError("files:delivery", err);
      // فوق حد الختم: لا يُسلَّم أصله أبدًا. يُعلَّم ليظهر للمالك في «سلامة المحتوى»
      if (err instanceof OverStampLimitError || (err instanceof PdfUnusableError && err.problem === "over_limit")) {
        if (access.file.checkStatus !== "too_complex") await recordFileCheck(access.file.id, "too_complex").catch((e) => reportError("files:flag", e));
        return refuse(req, 503, FILE_NEEDS_REPAIR_MESSAGE, "repair");
      }
      // ملف نجح في الفحص لا يتلف وحده: تجاوز ختمه مهلته الآن بسبب الضغط، فيُعاد بعد قليل
      if (err instanceof StampDeadlineError && access.file.checkStatus === "ok") {
        if (user) await giveBackOpen(user.id);
        return retryLater(req, 503, STAMP_GATE_DEFAULTS.retryAfterSeconds, FILE_BUSY_MESSAGE, true, "busy");
      }
      if (err instanceof PdfUnusableError && access.file.checkStatus !== "ok") {
        // ملف قديم لم يُفحص: يظهر للمالك فورًا في «سلامة المحتوى» بدل أن يفشل عند الطالب بصمت
        await recordFileCheck(access.file.id, statusForProblem(err.problem)).catch((e) => reportError("files:flag", e));
        return refuse(req, 503, FILE_NEEDS_REPAIR_MESSAGE, "repair");
      }
      return refuse(req, 500, "تعذر تحميل الملف حاليًا. حاول مرة أخرى بعد قليل.", "failed");
    }
  };

  let pdf = await open(!followsLink);
  if (pdf instanceof Response) return pdf;

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
    if (pdf.kind === "stream") await pdf.body.cancel().catch(() => {});
    throw err;
  }

  if (pdf.kind === "copy") {
    // بعد الفحص وتسجيل الوصول: رابط جديد لهذا الطلب وحده، لنسخة هذا المشتري وحده. الرابط لا يُكتب في أي سجل
    const link = await storage()
      .stampedCopyUrl(pdf.objectKey, COPY_LINK_SECONDS, wantDownload ? filename : null)
      .catch(async (err: unknown) => {
        await reportError("files:copy-link", err);
        return null;
      });
    if (link) {
      if (readerTakesLink && !wantDownload) {
        const answer: FileLinkAnswer = { url: link, size: pdf.size, expiresIn: COPY_LINK_SECONDS };
        return NextResponse.json(answer, { headers: NO_STORE });
      }
      return new NextResponse(null, { status: 303, headers: { ...NO_STORE, location: link } });
    }
    // تعذر الرابط (التخزين لا يوقّع الآن، أو ضاع الكائن): البث عبر هذا المسار كما كان قبل F22. الوصول سُجل أعلاه
    const streamed = await open(true);
    if (streamed instanceof Response) return streamed;
    pdf = streamed;
  }
  if (pdf.kind !== "stream") throw new Error("a kept copy was not streamed");

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
