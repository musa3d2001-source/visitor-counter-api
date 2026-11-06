/**
 * [تجربة المرحلة 0 - كود مؤقت] إعادة محاكاة التصاميم الثمانية على الخادم (Node) بالحزمة المطلوبة،
 * للمالك فقط، لمقارنة البصمات مع المتصفح (ومنه iPhone الحقيقي).
 * النمط: isSameOriginRequest ثم assertOwner ثم zod ثم المجال. بلا تخزين مؤقت (POST).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertOwner } from "@/server/auth/permissions";
import { isSameOriginRequest } from "@/server/http";
import { loadRapierServer } from "../_engine/load-rapier-server";
import { LAYOUTS, SOLUTIONS } from "../_engine/layouts";
import { runHeadless } from "../_engine/run-headless";

export const runtime = "nodejs";
export const maxDuration = 30;

// الخادم يعمل بحزمة -compat فقط (انظر load-rapier-server.ts)؛ standard مقبول للتوافق ويُجاب بـ compat.
const schema = z.object({ pkg: z.enum(["standard", "compat"]) });

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    await assertOwner();
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const t0 = performance.now();
  let R;
  try {
    R = await loadRapierServer();
  } catch (e) {
    return NextResponse.json({ error: "rapier_load_failed", detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }, { status: 500 });
  }
  const loadMs = performance.now() - t0;
  const results = LAYOUTS.map((l) => {
    const sol = SOLUTIONS[l.key];
    const t = performance.now();
    const r = runHeadless(R, l, sol.seed, sol.shots);
    return { key: l.key, hash: r.stateHash, steps: r.steps, cleared: r.cleared, ms: Math.round((performance.now() - t) * 10) / 10 };
  });
  return NextResponse.json({ pkg: "compat", requested: parsed.data.pkg, node: process.version, loadMs: Math.round(loadMs), results });
}
