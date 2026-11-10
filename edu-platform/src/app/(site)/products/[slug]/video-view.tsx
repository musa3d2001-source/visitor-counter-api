import Link from "next/link";
import { BookOpenText, CirclePlay, Clock3, GraduationCap, Layers, Library, ListVideo, MonitorSmartphone, Play, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { PlaylistGroup, ProductCard, ProductDetail, PublicFileInfo } from "@/server/catalog/queries";
import { libraryNote, paymentClaims, productLibraryLine, type PaymentPublicState } from "@/lib/site-truth";
import { AddToCart } from "@/components/site/add-to-cart";
import { ProductGrid } from "@/components/site/product-card";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { SubjectIcon } from "@/components/art";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { count, duration, gradeClass, gradeLevelFromSlug, toneClass, W } from "@/lib/design";
import { formatDate } from "@/lib/utils";
import { GlassChip, HeroStat, HeroStats, ProductHero } from "./_components/hero";
import { BundleFanArt, VideoPosterArt } from "./_components/hero-art";
import { MobileBuyBar, ProductUnavailableNotice, PurchasePanel, SaleEndedNotice, VideoClosedNotice, type TrustItem } from "./_components/purchase";
import { FileList, LearnList, SectionPanel, WideHead } from "./_components/sections";
import { LessonTimeline } from "./_components/lesson-timeline";
import { aboutTitle, includesLabel, shortTermLabel } from "./_components/labels";

export function accessPeriodText(p: Pick<ProductDetail, "accessMode" | "accessUntil" | "accessDays">): string {
  if (p.accessMode === "until_date" && p.accessUntil) return `حتى ${formatDate(p.accessUntil)}`;
  if (p.accessMode === "days" && p.accessDays) {
    const d = p.accessDays;
    const days = d === 1 ? "يوم واحد" : d === 2 ? "يومان" : count(d, W.day);
    return `${days} من تاريخ الشراء`;
  }
  return "بلا تاريخ انتهاء";
}

/** ضمانات صحيحة لمنتج الفيديو، تتبع حال الدفع الفعلية */
function videoTrust(payment: PaymentPublicState): TrustItem[] {
  const paymentLine = paymentClaims(payment).productLine;
  const libraryLine = productLibraryLine(payment, false);
  return [
    ...(paymentLine ? [{ icon: <ShieldCheck aria-hidden />, text: paymentLine, bg: "#DEF8EE", fg: "#0A6F52" }] : []),
    ...(libraryLine ? [{ icon: <Library aria-hidden />, text: libraryLine, bg: "#FFF0C7", fg: "#6E4700" }] : []),
    { icon: <MonitorSmartphone aria-hidden />, text: "تكمل من حيث توقفت على أي جهاز", bg: "#E8EEFF", fg: "#2B33B5" },
  ];
}

/** صفحة منتج الفيديو (درس/وحدة/مراجعة/دورة/باقة فيها فيديوهات) */
export function VideoProductView({
  payment,
  product,
  playlist,
  included,
  bundles,
  bundleItems,
  files,
  owned,
  isOwned,
  ownedUntil,
  resumeLessonId,
  watchedIds,
  canBuy,
  videoClosed,
  unavailable,
  breadcrumbs,
}: {
  payment: PaymentPublicState;
  product: ProductDetail;
  playlist: PlaylistGroup[];
  included: ProductCard[];
  bundles: ProductCard[];
  /** محتويات الباقات التي تضم هذا المنتج (لتلوين أوراقها بموادها الحقيقية) */
  bundleItems?: Map<string, ProductCard[]>;
  files: PublicFileInfo[];
  owned: Set<string>;
  isOwned: boolean;
  ownedUntil: Date | null;
  resumeLessonId: string | null;
  watchedIds: Set<string>;
  canBuy: boolean;
  /** الفيديو مغلق: لا بيع ولا معاينات، ومن اشترى يكمل المشاهدة */
  videoClosed: boolean;
  /** توقف بيعه لعيب تعالجه الإدارة */
  unavailable: boolean;
  breadcrumbs: { label: string; href?: string }[];
}) {
  const lessons = playlist.flatMap((g) => g.lessons);
  const firstLesson = lessons[0]?.id ?? null;
  const itemsValue = included.reduce((s, i) => s + i.priceFils, 0);
  const contents = product.contents.split("\n").map((l) => l.trim()).filter(Boolean);
  const mainFiles = files.filter((f) => f.kind === "main");
  const watchHref = `/watch/${product.id}${resumeLessonId ?? firstLesson ? `?lesson=${resumeLessonId ?? firstLesson}` : ""}`;
  const previewHref = product.previewLessonId && !videoClosed ? `/watch/${product.id}?lesson=${product.previewLessonId}` : null;
  const isBundle = product.type === "bundle";
  const level = gradeLevelFromSlug(product.gradeSlug);
  const tone = isBundle ? gradeClass(level) : toneClass(product.subjectSlug);
  const typeLabel = PRODUCT_TYPE_LABELS[product.type];
  const term = shortTermLabel(product.term);
  const watchLabel = resumeLessonId ? "تابع المشاهدة" : "ابدأ المشاهدة";
  const totalDur = duration(product.totalDurationSeconds);

  const play = isOwned
    ? { href: watchHref, label: watchLabel, testId: "continue-watching" }
    : previewHref
      ? { href: previewHref, label: "شاهد المعاينة المجانية", testId: "watch-preview" }
      : null;

  return (
    <>
      <ProductHero
        toneClass={tone}
        breadcrumbs={breadcrumbs}
        title={product.title}
        summary={product.summary}
        chips={
          <>
            <span className="chip chip-white">
              {isBundle ? <Layers aria-hidden /> : <CirclePlay aria-hidden />}
              {typeLabel}
            </span>
            <GlassChip icon={<GraduationCap aria-hidden />}>{product.gradeName}</GlassChip>
            {product.subjectName ? <GlassChip icon={<SubjectIcon slug={product.subjectSlug} size={16} />}>{product.subjectName}</GlassChip> : null}
            {term ? <GlassChip>{term}</GlassChip> : null}
            {previewHref && !isOwned ? (
              <span className="chip chip-gold">
                <Sparkles aria-hidden /> معاينة مجانية
              </span>
            ) : null}
          </>
        }
        art={
          isBundle ? (
            <BundleFanArt level={level} items={included} priceFils={product.priceFils} compareAtPriceFils={isOwned ? null : product.compareAtPriceFils} />
          ) : (
            <VideoPosterArt
              subjectSlug={product.subjectSlug}
              coverUrl={product.coverUrl}
              typeLabel={typeLabel}
              teacherName={product.teacher?.name ?? product.teacherName}
              teacherPhotoUrl={product.teacher?.photoUrl ?? product.teacherPhotoUrl}
              priceFils={product.priceFils}
              compareAtPriceFils={isOwned ? null : product.compareAtPriceFils}
              play={play}
              lessonsText={product.lessonCount > 0 ? count(product.lessonCount, W.lesson) : null}
              hasPreview={!!previewHref && !isOwned}
            />
          )
        }
      >
        {product.lessonCount > 0 || included.length ? (
          <HeroStats>
            {product.lessonCount > 0 ? <HeroStat icon={<ListVideo aria-hidden />}>{count(product.lessonCount, W.lesson)}</HeroStat> : null}
            {totalDur ? <HeroStat icon={<Clock3 aria-hidden />}>{totalDur}</HeroStat> : null}
            {included.length ? <HeroStat icon={<Layers aria-hidden />}>{includesLabel(included.length)}</HeroStat> : null}
          </HeroStats>
        ) : null}
        {product.teacher ? (
          <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/22 bg-white/12 p-3 sm:max-w-[34rem]">
            <TeacherAvatar name={product.teacher.name} photoUrl={product.teacher.photoUrl} size={56} subjectSlug={product.subjectSlug} ring decorative />
            <div className="min-w-0 flex-[1_1_10rem]">
              <p className="text-xs font-bold text-white/80">المعلم</p>
              <p className="font-display text-lg leading-snug font-black text-white">{product.teacher.name}</p>
              {product.teacher.headline ? <p className="text-sm leading-6 text-white/85">{product.teacher.headline}</p> : null}
            </div>
            {product.teacher.slug ? (
              <Link prefetch={false} href={`/teachers/${product.teacher.slug}`} data-testid="teacher-link" className="btn btn-3d btn-light btn-md shrink-0">
                صفحة المعلم
              </Link>
            ) : null}
          </div>
        ) : null}
      </ProductHero>

      <div className={`${tone} mt-8 grid gap-8 lg:mt-0 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_24.5rem]`}>
        {/* لوح الشراء: بعد البطل مباشرة على الجوال، ولاصق يسارًا متداخلًا مع البطل على الحاسوب */}
        <aside className="relative z-10 h-full lg:col-start-2 lg:row-start-1 lg:-mt-24 lg:me-6 xl:me-8" aria-label="الشراء">
          <div className="lg:sticky lg:top-24">
            <PurchasePanel
              toneClass={tone}
              typeIcon={isBundle ? <Layers aria-hidden /> : <CirclePlay aria-hidden />}
              typeLabel={typeLabel}
              gradeName={[product.gradeName, product.subjectName].filter(Boolean).join(" · ")}
              priceFils={product.priceFils}
              compareAtPriceFils={product.compareAtPriceFils}
              bundleSaving={included.length && itemsValue > product.priceFils ? { fils: itemsValue - product.priceFils, label: "مقارنة بالشراء المنفرد" } : null}
              owned={isOwned ? { until: ownedUntil, href: watchHref, label: watchLabel, icon: <Play className="fill-current" aria-hidden /> } : null}
              buy={canBuy ? <AddToCart productId={product.id} /> : product.saleEnded ? <SaleEndedNotice /> : videoClosed ? <VideoClosedNotice /> : unavailable ? <ProductUnavailableNotice /> : null}
              hidePrice={unavailable}
              preview={!isOwned && previewHref ? { href: previewHref, label: "شاهد المعاينة المجانية", icon: <Play className="fill-current" aria-hidden /> } : null}
              accessText={accessPeriodText(product)}
              trust={videoClosed || unavailable ? [] : videoTrust(payment)}
            />
          </div>
        </aside>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1 lg:pt-8">
          {contents.length ? (
            <SectionPanel id="learn" title="ماذا ستتعلم" icon={<Zap aria-hidden />}>
              <LearnList items={contents} />
            </SectionPanel>
          ) : null}

          {product.description ? (
            <SectionPanel id="about" title={aboutTitle(product.type)} icon={<BookOpenText aria-hidden />}>
              <p className="max-w-[68ch] text-[1.05rem] leading-9 whitespace-pre-line text-ink-soft">{product.description}</p>
            </SectionPanel>
          ) : null}

          {/* جدول الدروس: الترقيم هنا تسلسل فعلي لترتيب المشاهدة */}
          {playlist.length ? (
            <SectionPanel
              id="lessons-title"
              title="الدروس"
              icon={<ListVideo aria-hidden />}
              aside={
                <>
                  <span className="chip">{count(lessons.length, W.lesson)}</span>
                  {totalDur ? (
                    <span className="chip">
                      <Clock3 aria-hidden /> {totalDur}
                    </span>
                  ) : null}
                </>
              }
            >
              <LessonTimeline
                productId={product.id}
                isOwned={isOwned}
                freeOpen={!videoClosed}
                watchedIds={watchedIds}
                groups={playlist.map((g) => ({
                  key: g.key,
                  // مجموعة وحيدة باسم المنتج أو بالاسم الاحتياطي «الدروس» تكرّر عنوان القسم، فلا تُعنون
                  title: playlist.length > 1 || (g.title !== product.title && g.title !== "الدروس") ? g.title : null,
                  lessons: g.lessons,
                }))}
              />
            </SectionPanel>
          ) : null}

          {mainFiles.length ? (
            <SectionPanel id="files" title="ملفات مرفقة" icon={<BookOpenText aria-hidden />}>
              <FileList files={mainFiles.map((f) => ({ id: f.id, title: f.title, pages: f.pageCount ? count(f.pageCount, W.page) : null }))} />
            </SectionPanel>
          ) : null}

        </div>
      </div>

      {included.length ? (
        <section className="mt-16" aria-labelledby="included">
          <WideHead
            id="included"
            eyebrow={isBundle ? count(included.length, W.product) : "اشترِ جزءًا وحده"}
            eyebrowIcon={<Layers aria-hidden />}
            tone="eyebrow-violet"
            title={isBundle ? "محتويات الباقة" : "أجزاء الدورة"}
            sub={isBundle ? (libraryNote(payment, "bundleContents") ?? undefined) : "تحتاج جزءًا واحدًا فقط؟ كل جزء متاح للشراء وحده."}
          />
          <ProductGrid products={included} ownedIds={owned} />
        </section>
      ) : null}

      {bundles.length ? (
        <section className="mt-16" aria-labelledby="in-bundles">
          <WideHead
            id="in-bundles"
            eyebrow="وفّر أكثر"
            eyebrowIcon={<Sparkles aria-hidden />}
            tone="eyebrow-gold"
            title="متوفر أيضًا ضمن باقة"
            sub="الباقة تضم هذا المحتوى مع محتوى آخر. قارن ما تشمله قبل الاختيار."
          />
          <ProductGrid products={bundles} ownedIds={owned} itemsById={bundleItems} />
        </section>
      ) : null}

      {!isOwned && canBuy ? <MobileBuyBar productId={product.id} priceFils={product.priceFils} compareAtPriceFils={product.compareAtPriceFils} accessText={accessPeriodText(product)} /> : null}
    </>
  );
}
