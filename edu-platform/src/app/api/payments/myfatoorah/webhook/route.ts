import { NextResponse, type NextRequest } from "next/server";
import { handleMyFatoorahWebhook } from "@/server/payments/service";

/**
 * Webhook V2 من MyFatoorah — يُضبط في لوحة التاجر على:
 *   https://<domain>/api/payments/myfatoorah/webhook
 * التوقيع إلزامي، والمعالجة idempotent، والحالة النهائية تُحدد بالاستعلام من البوابة.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  try {
    const out = await handleMyFatoorahWebhook(raw, req.headers);
    return NextResponse.json({ result: out.result }, { status: out.status });
  } catch (err) {
    console.error("[webhook] unhandled", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
