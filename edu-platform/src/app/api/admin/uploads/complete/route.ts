import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { isSameOriginRequest } from "@/server/http";
import { AdminError } from "@/server/admin/common";
import { completeSchema, completeUpload } from "@/server/admin/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "بيانات الملف غير صالحة" }, { status: 400 });
  try {
    const res = await completeUpload(parsed.data, user.id);
    if (parsed.data.productId) revalidatePath(`/admin/products/${parsed.data.productId}`);
    if (parsed.data.target === "logo") revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, ...res }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof AdminError) return NextResponse.json({ error: err.userMessage }, { status: 400 });
    console.error("[upload-complete]", err);
    return NextResponse.json({ error: "تعذر إكمال حفظ الملف. حاول مرة أخرى." }, { status: 500 });
  }
}
