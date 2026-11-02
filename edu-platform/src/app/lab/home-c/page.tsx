import "@fontsource/reem-kufi/arabic-500.css";
import "@fontsource/reem-kufi/arabic-600.css";
import "@fontsource/reem-kufi/arabic-700.css";
import Link from "next/link";
import { ARABIC_DIGITS, labData, minutes } from "../data";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import s from "./c.module.css";

export const dynamic = "force-dynamic";

/** الاتجاه C — «سدو»: تراث كويتي معاصر، نقشة السدو كعنصر بنيوي */
export default async function HomeC() {
  const d = await labData();
  return (
    <div className={s.page} dir="rtl">
      <section className={s.hero}>
        <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <span className={`${s.kufi} text-3xl`}>درب</span>
          <a href="/login" className={s.btn}>
            دخول
          </a>
        </header>
        <div className="mx-auto max-w-4xl px-5 py-16 text-center">
          <h1 className={s.heroTitle}>علمٌ يُنسج خيطًا خيطًا، درسًا بعد درس</h1>
          <p className="mx-auto mt-5 max-w-xl leading-8 opacity-80">شروحات فيديو ومراجعات ومذكرات لطلاب الكويت، مع نخبة من المعلمين.</p>
          <a href="#grades" className={`${s.btn} mt-8`}>
            ابدأ المذاكرة
          </a>
        </div>
      </section>
      <div className={s.band} aria-hidden />
      <main className="mx-auto max-w-6xl px-5 py-14">
        <section id="grades" className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {d.grades.map((g) => (
            <Link key={g.id} href={`/grades/${g.slug}`} className={s.grade}>
              <span className={`${s.gradeNum} block`}>{ARABIC_DIGITS(g.level)}</span>
              <span className="mt-2 block font-semibold">{g.name}</span>
            </Link>
          ))}
        </section>
        <h2 className={`${s.kufi} mt-14 mb-5 text-3xl`}>دروس مرئية</h2>
        <section className="grid gap-4 md:grid-cols-2">
          {d.videos.slice(0, 6).map((p) => (
            <Link key={p.id} href={`/products/${p.slug}`} className={s.card}>
              <span className="text-sm text-[color:var(--madder)]">{PRODUCT_TYPE_LABELS[p.type]}</span>
              <span className="block font-bold">{p.title}</span>
              <span className="text-sm opacity-75">
                {p.teacherName}، {minutes(p.totalDurationSeconds)}، <span className="num">{filsToKwdString(p.priceFils)}</span> د.ك
              </span>
            </Link>
          ))}
        </section>
        <div className={`${s.band} my-14`} aria-hidden />
        <h2 className={`${s.kufi} mb-5 text-3xl`}>المعلمون</h2>
        <section className="grid gap-4 md:grid-cols-3">
          {d.teachers.map((t) => (
            <Link key={t.id} href={`/teachers/${t.slug}`} className={s.card}>
              <span className={`${s.kufi} block text-xl`}>{t.name}</span>
              <span className="text-sm opacity-75">{t.headline}</span>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
