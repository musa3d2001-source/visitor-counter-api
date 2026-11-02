import type { Metadata } from "next";
import { Package } from "lucide-react";
import { listProducts } from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductGrid } from "@/components/site/product-card";

export const metadata: Metadata = { title: "الباقات والعروض", description: "باقات المذكرات بأسعار مخفضة لكل صف ومادة.", alternates: { canonical: "/bundles" } };

export default async function BundlesPage() {
  const [bundles, user] = await Promise.all([listProducts({ type: "bundle" }), getCurrentUser()]);
  const owned = user ? await accessibleProductIds(user.id) : undefined;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: "الباقات والعروض" }]} />
      <h1 className="mt-4 text-3xl font-bold">الباقات والعروض</h1>
      <p className="mt-2 text-muted">اشترِ مجموعة مذكرات معًا ووفّر أكثر</p>
      <div className="mt-8">
        {bundles.length ? <ProductGrid products={bundles} ownedIds={owned} /> : <EmptyState icon={<Package />} title="لا توجد باقات حاليًا" description="تابعنا قريبًا لعروض جديدة." />}
      </div>
    </div>
  );
}
