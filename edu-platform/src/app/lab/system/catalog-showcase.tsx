/**
 * قسم «بطاقات الكتالوج» في دليل الأسلوب: كل مكونات src/components/site الخاصة بالمحتوى ببيانات حقيقية
 * من قاعدة البيانات (لا أرقام مخترعة). للتطوير فقط.
 */
import "server-only";
import type * as React from "react";
import { LayoutGrid, Package } from "lucide-react";
import { getBundleItems, gradeStats, latestVideoProducts, listGrades, listProducts, listSubjects, listTeachers } from "@/server/catalog/queries";
import { SectionHead } from "@/components/ui/section-head";
import { ProductCard, ProductGrid, ProductList, ProductShelf } from "@/components/site/product-card";
import { ExamTicket } from "@/components/site/exam-ticket";
import { BundleCard, BundleRow } from "@/components/site/bundle-row";
import { TeacherCard } from "@/components/site/teacher-card";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { GradeCard, GradeGrid } from "@/components/site/grade-card";
import { SubjectGrid, SubjectTile } from "@/components/site/subject-tile";
import { ProductCover } from "@/components/site/product-cover";

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mt-12 mb-4 font-display text-[0.85rem] font-extrabold text-muted first:mt-0">{children}</p>;
}

export async function CatalogShowcase() {
  const [grades, stats, videos, teachers, bundles, exams, quizzes, notes] = await Promise.all([
    listGrades(),
    gradeStats(),
    latestVideoProducts(4),
    listTeachers({ limit: 4 }),
    listProducts({ type: "bundle", limit: 4 }),
    listProducts({ type: "exam_review", limit: 2 }),
    listProducts({ type: "quiz_review", limit: 2 }),
    listProducts({ type: "final_notes", order: "latest", limit: 6 }),
  ]);
  const [subjectsByGrade, bundleItems] = await Promise.all([Promise.all(grades.map((g) => listSubjects(g.id))), Promise.all(bundles.map((b) => getBundleItems(b.id)))]);
  const itemsById = new Map(bundles.map((b, i) => [b.id, bundleItems[i] ?? []]));
  const firstGrade = grades[0];
  const firstSubjects = subjectsByGrade[0] ?? [];
  const reviews = [...exams, ...quizzes];

  return (
    <section id="catalog" aria-labelledby="catalog-t" className="scroll-mt-28 py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead
          id="catalog-t"
          icon={<LayoutGrid aria-hidden />}
          eyebrow="بطاقات الكتالوج"
          tone="coral"
          title="الدروس والمذكرات والباقات والمعلمون"
          sub="‏من ‎@/components/site‎ ببيانات حقيقية: ProductCard يختار الشكل حسب النوع، ProductList صفوف تذاكر ملونة للقوائم الطويلة."
        />

        <Label>GradeCard + GradeGrid (الأعداد من gradeStats)</Label>
        <GradeGrid>
          {grades.map((g, i) => {
            const st = stats.get(g.id);
            return (
              <li key={g.id}>
                <GradeCard grade={g} stats={st ? { subjects: st.subjects, products: st.products } : null} subjects={subjectsByGrade[i]} />
              </li>
            );
          })}
        </GradeGrid>

        {firstGrade ? (
          <>
            <Label>SubjectTile + SubjectGrid ({firstGrade.name})</Label>
            <SubjectGrid>
              {firstSubjects.map((x) => (
                <li key={x.id}>
                  <SubjectTile subject={x} href={`/grades/${firstGrade.slug}/${x.slug}`} />
                </li>
              ))}
            </SubjectGrid>
            <div className="mt-4 grid max-w-md gap-2.5">
              {firstSubjects.slice(0, 2).map((x) => (
                <SubjectTile key={x.id} subject={x} href={`/grades/${firstGrade.slug}/${x.slug}`} layout="row" />
              ))}
            </div>
          </>
        ) : null}

        <Label>ProductShelf / ProductGrid ← VideoCard (رف أفقي على الجوال)</Label>
        <ProductShelf products={videos} />

        <Label>ProductGrid لمذكرات فقط ← NoteCard (ورقة مطوية، الصف والصفحات)</Label>
        <ProductGrid products={notes} />

        <Label>ExamTicket (تذكرة مثقوبة) على سطح ليلي</Label>
        <div className="rounded-[2.5rem] bg-[linear-gradient(to_left,#1d1a57,#33278f_35%,#6b36b3_65%,#d9507e)] p-4 sm:p-8">
          <ul className="grid gap-3 lg:grid-cols-2">
            {reviews.map((p) => (
              <li key={p.id}>
                <ExamTicket product={p} />
              </li>
            ))}
          </ul>
        </div>

        <Label>BundleCard (أوراق بألوان المواد الفعلية + ملصق التوفير الحقيقي)</Label>
        <ProductGrid products={bundles} itemsById={itemsById} />

        <Label>BundleRow (عريضة، data-testid=bundle-row) مع items</Label>
        <div className="grid gap-4">
          {bundles.slice(0, 2).map((b) => (
            <BundleRow key={b.id} b={b} items={itemsById.get(b.id)} />
          ))}
        </div>

        <Label>ProductList (columns=2، showGrade) ← صفوف تذاكر؛ المراجعات بثقوب</Label>
        <ProductList products={[...videos.slice(0, 2), ...reviews.slice(0, 1), ...notes.slice(0, 2), ...bundles.slice(0, 1)]} columns={2} showGrade />

        <Label>TeacherCard / TeacherGrid</Label>
        <ul className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-4">
          {teachers.map((t) => (
            <li key={t.id} className="min-w-0">
              <TeacherCard teacher={t} />
            </li>
          ))}
        </ul>

        <Label>TeacherAvatar (حرف بلون المادة أو صورة) · ProductCover (كامل ومصغّر)</Label>
        <div className="flex flex-wrap items-end gap-5">
          {teachers.map((t) => (
            <TeacherAvatar key={t.id} name={t.name} photoUrl={t.photoUrl} subjectSlug={t.subjects[0]?.slug ?? null} size={64} ring />
          ))}
          {notes[0] ? (
            <>
              <ProductCover coverUrl={null} title={notes[0].title} type={notes[0].type} subjectName={notes[0].subjectName} gradeName={notes[0].gradeName} className="w-44" />
              <ProductCover coverUrl={null} title={notes[0].title} type={notes[0].type} subjectName={notes[0].subjectName} gradeName={notes[0].gradeName} compact className="w-16" />
            </>
          ) : null}
          {videos[0] ? <ProductCover coverUrl={null} title={videos[0].title} type={videos[0].type} subjectName={videos[0].subjectName} subjectSlug={videos[0].subjectSlug} gradeName={videos[0].gradeName} wide className="w-64" /> : null}
        </div>

        <Label>ProductCard variant=&quot;ticket&quot; · ProductCard على باقة بلا items (ألوان الصف فقط)</Label>
        <div className="grid items-start gap-5 md:grid-cols-2">
          {videos[1] ? <ProductCard product={videos[1]} variant="ticket" /> : null}
          {bundles[0] ? (
            <div className="max-w-xs">
              <ProductCard product={bundles[0]} />
            </div>
          ) : null}
        </div>
        <p className="mt-6 flex items-center gap-2 text-sm text-muted">
          <Package className="size-4" aria-hidden /> الأسعار باللاتينية داخل ‎.num‎، والأعداد بالعربية عبر count()، والتوفير فقط حين يكون السعر قبل الخصم أعلى.
        </p>
      </div>
    </section>
  );
}
