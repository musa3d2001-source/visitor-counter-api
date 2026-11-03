import "server-only";
import { gradeStats, latestVideoProducts, listGrades, listProducts, listTeachers } from "@/server/catalog/queries";
import { getSettings } from "@/server/platform/settings";

/** بيانات حقيقية مشتركة لنماذج الاتجاهات الثلاثة (مختبر تصميم مؤقت) */
export async function labData() {
  const [grades, stats, videos, teachers, bundles, examReviews, quizReviews, notes, settings] = await Promise.all([
    listGrades(),
    gradeStats(),
    latestVideoProducts(8),
    listTeachers({ limit: 6 }),
    listProducts({ type: "bundle", limit: 4 }),
    listProducts({ type: "exam_review", limit: 4 }),
    listProducts({ type: "quiz_review", limit: 4 }),
    listProducts({ type: "final_notes", order: "latest", limit: 6 }),
    getSettings(),
  ]);
  return { grades, stats, videos, teachers, bundles, reviews: [...examReviews, ...quizReviews].slice(0, 5), notes, settings };
}

export function minutes(sec: number): string {
  if (!sec) return "";
  const m = Math.max(1, Math.round(sec / 60));
  return m === 1 ? "دقيقة" : m === 2 ? "دقيقتان" : m <= 10 ? `${m} دقائق` : `${m} دقيقة`;
}

export const ARABIC_DIGITS = (n: number | string) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
