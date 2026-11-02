import "server-only";
import { createHash } from "node:crypto";
import { sql } from "../db";
import { env } from "../env";
import { hasProductAccess } from "./entitlements";

export type LessonRow = {
  id: string;
  product_id: string;
  title: string;
  provider: "file" | "bunny";
  video_ref: string;
  mime_type: string | null;
  size_bytes: string | number | null;
  is_free_preview: boolean;
  is_published: boolean;
  product_status: string;
};

/** صلاحية مشاهدة درس: الدرس المجاني لأي زائر (إن كان المنتج منشورًا)، وغيره لمن يملك المنتج أو المدير */
export async function checkLessonAccess(lessonId: string, user: { id: string; role: string } | null) {
  if (!/^[0-9a-f-]{36}$/i.test(lessonId)) return { ok: false as const, reason: "not_found" as const };
  const [l] = await sql<LessonRow[]>`
    select l.*, p.status as product_status from lessons l join products p on p.id = l.product_id where l.id = ${lessonId}
  `;
  if (!l || (!l.is_published && user?.role !== "admin")) return { ok: false as const, reason: "not_found" as const };
  if (user?.role === "admin") return { ok: true as const, lesson: l };
  if (l.is_free_preview && l.product_status === "published") return { ok: true as const, lesson: l };
  if (!user) return { ok: false as const, reason: "unauthenticated" as const };
  if (await hasProductAccess(user.id, l.product_id)) return { ok: true as const, lesson: l };
  return { ok: false as const, reason: "forbidden" as const };
}

/**
 * رابط تضمين Bunny Stream موقّع وقصير الصلاحية (Embed Token Authentication):
 * token = SHA256_HEX(tokenSecurityKey + videoId + expires)
 */
export function bunnyEmbedUrl(videoId: string, ttlSeconds = 60 * 60): string | null {
  const e = env();
  if (!e.BUNNY_STREAM_LIBRARY_ID || !e.BUNNY_STREAM_TOKEN_KEY) return null;
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = createHash("sha256").update(`${e.BUNNY_STREAM_TOKEN_KEY}${videoId}${expires}`).digest("hex");
  return `https://iframe.mediadelivery.net/embed/${encodeURIComponent(e.BUNNY_STREAM_LIBRARY_ID)}/${encodeURIComponent(videoId)}?token=${token}&expires=${expires}&autoplay=false&preload=true`;
}
