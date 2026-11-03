import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { checkFileAccess } from "@/server/access/entitlements";
import { getCurrentUser } from "@/server/auth/session";
import { sql } from "@/server/db";
import { getPublishedProductsByIds } from "@/server/catalog/queries";
import { PdfReader } from "@/components/reader/pdf-reader";

export const metadata: Metadata = { title: "معاينة مجانية", robots: { index: false, follow: true } };

export default async function PreviewPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const user = await getCurrentUser();
  const access = await checkFileAccess(fileId, user?.role === "admin" ? user : null);
  if (!access.ok || access.file.kind !== "preview") notFound();
  const [product] = await sql<{ slug: string; title: string }[]>`select slug, title from products where id = ${access.product.id}`;
  // السعر لبطاقة «انتهت المعاينة» (للمنتج المنشور فقط؛ معاينة المدير لمنتج غير منشور تظهر بلا سعر)
  const [card] = await getPublishedProductsByIds([access.product.id]);
  return (
    <PdfReader
      src={`/api/files/${fileId}`}
      title={`معاينة: ${product.title}`}
      backHref={`/products/${product.slug}`}
      backLabel="العودة للمذكرة"
      badge="معاينة مجانية. اشترِ المذكرة للوصول الكامل"
      variant="preview"
      cta={{
        href: `/products/${product.slug}`,
        label: "اشترِ المذكرة",
        shortLabel: "اشترِ",
        priceFils: card?.priceFils ?? null,
        compareAtPriceFils: card?.compareAtPriceFils ?? null,
      }}
    />
  );
}
