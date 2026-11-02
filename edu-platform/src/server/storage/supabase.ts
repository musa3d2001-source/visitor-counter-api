import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { assertSafeKey, type Bucket, type StorageDriver, type UploadTarget } from "./types";

/**
 * Supabase Storage — يُستخدم من الخادم فقط بمفتاح service role.
 * - private bucket: ملفات PDF والفيديو (غير عام، لا يُكشف رابطه الدائم أبدًا)
 * - public bucket: أغلفة المنتجات والشعار
 */
let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    const e = env();
    client = createClient(e.SUPABASE_URL!, e.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function bucketName(b: Bucket) {
  return b === "private" ? env().SUPABASE_PRIVATE_BUCKET : env().SUPABASE_PUBLIC_BUCKET;
}

export const supabaseDriver: StorageDriver = {
  name: "supabase",
  async put(bucket, key, data, contentType) {
    assertSafeKey(key);
    const { error } = await sb().storage.from(bucketName(bucket)).upload(key, data, { contentType, upsert: false });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
  },
  async read(bucket, key) {
    assertSafeKey(key);
    const { data, error } = await sb().storage.from(bucketName(bucket)).download(key);
    if (error || !data) throw new Error(`storage download failed: ${error?.message}`);
    return new Uint8Array(await data.arrayBuffer());
  },
  async readHead(bucket, key, bytes) {
    assertSafeKey(key);
    // نستخدم رابطًا موقّعًا قصيرًا مع Range لتجنب تنزيل الملف كاملًا
    const { data, error } = await sb().storage.from(bucketName(bucket)).createSignedUrl(key, 60);
    if (error || !data) throw new Error(`storage sign failed: ${error?.message}`);
    const res = await fetch(data.signedUrl, { headers: { range: `bytes=0-${bytes - 1}` } });
    if (!res.ok) throw new Error(`storage head read failed: ${res.status}`);
    return new Uint8Array((await res.arrayBuffer()).slice(0, bytes));
  },
  async stat(bucket, key) {
    assertSafeKey(key);
    const { data, error } = await sb().storage.from(bucketName(bucket)).info(key);
    if (error || !data) return null;
    return { size: Number(data.size ?? 0) };
  },
  async remove(bucket, key) {
    assertSafeKey(key);
    await sb().storage.from(bucketName(bucket)).remove([key]);
  },
  async createUploadTarget(bucket, key, contentType): Promise<UploadTarget> {
    assertSafeKey(key);
    const { data, error } = await sb().storage.from(bucketName(bucket)).createSignedUploadUrl(key);
    if (error || !data) throw new Error(`storage signed upload failed: ${error?.message}`);
    return {
      method: "PUT",
      url: data.signedUrl,
      headers: { "content-type": contentType, "x-upsert": "false", "cache-control": "max-age=3600" },
    };
  },
  publicUrl(key) {
    assertSafeKey(key);
    return sb().storage.from(bucketName("public")).getPublicUrl(key).data.publicUrl;
  },
  async signedUrl(bucket, key, expiresInSeconds) {
    assertSafeKey(key);
    const { data, error } = await sb().storage.from(bucketName(bucket)).createSignedUrl(key, expiresInSeconds);
    if (error || !data) return null;
    return data.signedUrl;
  },
};
