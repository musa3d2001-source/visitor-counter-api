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
    cn(
      "rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition",
      active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-ink-soft hover:border-brand-300",
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: "المعلمون" }]} />
      <h1 className="mt-4 text-3xl font-bold">المعلمون</h1>
      <p className="mt-2 text-muted">اختر صفك ومادتك لتصل إلى معلمك مباشرة</p>

      <nav aria-label="تصفية حسب الصف" className="mt-6 flex gap-2 overflow-x-auto pb-1">
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
        <nav aria-label="تصفية حسب المادة" className="mt-2 flex gap-2 overflow-x-auto pb-1">
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

      <div className="mt-8">
        {teachers.length ? (
          <TeacherGrid teachers={teachers} />
        ) : (
          <EmptyState icon={<GraduationCap />} title="لا يوجد معلمون لهذا الاختيار حاليًا" description="جرّب صفًا أو مادة أخرى، أو تصفح كل المعلمين." />
        )}
      </div>
    </div>
  );
}
