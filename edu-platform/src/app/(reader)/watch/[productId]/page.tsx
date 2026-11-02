import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronLeft, CircleCheck, Gift, Lock, LogIn, PlayCircle, ShoppingCart } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { accessibleProductIds, isTeacherOfProduct } from "@/server/access/entitlements";
import { checkLessonAccess, playbackFor } from "@/server/access/lessons";
import { getPlaylist, type LessonInfo } from "@/server/catalog/queries";
import { getSettings } from "@/server/platform/settings";
import { sql } from "@/server/db";
import { LessonPlayer } from "@/components/reader/lesson-player";
import { LessonsPanel } from "@/components/reader/lessons-panel";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-4">
        <Link href={backHref} className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-brand-50">
          <ArrowRight className="size-5" aria-hidden /> <span className="hidden sm:inline">{ownsRoot ? "مكتبتي" : "صفحة المحتوى"}</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold sm:text-base">{product.title}</h1>
          {user && lessons.length ? (
            <div className="mt-0.5 flex items-center gap-2" aria-label={`أكملت ${doneCount} من ${lessons.length}`}>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line sm:w-40">
                <div className="h-full rounded-full bg-success" style={{ width: `${(doneCount / lessons.length) * 100}%` }} />
              </div>
              <span className="num text-[0.7rem] text-muted">
                {doneCount}/{lessons.length}
              </span>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-3 py-4 sm:px-4 lg:grid-cols-[1fr_360px] lg:py-6">
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
            <div className="grid aspect-video place-items-center rounded-2xl bg-ink p-6 text-center text-white" data-testid="lesson-locked-panel">
              <div>
                <Lock className="mx-auto size-10 text-accent-600" aria-hidden />
                {access && !access.ok && access.reason === "not_ready" ? (
                  <>
                    <p className="mt-3 font-bold">الدرس قيد المعالجة</p>
                    <p className="mt-1 text-sm text-white/70">سيكون متاحًا للمشاهدة بعد اكتمال المعالجة.</p>
                  </>
                ) : access && !access.ok && access.reason === "unauthenticated" ? (
                  <>
                    <p className="mt-3 font-bold">سجّل الدخول لمشاهدة هذا الدرس</p>
                    <p className="mt-1 text-sm text-white/70">إذا اشتريت المحتوى، سجّل الدخول بنفس الحساب.</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Link href={`/login?next=${encodeURIComponent(`/watch/${product.id}?lesson=${selected.id}`)}`} className="flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 font-semibold">
                        <LogIn className="size-4" aria-hidden /> تسجيل الدخول
                      </Link>
                      <Link href={`/products/${product.slug}`} className="flex items-center gap-1.5 rounded-xl bg-accent-600 px-4 py-2.5 font-semibold text-ink">
                        <ShoppingCart className="size-4" aria-hidden /> اشترِ للوصول لكل الدروس
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-3 font-bold">هذا الدرس متاح للمشتركين</p>
                    <p className="mt-1 text-sm text-white/70">اشترِ المحتوى للوصول لكل الدروس ومتابعة التقدم.</p>
                    <Link href={`/products/${product.slug}`} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent-600 px-5 py-2.5 font-semibold text-ink" data-testid="buy-from-locked">
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
                  {access?.ok && access.via === "free" && !owned.has(selected.productId) ? <Badge tone="success" className="mb-1.5">معاينة مجانية</Badge> : null}
                  <h2 className="text-xl font-bold" data-testid="lesson-title">
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
                <h3 className="sticky top-0 z-10 border-b border-line bg-canvas/95 px-4 py-2 text-xs font-bold text-ink-soft backdrop-blur">{g.title}</h3>
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
                            "flex items-center gap-3 border-b border-line/60 px-4 py-3 text-sm transition-colors hover:bg-brand-50",
                            current && "bg-brand-50 font-semibold",
                          )}
                        >
                          <span
                            className={cn(
                              "num grid size-7 shrink-0 place-items-center rounded-full text-xs",
                              done ? "bg-success text-white" : current ? "bg-brand-600 text-white" : "bg-canvas text-ink-soft",
                            )}
                            aria-hidden
                          >
                            {done ? <CircleCheck className="size-4" /> : current ? <PlayCircle className="size-4" /> : n}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2">{l.title}</span>
                            <span className="num text-xs font-normal text-muted">{formatClock(l.durationSeconds)}</span>
                          </span>
                          {!open ? (
                            <Lock className="size-4 shrink-0 text-muted" aria-label="مقفل" data-testid="lesson-locked" />
                          ) : l.isFreePreview && !owned.has(l.productId) && !staff ? (
                            <Gift className="size-4 shrink-0 text-success" aria-label="مجاني" />
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
