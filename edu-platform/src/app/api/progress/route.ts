import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { checkFileAccess } from "@/server/access/entitlements";
import { isSameOriginRequest } from "@/server/http";
import { sql } from "@/server/db";
import { withBusyGuard } from "@/server/busy-response";

const schema = z.object({ fileId: z.string().uuid(), page: z.number().int().min(1).max(10000) });

/** حفظ آخر صفحة وصل لها الطالب (استكمال القراءة) */
async function handlePOST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  // الصف الموجود هو إذن التحديث التالي، كما في نبضة الدرس: أمر واحد عند كل قلبة صفحة بدل ثلاثة.
  // من سُحب منه المنتج لا يحرك إلا رقم صفحته هو، والملف نفسه يحرسه مسار التسليم في كل فتح
  const moved = await sql`
    update reading_progress set last_page = ${parsed.data.page}, updated_at = now()
    where user_id = ${user.id} and file_id = ${parsed.data.fileId}
    returning file_id
  `;
  if (moved.length > 0) return NextResponse.json({ ok: true });
  const access = await checkFileAccess(parsed.data.fileId, user);
  if (!access.ok || access.file.kind !== "main") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await sql`
    insert into reading_progress (user_id, file_id, last_page, updated_at)
    values (${user.id}, ${parsed.data.fileId}, ${parsed.data.page}, now())
    on conflict (user_id, file_id) do update set last_page = excluded.last_page, updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const POST = withBusyGuard(handlePOST);
