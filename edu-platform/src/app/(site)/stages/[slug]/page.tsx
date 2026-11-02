import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getStageBySlug, gradeStats } from "@/server/catalog/queries";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const stage = await getStageBySlug((await params).slug);
  return stage ? { title: stage.name, description: `مذكرات ونماذج ${stage.name} — ${stage.description}`, alternates: { canonical: `/stages/${stage.slug}` } } : {};
}

export default async function StagePage({ params }: { params: Promise<{ slug: string }> }) {
  const stage = await getStageBySlug((await params).slug);
  if (!stage || stage.grades.length === 0) notFound();
  const stats = await gradeStats();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: stage.name }]} />
      <h1 className="mt-4 text-3xl font-bold">{stage.name}</h1>
      <p className="mt-2 text-muted">{stage.description}</p>
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stage.grades.map((g) => (
          <Link key={g.id} href={`/grades/${g.slug}`} className="group rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:border-brand-300 hover:shadow-lift">
            <p className="text-xl font-bold">{g.name}</p>
            <p className="mt-1 text-sm text-muted">
              <span className="num">{stats.get(g.id)?.products ?? 0}</span> منتج
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
              تصفح <ArrowLeft className="size-4" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
