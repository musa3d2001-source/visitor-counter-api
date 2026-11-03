import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronLeft, ChevronRight, Clock, FileText, Keyboard, ListVideo, LogIn, ShoppingCart, Sparkles, UserRound } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds, isTeacherOfProduct } from "@/server/access/entitlements";
import { checkLessonAccess, playbackFor } from "@/server/access/lessons";
import { getPlaylist, getProductBySlug, getProductFilesInfo, type LessonInfo } from "@/server/catalog/queries";
import { getSettings } from "@/server/platform/settings";
import { sql } from "@/server/db";
import { LessonPlayer } from "@/components/reader/lesson-player";
import { LessonsPanel } from "@/components/reader/lessons-panel";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { LogoMark, Sparkle, SubjectIcon } from "@/components/art";
import { Price } from "@/components/ui/price";
import { lessonsLabel } from "@/components/site/format";
import { ar, count, duration, shortName, toneClass, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { LessonRows } from "./_components/lesson-rows";
import { LockedStage, StageFrame, StageNotice } from "./_components/stage-parts";

export const metadata: Metadata = { title: "مشاهدة الدرس", robots: { index: false, follow: false } };

type Search = { lesson?: string };

export default async function WatchPage({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<Search> }) {
  const { productId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(productId)) notFound();
  const [product] = await sql<{ id: string; slug: string; title: string; status: string }[]>`
    select id, slug, title, status from products where id = ${productId}
  `;
  if (!product) notFound();

  const user = await getCurrentUser();
  const staff = user?.role === "admin" || (user?.role === "teacher" && (await isTeacherOfProduct(user.id, product.id)));
  const owned = user ? await accessibleProductIds(user.id) : new Set<string>();
  const ownsRoot = owned.has(product.id);
  // المنتجات غير المنشورة: للمالك والمعلم المسؤول، أو لمن اشتراها سابقًا (مخفية لاحقًا)
  if (product.status !== "published" && !staff && !ownsRoot) notFound();

  const settings = await getSettings();
  const playlist = await getPlaylist(product.id, { includeUnready: staff });
  const lessons: LessonInfo[] = playlist.flatMap((g) => g.lessons);
  // بيانات العرض فقط (المادة والصف والمعلم والسعر) — بعد اجتياز فحص الظهور أعلاه
  const detail = await getProductBySlug(product.slug, { includeUnpublished: true });
  const files = ownsRoot || staff ? (await getProductFilesInfo(product.id)).filter((f) => f.kind === "main") : [];

  const freeOpen = (l: LessonInfo) => l.isFreePreview;
  const canOpen = (l: LessonInfo) => staff || owned.has(l.productId) || freeOpen(l);

  const progress = user && lessons.length
    ? await sql<{ lesson_id: string; position_seconds: number; completed: boolean; updated_at: Date }[]>`
        select lesson_id, position_seconds, completed, updated_at from lesson_progress
        where user_id = ${user.id} and lesson_id = any(${lessons.map((l) => l.id)}::uuid[])
        order by updated_at desc
      `
    : [];
  const progressBy = new Map(progress.map((p) => [p.lesson_id, p]));

  // اختيار الدرس: المطلوب، أو آخر درس شاهده الطالب، أو أول درس متاح
  let selected = lessons.find((l) => l.id === sp.lesson) ?? null;
  if (!selected && progress.length) selected = lessons.find((l) => l.id === progress[0].lesson_id && canOpen(l)) ?? null;
  if (!selected) selected = lessons.find(canOpen) ?? lessons[0] ?? null;

  const access = selected ? await checkLessonAccess(selected.id, user) : null;
  const idx = selected ? lessons.findIndex((l) => l.id === selected!.id) : -1;
  const next = idx >= 0 ? lessons.slice(idx + 1).find(canOpen) ?? null : null;
  const prev = idx > 0 ? [...lessons.slice(0, idx)].reverse().find(canOpen) ?? null : null;
  const startAt = selected && progressBy.get(selected.id) && !progressBy.get(selected.id)!.completed ? progressBy.get(selected.id)!.position_seconds : 0;
  const playback = access?.ok ? playbackFor(access.lesson, { startAt }) : null;
  const doneCount = lessons.filter((l) => progressBy.get(l.id)?.completed).length;
  const videosOff = !settings.videos_enabled && !staff;
  const backHref = ownsRoot ? "/library" : `/products/${product.slug}`;

  // ───── عرض فقط ─────
  const subjectSlug = detail?.subjectSlug ?? null;
  const tone = subjectSlug ? toneClass(subjectSlug) : "tone-brand";
  const teacher = detail?.teacher ?? null;
  const watchHref = (lessonId: string) => `/watch/${product.id}?lesson=${lessonId}`;
  const loginHref = selected ? `/login?next=${encodeURIComponent(watchHref(selected.id))}` : "/login";
  const progressLabel = `أكملت ${ar(doneCount)} من ${ar(lessons.length)}`;
  const pct = lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0;
  const isFreeView = Boolean(selected && access?.ok && access.via === "free" && !owned.has(selected.productId));
  const lockedReason = access && !access.ok && (access.reason === "not_ready" || access.reason === "unauthenticated") ? access.reason : "forbidden";
  const kicker = [detail?.subjectName, detail?.gradeName].filter(Boolean).join(" · ");
  const hasNav = Boolean(prev || next);
  const showBuy = isFreeView && !next && !ownsRoot && !staff;
  const showBar = hasNav || showBuy;
  const showFreeCta = isFreeView && !ownsRoot && !staff;
  const showProgress = Boolean(user && lessons.length && (ownsRoot || progress.length > 0));
  const showLoginCard = !user && Boolean(access?.ok) && !showFreeCta;
  const hasSide = showFreeCta || files.length > 0 || showLoginCard;
  const numberOf = (id: string) => lessons.findIndex((l) => l.id === id) + 1;
  const stateOf = (id: string) => {
    const l = lessons.find((x) => x.id === id)!;
    const p = progressBy.get(id);
    const partial = p && !p.completed && l.durationSeconds ? Math.min(96, Math.max(4, Math.round((p.position_seconds / l.durationSeconds) * 100))) : 0;
    return {
      open: canOpen(l),
      done: Boolean(p?.completed),
      partial: p && p.position_seconds > 0 ? partial : 0,
      free: l.isFreePreview && !owned.has(l.productId) && !staff,
    };
  };

  return (
    <div className={cn("min-h-dvh bg-canvas", tone, showBar && "pb-28 lg:pb-0")}>
      {/* ───── الشريط العلوي الداكن ───── */}
      <header className="on-dark sticky top-0 z-40 border-b border-white/10 bg-[color-mix(in_oklab,var(--brand-deep)_93%,transparent)] text-white backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[88rem] items-center gap-2.5 px-3 sm:gap-4 sm:px-6 lg:px-8">
          <Link
            href={backHref}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 font-display text-[0.92rem] font-extrabold ring-1 ring-white/15 transition-colors hover:bg-white/20"
          >
            <ArrowRight className="size-5" aria-hidden />
            <span className="hidden sm:inline">{ownsRoot ? "مكتبتي" : "صفحة المحتوى"}</span>
            <span className="sr-only sm:hidden">{ownsRoot ? "مكتبتي" : "صفحة المحتوى"}</span>
          </Link>
          <LogoMark size={36} className="hidden shrink-0 md:block" />
          <div className="min-w-0 flex-1">
            {kicker ? <p className="truncate font-display text-[0.75rem] leading-tight font-bold text-[#ffd25e]">{kicker}</p> : null}
            <h1 className="truncate font-display text-[0.98rem] leading-snug font-extrabold text-white sm:text-[1.1rem]">{product.title}</h1>
          </div>
          {showProgress ? (
            <div className="flex shrink-0 items-center gap-2.5" role="group" aria-label={progressLabel}>
              <span className="hidden font-display text-[0.88rem] font-bold text-white/85 sm:inline" aria-hidden>
                {progressLabel}
              </span>
              <ProgressRing pct={pct} />
            </div>
          ) : null}
        </div>
      </header>

      {/* ───── المسرح + قائمة الدروس ───── */}
      <div className="relative isolate overflow-x-clip">
        <div className="mx-auto grid max-w-[88rem] grid-cols-1 gap-x-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_23.5rem] lg:grid-rows-[auto_1fr] lg:px-8 xl:gap-x-10">
          {/* خلفية المسرح الداكنة بعرض الشاشة */}
          <div className="bg-teal-night relative col-span-full row-start-1 -z-10 mx-[calc(50%-50vw)]" aria-hidden>
            <span
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage: "radial-gradient(rgb(255 255 255 / 0.14) 1.3px, transparent 1.7px)",
                backgroundSize: "22px 22px",
                maskImage: "radial-gradient(50% 80% at 80% 20%, #000 10%, transparent 70%)",
                WebkitMaskImage: "radial-gradient(50% 80% at 80% 20%, #000 10%, transparent 70%)",
              }}
            />
            <Sparkle className="absolute start-[3%] top-10 hidden size-6 animate-twinkle xl:block" />
            <Sparkle className="absolute end-[2.5%] bottom-16 hidden size-4 animate-twinkle [animation-delay:1.4s] xl:block" color="#9bebd8" />
            <span className="absolute inset-x-0 bottom-0 h-1.5 bg-[linear-gradient(90deg,#ff6b5a,#ffc531,#18b9a7,#4d8dff,#9b5cf6)]" />
          </div>

          <section className="on-dark col-start-1 row-start-1 min-w-0 pt-5 pb-9 text-white sm:pt-7 lg:pt-8 lg:pb-12" aria-label="الدرس الحالي">
            {videosOff ? (
              <StageNotice title="دروس الفيديو غير مفعلة حاليًا." />
            ) : !selected ? (
              <StageNotice title="لا توجد دروس منشورة بعد." />
            ) : (
              <StageFrame>
                {access?.ok && playback ? (
                  <LessonPlayer
                    key={selected.id}
                    lessonId={selected.id}
                    kind={playback.kind}
                    src={playback.kind === "file" ? playback.src : undefined}
                    embedUrl={playback.kind === "bunny" ? playback.embedUrl : undefined}
                    startAt={startAt}
                    trackProgress={Boolean(user)}
                    watermark={user?.email}
                    nextHref={next ? watchHref(next.id) : null}
                    nextTitle={next?.title ?? null}
                  />
                ) : (
                  <LockedStage
                    reason={lockedReason}
                    loginHref={loginHref}
                    productHref={`/products/${product.slug}`}
                    priceFils={detail?.priceFils ?? null}
                    compareAtFils={detail?.compareAtPriceFils ?? null}
                    subjectSlug={subjectSlug}
                  />
                )}
              </StageFrame>
            )}

            {selected ? (
              <div className="mt-6 sm:mt-7">
                <div className="flex flex-wrap items-center gap-2">
                  {isFreeView ? (
                    <span className="chip chip-gold">
                      <Sparkles aria-hidden /> معاينة مجانية
                    </span>
                  ) : null}
                  <span className="chip bg-white/12 text-white ring-1 ring-white/15">
                    الدرس {ar(idx + 1)} من {ar(lessons.length)}
                  </span>
                  {duration(selected.durationSeconds) ? (
                    <span className="chip bg-white/12 text-white ring-1 ring-white/15">
                      <Clock aria-hidden /> {duration(selected.durationSeconds)}
                    </span>
                  ) : null}
                  {progressBy.get(selected.id)?.completed ? <span className="chip bg-[#9bebd8] text-[#063f3c]">شاهدته</span> : null}
                </div>
                <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-[clamp(1.65rem,1.2rem+1.8vw,2.6rem)] leading-[1.3] font-black text-white" data-testid="lesson-title">
                      {selected.title}
                    </h2>
                    {selected.unitTitle ? <p className="mt-1 font-display text-[1rem] font-bold text-white/75">{selected.unitTitle}</p> : null}
                  </div>
                  {showBar ? (
                    <nav
                      aria-label="التنقل بين الدروس"
                      className={cn(
                        "on-dark z-30 flex items-center gap-2.5",
                        "fixed inset-x-0 bottom-0 border-t border-white/10 bg-[color-mix(in_oklab,var(--brand-deep)_94%,transparent)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl",
                        "lg:static lg:shrink-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none",
                      )}
                    >
                      <a
                        href="#lessons-panel"
                        className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-white/10 px-3 font-display text-[0.9rem] font-extrabold ring-1 ring-white/15 lg:hidden"
                        data-testid="open-lessons"
                      >
                        <ListVideo className="size-5 text-[#ffd25e]" aria-hidden />
                        <span className="sr-only">قائمة الدروس، </span>
                        {ar(lessons.length)}
                      </a>
                      {prev ? (
                        <Link
                          href={watchHref(prev.id)}
                          className={cn(
                            "btn btn-3d btn-md h-12 shrink-0 bg-white/12 text-white shadow-[0_4px_0_rgb(0_0_0/0.3)] ring-1 ring-white/20 hover:bg-white/20",
                            !next && !showBuy && "flex-1 lg:flex-none",
                          )}
                        >
                          <ChevronRight aria-hidden /> السابق
                        </Link>
                      ) : null}
                      {next ? (
                        <Link href={watchHref(next.id)} className="btn btn-3d btn-accent btn-md h-12 min-w-0 flex-1 lg:flex-none lg:px-6" data-testid="next-lesson">
                          الدرس التالي <ChevronLeft aria-hidden />
                        </Link>
                      ) : showBuy ? (
                        <Link href={`/products/${product.slug}`} className="btn btn-3d btn-accent btn-md h-12 min-w-0 flex-1 lg:flex-none lg:px-6">
                          <ShoppingCart aria-hidden /> اشترِ للوصول لكل الدروس
                        </Link>
                      ) : null}
                    </nav>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          {/* ───── قائمة الدروس ───── */}
          <div className="row-start-2 min-w-0 pt-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-8 lg:pb-12">
            <div className="lg:sticky lg:top-[5.5rem]">
              <LessonsPanel
                title="قائمة الدروس"
                count={lessonsLabel(lessons.length)}
                progress={showProgress ? { done: doneCount, total: lessons.length, label: progressLabel } : null}
              >
                <LessonRows groups={playlist} productId={product.id} selectedId={selected?.id ?? null} numberOf={numberOf} stateOf={stateOf} />
              </LessonsPanel>
            </div>
          </div>

          {/* ───── تفاصيل الدرس ───── */}
          {selected ? (
            <div className="row-start-3 min-w-0 space-y-5 pt-6 pb-12 lg:col-start-1 lg:row-start-2 lg:pt-8">
              <div className={cn("grid grid-cols-1 items-start gap-5", hasSide && "xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]")}>
                <section className="panel p-5 sm:p-7" aria-labelledby="about-lesson">
                  <div className="flex items-center gap-3">
                    <span className="icon-tile size-11 rounded-[0.9rem]" aria-hidden>
                      <SubjectIcon slug={subjectSlug} size={22} />
                    </span>
                    <h2 id="about-lesson" className="text-[1.45rem] leading-tight font-black">
                      عن هذا الدرس
                    </h2>
                  </div>
                  {selected.description ? (
                    <p className="mt-4 text-[1.02rem] leading-8 whitespace-pre-line text-ink-soft">{selected.description}</p>
                  ) : null}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {detail?.subjectName ? (
                      <span className="chip">
                        <SubjectIcon slug={subjectSlug} /> {detail.subjectName}
                      </span>
                    ) : null}
                    {detail?.gradeName ? <span className="chip chip-mint">{detail.gradeName}</span> : null}
                    <span className="chip chip-white">{count(lessons.length, W.lesson)}</span>
                  </div>

                  {teacher ? (
                    <div className="mt-6 flex items-center gap-3.5 rounded-[1.25rem] bg-[var(--soft)] p-3.5 sm:p-4">
                      <TeacherAvatar name={teacher.name} photoUrl={teacher.photoUrl} size={56} subjectSlug={subjectSlug} ring decorative />
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[0.78rem] font-bold text-[var(--tink)]">يشرح هذا الدرس</p>
                        <p className="line-clamp-2 font-display text-[1.08rem] leading-snug font-black text-ink">{teacher.name}</p>
                        {teacher.headline ? <p className="line-clamp-1 text-[0.88rem] text-ink-soft">{teacher.headline}</p> : null}
                      </div>
                      {teacher.slug ? (
                        <Link href={`/teachers/${teacher.slug}`} className="btn btn-3d btn-outline btn-icon shrink-0 sm:h-auto sm:w-auto sm:min-h-10 sm:px-3.5 sm:text-[0.9rem]">
                          <UserRound aria-hidden />
                          <span className="sr-only sm:not-sr-only">صفحة المعلم</span>
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                  {playback?.kind === "file" ? <ShortcutHints /> : null}
                </section>

                <div className="space-y-5">
                  {showFreeCta ? (
                    <section className="bg-teal-night on-dark relative isolate overflow-hidden rounded-[1.75rem] p-5 shadow-pop sm:p-6" aria-labelledby="unlock-all">
                      <Sparkle className="pointer-events-none absolute end-5 top-5 size-5 animate-twinkle" />
                      <span className="eyebrow-pill eyebrow-light text-[0.85rem]">
                        <span className="eyebrow-icon">
                          <Sparkles />
                        </span>
                        أنت تشاهد معاينة مجانية
                      </span>
                      <h2 id="unlock-all" className="mt-3 text-[1.35rem] leading-snug font-black text-white">
                        افتح {count(lessons.length, W.lesson)} في هذا المحتوى
                      </h2>
                      <p className="mt-1.5 text-[0.95rem] text-white/80">بعد الشراء يظهر المحتوى في مكتبتك فور تأكيد الدفع، وتتابع من حيث توقفت.</p>
                      {detail && detail.priceFils > 0 ? <Price fils={detail.priceFils} compareAt={detail.compareAtPriceFils} size="lg" tone="light" className="mt-3" /> : null}
                      <Link href={`/products/${product.slug}`} className="btn btn-3d btn-accent btn-md mt-4 w-full">
                        <ShoppingCart aria-hidden /> اشترِ للوصول لكل الدروس
                      </Link>
                      {!user ? (
                        <p className="mt-4 border-t border-white/15 pt-4 text-[0.92rem] text-white/85">
                          <Link href={loginHref} className="font-bold text-[#ffd25e] underline decoration-2 underline-offset-4">
                            سجّل الدخول
                          </Link>{" "}
                          ليُحفظ تقدمك وتكمل من حيث توقفت.
                        </p>
                      ) : null}
                    </section>
                  ) : null}
                  {files.length ? (
                    <section className="panel p-5 sm:p-6" aria-labelledby="lesson-files">
                      <h2 id="lesson-files" className="flex items-center gap-2.5 text-[1.2rem] leading-tight font-black">
                        <span className="grid size-9 place-items-center rounded-xl bg-coral-50 text-coral-700" aria-hidden>
                          <FileText className="size-5" />
                        </span>
                        الملفات المرفقة
                      </h2>
                      <ul className="mt-4 space-y-2.5">
                        {files.map((f) => (
                          <li key={f.id}>
                            <Link
                              href={`/read/${f.id}`}
                              className="flex min-h-14 items-center gap-3 rounded-2xl border-2 border-line bg-field px-3.5 py-2.5 transition-colors hover:border-[color-mix(in_oklab,var(--b)_40%,white)] hover:bg-white"
                            >
                              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,#ffa07a,#e8483f)] text-white" aria-hidden>
                                <FileText className="size-5" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="line-clamp-1 font-display font-extrabold text-ink">{f.title}</span>
                                {f.pageCount ? <span className="text-[0.82rem] font-semibold text-muted">{count(f.pageCount, W.page)}</span> : null}
                              </span>
                              <ChevronLeft className="size-5 shrink-0 text-muted" aria-hidden />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {showLoginCard ? (
                    <section className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(150deg,#fff3cf,#ffe39a)] p-5 shadow-card sm:p-6">
                      <p className="font-display text-[1.15rem] leading-snug font-black text-[#5a3b00]">احفظ تقدمك</p>
                      <p className="mt-1.5 text-[0.98rem] text-[#5a3b00]">
                        <Link href={loginHref} className="font-bold underline decoration-2 underline-offset-4">
                          سجّل الدخول
                        </Link>{" "}
                        ليُحفظ تقدمك وتكمل من حيث توقفت.
                      </p>
                      <Link href={loginHref} className="btn btn-3d btn-primary btn-md mt-4">
                        <LogIn aria-hidden /> تسجيل الدخول
                      </Link>
                    </section>
                  ) : null}

                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** حلقة تقدم صغيرة في الشريط العلوي (زخرفية؛ القيمة نفسها مقروءة في aria-label للمجموعة) */
function ProgressRing({ pct }: { pct: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid size-11 shrink-0 place-items-center" aria-hidden>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth="5" />
        <circle cx="22" cy="22" r={r} fill="none" stroke="#ffc531" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="font-display text-[0.7rem] font-black text-white">{ar(pct)}٪</span>
    </span>
  );
}

/** اختصارات لوحة المفاتيح لمشغل الملفات */
function ShortcutHints() {
  const items: { keys: string[]; label: string }[] = [
    { keys: ["المسافة"], label: "تشغيل وإيقاف" },
    { keys: ["→", "←"], label: "تقديم ورجوع ١٠ ثوانٍ" },
    { keys: ["F"], label: "ملء الشاشة" },
    { keys: ["M"], label: "كتم الصوت" },
  ];
  return (
    <div className="mt-6 hidden border-t-2 border-dashed border-line pt-5 sm:block">
      <h3 id="kbd-hints" className="flex items-center gap-2 text-[1rem] leading-tight font-extrabold text-ink">
        <Keyboard className="size-5 text-[var(--b)]" aria-hidden /> اختصارات لوحة المفاتيح
      </h3>
      <ul className="mt-3.5 grid gap-x-6 gap-y-2.5 md:grid-cols-2" aria-labelledby="kbd-hints">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-3 text-[0.92rem] text-ink-soft">
            <span className="flex shrink-0 gap-1">
              {it.keys.map((k) => (
                <kbd
                  key={k}
                  className="inline-grid min-w-8 place-items-center rounded-lg border border-line-strong bg-white px-2 py-0.5 font-display text-[0.82rem] font-extrabold text-ink shadow-[0_3px_0_var(--color-line-strong)]"
                >
                  {k}
                </kbd>
              ))}
            </span>
            {it.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
