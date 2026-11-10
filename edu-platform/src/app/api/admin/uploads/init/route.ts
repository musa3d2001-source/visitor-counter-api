import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/server/http";
import { getActor, PermissionError } from "@/server/auth/permissions";
import { AdminError } from "@/server/admin/common";
import { initSchema, initUpload } from "@/server/admin/uploads";
import { BunnyError } from "@/server/video/bunny";
import { reportError } from "@/server/platform/report-error";
import { withBusyGuard } from "@/server/busy-response";
import { isDatabaseBusy } from "@/server/db-busy";

export const dynamic = "force-dynamic";

/** تجهيز رفع ملف (للمالك أو المعلم المفعّل — الصلاحية على المنتج تُفحص في initUpload) */
async function handlePOST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "طلب غير مسموح" }, { status: 403 });
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const parsed = initSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "بيانات الملف غير صالحة" }, { status: 400 });
  try {
    const res = await initUpload(parsed.data, actor);
    return NextResponse.json(res, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (isDatabaseBusy(err)) throw err;
    if (err instanceof AdminError) return NextResponse.json({ error: err.userMessage }, { status: 400 });
    if (err instanceof PermissionError) return NextResponse.json({ error: err.userMessage }, { status: 403 });
    if (err instanceof BunnyError) {
      await reportError("upload:init-bunny", err);
      return NextResponse.json({ error: "تعذر تجهيز رفع الفيديو لدى مزود البث. حاول مرة أخرى." }, { status: 502 });
    }
    await reportError("upload:init", err);
    return NextResponse.json({ error: "تعذر تجهيز الرفع. حاول مرة أخرى." }, { status: 500 });
  }
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const POST = withBusyGuard(handlePOST);
