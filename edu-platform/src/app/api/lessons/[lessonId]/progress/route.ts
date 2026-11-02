import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { checkLessonAccess } from "@/server/access/lessons";
import { isSameOriginRequest } from "@/server/http";
import { sql } from "@/server/db";

const schema = z.object({ position: z.number().min(0).max(60 * 60 * 10), completed: z.boolean().optional() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ lessonId: string }> }) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { lessonId } = await ctx.params;
  const access = await checkLessonAccess(lessonId, user);
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.reason === "not_ready" ? 409 : 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await sql`
    insert into lesson_progress (user_id, lesson_id, position_seconds, completed, updated_at)
    values (${user.id}, ${lessonId}, ${Math.floor(parsed.data.position)}, ${parsed.data.completed ?? false}, now())
    on conflict (user_id, lesson_id) do update set
      position_seconds = excluded.position_seconds,
      completed = lesson_progress.completed or excluded.completed,
      updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}
