import "server-only";
import { randomUUID } from "node:crypto";
import { env } from "../env";
import { localDriver } from "./local";
import { supabaseDriver } from "./supabase";
import type { StorageDriver } from "./types";

export type { Bucket, StorageDriver, UploadTarget } from "./types";

export function storage(): StorageDriver {
  return env().STORAGE_DRIVER === "supabase" ? supabaseDriver : localDriver;
}

/** أنواع الملفات المسموح رفعها وحدودها */
export const UPLOAD_RULES = {
  pdf: { mime: ["application/pdf"], maxBytes: 100 * 1024 * 1024, ext: "pdf", bucket: "private" as const },
  image: { mime: ["image/jpeg", "image/png", "image/webp"], maxBytes: 5 * 1024 * 1024, ext: "", bucket: "public" as const },
  video: { mime: ["video/mp4"], maxBytes: 2 * 1024 * 1024 * 1024, ext: "mp4", bucket: "private" as const },
} as const;
export type UploadKind = keyof typeof UPLOAD_RULES;

const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** توليد مفتاح تخزين غير قابل للتخمين */
export function newStorageKey(kind: UploadKind, mime: string, prefix: string): string {
  const ext = kind === "image" ? IMAGE_EXT[mime] : UPLOAD_RULES[kind].ext;
  const now = new Date();
  return `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
}

/** التحقق من التوقيع الثنائي للملف (Magic Bytes) — لا نعتمد على امتداد الملف أو نوعه المُرسل */
export function sniffMime(head: Uint8Array): string | null {
  const b = head;
  const ascii = (start: number, len: number) => String.fromCharCode(...b.slice(start, start + len));
  if (b.length >= 5 && ascii(0, 5) === "%PDF-") return "application/pdf";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a) return "image/png";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (b.length >= 12 && ascii(4, 4) === "ftyp") return "video/mp4";
  return null;
}
