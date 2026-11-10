import { notFound } from "next/navigation";
import { getGradeBySlug } from "@/server/catalog/public-data";

/** فوق loading.tsx عمدًا: بعد بدء البث تثبت حالة 200، فالرابط غير الموجود يجب أن يُرفض هنا ليبقى 404 حقيقيًا */
export default async function GradeGate({ children, params }: { children: React.ReactNode; params: Promise<{ gradeSlug: string }> }) {
  if (!(await getGradeBySlug((await params).gradeSlug))) notFound();
  return children;
}
