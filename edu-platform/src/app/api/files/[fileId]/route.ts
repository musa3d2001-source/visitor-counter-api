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

function json(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;
  const user = await getCurrentUser();
  const ip = ipFromHeaders(req.headers);
  const ua = req.headers.get("user-agent");

  const limit = await hitRateLimit(`files:${user?.id ?? ip}`, user ? 200 : 60, 10 * 60);
  if (!limit.allowed) return json(429, "طلبات كثيرة، حاول بعد قليل");

  const access = await checkFileAccess(fileId, user);
  if (!access.ok) {
    if (access.reason === "forbidden") {
      await logAccess({ userId: user?.id ?? null, fileId: /^[0-9a-f-]{36}$/i.test(fileId) ? fileId : null, action: "denied", ip, userAgent: ua });
      return json(403, "لا تملك صلاحية الوصول لهذا الملف");
    }
    if (access.reason === "unauthenticated") return json(401, "يجب تسجيل الدخول");
    return json(404, "الملف غير موجود");
  }

  const wantDownload = req.nextUrl.searchParams.get("download") === "1";
  const isMain = access.file.kind === "main";
  const canDownload = !isMain || access.product.isDownloadable || user?.role === "admin";
  if (wantDownload && !canDownload) return json(403, "هذا الملف متاح للقراءة داخل المنصة فقط");

  // ملفات «للقراءة فقط» تُطلب من القارئ المدمج فقط (رادع إضافي ضد الفتح المباشر للرابط)
  if (isMain && !wantDownload && !access.product.isDownloadable && user?.role !== "admin") {
    if (req.headers.get("x-reader") !== "1" || req.headers.get("sec-fetch-dest") === "document") {
      return json(400, "افتح الملف من صفحة «مكتبتي»");
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = await loadDeliverablePdf({ storageKey: access.file.storageKey, kind: access.file.kind, user, productId: access.product.id });
  } catch (err) {
    console.error("[files] delivery failed", err);
    if (err instanceof PdfUnusableError) {
      // ملف قديم لم يُفحص: يظهر للمالك فورًا في «سلامة المحتوى» بدل أن يفشل عند الطالب بصمت
      await recordFileCheck(access.file.id, statusForProblem(err.problem)).catch((e) => console.error("[files] flag failed", e));
      return json(503, "هذا الملف يحتاج إلى إصلاح من إدارة المنصة، وقد سُجلت المشكلة لديهم. وصولك إليه محفوظ.");
    }
    return json(500, "تعذر تحميل الملف حاليًا");
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
