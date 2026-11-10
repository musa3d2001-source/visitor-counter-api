import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, GraduationCap, Layers, MonitorPlay, Package, Play, Printer, Users } from "lucide-react";
import { getBundleItemsFor, getGradeBySlug, getSubject, listProducts, teachersForSubject } from "@/server/catalog/public-data";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { EmptyState } from "@/components/ui/empty-state";
import { StatPill } from "@/components/ui/page-header";
import { ProductCard, ProductGrid } from "@/components/site/product-card";
import { SectionHead } from "@/components/ui/section-head";
import { previewHref } from "@/components/site/card-parts";
import { BundleRow } from "@/components/site/bundle-row";
import { PRODUCT_TYPE_ORDER, PRODUCT_TYPE_SECTION_LABELS } from "@/lib/labels";
import { gradeClass, toneClass, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { browseStyles as s, HeroTeachers, JumpChip, NightPanel, offerPhrase, pillCount, SubjectWindow, ToneHero, typeCount, typeFamily, TypeSlots, WORDS } from "../../_components/browse";

type Params = { gradeSlug: string; subjectSlug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const grade = await getGradeBySlug(p.gradeSlug);
  const subject = grade ? await getSubject(grade.id, p.subjectSlug) : null;
  if (!grade || !subject) return {};
  return {
    title: `${subject.name} ${grade.name}`,
    description: `محتوى ${subject.name} لـ${grade.name} مرتبًا حسب النوع.`,
    alternates: { canonical: `/grades/${grade.slug}/${subject.slug}` },
  };
}

/** ترتيب العرض: الفيديو ثم مراجعات ما قبل الاختبار ثم المذكرات ثم الباقات (داخل كل عائلة حسب PRODUCT_TYPE_ORDER) */
const FAMILY_ORDER = ["video", "review", "pdf", "bundle"] as const;

export default async function SubjectPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ term?: string }> }) {
  const p = await params;
  const sp = await searchParams;
  const grade = await getGradeBySlug(p.gradeSlug);
  if (!grade) notFound();
  const subject = await getSubject(grade.id, p.subjectSlug);
  if (!subject) notFound();

  const [all, teachers, user] = await Promise.all([listProducts({ gradeId: grade.id, subjectId: subject.id }), teachersForSubject(subject.id), getCurrentUser()]);
  const terms = [...new Set(all.map((x) => x.term).filter((t): t is number => t !== null))].sort();
  const term = sp.term === "1" || sp.term === "2" ? Number(sp.term) : null;
  const products = term ? all.filter((x) => x.term === term || x.term === null) : all;
  const groups = PRODUCT_TYPE_ORDER.map((type) => ({ type, items: products.filter((x) => x.type === type) }))
    .filter((g) => g.items.length)
    .sort((a, b) => FAMILY_ORDER.indexOf(typeFamily(a.type)) - FAMILY_ORDER.indexOf(typeFamily(b.type)));
  const bundles = groups.find((g) => g.type === "bundle")?.items ?? [];
  const [owned, itemsById] = await Promise.all([user ? accessibleProductIds(user.id) : Promise.resolve(undefined), getBundleItemsFor(bundles.map((b) => b.id))]);
  const base = `/grades/${grade.slug}/${subject.slug}`;

  const videoCount = all.filter((x) => typeFamily(x.type) === "video" || typeFamily(x.type) === "review").length;
  const pdfCount = all.filter((x) => typeFamily(x.type) === "pdf").length;
  const firstPreview = products.find((x) => x.previewLessonId);
  const freeHref = firstPreview ? previewHref(firstPreview) : null;
  const offer = offerPhrase(all);
  const night = groups.find((g) => g.type === "exam_review");
  const quiz = groups.find((g) => g.type === "quiz_review");

  const videoGroups = groups.filter((g) => typeFamily(g.type) === "video");
  const pdfGroups = groups.filter((g) => typeFamily(g.type) === "pdf");
  const bundleGroups = groups.filter((g) => typeFamily(g.type) === "bundle");

  return (
    <div className="pb-16">
      <ToneHero
        toneClassName={toneClass(subject.slug)}
        titleId="subject-title"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: grade.name, href: `/grades/${grade.slug}` }, { label: subject.name }]}
        eyebrow={
          <span className="eyebrow-pill eyebrow-light">
            <span className="eyebrow-icon">
              <GraduationCap aria-hidden />
            </span>
            {grade.name} · {grade.stageName}
          </span>
        }
        title={subject.name}
        sub={offer ? `${offer} في ${subject.name} لطلاب ${grade.name}.` : undefined}
        stats={
          <>
            {videoCount ? <StatPill tone="teal" icon={<MonitorPlay aria-hidden />} {...pillCount(videoCount, WORDS.video)} /> : null}
            {pdfCount ? <StatPill tone="gold" icon={<FileText aria-hidden />} {...pillCount(pdfCount, WORDS.pdf)} /> : null}
            {!videoCount && !pdfCount && all.length ? <StatPill tone="teal" icon={<Layers aria-hidden />} {...pillCount(all.length, W.product)} /> : null}
            {teachers.length ? <StatPill tone="coral" icon={<Users aria-hidden />} {...pillCount(teachers.length, W.teacher)} /> : null}
          </>
        }
        actions={
          freeHref ? (
            <Link href={freeHref} className="btn btn-3d btn-accent btn-lg">
              <Play aria-hidden className="fill-current" />
              شاهد درسًا مجانًا
            </Link>
          ) : null
        }
        extra={<HeroTeachers label="معلمو المادة" teachers={teachers} anchor={`${subject.slug}-${grade.slug}`} />}
        window={<SubjectWindow slug={subject.slug} icon={subject.icon} gradeLevel={grade.level} gradeName={grade.name} gradeToneClass={gradeClass(grade.level)} />}
      />

      <div className={cn("mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10", toneClass(subject.slug))}>
        {groups.length > 1 || terms.length > 1 ? (
          <div className={s.toolbar}>
            {groups.length > 1 ? (
              <nav aria-label="أقسام المادة" className={s.jump}>
                {groups.map((g) => (
                  <JumpChip key={g.type} type={g.type} href={`#sec-${g.type}`} label={PRODUCT_TYPE_SECTION_LABELS[g.type]} n={g.items.length} />
                ))}
              </nav>
            ) : (
              <span />
            )}
            {terms.length > 1 ? (
              <nav aria-label="تصفية حسب الفصل الدراسي" className={s.seg}>
                {[
                  { label: "كل الفصول", href: base, active: term === null },
                  ...terms.map((t) => ({ label: t === 1 ? "الفصل الأول" : "الفصل الثاني", href: `${base}?term=${t}`, active: term === t })),
                ].map((t) => (
                  <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined} className={cn(s.segItem, t.active && s.segActive)}>
                    {t.label}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
        ) : null}

        {groups.length === 0 ? (
          <EmptyState headingLevel={2} className="mt-8" title="لا يوجد محتوى لهذا الفصل" description="اختر «كل الفصول» أو الفصل الآخر." />
        ) : (
          <div className="mt-12 space-y-16 sm:mt-14 sm:space-y-20">
            {videoGroups.length ? (
              <section aria-labelledby="videos-title">
                <SectionHead
                  id="videos-title"
                  icon={<MonitorPlay aria-hidden />}
                  eyebrow="شروحات بالفيديو"
                  title={
                    <>
                      افهم <span className="text-hl">{subject.name}</span> بالفيديو
                    </>
                  }
                  sub="شرح بصوت معلمك، وحيث تجد شارة «معاينة مجانية» تشاهد درسًا قبل الشراء."
                />
                <TypeSlots groups={videoGroups} renderItem={(x) => <ProductCard product={x} owned={owned?.has(x.id)} showGrade={false} headingLevel={4} />} />
              </section>
            ) : null}

            {night || quiz ? (
              <NightPanel
                  id="reviews-title"
                  title={
                    <>
                      قبل الاختبار؟ <span className="text-hl">راجع بتركيز</span>
                    </>
                  }
                  sub={`دروس مركزة على الأسئلة المتوقعة في ${subject.name}، للاختبار القصير وليلة الاختبار.`}
                  night={night?.items ?? []}
                  quiz={quiz?.items ?? []}
                  owned={owned}
                  nightLabel={PRODUCT_TYPE_SECTION_LABELS.exam_review}
                  quizLabel={PRODUCT_TYPE_SECTION_LABELS.quiz_review}
                  colIds={{ night: "sec-exam_review", quiz: "sec-quiz_review" }}
                />
            ) : null}

            {pdfGroups.length ? (
              <section className={cn("panel panel-rainbow", s.paper)} aria-labelledby="notes-title">
                <SectionHead
                  id="notes-title"
                  icon={<Printer aria-hidden />}
                  tone="gold"
                  eyebrow="مذكرات PDF"
                  title={
                    <>
                      مذكرات <span className="text-hl">جاهزة للطباعة</span>
                    </>
                  }
                  sub="تصفّح أول الصفحات مجانًا قبل الشراء، وتفتح المذكرة كاملة في مكتبتك بعد الدفع."
                />
                <TypeSlots notes groups={pdfGroups} renderItem={(x) => <ProductCard product={x} owned={owned?.has(x.id)} showGrade={false} headingLevel={4} />} />
              </section>
            ) : null}

            {bundleGroups.map((g) => (
              <section key={g.type} id={`sec-${g.type}`} className="scroll-mt-28" aria-labelledby={`type-${g.type}`}>
                <SectionHead id={`type-${g.type}`} icon={<Package aria-hidden />} tone="violet" eyebrow="وفّر مع الباقات" title={PRODUCT_TYPE_SECTION_LABELS[g.type]} sub={typeCount(g.type, g.items.length)} />
                {g.items.length <= 2 ? (
                  <ul className="grid gap-5">
                    {g.items.map((b) => (
                      <li key={b.id}>
                        <BundleRow b={b} owned={owned?.has(b.id)} items={itemsById.get(b.id)} showGrade={false} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ProductGrid products={g.items} ownedIds={owned} itemsById={itemsById} showGrade={false} />
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
