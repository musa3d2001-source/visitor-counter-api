import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGradeBySlug, getSubject, listProducts, teachersForSubject } from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductList } from "@/components/site/product-card";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { isPdfType, PRODUCT_TYPE_ORDER, PRODUCT_TYPE_SECTION_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Params = { gradeSlug: string; subjectSlug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const grade = await getGradeBySlug(p.gradeSlug);
  const subject = grade ? await getSubject(grade.id, p.subjectSlug) : null;
  if (!grade || !subject) return {};
  return {
    title: `${subject.name} ${grade.name}`,
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

  const [all, teachers] = await Promise.all([listProducts({ gradeId: grade.id, subjectId: subject.id }), teachersForSubject(subject.id)]);
  const terms = [...new Set(all.map((x) => x.term).filter((t): t is number => t !== null))].sort();
  const term = sp.term === "1" || sp.term === "2" ? Number(sp.term) : null;
  const products = term ? all.filter((x) => x.term === term || x.term === null) : all;
  const user = await getCurrentUser();
  const owned = user ? await accessibleProductIds(user.id) : undefined;
  const groups = PRODUCT_TYPE_ORDER.map((type) => ({ type, items: products.filter((x) => x.type === type) })).filter((g) => g.items.length);
  const base = `/grades/${grade.slug}/${subject.slug}`;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: grade.name, href: `/grades/${grade.slug}` }, { label: subject.name }]} />
      <header className="mt-6 border-b-2 border-ink pb-6">
        <p className="text-muted">{grade.name}</p>
        <h1 className="mt-1 text-[clamp(2.4rem,6vw,4.2rem)] leading-[1.05]">{subject.name}</h1>
        {teachers.length ? (
          <div className="mt-6" aria-labelledby="subject-teachers">
            <h2 id="subject-teachers" className="mb-2 font-sans text-sm font-semibold text-muted">
              معلمو المادة
            </h2>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {teachers.map((t) => (
                <Link
                  key={t.id}
                  href={`/teachers/${t.slug}#${subject.slug}-${grade.slug}`}
                  data-testid="subject-teacher"
                  className="flex min-h-12 shrink-0 items-center gap-2.5 rounded-lg border border-line py-1.5 ps-1.5 pe-4 transition-colors hover:border-brand-500 hover:bg-mist"
                >
                  <TeacherAvatar name={t.name} photoUrl={t.photoUrl} size={36} />
                  <span className="text-sm font-semibold whitespace-nowrap">{t.name}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      {terms.length > 1 ? (
        <nav aria-label="تصفية حسب الفصل الدراسي" className="mt-6 inline-flex rounded-lg border border-line-strong p-1">
          {[
            { label: "كل الفصول", href: base, active: term === null },
            ...terms.map((t) => ({ label: t === 1 ? "الفصل الأول" : "الفصل الثاني", href: `${base}?term=${t}`, active: term === t })),
          ].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn("min-h-10 rounded-md px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors", t.active ? "bg-ink text-white" : "text-ink-soft hover:bg-mist")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState className="mt-8" title="لا يوجد محتوى لهذا الفصل" description="اختر «كل الفصول» أو الفصل الآخر." />
      ) : (
        <div className="mt-10 space-y-14">
          {groups.map((g) => (
            <section key={g.type} aria-labelledby={`type-${g.type}`}>
              <h2 id={`type-${g.type}`} className="mb-3 text-[clamp(1.6rem,3vw,2.2rem)]">
                {PRODUCT_TYPE_SECTION_LABELS[g.type]}
              </h2>
              <ProductList products={g.items} ownedIds={owned} columns={isPdfType(g.type) ? 2 : 1} showTeacher={!isPdfType(g.type)} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
