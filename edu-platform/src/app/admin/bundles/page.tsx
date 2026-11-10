import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { requireOwnerPage } from "@/server/auth/permissions";
import Link from "next/link";
import { Layers, Package, Pencil, Plus, ShoppingBag, Wallet } from "lucide-react";
import { catalogOptions, getBundleItemsAdmin, listBundlesAdmin } from "@/server/admin/products";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ProductStatusBadge } from "@/components/admin/status-badge";
import { ResultCount } from "@/components/admin/filter-bar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BundleStack, SubjectIcon } from "@/components/art";
import { subjectSlugFromName } from "@/components/site/card-parts";
import { W, ar, count, gradeClass, gradeTone, subjectTone, toneClass } from "@/lib/design";
import { filsToKwdString } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CatalogBand } from "../_components/catalog/band";
import { BundleArt } from "../_components/catalog/art";

export const metadata = { title: "الباقات" };

export default async function BundlesPage() {
  await requireOwnerPage();
  const [bundles, { grades }] = await Promise.all([listBundlesAdmin(), catalogOptions()]);
  // محتويات كل باقة (لألوان الأوراق وأيقونات المواد الحقيقية)
  const itemsById = new Map(await Promise.all(bundles.map(async (b) => [b.id, await getBundleItemsAdmin(b.id)] as const)));
  const levelByName = new Map(grades.map((g) => [g.name, g.level]));

  return (
    <div className="space-y-6">
      <CatalogBand tone="coral" art={<BundleArt />}>
        <AdminPageHeader
          className="mb-0 sm:mb-0"
          title="الباقات والدورات"
          description="الباقات والدورات والوحدات التي تضم محتويات أخرى (فيديوهات ومذكرات). المشتري يحصل على كل المحتويات ولا تُكرر الصلاحيات."
          actions={
            <Button asChild variant="accent">
              <Link prefetch={false} href="/admin/products/new?type=bundle">
                <Plus aria-hidden /> باقة جديدة
              </Link>
            </Button>
          }
        />
      </CatalogBand>
      {bundles.length === 0 ? (
        <EmptyState
          art="library"
          title="لا توجد باقات بعد"
          description="أنشئ باقة مثل «باقة المراجعة النهائية» أو «باقة الصف كاملًا» ثم أضف إليها المذكرات."
          action={
            <Button asChild>
              <Link prefetch={false} href="/admin/products/new?type=bundle">إنشاء باقة</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ResultCount>
            {count(bundles.length, {
              one: "باقة",
              two: "باقتان",
              plural: "باقات",
              acc: "باقة",
              oneSuffix: "واحدة",
            })}
          </ResultCount>
          <ul className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
            {bundles.map((b) => {
              const saving = b.items_total - b.price_fils;
              const level = levelByName.get(b.grade_name) ?? null;
              const items = itemsById.get(b.id) ?? [];
              const slugs = [...new Set(items.map((i) => subjectSlugFromName(i.subject_name)).filter((x): x is string => Boolean(x)))];
              const g = gradeTone(level);
              const colors = slugs.length ? slugs.map((sl) => subjectTone(sl).to) : ["#ffffff", g.from, g.to];
              return (
                <li key={b.id} className="min-w-0">
                  <article className={cn("tile-3d flex h-full flex-col overflow-hidden", gradeClass(level))}>
                    <div className="poster poster-grade relative h-40 rounded-none">
                      <span className="absolute start-4 top-3 font-display text-[4.5rem] leading-none font-black text-white/90 drop-shadow-[0_4px_0_rgb(0_0_0/0.12)]" aria-hidden>
                        {level != null ? ar(level) : ""}
                      </span>
                      <span className="absolute inset-x-8 -bottom-6 top-4" aria-hidden>
                        <BundleStack colors={colors} />
                      </span>
                      <span className="absolute end-3 top-3">
                        <ProductStatusBadge status={b.status} />
                      </span>
                      {saving > 0 && b.price_fils > 0 ? (
                        <span className="absolute end-3 bottom-3 inline-flex rotate-[-4deg] items-center gap-1 rounded-full bg-accent-600 px-3 py-1 font-display text-[0.82rem] font-black text-accent-900 shadow-[0_4px_0_var(--accent-edge)]">
                          توفير <span className="num">{filsToKwdString(saving)}</span> د.ك
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col p-4 sm:p-5">
                      <p className="flex flex-wrap items-center gap-1.5 text-[0.8rem] text-muted">
                        <span className="chip min-h-6 px-2.5 text-[0.75rem]">{PRODUCT_TYPE_LABELS[b.type]}</span>
                        <span>
                          {b.grade_name}
                          {b.teacher_name ? ` · ${b.teacher_name}` : ""}
                        </span>
                      </p>
                      <h2 className="mt-2 font-display text-[1.1rem] leading-snug font-black text-ink">
                        <Link prefetch={false} href={`/admin/products/${b.id}`} className="stretched hover:text-brand-700">
                          {b.title}
                        </Link>
                      </h2>
                      {slugs.length ? (
                        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="المواد في الباقة">
                          {slugs.map((sl) => (
                            <li key={sl} className={cn("icon-tile size-8 rounded-[0.6rem] [&_svg]:size-4", toneClass(sl))}>
                              <SubjectIcon slug={sl} size={16} />
                              <span className="sr-only">{items.find((i) => subjectSlugFromName(i.subject_name) === sl)?.subject_name}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <Stat
                          icon={<Layers aria-hidden />}
                          label="المحتويات"
                          value={count(b.item_count, {
                            ...W.item,
                            none: "بلا محتويات",
                          })}
                        />
                        <Stat icon={<Wallet aria-hidden />} label="قيمتها منفردة" value={<span className="num">{filsToKwdString(b.items_total)}</span>} />
                        <Stat icon={<ShoppingBag aria-hidden />} label="المبيعات" value={ar(b.sold)} />
                      </dl>
                      <div className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-line pt-4">
                        <p className="font-display leading-tight">
                          <span className="block text-[0.72rem] font-bold text-muted">سعر الباقة</span>
                          <span className="text-[1.45rem] font-black text-brand-800">
                            <span className="num">{filsToKwdString(b.price_fils)}</span> <span className="text-[0.8rem] text-muted">د.ك</span>
                          </span>
                        </p>
                        <Button asChild size="sm" variant="soft" className="relative z-[2]">
                          <Link prefetch={false} href={`/admin/products/${b.id}`} aria-label={`تعديل ${b.title}`}>
                            <Pencil aria-hidden /> تعديل
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {bundles.length ? (
        <p className="flex items-center gap-2 text-[0.85rem] text-muted">
          <Package className="size-4 text-coral-700" aria-hidden /> التوفير يُحسب من مجموع أسعار المحتويات منفردة مقارنة بسعر الباقة.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl bg-[var(--soft)] px-1.5 py-2">
      <dt className="flex items-center justify-center gap-1 font-display text-[0.7rem] font-bold text-[var(--tink)] [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-display text-[0.92rem] font-black text-ink">{value}</dd>
    </div>
  );
}
