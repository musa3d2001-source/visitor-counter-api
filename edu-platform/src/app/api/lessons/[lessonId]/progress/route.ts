import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, hashToken, SESSION_COOKIE } from "@/server/auth/session";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { checkLessonAccess } from "@/server/access/lessons";
import { isSameOriginRequest, readBodyCapped } from "@/server/http";
import { BEAT_LIMIT_PER_MINUTE, BEAT_WINDOW_SECONDS, recordBeat, refusedFromMemory, rememberBeat, rememberLimited, saveBeatAfterAccessCheck } from "@/server/video/heartbeat";
import { LESSON_BEAT_MIN_GAP_SECONDS } from "@/lib/lesson-beat";
import { isUuid } from "@/lib/uuid";
import { withBusyGuard } from "@/server/busy-response";

const schema = z.object({ position: z.number().min(0).max(60 * 60 * 10), completed: z.boolean().optional() });
const MAX_BODY_BYTES = 1024;

/** نبضة مبكرة: مقصودة وليست خطأ، فلا جسم ولا إعادة محاولة */
const early = () => new NextResponse(null, { status: 204 });
const tooMany = (retryAfterSeconds: number) => NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(Math.max(1, retryAfterSeconds)) } });

/**
 * نبضة حفظ موضع المشاهدة. الردود:
 *  200 {ok:true} حُفظت | 204 مبكرة قبل مرور الفاصل، لم يُكتب شيء | 429 مع Retry-After تجاوز حد الحساب
 * أرخص الرفض أولًا: الأصل والكوكي والمعرف والجسم بلا قاعدة بيانات، ثم ذاكرة النسخة، ثم أمر SQL واحد.
 */
async function handlePOST(req: NextRequest, ctx: { params: Promise<{ lessonId: string }> }) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { lessonId } = await ctx.params;
  if (!isUuid(lessonId)) return NextResponse.json({ error: "not_found" }, { status: 403 });

  const body = await readBodyCapped(req, MAX_BODY_BYTES).catch(() => null);
  let json: unknown = null;
  try {
    json = body === null ? null : JSON.parse(body);
  } catch {
    json = null;
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const position = Math.floor(parsed.data.position);
  const completed = parsed.data.completed ?? false;

  const sessionId = hashToken(token);
  const refused = refusedFromMemory(sessionId, lessonId, completed);
  if (refused?.kind === "early") return early();
  if (refused?.kind === "limited") return tooMany(refused.retryAfterSeconds);

  const beat = await recordBeat(sessionId, lessonId, position, completed);
  if (!beat.known) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (beat.viewer && !beat.admitted) {
    rememberLimited(sessionId, beat.retryAfterSeconds);
    return tooMany(beat.retryAfterSeconds);
  }
  if (beat.saved) {
    rememberBeat(sessionId, lessonId, completed, LESSON_BEAT_MIN_GAP_SECONDS);
    return NextResponse.json({ ok: true });
  }
  if (beat.viewer && beat.hasRow) {
    rememberBeat(sessionId, lessonId, completed, beat.nextInSeconds);
    return early();
  }

  // أول نبضة لهذا الدرس، أو حساب مدير أو معلم، أو جلسة انتهت: الفحص الكامل
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const access = await checkLessonAccess(lessonId, user);
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.reason === "not_ready" ? 409 : 403 });
  if (user.role !== "student") {
    const limit = await hitRateLimit(`beat:${user.id}`, BEAT_LIMIT_PER_MINUTE, BEAT_WINDOW_SECONDS);
    if (!limit.allowed) return tooMany(limit.retryAfterSeconds);
  }
  const saved = await saveBeatAfterAccessCheck(user.id, lessonId, position, completed);
  if (user.role === "student") rememberBeat(sessionId, lessonId, completed, LESSON_BEAT_MIN_GAP_SECONDS);
  return saved ? NextResponse.json({ ok: true }) : early();
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const POST = withBusyGuard(handlePOST);
