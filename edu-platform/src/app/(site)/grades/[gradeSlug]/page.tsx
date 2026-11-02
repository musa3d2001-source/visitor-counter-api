import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { bestSellers, getGradeBySlug, listProducts, listSubjects } from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductGrid } from "@/components/site/product-card";
import { SubjectIcon } from "@/components/site/subject-icon";
import { termLabel } from "@/lib/labels";

export async function generateMetadata({ params }: { params: Promise<{ gradeSlug: string }> }): Promise<Metadata> {
  const grade = await getGradeBySlug((await params).gradeSlug);
  if (!grade) return {};
  return {
    title: `مذكرات ${grade.name}`,
    description: `المذكرات النهائية ومراجعات ليلة الاختبار ونماذج الاختبارات لـ${grade.name} — ${grade.stageName} في الكويت.`,
    alternates: { canonical: `/grades/${grade.slug}` },
  };
}

export default async function GradePage({ params }: { params: Promise<{ gradeSlug: string }> }) {
  const grade = await getGradeBySlug((await params).gradeSlug);
  if (!grade) notFound();
  const [subjects, bundles, popular, latest, user] = await Promise.all([
    listSubjects(grade.id),
    listProducts({ gradeId: grade.id, type: "bundle", limit: 8 }),
    bestSellers({ gradeId: grade.id, limit: 4 }),
    listProducts({ gradeId: grade.id, excludeType: "bundle", order: "latest", limit: 8 }),
    getCurrentUser(),
  ]);
  const owned = user ? await accessibleProductIds(user.id) : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: grade.stageName, href: `/stages/${grade.stageSlug}` }, { label: grade.name }]} />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{grade.name}</h1>
          <p className="mt-2 text-muted">اختر المادة لعرض مذكراتها ونماذجها</p>
        </div>
        <Badge tone="accent" className="px-3 py-1 text-sm">
          <CalendarDays className="size-4" aria-hidden /> {termLabel(grade.currentTerm)}
        </Badge>
      </div>

      <section className="mt-8" aria-labelledby="subjects">
        <h2 id="subjects" className="sr-only">المواد الدراسية</h2>
        {subjects.length === 0 ? (
          <EmptyState title="لا توجد مواد متاحة حاليًا" description="نجهز محتوى هذا الصف، تابعنا قريبًا." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {subjects.map((s) => (
              <Link
                key={s.id}
                href={`/grades/${grade.slug}/${s.slug}`}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-6 text-center shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
              >
                <span className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                  <SubjectIcon name={s.icon} className="size-7" />
                </span>
                <span className="font-bold">{s.name}</span>
                <span className="text-xs text-muted">
                  <span className="num">{s.productCount}</span> منتج
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {bundles.length ? (
        <section className="mt-14">
          <h2 className="mb-5 text-2xl font-bold">باقات {grade.name}</h2>
          <ProductGrid products={bundles} ownedIds={owned} />
        </section>
      ) : null}

      {popular.length ? (
        <section className="mt-14">
          <h2 className="mb-5 text-2xl font-bold">الأكثر طلبًا</h2>
          <ProductGrid products={popular} ownedIds={owned} />
        </section>
      ) : null}

      {latest.length ? (
        <section className="mt-14">
          <h2 className="mb-5 text-2xl font-bold">أحدث الإضافات</h2>
          <ProductGrid products={latest} ownedIds={owned} />
        </section>
      ) : null}
    </div>
  );
}
