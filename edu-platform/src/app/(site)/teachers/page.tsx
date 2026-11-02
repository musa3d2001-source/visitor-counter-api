import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { listGrades, listSubjects, listTeachers } from "@/server/catalog/queries";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { TeacherGrid } from "@/components/site/teacher-card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "المعلمون",
  description: "تعرّف على معلمي المنصة وشروحاتهم المرئية ومراجعاتهم لكل صف ومادة.",
  alternates: { canonical: "/teachers" },
};

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ grade?: string; subject?: string }> }) {
  const sp = await searchParams;
  const grades = await listGrades();
  const grade = grades.find((g) => g.slug === sp.grade) ?? null;
  const subjects = grade ? await listSubjects(grade.id) : [];
  const subject = subjects.find((s) => s.slug === sp.subject) ?? null;
  const teachers = await listTeachers({ gradeId: grade?.id, subjectId: subject?.id });

  const chip = (active: boolean) =>
    cn("min-h-10 rounded-md px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors", active ? "bg-ink text-white" : "text-ink-soft hover:bg-mist");

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: "المعلمون" }]} />
      <header className="mt-6 border-b-2 border-ink pb-6">
        <h1 className="text-[clamp(2.4rem,6vw,4.2rem)] leading-[1.05]">المعلمون</h1>
        <p className="mt-3 max-w-xl leading-8 text-ink-soft">اختر صفك ومادتك لتصل إلى معلمك مباشرة، ثم شاهد أول درس من شرحه مجانًا.</p>
      </header>

      <nav aria-label="تصفية حسب الصف" className="mt-6 flex gap-1 overflow-x-auto pb-1">
        <Link href="/teachers" className={chip(!grade)} aria-current={!grade ? "page" : undefined}>
          كل الصفوف
        </Link>
        {grades.map((g) => (
          <Link key={g.id} href={`/teachers?grade=${g.slug}`} className={chip(grade?.id === g.id)} aria-current={grade?.id === g.id ? "page" : undefined}>
            {g.name}
          </Link>
        ))}
      </nav>
      {grade && subjects.length ? (
        <nav aria-label="تصفية حسب المادة" className="mt-2 flex gap-1 overflow-x-auto border-t border-line pt-2 pb-1">
          <Link href={`/teachers?grade=${grade.slug}`} className={chip(!subject)} aria-current={!subject ? "page" : undefined}>
            كل المواد
          </Link>
          {subjects.map((s) => (
            <Link key={s.id} href={`/teachers?grade=${grade.slug}&subject=${s.slug}`} className={chip(subject?.id === s.id)} aria-current={subject?.id === s.id ? "page" : undefined}>
              {s.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <section className="mt-8" aria-labelledby="teachers-list">
        <h2 id="teachers-list" className="sr-only">
          قائمة المعلمين
        </h2>
        {teachers.length ? (
          <TeacherGrid teachers={teachers} />
        ) : (
          <EmptyState icon={<GraduationCap />} title="لا يوجد معلمون لهذا الاختيار بعد" description="اختر صفًا أو مادة أخرى، أو اعرض كل المعلمين." />
        )}
      </section>
    </div>
  );
}
