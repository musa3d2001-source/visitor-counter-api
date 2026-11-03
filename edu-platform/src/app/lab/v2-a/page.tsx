/*
 * ─────────────────────────────────────────────────────────────────────────────
 * منصة درب · الاتجاه v2-a «ألوان المواد» (Subject Spectrum)
 * ─────────────────────────────────────────────────────────────────────────────
 * الإحساس: تطبيق استهلاكي مبهج وفاخر (Duolingo × Brilliant × Apple). خلفية بيضاء
 * باردة، وكل مادة لها لون وتدرج وزخرفة مرسومة يدويًا، وكل صف بطاقة متدرجة برقم ضخم.
 *
 * الألوان
 *   الحبر        #12163A   نص ثانوي #3B4268   خافت #5D6488   خطوط #E7E9F3   خلفية #F6F7FC
 *   الأساسي      بنفسجي #6C47FF → #5631F0 (حافة ثلاثية الأبعاد #4320CF)
 *   الإبراز      ذهبي #FFC53D (حافة #E0A21A)   وردي مساعد #F0468E
 *   المواد       الرياضيات أزرق #3D8BFF→#2647D8 · العلوم أخضر #16B97A→#05865A
 *                العربية مرجاني #FF8A5B→#D93636 · الإنجليزية وردي #F25C9E→#B9257A
 *                الإسلامية فيروزي #14B3A8→#0B6F86 · الاجتماعيات برتقالي #FFB22E→#C2540A
 *                احتياطي بنفسجي #8F6BFF→#5631F0  (النص الأبيض فوق الطرف الداكن فقط)
 *   الصفوف       ٦ شروق #FFB443→#F0466E · ٧ بحر #3FE0B5→#0B7E8C · ٨ سماء #5FB2FF→#5B36F0 · ٩ غروب #C77DFF→#E0408A
 *
 * الخطوط
 *   العناوين والأرقام: Baloo Bhaijaan 2 (800) دائري ثقيل وودود
 *   الواجهة والنصوص: Readex Pro (400–600) بارتفاع سطر 1.8
 *
 * التخطيط
 *   الرأس: لاصق زجاجي، شعار «طريق ونجمة»، روابط، سلة، زر دخول ثلاثي الأبعاد، قائمة للجوال.
 *   البطل: عنوان ضخم بكلمة مميزة متدرجة وخط يدوي، زران، ثلاث مزايا؛ وتكوين حي من
 *          بطاقات دروس حقيقية مائلة طافية مع شارات (معاينة مجانية، التوفير، عدد الدروس).
 *   الصفوف: أهم مهمة. أربع بطاقات متدرجة جريئة برقم عربي ضخم، ولوحة بيضاء بالاسم والأعداد الحقيقية،
 *          ثم شريط «طيف المواد» يشرح ترميز الألوان.
 *   الدروس المرئية: شبكة ٤ أعمدة (شريط أفقي على الجوال واللوحي) بغلاف المادة وزر معاينة.
 *   موسم الاختبارات: لوحة ليلية داكنة بنجوم وهلال، عمودان (ليلة الاختبار / الاختبار القصير).
 *   المعلمون: بطاقات بشريط زخرفي وصورة رمزية متدرجة بالحرف الأول وأيقونة المادة.
 *   الباقات: أوراق مروحية بألوان المواد وملصق ذهبي بمبلغ التوفير الحقيقي.
 *   المذكرات: ست أوراق بألوان المواد الست.
 *   كيف تبدأ: أربع خطوات حقيقية بمربعات متدرجة مرقمة ومسار منقط.
 *   الأسئلة الشائعة: من الإعدادات، أكورديون أنيق مع بطاقة تواصل.
 *   دعوة ختامية بتدرج الطيف + تذييل داكن بشريط ألوان المواد.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "@fontsource-variable/baloo-bhaijaan-2";
import "@fontsource-variable/readex-pro";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  ChevronDown,
  CirclePlay,
  Clock,
  Eye,
  FileText,
  GraduationCap,
  Layers,
  Library,
  LogIn,
  Menu,
  MessageCircle,
  Moon,
  Play,
  PlayCircle,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Timer,
  Users,
} from "lucide-react";
import type { ProductCard } from "@/server/catalog/queries";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { ARABIC_DIGITS, labData, minutes } from "../data";
import { Crescent, GradeArt, LogoMark, NightSky, Sparkle, SubjectMotif, Swoosh } from "./art";
import { BundleTile, NoteTile, ReviewRow, SectionHead, SubjectIcon, TeacherTile, toneVars, VideoCard } from "./cards";
import {
  countAr,
  gradeTone,
  initialOf,
  ITEMS,
  LESSONS,
  savePercent,
  SUBJECT_ORDER,
  SUBJECT_TONES,
  SUBJECTS,
  subjectKey,
  TEACHERS,
  toneFor,
} from "./tones";
import s from "./v2a.module.css";

export const dynamic = "force-dynamic";

const shortGrade = (name: string) => name.replace(/^الصف\s+/, "");

/** ثلاث بطاقات للبطل بمواد مختلفة، مع تفضيل ما له معاينة */
function pickHero(videos: ProductCard[]): ProductCard[] {
  const sorted = [...videos].sort((a, b) => Number(!!b.previewLessonId) - Number(!!a.previewLessonId));
  const out: ProductCard[] = [];
  const seen = new Set<string>();
  for (const v of sorted) {
    const k = subjectKey(v.subjectSlug, v.subjectName);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length === 3) break;
  }
  for (const v of videos) if (out.length < 3 && !out.includes(v)) out.push(v);
  return out;
}

function HeroCard({ p, className }: { p: ProductCard; className: string }) {
  const t = toneFor(p.subjectSlug, p.subjectName);
  return (
    <div className={`${s.hcard} ${className}`} style={toneVars(t)}>
      <div className={s.hcover}>
        <SubjectMotif k={t.key} className={s.hmotif} />
        <span className={s.hchip}>{PRODUCT_TYPE_LABELS[p.type]}</span>
        <span className={s.hplay}>
          <Play fill="currentColor" />
        </span>
        <span className={s.hsubject}>{p.subjectName ?? p.gradeName}</span>
      </div>
      <div className={s.hbody}>
        <span className={s.hmeta}>{p.gradeName}</span>
        <span className={s.htitle}>{p.title}</span>
        <span className={s.hfoot}>
          {p.teacherName ? (
            <span className={s.hteacher}>
              <span className={s.miniAvatar}>{initialOf(p.teacherName)}</span>
              <span className={s.hteacherName}>{p.teacherName}</span>
            </span>
          ) : null}
          <span className={s.hprice}>
            <bdi className="num">{filsToKwdString(p.priceFils)}</bdi> د.ك
          </span>
        </span>
      </div>
    </div>
  );
}

export default async function SpectrumHome() {
  const d = await labData();
  const grades = [...d.grades].sort((a, b) => a.level - b.level);
  const statsOf = (id: string) => d.stats.get(id);
  const totalItems = grades.reduce((n, g) => n + (statsOf(g.id)?.products ?? 0), 0);
  const subjectsPerGrade = Math.max(0, ...grades.map((g) => statsOf(g.id)?.subjects ?? 0));
  const firstGrade = grades[0];
  const lastGrade = grades[grades.length - 1];
  const gradeRange = firstGrade && lastGrade ? `من ${shortGrade(firstGrade.name)} إلى ${shortGrade(lastGrade.name)}` : "";
  const stageName = firstGrade?.stageName ?? "المرحلة المتوسطة";

  const hero = pickHero(d.videos);
  const [heroMain, heroB, heroC] = hero;
  const heroSave = heroMain ? savePercent(heroMain.priceFils, heroMain.compareAtPriceFils) : 0;
  const heroDur = heroMain ? minutes(heroMain.totalDurationSeconds) : "";
  const shownSubjects = new Set(hero.map((p) => subjectKey(p.subjectSlug, p.subjectName)));
  const floatSubjects = SUBJECT_ORDER.filter((x) => !shownSubjects.has(x.key)).slice(0, 3);
  const firstPreview = d.videos.find((v) => v.previewLessonId);

  const nightReviews = d.reviews.filter((r) => r.type === "exam_review");
  const quizReviews = d.reviews.filter((r) => r.type === "quiz_review");
  const levelBySlug = new Map(grades.map((g) => [g.slug, g.level]));
  const bundles = [...d.bundles].sort((a, b) => (levelBySlug.get(a.gradeSlug) ?? 0) - (levelBySlug.get(b.gradeSlug) ?? 0));
  const teachersCount = d.teachers.length;
  const year = new Date().getFullYear();

  const steps = [
    {
      icon: GraduationCap,
      color: "#6C47FF",
      from: "#8F6BFF",
      title: "اختر صفك ومادتك",
      text: `كل شيء مرتب حسب الصف والمادة، ${gradeRange ? `للصفوف ${gradeRange}` : "في صفحة واحدة"}.`,
    },
    {
      icon: Eye,
      color: "#DE3F8C",
      from: "#F25C9E",
      title: "جرّب المعاينة المجانية",
      text: "شاهد الدرس الأول أو تصفح أول صفحات المذكرة قبل أن تدفع، بلا حساب.",
    },
    {
      icon: ShieldCheck,
      color: "#E07B0A",
      from: "#FFB22E",
      title: "ادفع بأمان",
      text: "عبر بوابة ماي فاتورة بكي نت أو البطاقة، ولا نحتفظ ببيانات بطاقتك.",
    },
    {
      icon: Library,
      color: "#0E9F6A",
      from: "#16B97A",
      title: "ابدأ من مكتبتك",
      text: "يظهر ما اشتريته في «مكتبتي» فور تأكيد الدفع، وتكمل الفيديو من حيث توقفت.",
    },
  ];

  return (
    <div className={s.page} dir="rtl">
      {/* ───────────── الرأس ───────────── */}
      <header className={s.header}>
        <div className={`${s.wrap} ${s.headerRow}`}>
          <Link href="/lab/v2-a" className={s.brand} aria-label="منصة درب، الصفحة الرئيسية">
            <LogoMark id="v2a-logo-head" className={s.logo} />
            <span className={s.wordmark}>منصة درب</span>
          </Link>
          <nav className={s.nav} aria-label="التنقل الرئيسي">
            <a href="#grades">الصفوف</a>
            <Link href="/teachers">المعلمون</Link>
            <Link href="/bundles">الباقات</Link>
            <Link href="/library">مكتبتي</Link>
          </nav>
          <div className={s.headerEnd}>
            <Link href="/cart" className={s.iconBtn} aria-label="السلة">
              <ShoppingCart aria-hidden className={s.ic20} />
            </Link>
            <Link href="/login" className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`}>
              <LogIn aria-hidden className={s.ic18} />
              <span>دخول</span>
            </Link>
            <details className={s.menu}>
              <summary className={s.iconBtn} aria-label="القائمة">
                <Menu aria-hidden className={s.ic20} />
              </summary>
              <nav className={s.menuPanel} aria-label="القائمة">
                <a href="#grades">
                  <GraduationCap aria-hidden className={s.ic18} />
                  الصفوف
                </a>
                <Link href="/teachers">
                  <Users aria-hidden className={s.ic18} />
                  المعلمون
                </Link>
                <Link href="/bundles">
                  <Layers aria-hidden className={s.ic18} />
                  الباقات
                </Link>
                <Link href="/library">
                  <Library aria-hidden className={s.ic18} />
                  مكتبتي
                </Link>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ───────────── البطل ───────────── */}
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroBg} aria-hidden>
            <span className={s.blobA} />
            <span className={s.blobB} />
            <span className={s.blobC} />
            <span className={s.heroDots} />
          </div>
          <div className={`${s.wrap} ${s.heroGrid}`}>
            <div className={s.heroText}>
              <span className={s.pill}>
                <span className={s.pillSpark}>
                  <Sparkles aria-hidden className={s.ic14} />
                </span>
                {stageName}
                {gradeRange ? <span className={s.pillSep}>للصفوف {gradeRange}</span> : null}
              </span>
              <h1 className={s.h1} id="hero-title">
                افهم دروسك بالفيديو،
                <br />
                و
                <span className={s.hl}>
                  تفوّق
                  <Swoosh className={s.swoosh} />
                </span>{" "}
                في اختباراتك
              </h1>
              <p className={s.heroLead}>{d.settings.hero_subtitle}</p>
              <div className={s.ctaRow}>
                <a href="#grades" className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`}>
                  اختر صفك وابدأ
                  <ArrowLeft aria-hidden className={s.ic20} />
                </a>
                {firstPreview ? (
                  <Link href={`/watch/${firstPreview.id}?lesson=${firstPreview.previewLessonId}`} className={`${s.btn} ${s.btnGhost} ${s.btnLg}`}>
                    <span className={s.btnPlay}>
                      <Play aria-hidden fill="currentColor" className={s.ic14} />
                    </span>
                    شاهد درسًا مجانًا
                  </Link>
                ) : null}
              </div>
              <nav className={s.quick} aria-label="انتقل مباشرة إلى صفك">
                <span className={s.quickLabel}>أو انتقل مباشرة إلى صفك</span>
                <ul className={s.quickList}>
                  {grades.map((g) => {
                    const gt = gradeTone(g.level);
                    return (
                      <li key={g.id}>
                        <Link
                          href={`/grades/${g.slug}`}
                          className={s.quickBtn}
                          style={{ "--g-via": gt.via, "--g-to": gt.to, "--g-glow": gt.glow } as CSSProperties}
                        >
                          <span className={s.quickNum} aria-hidden>
                            {ARABIC_DIGITS(g.level)}
                          </span>
                          <span>
                            <span className="sr-only">الصف </span>
                            {shortGrade(g.name)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>

            {heroMain ? (
              <div className={s.stage} aria-hidden>
                <div className={s.stageInner}>
                  <span className={s.stageBack} />
                  <span className={s.stageRing} />
                  {heroC ? <HeroCard p={heroC} className={s.hcC} /> : null}
                  {heroB ? <HeroCard p={heroB} className={s.hcB} /> : null}
                  <HeroCard p={heroMain} className={s.hcA} />

                  {heroMain.previewLessonId ? (
                    <span className={`${s.float} ${s.fPreview}`}>
                      <span className={s.fPreviewIcon}>
                        <Eye />
                      </span>
                      معاينة مجانية
                    </span>
                  ) : null}
                  {heroSave ? (
                    <span className={`${s.float} ${s.fSave}`}>
                      <span>وفّر</span>
                      <b>{ARABIC_DIGITS(heroSave)}٪</b>
                    </span>
                  ) : null}
                  {heroMain.lessonCount ? (
                    <span className={`${s.float} ${s.fLessons}`}>
                      <CirclePlay />
                      {countAr(heroMain.lessonCount, LESSONS)}
                      {heroDur ? (
                        <>
                          <span className={s.dot} />
                          <Clock />
                          {heroDur}
                        </>
                      ) : null}
                    </span>
                  ) : null}
                  {totalItems ? (
                    <span className={`${s.float} ${s.fStat}`}>
                      <b>{ARABIC_DIGITS(totalItems)}</b>
                      <span>
                        {countAr(totalItems, ITEMS).replace(/^[\d٠-٩]+\s/, "")}
                        <small>{gradeRange ? `للصفوف ${gradeRange}` : stageName}</small>
                      </span>
                    </span>
                  ) : null}
                  <span className={`${s.float} ${s.fResume}`}>
                    <span className={s.fResumeIcon}>
                      <Play fill="currentColor" />
                    </span>
                    <span className={s.fResumeText}>
                      تكمل من حيث توقفت
                      <span className={s.fResumeBar}>
                        <i />
                      </span>
                    </span>
                  </span>
                  {floatSubjects.map((x, i) => (
                    <span key={x.key} className={`${s.fSubject} ${s[`fSub${i}`]}`} style={toneVars(SUBJECT_TONES[x.key])}>
                      <SubjectIcon k={x.key} />
                    </span>
                  ))}
                  <Sparkle className={`${s.spark} ${s.spark1}`} />
                  <Sparkle className={`${s.spark} ${s.spark2}`} />
                  <Sparkle className={`${s.spark} ${s.spark3}`} />
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* ───────────── الصفوف ───────────── */}
        <section id="grades" className={s.gradesSection} aria-labelledby="grades-title">
          <div className={s.wrap}>
            <SectionHead
              id="grades-title"
              eyebrow="ابدأ من هنا"
              icon={<GraduationCap aria-hidden className={s.ic16} />}
              title="أنت في أي صف؟"
              lead="اختر صفك لتجد شروحات مواده ومراجعاتها ومذكراتها مرتبة في صفحة واحدة."
              action={
                <span className={s.headStat}>
                  <b>{ARABIC_DIGITS(totalItems)}</b> {countAr(totalItems, ITEMS).replace(/^[\d٠-٩]+\s/, "")} في {countAr(grades.length, { one: "صف واحد", two: "صفين", few: "صفوف", many: "صفًا" })}
                </span>
              }
            />
            <ul className={s.gradeGrid}>
              {grades.map((g) => {
                const st = statsOf(g.id);
                const gt = gradeTone(g.level);
                return (
                  <li key={g.id}>
                    <Link
                      href={`/grades/${g.slug}`}
                      className={s.gcard}
                      style={{ "--g-from": gt.from, "--g-via": gt.via, "--g-to": gt.to, "--g-ink": gt.ink, "--g-glow": gt.glow } as CSSProperties}
                    >
                      <GradeArt className={s.gart} />
                      <span className={s.gnum} aria-hidden>
                        {ARABIC_DIGITS(g.level)}
                      </span>
                      <span className={s.gpanel}>
                        <span className={s.gtext}>
                          <span className={s.gname}>{g.name}</span>
                          {st ? (
                            <span className={s.gmeta}>
                              <span>{countAr(st.subjects, SUBJECTS)}</span>
                              <span className={s.dot} aria-hidden />
                              <span>{countAr(st.products, ITEMS)}</span>
                            </span>
                          ) : null}
                        </span>
                        <span className={s.garrow} aria-hidden>
                          <ArrowLeft className={s.ic20} />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className={s.spectrum}>
              <p className={s.spectrumLabel}>
                <b>كل مادة بلونها</b>
                <span>{subjectsPerGrade ? `${countAr(subjectsPerGrade, SUBJECTS)} في كل صف، تعرفها من أول نظرة` : "تعرفها من أول نظرة"}</span>
              </p>
              <ul className={s.spectrumList}>
                {SUBJECT_ORDER.map((x) => (
                  <li key={x.key} style={toneVars(SUBJECT_TONES[x.key])}>
                    <span className={s.specIcon}>
                      <SubjectIcon k={x.key} className={s.ic16} />
                    </span>
                    {x.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ───────────── الدروس المرئية ───────────── */}
        {d.videos.length ? (
          <section className={s.videosSection} aria-labelledby="videos-title">
            <div className={s.wrap}>
              <SectionHead
                id="videos-title"
                eyebrow="شروحات بالفيديو"
                color="#DE3F8C"
                icon={<PlayCircle aria-hidden className={s.ic16} />}
                title="أحدث الدروس المرئية"
                lead="شرح الوحدات والدورات الكاملة والدروس المنفردة. شاهد الدرس المجاني قبل أن تشتري."
                action={
                  <a href="#grades" className={s.linkArrow}>
                    تصفح حسب صفك
                    <ArrowLeft aria-hidden className={s.ic16} />
                  </a>
                }
              />
            </div>
            <div className={s.rail}>
              <ul className={`${s.railTrack} ${s.videoGrid}`}>
                {d.videos.map((p) => (
                  <li key={p.id}>
                    <VideoCard p={p} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ───────────── موسم الاختبارات ───────────── */}
        {d.reviews.length ? (
          <section className={s.examSection} aria-labelledby="exam-title">
            <div className={s.wrap}>
              <div className={`${s.night} on-dark`}>
                <NightSky className={s.nightSky} />
                <span className={s.nightGlowA} aria-hidden />
                <span className={s.nightGlowB} aria-hidden />
                <Crescent className={s.crescent} />
                <SectionHead
                  dark
                  id="exam-title"
                  eyebrow="موسم الاختبارات"
                  color="#FFC53D"
                  icon={<Moon aria-hidden className={s.ic16} />}
                  title={
                    <>
                      الاختبار قريب؟ <span className={s.hlGold}>راجع بتركيز</span>
                    </>
                  }
                  lead="مراجعات مركزة على الأسئلة المتوقعة، قبل الاختبار القصير وفي ليلة الاختبار."
                />
                <div className={s.examCols}>
                  {nightReviews.length ? (
                    <div className={s.examCol}>
                      <h3 className={s.examColTitle}>
                        <span className={s.examColIcon} data-kind="night">
                          <Moon aria-hidden className={s.ic18} />
                        </span>
                        {PRODUCT_TYPE_LABELS.exam_review}
                      </h3>
                      <ul className={s.rlist}>
                        {nightReviews.map((p) => (
                          <ReviewRow key={p.id} p={p} />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {quizReviews.length ? (
                    <div className={s.examCol}>
                      <h3 className={s.examColTitle}>
                        <span className={s.examColIcon} data-kind="quiz">
                          <Timer aria-hidden className={s.ic18} />
                        </span>
                        {PRODUCT_TYPE_LABELS.quiz_review}
                      </h3>
                      <ul className={s.rlist}>
                        {quizReviews.map((p) => (
                          <ReviewRow key={p.id} p={p} />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* ───────────── المعلمون ───────────── */}
        {d.teachers.length ? (
          <section className={s.section} aria-labelledby="teachers-title">
            <div className={s.wrap}>
              <SectionHead
                id="teachers-title"
                eyebrow={teachersCount < 6 ? countAr(teachersCount, TEACHERS) : "المعلمون"}
                color="#0E9F6A"
                icon={<Users aria-hidden className={s.ic16} />}
                title="تعرّف على معلمك"
                lead="كل معلم وصفحته: شروحاته ومراجعاته ومذكراته في مكان واحد."
                action={
                  <Link href="/teachers" className={s.linkArrow}>
                    كل المعلمين
                    <ArrowLeft aria-hidden className={s.ic16} />
                  </Link>
                }
              />
            </div>
            <div className={s.rail}>
              <ul className={`${s.railTrack} ${s.teacherGrid}`}>
                {d.teachers.map((t) => (
                  <li key={t.id}>
                    <TeacherTile t={t} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ───────────── الباقات ───────────── */}
        {bundles.length ? (
          <section className={s.bundlesSection} aria-labelledby="bundles-title">
            <div className={s.wrap}>
              <SectionHead
                id="bundles-title"
                eyebrow="الباقات"
                color="#E07B0A"
                icon={<Layers aria-hidden className={s.ic16} />}
                title={
                  <>
                    مذكرات الصف كلها، <span className={s.hlWarm}>بسعر أقل</span>
                  </>
                }
                lead="باقة لكل صف تجمع المذكرات النهائية لمواده، بسعر أقل من شرائها منفردة."
                action={
                  <Link href="/bundles" className={s.linkArrow}>
                    كل الباقات
                    <ArrowLeft aria-hidden className={s.ic16} />
                  </Link>
                }
              />
              <ul className={s.bundleGrid}>
                {bundles.map((p) => (
                  <li key={p.id}>
                    <BundleTile p={p} level={levelBySlug.get(p.gradeSlug) ?? 6} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ───────────── المذكرات ───────────── */}
        {d.notes.length ? (
          <section className={s.section} aria-labelledby="notes-title">
            <div className={s.wrap}>
              <SectionHead
                id="notes-title"
                eyebrow="المذكرات"
                color="#2F6BF0"
                icon={<FileText aria-hidden className={s.ic16} />}
                title="مذكرات نهائية لكل مادة"
                lead="تصفح أول صفحاتها مجانًا، وتفتحها من مكتبتك على أي جهاز بعد الشراء."
              />
              <ul className={s.noteGrid}>
                {d.notes.map((p) => (
                  <li key={p.id}>
                    <NoteTile p={p} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ───────────── كيف تبدأ ───────────── */}
        <section className={s.stepsSection} aria-labelledby="steps-title">
          <div className={s.wrap}>
            <SectionHead
              id="steps-title"
              eyebrow="كيف تبدأ"
              icon={<Sparkles aria-hidden className={s.ic16} />}
              title="أربع خطوات وتبدأ المذاكرة"
            />
            <ol className={s.steps}>
              {steps.map((st, i) => {
                const I = st.icon;
                return (
                  <li key={st.title} className={s.step} style={{ "--c": st.color, "--c-from": st.from } as CSSProperties}>
                    <span className={s.stepBadge}>
                      <I aria-hidden className={s.ic24} />
                      <span className={s.stepNum}>{ARABIC_DIGITS(i + 1)}</span>
                    </span>
                    <h3 className={s.stepTitle}>{st.title}</h3>
                    <p className={s.stepText}>{st.text}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ───────────── الأسئلة الشائعة ───────────── */}
        {d.settings.faq.length ? (
          <section className={s.section} aria-labelledby="faq-title">
            <div className={`${s.wrap} ${s.faqGrid}`}>
              <div className={s.faqSide}>
                <SectionHead
                  id="faq-title"
                  eyebrow="الأسئلة الشائعة"
                  color="#2F6BF0"
                  icon={<MessageCircle aria-hidden className={s.ic16} />}
                  title="عندك سؤال؟"
                  lead="أكثر ما يسأل عنه الطلاب وأولياء الأمور قبل الشراء."
                />
                <div className={s.helpCard}>
                  <span className={s.helpIcon}>
                    <MessageCircle aria-hidden className={s.ic24} />
                  </span>
                  <p className={s.helpTitle}>لم تجد إجابتك؟</p>
                  <p className={s.helpText}>اكتب لنا من صفحة التواصل، ونساعدك في اختيار الشرح المناسب لصفك.</p>
                  <Link href="/contact" className={`${s.btn} ${s.btnDark}`}>
                    تواصل معنا
                    <ArrowLeft aria-hidden className={s.ic18} />
                  </Link>
                </div>
              </div>
              <div className={s.faqList}>
                {d.settings.faq.map((f, i) => (
                  <details key={i} className={s.faq} open={i === 0}>
                    <summary>
                      <span>{f.q}</span>
                      <span className={s.faqToggle} aria-hidden>
                        <ChevronDown className={s.ic18} />
                      </span>
                    </summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* ───────────── دعوة ختامية ───────────── */}
        <section className={s.ctaSection} aria-labelledby="cta-title">
          <div className={s.wrap}>
            <div className={s.ctaBand}>
              <span className={s.ctaBlob} aria-hidden />
              <SubjectMotif k="math" className={s.ctaMotifA} />
              <SubjectMotif k="science" className={s.ctaMotifB} />
              <div className={s.ctaText}>
                <h2 className={s.ctaTitle} id="cta-title">
                  جاهز تبدأ؟
                </h2>
                <p className={s.ctaLead}>اختر صفك، وشاهد أول درس مجانًا.</p>
              </div>
              <ul className={s.ctaGrades}>
                {grades.map((g) => (
                  <li key={g.id}>
                    <Link href={`/grades/${g.slug}`} className={s.ctaGrade}>
                      <span className={s.ctaGradeNum} aria-hidden>
                        {ARABIC_DIGITS(g.level)}
                      </span>
                      {g.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      {/* ───────────── التذييل ───────────── */}
      <footer className={s.footer}>
        <div className={s.footerSpectrum} aria-hidden>
          {SUBJECT_ORDER.map((x) => (
            <i key={x.key} style={{ background: SUBJECT_TONES[x.key].solid }} />
          ))}
        </div>
        <div className={`${s.wrap} ${s.footerGrid}`}>
          <div className={s.footerBrand}>
            <Link href="/lab/v2-a" className={s.brand} aria-label="منصة درب، الصفحة الرئيسية">
              <LogoMark id="v2a-logo-foot" className={s.logo} />
              <span className={s.wordmark}>{d.settings.site_name}</span>
            </Link>
            <p>{d.settings.tagline}</p>
            <p className={s.footerYear}>العام الدراسي {ARABIC_DIGITS(d.settings.academic_year.replace("-", " / "))}</p>
          </div>
          <nav aria-label="الصفوف" className={s.footerCol}>
            <h2>الصفوف</h2>
            <ul>
              {grades.map((g) => (
                <li key={g.id}>
                  <Link href={`/grades/${g.slug}`}>{g.name}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="المنصة" className={s.footerCol}>
            <h2>المنصة</h2>
            <ul>
              <li>
                <Link href="/teachers">المعلمون</Link>
              </li>
              <li>
                <Link href="/bundles">الباقات</Link>
              </li>
              <li>
                <Link href="/library">مكتبتي</Link>
              </li>
              <li>
                <Link href="/contact">تواصل معنا</Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="السياسات" className={s.footerCol}>
            <h2>السياسات</h2>
            <ul>
              <li>
                <Link href="/terms">الشروط والأحكام</Link>
              </li>
              <li>
                <Link href="/privacy">سياسة الخصوصية</Link>
              </li>
              <li>
                <Link href="/refund-policy">سياسة الاسترجاع</Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className={s.wrap}>
          <div className={s.footerBottom}>
            <p>
              © {ARABIC_DIGITS(year)} {d.settings.site_name}. {d.settings.footer_note}
            </p>
            <p className={s.footerPay}>
              <ShieldCheck aria-hidden className={s.ic16} />
              دفع آمن عبر كي نت والبطاقات
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

