import Link from "next/link";
import { ArrowLeft, GraduationCap, LibraryBig, Moon, MonitorPlay, Play, PlayCircle, ShieldCheck, Sun, Users, Zap } from "lucide-react";
import type { ProductCard } from "@/server/catalog/queries";
import { Sparkle, SubjectArt, Swash } from "@/components/art";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { ar, count, countParts, gradeClass, initial, savings, toneClass, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import s from "./home.module.css";

export type HeroGrade = { id: string; slug: string; name: string; level: number };

/** يفصل آخر كلمة من العنوان (مع علامة الترقيم بعدها) لتلوينها وخط الإبراز الذهبي تحتها */
function splitTitle(title: string) {
  const m = title.trim().match(/^([\s\S]*\s)(\S+?)([.!؟?،,]*)$/u);
  if (!m || !m[1].trim()) return null;
  return { head: m[1], word: m[2], tail: m[3] };
}

/** «الصف السادس» ← «السادس» */
export const shortGrade = (name: string) => name.replace(/^الصف\s+/u, "");

/**
 * البطل: عنوان الإعدادات بكلمة مميزة، زرّان، اختصارات الصفوف الأربعة (رابط صف في الشاشة الأولى دائمًا)،
 * أرقام حقيقية، ومروحة دورات حقيقية (تركيبة مستقلة للجوال: بطاقتان كبيرتان بلا تصغير ولا قص).
 */
export function HomeHero({
  title,
  subtitle,
  tagline,
  grades,
  fan,
  previewHref,
  nightReview,
  stats,
  signedIn,
}: {
  title: string;
  subtitle: string;
  tagline: string;
  grades: HeroGrade[];
  fan: ProductCard[];
  previewHref: string | null;
  nightReview: ProductCard | null;
  stats: { lessons: number; teachers: number; grades: number };
  signedIn: boolean;
}) {
  const t = splitTitle(title);
  const fanSave = fan[0] ? savings(fan[0].priceFils, fan[0].compareAtPriceFils) : null;
  const statItems = [
    { k: "lessons", icon: <MonitorPlay aria-hidden />, c: s.siTeal, n: stats.lessons, ...countParts(stats.lessons, W.videoLesson) },
    { k: "teachers", icon: <Users aria-hidden />, c: s.siCoral, n: stats.teachers, ...countParts(stats.teachers, W.teacher) },
    { k: "grades", icon: <GraduationCap aria-hidden />, c: s.siGold, n: stats.grades, ...countParts(stats.grades, W.grade) },
  ].filter((x) => x.n > 0);

  return (
    <section className={s.hero} aria-labelledby="hero-title">
      <div className={s.heroMesh} aria-hidden />
      <div className={cn(s.wrap, s.heroGrid)}>
        <div className={s.heroText}>
          <div className={s.heroTop}>
            {tagline ? (
              <span className="glass-pill">
                <span className="eyebrow-icon !bg-[linear-gradient(135deg,#ffd25e,#ff9f43)] !text-[#6b3600]" aria-hidden>
                  <Sun size={14} />
                </span>
                {tagline}
              </span>
            ) : null}
            {signedIn ? (
              <Link href="/library" className={s.libLink}>
                <LibraryBig aria-hidden />
                افتح مكتبتك
              </Link>
            ) : null}
          </div>

          <h1 id="hero-title" className={s.h1}>
            {t ? (
              <>
                {t.head}
                <span className={s.hl}>
                  <span className={s.hlText}>{t.word}</span>
                  <Swash className={s.hlSwash} />
                </span>
                {t.tail}
              </>
            ) : (
              title
            )}
          </h1>
          {subtitle ? <p className={s.heroSub}>{subtitle}</p> : null}

          <div className={s.heroCtas}>
            <a href="#grades" className={s.btnPrimary}>
              اختر صفك وابدأ
              <span className={s.btnArrow} aria-hidden>
                <ArrowLeft size={18} />
              </span>
            </a>
            {previewHref ? (
              <Link href={previewHref} className={s.btnGhost}>
                <span className={s.btnPlay} aria-hidden>
                  <Play size={15} fill="currentColor" />
                </span>
                شاهد درسًا مجانًا
              </Link>
            ) : null}
          </div>

          {grades.length ? (
            <nav className={s.quick} aria-labelledby="quick-grades">
              <p id="quick-grades" className={s.quickLabel}>
                أو انتقل مباشرة إلى صفك
              </p>
              <ul className={s.quickList}>
                {grades.map((g) => (
                  <li key={g.id}>
                    <Link href={`/grades/${g.slug}`} className={cn(s.gbtn, gradeClass(g.level))}>
                      <span className={s.gbtnNum} aria-hidden>
                        {ar(g.level)}
                      </span>
                      <span className={s.gbtnName}>
                        <span>
                          <span className="sr-only">الصف </span>
                          {shortGrade(g.name)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {statItems.length ? (
            <ul className={s.stats} aria-label="أرقام المنصة">
              {statItems.map((x) => (
                <li key={x.k}>
                  <span className={cn(s.statIcon, x.c)}>{x.icon}</span>
                  <span className={s.statText}>
                    <b>{x.num}</b> <small>{x.label}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {fan.length ? (
          <div className={s.heroArt} aria-hidden>
            <DesktopFan fan={fan} hasPreview={Boolean(previewHref)} fanSave={fanSave} nightReview={nightReview} />
            <PhoneFan fan={fan} hasPreview={Boolean(previewHref)} />
          </div>
        ) : null}
      </div>

      <ul className={cn(s.wrap, s.trust)} aria-label="مزايا المنصة">
        <li>
          <ShieldCheck aria-hidden />
          دفع آمن بكي نت والبطاقات
        </li>
        <li>
          <Zap aria-hidden />
          يظهر في مكتبتك بعد تأكيد الدفع
        </li>
        <li>
          <PlayCircle aria-hidden />
          تكمل الفيديو من حيث توقفت
        </li>
        <li>
          <MonitorPlay aria-hidden />
          على الجوال والحاسوب
        </li>
      </ul>
    </section>
  );
}

/** المروحة ثلاثية الأبعاد: البطاقة الأمامية كاملة، وبطاقتا الخلف بلا نصوص قد تُقص خلفها */
function DesktopFan({
  fan,
  hasPreview,
  fanSave,
  nightReview,
}: {
  fan: ProductCard[];
  hasPreview: boolean;
  fanSave: { fils: number } | null;
  nightReview: ProductCard | null;
}) {
  return (
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
          {fan[2] ? <FanCard p={fan[2]} className={s.fc1} mode="bare" /> : null}
          {fan[1] ? <FanCard p={fan[1]} className={s.fc2} mode="side" /> : null}
          {fan[0] ? <FanCard p={fan[0]} className={s.fc3} mode="full" /> : null}
        </div>
        {hasPreview ? (
          <div className={cn(s.float, s.floatFree)}>
            <span className={s.floatPlay}>
              <Play size={14} fill="currentColor" />
            </span>
            <span>
              <b>معاينة مجانية</b>
              <small>شاهد قبل الشراء</small>
            </span>
          </div>
        ) : null}
        {fanSave ? (
          <div className={cn(s.float, s.floatSave)}>
            <small>وفّر</small>
            <b className="num">{filsToKwdString(fanSave.fils)}</b>
            <small>د.ك</small>
          </div>
        ) : null}
        {nightReview ? (
          <div className={cn(s.float, s.floatNight)}>
            <span className={s.floatMoon}>
              <Moon size={16} />
            </span>
            <span>
              <b>{PRODUCT_TYPE_LABELS[nightReview.type]}</b>
              <small>
                {nightReview.subjectName ? `${nightReview.subjectName} · ` : ""}
                <span className="num">{filsToKwdString(nightReview.priceFils)}</span> د.ك
              </small>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * full: كل البيانات. side (الخلفية اليمنى): الشارة واسم المادة على الجانب الظاهر فقط.
 * bare (الخلفية اليسرى، نصفها الأيمن مغطى): رسم وزر تشغيل وخطوط زخرفية بلا نص.
 */
function FanCard({ p, className, mode }: { p: ProductCard; className: string; mode: "full" | "side" | "bare" }) {
  return (
    <div className={cn(s.fanCard, toneClass(p.subjectSlug), className)}>
      <div className={s.fanPoster}>
        {mode !== "bare" ? <span className={s.fanType}>{PRODUCT_TYPE_LABELS[p.type]}</span> : null}
        <div className={s.fanArt}>
          <SubjectArt slug={p.subjectSlug} />
        </div>
        <span className={s.fanPlay}>
          <Play size={22} fill="currentColor" />
        </span>
        {mode !== "bare" && p.subjectName ? <span className={s.fanSubject}>{p.subjectName}</span> : null}
      </div>
      <div className={s.fanBody}>
        <span className={s.fanAvatar}>{initial(p.teacherName)}</span>
        {mode === "full" ? (
          <>
            <span className={s.fanMeta}>
              <b>{p.gradeName}</b>
              <small>{count(p.lessonCount, W.lesson)}</small>
            </span>
            <span className={s.fanPrice}>
              {p.priceFils === 0 ? (
                "مجانًا"
              ) : (
                <>
                  <b className="num">{filsToKwdString(p.priceFils)}</b> د.ك
                </>
              )}
            </span>
          </>
        ) : (
          <span className={s.fanBars}>
            <i />
            <i />
          </span>
        )}
      </div>
    </div>
  );
}

/** الجوال: بطاقتان متجاورتان كاملتان بخط مقروء، وملصق واحد */
function PhoneFan({ fan, hasPreview }: { fan: ProductCard[]; hasPreview: boolean }) {
  const pair = fan.slice(0, 2);
  return (
    <div className={s.pfan}>
      <div className={s.pRays} />
      <div className={s.pSun} />
      <Sparkle className={s.pSpark} />
      {pair.map((p, i) => (
        <div key={p.id} className={cn(s.pcard, i === 0 ? s.pcardA : s.pcardB, toneClass(p.subjectSlug))}>
          <div className={s.pPoster}>
            <span className={s.pType}>{PRODUCT_TYPE_LABELS[p.type]}</span>
            <div className={s.pArt}>
              <SubjectArt slug={p.subjectSlug} />
            </div>
            <span className={s.pPlay}>
              <Play size={16} fill="currentColor" />
            </span>
            {p.subjectName ? <span className={s.pSubject}>{p.subjectName}</span> : null}
          </div>
          <div className={s.pBody}>
            <b>{p.gradeName}</b>
            <span className={s.pRow}>
              <small>{count(p.lessonCount, W.lesson)}</small>
              <span>
                {p.priceFils === 0 ? (
                  "مجانًا"
                ) : (
                  <>
                    <b className="num">{filsToKwdString(p.priceFils)}</b> د.ك
                  </>
                )}
              </span>
            </span>
          </div>
        </div>
      ))}
      {hasPreview ? (
        <div className={s.pFloat}>
          <span className={s.floatPlay}>
            <Play size={13} fill="currentColor" />
          </span>
          معاينة مجانية قبل الشراء
        </div>
      ) : null}
    </div>
  );
}
