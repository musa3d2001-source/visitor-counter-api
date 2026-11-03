/*
 * ─────────────────────────────────────────────────────────────────────────────
 * منصة درب · الاتجاه v2-c «الفصل المشمس» (Sunny Classroom, elevated)
 * ─────────────────────────────────────────────────────────────────────────────
 * الفكرة: نطوّر ما أحبه المستخدم في التصميم القديم (كريمي + فيروزي + ذهبي، بطاقات
 * دروس مائلة متراكبة، أغلفة متدرجة بزر تشغيل) إلى صفحة تجارية غنية ومصقولة:
 * خلفية دافئة بتدرجات شبكية ناعمة، عمق بظلال طبقية، بطاقات دائرية الزوايا، رسومات
 * SVG مرسومة يدويًا لكل مادة وصف وخطوة، وحركة هادئة تحترم «تقليل الحركة».
 *
 * الألوان
 *   الخلفية       كريمي #FFF8EC · كريمي أعمق #FFF1DC · ورق أبيض #FFFFFF
 *   الحبر         #172026 · ثانوي #3C4A52 · خافت #5A6670 (AA فوق الكريمي)
 *   الأساسي       فيروزي #0A6B66 (داكن #063F3C · فاتح #17A398 · نعناعي #9BEBD8 / #E3FAF3)
 *   الإبراز       ذهبي #FFC531 (حافة #E9A400 · نص ذهبي #8A5A00) · خوخي #FFAD8A · مرجاني #FF6F59
 *   المواد        الرياضيات #5B9BFF→#3B3FD8 · العلوم #34D9A0→#0B8A66 · الإنجليزية #FF85B8→#C42F86
 *                 العربية #FFA266→#E2463A · الإسلامية #3DD0C4→#0B7482 · الاجتماعيات #FFC93F→#E2780E
 *   الصفوف        ٦ شروق #FFD25E→#FF6B5A · ٧ بحر #6EEBD3→#0B7F86 · ٨ سماء #86CBFF→#5948E0 · ٩ توت #D0A4FF→#E0509A
 *
 * الخطوط
 *   العناوين والأرقام والأزرار: Cairo (700 إلى 900) قوي وتجاري، وتوسيطه العمودي دقيق داخل الأزرار
 *   النصوص والوصف:             Tajawal (400 إلى 800) ودود ومقروء، بارتفاع سطر 1.8
 *
 * التخطيط
 *   شريط علوي متدرج بالعام الدراسي ← رأس زجاجي لاصق (شعار «الدرب نحو الشمس»، روابط، سلة، دخول).
 *   البطل: عنوان ضخم بكلمة مميزة وخط ذهبي، زران، أرقام حقيقية في كبسولات؛ وبجانبه مروحة
 *          ثلاثية الأبعاد من ثلاث دورات حقيقية مائلة فوق شمس بأشعة، مع ملصقات عائمة حقيقية.
 *   الصفوف: لوح أبيض يعلو البطل، أربع بطاقات ملموسة بتدرج ورسم ورقم ضخم وأعداد حقيقية،
 *          ثم «ادخل مادتك مباشرة»: تبويبات الصفوف (CSS فقط) ومربعات المواد الملونة.
 *   الدروس المرئية: أغلفة متدرجة برسم المادة، شارة معاينة، المدة، صورة رمزية للمعلم، السعر والتوفير.
 *   قبل الاختبار: لوح من ليل (نجوم وهلال) إلى شروق (شمس)، عمودان للمراجعات بتذاكر بيضاء.
 *   المعلمون: بطاقات بغلاف متدرج ودائرة رمزية بالحرف الأول وأيقونة المادة وأرقام حقيقية.
 *   الباقات: أوراق متراكبة بألوان مواد الباقة الفعلية وشريط توفير حقيقي.
 *   المذكرات: أوراق بطابع الورق المطوي ورأس ملون للمادة.
 *   كيف تبدأ: أربع خطوات برسومات ومسار منقط. الأسئلة الشائعة من الإعدادات + بطاقة تواصل.
 *   دعوة ختامية مشمسة + تذييل فيروزي داكن.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "@fontsource-variable/cairo";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/500.css";
import "@fontsource/tajawal/700.css";
import "@fontsource/tajawal/800.css";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  BadgePercent,
  ChevronDown,
  Clock3,
  CreditCard,
  FileText,
  GraduationCap,
  Layers,
  LibraryBig,
  LogIn,
  Menu,
  MessageCircle,
  MonitorPlay,
  Moon,
  Play,
  PlayCircle,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Sun,
  Timer,
  Users,
  Zap,
} from "lucide-react";
import { filsToKwdString } from "@/lib/money";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { getBundleItems, listSubjects, listTeachers, type ProductCard, type TeacherCard } from "@/server/catalog/queries";
import { labData } from "../data";
import { BundleStack, GradeArt, LogoMark, NightSky, Sparkle, StepArt, SubjectArt, SubjectIcon, Sunrise, Swash } from "./art";
import { ar, count, countParts, duration, gradeTone, initial, savings, subjectTone, W, type Tone } from "./lib";
import { SubjectTabs } from "./subject-tabs";
import s from "./v2c.module.css";

export const metadata = { title: "مختبر v2-c · الفصل المشمس" };

type Vars = CSSProperties & Record<`--${string}`, string>;
const toneVars = (t: Tone): Vars => ({ "--a": t.from, "--b": t.to, "--d": t.deep, "--soft": t.soft, "--tink": t.ink });
const gradeVars = (level: number): Vars => {
  const g = gradeTone(level);
  return { ...toneVars(g), "--m": g.mid };
};

function Price({ fils, compare, size = "md" }: { fils: number; compare?: number | null; size?: "md" | "lg" }) {
  const save = savings(fils, compare ?? null);
  return (
    <span className={`${s.price} ${size === "lg" ? s.priceLg : ""}`}>
      <span className={s.priceNow}>
        <b className="num">{filsToKwdString(fils)}</b> <span className={s.cur}>د.ك</span>
      </span>
      {save && (
        <>
          <s className={s.priceWas}>
            <span className="sr-only">بدلًا من </span>
            <span className="num">{filsToKwdString(compare!)}</span>
          </s>
          <span className={s.pct}>خصم {ar(save.pct)}٪</span>
        </>
      )}
    </span>
  );
}

function SectionHead({
  icon,
  eyebrow,
  title,
  sub,
  more,
  tone = "teal",
  id,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  more?: { href: string; label: string };
  tone?: "teal" | "gold" | "coral" | "violet" | "light";
  id: string;
}) {
  return (
    <div className={s.shead}>
      <div className={s.sheadText}>
        <span className={`${s.eyebrow} ${s[`eb_${tone}`]}`}>
          <span className={s.ebIcon}>{icon}</span>
          {eyebrow}
        </span>
        <h2 id={id} className={s.h2}>
          {title}
        </h2>
        {sub && <p className={s.sub}>{sub}</p>}
      </div>
      {more && (
        <Link href={more.href} className={s.more}>
          {more.label}
          <ArrowLeft size={18} aria-hidden />
        </Link>
      )}
    </div>
  );
}

/* ───────────── بطاقات ───────────── */

function HeroCard({ p, className }: { p: ProductCard; className: string }) {
  const t = subjectTone(p.subjectSlug);
  return (
    <div className={`${s.fanCard} ${className}`} style={toneVars(t)}>
      <div className={s.fanPoster}>
        <span className={s.fanType}>{PRODUCT_TYPE_LABELS[p.type]}</span>
        <div className={s.fanArt}>
          <SubjectArt slug={p.subjectSlug} />
        </div>
        <span className={s.fanPlay}>
          <Play size={22} fill="currentColor" aria-hidden />
        </span>
        <span className={s.fanSubject}>{p.subjectName}</span>
      </div>
      <div className={s.fanBody}>
        <span className={s.fanAvatar}>{initial(p.teacherName)}</span>
        <span className={s.fanMeta}>
          <b>{p.gradeName}</b>
          <small>{count(p.lessonCount, W.lesson)}</small>
        </span>
        <span className={s.fanPrice}>
          <b className="num">{filsToKwdString(p.priceFils)}</b> د.ك
        </span>
      </div>
    </div>
  );
}

function VideoCard({ p }: { p: ProductCard }) {
  const t = subjectTone(p.subjectSlug);
  const href = `/products/${p.slug}`;
  return (
    <article className={s.vcard} style={toneVars(t)}>
      <div className={s.poster}>
        <div className={s.posterArt}>
          <SubjectArt slug={p.subjectSlug} />
        </div>
        <span className={`${s.glassChip} ${s.posterType}`}>{PRODUCT_TYPE_LABELS[p.type]}</span>
        {p.previewLessonId && (
          <span className={`${s.freeChip} ${s.posterFree}`}>
            <Sparkles size={14} aria-hidden />
            معاينة مجانية
          </span>
        )}
        <span className={s.posterPlay} aria-hidden>
          <Play size={22} fill="currentColor" />
        </span>
      </div>
      <div className={s.vbody}>
        <span className={s.vavatar} aria-hidden>
          {initial(p.teacherName)}
        </span>
        <p className={s.kicker}>
          <span className={s.kdot} aria-hidden />
          {p.subjectName} · {p.gradeName}
        </p>
        <h3 className={s.vtitle}>
          <Link href={href} className={s.stretch}>
            {p.title}
          </Link>
        </h3>
        {p.teacherName && <p className={s.vteacher}>{p.teacherName}</p>}
        <p className={s.vmeta}>
          <span>
            <PlayCircle size={15} aria-hidden />
            {count(p.lessonCount, W.lesson)}
          </span>
          {p.totalDurationSeconds > 0 && (
            <span>
              <Clock3 size={15} aria-hidden />
              {duration(p.totalDurationSeconds)}
            </span>
          )}
        </p>
        <div className={s.vfoot}>
          <Price fils={p.priceFils} compare={p.compareAtPriceFils} />
          {p.previewLessonId ? (
            <Link href={`/watch/${p.id}?lesson=${p.previewLessonId}`} className={s.vpreview} aria-label={`شاهد المعاينة المجانية: ${p.title}`}>
              <Play size={14} fill="currentColor" aria-hidden />
              شاهد مجانًا
            </Link>
          ) : (
            <span className={s.vdetails} aria-hidden>
              التفاصيل
              <ArrowLeft size={15} />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function ExamTicket({ p }: { p: ProductCard }) {
  const t = subjectTone(p.subjectSlug);
  return (
    <article className={s.ticket} style={toneVars(t)}>
      <span className={s.ticketIcon}>
        <SubjectIcon slug={p.subjectSlug} size={24} />
      </span>
      <div className={s.ticketText}>
        <h4 className={s.ticketTitle}>
          <Link href={`/products/${p.slug}`} className={s.stretch}>
            {p.title}
          </Link>
        </h4>
        <p className={s.ticketMeta}>
          {p.gradeName}
          {p.teacherName ? ` · ${p.teacherName}` : ""}
        </p>
        <p className={s.ticketChips}>
          <span>
            <PlayCircle size={14} aria-hidden />
            {count(p.lessonCount, W.lesson)}
          </span>
          {p.totalDurationSeconds > 0 && (
            <span>
              <Clock3 size={14} aria-hidden />
              {duration(p.totalDurationSeconds)}
            </span>
          )}
          {p.previewLessonId && (
            <Link href={`/watch/${p.id}?lesson=${p.previewLessonId}`} className={s.ticketFree} aria-label={`معاينة مجانية: ${p.title}`}>
              <Sparkles size={13} aria-hidden />
              معاينة مجانية
            </Link>
          )}
        </p>
      </div>
      <div className={s.ticketPrice}>
        <b className="num">{filsToKwdString(p.priceFils)}</b>
        <span>د.ك</span>
      </div>
    </article>
  );
}

function TeacherTile({ t }: { t: TeacherCard }) {
  const first = t.subjects[0];
  const tone = subjectTone(first?.slug);
  const grades = Array.from(new Set(t.subjects.map((x) => x.gradeName)));
  return (
    <article className={s.tcard} style={toneVars(tone)}>
      <div className={s.tcover} aria-hidden>
        <span className={s.tcoverArt}>
          <SubjectArt slug={first?.slug} />
        </span>
      </div>
      <div className={s.tavatarWrap} aria-hidden>
        <span className={s.tavatar}>{initial(t.name)}</span>
        <span className={s.tbadge}>
          <SubjectIcon slug={first?.slug} size={16} strokeWidth={2.4} />
        </span>
      </div>
      <h3 className={s.tname}>
        <Link href={`/teachers/${t.slug}`} className={s.stretch}>
          {t.name}
        </Link>
      </h3>
      {t.headline && <p className={s.theadline}>{t.headline}</p>}
      <ul className={s.tchips} aria-label="المواد والصفوف">
        {t.subjects.slice(0, 3).map((x) => (
          <li key={x.id} style={toneVars(subjectTone(x.slug))}>
            {x.name}
          </li>
        ))}
        {grades.slice(0, 2).map((g) => (
          <li key={g} className={s.tgrade}>
            {g}
          </li>
        ))}
      </ul>
      <div className={s.tstats}>
        <span>
          <MonitorPlay size={16} aria-hidden />
          {count(t.videoCount, W.videoLesson)}
        </span>
        <span>
          <Layers size={16} aria-hidden />
          {count(t.productCount, W.product)}
        </span>
      </div>
      <span className={s.tcta} aria-hidden>
        صفحة المعلم
        <ArrowLeft size={16} />
      </span>
    </article>
  );
}

function BundleTile({ p, items, level }: { p: ProductCard; items: ProductCard[]; level: number }) {
  const save = savings(p.priceFils, p.compareAtPriceFils);
  const colors = items.map((i) => subjectTone(i.subjectSlug).to);
  return (
    <article className={s.bcard} style={gradeVars(level)}>
      <div className={s.bart}>
        <span className={s.bnum} aria-hidden>
          {ar(level)}
        </span>
        <div className={s.bstack}>
          <BundleStack colors={colors.length ? colors : ["#fff"]} />
        </div>
        {save && (
          <span className={s.ribbon}>
            وفّر <b className="num">{filsToKwdString(save.fils)}</b> د.ك
          </span>
        )}
      </div>
      <div className={s.bbody}>
        <p className={s.kicker}>
          <span className={s.kdot} aria-hidden />
          {PRODUCT_TYPE_LABELS[p.type]} · {p.gradeName}
        </p>
        <h3 className={s.btitle}>
          <Link href={`/products/${p.slug}`} className={s.stretch}>
            {p.title}
          </Link>
        </h3>
        {items.length > 0 && (
          <ul className={s.bitems} aria-label="تضم الباقة">
            {items.slice(0, 6).map((i) => (
              <li key={i.id} style={toneVars(subjectTone(i.subjectSlug))} title={i.subjectName ?? i.title}>
                <SubjectIcon slug={i.subjectSlug} size={15} strokeWidth={2.4} />
                <span className="sr-only">{i.subjectName ?? i.title}</span>
              </li>
            ))}
            <li className={s.bcount}>{`تضم ${count(items.length, W.product)}`}</li>
          </ul>
        )}
        <div className={s.bfoot}>
          <Price fils={p.priceFils} compare={p.compareAtPriceFils} size="lg" />
        </div>
      </div>
    </article>
  );
}

function NoteTile({ p }: { p: ProductCard }) {
  const t = subjectTone(p.subjectSlug);
  return (
    <article className={s.ncard} style={toneVars(t)}>
      <div className={s.nsheet} aria-hidden>
        <div className={s.nhead}>
          <span className={s.nicon}>
            <SubjectIcon slug={p.subjectSlug} size={20} />
          </span>
          <span className={s.nsub}>{p.subjectName}</span>
        </div>
        <div className={s.nlines}>
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className={s.nfold} />
      </div>
      <div className={s.nbody}>
        <h3 className={s.ntitle}>
          <Link href={`/products/${p.slug}`} className={s.stretch}>
            {p.title}
          </Link>
        </h3>
        <p className={s.nmeta}>
          <span>
            <FileText size={14} aria-hidden />
            {p.pageCount ? count(p.pageCount, W.page) : PRODUCT_TYPE_LABELS[p.type]}
          </span>
          {p.hasPreview && <span className={s.nfree}>أول الصفحات مجانًا</span>}
        </p>
        <Price fils={p.priceFils} compare={p.compareAtPriceFils} />
      </div>
    </article>
  );
}

/* ───────────── الصفحة ───────────── */

export default async function SunnyClassroom() {
  const d = await labData();
  const [subjectsByGrade, allTeachers, bundleItems] = await Promise.all([
    Promise.all(d.grades.map((g) => listSubjects(g.id))),
    listTeachers(),
    Promise.all(d.bundles.map((b) => getBundleItems(b.id))),
  ]);

  const totalLessons = allTeachers.reduce((n, t) => n + t.videoCount, 0);
  const levelBySlug = new Map(d.grades.map((g) => [g.slug, g.level]));
  const courses = d.videos.filter((v) => v.type === "video_course");
  const fan = (courses.length >= 3 ? courses : d.videos).slice(0, 3);
  const firstPreview = d.videos.find((v) => v.previewLessonId);
  const previewHref = firstPreview ? `/watch/${firstPreview.id}?lesson=${firstPreview.previewLessonId}` : "#videos";
  const examNight = d.reviews.filter((r) => r.type === "exam_review");
  const quizzes = d.reviews.filter((r) => r.type === "quiz_review");
  const nightReview = examNight[0];
  const fanSave = fan[0] ? savings(fan[0].priceFils, fan[0].compareAtPriceFils) : null;
  const year = d.settings.academic_year.replace("-", "/");
  const stageName = d.grades[0]?.stageName ?? "المرحلة المتوسطة";
  const firstGrade = d.grades[0];
  const lastGrade = d.grades[d.grades.length - 1];
  const gradeRange = firstGrade && lastGrade ? `من ${firstGrade.name} إلى ${lastGrade.name}` : "";
  const wa = d.settings.whatsapp_number.replace(/\D/g, "");

  return (
    <div className={s.root}>
      {/* ═════════ شريط الإعلان ═════════ */}
      <div className={s.announce}>
        <div className={s.wrap}>
          <Sparkle className={s.annSpark} color="#FFE29A" />
          <p>
            <span className={s.annYear}>
              العام الدراسي <span className="num">{year}</span>:{" "}
            </span>
            شروحات {gradeRange} متاحة الآن
          </p>
          <Link href={previewHref} className={s.annLink}>
            جرّب درسًا مجانًا
            <ArrowLeft size={14} aria-hidden />
          </Link>
        </div>
      </div>

      {/* ═════════ الرأس ═════════ */}
      <header className={s.header}>
        <div className={`${s.wrap} ${s.headerRow}`}>
          <Link href="/" className={s.brand} aria-label={`${d.settings.site_name}: الصفحة الرئيسية`}>
            <LogoMark id="h" />
            <span className={s.brandText}>
              <b>{d.settings.site_name}</b>
              <small>{stageName}</small>
            </span>
          </Link>
          <nav className={s.nav} aria-label="القائمة الرئيسية">
            <a href="#grades">الصفوف</a>
            <Link href="/teachers">المعلمون</Link>
            <Link href="/bundles">الباقات</Link>
            <Link href="/library">مكتبتي</Link>
          </nav>
          <div className={s.actions}>
            <Link href="/cart" className={s.iconBtn} aria-label="السلة">
              <ShoppingCart size={21} aria-hidden />
            </Link>
            <Link href="/login" className={s.loginBtn}>
              <LogIn size={18} aria-hidden />
              <span>دخول</span>
            </Link>
            <details className={s.menu}>
              <summary className={s.iconBtn} aria-label="فتح القائمة">
                <Menu size={22} aria-hidden />
              </summary>
              <nav className={s.menuPanel} aria-label="قائمة الجوال">
                <a href="#grades">
                  <GraduationCap size={20} aria-hidden />
                  الصفوف
                </a>
                <Link href="/teachers">
                  <Users size={20} aria-hidden />
                  المعلمون
                </Link>
                <Link href="/bundles">
                  <BadgePercent size={20} aria-hidden />
                  الباقات
                </Link>
                <Link href="/library">
                  <LibraryBig size={20} aria-hidden />
                  مكتبتي
                </Link>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ═════════ البطل ═════════ */}
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroMesh} aria-hidden />
          <div className={`${s.wrap} ${s.heroGrid}`}>
            <div className={s.heroText}>
              <span className={s.heroEyebrow}>
                <span className={s.heroEyebrowDot}>
                  <Sun size={14} aria-hidden />
                </span>
                {d.settings.tagline}
              </span>
              <h1 id="hero-title" className={s.h1}>
                افهم درسك،
                <br />
                وادخل اختبارك
                <br />
                وأنت{" "}
                <span className={s.hl}>
                  <span className={s.hlText}>واثق</span>
                  <Swash className={s.hlSwash} />
                </span>
              </h1>
              <p className={s.heroSub}>{d.settings.hero_subtitle}</p>
              <div className={s.heroCtas}>
                <a href="#grades" className={s.btnPrimary}>
                  اختر صفك وابدأ
                  <span className={s.btnArrow}>
                    <ArrowLeft size={18} aria-hidden />
                  </span>
                </a>
                <Link href={previewHref} className={s.btnGhost}>
                  <span className={s.btnPlay}>
                    <Play size={15} fill="currentColor" aria-hidden />
                  </span>
                  شاهد درسًا مجانًا
                </Link>
              </div>
              <ul className={s.stats} aria-label="أرقام المنصة">
                {[
                  { k: "lessons", icon: <MonitorPlay size={18} aria-hidden />, c: s.si_teal, ...countParts(totalLessons, W.videoLesson) },
                  { k: "teachers", icon: <Users size={18} aria-hidden />, c: s.si_coral, ...countParts(allTeachers.length, W.teacher) },
                  { k: "grades", icon: <GraduationCap size={18} aria-hidden />, c: s.si_gold, ...countParts(d.grades.length, W.grade) },
                ].map((x) => (
                  <li key={x.k}>
                    <span className={`${s.statIcon} ${x.c}`}>{x.icon}</span>
                    <span className={s.statText}>
                      <b>{x.num}</b> <small>{x.label}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={s.heroArt} aria-hidden>
              <div className={s.fan}>
                <div className={s.fanInner}>
                  <div className={s.sun} />
                  <div className={s.sunRays} />
                  <div className={s.blobTeal} />
                  <div className={s.dots} />
                  <Sparkle className={s.spark1} />
                  <Sparkle className={s.spark2} color="#FF8A65" />
                  <Sparkle className={s.spark3} color="#17A398" />
                  <div className={s.fanStage}>
                    {fan[2] && <HeroCard p={fan[2]} className={s.fc1} />}
                    {fan[1] && <HeroCard p={fan[1]} className={s.fc2} />}
                    {fan[0] && <HeroCard p={fan[0]} className={s.fc3} />}
                  </div>
                  {firstPreview && (
                    <div className={`${s.float} ${s.floatFree}`}>
                      <span className={s.floatPlay}>
                        <Play size={14} fill="currentColor" />
                      </span>
                      <span>
                        <b>معاينة مجانية</b>
                        <small>شاهد قبل الشراء</small>
                      </span>
                    </div>
                  )}
                  {fanSave && (
                    <div className={`${s.float} ${s.floatSave}`}>
                      <small>وفّر</small>
                      <b className="num">{filsToKwdString(fanSave.fils)}</b>
                      <small>د.ك</small>
                    </div>
                  )}
                  {nightReview && (
                    <div className={`${s.float} ${s.floatNight}`}>
                      <span className={s.floatMoon}>
                        <Moon size={16} />
                      </span>
                      <span>
                        <b>{PRODUCT_TYPE_LABELS[nightReview.type]}</b>
                        <small>
                          {nightReview.subjectName} · <span className="num">{filsToKwdString(nightReview.priceFils)}</span> د.ك
                        </small>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <ul className={`${s.wrap} ${s.trust}`} aria-label="مزايا المنصة">
            <li>
              <ShieldCheck size={20} aria-hidden />
              دفع آمن بكي نت والبطاقات
            </li>
            <li>
              <Zap size={20} aria-hidden />
              يظهر في مكتبتك فور الدفع
            </li>
            <li>
              <PlayCircle size={20} aria-hidden />
              تكمل الفيديو من حيث توقفت
            </li>
            <li>
              <MonitorPlay size={20} aria-hidden />
              على الجوال والحاسوب
            </li>
          </ul>
        </section>

        {/* ═════════ الصفوف ═════════ */}
        <section className={s.gradesSec} aria-labelledby="grades-title" id="grades">
          <div className={s.wrap}>
            <div className={s.dock}>
              <SectionHead
                id="grades-title"
                icon={<GraduationCap size={16} />}
                eyebrow={stageName}
                title={
                  <>
                    في أي صف أنت؟ <span className={s.h2Accent}>كل شيء جاهز لك</span>
                  </>
                }
                sub="اختر صفك لتجد شروحات الفيديو والمراجعات والمذكرات مرتبة حسب المادة."
              />
              <ul className={s.gradeGrid}>
                {d.grades.map((g, i) => {
                  const st = d.stats.get(g.id);
                  const subs = subjectsByGrade[i] ?? [];
                  return (
                    <li key={g.id}>
                      <Link href={`/grades/${g.slug}`} className={s.gcard} style={gradeVars(g.level)}>
                        <span className={s.gwin}>
                          <span className={s.gnum} aria-hidden>
                            {ar(g.level)}
                          </span>
                          <span className={s.gart}>
                            <GradeArt level={g.level} />
                          </span>
                        </span>
                        <span className={s.gbody}>
                          <span className={s.gname}>{g.name}</span>
                          {st && (
                            <span className={s.gstats}>
                              {count(st.subjects, W.subject)} · {count(st.products, W.product)}
                            </span>
                          )}
                          <span className={s.gsubs} aria-hidden>
                            {subs.slice(0, 6).map((x) => (
                              <span key={x.id} style={toneVars(subjectTone(x.slug))}>
                                <SubjectIcon slug={x.slug} size={13} strokeWidth={2.6} />
                              </span>
                            ))}
                          </span>
                          <span className={s.gcta}>
                            ادخل صفك
                            <ArrowLeft size={18} aria-hidden />
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {/* المواد مباشرة: تبويبات صفوف ومربعات مواد */}
              <SubjectTabs
                grades={d.grades.map((g, i) => ({
                  id: g.id,
                  slug: g.slug,
                  name: g.name,
                  short: g.name.replace(/^الصف\s+/, ""),
                  num: ar(g.level),
                  vars: gradeVars(g.level),
                  subjects: (subjectsByGrade[i] ?? []).map((x) => ({
                    id: x.id,
                    slug: x.slug,
                    name: x.name,
                    countLabel: count(x.productCount, W.product),
                    vars: toneVars(subjectTone(x.slug)),
                  })),
                }))}
              />
            </div>
          </div>
        </section>

        {/* ═════════ الدروس المرئية ═════════ */}
        <section className={s.section} aria-labelledby="videos-title" id="videos">
          <div className={s.wrap}>
            <SectionHead
              id="videos-title"
              icon={<MonitorPlay size={16} />}
              eyebrow="شروحات بالفيديو"
              title="أحدث الدروس المرئية"
              sub="شرح لكل وحدة بصوت معلمك، وكثير منها فيه درس مجاني تشاهده قبل الشراء."
              more={{ href: "/teachers", label: "تصفح حسب المعلم" }}
            />
            <ul className={s.vgrid}>
              {d.videos.map((p) => (
                <li key={p.id}>
                  <VideoCard p={p} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ═════════ قبل الاختبار ═════════ */}
        {d.reviews.length > 0 && (
          <section className={s.examSec} aria-labelledby="exam-title" id="exams">
            <div className={s.wrap}>
              <div className={s.exam}>
                <span className={s.examStars} aria-hidden />
                <NightSky className={s.examSky} />
                <Sunrise className={s.examSun} />
                <div className={s.examHead}>
                  <span className={`${s.eyebrow} ${s.eb_light}`}>
                    <span className={s.ebIcon}>
                      <Timer size={16} />
                    </span>
                    موسم الاختبارات
                  </span>
                  <h2 id="exam-title" className={`${s.h2} ${s.h2Light}`}>
                    قبل الاختبار؟ <span className={s.h2Gold}>راجع بتركيز</span>
                  </h2>
                  <p className={s.examSub}>دروس مركزة على الأسئلة المتوقعة، للاختبار القصير وليلة الاختبار.</p>
                </div>
                <div className={s.examCols}>
                  {examNight.length > 0 && (
                    <div className={s.examCol}>
                      <h3 className={s.examColTitle}>
                        <span className={s.examColIcon}>
                          <Moon size={18} aria-hidden />
                        </span>
                        مراجعات ليلة الاختبار
                      </h3>
                      <ul className={s.ticketList}>
                        {examNight.map((p) => (
                          <li key={p.id}>
                            <ExamTicket p={p} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {quizzes.length > 0 && (
                    <div className={s.examCol}>
                      <h3 className={`${s.examColTitle} ${s.examColTitleSun}`}>
                        <span className={`${s.examColIcon} ${s.examColIconSun}`}>
                          <Sun size={18} aria-hidden />
                        </span>
                        مراجعات الاختبارات القصيرة
                      </h3>
                      <ul className={s.ticketList}>
                        {quizzes.map((p) => (
                          <li key={p.id}>
                            <ExamTicket p={p} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ═════════ المعلمون ═════════ */}
        <section className={`${s.section} ${s.teachSec}`} aria-labelledby="teachers-title" id="teachers">
          <div className={s.wrap}>
            <SectionHead
              id="teachers-title"
              icon={<Users size={16} />}
              eyebrow="معلمو درب"
              tone="coral"
              title="تعلّم مع معلم يشرح لك خطوة بخطوة"
              sub="اختر معلمك وتابع شروحاته ومراجعاته من أول الوحدة حتى ليلة الاختبار."
              more={{ href: "/teachers", label: "كل المعلمين" }}
            />
            <ul className={s.tgrid}>
              {d.teachers.map((t) => (
                <li key={t.id}>
                  <TeacherTile t={t} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ═════════ الباقات ═════════ */}
        {d.bundles.length > 0 && (
          <section className={`${s.section} ${s.bundleSec}`} aria-labelledby="bundles-title" id="bundles">
            <div className={s.wrap}>
              <SectionHead
                id="bundles-title"
                icon={<BadgePercent size={16} />}
                eyebrow="وفّر أكثر"
                tone="gold"
                title="باقات الصفوف بسعر أقل"
                sub="مذكرات الصف كلها في باقة واحدة، بسعر أقل من مجموع أسعارها منفردة."
                more={{ href: "/bundles", label: "كل الباقات" }}
              />
              <ul className={s.bgrid}>
                {d.bundles.map((b, i) => (
                  <li key={b.id}>
                    <BundleTile p={b} items={bundleItems[i] ?? []} level={levelBySlug.get(b.gradeSlug) ?? 0} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ═════════ المذكرات ═════════ */}
        {d.notes.length > 0 && (
          <section className={s.section} aria-labelledby="notes-title" id="notes">
            <div className={s.wrap}>
              <SectionHead
                id="notes-title"
                icon={<FileText size={16} />}
                eyebrow="مذكرات مرتبة"
                tone="violet"
                title="المذكرات النهائية"
                sub="ملخص مرتب لكل مادة، وتقرأ أول صفحاتها مجانًا قبل الشراء."
              />
              <ul className={s.ngrid}>
                {d.notes.map((p) => (
                  <li key={p.id}>
                    <NoteTile p={p} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ═════════ كيف تبدأ ═════════ */}
        <section className={`${s.section} ${s.howSec}`} aria-labelledby="how-title" id="how">
          <div className={s.wrap}>
            <SectionHead id="how-title" icon={<Zap size={16} />} eyebrow="سهلة وسريعة" title="كيف تبدأ؟ أربع خطوات فقط" />
            <ol className={s.steps}>
              {[
                { t: "اختر صفك ومادتك", p: "كل شيء مرتب حسب الصف والمادة، فتصل إلى درسك بنفسك في ثوانٍ.", c: "s1" },
                { t: "شاهد المعاينة مجانًا", p: "أغلب الشروحات فيها درس مجاني، والمذكرات فيها أول الصفحات، بدون حساب.", c: "s2" },
                { t: "ادفع بأمان", p: "عبر ماي فاتورة بكي نت أو البطاقة البنكية، ولا نحتفظ ببيانات بطاقتك.", c: "s3" },
                { t: "ذاكر من مكتبتك", p: "يظهر ما اشتريته في «مكتبتي» فورًا، وتكمل الفيديو من حيث توقفت.", c: "s4" },
              ].map((x, i) => (
                <li key={x.c} className={`${s.step} ${s[x.c]}`}>
                  <span className={s.stepArt}>
                    <StepArt n={i + 1} />
                    <span className={s.stepNum}>{ar(i + 1)}</span>
                  </span>
                  <h3 className={s.stepTitle}>{x.t}</h3>
                  <p className={s.stepText}>{x.p}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ═════════ الأسئلة الشائعة ═════════ */}
        {d.settings.faq.length > 0 && (
          <section className={`${s.section} ${s.faqSec}`} aria-labelledby="faq-title" id="faq">
            <div className={`${s.wrap} ${s.faqGrid}`}>
              <div className={s.faqHead}>
                <SectionHead
                  id="faq-title"
                  icon={<MessageCircle size={16} />}
                  eyebrow="عندك سؤال؟"
                  tone="coral"
                  title="الأسئلة الشائعة"
                  sub="كل ما يهمك عن الشراء والمشاهدة والمكتبة، بإجابات مختصرة."
                />
              </div>
              <div className={s.faqList}>
                {d.settings.faq.map((f, i) => (
                  <details key={i} className={s.faq} open={i === 0}>
                    <summary>
                      <span className={s.faqQ}>{f.q}</span>
                      <span className={s.faqChev} aria-hidden>
                        <ChevronDown size={20} />
                      </span>
                    </summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </div>
              <div className={s.helpCard}>
                <span className={s.helpIcon}>
                  <MessageCircle size={26} aria-hidden />
                </span>
                <h3 className={s.h3}>ما لقيت جوابك؟</h3>
                <p>راسلنا ونساعدك في أي شيء يخص الشراء أو المشاهدة.</p>
                <a href={wa ? `https://wa.me/${wa}` : "/contact"} className={s.helpBtn}>
                  تواصل معنا
                  <ArrowLeft size={16} aria-hidden />
                </a>
              </div>
            </div>
          </section>
        )}

        {/* ═════════ دعوة ختامية ═════════ */}
        <section className={s.ctaSec} aria-labelledby="cta-title">
          <div className={s.wrap}>
            <div className={s.cta}>
              <div className={s.ctaSun} aria-hidden />
              <Sparkle className={s.ctaSpark1} color="#FFE29A" />
              <Sparkle className={s.ctaSpark2} color="#fff" />
              <div className={s.ctaText}>
                <h2 id="cta-title" className={`${s.h2} ${s.h2Light}`}>
                  جاهز تبدأ؟ <span className={s.h2Gold}>اختر صفك الآن</span>
                </h2>
                <p>الدرس الأول عليك مجانًا في كثير من الشروحات، وما تشتريه يبقى في مكتبتك.</p>
              </div>
              <ul className={s.ctaGrades}>
                {d.grades.map((g) => (
                  <li key={g.id}>
                    <Link href={`/grades/${g.slug}`} className={s.ctaGrade} style={gradeVars(g.level)}>
                      <span className={s.ctaNum} aria-hidden>
                        {ar(g.level)}
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

      {/* ═════════ التذييل ═════════ */}
      <footer className={s.footer}>
        <div className={`${s.wrap} ${s.footGrid}`}>
          <div className={s.footBrand}>
            <Link href="/" className={s.brand} aria-label={`${d.settings.site_name}: الصفحة الرئيسية`}>
              <LogoMark id="f" />
              <span className={s.brandText}>
                <b>{d.settings.site_name}</b>
                <small>{stageName}</small>
              </span>
            </Link>
            <p>{d.settings.tagline}</p>
            <p className={s.payNote}>
              <CreditCard size={18} aria-hidden />
              دفع إلكتروني آمن عبر ماي فاتورة: كي نت والبطاقات البنكية
            </p>
          </div>
          <nav aria-label="الصفوف" className={s.footCol}>
            <h3>الصفوف</h3>
            <ul>
              {d.grades.map((g) => (
                <li key={g.id}>
                  <Link href={`/grades/${g.slug}`}>{g.name}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="المنصة" className={s.footCol}>
            <h3>المنصة</h3>
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
                <Link href="/cart">السلة</Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="المساعدة" className={s.footCol}>
            <h3>المساعدة</h3>
            <ul>
              <li>
                <a href="#faq">الأسئلة الشائعة</a>
              </li>
              <li>
                <Link href="/contact">تواصل معنا</Link>
              </li>
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
        <div className={`${s.wrap} ${s.footBottom}`}>
          <p>
            © <span className="num">{new Date().getFullYear()}</span> {d.settings.site_name}. {d.settings.footer_note}
          </p>
        </div>
      </footer>
    </div>
  );
}
