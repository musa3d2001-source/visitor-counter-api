import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { isSameOriginRequest } from "@/server/http";
import { AdminError } from "@/server/admin/common";
import { initSchema, initUpload } from "@/server/admin/uploads";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "طلب غير مسموح" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const parsed = initSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "بيانات الملف غير صالحة" }, { status: 400 });
  try {
    const res = await initUpload(parsed.data, user.id);
    return NextResponse.json(res, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof AdminError) return NextResponse.json({ error: err.userMessage }, { status: 400 });
    console.error("[upload-init]", err);
    return NextResponse.json({ error: "تعذر تجهيز الرفع. حاول مرة أخرى." }, { status: 500 });
  }
}
