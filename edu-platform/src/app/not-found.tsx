import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, Compass, House, MapPinOff } from "lucide-react";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { Sparkle } from "@/components/art";
import { ar, gradeClass } from "@/lib/design";
import { listGrades } from "@/server/catalog/public-data";

/** عنوان التبويب والسجل: «الصفحة غير موجودة | منصة فرقد» عبر قالب العنوان في التخطيط الجذري */
export const metadata: Metadata = { title: "الصفحة غير موجودة", robots: { index: false } };

/** بطاقات «٤٠٤» المائلة بألوان الصفوف (مثل بطاقات الدروس في الرئيسية) */
const CARDS = [
  { d: "٤", level: 6, cls: "-rotate-[9deg] translate-y-3" },
  { d: "٠", level: 7, cls: "rotate-[2deg] -translate-y-2 z-10" },
  { d: "٤", level: 9, cls: "rotate-[10deg] translate-y-4" },
];

/**
 * notFound() داخل صفحات (site) أو القارئ أو لوحة الإدارة يُعرض داخل تخطيطها (رأس/تذييل/‏main موجودة مسبقًا)،
 * أما الروابط غير الموجودة إطلاقًا فتُعرض هنا بلا تخطيط. نميّز الحالتين بالمسار (x-pathname من proxy)
 * حتى لا يتكرر الرأس والتذييل ولا يتداخل عنصرا main.
 */
const NESTED = [
  /^\/(login|register|forgot-password|reset-password|account|bundles|cart|checkout|contact|library|privacy|refund-policy|teachers|terms)\/?$/,
  /^\/(grades|products|stages|teachers|orders)\/[^/]+\/?$/,
  /^\/grades\/[^/]+\/[^/]+\/?$/,
  /^\/(read|preview|watch)\/[^/]+\/?$/,
  /^\/admin(\/|$)/,
];

export default async function NotFound() {
  const [grades, h] = await Promise.all([listGrades().catch(() => []), headers()]);
  const path = h.get("x-pathname") ?? "";
  const nested = NESTED.some((r) => r.test(path));
  const Main = nested ? "div" : "main";
  return (
    <>
      {nested ? null : <SiteHeader />}
      <Main id={nested ? undefined : "main"} className="bg-sunny bg-dots relative overflow-hidden">
        <Sparkle className="animate-twinkle absolute end-[8%] top-12 size-6" />
        <Sparkle className="animate-twinkle absolute start-[6%] bottom-24 size-4 [animation-delay:1.2s]" color="#17A398" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:py-24">
          {/* الرسم */}
          <div className="relative mx-auto w-full max-w-md lg:order-2" aria-hidden>
            <span className="absolute inset-x-[12%] top-1/2 aspect-square -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_40%_40%,#fff0bf,#ffc531_60%)] opacity-70 shadow-[0_0_0_28px_rgb(255_197_49/0.14),0_0_0_60px_rgb(255_197_49/0.07)]" />
            <div className="relative flex items-center justify-center gap-2 py-6 sm:gap-3" dir="ltr">
              {CARDS.map((c, i) => (
                <div key={i} className={`${gradeClass(c.level)} ${c.cls} rounded-[1.6rem] bg-white p-1.5 shadow-[0_28px_48px_-24px_rgb(0_0_0/0.5)] sm:rounded-[1.9rem] sm:p-2`}>
                  <div className="poster poster-grade grid h-32 w-24 place-items-center rounded-[1.3rem] sm:h-44 sm:w-32 sm:rounded-[1.5rem]">
                    {c.d === "٠" ? (
                      <span className="block size-7 rotate-45 rounded-[0.55rem] bg-white shadow-[0_6px_0_var(--d),0_14px_24px_rgb(0_0_0/0.25)] sm:size-10 sm:rounded-[0.7rem]" />
                    ) : (
                      <span className="font-display text-[4.6rem] leading-none font-black text-white [text-shadow:0_6px_0_var(--d),0_14px_24px_rgb(0_0_0/0.25)] sm:text-[6.5rem]">{c.d}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 px-1 pt-1.5 pb-0.5">
                    <span className="h-1.5 w-8 rounded-full bg-[var(--soft)] sm:w-12" />
                    <span className="ms-auto h-1.5 w-4 rounded-full bg-[var(--a)] sm:w-6" />
                  </div>
                </div>
              ))}
            </div>
            <span className="absolute -bottom-2 start-[12%] grid size-14 place-items-center rounded-2xl bg-white text-brand-700 shadow-lift sm:size-16">
              <Compass className="size-8 animate-spin-slow" />
            </span>
          </div>

          {/* النص */}
          <div className="min-w-0 text-center lg:text-start">
            <span className="eyebrow-pill eyebrow-coral">
              <span className="eyebrow-icon">
                <MapPinOff aria-hidden />
              </span>
              خطأ ٤٠٤
            </span>
            <h1 className="h-display mt-4">
              الصفحة <span className="text-hl">غير موجودة</span>
            </h1>
            <p className="lead mx-auto mt-4 max-w-lg lg:mx-0">ربما نُقلت أو لم تعد متاحة. ابدأ من صفك وستجد ما تبحث عنه.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link href="/#grades" className="btn btn-3d btn-primary btn-lg">
                اختر صفك
                <ArrowLeft aria-hidden />
              </Link>
              <Link href="/" className="btn btn-3d btn-outline btn-lg">
                <House aria-hidden />
                الصفحة الرئيسية
              </Link>
            </div>
          </div>
        </div>

        {grades.length ? (
          <nav aria-labelledby="nf-grades" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
            <div className="panel panel-rainbow px-5 pt-9 pb-6 sm:px-8">
              <h2 id="nf-grades" className="font-display text-[1.25rem] font-black text-ink">
                أو انتقل مباشرة إلى صفك
              </h2>
              <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {grades.map((g) => (
                  <li key={g.id} className="min-w-0">
                    <Link href={`/grades/${g.slug}`} className={`${gradeClass(g.level)} tile-3d flex min-h-16 flex-col items-center gap-2 p-3 text-center sm:flex-row sm:gap-3 sm:p-2.5 sm:pe-4 sm:text-start`}>
                      <span className="num-tile size-11 bg-[linear-gradient(145deg,var(--b),var(--d)_55%,var(--tink))] text-[1.4rem] [text-shadow:0_2px_0_rgb(0_0_0/0.22)]" aria-hidden>
                        {ar(g.level)}
                      </span>
                      <span className="min-w-0 font-display text-[1rem] leading-snug font-black text-ink">{g.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        ) : null}
      </Main>
      {nested ? null : <SiteFooter />}
    </>
  );
}
