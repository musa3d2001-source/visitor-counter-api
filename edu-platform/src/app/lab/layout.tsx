import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "مختبر التصميم", robots: { index: false, follow: false } };

/**
 * نماذج الاتجاهات التصميمية الثلاثة (أ/ب/ج) التي قورنت قبل اعتماد «جدول الحصص».
 * تبقى للمراجعة في بيئة التطوير فقط، ولا تُعرض في الإنتاج.
 */
export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <>{children}</>;
}
