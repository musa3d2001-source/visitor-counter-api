import { NextResponse } from "next/server";
import { storage } from "@/server/storage";
import { assertSafeKey } from "@/server/storage/types";

/** خدمة الصور العامة (الأغلفة والشعار) من التخزين المحلي فقط. مع Supabase تُخدم الصور من الحاوية العامة مباشرة. */
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const k = key.join("/");
  try {
    assertSafeKey(k);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const ext = k.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[ext];
  if (!type || storage().name !== "local") return new NextResponse("Not found", { status: 404 });
  try {
    const data = await storage().read("public", k);
    return new NextResponse(Buffer.from(data), {
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
