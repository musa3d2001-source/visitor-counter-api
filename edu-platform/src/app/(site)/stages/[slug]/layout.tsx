import { notFound } from "next/navigation";
import { getStageBySlug } from "@/server/catalog/public-data";

/** فوق loading.tsx عمدًا: بعد بدء البث تثبت حالة 200، فالرابط غير الموجود يجب أن يُرفض هنا ليبقى 404 حقيقيًا */
export default async function StageGate({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const stage = await getStageBySlug((await params).slug);
  if (!stage || stage.grades.length === 0) notFound();
  return children;
}
