/**
 * بصمة الفيديو المعتمد: هل ما في Bunny الآن هو ما رآه من اعتمده؟
 *
 * الأصل بصمة SHA-256 للملف المرفوع (originalHash). الوثائق تجيز أن تكون فارغة، فالبديل تاريخ الرفع مع الأبعاد والمدة.
 * storageSize لا يدخل: يتغير حين يضيف Bunny جودات أو ترجمات للفيديو نفسه.
 */
export type VideoFingerprint = {
  originalHash: string | null;
  dateUploaded: string | null;
  length: number;
  width: number;
  height: number;
};

type VideoFacts = { originalHash?: string | null; dateUploaded?: string | null; length: number; width: number; height: number };

export function fingerprintOf(v: VideoFacts): VideoFingerprint {
  return { originalHash: v.originalHash || null, dateUploaded: v.dateUploaded || null, length: v.length, width: v.width, height: v.height };
}

/** فرق المدة بين قراءتين للفيديو نفسه أقل من ثانية، والفيديو البديل يندر أن يطابق الأبعاد والتاريخ معًا */
const LENGTH_TOLERANCE_SECONDS = 1;

export function sameVideo(a: VideoFingerprint, b: VideoFingerprint): boolean {
  if (a.originalHash && b.originalHash) return a.originalHash === b.originalHash;
  return a.dateUploaded === b.dateUploaded && a.width === b.width && a.height === b.height && Math.abs(a.length - b.length) <= LENGTH_TOLERANCE_SECONDS;
}
