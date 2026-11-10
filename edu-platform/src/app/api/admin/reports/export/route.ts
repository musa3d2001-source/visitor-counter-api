import { NextResponse } from "next/server";
import { LONG_JOB_STATEMENT_MS, withDbDeadline } from "@/server/db";
import { getCurrentSession } from "@/server/auth/session";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { refuseWithoutProof } from "@/server/auth/step-up";
import { parseRange } from "@/server/admin/stats";
import { openReportExport } from "@/server/admin/report-export";
import { clientIp, isSameOriginRequest } from "@/server/http";
import { withBusyGuard } from "@/server/busy-response";

export const dynamic = "force-dynamic";
/** أكبر تصدير صفحات قصيرة متتالية، وهذا سقف لا هدف */
export const maxDuration = 120;

/** لكل مالك: عشرة ملفات في الساعة تكفي عملًا حقيقيًا، وتبطئ من يكرر سحب القائمة */
const EXPORT_LIMIT = { limit: 10, windowSec: 60 * 60 };

const DENIED = { error: "غير مصرح" };

/**
 * التصدير POST فقط: رابط GET يكفي لتنزيله عرضًا، ويبقى في سجل المتصفح.
 * المعايير في الرابط لأنها تواريخ فقط، فلا جسم للطلب يُقرأ. البيانات الشخصية تخرج بإثبات حديث، وتُسجل، وبحد لكل مالك.
 */
function handlePOST(req: Request) {
  return withDbDeadline(LONG_JOB_STATEMENT_MS, () => exportReport(req));
}

async function exportReport(req: Request): Promise<Response> {
  if (!isSameOriginRequest(req)) return NextResponse.json(DENIED, { status: 403 });
  const session = await getCurrentSession();
  if (!session || session.mustChangePassword || session.needsTwoFactorEnrolment || session.user.role !== "admin") return NextResponse.json(DENIED, { status: 403 });
  const adminId = session.user.id;
  const ip = await clientIp().catch(() => "unknown");

  const refusal = await refuseWithoutProof({ adminId, sessionId: session.sessionId, ip, command: "report.export" });
  if (refusal) return NextResponse.json({ error: refusal.message, stepUp: refusal.need }, { status: 403 });

  const limit = await hitRateLimit(`report-export:${adminId}`, EXPORT_LIMIT.limit, EXPORT_LIMIT.windowSec);
  if (!limit.allowed) return NextResponse.json({ error: "طلبت تصديرات كثيرة. حاول بعد قليل." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const url = new URL(req.url);
  const range = parseRange({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    test: url.searchParams.get("test") ?? undefined,
  });
  const kind = url.searchParams.get("type") === "teachers" ? "teachers" : "orders";
  const body = await openReportExport(kind, range, { adminId, ip });
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${kind === "teachers" ? "teachers" : "sales"}-${range.fromDay}-to-${range.toDay}.csv"`,
      "cache-control": "no-store",
    },
  });
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const POST = withBusyGuard(handlePOST);
