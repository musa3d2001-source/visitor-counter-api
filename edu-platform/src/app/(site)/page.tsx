import { BadgePercent, FileText, GraduationCap, MonitorPlay, Users } from "lucide-react";
import {
  getBundleItems,
  gradeStats,
  latestVideoProducts,
  listProducts,
  listStages,
  listSubjects,
  listTeachers,
  type ProductCard,
} from "@/server/catalog/queries";
import { getSettings } from "@/server/platform/settings";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { VideoCard } from "@/components/site/video-card";
import { TeacherCard } from "@/components/site/teacher-card";
import { BundleCard } from "@/components/site/bundle-card";
import { NoteCard } from "@/components/site/note-card";
import { GradeCard } from "@/components/site/grade-card";
import { SubjectGrid, SubjectTile } from "@/components/site/subject-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { academicYearLabel, ar, savings } from "@/lib/design";
import { HomeHero, shortGrade } from "./_home/hero";
import { Rail } from "./_home/rail";
import { SubjectExplorer } from "./_home/subject-explorer";
import { ExamBand } from "./_home/exam-band";
import { ClosingCta, HomeFaq, HowSteps } from "./_home/sections";
import s from "./_home/home.module.css";

/** يوزّع العناصر بالتناوب بين مجموعاتها (المواد مثلًا) حتى لا تتجاور ثلاث بطاقات بلون واحد */
function interleave<T>(items: T[], key: (x: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const lists = [...groups.values()].sort((a, b) => b.length - a.length);
  const out: T[] = [];
  for (let i = 0; out.length < items.length; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

/** مذكرات من صفوف مختلفة (٦ ← ٩ بالتناوب) وبمواد متنوعة قدر الإمكان */
function pickNotes(notes: ProductCard[], levelBySlug: Map<string, number>, limit: number): ProductCard[] {
  const byGrade = new Map<string, ProductCard[]>();
  for (const n of notes) byGrade.set(n.gradeSlug, [...(byGrade.get(n.gradeSlug) ?? []), n]);
  const grades = [...byGrade.keys()].sort((a, b) => (levelBySlug.get(a) ?? 99) - (levelBySlug.get(b) ?? 99));
  const used = new Set<string>();
  const usedSubjects = new Set<string>();
  const out: ProductCard[] = [];
  while (out.length < Math.min(limit, notes.length)) {
    let added = false;
    for (const g of grades) {
      if (out.length >= limit) break;
      const pool = (byGrade.get(g) ?? []).filter((n) => !used.has(n.id));
      const pick = pool.find((n) => !usedSubjects.has(n.subjectSlug ?? "")) ?? pool[0];
      if (!pick) continue;
      used.add(pick.id);
      usedSubjects.add(pick.subjectSlug ?? "");
      out.push(pick);
      added = true;
    }
    if (!added) break;
  }
  return out;
}

/**
 * الصفحة الرئيسية «الفصل المشمس» (v2-c): بطل مشمس بمروحة دورات حقيقية واختصارات الصفوف،
 * لوح الصفوف والمواد، أحدث الدروس المرئية، «قبل الاختبار» بتذاكر المقاعد وأفق الكويت،
 * المعلمون، الباقات (٦ ← ٩)، المذكرات، خطوات البدء، الأسئلة الشائعة، ودعوة ختامية.
 * كل الأرقام والأسعار من قاعدة البيانات.
 */
export default async function HomePage() {
  const [stages, stats, settings, user, videos, teachers, allTeachers, bundles, examReviews, quizReviews, finalNotes] = await Promise.all([
    listStages(),
    gradeStats(),
    getSettings(),
    getCurrentUser(),
    latestVideoProducts(12),
    listTeachers({ limit: 6 }),
    listTeachers(),
    listProducts({ type: "bundle", limit: 4 }),
    listProducts({ type: "exam_review", limit: 3 }),
    listProducts({ type: "quiz_review", limit: 3 }),
    listProducts({ type: "final_notes", order: "latest", limit: 24 }),
  ]);
  const grades = stages.flatMap((st) => st.grades);
  const levelBySlug = new Map(grades.map((g) => [g.slug, g.level]));
  const sortedBundles = [...bundles].sort((a, b) => (levelBySlug.get(a.gradeSlug) ?? 99) - (levelBySlug.get(b.gradeSlug) ?? 99));
  const [owned, subjectsByGrade, bundleItems] = await Promise.all([
    user ? accessibleProductIds(user.id) : Promise.resolve(undefined),
    Promise.all(grades.map((g) => listSubjects(g.id))),
    Promise.all(sortedBundles.map((b) => getBundleItems(b.id))),
  ]);

  const reviewIds = new Set([...examReviews, ...quizReviews].map((r) => r.id));
  const courses = videos.filter((v) => v.type === "video_course");
  const fan = (courses.length >= 3 ? courses : videos).slice(0, 3);
  const firstPreview = videos.find((v) => v.previewLessonId) ?? [...examReviews, ...quizReviews].find((r) => r.previewLessonId);
  const previewHref = firstPreview ? `/watch/${firstPreview.id}?lesson=${firstPreview.previewLessonId}` : null;
  const newVideos = interleave(
    videos.filter((v) => !reviewIds.has(v.id)),
    (v) => v.subjectSlug ?? "",
  ).slice(0, 8);
  const notes = pickNotes(finalNotes, levelBySlug, 5);
  const anySavings = sortedBundles.some((b) => savings(b.priceFils, b.compareAtPriceFils));
  const totalLessons = allTeachers.reduce((n, t) => n + t.videoCount, 0);
  const stageName = grades[0]?.stageName ?? "";
  const heroGrades = grades.map((g) => ({ id: g.id, slug: g.slug, name: g.name, level: g.level }));
  const teacherCols = teachers.length % 4 === 0 || teachers.length === 7 ? 4 : 3;

  return (
    <div className={s.home}>
      <HomeHero
        title={settings.hero_title}
        subtitle={settings.hero_subtitle}
        tagline={settings.tagline}
        grades={heroGrades}
        fan={fan}
        previewHref={previewHref}
        nightReview={examReviews[0] ?? null}
        stats={{ lessons: totalLessons, teachers: allTeachers.length, grades: grades.length }}
        signedIn={Boolean(user)}
      />

      {/* لوح الصفوف: يعلو البطل */}
      <div className={s.dockSec}>
        <div className={s.wrap}>
          <div className={s.dock}>
            <section id="grades" className={s.gradesRegion} aria-label="اختر صفك الدراسي">
              <SectionHead
                icon={<GraduationCap size={16} />}
                eyebrow={
                  <>
                    {stageName || "الصفوف"}
                    {settings.academic_year ? <span className="max-sm:hidden">{` · العام الدراسي ${academicYearLabel(settings.academic_year)}`}</span> : null}
                  </>
                }
                title={
                  <>
                    في أي صف أنت؟ <span className="text-hl">كل شيء جاهز لك</span>
                  </>
                }
                sub="اختر صفك لتجد شروحات الفيديو والمراجعات والمذكرات مرتبة حسب المادة."
              />
              {grades.length === 0 ? (
                <EmptyState title="المحتوى قيد التجهيز" description="نجهّز الشروحات والمذكرات الآن." />
              ) : (
                <ul className={s.gradeGrid} data-testid="grade-picker">
                  {grades.map((g, i) => (
                    <li key={g.id}>
                      <GradeCard grade={g} stats={stats.get(g.id) ?? null} subjects={subjectsByGrade[i] ?? []} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {grades.some((_, i) => (subjectsByGrade[i] ?? []).length) ? (
              <SubjectExplorer
                tabs={grades.map((g) => ({ id: g.id, level: g.level, num: ar(g.level), name: g.name, short: shortGrade(g.name) }))}
                panels={grades.map((g, i) => (
                  <SubjectGrid key={g.id}>
                    {(subjectsByGrade[i] ?? []).map((x) => (
                      <li key={x.id}>
                        <SubjectTile subject={x} href={`/grades/${g.slug}/${x.slug}`} />
                      </li>
                    ))}
                  </SubjectGrid>
                ))}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* أحدث الدروس المرئية */}
      {newVideos.length ? (
        <section className={s.section} aria-labelledby="videos-title" id="videos">
          <div className={s.wrap}>
            <SectionHead
              id="videos-title"
              icon={<MonitorPlay size={16} />}
              eyebrow="شروحات بالفيديو"
              title="أحدث الدروس المرئية"
              sub="شرح بالفيديو بصوت معلمك. حيث تجد شارة «معاينة مجانية» تشاهد درسًا قبل الشراء."
              more={{ href: "/teachers", label: "تصفح حسب المعلم" }}
            />
            <Rail label="الدروس المرئية">
              {newVideos.map((p, i) => (
                <li key={p.id}>
                  <VideoCard product={p} owned={owned?.has(p.id)} priority={i < 2} />
                </li>
              ))}
            </Rail>
          </div>
        </section>
      ) : null}

      {/* قبل الاختبار */}
      <ExamBand examNight={examReviews} quizzes={quizReviews} ownedIds={owned} />

      {/* المعلمون */}
      {teachers.length ? (
        <section className={s.section} aria-labelledby="teachers-title" id="teachers">
          <div className={s.wrap}>
            <SectionHead
              id="teachers-title"
              icon={<Users size={16} />}
              eyebrow="معلمو المنصة"
              tone="coral"
              title={
                <>
                  تعلّم مع معلم <span className="text-hl">يشرح لك خطوة بخطوة</span>
                </>
              }
              sub="لكل معلم صفحة تجمع شرحه للوحدات ومراجعاته ومذكراته."
              more={{ href: "/teachers", label: "كل المعلمين" }}
            />
            <Rail label="المعلمين" cols={teacherCols}>
              {teachers.map((t) => (
                <li key={t.id}>
                  <TeacherCard teacher={t} />
                </li>
              ))}
            </Rail>
          </div>
        </section>
      ) : null}

      {/* الباقات: مرتبة من الصف السادس إلى التاسع مثل لوح الصفوف */}
      {sortedBundles.length ? (
        <section className={s.section} aria-labelledby="bundles-title" id="bundles">
          <div className={s.wrap}>
            <SectionHead
              id="bundles-title"
              icon={<BadgePercent size={16} />}
              eyebrow={anySavings ? "وفّر أكثر" : "باقات الصفوف"}
              tone="gold"
              title={
                anySavings ? (
                  <>
                    باقات الصفوف <span className="text-hl">بسعر أقل</span>
                  </>
                ) : (
                  "باقات الصفوف"
                )
              }
              sub="محتوى الصف في باقة واحدة. السعر الظاهر هو ما تدفعه، والتوفير محسوب من أسعار محتوياتها منفردة."
              more={{ href: "/bundles", label: "كل الباقات" }}
            />
            <Rail label="الباقات" cols={Math.min(4, Math.max(2, sortedBundles.length))}>
              {sortedBundles.map((b, i) => (
                <li key={b.id}>
                  <BundleCard product={b} items={bundleItems[i] ?? []} level={levelBySlug.get(b.gradeSlug) ?? null} owned={owned?.has(b.id)} />
                </li>
              ))}
            </Rail>
          </div>
        </section>
      ) : null}

      {/* المذكرات */}
      {notes.length ? (
        <section className={s.section} aria-labelledby="notes-title" id="notes">
          <div className={s.wrap}>
            <SectionHead
              id="notes-title"
              icon={<FileText size={16} />}
              eyebrow="مذكرات مرتبة"
              tone="violet"
              title="المذكرات النهائية"
              sub="ملخصات مرتبة لكل مادة. حيث تجد «أول الصفحات مجانًا» تقرأ قبل أن تشتري."
            />
            <ul className={s.noteGrid}>
              {notes.map((p) => (
                <li key={p.id}>
                  <NoteCard product={p} owned={owned?.has(p.id)} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <HowSteps />
      <HomeFaq faq={settings.faq} whatsapp={settings.whatsapp_number} />
      <ClosingCta grades={heroGrades} />
    </div>
  );
}
