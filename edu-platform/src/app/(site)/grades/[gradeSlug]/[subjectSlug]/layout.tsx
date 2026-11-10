import { notFound } from "next/navigation";
import { getGradeBySlug, getSubject } from "@/server/catalog/public-data";

/** فوق loading.tsx عمدًا: بعد بدء البث تثبت حالة 200، فالرابط غير الموجود يجب أن يُرفض هنا ليبقى 404 حقيقيًا */
export default async function SubjectGate({ children, params }: { children: React.ReactNode; params: Promise<{ gradeSlug: string; subjectSlug: string }> }) {
  const p = await params;
  const grade = await getGradeBySlug(p.gradeSlug);
  if (!grade || !(await getSubject(grade.id, p.subjectSlug))) notFound();
  return children;
}
