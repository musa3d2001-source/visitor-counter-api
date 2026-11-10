import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText, Package, PlayCircle, Receipt, Sparkles } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { getLibrary, getResumeLessons, type LibraryItem } from "@/server/access/entitlements";
import { coverUrl } from "@/server/catalog/queries";
import { listGrades } from "@/server/catalog/public-data";
import { Button } from "@/components/ui/button";
import { PageHeader, StatPill } from "@/components/ui/page-header";
import { Eyebrow } from "@/components/ui/section-head";
import { Sparkle, SubjectIcon } from "@/components/art";
import { subjectSlugFromName } from "@/components/site/card-parts";
import { isVideoType, PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/labels";
import { ar, count, gradeClass, toneClass, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { libraryNote } from "@/lib/site-truth";
import { paymentPublicState } from "@/server/payments/public-state";
import { healBuyerOrders } from "@/server/payments/heal";
import { formatClock } from "@/components/site/format";
import { EmptyStart, TiltedPosters, pillParts } from "../cart/_components/commerce";
import { NoteLibraryRow, ResumeFeatured, ResumeRow, VideoLibraryCard, type ResumeEntry } from "./_components/library-ui";

export const metadata: Metadata = { title: "مكتبتي", robots: { index: false } };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requireUser("/library");
  const sp = await searchParams;
  // قبل قراءة المكتبة: ما يُمنح الآن يظهر في هذه الزيارة نفسها
  await healBuyerOrders({ userId: user.id });
  const [{ items, bundles }, watching] = await Promise.all([getLibrary(user.id), getResumeLessons(user.id)]);
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

  const grades = items.length === 0 ? await listGrades() : [];

  // التجميع: الصف ← المادة (للمذكرات)
  const byGrade = new Map<string, { level: number; subjects: Map<string, LibraryItem[]> }>();
  for (const it of docItems) {
    const g = byGrade.get(it.gradeName) ?? { level: it.gradeLevel, subjects: new Map<string, LibraryItem[]>() };
    const key = it.subjectName ?? "عام";
    g.subjects.set(key, [...(g.subjects.get(key) ?? []), it]);
    byGrade.set(it.gradeName, g);
  }

  const byId = new Map(items.map((i) => [i.productId, i]));
  const resume: ResumeEntry[] = [
    ...watching.map((w) => ({
      key: `l-${w.lesson_id}`,
      href: `/watch/${w.product_id}?lesson=${w.lesson_id}`,
      kind: "video" as const,
      title: w.title,
      context: w.product_title,
      completed: w.completed,
      pct: w.completed ? 100 : w.duration_seconds ? Math.min(100, Math.round((w.position_seconds / w.duration_seconds) * 100)) : 0,
      status: w.completed ? "مكتمل" : w.duration_seconds ? `${formatClock(w.position_seconds)} من ${formatClock(w.duration_seconds)}` : `توقفت عند ${formatClock(w.position_seconds)}`,
      item: byId.get(w.product_id) ?? null,
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
        status: f.pageCount ? `صفحة ${ar(page)} من ${ar(f.pageCount)}` : `صفحة ${ar(page)}`,
        item: it,
      };
    }),
  ];

  const allVideos = items.filter(isVideoItem);
  const allDocs = items.filter((i) => !isVideoItem(i));
  const lessonTotal = allVideos.reduce((n, i) => n + i.lessonCount, 0);
  const posters = [...allVideos, ...allDocs].map((i) => ({
    key: i.productId,
    title: i.title,
    type: i.type as ProductType,
    subjectName: i.subjectName,
    subjectSlug: subjectSlugFromName(i.subjectName),
    gradeName: i.gradeName,
    coverUrl: coverUrl(i.coverKey),
  }));

  return (
    <>
      <PageHeader
        eyebrow={{ icon: <Sparkles />, label: `أهلًا ${user.fullName.split(" ")[0]}`, tone: "gold" }}
        title="مكتبتي"
        sub={items.length ? "كل ما اشتريته هنا، ويفتح من أي جهاز." : (libraryNote(paymentPublicState(), "libraryEmpty") ?? undefined)}
        actions={
          <Button asChild variant="outline">
            <Link prefetch={false} href="/account">
              <Receipt aria-hidden /> مشترياتي وفواتيري
            </Link>
          </Button>
        }
        aside={items.length ? <TiltedPosters items={posters} /> : undefined}
      >
        {items.length ? (
          <div className="flex flex-wrap gap-3">
            {lessonTotal ? <StatPill icon={<PlayCircle />} tone="teal" {...pillParts(lessonTotal, W.videoLesson)} /> : null}
            {allDocs.length ? <StatPill icon={<FileText />} tone="coral" {...pillParts(allDocs.length, W.note)} /> : null}
          </div>
        ) : null}
      </PageHeader>

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        {items.length === 0 ? (
          <EmptyStart
            art="library"
            title="مكتبتك فارغة حاليًا"
            description="اختر صفك ثم المادة، وابدأ بما تحتاجه."
            grades={grades}
            actions={
              <>
                <Button asChild size="lg">
                  <Link prefetch={false} href="/#grades">
                    اختر صفك <ArrowLeft aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link prefetch={false} href="/bundles">تصفح الباقات</Link>
                </Button>
              </>
            }
          />
        ) : (
          <>
            {resume.length ? (
              <section className="bg-teal-night on-dark relative isolate overflow-hidden rounded-[2rem] p-4 sm:rounded-[2.5rem] sm:p-8 lg:p-10" aria-labelledby="resume-title">
                <Sparkle className="animate-twinkle absolute end-[6%] top-8 size-6" />
                <Sparkle className="animate-twinkle absolute start-[55%] top-5 hidden size-3.5 sm:block [animation-delay:1.2s]" color="#ffffff" />
                <span className="pointer-events-none absolute -end-16 -bottom-24 size-72 rounded-full border-[28px] border-white/6" aria-hidden />
                <div className="mb-6 px-2 pt-2 sm:px-0 sm:pt-0">
                  <Eyebrow tone="light" icon={<PlayCircle />}>
                    أكمل دراستك
                  </Eyebrow>
                  <h2 id="resume-title" className="mt-3 font-display text-[clamp(1.6rem,1.2rem+1.6vw,2.4rem)] leading-tight font-black text-white">
                    تابع من حيث <span className="text-hl">توقفت</span>
                  </h2>
                </div>
                <ResumeFeatured r={resume[0]} />
                {resume.length > 1 ? (
                  <ul className={cn("mt-4 grid grid-cols-1 gap-3", resume.length > 2 && "md:grid-cols-2")}>
                    {resume.slice(1).map((r) => (
                      <li key={r.key} className="min-w-0">
                        <ResumeRow r={r} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {bundles.length || types.length > 1 ? (
              <div className="mt-10 flex flex-col gap-4">
                {bundles.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[0.95rem] font-extrabold text-ink-soft">باقاتك:</span>
                    {bundles.map((b) => (
                      <span key={b.id} className="chip tone-default min-h-9 px-3.5 text-[0.88rem]">
                        <Package aria-hidden />
                        {b.title}
                      </span>
                    ))}
                  </div>
                ) : null}
                {types.length > 1 ? (
                  <nav aria-label="تصفية حسب النوع" className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-1 pb-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                    {[{ label: "الكل", href: "/library", active: !filter }, ...types.map((t) => ({ label: PRODUCT_TYPE_LABELS[t], href: `/library?type=${t}`, active: filter === t }))].map((t) => (
                      <Link prefetch={false}
                        key={t.href}
                        href={t.href}
                        aria-current={t.active ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 shrink-0 items-center rounded-full px-4.5 font-display text-[0.92rem] font-extrabold whitespace-nowrap transition-[background-color,color,transform] hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
                          t.active ? "bg-brand-600 text-white shadow-[0_4px_0_var(--brand-edge)]" : "bg-white text-ink-soft shadow-[0_3px_0_var(--color-line-strong)] hover:text-brand-800",
                        )}
                      >
                        {t.label}
                      </Link>
                    ))}
                  </nav>
                ) : null}
              </div>
            ) : null}

            <div className="mt-10 space-y-14" data-testid="library-items">
              {videoItems.length ? (
                <section aria-labelledby="lib-videos">
                  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <Eyebrow icon={<PlayCircle />}>شروحات الفيديو</Eyebrow>
                      <h2 id="lib-videos" className="h-section mt-2">
                        الشروحات والدروس
                      </h2>
                    </div>
                    <span className="chip chip-mint min-h-9 px-3.5 text-[0.9rem]">{count(videoItems.length, W.product)}</span>
                  </div>
                  <ul className="grid gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
                    {videoItems.map((it) => (
                      <li key={it.productId} className="min-w-0">
                        <VideoLibraryCard item={it} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {[...byGrade.entries()].map(([grade, g]) => (
                <section key={grade} aria-label={`مذكرات ${grade}`} className={cn("rounded-[2rem] p-4 sm:p-7", gradeClass(g.level))} style={{ background: "linear-gradient(180deg, var(--soft), transparent 85%)" }}>
                  <div className="mb-6 flex items-center gap-3.5">
                    <span className="num-tile" aria-hidden>
                      {ar(g.level)}
                    </span>
                    <h2 className="h-section">{videoItems.length ? `مذكرات ${grade}` : grade}</h2>
                  </div>
                  <div className="space-y-8">
                    {[...g.subjects.entries()].map(([subject, list]) => {
                      const slug = subjectSlugFromName(subject);
                      return (
                        <div key={subject} className={toneClass(slug)}>
                          <h3 className="mb-4 flex items-center gap-2.5 font-display text-[1.2rem] font-black text-ink">
                            <span className="icon-tile size-10 rounded-[0.8rem] [&_svg]:size-5" aria-hidden>
                              <SubjectIcon slug={slug} name={null} />
                            </span>
                            {subject}
                            <span className="chip ms-1">{count(list.length, W.note)}</span>
                          </h3>
                          <ul className="grid gap-x-5 gap-y-6 lg:grid-cols-2">
                            {list.map((it) => (
                              <li key={it.productId} className="min-w-0">
                                <NoteLibraryRow item={it} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
