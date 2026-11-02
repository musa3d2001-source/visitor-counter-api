import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGradeBySlug, getSubject, listProducts } from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductGrid } from "@/components/site/product-card";
import { SubjectIcon } from "@/components/site/subject-icon";
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPE_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Params = { gradeSlug: string; subjectSlug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const grade = await getGradeBySlug(p.gradeSlug);
  const subject = grade ? await getSubject(grade.id, p.subjectSlug) : null;
  if (!grade || !subject) return {};
  return {
    title: `${subject.name} — ${grade.name}`,
    description: `مذكرات ${subject.name} لـ${grade.name}: المذكرة النهائية، ليلة الاختبار، نماذج الاختبارات والإجابات.`,
    alternates: { canonical: `/grades/${grade.slug}/${subject.slug}` },
  };
}

export default async function SubjectPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ term?: string }> }) {
  const p = await params;
  const sp = await searchParams;
  const grade = await getGradeBySlug(p.gradeSlug);
  if (!grade) notFound();
  const subject = await getSubject(grade.id, p.subjectSlug);
  if (!subject) notFound();

  const all = await listProducts({ gradeId: grade.id, subjectId: subject.id });
  const terms = [...new Set(all.map((x) => x.term).filter((t): t is number => t !== null))].sort();
  const term = sp.term === "1" || sp.term === "2" ? Number(sp.term) : null;
  const products = term ? all.filter((x) => x.term === term || x.term === null) : all;
  const user = await getCurrentUser();
  const owned = user ? await accessibleProductIds(user.id) : undefined;
  const groups = PRODUCT_TYPE_ORDER.map((type) => ({ type, items: products.filter((x) => x.type === type) })).filter((g) => g.items.length);
  const base = `/grades/${grade.slug}/${subject.slug}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: grade.name, href: `/grades/${grade.slug}` }, { label: subject.name }]} />
      <div className="mt-4 flex items-center gap-4">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-600 text-white">
          <SubjectIcon name={subject.icon} className="size-7" />
        </span>
        <div>
          <h1 className="text-3xl font-bold">{subject.name}</h1>
          <p className="mt-1 text-muted">{grade.name}</p>
        </div>
      </div>

      {terms.length > 1 ? (
        <nav aria-label="تصفية حسب الفصل الدراسي" className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {[
            { label: "الكل", href: base, active: term === null },
            ...terms.map((t) => ({ label: t === 1 ? "الفصل الأول" : "الفصل الثاني", href: `${base}?term=${t}`, active: term === t })),
          ].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition",
                t.active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-ink-soft hover:border-brand-300",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState className="mt-8" title="لا توجد منتجات لهذا الفصل" description="جرّب اختيار «الكل» أو فصلًا دراسيًا آخر." />
      ) : (
        <div className="mt-8 space-y-12">
          {groups.map((g) => (
            <section key={g.type} aria-labelledby={`type-${g.type}`}>
              <h2 id={`type-${g.type}`} className="mb-4 flex items-center gap-2 text-xl font-bold">
                <span className="h-6 w-1.5 rounded-full bg-accent-600" aria-hidden />
                {g.type === "bundle" ? "الباقات" : PRODUCT_TYPE_LABELS[g.type]}
              </h2>
              <ProductGrid products={g.items} ownedIds={owned} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
