import Link from "next/link";
import { Play } from "lucide-react";
import { gradeStats, latestVideoProducts, listProducts, listStages, listTeachers, type ProductCard } from "@/server/catalog/queries";
import { getSettings } from "@/server/platform/settings";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds } from "@/server/access/entitlements";
import { ProductList, productMeta } from "@/components/site/product-card";
import { BundleRow } from "@/components/site/bundle-row";
import { TeacherGrid } from "@/components/site/teacher-card";
import { posterTone } from "@/components/site/product-cover";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { PRODUCT_TYPE_LABELS, isPdfType } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";

const arabicDigits = (n: number | string) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

/**
 * الصفحة الرئيسية «جدول الحصص»:
 * البطل هو أداة الاختيار نفسها (أرقام الصفوف)، ثم «قبل الاختبار» كأهم لحظة في عام الطالب،
 * ثم المعلمون، فالجديد، فالباقات، فالمذكرات. المحتوى صفوف قابلة للمقارنة لا شبكات بطاقات.
 */
export default async function HomePage() {
  const [stages, stats, settings, user, videos, teachers, bundles, examReviews, quizReviews, latest] = await Promise.all([
    listStages(),
    gradeStats(),
    getSettings(),
    getCurrentUser(),
    latestVideoProducts(8),
    listTeachers({ limit: 6 }),
    listProducts({ type: "bundle", limit: 4 }),
    listProducts({ type: "exam_review", limit: 4 }),
    listProducts({ type: "quiz_review", limit: 4 }),
    listProducts({ excludeType: "bundle", order: "latest", limit: 24 }),
  ]);
  const owned = user ? await accessibleProductIds(user.id) : undefined;
  const grades = stages.flatMap((s) => s.grades);
  const reviews = [...examReviews, ...quizReviews].slice(0, 5);
  const feature = reviews.find((r) => r.previewLessonId) ?? videos.find((v) => v.previewLessonId) ?? null;
  const reviewRows = reviews.filter((r) => r.id !== feature?.id);
  const newVideos = videos.filter((v) => !reviews.some((r) => r.id === v.id)).slice(0, 5);
  const notes = latest.filter((p) => isPdfType(p.type)).slice(0, 6);

  return (
    <>
      {/* البطل: العنوان + أرقام الصفوف كأداة اختيار */}
      <section className="mx-auto max-w-6xl px-4 pt-12 sm:pt-20" aria-labelledby="hero-title">
        <h1 id="hero-title" className="max-w-4xl text-[clamp(2.6rem,6.4vw,4.75rem)] leading-[1.1]">
          {settings.hero_title}
        </h1>
        <p className="mt-5 max-w-2xl text-[1.05rem] leading-8 text-ink-soft sm:text-lg sm:leading-9">{settings.hero_subtitle}</p>
        {user ? (
          <p className="mt-4 text-sm">
            <Link href="/library" className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4">
              افتح مكتبتك
            </Link>
          </p>
        ) : null}
      </section>

      <section id="grades" className="mx-auto mt-10 max-w-6xl scroll-mt-24 px-4 sm:mt-14" aria-label="اختر صفك الدراسي">
        {grades.length === 0 ? (
          <EmptyState title="المحتوى قيد التجهيز" description="نجهّز الشروحات والمذكرات الآن." />
        ) : (
          <ul className="grid grid-cols-2 border-t-2 border-ink md:grid-cols-4" data-testid="grade-picker">
            {grades.map((g) => {
              const st = stats.get(g.id);
              return (
                <li key={g.id} className="border-b border-line odd:border-e md:border-b-0 md:border-e md:last:border-e-0">
                  <Link href={`/grades/${g.slug}`} className="group flex h-full flex-col justify-between gap-4 px-3 pt-4 pb-5 transition-colors hover:bg-mist sm:px-5">
                    <span className="font-display text-[clamp(5rem,13vw,9.5rem)] leading-[0.85] font-medium text-ink transition-colors group-hover:text-brand-700" aria-hidden>
                      {arabicDigits(g.level)}
                    </span>
                    <span>
                      <span className="block text-[1.05rem] font-semibold">{g.name}</span>
                      {st ? <span className="text-sm text-muted">{arabicDigits(st.subjects)} مواد، {arabicDigits(st.products)} درسًا ومذكرة</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* قبل الاختبار: درس مميز + جدول المراجعات */}
      {feature || reviewRows.length ? (
        <section className="mt-16 bg-ink text-white sm:mt-20" aria-labelledby="before-exam">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
            <div className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
              <div>
                <h2 id="before-exam" className="text-[clamp(2rem,4vw,2.9rem)] text-white">
                  قبل الاختبار
                </h2>
                <p className="mt-2 max-w-xl leading-8 text-white/75">مراجعات مركزة للاختبارات القصيرة وليلة الاختبار. شاهد أول درس منها مجانًا قبل أن تقرر.</p>
              </div>
            </div>
            <div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
              {feature ? <FeaturePanel p={feature} /> : null}
              {reviewRows.length ? (
                <ul className="border-t border-white/15">
                  {reviewRows.map((p) => (
                    <li key={p.id} className="border-b border-white/15">
                      <Link href={`/products/${p.slug}`} className="group grid grid-cols-[1fr_auto] items-center gap-4 py-4">
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-accent-600">{PRODUCT_TYPE_LABELS[p.type]}</span>
                          <span className="mt-0.5 block leading-7 font-semibold group-hover:underline group-hover:underline-offset-4">{p.title}</span>
                          <span className="block text-sm text-white/65">{productMeta(p, { grade: true })}</span>
                        </span>
                        <span className="text-[1.05rem] font-bold whitespace-nowrap">
                          <span className="num">{filsToKwdString(p.priceFils)}</span> <span className="text-xs font-semibold text-white/65">د.ك</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* المعلمون */}
      {teachers.length ? (
        <section className="mx-auto mt-16 grid max-w-6xl gap-8 px-4 sm:mt-20 lg:grid-cols-[17rem_1fr] lg:gap-12" aria-labelledby="teachers-title">
          <div>
            <h2 id="teachers-title" className="text-[clamp(1.9rem,3.2vw,2.6rem)]">
              المعلمون
            </h2>
            <p className="mt-2 leading-8 text-muted">لكل معلم صفحة تجمع شرحه للوحدات ومراجعاته ومذكراته.</p>
            <Link href="/teachers" className="mt-4 inline-block text-sm font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4">
              كل المعلمين
            </Link>
          </div>
          <TeacherGrid teachers={teachers} columns={2} />
        </section>
      ) : null}

      {/* أضيف حديثًا */}
      {newVideos.length ? (
        <section className="mx-auto mt-16 max-w-6xl px-4 sm:mt-20" aria-labelledby="new-title">
          <h2 id="new-title" className="mb-2 text-[clamp(1.9rem,3.2vw,2.6rem)]">
            دروس أضيفت حديثًا
          </h2>
          <p className="mb-6 text-muted">شرح الوحدات والدورات الكاملة، مرتبة من الأحدث.</p>
          <ProductList products={newVideos} ownedIds={owned} showGrade />
        </section>
      ) : null}

      {/* الباقات */}
      {bundles.length ? (
        <section className="mx-auto mt-16 max-w-6xl px-4 sm:mt-20" aria-labelledby="bundles-title">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="bundles-title" className="text-[clamp(1.9rem,3.2vw,2.6rem)]">
                الباقات
              </h2>
              <p className="mt-2 text-muted">السعر الظاهر هو المبلغ الذي تدفعه، والتوفير محسوب من أسعار محتوياتها منفردة.</p>
            </div>
            <Link href="/bundles" className="text-sm font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4">
              كل الباقات
            </Link>
          </div>
          <ul className="grid gap-3">
            {bundles.slice(0, 3).map((b) => (
              <li key={b.id}>
                <BundleRow b={b} owned={owned?.has(b.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* المذكرات */}
      {notes.length ? (
        <section className="mx-auto mt-16 max-w-6xl px-4 sm:mt-20" aria-labelledby="notes-title">
          <h2 id="notes-title" className="mb-2 text-[clamp(1.9rem,3.2vw,2.6rem)]">
            مذكرات للطباعة والمراجعة
          </h2>
          <p className="mb-6 text-muted">مذكرات نهائية ونماذج اختبارات، مع معاينة لأول صفحاتها.</p>
          <ProductList products={notes} ownedIds={owned} columns={2} showGrade showTeacher={false} />
        </section>
      ) : null}

      {/* كيف تعمل — خطوات متتابعة فعلًا */}
      <section className="mx-auto mt-16 max-w-6xl px-4 sm:mt-20" aria-labelledby="how-title">
        <h2 id="how-title" className="mb-6 text-[clamp(1.9rem,3.2vw,2.6rem)]">
          كيف تبدأ
        </h2>
        <ol className="grid border-t-2 border-ink sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "اختر صفك ومادتك", d: "أو ابدأ من صفحة معلمك مباشرة." },
            { t: "شاهد المعاينة", d: "أول درس أو صفحات من المذكرة مجانًا، بلا حساب." },
            { t: "ادفع بكي نت أو بالبطاقة", d: "عبر بوابة دفع معتمدة، ولا نحتفظ ببيانات بطاقتك." },
            { t: "ذاكر من مكتبتك", d: "على الجوال أو الآيباد أو الكمبيوتر، وتكمل من حيث توقفت." },
          ].map((step, i) => (
            <li key={step.t} className="border-b border-line py-5 sm:pe-6">
              <span className="font-display text-4xl leading-none text-brand-700">{arabicDigits(i + 1)}</span>
              <p className="mt-3 font-semibold">{step.t}</p>
              <p className="mt-1 text-sm leading-7 text-muted">{step.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* الأسئلة الشائعة */}
      {settings.faq.length ? (
        <section id="faq" className="mx-auto mt-16 max-w-3xl scroll-mt-24 px-4 sm:mt-20" aria-labelledby="faq-title">
          <h2 id="faq-title" className="mb-4 text-[clamp(1.9rem,3.2vw,2.6rem)]">
            الأسئلة الشائعة
          </h2>
          <div className="border-t border-line">
            {settings.faq.map((f, i) => (
              <details key={i} className="group border-b border-line py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <span className="font-display text-2xl leading-none text-brand-700 transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-2 max-w-2xl leading-8 text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/** لوحة الدرس المميز: معاينة كبيرة بزر واضح، والمعلم والعنوان أسفلها */
function FeaturePanel({ p }: { p: ProductCard }) {
  const href = p.previewLessonId ? `/watch/${p.id}?lesson=${p.previewLessonId}` : `/products/${p.slug}`;
  return (
    <div>
      <Link href={href} className="group relative block aspect-[16/10] overflow-hidden rounded-lg" style={{ backgroundColor: posterTone(p.subjectName, p.gradeName) }} data-testid="feature-lesson">
        {p.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover opacity-80" />
        ) : (
          <span className="absolute inset-0 grid place-items-center font-display text-[clamp(3rem,8vw,5.5rem)] font-semibold text-white/95">{p.subjectName}</span>
        )}
        <span className="absolute start-4 bottom-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent-600 px-5 font-semibold text-ink transition-transform group-hover:scale-[1.03]">
          <Play className="size-4 fill-current" aria-hidden /> {p.previewLessonId ? "شاهد المعاينة" : "تفاصيل المراجعة"}
        </span>
      </Link>
      <div className="mt-4 flex items-start gap-3">
        {p.teacherName ? <TeacherAvatar name={p.teacherName} photoUrl={p.teacherPhotoUrl} size={44} className="bg-white/10 text-white" /> : null}
        <div>
          <Link href={`/products/${p.slug}`} className="text-lg leading-7 font-semibold hover:underline hover:underline-offset-4">
            {p.title}
          </Link>
          <p className="text-sm text-white/65">{productMeta(p, { grade: true })}</p>
        </div>
      </div>
    </div>
  );
}

