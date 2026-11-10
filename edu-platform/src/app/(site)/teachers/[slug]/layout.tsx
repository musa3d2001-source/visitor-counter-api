import { notFound } from "next/navigation";
import { getCurrentUser, hasSessionCookie } from "@/server/auth/session";
import { getTeacherBySlug } from "@/server/catalog/public-data";

/** فوق loading.tsx عمدًا: بعد بدء البث تثبت حالة 200، فالرابط غير الموجود يجب أن يُرفض هنا ليبقى 404 حقيقيًا */
export default async function TeacherGate({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  if (await getTeacherBySlug((await params).slug)) return children;
  // غير منشور للعامة: المدير وحده يعاينه، والقرار له في الصفحة نفسها
  const user = (await hasSessionCookie()) ? await getCurrentUser() : null;
  if (user?.role !== "admin") notFound();
  return children;
}
