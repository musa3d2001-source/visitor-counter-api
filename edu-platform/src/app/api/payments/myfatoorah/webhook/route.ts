import { NextResponse, type NextRequest } from "next/server";
import { handleMyFatoorahWebhook } from "@/server/payments/service";
import { recordWebhookRejection } from "@/server/payments/monitoring";
import { reportError } from "@/server/platform/report-error";
import { withBusyGuard } from "@/server/busy-response";
import { isDatabaseBusy } from "@/server/db-busy";
import { ipFromHeaders } from "@/server/http";
import { webhookAddressRefused } from "@/server/payments/webhook-gate";

/** أقل بكثير من مهلة إعادة المطالبة بالحدث (٥ دقائق)، فلا تتداخل معالجتان لحدث واحد */
export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;

/** القراءة تتوقف عند الحد، فجسم ضخم لا يدخل الذاكرة ولو لم يذكر طوله في Content-Length. null: تجاوز الحد */
async function readBodyCapped(req: NextRequest): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Webhook V2 من MyFatoorah — يُضبط في لوحة التاجر على:
 *   https://<domain>/api/payments/myfatoorah/webhook
 * التوقيع إلزامي، والمعالجة idempotent، والحالة النهائية تُحدد بالاستعلام من البوابة.
 */
async function handlePOST(req: NextRequest) {
  // أرخص حاجز أولًا: عنوان تجاوز حد الرفض لا يكلف قراءة جسم ولا قاعدة بيانات
  const gate = webhookAddressRefused(ipFromHeaders(req.headers));
  if (gate.refused) return NextResponse.json({ error: "too many requests" }, { status: 429, headers: { "retry-after": String(gate.retryAfterSeconds) } });

  const tooLarge = async (bodyBytes: number) => {
    await recordWebhookRejection({ reason: "body_too_large", httpStatus: 413, rawBody: "", bodyBytes, headers: req.headers });
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  };
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooLarge(Math.min(declared, 2 ** 31 - 1));

  let raw: string | null;
  try {
    raw = await readBodyCapped(req);
  } catch {
    // انقطع المرسل أثناء القراءة: لم يصل شيء نعالجه
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (raw === null) return tooLarge(MAX_BODY_BYTES + 1);
  try {
    const out = await handleMyFatoorahWebhook(raw, req.headers);
    return NextResponse.json({ result: out.result }, { status: out.status });
  } catch (err) {
    // انشغال قاعدة البيانات قبل المطالبة بالحدث: 503 مع Retry-After فتعيد البوابة الإرسال
    if (isDatabaseBusy(err)) throw err;
    await reportError("webhook:unhandled", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const POST = withBusyGuard(handlePOST);
