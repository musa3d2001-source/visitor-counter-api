import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/permissions";
import { verifyLocalUploadToken } from "@/server/storage/local";
import { storage } from "@/server/storage";
import { reportError } from "@/server/platform/report-error";

/**
 * مستقبل الرفع المباشر في وضع التخزين المحلي فقط (بديل رابط الرفع الموقّع في Supabase).
 * يتحقق من الرمز الموقّع ومن أن المستخدم الحالي هو نفس من جهّز الرفع (مالك أو معلم)، ويوقف الرفع فور تجاوز الحد الأقصى.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function PUT(req: Request) {
  if (storage().name !== "local") return NextResponse.json({ error: "غير متاح" }, { status: 404 });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const claims = verifyLocalUploadToken(token);
  if (!claims) return NextResponse.json({ error: "رابط الرفع غير صالح أو منتهي" }, { status: 403 });
  // الرمز مرتبط بالمستخدم الذي جهّز الرفع (مالك أو معلم مفعّل)
  const actor = await getActor();
  if (!actor || actor.userId !== claims.u) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > claims.m) return NextResponse.json({ error: "حجم الملف أكبر من المسموح" }, { status: 413 });
  if (!req.body) return NextResponse.json({ error: "لا يوجد ملف" }, { status: 400 });

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > claims.m) {
      await reader.cancel().catch(() => {});
      return NextResponse.json({ error: "حجم الملف أكبر من المسموح" }, { status: 413 });
    }
    chunks.push(value);
  }
  if (total === 0) return NextResponse.json({ error: "الملف فارغ" }, { status: 400 });
  const data = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.byteLength;
  }
  try {
    await storage().put(claims.b, claims.k, data, claims.t);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "EEXIST") return NextResponse.json({ error: "تم رفع هذا الملف مسبقًا" }, { status: 409 });
    await reportError("upload:local", err);
    return NextResponse.json({ error: "تعذر حفظ الملف" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, size: total });
}
