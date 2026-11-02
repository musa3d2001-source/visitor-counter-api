import type { Metadata } from "next";
import Link from "next/link";
import { listGrades, listProducts } from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { BundleRow } from "@/components/site/bundle-row";

export const metadata: Metadata = {
  title: "الباقات والعروض",
  description: "باقات تجمع الشروحات والمراجعات والمذكرات لكل صف ومادة بسعر أقل من شرائها منفردة.",
  alternates: { canonical: "/bundles" },
};

const arabicDigits = (n: number | string) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

export default async function BundlesPage() {
  const [bundles, grades, user] = await Promise.all([listProducts({ type: "bundle" }), listGrades(), getCurrentUser()]);
  const owned = user ? await accessibleProductIds(user.id) : undefined;
  const byGrade = grades
    .map((g) => ({ grade: g, items: bundles.filter((b) => b.gradeSlug === g.slug) }))
    .filter((x) => x.items.length);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: "الباقات والعروض" }]} />
      <header className="mt-6 max-w-2xl border-b-2 border-ink pb-6">
        <h1 className="text-[clamp(2.4rem,6vw,3.8rem)]">الباقات والعروض</h1>
        <p className="mt-3 text-lg leading-8 text-ink-soft">
          كل باقة تجمع محتوى صف أو مادة بسعر أقل من مجموع أسعاره. الوفر المكتوب هو الفرق الفعلي عن السعر قبل الخصم.
        </p>
      </header>

      {byGrade.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="لا توجد باقات حاليًا" description="عند نشر باقة جديدة تظهر هنا مع وفرها الفعلي." />
        </div>
      ) : (
        byGrade.map(({ grade, items }) => (
          <section key={grade.id} className="mt-12" aria-labelledby={`g-${grade.slug}`}>
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 id={`g-${grade.slug}`} className="flex items-end gap-3 text-[clamp(1.7rem,3vw,2.3rem)]">
                <span className="font-display text-[3.2rem] leading-[0.8] font-medium text-brand-700" aria-hidden>
                  {arabicDigits(grade.level)}
                </span>
                {grade.name}
              </h2>
              <Link href={`/grades/${grade.slug}`} className="shrink-0 text-sm font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4">
                كل محتوى {grade.name}
              </Link>
            </div>
            <ul className="space-y-3">
              {items.map((b) => (
                <li key={b.id}>
                  <BundleRow b={b} owned={owned?.has(b.id)} showGrade={false} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
