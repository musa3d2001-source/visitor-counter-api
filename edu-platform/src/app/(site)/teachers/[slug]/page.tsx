import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { getTeacherBySlug, teacherContent } from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { ProductList } from "@/components/site/product-card";
import { formatTotalDuration } from "@/components/site/format";
import { isPdfType, PRODUCT_TYPE_SECTION_LABELS } from "@/lib/labels";
import { env } from "@/server/env";

type Params = { slug: string };


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

  const stats = [
    teacher.videoCount ? { n: teacher.videoCount, label: teacher.videoCount === 1 ? "درس مرئي" : teacher.videoCount === 2 ? "درسان مرئيان" : teacher.videoCount <= 10 ? "دروس مرئية" : "درسًا مرئيًا" } : null,
    productCount ? { n: productCount, label: productCount <= 10 && productCount > 2 ? "محتويات للشراء" : "محتوى للشراء" } : null,
  ].filter(Boolean) as { n: number; label: string }[];

  return (
    <div className="pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="mx-auto max-w-6xl px-4 pt-6">
        <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: "المعلمون", href: "/teachers" }, { label: teacher.name }]} />
        {!teacher.isPublished ? (
          <Alert tone="warning" className="mt-4">
            معاينة للمالك: ملف هذا المعلم غير منشور للطلاب بعد.
          </Alert>
        ) : null}
        <div className="mt-6 grid gap-8 border-b-2 border-ink pb-8 md:grid-cols-[1fr_15rem] md:items-end">
          <div className="order-2 md:order-1">
            <h1 className="text-[clamp(2.4rem,6vw,4.4rem)] leading-[1.05]">{teacher.name}</h1>
            {teacher.headline ? <p className="mt-3 text-lg leading-8 text-ink-soft">{teacher.headline}</p> : null}
            <p className="mt-3 text-sm text-muted">
              {subjects.join("، ")}
              {grades.length ? `، ${grades.join(" و")}` : ""}
            </p>
            {stats.length || teacher.totalDurationSeconds ? (
              <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
                {stats.map((st) => (
                  <div key={st.label}>
                    <dt className="sr-only">{st.label}</dt>
                    <dd className="flex items-baseline gap-2">
                      <span className="num font-display text-4xl leading-none font-semibold text-brand-700">{st.n}</span>
                      <span className="text-sm text-ink-soft">{st.label}</span>
                    </dd>
                  </div>
                ))}
                {teacher.totalDurationSeconds ? (
                  <div>
                    <dt className="sr-only">مدة الشرح</dt>
                    <dd className="flex items-baseline gap-2">
                      <span className="font-display text-2xl leading-none font-semibold text-brand-700">{formatTotalDuration(teacher.totalDurationSeconds)}</span>
                      <span className="text-sm text-ink-soft">من الشرح</span>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
          <div className="order-1 md:order-2">
            <TeacherAvatar name={teacher.name} photoUrl={teacher.photoUrl} size={168} className="mx-0 rounded-lg" />
          </div>
        </div>
        {teacher.bio ? <p className="mt-6 max-w-3xl leading-8 whitespace-pre-line text-ink-soft">{teacher.bio}</p> : null}
      </section>

      {groups.length === 0 ? (
        <div className="mx-auto max-w-6xl px-4 pt-8">
          <EmptyState icon={<PlayCircle />} title="لم يُنشر محتوى لهذا المعلم بعد" description="تظهر شروحاته ومراجعاته هنا فور نشرها." />
        </div>
      ) : (
        <>
          {groups.length > 1 ? (
            <nav aria-label="انتقل إلى المادة" className="sticky top-16 z-20 mt-8 border-y border-line bg-surface no-print sm:top-[4.5rem]">
              <div className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4">
                {groups.map((g) => (
                  <a key={g.key} href={`#${g.subjectSlug ?? "all"}-${g.gradeSlug}`} className="border-b-2 border-transparent py-3 text-sm font-semibold whitespace-nowrap text-ink-soft hover:border-brand-600 hover:text-brand-700">
                    {g.subjectName ?? "عام"}، {g.gradeName}
                  </a>
                ))}
              </div>
            </nav>
          ) : null}
          <div className="mx-auto max-w-6xl space-y-16 px-4 pt-10">
            {groups.map((g) => (
              <section key={g.key} id={`${g.subjectSlug ?? "all"}-${g.gradeSlug}`} className="scroll-mt-32" aria-labelledby={`h-${g.key}`}>
                <h2 id={`h-${g.key}`} className="text-[clamp(1.9rem,3.4vw,2.6rem)]">
                  {g.subjectName ?? "محتوى عام"}، {g.gradeName}
                </h2>
                <div className="mt-6 space-y-10">
                  {g.sections.map((sec) => (
                    <div key={sec.type} data-testid="teacher-section">
                      <h3 className="mb-2 text-sm font-semibold text-brand-700">{PRODUCT_TYPE_SECTION_LABELS[sec.type]}</h3>
                      <ProductList products={sec.items} ownedIds={owned} columns={isPdfType(sec.type) ? 2 : 1} showTeacher={false} />
                    </div>
                  ))}
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
