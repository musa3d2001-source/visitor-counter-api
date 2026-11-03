import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Layers, Sparkles } from "lucide-react";
import { getBundleItems, listGrades, listProducts } from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, StatPill } from "@/components/ui/page-header";
import { BundleCard, BundleWide } from "@/components/site/bundle-card";
import { BundleStack, Sparkle } from "@/components/art";
import { filsToKwdString } from "@/lib/money";
import { ar, countParts, gradeClass, gradeLevelFromSlug, RAINBOW, savings, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { BUNDLE_WORD, GradeBand } from "./_components/grade-band";
import s from "./_components/bundles.module.css";

export const metadata: Metadata = {
  title: "الباقات والعروض",
  description: "باقات تجمع الشروحات والمراجعات والمذكرات لكل صف ومادة بسعر أقل من شرائها منفردة.",
  alternates: { canonical: "/bundles" },
};

export default async function BundlesPage() {
  const [bundles, grades, user] = await Promise.all([listProducts({ type: "bundle" }), listGrades(), getCurrentUser()]);
  const [owned, itemLists] = await Promise.all([user ? accessibleProductIds(user.id) : Promise.resolve(undefined), Promise.all(bundles.map((b) => getBundleItems(b.id)))]);
  const itemsById = new Map(bundles.map((b, i) => [b.id, itemLists[i]]));
  const byGrade = grades
    .map((g) => ({ grade: g, items: bundles.filter((b) => b.gradeSlug === g.slug) }))
    .filter((x) => x.items.length);
  // أكبر توفير حقيقي بين الباقات المعروضة (فرق السعر قبل الخصم فقط)
  const bestSave = bundles.reduce((m, b) => Math.max(m, savings(b.priceFils, b.compareAtPriceFils)?.fils ?? 0), 0);

  return (
    <>
      <PageHeader
        titleId="bundles-title"
        title={
          <>
            الباقات <span className="text-hl">والعروض</span>
          </>
        }
        sub="كل باقة تجمع محتوى صف أو مادة بسعر أقل من مجموع أسعاره. الوفر المكتوب هو الفرق الفعلي عن السعر قبل الخصم."
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "الباقات والعروض" }]}
        eyebrow={{ icon: <Layers aria-hidden />, label: "اشترِ مرة ووفّر", tone: "gold" }}
        aside={
          <div className={s.heroArt} aria-hidden>
            <span className={s.heroBlob} />
            <div className={s.heroStack}>
              <BundleStack colors={[...RAINBOW]} />
            </div>
            {bestSave > 0 ? (
              <span className={cn(s.ribbon, "animate-bob")}>
                وفّر حتى
                <b className="num">{filsToKwdString(bestSave)} د.ك</b>
              </span>
            ) : null}
            <Sparkle className="animate-twinkle absolute bottom-[12%] left-[4%] size-7" />
            <Sparkle className="animate-twinkle absolute top-[10%] left-[22%] size-4 [animation-delay:1s]" color="#18B9A7" />
          </div>
        }
      >
        {bundles.length ? (
          <div className="flex flex-wrap gap-3">
            <StatPill icon={<Layers aria-hidden />} {...countParts(bundles.length, BUNDLE_WORD)} tone="gold" />
            <StatPill icon={<GraduationCap aria-hidden />} {...countParts(byGrade.length, W.grade)} tone="teal" />
          </div>
        ) : null}
        {/* القفز إلى صف: داخل البطل تحت الأرقام، فلا يقطعه حدّ خلفيته */}
        {byGrade.length > 1 ? (
          <nav aria-label="انتقل إلى صف" className="mt-5 flex flex-wrap gap-3 lg:grid lg:w-max lg:grid-cols-2">
            {byGrade.map(({ grade }) => {
              const lv = grade.level ?? gradeLevelFromSlug(grade.slug);
              return (
                <Link key={grade.id} href={`#g-${grade.slug}`} className={cn(s.jump, gradeClass(lv))}>
                  <span className={cn("num-tile", s.jumpNum)} aria-hidden>
                    {lv != null ? ar(lv) : <Sparkles className="size-4" />}
                  </span>
                  {grade.name}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </PageHeader>

      <div className="mx-auto max-w-7xl px-4 pt-4 pb-16 sm:px-6">
        {byGrade.length === 0 ? (
          <div className="panel p-6 sm:p-10">
            <EmptyState headingLevel={2} title="لا توجد باقات حاليًا" description="عند نشر باقة جديدة تظهر هنا مع وفرها الفعلي." />
          </div>
        ) : (
          <>
            <div className="space-y-14">
              {byGrade.map(({ grade, items }) => {
                const lv = grade.level ?? gradeLevelFromSlug(grade.slug);
                return (
                  <section key={grade.id} aria-labelledby={`g-${grade.slug}`} className={cn(s.row, items.length === 1 && s.rowSingle)}>
                    <GradeBand id={`g-${grade.slug}`} level={lv} name={grade.name} slug={grade.slug} bundles={items.length} />
                    {items.length === 1 ? (
                      // باقة وحيدة: البطاقة العريضة تملأ الصف بدل خانة فارغة بجانبها
                      <div className={s.single}>
                        <BundleWide product={items[0]} items={itemsById.get(items[0].id)} owned={owned?.has(items[0].id)} showGrade={false} />
                      </div>
                    ) : (
                      <ul className={s.grid}>
                        {items.map((b) => (
                          <li key={b.id}>
                            <BundleCard product={b} items={itemsById.get(b.id)} owned={owned?.has(b.id)} level={lv} showGrade={false} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
