export type Bucket = "private" | "public";

export type UploadTarget = {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
};

export interface StorageDriver {
  readonly name: "local" | "supabase";
  put(bucket: Bucket, key: string, data: Uint8Array, contentType: string): Promise<void>;
  /** قراءة كامل الملف (لملفات PDF التي تُختم بعلامة مائية) */
  read(bucket: Bucket, key: string): Promise<Uint8Array>;
  /** قراءة أول n بايت للتحقق من نوع الملف */
  readHead(bucket: Bucket, key: string, bytes: number): Promise<Uint8Array>;
  stat(bucket: Bucket, key: string): Promise<{ size: number } | null>;
  remove(bucket: Bucket, key: string): Promise<void>;
  /** رابط رفع مباشر مؤقت (من المتصفح إلى التخزين) */
  createUploadTarget(bucket: Bucket, key: string, contentType: string, maxBytes: number, userId: string): Promise<UploadTarget>;
  /** رابط عام للصور (أغلفة، شعار) */
  publicUrl(key: string): string;
  /** رابط مؤقت قصير الصلاحية لملف خاص (يستخدم للفيديو مع Supabase) — null إن لم يكن مدعومًا */
  signedUrl(bucket: Bucket, key: string, expiresInSeconds: number): Promise<string | null>;
  /** قراءة جزء من الملف (لتشغيل الفيديو المحلي عبر Range) */
  readRange?(bucket: Bucket, key: string, start: number, end: number): Promise<ReadableStream<Uint8Array>>;
}

/** المفاتيح تُولَّد على الخادم فقط — هذا التحقق دفاع إضافي ضد Path Traversal */
export function assertSafeKey(key: string) {
  if (!/^[a-z0-9][a-z0-9/_.-]{2,200}$/i.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error("Invalid storage key");
  }
}
