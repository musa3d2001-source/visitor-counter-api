import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, MonitorPlay, Users, X } from "lucide-react";
import { listGrades, listSubjects, listTeachers } from "@/server/catalog/queries";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, StatPill } from "@/components/ui/page-header";
import { TeacherGrid } from "@/components/site/teacher-card";
import { count, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { pillCount } from "../grades/_components/browse";
import { FilterPill, TeacherFaces, TeachersCollage, teacherStyles as s } from "./_components/teachers";

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
  const subject = subjects.find((x) => x.slug === sp.subject) ?? null;
  const filtered = Boolean(grade || subject);
  const [teachers, everyone] = await Promise.all([listTeachers({ gradeId: grade?.id, subjectId: subject?.id }), filtered ? listTeachers() : Promise.resolve(null)]);
  const all = everyone ?? teachers;
  const videoTotal = all.reduce((n, t) => n + t.videoCount, 0);

  return (
    <div className="pb-16">
      <PageHeader
        titleId="teachers-title"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "المعلمون" }]}
        eyebrow={{ icon: <Users aria-hidden />, label: "معلمو المنصة", tone: "coral" }}
        title={
          <>
            تعرّف على <span className="text-hl">معلميك</span>
          </>
        }
        sub="اختر صفك ومادتك لتصل إلى معلمك مباشرة، ثم شاهد أول درس من شرحه مجانًا."
        aside={all.length ? <TeachersCollage teachers={all} /> : undefined}
      >
        {all.length ? <TeacherFaces teachers={all} /> : null}
        {all.length || grades.length ? (
          <div className="flex flex-wrap gap-2.5">
            {all.length ? <StatPill tone="coral" icon={<Users aria-hidden />} {...pillCount(all.length, W.teacher)} /> : null}
            {videoTotal ? <StatPill tone="teal" icon={<MonitorPlay aria-hidden />} {...pillCount(videoTotal, W.videoLesson)} /> : null}
            {grades.length ? <StatPill tone="gold" icon={<GraduationCap aria-hidden />} {...pillCount(grades.length, W.grade)} /> : null}
          </div>
        ) : null}
      </PageHeader>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className={cn("panel", s.filters)}>
          <div className={s.frow}>
            <span className={s.flabel} aria-hidden>
              الصف
            </span>
            <nav aria-label="تصفية حسب الصف" className={s.fscroll}>
              <FilterPill href="/teachers" label="كل الصفوف" active={!grade} all="grades" />
              {grades.map((g) => (
                <FilterPill key={g.id} href={`/teachers?grade=${g.slug}`} label={g.name} active={grade?.id === g.id} grade={g.level} />
              ))}
            </nav>
          </div>
          {grade && subjects.length ? (
            <div className={s.frow}>
              <span className={s.flabel} aria-hidden>
                المادة
              </span>
              <nav aria-label="تصفية حسب المادة" className={s.fscroll}>
                <FilterPill href={`/teachers?grade=${grade.slug}`} label="كل المواد" active={!subject} all="subjects" />
                {subjects.map((x) => (
                  <FilterPill key={x.id} href={`/teachers?grade=${grade.slug}&subject=${x.slug}`} label={x.name} active={subject?.id === x.id} subjectSlug={x.slug} subjectIcon={x.icon} />
                ))}
              </nav>
            </div>
          ) : null}
        </div>

        <section className="mt-10 sm:mt-12" aria-labelledby="teachers-list">
          <h2 id="teachers-list" className="sr-only">
            قائمة المعلمين
          </h2>
          {teachers.length ? (
            <>
              <div className={s.toolbar}>
                <p className={s.result} aria-live="polite">
                  <Users aria-hidden />
                  {filtered ? `${count(teachers.length, W.teacher)} في ${[subject?.name, grade?.name].filter(Boolean).join("، ")}` : `${count(teachers.length, W.teacher)} على المنصة`}
                </p>
                {filtered ? (
                  <Link href="/teachers" className="btn btn-3d btn-outline btn-sm">
                    <X aria-hidden />
                    إزالة التصفية
                  </Link>
                ) : null}
              </div>
              <TeacherGrid teachers={teachers} columns={4} />
            </>
          ) : (
            <EmptyState icon={<GraduationCap />} title="لا يوجد معلمون لهذا الاختيار بعد" description="اختر صفًا أو مادة أخرى، أو اعرض كل المعلمين." />
          )}
        </section>
      </div>
    </div>
  );
}
