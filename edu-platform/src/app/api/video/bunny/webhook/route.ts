import { NextResponse, type NextRequest } from "next/server";
import { handleBunnyWebhook } from "@/server/video/service";
import { reportError } from "@/server/platform/report-error";
import { withBusyGuard } from "@/server/busy-response";
import { isDatabaseBusy } from "@/server/db-busy";
import { ipFromHeaders, readBodyCapped } from "@/server/http";
import { bunnyWebhookRefused, recordBunnyWebhookRejection } from "@/server/video/webhook-gate";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Webhook من Bunny Stream — يُضبط في إعدادات المكتبة على:
 *   https://<domain>/api/video/bunny/webhook
 * يُحدّث حالة معالجة الدرس بعد إعادة الاستعلام من API.
 * فشل المزامنة يرد 500، فيعيد Bunny الإرسال بالجسم نفسه: 2xx وحده يعني أن الحدث انتهى.
 */
async function handlePOST(req: NextRequest) {
  // أرخص حاجز أولًا: عنوان تجاوز حد الرفض لا يكلف قراءة جسم ولا قاعدة بيانات
  const ip = ipFromHeaders(req.headers);
  const gate = bunnyWebhookRefused(ip);
  if (gate.refused) return NextResponse.json({ error: "too many requests" }, { status: 429, headers: { "retry-after": String(gate.retryAfterSeconds) } });

  let raw: string | null;
  try {
    raw = await readBodyCapped(req, MAX_BODY_BYTES);
  } catch {
    // انقطع المرسل أثناء القراءة: لم يصل شيء نعالجه
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (raw === null) {
    recordBunnyWebhookRejection(ip);
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  try {
    const out = await handleBunnyWebhook(raw, req.headers);
    if (out.status === 400 || out.status === 401) recordBunnyWebhookRejection(ip);
    return NextResponse.json({ result: out.result }, { status: out.status });
  } catch (err) {
    if (isDatabaseBusy(err)) throw err;
    await reportError("video:webhook", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const POST = withBusyGuard(handlePOST);
