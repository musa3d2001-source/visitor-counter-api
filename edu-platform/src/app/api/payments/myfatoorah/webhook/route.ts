import { NextResponse, type NextRequest } from "next/server";
import { handleMyFatoorahWebhook } from "@/server/payments/service";
import { recordWebhookRejection } from "@/server/payments/monitoring";
import { reportError } from "@/server/platform/report-error";

/** أقل بكثير من مهلة إعادة المطالبة بالحدث (٥ دقائق)، فلا تتداخل معالجتان لحدث واحد */
export const maxDuration = 60;

const MAX_BODY_CHARS = 256 * 1024;

/**
 * Webhook V2 من MyFatoorah — يُضبط في لوحة التاجر على:
 *   https://<domain>/api/payments/myfatoorah/webhook
 * التوقيع إلزامي، والمعالجة idempotent، والحالة النهائية تُحدد بالاستعلام من البوابة.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) {
    await recordWebhookRejection({ reason: "body_too_large", httpStatus: 413, rawBody: raw, headers: req.headers });
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  try {
    const out = await handleMyFatoorahWebhook(raw, req.headers);
    return NextResponse.json({ result: out.result }, { status: out.status });
  } catch (err) {
    await reportError("webhook:unhandled", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
