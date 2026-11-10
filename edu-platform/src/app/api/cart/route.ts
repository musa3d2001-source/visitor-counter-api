import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { cartSignature } from "@/lib/cart-signature";
import { withBusyGuard } from "@/server/busy-response";
import { addProductToCart } from "@/server/commerce/cart-add";
import { isSameOriginRequest, readBodyCapped } from "@/server/http";

const schema = z.object({ productId: z.string().max(64) });
const MAX_BODY_BYTES = 1024;

/**
 * زر «أضف إلى السلة». مسار وليس Server Action لأن كتابة كوكي داخل Server Action تجعل Next يعيد رسم الصفحة
 * كاملة في الرد ويفرغ ذاكرة المتصفح، والمطلوب هنا تغيير الكوكي ورقم السلة فقط.
 * السلة لا تخص حسابًا بعينه: تعمل للزائر، والأسعار تُحسب عند الدفع من قاعدة البيانات، فلا يُكتب هنا إلا معرفات منتجات متاحة.
 */
async function handlePOST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await readBodyCapped(req, MAX_BODY_BYTES);
  if (raw === null) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // يبقى null فيرفضه الفحص التالي
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const res = await addProductToCart(parsed.data.productId);
  return NextResponse.json({ ok: res.ok, message: res.message, count: res.ids.length, signature: cartSignature(res.ids) }, { headers: { "cache-control": "no-store" } });
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const POST = withBusyGuard(handlePOST);
