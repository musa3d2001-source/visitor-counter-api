import { ar } from "./design";

/**
 * حد ملف PDF الذي يُختم باسم كل مشترٍ. الختم يحمّل الملف كله في ذاكرة الدالة ثم يحفظ نسخة جديدة منه،
 * فالحد مأخوذ من ذاكرة الدالة لا من خطة التخزين. الاشتقاق في docs/PDF_STAMPING.md («حد الختم»):
 *  - دالة Vercel على Hobby لها 2 GB وvCPU واحد، وعلى Pro الافتراضي 2 GB أيضًا.
 *  - القياس: أثقل ملف ضمن الحدين (مسح 99MB/674 صفحة، ونص 26.5MB/1500 صفحة) بلغ نحو 450MB في الختم الواحد،
 *    وملف 6000 صفحة بلغ 1178MB. عدد الصفحات (الكائنات) يحدد الذاكرة أكثر من الحجم.
 *  - ختمان في وقت واحد على النسخة (STAMP_GATE) = نحو 900MB في أسوأ حال، مع خادم Next نفسه (نحو 300MB)
 *    والبايتات المنقولة خارج الختم (STAMP_TRANSFER_MEMORY_BYTES أدناه، 384MB) يبقى المجموع نحو 1.6GB بهامش عن 2GB.
 * 50MB هو أيضًا حد الملف الواحد في خطة Supabase المجانية، فلا يتغير شيء لمن على تلك الخطة.
 */
export const STAMP_MAX_BYTES = 50 * 1024 * 1024;
export const STAMP_MAX_PAGES = 1500;

export const STAMP_MAX_MB = STAMP_MAX_BYTES / 1024 / 1024;

/**
 * سقف البايتات التي تمسكها نسخة الخادم الواحدة خارج pdf-lib: أصول تُقرأ من التخزين قبل الختم، ونسخ مختومة تنتظر رفعها،
 * ونسخ تُبث من الذاكرة لأن التخزين تعذر حفظها فيه. ما زاد يُرد «مشغول» مع Retry-After بدل أن تنفد ذاكرة النسخة
 * (البندان R007 و R016). 384MB = ستة ملفات من 30MB بأصلها ونسختها معًا، أو ثلاثة بالحد الأقصى 50MB.
 */
export const STAMP_TRANSFER_MEMORY_BYTES = 384 * 1024 * 1024;

/** سبب الحد بلغة المعلم والمالك، يُلحق برسائل الرفض */
export const STAMP_LIMIT_REASON = `حد ملف PDF هو ${ar(STAMP_MAX_MB)} ميجابايت و${ar(STAMP_MAX_PAGES)} صفحة، حتى تُختم نسخة كل طالب باسمه بسرعة. قسّم الملف إلى أجزاء أصغر ثم ارفعها.`;

export function exceedsStampLimit(file: { sizeBytes: number; pageCount: number | null }): boolean {
  return file.sizeBytes > STAMP_MAX_BYTES || (file.pageCount !== null && file.pageCount > STAMP_MAX_PAGES);
}
