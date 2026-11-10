import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Flame, GraduationCap, Layers, MonitorPlay, Package, Play, Printer, Users } from "lucide-react";
import { bestSellers } from "@/server/catalog/queries";
import { getBundleItemsFor, getGradeBySlug, listProducts, listSubjects, teachersForSubjects } from "@/server/catalog/public-data";
import { getPublicSettings } from "@/server/platform/public-settings";
import { videoCloseFlags } from "@/server/video/policy";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { StatPill } from "@/components/ui/page-header";
import { ProductGrid, ProductShelf } from "@/components/site/product-card";
import { previewHref, shortTerm } from "@/components/site/card-parts";
import { termLabel } from "@/lib/labels";
import { gradeClass, W } from "@/lib/design";
import { gradeMeta } from "@/lib/site-truth";
import { siteFacts } from "@/server/platform/site-facts";
import { cn } from "@/lib/utils";
import { balancedGrid, browseStyles as s, GradeWindow, NightPanel, offerPhrase, pillCount, splitByFamily, SubjectCard, ToneHero, typeFamily } from "../_components/browse";

export async function generateMetadata({ params }: { params: Promise<{ gradeSlug: string }> }): Promise<Metadata> {
  const grade = await getGradeBySlug((await params).gradeSlug);
  if (!grade) return {};
  return {
    ...gradeMeta(grade.name, grade.stageName, await siteFacts()),
    alternates: { canonical: `/grades/${grade.slug}` },
  };
}

/** عدد المذكرات المعروضة في صفحة الصف (الباقي في صفحات المواد): ١٢ يملأ صفوف ٢ و٣ و٤ أعمدة */
const NOTES_LIMIT = 12;
/** المذكرات النهائية أولًا (واحدة لكل مادة غالبًا) ثم ليلة الاختبار ثم النماذج */
const NOTE_ORDER = ["final_notes", "exam_night", "review_notes", "exam_model", "answer_key"];

export default async function GradePage({ params }: { params: Promise<{ gradeSlug: string }> }) {
  const grade = await getGradeBySlug((await params).gradeSlug);
  if (!grade) notFound();
  const settings = await getPublicSettings();
  const [subjects, bundles, popular, all, user] = await Promise.all([
    listSubjects(grade.id),
    listProducts({ gradeId: grade.id, type: "bundle", limit: 6 }),
    // مشتق من الطلبات، فلا يُخزن بين الطلبات أبدًا
    bestSellers({ gradeId: grade.id, limit: 4, closed: videoCloseFlags(settings) }),
    listProducts({ gradeId: grade.id, excludeType: "bundle" }),
    getCurrentUser(),
  ]);
  const [owned, teachersBySubject, itemsById] = await Promise.all([
    user ? accessibleProductIds(user.id) : Promise.resolve(undefined),
    teachersForSubjects(subjects.map((x) => x.id)),
    getBundleItemsFor(bundles.map((b) => b.id)),
  ]);
  const teacherIds = new Set([...teachersBySubject.values()].flatMap((ts) => ts.map((t) => t.id)));

  const { videos, night, quiz, notes: rawNotes } = splitByFamily(all);
  const notes = [...rawNotes].sort((a, b) => NOTE_ORDER.indexOf(a.type) - NOTE_ORDER.indexOf(b.type));
  const shownNotes = notes.slice(0, NOTES_LIMIT);
  const offer = offerPhrase(all);
  const productTotal = all.length + bundles.length;
  const firstPreview = all.find((p) => p.previewLessonId);
  const freeHref = firstPreview ? previewHref(firstPreview) : null;
  const level = grade.level;
  const tone = gradeClass(level);

  return (
    <div className="pb-16">
      <ToneHero
        toneClassName={tone}
        titleId="grade-title"
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: grade.stageName, href: `/stages/${grade.stageSlug}` }, { label: grade.name }]}
        eyebrow={
          <span className="eyebrow-pill eyebrow-light">
            <span className="eyebrow-icon">
              <GraduationCap aria-hidden />
            </span>
            {grade.stageName} · {shortTerm(grade.currentTerm) || termLabel(grade.currentTerm)}
          </span>
        }
        title={grade.name}
        sub={offer ? `كل ما تحتاجه في ${grade.name} في مكان واحد: ${offer}.` : undefined}
        stats={
          <>
            {subjects.length ? <StatPill tone="gold" icon={<BookOpen aria-hidden />} {...pillCount(subjects.length, W.subject)} /> : null}
            {productTotal ? <StatPill tone="teal" icon={<Layers aria-hidden />} {...pillCount(productTotal, W.product)} /> : null}
            {teacherIds.size ? <StatPill tone="coral" icon={<Users aria-hidden />} {...pillCount(teacherIds.size, W.teacher)} /> : null}
          </>
        }
        actions={
          <>
            {subjects.length ? (
              <a href="#subjects" className="btn btn-3d btn-accent btn-lg">
                اختر مادتك
                <ArrowLeft aria-hidden />
              </a>
            ) : null}
            {freeHref ? (
              <Link href={freeHref} className="btn btn-3d btn-light btn-lg">
                <Play aria-hidden className="fill-current" />
                شاهد درسًا مجانًا
              </Link>
            ) : null}
          </>
        }
        window={<GradeWindow level={level} />}
      />

      <div className="mx-auto max-w-7xl space-y-16 px-4 pt-12 sm:space-y-20 sm:px-6 sm:pt-16">
        <section id="subjects" className="scroll-mt-28" aria-labelledby="subjects-title">
          <SectionHead
            id="subjects-title"
            icon={<BookOpen aria-hidden />}
            eyebrow={`مواد ${grade.name}`}
            title={
              <>
                اختر <span className="text-hl">مادتك</span>
              </>
            }
            sub="ادخل المادة لترى محتواها مرتبًا حسب النوع."
          />
          {subjects.length === 0 ? (
            <EmptyState title="لا توجد مواد منشورة لهذا الصف بعد" description="نجهّز المحتوى الآن، وتظهر المواد هنا فور نشرها." />
          ) : (
            <ul className={s.subGrid}>
              {subjects.map((x) => {
                const mine = all.filter((p) => p.subjectSlug === x.slug);
                return (
                  <li key={x.id}>
                    <SubjectCard
                      subject={x}
                      href={`/grades/${grade.slug}/${x.slug}`}
                      videos={mine.filter((p) => typeFamily(p.type) !== "pdf").length}
                      pdfs={mine.filter((p) => typeFamily(p.type) === "pdf").length}
                      total={x.productCount}
                      teachers={teachersBySubject.get(x.id) ?? []}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {night.length || quiz.length ? (
          <NightPanel
            id="reviews"
            title={
              <>
                قبل الاختبار؟ <span className="text-hl">راجع بتركيز</span>
              </>
            }
            sub={`مراجعات مركزة لاختبارات ${grade.name} القصيرة والنهائية.`}
            night={night}
            quiz={quiz}
            owned={owned}
          />
        ) : null}

        {videos.length ? (
          <section aria-labelledby="videos">
            <SectionHead
              id="videos"
              icon={<MonitorPlay aria-hidden />}
              eyebrow="شروحات بالفيديو"
              title={
                <>
                  شرح الوحدات <span className="text-hl">بالفيديو</span>
                </>
              }
              sub="شرح بصوت معلمك، وحيث تجد شارة «معاينة مجانية» تشاهد درسًا قبل الشراء."
            />
            <ProductShelf products={videos} ownedIds={owned} showGrade={false} className={balancedGrid(videos.length, { md: [3, 2], lg: [4, 3], video: true })} />
          </section>
        ) : null}

        {popular.length ? (
          <section aria-labelledby="popular">
            <SectionHead id="popular" icon={<Flame aria-hidden />} tone="coral" eyebrow="من طلبات الطلاب" title="الأكثر طلبًا" sub={`أكثر ما اشتراه طلاب ${grade.name} على المنصة.`} />
            <ProductShelf products={popular} ownedIds={owned} itemsById={itemsById} showGrade={false} className={balancedGrid(popular.length, { md: [3, 2], lg: [4, 3], video: true })} />
          </section>
        ) : null}

        {bundles.length ? (
          <section aria-labelledby="bundles">
            <SectionHead id="bundles" icon={<Package aria-hidden />} tone="violet" eyebrow="كل المواد معًا" title={`باقات ${grade.name}`} sub="اشترِ مجموعة كاملة مرة واحدة، وتظهر كل محتوياتها في مكتبتك." />
            <ProductGrid products={bundles} ownedIds={owned} itemsById={itemsById} showGrade={false} className={balancedGrid(bundles.length, { md: [3, 2], lg: [4, 3], video: true })} />
          </section>
        ) : null}

        {notes.length ? (
          <section className={cn("panel panel-rainbow", s.paper)} aria-labelledby="notes">
            <SectionHead
              id="notes"
              icon={<Printer aria-hidden />}
              tone="gold"
              eyebrow="مذكرات PDF"
              title={
                <>
                  مذكرات <span className="text-hl">جاهزة للطباعة</span>
                </>
              }
              sub={notes.length > NOTES_LIMIT ? "مختارات من المذكرات والنماذج، وتجد كل مذكرات المادة في صفحتها." : "المذكرات النهائية ومذكرات ليلة الاختبار ونماذج الاختبارات."}
              more={notes.length > NOTES_LIMIT ? { href: "#subjects", label: "كل المواد" } : undefined}
            />
            <ProductGrid products={shownNotes} ownedIds={owned} showGrade={false} className={balancedGrid(shownNotes.length, { md: [3, 2], lg: [4, 5, 3] })} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
