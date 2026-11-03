import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, Layers, MonitorPlay, PlayCircle, Quote } from "lucide-react";
import { getTeacherBySlug, teacherContent } from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { StatPill } from "@/components/ui/page-header";
import { Sparkle, SubjectArt, SubjectIcon } from "@/components/art";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { ProductCard } from "@/components/site/product-card";
import { isPdfType } from "@/lib/labels";
import { ar, count, duration, gradeClass, toneClass, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { env } from "@/server/env";
import { pillCount, TypeSlots } from "../../grades/_components/browse";
import { teacherStyles as s } from "../_components/teachers";

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
  const subjects = [...new Map(teacher.subjects.map((x) => [x.slug ?? x.name, x])).values()];
  const grades = [...new Map(teacher.subjects.map((x) => [x.gradeSlug, x])).values()].sort((a, b) => a.gradeLevel - b.gradeLevel);
  const productCount = groups.reduce((n, g) => n + g.sections.reduce((m, sec) => m + sec.items.length, 0), 0);
  const mainSlug = subjects[0]?.slug ?? groups[0]?.subjectSlug ?? null;
  const total = duration(teacher.totalDurationSeconds);

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
    <div className="pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-6" aria-labelledby="teacher-name">
        <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: "المعلمون", href: "/teachers" }, { label: teacher.name }]} />
        {!teacher.isPublished ? (
          <Alert tone="warning" className="mt-4">
            معاينة للمالك: ملف هذا المعلم غير منشور للطلاب بعد.
          </Alert>
        ) : null}

        <div className={cn("panel mt-5", s.profile, toneClass(mainSlug))}>
          <div className={cn("poster", s.cover)} aria-hidden>
            <span className={s.coverArt}>
              <SubjectArt slug={mainSlug} />
            </span>
            {subjects.slice(0, 3).map((x, i) => (
              <span
                key={x.id}
                className={cn(s.coverBubble, toneClass(x.slug))}
                style={[{ top: "22%", left: "38%" }, { top: "58%", left: "50%" }, { top: "18%", left: "62%" }][i]}
              >
                <SubjectIcon slug={x.slug} size={24} />
              </span>
            ))}
            <span className={s.coverSpark} style={{ top: "16%", right: "34%" }}>
              <Sparkle className="animate-twinkle size-full" />
            </span>
            <span className={s.coverSpark} style={{ bottom: "18%", right: "46%", width: 16, height: 16 }}>
              <Sparkle className="animate-twinkle size-full [animation-delay:1.2s]" color="#fff" />
            </span>
          </div>

          <div className={s.pbody}>
            <div className={s.avatarWrap}>
              <TeacherAvatar name={teacher.name} photoUrl={teacher.photoUrl} size={168} subjectSlug={mainSlug} ring="lg" className="max-sm:!size-[132px] max-sm:!text-[3.6rem]" />
              {mainSlug ? (
                <span className={s.avatarBadge} aria-hidden>
                  <SubjectIcon slug={mainSlug} size={20} strokeWidth={2.4} />
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <h1 id="teacher-name" className={s.pname}>
                {teacher.name}
              </h1>
              {teacher.headline ? <p className={s.headline}>{teacher.headline}</p> : null}
              {subjects.length || grades.length ? (
                <ul className={s.pchips} aria-label="المواد والصفوف">
                  {subjects.map((x) => (
                    <li key={x.id} className={toneClass(x.slug)}>
                      <span aria-hidden>
                        <SubjectIcon slug={x.slug} size={13} strokeWidth={2.6} />
                      </span>
                      {x.name}
                    </li>
                  ))}
                  {grades.map((g) => (
                    <li key={g.gradeSlug} className={cn(s.gchip, gradeClass(g.gradeLevel))}>
                      <span aria-hidden>{ar(g.gradeLevel)}</span>
                      {g.gradeName}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {teacher.videoCount || productCount || total ? (
              <dl className={s.pstats}>
                {teacher.videoCount ? (
                  <div>
                    <dt className="sr-only">الدروس المرئية</dt>
                    <dd>
                      <StatPill tone="teal" icon={<MonitorPlay aria-hidden />} {...pillCount(teacher.videoCount, W.videoLesson)} />
                    </dd>
                  </div>
                ) : null}
                {productCount ? (
                  <div>
                    <dt className="sr-only">المحتوى المتاح للشراء</dt>
                    <dd>
                      <StatPill tone="gold" icon={<Layers aria-hidden />} {...pillCount(productCount, W.product)} />
                    </dd>
                  </div>
                ) : null}
                {total ? (
                  <div>
                    <dt className="sr-only">مدة الشرح</dt>
                    <dd>
                      <StatPill tone="coral" icon={<Clock3 aria-hidden />} num={total} label="من الشرح" />
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>

          {teacher.bio ? (
            <div className={s.bio}>
              <h2>
                <Quote aria-hidden />
                عن المعلم
              </h2>
              <p>{teacher.bio}</p>
            </div>
          ) : null}
        </div>
      </section>

      {groups.length === 0 ? (
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
          <EmptyState icon={<PlayCircle />} title="لم يُنشر محتوى لهذا المعلم بعد" description="تظهر شروحاته ومراجعاته هنا فور نشرها." />
        </div>
      ) : (
        <>
          {groups.length > 1 ? (
            <nav aria-label="انتقل إلى المادة" className={cn(s.subnav, "no-print mx-auto max-w-7xl px-4 sm:px-6")}>
              <div className={s.subnavInner}>
                {groups.map((g) => (
                  <a key={g.key} href={`#${g.subjectSlug ?? "all"}-${g.gradeSlug}`} className={cn(s.snChip, toneClass(g.subjectSlug))}>
                    <span aria-hidden>
                      <SubjectIcon slug={g.subjectSlug} size={17} />
                    </span>
                    {g.subjectName ?? "عام"}، {g.gradeName}
                  </a>
                ))}
              </div>
            </nav>
          ) : null}
          <div className="mx-auto max-w-7xl space-y-16 px-4 pt-10 sm:space-y-20 sm:px-6 sm:pt-14">
            {groups.map((g) => {
              const n = g.sections.reduce((m, sec) => m + sec.items.length, 0);
              return (
                <section key={g.key} id={`${g.subjectSlug ?? "all"}-${g.gradeSlug}`} className={cn(s.group, toneClass(g.subjectSlug))} aria-labelledby={`h-${g.key}`}>
                  <div className={s.ghead}>
                    <span className={cn("icon-tile", s.gicon)} aria-hidden>
                      <SubjectIcon slug={g.subjectSlug} size={30} />
                    </span>
                    <div className="min-w-[12rem] flex-1">
                      <h2 id={`h-${g.key}`} className={s.gtitle}>
                        {g.subjectName ?? "محتوى عام"}، {g.gradeName}
                      </h2>
                      <p className={s.gsub}>{count(n, W.product)}</p>
                    </div>
                    {g.subjectSlug ? (
                      <Link href={`/grades/${g.gradeSlug}/${g.subjectSlug}`} className="btn btn-3d btn-light btn-md">
                        كل محتوى المادة
                        <ArrowLeft aria-hidden />
                      </Link>
                    ) : null}
                  </div>
                  <div className={s.gsections}>
                    {[g.sections.filter((sec) => !isPdfType(sec.type)), g.sections.filter((sec) => isPdfType(sec.type))].map((secs, i) =>
                      secs.length ? (
                        <TypeSlots
                          key={i}
                          notes={i === 1}
                          groups={secs}
                          idPrefix={`${g.key.replace(":", "-")}-`}
                          testId="teacher-section"
                          renderItem={(x) => <ProductCard product={x} owned={owned?.has(x.id)} showGrade={false} headingLevel={4} />}
                        />
                      ) : null,
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
      <p className="sr-only">
        <Link href="/teachers">كل المعلمين</Link>
      </p>
    </div>
  );
}
