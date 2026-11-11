import { NextResponse } from "next/server";
import { storage, StorageNotFoundError } from "@/server/storage";
import { verifyLocalCopyToken } from "@/server/storage/local";
import { withBusyGuard } from "@/server/busy-response";

/**
 * رابط النسخة المختومة في التخزين المحلي فقط (بديل رابط Supabase الموقّع، القرار F22): للاختبارات وأداة الحمل والتشغيل المحلي.
 * لا جلسة: الرمز الموقّع هو الإذن كما في Supabase، ولا يصدر إلا بعد فحص الصلاحية وتسجيل الوصول في /api/files/[fileId]،
 * لمفتاح نسخة مختومة فقط، ولدقيقة واحدة. على Supabase يرد 404 دائمًا.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = {
  "cache-control": "private, no-store, max-age=0",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

async function handleGET(req: Request) {
  if (storage().name !== "local") return NextResponse.json({ error: "غير متاح" }, { status: 404, headers: NO_STORE });
  const claims = verifyLocalCopyToken(new URL(req.url).searchParams.get("t") ?? "");
  if (!claims) return NextResponse.json({ error: "انتهت صلاحية الرابط. افتح الملف من مكتبتك مرة أخرى." }, { status: 403, headers: NO_STORE });
  let object: Awaited<ReturnType<ReturnType<typeof storage>["readStream"]>>;
  try {
    object = await storage().readStream("private", claims.k);
  } catch (err) {
    if (err instanceof StorageNotFoundError) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404, headers: NO_STORE });
    throw err;
  }
  const disposition = claims.d === null ? "inline" : `attachment; filename="file.pdf"; filename*=UTF-8''${encodeURIComponent(claims.d)}`;
  return new NextResponse(object.stream, {
    status: 200,
    headers: {
      ...NO_STORE,
      "content-type": "application/pdf",
      ...(object.size !== null ? { "content-length": String(object.size) } : {}),
      "content-disposition": disposition,
    },
  });
}

/** يتبع قاعدة مسارات API كلها: انشغال قاعدة البيانات 503 مع Retry-After (هذا المسار لا يقرأ قاعدة البيانات أصلًا) */
export const GET = withBusyGuard(handleGET);
