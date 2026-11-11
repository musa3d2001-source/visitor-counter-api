export type Bucket = "private" | "public";

export type UploadTarget = {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
};

/** خيارات الحفظ. cacheSeconds: عمر النسخة في ذاكرة المتصفح والشبكة حين تُقرأ برابط مؤقت (الافتراضي ساعة) */
export type PutOptions = { cacheSeconds?: number };

export interface StorageDriver {
  readonly name: "local" | "supabase";
  put(bucket: Bucket, key: string, data: Uint8Array, contentType: string, options?: PutOptions): Promise<void>;
  /** قراءة كامل الملف (لملفات PDF التي تُختم بعلامة مائية) */
  read(bucket: Bucket, key: string): Promise<Uint8Array>;
  /** قراءة أول n بايت للتحقق من نوع الملف */
  readHead(bucket: Bucket, key: string, bytes: number): Promise<Uint8Array>;
  /** null فقط إن قال التخزين صراحة إن الملف غير موجود. أي عطل آخر يُرمى، حتى لا يوصف ملف سليم بأنه مفقود */
  stat(bucket: Bucket, key: string): Promise<{ size: number } | null>;
  remove(bucket: Bucket, key: string): Promise<void>;
  /** حذف يقول إن فشل (remove يسكت عن الخطأ). حذف ما ليس موجودًا نجاح */
  removeMany(bucket: Bucket, keys: string[]): Promise<void>;
  /**
   * بث الملف من التخزين دون تحميله كله في ذاكرة الدالة (نسخ PDF المختومة والأصل للمالك).
   * يرمي StorageNotFoundError فقط إن قال التخزين صراحة إن الملف غير موجود.
   */
  readStream(bucket: Bucket, key: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number | null }>;
  /** رابط رفع مباشر مؤقت (من المتصفح إلى التخزين) */
  createUploadTarget(bucket: Bucket, key: string, contentType: string, maxBytes: number, userId: string): Promise<UploadTarget>;
  /** رابط عام للصور (أغلفة، شعار) */
  publicUrl(key: string): string;
  /** رابط مؤقت قصير الصلاحية لملف خاص (يستخدم للفيديو مع Supabase) — null إن لم يكن مدعومًا */
  signedUrl(bucket: Bucket, key: string, expiresInSeconds: number): Promise<string | null>;
  /**
   * رابط مؤقت لنسخة PDF مختومة باسم مشترٍ واحد (القرار F22). المسار يصدره بعد فحص الصلاحية وتسجيل الوصول في كل طلب.
   * لا يقبل إلا مفتاح نسخة مختومة (assertStampedCopyKey) وعمرًا لا يزيد على STAMPED_COPY_URL_MAX_SECONDS: الأصل لا يُوقَّع أبدًا.
   * downloadName: يحفظه المتصفح ملفًا بهذا الاسم. null: يُعرض في المتصفح أو يقرؤه القارئ.
   * null إن تعذر التوقيع أو لم يعد الكائن موجودًا: المسار يبث النسخة بنفسه.
   */
  stampedCopyUrl(key: string, expiresInSeconds: number, downloadName: string | null): Promise<string | null>;
  /** قراءة جزء من الملف (لتشغيل الفيديو المحلي عبر Range) */
  readRange?(bucket: Bucket, key: string, start: number, end: number): Promise<ReadableStream<Uint8Array>>;
}

export class StorageNotFoundError extends Error {
  constructor() {
    super("storage object not found");
    this.name = "StorageNotFoundError";
  }
}

/** أطول عمر لرابط نسخة مختومة (القرار F22): دقيقة واحدة */
export const STAMPED_COPY_URL_MAX_SECONDS = 60;

/** مفتاح النسخة المختومة كما يولده الخادم (delivery.ts): stamped/ ثم UUID كامل بحروف صغيرة. أضيق من قيد stamped_copies.object_key */
const STAMPED_COPY_KEY = /^stamped\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

/** حارس التوقيع: مفتاح أي ملف آخر (أصل مذكرة، معاينة، فيديو) يُرفض قبل أي طلب إلى التخزين */
export function assertStampedCopyKey(key: string, expiresInSeconds: number) {
  if (!STAMPED_COPY_KEY.test(key)) throw new Error("only a stamped copy can be signed for a buyer");
  if (!(expiresInSeconds > 0 && expiresInSeconds <= STAMPED_COPY_URL_MAX_SECONDS)) throw new Error("stamped copy links live 60 seconds at most");
}

/** المفاتيح تُولَّد على الخادم فقط — هذا التحقق دفاع إضافي ضد Path Traversal */
export function assertSafeKey(key: string) {
  if (!/^[a-z0-9][a-z0-9/_.-]{2,200}$/i.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error("Invalid storage key");
  }
}
