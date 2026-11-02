import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Clock, PlayCircle } from "lucide-react";
import { getTeacherBySlug, teacherContent } from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { VideoCard } from "@/components/site/video-card";
import { ProductCard } from "@/components/site/product-card";
import { formatTotalDuration } from "@/components/site/format";
import { isPdfType, PRODUCT_TYPE_SECTION_LABELS } from "@/lib/labels";
import { env } from "@/server/env";

type Params = { slug: string };

const SPAN = { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3", 4: "lg:col-span-4" } as const;
const INNER = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" } as const;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const t = await getTeacherBySlug((await params).slug);
  if (!t) return { title: "المعلم غير موجود" };
  const description = t.headline || `شروحات ومراجعات ${t.name} بالفيديو`;
  return {
    title: t.name,
    description,
    alternates: { canonical: `/teachers/${t.slug}` },
    openGraph: { title: t.name, description, images: t.photoUrl ? [{ url: t.photoUrl }] : undefined, type: "profile" },
  };
}

export default async function TeacherPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const teacher = await getTeacherBySlug(slug, { includeUnpublished: user?.role === "admin" });
  if (!teacher) notFound();
  const [groups, owned] = await Promise.all([teacherContent(teacher.id), user ? accessibleProductIds(user.id) : Promise.resolve(undefined)]);
  const grades = [...new Set(teacher.subjects.map((s) => s.gradeName))];
  const subjects = [...new Set(teacher.subjects.map((s) => s.name))];
  const productCount = groups.reduce((n, g) => n + g.sections.reduce((m, s) => m + s.items.length, 0), 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: teacher.name,
    jobTitle: teacher.headline || "معلم",
    description: teacher.bio || undefined,
    image: teacher.photoUrl ? new URL(teacher.photoUrl, env().APP_URL).toString() : undefined,
    url: new URL(`/teachers/${teacher.slug}`, env().APP_URL).toString(),
  };

  return (
    <div className="pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* رأس الملف التعريفي */}
      <section className="border-b border-line bg-gradient-to-b from-brand-50 to-canvas">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-8">
          <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: "المعلمون", href: "/teachers" }, { label: teacher.name }]} />
          {!teacher.isPublished ? (
            <Alert tone="warning" className="mt-4">
              معاينة المالك — ملف هذا المعلم غير منشور للطلاب بعد.
            </Alert>
          ) : null}
          <div className="mt-6 flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-start">
            <TeacherAvatar name={teacher.name} photoUrl={teacher.photoUrl} size={112} className="shadow-lift" />
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold">{teacher.name}</h1>
              {teacher.headline ? <p className="mt-1.5 text-lg text-ink-soft">{teacher.headline}</p> : null}
              <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {subjects.map((s) => (
                  <span key={s} className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
                    {s}
                  </span>
                ))}
                {grades.map((g) => (
                  <span key={g} className="rounded-full border border-brand-200 bg-surface px-3 py-1 text-xs font-semibold text-brand-700">
                    {g}
                  </span>
                ))}
              </div>
              <dl className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm sm:justify-start">
                <div className="flex items-center gap-1.5">
                  <PlayCircle className="size-4 text-brand-600" aria-hidden />
                  <dt className="sr-only">الفيديوهات</dt>
                  <dd>
                    <span className="num font-bold">{teacher.videoCount}</span> فيديو
                  </dd>
                </div>
                {teacher.totalDurationSeconds ? (
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-4 text-brand-600" aria-hidden />
                    <dt className="sr-only">مدة الشرح</dt>
                    <dd>{formatTotalDuration(teacher.totalDurationSeconds)} من الشرح</dd>
                  </div>
                ) : null}
                <div className="flex items-center gap-1.5">
                  <BookOpen className="size-4 text-brand-600" aria-hidden />
                  <dt className="sr-only">المحتوى</dt>
                  <dd>
                    <span className="num font-bold">{productCount}</span> محتوى
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          {teacher.bio ? <p className="mx-auto mt-6 max-w-3xl leading-8 whitespace-pre-line text-ink-soft sm:mx-0">{teacher.bio}</p> : null}
        </div>
      </section>

      {groups.length === 0 ? (
        <div className="mx-auto max-w-6xl px-4 pt-8">
          <EmptyState icon={<PlayCircle />} title="المحتوى قيد التجهيز" description="يعمل المعلم على تجهيز شروحاته، تابعنا قريبًا." />
        </div>
      ) : (
        <>
          {groups.length > 1 ? (
            <nav aria-label="انتقل إلى المادة" className="sticky top-16 z-20 border-b border-line bg-surface/95 backdrop-blur no-print">
              <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2.5">
                {groups.map((g) => (
                  <a key={g.key} href={`#${g.subjectSlug ?? "all"}-${g.gradeSlug}`} className="rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold whitespace-nowrap text-ink-soft hover:border-brand-300 hover:text-brand-700">
                    {g.subjectName ?? "عام"} · {g.gradeName}
                  </a>
                ))}
              </div>
            </nav>
          ) : null}
          <div className="mx-auto max-w-6xl space-y-14 px-4 pt-8">
            {groups.map((g) => (
              <section key={g.key} id={`${g.subjectSlug ?? "all"}-${g.gradeSlug}`} className="scroll-mt-32" aria-labelledby={`h-${g.key}`}>
                <h2 id={`h-${g.key}`} className="text-2xl font-bold">
                  {g.subjectName ?? "محتوى عام"} <span className="text-lg font-semibold text-muted">— {g.gradeName}</span>
                </h2>
                {/* الأقسام الصغيرة تُرصّ جنبًا إلى جنب على الشاشات العريضة */}
                <div className="mt-5 grid gap-x-4 gap-y-10 lg:grid-cols-4">
                  {g.sections.map((sec) => {
                    const span = Math.min(4, sec.items.length) as 1 | 2 | 3 | 4;
                    const pdf = isPdfType(sec.type) || sec.items.every((i) => !i.isVideo);
                    return (
                      <div key={sec.type} className={SPAN[span]} data-testid="teacher-section">
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                          <span className="h-6 w-1.5 rounded-full bg-accent-600" aria-hidden />
                          {PRODUCT_TYPE_SECTION_LABELS[sec.type]}
                        </h3>
                        <div className={`grid gap-3 sm:gap-4 ${pdf ? "grid-cols-2" : "grid-cols-1 min-[460px]:grid-cols-2"} ${INNER[span]}`}>
                          {sec.items.map((item) =>
                            pdf ? <ProductCard key={item.id} product={item} owned={owned?.has(item.id)} /> : <VideoCard key={item.id} product={item} owned={owned?.has(item.id)} />,
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      <p className="sr-only">
        <Link href="/teachers">كل المعلمين</Link>
      </p>
    </div>
  );
}
