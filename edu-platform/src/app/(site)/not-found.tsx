import type { Metadata } from "next";
import { NotFoundView } from "@/components/site/not-found-view";

export const metadata: Metadata = { title: "الصفحة غير موجودة", robots: { index: false } };

/** داخل تخطيط الموقع: يلتقط notFound() من بوابات layout فوق loading، فيبقى الرأس والتذييل ومعهما 404 حقيقية */
export default function NotFound() {
  return <NotFoundView nested />;
}
