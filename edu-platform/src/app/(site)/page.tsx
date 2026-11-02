import Link from "next/link";
import { ArrowLeft, BadgePercent, CircleCheck, Eye, Layers, Lock, PlayCircle, Smartphone, Zap } from "lucide-react";
import { gradeStats, latestVideoProducts, listProducts, listStages, listTeachers } from "@/server/catalog/queries";
import { getSettings } from "@/server/platform/settings";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { ProductGrid } from "@/components/site/product-card";
import { VideoGrid } from "@/components/site/video-card";
import { TeacherGrid } from "@/components/site/teacher-card";
import { ProductCover } from "@/components/site/product-cover";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function HomePage() {
  const [stages, stats, latestAll, bundles, settings, user, videos, teachers] = await Promise.all([
    listStages(),
    gradeStats(),
    listProducts({ excludeType: "bundle", order: "latest", limit: 24 }),
    listProducts({ type: "bundle", limit: 4 }),
    getSettings(),
    getCurrentUser(),
    latestVideoProducts(8),
    listTeachers({ limit: 8 }),
  ]);
  // قسم المذكرات يعرض ملفات PDF فقط (الفيديو له قسمه الخاص في الأعلى)
  const latest = latestAll.filter((p) => !p.isVideo).slice(0, 8);
  const owned = user ? await accessibleProductIds(user.id) : undefined;
  const visibleStages = stages.filter((s) => s.grades.length > 0);
  const showcase = (videos.length >= 3 ? videos : latest).slice(0, 3);

  return (
    <>
      {/* البطل */}
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-brand-50 to-canvas">
        <div className="pointer-events-none absolute -start-32 -top-32 size-96 rounded-full bg-brand-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -end-24 bottom-0 size-80 rounded-full bg-accent-100/60 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-[1.15fr_1fr] md:py-20">
          <div className="animate-fade-up">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-surface px-3 py-1 text-xs font-semibold text-brand-700">
              <span className="size-1.5 rounded-full bg-accent-600" /> {settings.tagline}
            </p>
            <h1 className="text-3xl leading-[1.35] font-bold text-balance text-ink sm:text-4xl md:text-[2.75rem]">{settings.hero_title}</h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-ink-soft sm:text-lg">{settings.hero_subtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href="#grades">
                  ابدأ المذاكرة <ArrowLeft aria-hidden />
                </a>
              </Button>
              {user ? (
                <Button asChild size="lg" variant="outline">
                  <Link href="/library">مكتبتي</Link>
                </Button>
              ) : (
                <Button asChild size="lg" variant="outline">
                  <Link href="/bundles">تصفح الباقات</Link>
                </Button>
              )}
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
              <li className="flex items-center gap-1.5"><CircleCheck className="size-4 text-success" aria-hidden /> شروحات فيديو ومذكرات</li>
              <li className="flex items-center gap-1.5"><CircleCheck className="size-4 text-success" aria-hidden /> معاينة مجانية قبل الشراء</li>
              <li className="flex items-center gap-1.5"><CircleCheck className="size-4 text-success" aria-hidden /> وصول فوري بعد الدفع</li>
              <li className="flex items-center gap-1.5"><CircleCheck className="size-4 text-success" aria-hidden /> دفع آمن بكي نت</li>
            </ul>
          </div>
          {showcase.length ? (
            <div className="relative mx-auto hidden h-[360px] w-full max-w-sm md:block" aria-hidden>
              {showcase.map((p, i) => (
                <div
                  key={p.id}
                  className="absolute w-52 overflow-hidden rounded-2xl border-4 border-surface shadow-lift"
                  style={{
                    insetInlineStart: `${i * 70}px`,
                    top: `${[40, 0, 60][i]}px`,
                    transform: `rotate(${[-6, 2, 8][i]}deg)`,
                    zIndex: [2, 3, 1][i],
                  }}
                >
                  <ProductCover coverUrl={p.coverUrl} title={p.title} type={p.type} subjectName={p.subjectName} gradeName={p.gradeName} sizes="208px" />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* الدروس المرئية — عنصر أساسي في المنصة */}
      {videos.length ? (
        <section className="mx-auto max-w-6xl px-4 pt-14" aria-labelledby="videos-title">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 id="videos-title" className="flex items-center gap-2 text-2xl font-bold">
                <PlayCircle className="size-6 text-accent-600" aria-hidden /> أحدث الدروس المرئية
              </h2>
              <p className="mt-1.5 text-sm text-muted">شرح الوحدات ومراجعات الاختبارات بالفيديو — شاهد المعاينة مجانًا</p>
            </div>
          </div>
          <VideoGrid products={videos} ownedIds={owned} />
        </section>
      ) : null}

      {/* اختيار الصف */}
      <section id="grades" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-14">
        <SectionTitle title="اختر صفك الدراسي" subtitle="كل المذكرات والنماذج مرتبة حسب الصف والمادة" />
        {visibleStages.length === 0 ? (
          <EmptyState icon={<Layers />} title="المحتوى قيد التجهيز" description="نعمل حاليًا على تجهيز المذكرات، تابعنا قريبًا." />
        ) : (
          <div className="space-y-10">
            {visibleStages.map((stage) => (
              <div key={stage.id}>
                <div className="mb-4 flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-bold text-brand-800">{stage.name}</h3>
                  <span className="text-sm text-muted">{stage.description}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                  {stage.grades.map((g) => {
                    const st = stats.get(g.id);
                    return (
                      <Link
                        key={g.id}
                        href={`/grades/${g.slug}`}
                        className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
                      >
                        <span className="num absolute -end-3 -top-6 text-[6.5rem] leading-none font-bold text-brand-50 transition-colors group-hover:text-brand-100" aria-hidden>
                          {g.level}
                        </span>
                        <div className="relative">
                          <p className="text-xl font-bold">{g.name}</p>
                          <p className="mt-1 text-sm text-muted">
                            {st ? (
                              <>
                                <span className="num">{st.subjects}</span> مواد · <span className="num">{st.products}</span> منتج
                              </>
                            ) : (
                              "قريبًا"
                            )}
                          </p>
                          <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                            تصفح المواد <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* المعلمون */}
      {teachers.length ? (
        <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="teachers-title">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 id="teachers-title" className="text-2xl font-bold">تعلّم مع نخبة المعلمين</h2>
              <p className="mt-1.5 text-sm text-muted">اختر معلمك وتابع شروحاته ومراجعاته لكل اختبار</p>
            </div>
            <Link href="/teachers" className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">
              كل المعلمين
            </Link>
          </div>
          <TeacherGrid teachers={teachers} />
        </section>
      ) : null}

      {/* أحدث المذكرات */}
      {latest.length ? (
        <section className="mx-auto max-w-6xl px-4 pt-16">
          <SectionTitle title="أحدث المذكرات والنماذج" subtitle="ملفات PDF منظمة لكل مادة" />
          <ProductGrid products={latest} ownedIds={owned} />
        </section>
      ) : null}

      {/* الباقات */}
      {bundles.length ? (
        <section className="mx-auto max-w-6xl px-4 pt-16">
          <SectionTitle
            title="الباقات والعروض"
            subtitle="وفّر أكثر عند شراء المذكرات معًا"
            action={
              <Link href="/bundles" className="text-sm font-semibold text-brand-700 hover:underline">
                كل الباقات
              </Link>
            }
          />
          <ProductGrid products={bundles} ownedIds={owned} />
        </section>
      ) : null}

      {/* المزايا */}
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <SectionTitle title="لماذا تختار منصتنا؟" subtitle="صممنا المنصة لتكون أسهل طريق لمذكرتك" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { Icon: PlayCircle, t: "شرح بالفيديو", d: "دروس مسجلة لكل وحدة ومراجعات قبل كل اختبار، تكمل من حيث توقفت." },
            { Icon: Eye, t: "عاين قبل أن تشتري", d: "شاهد درسًا مجانيًا أو افتح صفحات من المذكرة وتأكد أنها تناسبك." },
            { Icon: Zap, t: "وصول فوري", d: "بعد تأكيد الدفع تظهر المذكرة مباشرة في مكتبتك." },
            { Icon: Lock, t: "دفع آمن", d: "الدفع عبر بوابة MyFatoorah المعتمدة، ولا نخزن بيانات بطاقتك." },
            { Icon: Smartphone, t: "على أي جهاز", d: "شاهد دروسك واقرأ مذكراتك من الجوال أو الآيباد أو الكمبيوتر." },
            { Icon: BadgePercent, t: "باقات توفّر عليك", d: "اشترِ الوحدة أو الدورة أو باقة المادة كاملة بسعر أقل." },
          ].map(({ Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-line bg-surface p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <Icon className="size-5.5" aria-hidden />
              </span>
              <h3 className="mt-4 font-bold">{t}</h3>
              <p className="mt-1.5 text-sm leading-7 text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* طريقة الاستخدام */}
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <div className="rounded-3xl bg-brand-800 px-6 py-10 text-white sm:px-10">
          <h2 className="text-2xl font-bold">أربع خطوات وتبدأ</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {["اختر صفك الدراسي", "اختر المادة والمعلم", "عاين مجانًا وادفع بأمان", "شاهد وذاكر من مكتبتك"].map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="num grid size-10 shrink-0 place-items-center rounded-full bg-accent-600 font-bold text-ink">{i + 1}</span>
                <span className="font-semibold">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* الأسئلة الشائعة */}
      {settings.faq.length ? (
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pt-16">
          <SectionTitle title="الأسئلة الشائعة" />
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {settings.faq.map((f, i) => (
              <details key={i} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-7 text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
