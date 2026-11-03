import type { ProductCard } from "@/server/catalog/queries";
import { BundleWide } from "./bundle-card";

export { BundleCard, BundleWide, bundleColors } from "./bundle-card";

/**
 * صف الباقة (للتوافق): أصبح «باقة عريضة» بلوحة الصف والأوراق المروحية، والسعر مع الوفر الفعلي
 * (الفرق عن السعر قبل الخصم فقط إن وُجد). مرّر items (محتويات الباقة) لتلوين الأوراق بموادها الحقيقية.
 */
export function BundleRow({ b, owned, showGrade = true, items }: { b: ProductCard; owned?: boolean; showGrade?: boolean; items?: ProductCard[] }) {
  return <BundleWide product={b} owned={owned} showGrade={showGrade} items={items} />;
}
