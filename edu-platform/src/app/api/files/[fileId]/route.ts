import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { checkFileAccess } from "@/server/access/entitlements";
import { bytesToStream, loadDeliverablePdf } from "@/server/access/delivery";
import { PdfUnusableError } from "@/server/access/pdf";
import { recordFileCheck, statusForProblem } from "@/server/access/file-check";
import { logAccess } from "@/server/platform/audit";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { ipFromHeaders } from "@/server/http";

/**
 * تسليم ملفات PDF المحمية:
 * - التحقق من الهوية والملكية على الخادم لكل طلب (لا روابط تخزين دائمة)
 * - علامة مائية ديناميكية بهوية المشتري
 * - التنزيل المباشر فقط للمنتجات المسموح تنزيلها
 * - منع الفهرسة والتخزين المؤقت
 */
const NO_STORE = {
  "cache-control": "private, no-store, max-age=0",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

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

function errorPage(status: number, message: string) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>تعذر فتح الملف</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7f6;color:#172026;font-family:system-ui,sans-serif"><main style="box-sizing:border-box;max-width:26rem;margin:16px;padding:24px;background:#fff;border-radius:20px;text-align:center"><h1 style="margin:0 0 12px;font-size:1.25rem">تعذر فتح الملف</h1><p style="margin:0 0 20px;line-height:1.9">${escapeHtml(message)}</p><a href="/library" style="display:inline-block;padding:12px 20px;border-radius:14px;background:#0a6b66;color:#fff;text-decoration:none;font-weight:700">العودة إلى مكتبتي</a></main></body></html>`;
  return new NextResponse(html, { status, headers: { ...NO_STORE, "content-type": "text/html; charset=utf-8" } });
}

function refuse(req: NextRequest, status: number, message: string) {
  return isDocumentNavigation(req) ? errorPage(status, message) : NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;
  const user = await getCurrentUser();
  const ip = ipFromHeaders(req.headers);
  const ua = req.headers.get("user-agent");

  const limit = await hitRateLimit(`files:${user?.id ?? ip}`, user ? 200 : 60, 10 * 60);
  if (!limit.allowed) return refuse(req, 429, "طلبات كثيرة، حاول بعد قليل");

  const access = await checkFileAccess(fileId, user);
  if (!access.ok) {
    if (access.reason === "forbidden") {
      await logAccess({ userId: user?.id ?? null, fileId: /^[0-9a-f-]{36}$/i.test(fileId) ? fileId : null, action: "denied", ip, userAgent: ua });
      return refuse(req, 403, "لا تملك صلاحية الوصول لهذا الملف");
    }
    if (access.reason === "unauthenticated") return refuse(req, 401, "يجب تسجيل الدخول");
    return refuse(req, 404, "الملف غير موجود");
  }

  const wantDownload = req.nextUrl.searchParams.get("download") === "1";
  const isMain = access.file.kind === "main";
  const canDownload = !isMain || access.product.isDownloadable || user?.role === "admin";
  if (wantDownload && !canDownload) return refuse(req, 403, "هذا الملف متاح للقراءة داخل المنصة فقط");

  // ملفات «للقراءة فقط» تُطلب من القارئ المدمج فقط (رادع إضافي ضد الفتح المباشر للرابط)
  if (isMain && !wantDownload && !access.product.isDownloadable && user?.role !== "admin") {
    if (req.headers.get("x-reader") !== "1" || req.headers.get("sec-fetch-dest") === "document") {
      return refuse(req, 400, "افتح الملف من صفحة «مكتبتي»");
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = await loadDeliverablePdf({ storageKey: access.file.storageKey, kind: access.file.kind, user, productId: access.product.id, checkStatus: access.file.checkStatus });
  } catch (err) {
    console.error("[files] delivery failed", err);
    // ملف نجح في الفحص لا يتلف وحده: تعثر ختمه الآن (مهلة أو ضغط على الخادم) عارض، فلا يوصف بأنه معيب
    if (err instanceof PdfUnusableError && access.file.checkStatus !== "ok") {
      // ملف قديم لم يُفحص: يظهر للمالك فورًا في «سلامة المحتوى» بدل أن يفشل عند الطالب بصمت
      await recordFileCheck(access.file.id, statusForProblem(err.problem)).catch((e) => console.error("[files] flag failed", e));
      return refuse(req, 503, "هذا الملف يحتاج إلى إصلاح من إدارة المنصة، وقد سُجلت المشكلة لديهم. وصولك إليه محفوظ.");
    }
    return refuse(req, 500, "تعذر تحميل الملف حاليًا. حاول مرة أخرى بعد قليل.");
  }

  await logAccess({
    userId: user?.id ?? null,
    productId: access.product.id,
    fileId: access.file.id,
    action: access.file.kind === "preview" ? "preview" : wantDownload ? "download" : "view",
    ip,
    userAgent: ua,
  });

  const filename = `${access.file.title}.pdf`.replace(/[\\/:*?"<>|\r\n]/g, "_");
  return new NextResponse(bytesToStream(bytes), {
    status: 200,
    headers: {
      ...NO_STORE,
      "content-type": "application/pdf",
      "content-length": String(bytes.length),
      "content-disposition": `${wantDownload ? "attachment" : "inline"}; filename="file.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
