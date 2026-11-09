import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/server/http";
import { getActor, PermissionError } from "@/server/auth/permissions";
import { AdminError } from "@/server/admin/common";
import { completeSchema, completeUpload } from "@/server/admin/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "طلب غير مسموح" }, { status: 403 });
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "بيانات الملف غير صالحة" }, { status: 400 });
  try {
    const res = await completeUpload(parsed.data, actor);
    if (parsed.data.productId) revalidatePath(`/admin/products/${parsed.data.productId}`);
    if (parsed.data.target === "teacher_photo") {
      revalidatePath("/admin/teachers", "layout");
      revalidatePath("/admin/profile");
      revalidatePath("/admin/review");
    }
    if (parsed.data.target === "logo") revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, ...res }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof AdminError) return NextResponse.json({ error: err.userMessage }, { status: 400 });
    if (err instanceof PermissionError) return NextResponse.json({ error: err.userMessage }, { status: 403 });
    console.error("[upload-complete]", err);
    return NextResponse.json({ error: "تعذر إكمال حفظ الملف. حاول مرة أخرى." }, { status: 500 });
  }
}
