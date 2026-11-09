import { NextResponse, type NextRequest } from "next/server";
import { handleBunnyWebhook } from "@/server/video/service";
import { reportError } from "@/server/platform/report-error";

/**
 * Webhook من Bunny Stream — يُضبط في إعدادات المكتبة على:
 *   https://<domain>/api/video/bunny/webhook
 * يُحدّث حالة معالجة الدرس بعد إعادة الاستعلام من API.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 64 * 1024) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  try {
    const out = await handleBunnyWebhook(raw, req.headers);
    return NextResponse.json({ result: out.result }, { status: out.status });
  } catch (err) {
    await reportError("video:webhook", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
