import "@fontsource-variable/markazi-text";
import Link from "next/link";
import { Play, ShoppingCart } from "lucide-react";
import { ARABIC_DIGITS, labData, minutes } from "../data";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import s from "./a.module.css";

export const dynamic = "force-dynamic";

/** الاتجاه A — «جدول الحصص»: الأرقام هي أداة الاختيار، والمحتوى يُعرض كجدول */
export default async function HomeA() {
  const d = await labData();
  const leadVideo = d.videos[0];
  const moreVideos = d.videos.slice(1, 5);
  return (
    <div className={s.page} dir="rtl">
      <header className={s.header}>
        <div className="mx-auto flex h-18 max-w-6xl items-center gap-8 px-5">
          <Link href="/lab/home-a" className={s.wordmark}>
            درب
          </Link>
          <nav className={`${s.nav} hidden items-center gap-6 text-[0.95rem] md:flex`} aria-label="التنقل الرئيسي">
            <a href="#grades">الصفوف</a>
            <a href="#teachers">المعلمون</a>
            <a href="#bundles">الباقات</a>
            <a href="#notes">المذكرات</a>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <a href="/cart" className="grid size-11 place-items-center" aria-label="السلة">
              <ShoppingCart className="size-5" aria-hidden />
            </a>
            <a href="/login" className={`${s.btn} ${s.btnPrimary}`}>
              دخول
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pt-12 pb-10 md:pt-20">
          <h1 className={s.heroTitle}>اختر صفك، وابدأ من الدرس الذي تحتاجه اليوم.</h1>
          <p className={`${s.heroLead} mt-5`}>
            شرح بالفيديو لكل وحدة، ومراجعات قبل الاختبارات القصيرة وليلة الاختبار، ومذكرات جاهزة للطباعة. ادفع مرة واحدة، والمحتوى في مكتبتك فورًا.
          </p>
        </section>

        <section id="grades" className="mx-auto max-w-6xl px-5" aria-label="اختر الصف">
          <div className={`${s.grades} grid grid-cols-2 md:grid-cols-4`}>
            {d.grades.map((g) => {
              const st = d.stats.get(g.id);
              return (
                <Link key={g.id} href={`/grades/${g.slug}`} className={s.grade}>
                  <span className={s.numeral} aria-hidden>
                    {ARABIC_DIGITS(g.level)}
                  </span>
                  <span>
                    <span className={`${s.gradeName} block`}>{g.name}</span>
                    {st ? <span className={s.gradeMeta}>{ARABIC_DIGITS(st.products)} درسًا ومذكرة</span> : null}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {d.reviews.length ? (
          <section className={`${s.examBand} mt-16`}>
            <div className="mx-auto max-w-6xl px-5 py-14">
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <span className={s.examFlag}>موسم الاختبارات القصيرة</span>
                  <h2 className={`${s.sectionTitle} mt-3`}>قبل الاختبار</h2>
                  <p className={`${s.sectionLead} mt-1`}>مراجعات مركزة مع معلميك — شاهد أول دقائقها مجانًا.</p>
                </div>
              </div>
              <ol>
                {d.reviews.map((p) => (
                  <li key={p.id} className={s.row}>
                    <Link href={`/products/${p.slug}`} className={s.poster} aria-label={p.title}>
                      <span className={s.posterSubject}>{p.subjectName}</span>
                      <span className={s.play} aria-hidden>
                        <Play className="size-4 fill-current" />
                      </span>
                    </Link>
                    <div className="min-w-0">
                      <p className={s.rowType}>{PRODUCT_TYPE_LABELS[p.type]}</p>
                      <Link href={`/products/${p.slug}`} className={`${s.rowTitle} block hover:underline`}>
                        {p.title}
                      </Link>
                      <p className={s.rowMeta}>
                        {p.teacherName ? `${p.teacherName}، ` : ""}
                        {p.gradeName}
                        {p.totalDurationSeconds ? `، ${minutes(p.totalDurationSeconds)}` : ""}
                      </p>
                    </div>
                    <div className={`${s.rowAction} flex items-center gap-4`}>
                      <span className={s.price}>
                        <span className="num">{filsToKwdString(p.priceFils)}</span> د.ك
                      </span>
                      {p.previewLessonId ? (
                        <Link href={`/watch/${p.id}?lesson=${p.previewLessonId}`} className={`${s.btn} ${s.btnGhostDark}`}>
                          <Play className="size-4" aria-hidden /> المعاينة
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        {d.teachers.length ? (
          <section id="teachers" className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[18rem_1fr]">
            <div>
              <h2 className={s.sectionTitle}>المعلمون</h2>
              <p className={`${s.sectionLead} mt-2 leading-8`}>كل معلم بصفحته: شرح الوحدات والمراجعات والمذكرات في مكان واحد.</p>
            </div>
            <ul className="grid md:grid-cols-2 md:gap-x-10">
              {d.teachers.map((t) => (
                <li key={t.id}>
                  <Link href={`/teachers/${t.slug}`} className={s.teacher}>
                    <span className={s.monogram} aria-hidden>
                      {t.name.replace(/^أ\.\s*/, "").trim().charAt(0)}
                    </span>
                    <span>
                      <span className={`${s.teacherName} block`}>{t.name}</span>
                      <span className="mt-1 block text-sm text-[color:var(--muted)]">{t.headline}</span>
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {t.subjects.slice(0, 3).map((x) => (
                          <span key={x.id} className={s.chip}>
                            {x.name}، {x.gradeName}
                          </span>
                        ))}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {leadVideo ? (
          <section className="mx-auto max-w-6xl px-5 pb-16">
            <h2 className={`${s.sectionTitle} mb-6`}>أضيف حديثًا</h2>
            <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
              <Link href={`/products/${leadVideo.slug}`} className={s.lead}>
                <span className={s.leadPoster}>
                  <span className="text-sm opacity-80">{PRODUCT_TYPE_LABELS[leadVideo.type]}</span>
                  <span className={s.leadPosterSubject}>{leadVideo.subjectName}</span>
                  <span className={s.play} aria-hidden>
                    <Play className="size-4 fill-current" />
                  </span>
                </span>
                <span>
                  <span className={`${s.rowTitle} block`}>{leadVideo.title}</span>
                  <span className="text-sm text-[color:var(--muted)]">
                    {leadVideo.teacherName}، {ARABIC_DIGITS(leadVideo.lessonCount)} دروس، {minutes(leadVideo.totalDurationSeconds)}
                  </span>
                </span>
              </Link>
              <ul>
                {moreVideos.map((p) => (
                  <li key={p.id} className={`${s.row} ${s.rowLight}`} style={{ gridTemplateColumns: "6rem 1fr" }}>
                    <Link href={`/products/${p.slug}`} className={s.poster}>
                      <span className={s.posterSubject} style={{ fontSize: "1.1rem" }}>
                        {p.subjectName}
                      </span>
                    </Link>
                    <span>
                      <Link href={`/products/${p.slug}`} className={`${s.rowTitle} block hover:text-[color:var(--gulf)]`}>
                        {p.title}
                      </Link>
                      <span className="text-sm text-[color:var(--muted)]">
                        <span className="num">{filsToKwdString(p.priceFils)}</span> د.ك، {p.teacherName}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {d.bundles.length ? (
          <section id="bundles" className="mx-auto max-w-6xl px-5 pb-16">
            <h2 className={`${s.sectionTitle} mb-2`}>الباقات</h2>
            <p className={`${s.sectionLead} mb-6`}>السعر الظاهر نهائي، والتوفير محسوب من أسعار المحتويات منفردة.</p>
            <div className="grid gap-3">
              {d.bundles.slice(0, 3).map((b) => (
                <Link key={b.id} href={`/products/${b.slug}`} className={s.bundle}>
                  <span>
                    <span className={`${s.rowTitle} block`}>{b.title}</span>
                    <span className="text-sm text-[color:var(--muted)]">{b.summary}</span>
                  </span>
                  <span className="text-start md:text-end">
                    <span className={`${s.price} block`}>
                      <span className="num">{filsToKwdString(b.priceFils)}</span> د.ك
                    </span>
                    {b.compareAtPriceFils ? (
                      <span className={s.save}>
                        بدل <span className={`${s.compare} num`}>{filsToKwdString(b.compareAtPriceFils)}</span>
                      </span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {d.notes.length ? (
          <section id="notes" className="mx-auto max-w-6xl px-5 pb-20">
            <h2 className={`${s.sectionTitle} mb-6`}>المذكرات النهائية</h2>
            <ul className="grid gap-x-10 md:grid-cols-2">
              {d.notes.map((n) => (
                <li key={n.id} className={`${s.rowLight} flex items-center justify-between gap-4 py-3.5`}>
                  <Link href={`/products/${n.slug}`} className="font-semibold hover:text-[color:var(--gulf)]">
                    {n.subjectName}، {n.gradeName}
                  </Link>
                  <span className="num text-sm text-[color:var(--muted)]">{filsToKwdString(n.priceFils)} د.ك</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <footer className={s.footer}>
        <div className="mx-auto max-w-6xl px-5 py-10 text-sm">
          <span className={s.wordmark} style={{ color: "#fff" }}>
            درب
          </span>
          <p className="mt-3">{d.settings.footer_note}</p>
        </div>
      </footer>
    </div>
  );
}
