import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Download, FileText, Library, Package, PlayCircle } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { getLibrary, type LibraryItem } from "@/server/access/entitlements";
import { coverUrl } from "@/server/catalog/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductCover } from "@/components/site/product-cover";
import { isVideoType, PRODUCT_TYPE_LABELS, termLabel, type ProductType } from "@/lib/labels";
import { cn, formatDate } from "@/lib/utils";
import { sql } from "@/server/db";
import { formatClock, lessonsLabel } from "@/components/site/format";

export const metadata: Metadata = { title: "مكتبتي", robots: { index: false } };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requireUser("/library");
  const sp = await searchParams;
  const { items, bundles } = await getLibrary(user.id);
  const types = [...new Set(items.map((i) => i.type))] as ProductType[];
  const filter = types.includes(sp.type as ProductType) ? (sp.type as ProductType) : null;
  const shown = filter ? items.filter((i) => i.type === filter) : items;
  const isVideoItem = (i: LibraryItem) => isVideoType(i.type) || i.lessonCount > 0;
  const videoItems = shown.filter(isVideoItem);
  const docItems = shown.filter((i) => !isVideoItem(i));
  const recent = items
    .filter((i) => i.lastActivity && !isVideoItem(i))
    .sort((a, b) => +new Date(b.lastActivity!) - +new Date(a.lastActivity!))
    .slice(0, 3);

  // «تابع المشاهدة»: آخر الدروس التي شاهدها الطالب في منتجات يملكها
  const ownedIds = items.map((i) => i.productId);
  const watching = ownedIds.length
    ? await sql<{ lesson_id: string; product_id: string; title: string; product_title: string; position_seconds: number; duration_seconds: number | null; completed: boolean }[]>`
        select lp.lesson_id, l.product_id, l.title, p.title as product_title, lp.position_seconds, l.duration_seconds, lp.completed
        from lesson_progress lp
        join lessons l on l.id = lp.lesson_id and l.is_published and l.processing_status = 'ready'
        join products p on p.id = l.product_id
        where lp.user_id = ${user.id} and l.product_id = any(${ownedIds}::uuid[])
        order by lp.updated_at desc
        limit 3
      `
    : [];

  // التجميع: الصف ← المادة (للمذكرات)
  const byGrade = new Map<string, Map<string, LibraryItem[]>>();
  for (const it of docItems) {
    const g = byGrade.get(it.gradeName) ?? new Map<string, LibraryItem[]>();
    const key = it.subjectName ?? "عام";
    g.set(key, [...(g.get(key) ?? []), it]);
    byGrade.set(it.gradeName, g);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">مكتبتي</h1>
          <p className="mt-1 text-muted">أهلًا {user.fullName.split(" ")[0]} — كل دروسك ومذكراتك في مكان واحد</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/account">مشترياتي وفواتيري</Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<Library />}
          title="مكتبتك فارغة حاليًا"
          description="بعد شراء أي مذكرة ستظهر هنا مباشرة، ويمكنك فتحها من أي جهاز."
          action={
            <Button asChild>
              <Link href="/#grades">تصفح المذكرات</Link>
            </Button>
          }
        />
      ) : (
        <>
          {watching.length ? (
            <section className="mt-8" aria-labelledby="watching-title">
              <h2 id="watching-title" className="mb-3 text-lg font-bold">
                تابع المشاهدة
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {watching.map((w) => {
                  const pct = w.completed ? 100 : w.duration_seconds ? Math.min(100, Math.round((w.position_seconds / w.duration_seconds) * 100)) : 0;
                  return (
                    <Link
                      key={w.lesson_id}
                      href={`/watch/${w.product_id}?lesson=${w.lesson_id}`}
                      className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 shadow-card hover:border-brand-300"
                      data-testid="continue-watching-item"
                    >
                      <span className="flex items-center gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
                          <PlayCircle className="size-5" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{w.title}</span>
                          <span className="block truncate text-xs text-muted">{w.product_title}</span>
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                          <span className="block h-full rounded-full bg-accent-600" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="num text-[0.7rem] text-muted">
                          {w.completed ? "مكتمل" : `${formatClock(w.position_seconds)} / ${formatClock(w.duration_seconds)}`}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          {recent.length ? (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-bold">أكمل من حيث توقفت</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {recent.map((it) => {
                  const f = it.files.find((x) => x.lastPage) ?? it.files[0];
                  return (
                    <Link key={it.productId} href={`/read/${f.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card hover:border-brand-300">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                        <BookOpen className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{it.title}</span>
                        <span className="text-xs text-muted">
                          صفحة <span className="num">{f.lastPage ?? 1}</span>
                          {f.pageCount ? (
                            <>
                              {" "}من <span className="num">{f.pageCount}</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          {bundles.length ? (
            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
              <Package className="size-4 text-muted" aria-hidden />
              <span className="text-muted">باقاتك:</span>
              {bundles.map((b) => (
                <Badge key={b.id} tone="accent">
                  {b.title}
                </Badge>
              ))}
            </div>
          ) : null}

          {types.length > 1 ? (
            <nav aria-label="تصفية حسب النوع" className="mt-6 flex gap-2 overflow-x-auto pb-1">
              {[{ label: "الكل", href: "/library", active: !filter }, ...types.map((t) => ({ label: PRODUCT_TYPE_LABELS[t], href: `/library?type=${t}`, active: filter === t }))].map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={t.active ? "page" : undefined}
                  className={cn("rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap", t.active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-ink-soft hover:border-brand-300")}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="mt-8 space-y-10" data-testid="library-items">
            {videoItems.length ? (
              <section aria-labelledby="lib-videos">
                <h2 id="lib-videos" className="mb-4 flex items-center gap-2 text-xl font-bold text-brand-800">
                  <PlayCircle className="size-6 text-accent-600" aria-hidden /> الفيديوهات
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {videoItems.map((it) => (
                    <VideoLibraryCard key={it.productId} item={it} />
                  ))}
                </div>
              </section>
            ) : null}
            {docItems.length && videoItems.length ? (
              <h2 className="flex items-center gap-2 text-xl font-bold text-brand-800">
                <FileText className="size-6 text-accent-600" aria-hidden /> المذكرات والملفات
              </h2>
            ) : null}
            {[...byGrade.entries()].map(([grade, subjects]) => (
              <section key={grade}>
                <h2 className="mb-4 text-xl font-bold text-brand-800">{grade}</h2>
                <div className="space-y-6">
                  {[...subjects.entries()].map(([subject, list]) => (
                    <div key={subject}>
                      <h3 className="mb-3 flex items-center gap-2 font-bold">
                        <span className="h-5 w-1.5 rounded-full bg-accent-600" aria-hidden /> {subject}
                      </h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        {list.map((it) => (
                          <LibraryCard key={it.productId} item={it} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LibraryCard({ item }: { item: LibraryItem }) {
  return (
    <article className="flex gap-4 rounded-2xl border border-line bg-surface p-3 shadow-card">
      <div className="w-20 shrink-0 overflow-hidden rounded-xl sm:w-24">
        <ProductCover coverUrl={coverUrl(item.coverKey)} title={item.title} type={item.type as ProductType} subjectName={item.subjectName} gradeName={item.gradeName} sizes="96px" compact />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="text-xs font-semibold text-brand-700">
            {PRODUCT_TYPE_LABELS[item.type as ProductType]} · {termLabel(item.term)}
          </p>
          <h4 className="mt-0.5 leading-6 font-bold">{item.title}</h4>
        </div>
        {item.type === "video_course" ? (
          <Button asChild size="sm" className="w-fit">
            <Link href={`/watch/${item.productId}`}>
              <PlayCircle aria-hidden /> شاهد الدروس ({item.lessonCount})
            </Link>
          </Button>
        ) : item.files.length === 0 ? (
          <p className="text-sm text-muted">الملفات قيد التجهيز وستظهر هنا قريبًا.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {item.files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm">
                  <Link href={`/read/${f.id}`} data-testid="open-file">
                    <FileText aria-hidden /> {item.files.length > 1 ? f.title : "افتح المذكرة"}
                  </Link>
                </Button>
                {item.isDownloadable ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={`/api/files/${f.id}?download=1`}>
                      <Download aria-hidden /> تنزيل
                    </a>
                  </Button>
                ) : null}
                {f.lastPage ? (
                  <span className="text-xs text-muted">
                    وصلت للصفحة <span className="num">{f.lastPage}</span>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function VideoLibraryCard({ item }: { item: LibraryItem }) {
  const pct = item.lessonCount ? Math.round((item.watchedCount / item.lessonCount) * 100) : 0;
  return (
    <article className="flex gap-4 rounded-2xl border border-line bg-surface p-3 shadow-card" data-testid="library-video">
      <div className="w-20 shrink-0 overflow-hidden rounded-xl sm:w-24">
        <ProductCover coverUrl={coverUrl(item.coverKey)} title={item.title} type={item.type as ProductType} subjectName={item.subjectName} gradeName={item.gradeName} sizes="96px" compact />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="text-xs font-semibold text-brand-700">
            {PRODUCT_TYPE_LABELS[item.type as ProductType]} · {item.subjectName ?? "عام"} · {item.gradeName}
          </p>
          <h4 className="mt-0.5 leading-6 font-bold">{item.title}</h4>
          {item.teacherName ? <p className="text-xs text-muted">{item.teacherName}</p> : null}
        </div>
        <div className="flex items-center gap-2" aria-label={`شاهدت ${item.watchedCount} من ${item.lessonCount}`}>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </span>
          <span className="num text-xs text-muted">
            {item.watchedCount}/{item.lessonCount}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link href={`/watch/${item.productId}`} data-testid="open-video">
              <PlayCircle aria-hidden /> {item.watchedCount ? "تابع المشاهدة" : "ابدأ المشاهدة"} ({lessonsLabel(item.lessonCount)})
            </Link>
          </Button>
          {item.files.length ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/read/${item.files[0].id}`} data-testid="open-attachment">
                <FileText aria-hidden /> الملف المرفق
              </Link>
            </Button>
          ) : null}
          {item.expiresAt ? <Badge tone="warning">الوصول حتى {formatDate(item.expiresAt)}</Badge> : null}
        </div>
      </div>
    </article>
  );
}
