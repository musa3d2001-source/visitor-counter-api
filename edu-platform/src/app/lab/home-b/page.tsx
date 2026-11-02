import "@fontsource-variable/readex-pro";
import Link from "next/link";
import { Play, ShoppingCart } from "lucide-react";
import { ARABIC_DIGITS, labData, minutes } from "../data";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import s from "./b.module.css";

export const dynamic = "force-dynamic";

/** الاتجاه B — «الحصة»: المعلم وهو يشرح هو البطل، ثم رفوف الدروس */
export default async function HomeB() {
  const d = await labData();
  const lead = d.reviews[0] ?? d.videos[0];
  const shelves = [
    { title: "قبل الاختبار", items: d.reviews },
    { title: "شرح الوحدات والدورات", items: d.videos.filter((v) => v.type === "unit" || v.type === "video_course") },
  ].filter((x) => x.items.length);
  return (
    <div className={s.page} dir="rtl">
      <div className={s.board}>
        <header className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <Link href="/lab/home-b" className={`${s.head} text-2xl`}>
            درب
          </Link>
          <nav className="hidden gap-5 text-sm md:flex" aria-label="التنقل الرئيسي">
            <a href="#shelves">الدروس</a>
            <a href="#teachers">المعلمون</a>
            <a href="#bundles">الباقات</a>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <a href="/cart" className="grid size-11 place-items-center" aria-label="السلة">
              <ShoppingCart className="size-5" aria-hidden />
            </a>
            <a href="/login" className={`${s.btn} ${s.btnChalk}`}>
              دخول
            </a>
          </div>
        </header>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-8 pb-14 md:grid-cols-[1fr_1.15fr] md:pt-14">
          <div>
            <h1 className={s.heroTitle}>اسمع الشرح من معلمك، وراجع قبل الاختبار بدقائق.</h1>
            <p className="mt-5 max-w-md leading-8 text-[color:var(--chalk-dim)]">دروس مسجلة لكل وحدة ومراجعات مركزة، مع مذكرات للطباعة. أول درس من كل شرح مجاني.</p>
            <div className={`${s.gradePills} mt-8 flex flex-wrap gap-2`}>
              {d.grades.map((g) => (
                <Link key={g.id} href={`/grades/${g.slug}`}>
                  {g.name}
                </Link>
              ))}
            </div>
          </div>
          {lead ? (
            <Link href={lead.previewLessonId ? `/watch/${lead.id}?lesson=${lead.previewLessonId}` : `/products/${lead.slug}`} className={s.screen}>
              <span className={s.screenSubject}>{lead.subjectName}</span>
              <span className={s.teacherTag}>
                <span className={s.dot}>{(lead.teacherName ?? "د").replace(/^أ\.\s*/, "").charAt(0)}</span>
                {lead.teacherName}
              </span>
              <span className={s.bigPlay}>
                <Play className="size-4 fill-current" aria-hidden /> شاهد المعاينة
              </span>
            </Link>
          ) : null}
        </section>
      </div>

      <main className="mx-auto max-w-6xl px-5">
        <div id="shelves" className="space-y-12 py-14">
          {shelves.map((sh) => (
            <section key={sh.title}>
              <h2 className={`${s.head} mb-4 text-2xl`}>{sh.title}</h2>
              <ul className={s.shelf}>
                {sh.items.map((p) => (
                  <li key={p.id} className={s.tile}>
                    <Link href={`/products/${p.slug}`}>
                      <span className={s.tilePoster}>
                        {p.subjectName}
                        {p.totalDurationSeconds ? <span className={`${s.dur} num`}>{minutes(p.totalDurationSeconds)}</span> : null}
                      </span>
                      <span className={`${s.tileTitle} mt-2 block`}>{p.title}</span>
                      <span className={`${s.stone} text-sm`}>
                        {PRODUCT_TYPE_LABELS[p.type]}، <span className="num">{filsToKwdString(p.priceFils)}</span> د.ك
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <section id="teachers" className="pb-14">
          <h2 className={`${s.head} mb-4 text-2xl`}>المعلمون</h2>
          <div className={s.teacherRow}>
            {d.teachers.map((t) => (
              <Link key={t.id} href={`/teachers/${t.slug}`} className={s.teacher}>
                <span className={`${s.head} block text-lg`}>{t.name}</span>
                <span className={`${s.stone} text-sm`}>
                  {ARABIC_DIGITS(t.videoCount)} دروس مرئية
                </span>
              </Link>
            ))}
          </div>
        </section>
        <section id="bundles" className="grid gap-4 pb-20 md:grid-cols-3">
          {d.bundles.slice(0, 3).map((b) => (
            <Link key={b.id} href={`/products/${b.slug}`} className={s.bundle}>
              <span className={`${s.head} block text-lg`}>{b.title}</span>
              <span className={`${s.stone} mt-1 block text-sm`}>{b.summary}</span>
              <span className="mt-4 block text-xl font-bold">
                <span className="num">{filsToKwdString(b.priceFils)}</span> د.ك
              </span>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
