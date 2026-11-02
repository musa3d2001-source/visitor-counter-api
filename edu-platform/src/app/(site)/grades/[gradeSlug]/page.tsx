import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { bestSellers, getGradeBySlug, listProducts, listSubjects, teachersForSubject } from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductList } from "@/components/site/product-card";
import { termLabel } from "@/lib/labels";
import { arabicCount } from "@/components/site/format";

const arabicDigits = (n: number | string) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

export async function generateMetadata({ params }: { params: Promise<{ gradeSlug: string }> }): Promise<Metadata> {
  const grade = await getGradeBySlug((await params).gradeSlug);
  if (!grade) return {};
  return {
    title: `شروحات ومذكرات ${grade.name}`,
    description: `شرح الوحدات بالفيديو ومراجعات الاختبارات والمذكرات النهائية لطلاب ${grade.name}، ${grade.stageName} في الكويت.`,
    alternates: { canonical: `/grades/${grade.slug}` },
  };
}

export default async function GradePage({ params }: { params: Promise<{ gradeSlug: string }> }) {
  const grade = await getGradeBySlug((await params).gradeSlug);
  if (!grade) notFound();
  const [subjects, bundles, popular, latest, reviewsExam, reviewsQuiz, user] = await Promise.all([
    listSubjects(grade.id),
    listProducts({ gradeId: grade.id, type: "bundle", limit: 6 }),
    bestSellers({ gradeId: grade.id, limit: 4 }),
    listProducts({ gradeId: grade.id, excludeType: "bundle", order: "latest", limit: 6 }),
    listProducts({ gradeId: grade.id, type: "exam_review", limit: 4 }),
    listProducts({ gradeId: grade.id, type: "quiz_review", limit: 4 }),
    getCurrentUser(),
  ]);
  const owned = user ? await accessibleProductIds(user.id) : undefined;
  const teachersBySubject = new Map(await Promise.all(subjects.map(async (s) => [s.id, await teachersForSubject(s.id)] as const)));
  const reviews = [...reviewsExam, ...reviewsQuiz];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: grade.stageName, href: `/stages/${grade.stageSlug}` }, { label: grade.name }]} />

      <header className="mt-6 grid grid-cols-[auto_1fr] items-end gap-x-5 border-b-2 border-ink pb-6 sm:gap-x-8">
        <span className="font-display text-[clamp(6rem,16vw,11rem)] leading-[0.8] font-medium text-brand-700" aria-hidden>
          {arabicDigits(grade.level)}
        </span>
        <div className="pb-1">
          <h1 className="text-[clamp(2.2rem,5vw,3.6rem)]">{grade.name}</h1>
          <p className="mt-2 text-muted">
            {grade.stageName}، {termLabel(grade.currentTerm)}
          </p>
        </div>
      </header>

      <section className="mt-10" aria-labelledby="subjects">
        <h2 id="subjects" className="mb-1 text-[clamp(1.7rem,3vw,2.3rem)]">
          المواد
        </h2>
        <p className="mb-5 text-muted">اختر المادة لترى شرح وحداتها ومراجعاتها ومذكراتها.</p>
        {subjects.length === 0 ? (
          <EmptyState title="لا توجد مواد منشورة لهذا الصف بعد" description="نجهّز المحتوى الآن، وتظهر المواد هنا فور نشرها." />
        ) : (
          <ul className="grid border-t border-line sm:grid-cols-2 sm:gap-x-12">
            {subjects.map((s) => {
              const teachers = teachersBySubject.get(s.id) ?? [];
              return (
                <li key={s.id} className="border-b border-line">
                  <Link href={`/grades/${grade.slug}/${s.slug}`} className="group flex min-h-20 items-center justify-between gap-4 py-4">
                    <span>
                      <span className="block font-display text-[1.9rem] leading-tight font-semibold group-hover:text-brand-700">{s.name}</span>
                      {teachers.length ? <span className="text-sm text-muted">مع {teachers.slice(0, 2).map((t) => t.name).join(" و")}</span> : null}
                    </span>
                    <span className="shrink-0 text-sm text-muted">{arabicCount(s.productCount, { one: "عنصر", two: "عنصران", few: "عناصر", many: "عنصرًا" })}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {reviews.length ? (
        <section className="mt-14" aria-labelledby="reviews">
          <h2 id="reviews" className="mb-1 text-[clamp(1.7rem,3vw,2.3rem)]">
            قبل الاختبار
          </h2>
          <p className="mb-5 text-muted">مراجعات مركزة لاختبارات {grade.name} القصيرة والنهائية.</p>
          <ProductList products={reviews} ownedIds={owned} />
        </section>
      ) : null}

      {bundles.length ? (
        <section className="mt-14" aria-labelledby="bundles">
          <h2 id="bundles" className="mb-5 text-[clamp(1.7rem,3vw,2.3rem)]">
            باقات {grade.name}
          </h2>
          <ProductList products={bundles} ownedIds={owned} />
        </section>
      ) : null}

      {popular.length ? (
        <section className="mt-14" aria-labelledby="popular">
          <h2 id="popular" className="mb-5 text-[clamp(1.7rem,3vw,2.3rem)]">
            الأكثر طلبًا
          </h2>
          <ProductList products={popular} ownedIds={owned} columns={2} />
        </section>
      ) : null}

      {latest.length ? (
        <section className="mt-14" aria-labelledby="latest">
          <h2 id="latest" className="mb-5 text-[clamp(1.7rem,3vw,2.3rem)]">
            أضيف حديثًا
          </h2>
          <ProductList products={latest} ownedIds={owned} columns={2} />
        </section>
      ) : null}
    </div>
  );
}
