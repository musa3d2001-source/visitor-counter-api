import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, GraduationCap, Layers } from "lucide-react";
import { getStageBySlug, gradeStats, listSubjects } from "@/server/catalog/queries";
import { PageHeader, StatPill } from "@/components/ui/page-header";
import { GradeCard, GradeGrid } from "@/components/site/grade-card";
import { W } from "@/lib/design";
import { pillCount, StageFan } from "../../grades/_components/browse";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const stage = await getStageBySlug((await params).slug);
  return stage ? { title: stage.name, description: `مذكرات ونماذج ${stage.name}. ${stage.description}`, alternates: { canonical: `/stages/${stage.slug}` } } : {};
}

export default async function StagePage({ params }: { params: Promise<{ slug: string }> }) {
  const stage = await getStageBySlug((await params).slug);
  if (!stage || stage.grades.length === 0) notFound();
  const [stats, subjectLists] = await Promise.all([gradeStats(), Promise.all(stage.grades.map((g) => listSubjects(g.id)))]);
  const products = stage.grades.reduce((n, g) => n + (stats.get(g.id)?.products ?? 0), 0);
  const subjectNames = new Set(subjectLists.flat().map((x) => x.slug));

  return (
    <div className="pb-16">
      <PageHeader
        titleId="stage-title"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: stage.name }]}
        eyebrow={{ icon: <GraduationCap aria-hidden />, label: "اختر صفك الدراسي", tone: "gold" }}
        title={stage.name}
        sub={stage.description || undefined}
        aside={<StageFan levels={stage.grades.map((g) => g.level)} />}
      >
        <div className="flex flex-wrap gap-2.5">
          <StatPill tone="violet" icon={<GraduationCap aria-hidden />} {...pillCount(stage.grades.length, W.grade)} />
          {subjectNames.size ? <StatPill tone="gold" icon={<BookOpen aria-hidden />} {...pillCount(subjectNames.size, W.subject)} /> : null}
          {products ? <StatPill tone="teal" icon={<Layers aria-hidden />} {...pillCount(products, W.product)} /> : null}
        </div>
      </PageHeader>

      <section className="mx-auto max-w-7xl px-4 sm:px-6" aria-labelledby="stage-grades">
        <h2 id="stage-grades" className="sr-only">
          صفوف {stage.name}
        </h2>
        <div className="panel panel-rainbow px-4 pt-12 pb-6 sm:px-8 sm:pt-14 sm:pb-10">
          <GradeGrid>
            {stage.grades.map((g, i) => (
              <li key={g.id}>
                <GradeCard grade={g} stats={stats.get(g.id) ?? null} subjects={subjectLists[i]} />
              </li>
            ))}
          </GradeGrid>
        </div>
      </section>
    </div>
  );
}
