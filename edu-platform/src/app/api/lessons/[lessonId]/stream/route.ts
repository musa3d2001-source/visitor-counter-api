import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { checkLessonAccess } from "@/server/access/lessons";
import { storage } from "@/server/storage";
import { logAccess } from "@/server/platform/audit";
import { ipFromHeaders } from "@/server/http";

/**
 * بث فيديو الدرس (المزود file):
 * - مع Supabase: تحويل إلى رابط موقّع قصير الصلاحية بعد التحقق من الصلاحية
 * - مع التخزين المحلي: بث مع دعم Range
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await ctx.params;
  const user = await getCurrentUser();
  const access = await checkLessonAccess(lessonId, user);
  if (!access.ok) {
    const status = { unauthenticated: 401, forbidden: 403, not_ready: 409, not_found: 404 }[access.reason];
    if (access.reason === "forbidden") {
      await logAccess({ userId: user?.id ?? null, lessonId: /^[0-9a-f-]{36}$/i.test(lessonId) ? lessonId : null, action: "denied", ip: ipFromHeaders(req.headers), userAgent: req.headers.get("user-agent") });
    }
    return new NextResponse(null, { status, headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex" } });
  }
  const l = access.lesson;
  if (l.provider !== "file") return new NextResponse(null, { status: 404 });

  const range = req.headers.get("range");
  if (!range || range.startsWith("bytes=0-")) {
    await logAccess({ userId: user?.id ?? null, productId: l.product_id, lessonId: l.id, action: "video", ip: ipFromHeaders(req.headers), userAgent: req.headers.get("user-agent") });
  }
  const store = storage();
  const signed = await store.signedUrl("private", l.video_ref, 60 * 30);
  if (signed) return NextResponse.redirect(signed, { status: 302, headers: { "cache-control": "private, no-store" } });

  const stat = await store.stat("private", l.video_ref);
  if (!stat || !store.readRange) return new NextResponse(null, { status: 404 });
  const size = stat.size;
  let start = 0;
  let end = size - 1;
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    if (m[1]) start = Number(m[1]);
    if (m[2]) end = Math.min(Number(m[2]), size - 1);
    if (!m[1] && m[2]) {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    }
    // نحد كل جزء بـ 4MB
    end = Math.min(end, start + 4 * 1024 * 1024 - 1);
    if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }
  const stream = await store.readRange("private", l.video_ref, start, end);
  return new NextResponse(stream, {
    status: m ? 206 : 200,
    headers: {
      "content-type": l.mime_type ?? "video/mp4",
      "content-length": String(end - start + 1),
      "accept-ranges": "bytes",
      ...(m ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
      "content-disposition": "inline",
    },
  });
}
