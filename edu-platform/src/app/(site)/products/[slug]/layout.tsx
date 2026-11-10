import { notFound } from "next/navigation";
import { getCurrentUser, hasSessionCookie } from "@/server/auth/session";
import { getProductBySlug } from "@/server/catalog/public-data";

/** فوق loading.tsx عمدًا: بعد بدء البث تثبت حالة 200، فالرابط غير الموجود يجب أن يُرفض هنا ليبقى 404 حقيقيًا */
export default async function ProductGate({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  if (await getProductBySlug((await params).slug)) return children;
  // غير موجود في الكتالوج العام: المدير والمعلم وحدهما قد يعاينان مسودة، والقرار لهما في الصفحة نفسها
  const user = (await hasSessionCookie()) ? await getCurrentUser() : null;
  if (user?.role !== "admin" && user?.role !== "teacher") notFound();
  return children;
}
