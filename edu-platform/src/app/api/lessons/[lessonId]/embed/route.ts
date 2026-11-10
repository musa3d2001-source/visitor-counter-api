import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { checkLessonAccess, playbackFor } from "@/server/access/lessons";
import { bunnyConfigured } from "@/server/video/bunny";
import { logAccess } from "@/server/platform/audit";
import { ipFromHeaders, isSameOriginRequest } from "@/server/http";
import { hitDeniedStreamLimit, hitEmbedRenewLimit } from "@/server/video/stream-limit";
import { isUuid } from "@/lib/uuid";
import { withBusyGuard } from "@/server/busy-response";

const NO_STORE = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };

function tooManyRequests(retryAfterSeconds: number) {
  return new NextResponse(null, { status: 429, headers: { ...NO_STORE, "retry-after": String(Math.max(1, retryAfterSeconds)) } });
}

/**
 * تجديد رابط تضمين درس Bunny قبل انتهائه. لا يُجدد إلا لمن ما زالت صلاحيته قائمة الآن:
 * من استُرد مبلغه أو أوقف حسابه أو حُجب درسه يتوقف عند أول تجديد، ولا ينتظر انتهاء رابط طويل.
 */
async function handlePOST(req: NextRequest, ctx: { params: Promise<{ lessonId: string }> }) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { lessonId } = await ctx.params;
  const user = await getCurrentUser();
  const access = await checkLessonAccess(lessonId, user);
  const ip = ipFromHeaders(req.headers);
  if (!access.ok) {
    const denied = await hitDeniedStreamLimit(user?.id ?? null, ip);
    if (!denied.allowed) return tooManyRequests(denied.retryAfterSeconds);
    const status = { unauthenticated: 401, forbidden: 403, not_ready: 409, not_found: 404 }[access.reason];
    if (access.reason === "forbidden") {
      await logAccess({ userId: user?.id ?? null, lessonId: isUuid(lessonId) ? lessonId : null, action: "denied", ip, userAgent: req.headers.get("user-agent") });
    }
    return new NextResponse(null, { status, headers: NO_STORE });
  }
  const allowed = await hitEmbedRenewLimit(user?.id ?? null, ip);
  if (!allowed.allowed) return tooManyRequests(allowed.retryAfterSeconds);
  const lesson = access.lesson;
  if (lesson.provider !== "bunny") return new NextResponse(null, { status: 404, headers: NO_STORE });
  if (!bunnyConfigured()) return new NextResponse(null, { status: 503, headers: { ...NO_STORE, "retry-after": "60" } });

  await logAccess({ userId: user?.id ?? null, productId: lesson.product_id, lessonId: lesson.id, action: "video", ip, userAgent: req.headers.get("user-agent") });
  const playback = playbackFor(lesson);
  if (playback.kind !== "bunny") return new NextResponse(null, { status: 404, headers: NO_STORE });
  return NextResponse.json({ embedUrl: playback.embedUrl, expiresInSeconds: playback.expiresInSeconds }, { headers: NO_STORE });
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const POST = withBusyGuard(handlePOST);
