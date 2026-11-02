import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Lock, PlayCircle } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { hasProductAccess } from "@/server/access/entitlements";
import { bunnyEmbedUrl, checkLessonAccess } from "@/server/access/lessons";
import { getLessons } from "@/server/catalog/queries";
import { getSettings } from "@/server/platform/settings";
import { sql } from "@/server/db";
import { VideoPlayer } from "@/components/reader/video-player";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "الدروس", robots: { index: false } };

export default async function WatchPage({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ lesson?: string }> }) {
  const { productId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(productId)) notFound();
  const [product] = await sql<{ id: string; slug: string; title: string; status: string; type: string }[]>`
    select id, slug, title, status, type from products where id = ${productId}
  `;
  if (!product || product.type !== "video_course") notFound();
  const user = await getCurrentUser();
  const owns = user ? user.role === "admin" || (await hasProductAccess(user.id, product.id)) : false;
  if (product.status !== "published" && !owns) notFound();
  const settings = await getSettings();
  const lessons = await getLessons(product.id);
  const selected = lessons.find((l) => l.id === sp.lesson) ?? lessons.find((l) => owns || l.isFreePreview) ?? lessons[0];
  const access = selected ? await checkLessonAccess(selected.id, user) : null;
  const [progress] =
    user && selected
      ? await sql<{ position_seconds: number }[]>`select position_seconds from lesson_progress where user_id = ${user.id} and lesson_id = ${selected.id}`
      : [];

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex h-14 items-center gap-2 border-b border-line bg-surface px-4">
        <Link href={owns ? "/library" : `/products/${product.slug}`} className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-brand-50">
          <ArrowRight className="size-5" aria-hidden /> {owns ? "مكتبتي" : "العودة"}
        </Link>
        <h1 className="truncate font-bold">{product.title}</h1>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <div>
          {!settings.videos_enabled && user?.role !== "admin" ? (
            <Alert tone="info">دروس الفيديو غير مفعلة حاليًا.</Alert>
          ) : !selected ? (
            <Alert tone="info">لا توجد دروس منشورة بعد.</Alert>
          ) : access?.ok ? (
            <>
              <VideoPlayer
                lessonId={selected.id}
                src={selected.provider === "file" ? `/api/lessons/${selected.id}/stream` : undefined}
                embedUrl={selected.provider === "bunny" ? bunnyEmbedUrl(access.lesson.video_ref) : null}
                startAt={progress?.position_seconds ?? 0}
                trackProgress={Boolean(user)}
                watermark={user?.email}
              />
              <h2 className="mt-4 text-xl font-bold">{selected.title}</h2>
              {selected.description ? <p className="mt-2 leading-7 text-ink-soft">{selected.description}</p> : null}
            </>
          ) : (
            <div className="grid aspect-video place-items-center rounded-2xl bg-ink text-center text-white">
              <div className="px-6">
                <Lock className="mx-auto size-10 text-accent-600" aria-hidden />
                <p className="mt-3 font-bold">هذا الدرس متاح للمشتركين</p>
                <Link href={`/products/${product.slug}`} className="mt-4 inline-block rounded-xl bg-accent-600 px-5 py-2.5 font-semibold text-ink">
                  اشترك للوصول لكل الدروس
                </Link>
              </div>
            </div>
          )}
        </div>
        <aside className="h-fit rounded-2xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 font-bold">قائمة الدروس</h2>
          <ol className="max-h-[70vh] overflow-y-auto">
            {lessons.map((l, i) => {
              const canOpen = owns || l.isFreePreview;
              return (
                <li key={l.id}>
                  <Link
                    href={`/watch/${product.id}?lesson=${l.id}`}
                    aria-current={selected?.id === l.id ? "true" : undefined}
                    className={cn("flex items-center gap-3 px-4 py-3 text-sm hover:bg-brand-50", selected?.id === l.id && "bg-brand-50 font-semibold")}
                  >
                    <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-canvas text-xs">{i + 1}</span>
                    <span className="flex-1">
                      {l.unitTitle ? <span className="block text-xs text-muted">{l.unitTitle}</span> : null}
                      {l.title}
                    </span>
                    {canOpen ? l.isFreePreview && !owns ? <Badge tone="success">مجاني</Badge> : <PlayCircle className="size-4 text-brand-600" aria-hidden /> : <Lock className="size-4 text-muted" aria-label="مقفل" />}
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
