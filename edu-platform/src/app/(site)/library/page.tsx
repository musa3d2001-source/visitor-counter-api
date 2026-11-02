import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Download, FileText, Play } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { getLibrary, type LibraryItem } from "@/server/access/entitlements";
import { coverUrl } from "@/server/catalog/queries";
import { Button } from "@/components/ui/button";
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

  const resume = [
    ...watching.map((w) => ({
      key: `l-${w.lesson_id}`,
      href: `/watch/${w.product_id}?lesson=${w.lesson_id}`,
      kind: "video" as const,
      title: w.title,
      context: w.product_title,
      pct: w.completed ? 100 : w.duration_seconds ? Math.min(100, Math.round((w.position_seconds / w.duration_seconds) * 100)) : 0,
      status: w.completed ? "مكتمل" : `${formatClock(w.position_seconds)} من ${formatClock(w.duration_seconds)}`,
    })),
    ...recent.map((it) => {
      const f = it.files.find((x) => x.lastPage) ?? it.files[0];
      const page = f.lastPage ?? 1;
      return {
        key: `f-${f.id}`,
        href: `/read/${f.id}`,
        kind: "file" as const,
        title: it.title,
        context: it.subjectName ? `${it.subjectName}، ${it.gradeName}` : it.gradeName,
        pct: f.pageCount ? Math.min(100, Math.round((page / f.pageCount) * 100)) : 0,
        status: f.pageCount ? `صفحة ${page} من ${f.pageCount}` : `صفحة ${page}`,
      };
    }),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-6">
        <div>
          <h1 className="text-[clamp(2.4rem,6vw,3.8rem)]">مكتبتي</h1>
          <p className="mt-2 text-ink-soft">أهلًا {user.fullName.split(" ")[0]}، دروسك ومذكراتك كلها هنا، وتفتح من أي جهاز.</p>
        </div>
        <Link href="/account" className="text-sm font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-700">
          مشترياتي وفواتيري
        </Link>
      </header>

      {items.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="مكتبتك فارغة حاليًا"
          description="أي شرح أو مذكرة تشتريها يظهر هنا فور تأكيد الدفع."
          action={
            <Button asChild>
              <Link href="/#grades">اختر صفك</Link>
            </Button>
          }
        />
      ) : (
        <>
          {resume.length ? (
            <section className="mt-8 rounded-lg bg-mist p-5 sm:p-6" aria-labelledby="resume-title">
              <h2 id="resume-title" className="text-[1.9rem]">
                تابع من حيث توقفت
              </h2>
              <ul className="mt-3">
                {resume.map((r) => (
                  <li key={r.key} className="border-t border-line-strong first:border-t-0">
                    <Link
                      href={r.href}
                      className="group grid grid-cols-[2rem_1fr] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_14rem_auto]"
                      data-testid={r.kind === "video" ? "continue-watching-item" : "continue-reading-item"}
                    >
                      <span className="grid size-8 place-items-center rounded-full bg-surface text-brand-700" aria-hidden>
                        {r.kind === "video" ? <Play className="size-3.5 fill-current" /> : <BookOpen className="size-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold group-hover:text-brand-700">{r.title}</span>
                        <span className="block truncate text-sm text-muted">{r.context}</span>
                      </span>
                      <span className="col-start-2 flex items-center gap-3 sm:col-start-3">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-line-strong">
                          <span className="block h-full bg-brand-600" style={{ width: `${r.pct}%` }} />
                        </span>
                        <span className="num shrink-0 text-xs text-muted">{r.status}</span>
                      </span>
                      <span className="hidden text-sm font-semibold text-brand-700 sm:block">تابع</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {bundles.length ? (
            <p className="mt-6 text-sm text-ink-soft">
              <span className="text-muted">باقاتك: </span>
              {bundles.map((b) => b.title).join("، ")}
            </p>
          ) : null}

          {types.length > 1 ? (
            <nav aria-label="تصفية حسب النوع" className="mt-6 flex gap-1.5 overflow-x-auto pb-1">
              {[{ label: "الكل", href: "/library", active: !filter }, ...types.map((t) => ({ label: PRODUCT_TYPE_LABELS[t], href: `/library?type=${t}`, active: filter === t }))].map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={t.active ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 items-center rounded-md px-3.5 text-sm font-semibold whitespace-nowrap transition-colors",
                    t.active ? "bg-ink text-white" : "bg-mist text-ink-soft hover:bg-brand-50 hover:text-brand-700",
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="mt-10 space-y-12" data-testid="library-items">
            {videoItems.length ? (
              <section aria-labelledby="lib-videos">
                <h2 id="lib-videos" className="mb-3 text-[clamp(1.7rem,3vw,2.3rem)]">
                  الشروحات والدروس
                </h2>
                <ul className="border-t-2 border-ink">
                  {videoItems.map((it) => (
                    <li key={it.productId} className="border-b border-line">
                      <VideoLibraryRow item={it} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {[...byGrade.entries()].map(([grade, subjects]) => (
              <section key={grade} aria-label={`مذكرات ${grade}`}>
                <h2 className="mb-3 text-[clamp(1.7rem,3vw,2.3rem)]">{videoItems.length ? `مذكرات ${grade}` : grade}</h2>
                <div className="space-y-6">
                  {[...subjects.entries()].map(([subject, list]) => (
                    <div key={subject}>
                      <h3 className="border-b-2 border-ink pb-2 text-sm font-semibold text-ink-soft">{subject}</h3>
                      <ul>
                        {list.map((it) => (
                          <li key={it.productId} className="border-b border-line">
                            <LibraryRow item={it} />
                          </li>
                        ))}
                      </ul>
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

function LibraryRow({ item }: { item: LibraryItem }) {
  return (
    <article className="grid grid-cols-[3.5rem_1fr] gap-x-4 gap-y-3 py-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center">
      <div className="overflow-hidden rounded-md">
        <ProductCover coverUrl={coverUrl(item.coverKey)} title={item.title} type={item.type as ProductType} subjectName={item.subjectName} gradeName={item.gradeName} sizes="64px" compact />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-brand-700">{PRODUCT_TYPE_LABELS[item.type as ProductType]}</p>
        <h4 className="mt-0.5 leading-7 font-semibold">{item.title}</h4>
        <p className="text-sm text-muted">{termLabel(item.term)}</p>
      </div>
      <div className="col-start-2 sm:col-start-3">
        {item.type === "video_course" ? (
          <Button asChild size="sm">
            <Link href={`/watch/${item.productId}`}>
              <Play className="fill-current" aria-hidden /> شاهد الدروس
            </Link>
          </Button>
        ) : item.files.length === 0 ? (
          <p className="text-sm text-muted">الملفات قيد التجهيز وتظهر هنا قريبًا.</p>
        ) : (
          <ul className="flex flex-col gap-2 sm:items-end">
            {item.files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 sm:justify-end">
                {f.lastPage ? (
                  <span className="text-xs text-muted">
                    وصلت للصفحة <span className="num">{f.lastPage}</span>
                  </span>
                ) : null}
                {item.isDownloadable ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={`/api/files/${f.id}?download=1`}>
                      <Download aria-hidden /> تنزيل
                    </a>
                  </Button>
                ) : null}
                <Button asChild size="sm">
                  <Link href={`/read/${f.id}`} data-testid="open-file">
                    <FileText aria-hidden /> {item.files.length > 1 ? f.title : "افتح المذكرة"}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function VideoLibraryRow({ item }: { item: LibraryItem }) {
  const pct = item.lessonCount ? Math.round((item.watchedCount / item.lessonCount) * 100) : 0;
  const meta = [item.teacherName, item.subjectName, item.gradeName].filter(Boolean).join("، ");
  return (
    <article className="grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-3 py-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center" data-testid="library-video">
      <div className="overflow-hidden rounded-md">
        <ProductCover coverUrl={coverUrl(item.coverKey)} title={item.title} type={item.type as ProductType} subjectName={item.subjectName} gradeName={item.gradeName} sizes="128px" compact wide />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-brand-700">{PRODUCT_TYPE_LABELS[item.type as ProductType]}</p>
        <h4 className="mt-0.5 leading-7 font-semibold">{item.title}</h4>
        <p className="text-sm text-muted">{meta}</p>
        {item.watchedCount ? (
          <div className="mt-2 flex max-w-sm items-center gap-3" aria-label={`شاهدت ${item.watchedCount} من ${item.lessonCount}`}>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
              <span className="block h-full bg-brand-600" style={{ width: `${pct}%` }} />
            </span>
            <span className="shrink-0 text-xs text-muted">
              شاهدت <span className="num">{item.watchedCount}</span> من <span className="num">{item.lessonCount}</span>
            </span>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">{lessonsLabel(item.lessonCount)}، لم تبدأ بعد</p>
        )}
        {item.expiresAt ? <p className="mt-1.5 text-xs font-semibold text-warning">الوصول حتى {formatDate(item.expiresAt)}</p> : null}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:justify-end">
        {item.files.length ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/read/${item.files[0].id}`} data-testid="open-attachment">
              <FileText aria-hidden /> الملف المرفق
            </Link>
          </Button>
        ) : null}
        <Button asChild size="sm">
          <Link href={`/watch/${item.productId}`} data-testid="open-video">
            <Play className="fill-current" aria-hidden /> {item.watchedCount ? "تابع المشاهدة" : "ابدأ المشاهدة"}
          </Link>
        </Button>
      </div>
    </article>
  );
}
