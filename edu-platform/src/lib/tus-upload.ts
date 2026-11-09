import type { UploadOptions } from "tus-js-client";

/** ما يعيده الخادم لبدء رفع مباشر إلى Bunny Stream */
export type TusStart = { videoId: string; endpoint: string; headers: Record<string, string>; metadata: Record<string, string> };

/** لا نعرض نص المزود الإنجليزي للمعلم. إعادة المحاولة تكمل من حيث توقف الرفع */
export const TUS_FAILED_MESSAGE = "انقطع رفع الفيديو قبل اكتماله. أعد المحاولة وسيكمل من حيث توقف.";

/**
 * رفع TUS قابل للاستكمال. البصمة مربوطة بالفيديو نفسه، فلا يستكمل ملف مشابه رفعًا يخص درسًا آخر،
 * وإعادة المحاولة بتوقيع جديد تواصل الرفع نفسه بدل البدء من الصفر.
 */
export async function runTusUpload(
  file: File | Buffer,
  init: TusStart,
  onProgress: (pct: number) => void,
  overrides: Partial<UploadOptions> = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { Upload } = await import("tus-js-client");
  const type = typeof File !== "undefined" && file instanceof File ? file.type : "";
  return new Promise((resolve) => {
    const upload = new Upload(file, {
      endpoint: init.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: 50 * 1024 * 1024,
      headers: init.headers,
      metadata: { ...init.metadata, filetype: type || init.metadata.filetype || "video/mp4" },
      fingerprint: async () => `darb-bunny-${init.videoId}`,
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => onProgress(total ? Math.round((sent / total) * 100) : 0),
      onError: (err) => {
        console.error("[upload] tus failed", err);
        resolve({ ok: false, error: TUS_FAILED_MESSAGE });
      },
      onSuccess: () => resolve({ ok: true }),
      ...overrides,
    });
    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
      })
      .catch((err) => console.error("[upload] tus resume lookup failed", err))
      .finally(() => upload.start());
  });
}
