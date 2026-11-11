import type { Metadata } from "next";
import { notFound } from "next/navigation";
// المختبر يعرض مكونات اللوحة والموقع معًا، فيأخذ ورقة اللوحة الكاملة (البند R021)
import "../admin/admin.css";

export const metadata: Metadata = { title: "مختبر التصميم", robots: { index: false, follow: false } };

/**
 * مختبر التصميم: النموذج المرجعي v2-c («فصل مشمس») ودليلا المكونات (system و admin-kit).
 * للمراجعة في بيئة التطوير فقط، ولا يُعرض في الإنتاج.
 */
export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <>{children}</>;
}
