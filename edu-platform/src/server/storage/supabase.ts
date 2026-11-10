import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { boundedFetch, DELIVERY_STREAM_LIMITS, STORAGE_LIMITS, storageFetch } from "../outbound";
import { assertSafeKey, StorageNotFoundError, type Bucket, type StorageDriver, type UploadTarget } from "./types";

/**
 * Supabase Storage — يُستخدم من الخادم فقط بمفتاح service role.
 * - private bucket: ملفات PDF والفيديو (غير عام، لا يُكشف رابطه الدائم أبدًا)
 * - public bucket: أغلفة المنتجات والشعار
 *
 * كل طلب إلى Storage له مهلة تغطي الجسم أيضًا (outbound.ts): التوقيع والمعلومات قصيرة، والتنزيل والرفع أطول،
 * والتنزيل يُقطع إن توقف وصول البايتات. فتعثر Storage يصير خطأً سريعًا لا دالة معلقة حتى حد المنصة.
 */
let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    const e = env();
    client = createClient(e.SUPABASE_URL!, e.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: storageFetch(STORAGE_LIMITS) },
    });
  }
  return client;
}

/** للاختبارات: يعيد إنشاء العميل بعد تغيير المتغيرات */
export function resetSupabaseClientForTests() {
  client = null;
}

function bucketName(b: Bucket) {
  return b === "private" ? env().SUPABASE_PRIVATE_BUCKET : env().SUPABASE_PUBLIC_BUCKET;
}

/**
 * «غير موجود» جواب صريح فقط: Supabase يرد 400 ببدن statusCode 404، أو 404 مباشرة.
 * انقطاع الشبكة أو 5xx أو رفض الصلاحية لا يعني أن الملف غير موجود.
 */
export function isNotFoundError(error: { status?: unknown; statusCode?: unknown }): boolean {
  return Number(error.status) === 404 || String(error.statusCode) === "404";
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
    // أول bytes فقط، بمهلة التحكم: خادم يتجاهل Range لا يجرنا إلى تنزيل الملف كله
    const res = await boundedFetch(data.signedUrl, { headers: { range: `bytes=0-${bytes - 1}` } }, { timeoutMs: STORAGE_LIMITS.controlMs, maxBytes: bytes, truncate: true });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`storage head read failed: ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  },
  async stat(bucket, key) {
    assertSafeKey(key);
    const { data, error } = await sb().storage.from(bucketName(bucket)).info(key);
    if (error) {
      if (isNotFoundError(error)) return null;
      throw new Error(`storage stat failed: ${error.message}`);
    }
    if (!data) throw new Error("storage stat failed: empty response");
    return { size: Number(data.size ?? 0) };
  },
  async remove(bucket, key) {
    assertSafeKey(key);
    await sb().storage.from(bucketName(bucket)).remove([key]);
  },
  async removeMany(bucket, keys) {
    if (keys.length === 0) return;
    for (const key of keys) assertSafeKey(key);
    const { error } = await sb().storage.from(bucketName(bucket)).remove(keys);
    if (error) throw new Error(`storage remove failed: ${error.message}`);
  },
  async readStream(bucket, key) {
    assertSafeKey(key);
    // رابط موقّع قصير يستعمله الخادم وحده ولا يصل إلى المتصفح، ثم البث بمهلة التسليم لا مهلة التحكم
    const { data, error } = await sb().storage.from(bucketName(bucket)).createSignedUrl(key, 60);
    if (error || !data) {
      if (error && isNotFoundError(error as { status?: unknown; statusCode?: unknown })) throw new StorageNotFoundError();
      throw new Error(`storage sign failed: ${error?.message}`);
    }
    const res = await boundedFetch(data.signedUrl, undefined, DELIVERY_STREAM_LIMITS);
    if (res.status === 404) {
      await res.body?.cancel().catch(() => {});
      throw new StorageNotFoundError();
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`storage stream failed: ${res.status}`);
    }
    const size = Number(res.headers.get("content-length"));
    return { stream: res.body, size: Number.isFinite(size) && size > 0 ? size : null };
  },
  async createUploadTarget(bucket, key, contentType): Promise<UploadTarget> {
    assertSafeKey(key);
    const { data, error } = await sb().storage.from(bucketName(bucket)).createSignedUploadUrl(key);
    if (error || !data) throw new Error(`storage signed upload failed: ${error?.message}`);
    return {
      method: "PUT",
      url: data.signedUrl,
      // الملف العام لا يتغير تحت رابطه: كل رفع مفتاح جديد و x-upsert=false، فلا يضر أن يُخزَّن سنة. الخاص يبقى قصيرًا
      headers: { "content-type": contentType, "x-upsert": "false", "cache-control": bucket === "public" ? "public, max-age=31536000, immutable" : "max-age=3600" },
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
