import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { checkFileAccess } from "@/server/access/entitlements";
import { isSameOriginRequest } from "@/server/http";
import { sql } from "@/server/db";

const schema = z.object({ fileId: z.string().uuid(), page: z.number().int().min(1).max(10000) });

/** حفظ آخر صفحة وصل لها الطالب (استكمال القراءة) */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const access = await checkFileAccess(parsed.data.fileId, user);
  if (!access.ok || access.file.kind !== "main") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await sql`
    insert into reading_progress (user_id, file_id, last_page, updated_at)
    values (${user.id}, ${parsed.data.fileId}, ${parsed.data.page}, now())
    on conflict (user_id, file_id) do update set last_page = excluded.last_page, updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}
