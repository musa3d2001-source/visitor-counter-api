import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronLeft, CircleCheck, Lock, LogIn, Play, ShoppingCart } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds, isTeacherOfProduct } from "@/server/access/entitlements";
import { checkLessonAccess, playbackFor } from "@/server/access/lessons";
import { getPlaylist, type LessonInfo } from "@/server/catalog/queries";
import { getSettings } from "@/server/platform/settings";
import { sql } from "@/server/db";
import { LessonPlayer } from "@/components/reader/lesson-player";
import { LessonsPanel } from "@/components/reader/lessons-panel";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatClock, lessonsLabel } from "@/components/site/format";
import { cn } from "@/lib/utils";

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

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface px-3 sm:px-4">
        <Link href={backHref} className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-mist">
          <ArrowRight className="size-5" aria-hidden /> <span className="hidden sm:inline">{ownsRoot ? "مكتبتي" : "صفحة المحتوى"}</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-sans text-sm font-semibold sm:text-base">{product.title}</h1>
          {user && lessons.length ? (
            <div className="mt-0.5 flex items-center gap-2" aria-label={`أكملت ${doneCount} من ${lessons.length}`}>
              <div className="h-1 w-24 overflow-hidden rounded-full bg-line sm:w-40">
                <div className="h-full bg-brand-600" style={{ width: `${(doneCount / lessons.length) * 100}%` }} />
              </div>
              <span className="text-[0.72rem] text-muted">
                أكملت <span className="num">{doneCount}</span> من <span className="num">{lessons.length}</span>
              </span>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-3 py-4 sm:px-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10 lg:py-6">
        <main id="main" className="min-w-0">
          {videosOff ? (
            <Alert tone="info">دروس الفيديو غير مفعلة حاليًا.</Alert>
          ) : !selected ? (
            <Alert tone="info">لا توجد دروس منشورة بعد.</Alert>
          ) : access?.ok && playback ? (
            <LessonPlayer
              key={selected.id}
              lessonId={selected.id}
              kind={playback.kind}
              src={playback.kind === "file" ? playback.src : undefined}
              embedUrl={playback.kind === "bunny" ? playback.embedUrl : undefined}
              startAt={startAt}
              trackProgress={Boolean(user)}
              watermark={user?.email}
              nextHref={next ? `/watch/${product.id}?lesson=${next.id}` : null}
              nextTitle={next?.title ?? null}
            />
          ) : (
            <div className="grid aspect-video place-items-center rounded-lg bg-ink p-6 text-center text-white" data-testid="lesson-locked-panel">
              <div>
                <Lock className="mx-auto size-8 text-white/70" aria-hidden />
                {access && !access.ok && access.reason === "not_ready" ? (
                  <>
                    <p className="mt-3 font-display text-[1.7rem] leading-tight">الدرس قيد المعالجة</p>
                    <p className="mt-1 text-sm text-white/70">سيكون متاحًا للمشاهدة بعد اكتمال المعالجة.</p>
                  </>
                ) : access && !access.ok && access.reason === "unauthenticated" ? (
                  <>
                    <p className="mt-3 font-display text-[1.7rem] leading-tight">سجّل الدخول لمشاهدة هذا الدرس</p>
                    <p className="mt-1 text-sm text-white/70">إذا اشتريت المحتوى، سجّل الدخول بنفس الحساب.</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Link href={`/login?next=${encodeURIComponent(`/watch/${product.id}?lesson=${selected.id}`)}`} className="flex min-h-11 items-center gap-1.5 rounded-lg border border-white/40 px-4 font-semibold hover:bg-white/10">
                        <LogIn className="size-4" aria-hidden /> تسجيل الدخول
                      </Link>
                      <Link href={`/products/${product.slug}`} className="flex min-h-11 items-center gap-1.5 rounded-lg bg-accent-600 px-4 font-semibold text-ink hover:bg-accent-700">
                        <ShoppingCart className="size-4" aria-hidden /> اشترِ للوصول لكل الدروس
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-3 font-display text-[1.7rem] leading-tight">هذا الدرس لمن اشترى المحتوى</p>
                    <p className="mt-1 text-sm text-white/70">اشترِ المحتوى للوصول لكل الدروس ومتابعة التقدم.</p>
                    <Link href={`/products/${product.slug}`} className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent-600 px-5 font-semibold text-ink hover:bg-accent-700" data-testid="buy-from-locked">
                      <ShoppingCart className="size-4" aria-hidden /> اشترِ للوصول لكل الدروس
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}

          {selected ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  {access?.ok && access.via === "free" && !owned.has(selected.productId) ? <p className="mb-1 text-sm font-semibold text-brand-700">معاينة مجانية</p> : null}
                  <h2 className="text-[clamp(1.7rem,3.5vw,2.3rem)]" data-testid="lesson-title">
                    {selected.title}
                  </h2>
                  {selected.unitTitle ? <p className="mt-0.5 text-sm text-muted">{selected.unitTitle}</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  {prev ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/watch/${product.id}?lesson=${prev.id}`}>السابق</Link>
                    </Button>
                  ) : null}
                  {next ? (
                    <Button asChild size="sm">
                      <Link href={`/watch/${product.id}?lesson=${next.id}`} data-testid="next-lesson">
                        الدرس التالي <ChevronLeft aria-hidden />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
              {selected.description ? <p className="mt-3 leading-7 whitespace-pre-line text-ink-soft">{selected.description}</p> : null}
              {playback?.kind === "file" ? (
                <p className="mt-3 text-xs text-muted">
                  الاختصارات: المسافة للتشغيل/الإيقاف، الأسهم للتقديم والرجوع 10 ثوانٍ، F لملء الشاشة. الجودات المتعددة التلقائية متاحة عند البث عبر Bunny Stream.
                </p>
              ) : null}
              {!user && access?.ok ? (
                <p className="mt-3 text-sm text-muted">
                  <Link href={`/login?next=${encodeURIComponent(`/watch/${product.id}?lesson=${selected.id}`)}`} className="font-semibold text-brand-700 underline">
                    سجّل الدخول
                  </Link>{" "}
                  ليُحفظ تقدمك وتكمل من حيث توقفت.
                </p>
              ) : null}
            </div>
          ) : null}
        </main>

        <div className="lg:sticky lg:top-20 lg:h-fit">
          <LessonsPanel title="قائمة الدروس" count={lessonsLabel(lessons.length)}>
            {playlist.map((g) => (
              <section key={g.key} aria-label={g.title}>
                <h3 className="sticky top-0 z-10 border-b border-line bg-surface px-4 pt-4 pb-2 text-xs font-semibold text-muted lg:px-0">{g.title}</h3>
                <ol>
                  {g.lessons.map((l) => {
                    const open = canOpen(l);
                    const done = progressBy.get(l.id)?.completed;
                    const current = selected?.id === l.id;
                    const n = lessons.indexOf(l) + 1;
                    return (
                      <li key={l.id} data-testid="lesson-item">
                        <Link
                          href={`/watch/${product.id}?lesson=${l.id}`}
                          aria-current={current ? "true" : undefined}
                          className={cn(
                            "grid min-h-14 grid-cols-[1.75rem_1fr_auto] items-center gap-3 border-b border-line px-4 py-2.5 text-sm transition-colors hover:bg-mist lg:px-2",
                            current && "bg-mist font-semibold shadow-[inset_-3px_0_0_var(--color-brand-600)]",
                          )}
                        >
                          <span className={cn("num text-center text-xs", done ? "text-success" : current ? "text-brand-700" : "text-muted")} aria-hidden>
                            {done ? <CircleCheck className="mx-auto size-4" /> : current ? <Play className="mx-auto size-3.5 fill-current" /> : n}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2">{l.title}</span>
                            <span className="num text-xs font-normal text-muted">{formatClock(l.durationSeconds)}</span>
                          </span>
                          {!open ? (
                            <Lock className="size-4 shrink-0 text-muted" aria-label="مقفل" data-testid="lesson-locked" />
                          ) : l.isFreePreview && !owned.has(l.productId) && !staff ? (
                            <span className="rounded-md bg-accent-200 px-1.5 py-0.5 text-[0.7rem] font-semibold text-ink">مجاني</span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </LessonsPanel>
        </div>
      </div>
    </div>
  );
}
