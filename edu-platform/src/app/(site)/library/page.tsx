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
import { PRODUCT_TYPE_LABELS, termLabel, type ProductType } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "مكتبتي", robots: { index: false } };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requireUser("/library");
  const sp = await searchParams;
  const { items, bundles } = await getLibrary(user.id);
  const types = [...new Set(items.map((i) => i.type))] as ProductType[];
  const filter = types.includes(sp.type as ProductType) ? (sp.type as ProductType) : null;
  const shown = filter ? items.filter((i) => i.type === filter) : items;
  const recent = items
    .filter((i) => i.lastActivity)
    .sort((a, b) => +new Date(b.lastActivity!) - +new Date(a.lastActivity!))
    .slice(0, 3);

  // التجميع: الصف ← المادة
  const byGrade = new Map<string, Map<string, LibraryItem[]>>();
  for (const it of shown) {
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
          <p className="mt-1 text-muted">أهلًا {user.fullName.split(" ")[0]} — كل مذكراتك في مكان واحد</p>
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
