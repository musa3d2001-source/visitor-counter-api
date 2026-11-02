import { NextResponse, type NextRequest } from "next/server";
import { verifyAndApplyPayment } from "@/server/payments/service";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { ipFromHeaders } from "@/server/http";
import { sql } from "@/server/db";
import { parseCartCookie } from "@/server/commerce/cart";
import { env } from "@/server/env";

/**
 * صفحة العودة من بوابة الدفع (CallBackUrl / ErrorUrl).
 * لا نعتبر الوصول إليها دليلًا على الدفع: نستعلم من البوابة عبر الخادم ثم نوجّه الطالب لصفحة الطلب.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const paymentId = url.searchParams.get("paymentId") ?? url.searchParams.get("PaymentId") ?? undefined;
  const invoiceId = url.searchParams.get("Id") ?? undefined;
  const base = env().APP_URL.replace(/\/$/, "");

  const limit = await hitRateLimit(`payreturn:${ipFromHeaders(req.headers)}`, 60, 10 * 60);
  if (!limit.allowed) return NextResponse.redirect(`${base}/account?payment=rate`, 303);
  if (!paymentId && !invoiceId) return NextResponse.redirect(`${base}/account?payment=invalid`, 303);

  try {
    const result = await verifyAndApplyPayment(paymentId ? { paymentId } : { invoiceId });
    if (result.state === "invalid") {
      console.warn("[payment-return] invalid", result.error);
      return NextResponse.redirect(`${base}/account?payment=invalid`, 303);
    }
    const res = NextResponse.redirect(`${base}/orders/${result.orderId}?from=payment`, 303);
    if (result.state === "paid") {
      // إزالة المنتجات المدفوعة من السلة
      const items = await sql<{ product_id: string }[]>`select product_id from order_items where order_id = ${result.orderId}`;
      const paid = new Set(items.map((i) => i.product_id));
      const current = parseCartCookie(req.cookies.get("cart")?.value ?? "");
      res.cookies.set("cart", encodeURIComponent(JSON.stringify(current.filter((x) => !paid.has(x)))), {
        httpOnly: true,
        sameSite: "lax",
        secure: env().NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return res;
  } catch (err) {
    console.error("[payment-return] verification error", err);
    return NextResponse.redirect(`${base}/account?payment=error`, 303);
  }
}
