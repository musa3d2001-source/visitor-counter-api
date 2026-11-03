import Link from "next/link";
import type * as React from "react";
import { CircleDashed, Eye, EyeOff, FileText, Layers, Lock, Pencil, PlayCircle, Plus, Send, Undo2 } from "lucide-react";
import { catalogOptions, listAdminProducts, teacherOptions, type AdminProductRow } from "@/server/admin/products";
import { requireStaff } from "@/server/auth/permissions";
import { storage } from "@/server/storage";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ProductStatusBadge } from "@/components/admin/status-badge";
import { ActionForm } from "@/components/admin/action-form";
import { QuickAction } from "@/components/admin/confirm-button";
import { FilterBar, FilterSearch, FilterSubmit, ResultCount, Toolbar } from "@/components/admin/filter-bar";
import { STRETCHED_FOCUS } from "@/components/admin/tones";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { subjectSlugFromName } from "@/components/site/card-parts";
import { W, ar, count, gradeClass, toneClass, type CountWord } from "@/lib/design";
import { filsToKwdString } from "@/lib/money";
import { PRODUCT_STATUSES, PRODUCT_STATUS_LABELS, PRODUCT_TYPES, PRODUCT_TYPE_LABELS, type ProductStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { CatalogBand } from "../_components/catalog/band";
import { PostersArt } from "../_components/catalog/art";
import { PillTabs, type PillTab } from "../_components/catalog/pill-tabs";
import { AdminThumb } from "../_components/catalog/thumb";
import { setStatusAction, updateSortAction } from "./actions";

export const metadata = { title: "المذكرات والمنتجات" };

type SP = {
  q?: string;
  grade?: string;
  subject?: string;
  type?: string;
  status?: string;
  teacher?: string;
  deleted?: string;
};

const FILE_WORD: CountWord = {
  one: "ملف",
  two: "ملفان",
  plural: "ملفات",
  acc: "ملفًا",
};
const STATUS_TONES = {
  published: "green",
  draft: "gold",
  in_review: "coral",
  hidden: "slate",
  archived: "slate",
} as const;

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireStaff();
  const owner = actor.kind === "owner";
  const sp = await searchParams;
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const filters = {
    q: sp.q?.slice(0, 80),
    gradeId: uuid(sp.grade),
    subjectId: uuid(sp.subject),
    type: PRODUCT_TYPES.includes(sp.type as never) ? sp.type : undefined,
    status: PRODUCT_STATUSES.includes(sp.status as never) ? sp.status : undefined,
    teacherId: owner ? (sp.teacher === "none" ? "none" : uuid(sp.teacher)) : undefined,
  };
  const [products, { grades, subjects }, teachers, unfiltered] = await Promise.all([
    listAdminProducts(actor, filters),
    catalogOptions(),
    owner ? teacherOptions() : Promise.resolve([]),
    // لأعداد تبويبات الحالة: نفس التصفية بدون الحالة (قراءة فقط)
    filters.status ? listAdminProducts(actor, { ...filters, status: undefined }) : Promise.resolve(null),
  ]);
  const filtered = Boolean(filters.q || filters.gradeId || filters.subjectId || filters.type || filters.status || filters.teacherId);
  const levelOf = new Map(grades.map((g) => [g.id, g.level]));

  // أعداد حقيقية لكل حالة ضمن التصفية الحالية (المؤرشف لا يُعدّ إلا عند اختياره)
  const pool = unfiltered ?? products;
  const byStatus = new Map<string, number>();
  for (const p of pool) byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);
  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries({
    q: filters.q,
    grade: filters.gradeId,
    subject: filters.subjectId,
    type: filters.type,
    teacher: filters.teacherId,
  }))
    if (v) keep.set(k, v);
  const hrefFor = (status?: string) => {
    const p = new URLSearchParams(keep);
    if (status) p.set("status", status);
    const s = p.toString();
    return s ? `/admin/products?${s}` : "/admin/products";
  };
  const tabs: PillTab[] = [
    {
      href: hrefFor(),
      label: "الكل",
      active: !filters.status,
      count: pool.length,
      tone: "sky",
    },
    ...PRODUCT_STATUSES.map((s) => ({
      href: hrefFor(s),
      label: PRODUCT_STATUS_LABELS[s],
      active: filters.status === s,
      count: s === "archived" ? (filters.status === "archived" ? products.length : null) : (byStatus.get(s) ?? 0),
      tone: STATUS_TONES[s],
    })),
  ];

  // تجميع حسب الصف (القائمة مرتبة بالصف أصلًا)
  const groups: {
    id: string;
    name: string;
    level: number | null;
    items: AdminProductRow[];
  }[] = [];
  for (const p of products) {
    const last = groups.at(-1);
    if (last && last.id === p.grade_id) last.items.push(p);
    else
      groups.push({
        id: p.grade_id,
        name: p.grade_name,
        level: levelOf.get(p.grade_id) ?? null,
        items: [p],
      });
  }

  const canAdd = !(actor.kind === "teacher" && !actor.canUpload);

  return (
    <div className="space-y-6">
      <CatalogBand tone="sky" art={<PostersArt />} footer={<PillTabs items={tabs} label="تصفية حسب الحالة" />}>
        <AdminPageHeader
          className="mb-0 sm:mb-0"
          title={owner ? "المحتوى والمنتجات" : "محتواي"}
          description={owner ? "الفيديوهات والمذكرات والباقات، الأسعار والظهور والمراجعة" : "أنشئ دروسك ومراجعاتك وملفاتك، ثم أرسلها للمراجعة قبل النشر"}
          actions={
            canAdd ? (
              <Button asChild variant="accent">
                <Link href="/admin/products/new">
                  <Plus aria-hidden /> {owner ? "إضافة منتج" : "إضافة محتوى"}
                </Link>
              </Button>
            ) : (
              <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-warning-50 px-4 font-display text-sm font-extrabold text-warning ring-1 ring-accent-700/20 ring-inset">
                <Lock className="size-4" aria-hidden /> صلاحية الرفع موقوفة حاليًا
              </span>
            )
          }
        />
      </CatalogBand>

      {sp.deleted ? <Alert tone="success">تم حذف المنتج نهائيًا.</Alert> : null}

      <div>
        <FilterBar label="البحث في المنتجات" className={"grid-cols-2 " + (owner ? "lg:grid-cols-[2fr_repeat(4,minmax(0,1fr))_auto]" : "lg:grid-cols-[2fr_repeat(3,minmax(0,1fr))_auto]")}>
          <FilterSearch defaultValue={sp.q} placeholder="ابحث بالعنوان أو الرابط" className="col-span-2 lg:col-span-1" />
          <Select name="grade" defaultValue={filters.gradeId ?? ""} aria-label="الصف">
            <option value="">كل الصفوف</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Select name="subject" defaultValue={filters.subjectId ?? ""} aria-label="المادة">
            <option value="">كل المواد</option>
            {subjects
              .filter((s) => !filters.gradeId || s.grade_id === filters.gradeId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {filters.gradeId ? "" : `، ${grades.find((g) => g.id === s.grade_id)?.name ?? ""}`}
                </option>
              ))}
          </Select>
          <Select name="type" defaultValue={filters.type ?? ""} aria-label="النوع">
            <option value="">كل الأنواع</option>
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PRODUCT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          {owner ? (
            <Select name="teacher" defaultValue={filters.teacherId ?? ""} aria-label="المعلم">
              <option value="">كل المعلمين</option>
              <option value="none">محتوى المنصة</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name}
                </option>
              ))}
            </Select>
          ) : null}
          {/* الحالة تُختار من التبويبات أعلاه؛ تبقى مع النموذج عند التصفية */}
          {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
          <FilterSubmit resetHref="/admin/products" active={filtered} className="col-span-2 lg:col-span-1" />
        </FilterBar>

        {products.length === 0 ? (
          <EmptyState
            art={filtered ? "search" : "video"}
            title={filtered ? "لا توجد نتائج مطابقة" : "لا توجد منتجات بعد"}
            description={
              filtered ? "جرّب تغيير معايير البحث." : owner ? "ابدأ بإضافة أول منتج: اختر الصف والمادة والنوع ثم ارفع الفيديو أو ملف PDF." : "ابدأ بإضافة أول محتوى: شرح وحدة، مراجعة اختبار، أو مذكرة."
            }
            action={
              filtered ? (
                <Button asChild variant="outline">
                  <Link href="/admin/products">إزالة التصفية</Link>
                </Button>
              ) : canAdd ? (
                <Button asChild>
                  <Link href="/admin/products/new">إضافة منتج</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <Toolbar
              start={<ResultCount>{count(products.length, W.product)}</ResultCount>}
              end={
                filters.status ? (
                  <span className="text-[0.85rem] text-muted">
                    الحالة: <b className="font-display font-extrabold text-ink">{PRODUCT_STATUS_LABELS[filters.status as ProductStatus]}</b>
                  </span>
                ) : (
                  <span className="text-[0.85rem] text-muted">كل الحالات (عدا المؤرشف)</span>
                )
              }
            />
            <div className="space-y-7">
              {groups.map((g, gi) => (
                <section key={`${g.id}-${gi}`} aria-labelledby={`grp-${gi}`}>
                  <div className={cn("mb-3 flex items-center gap-3", gradeClass(g.level))}>
                    <span className="num-tile size-11 rounded-[0.9rem] text-[1.35rem] shadow-[0_4px_0_var(--d)]" aria-hidden>
                      {g.level != null ? ar(g.level) : "؟"}
                    </span>
                    <h2 id={`grp-${gi}`} className="font-display text-[1.3rem] leading-tight font-black text-ink">
                      {g.name}
                    </h2>
                    <span className="chip">{count(g.items.length, W.product)}</span>
                    <span className="h-1 min-w-6 flex-1 rounded-full bg-linear-to-l from-[var(--a)] via-[var(--m,var(--a))] to-transparent opacity-50" aria-hidden />
                  </div>
                  <ul className="flex flex-col gap-2.5">
                    {g.items.map((p) => (
                      <ProductListRow key={p.id} p={p} owner={owner} level={g.level} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProductListRow({ p, owner, level }: { p: AdminProductRow; owner: boolean; level: number | null }) {
  const slug = subjectSlugFromName(p.subject_name);
  const proposedOnly = p.teacher_id && p.status !== "published" && p.price_fils === 0 && p.proposed_price_fils !== null;
  const coverUrl = p.cover_key ? storage().publicUrl(p.cover_key) : null;
  const chips = [
    p.lessons
      ? {
          key: "l",
          icon: <PlayCircle aria-hidden />,
          text: count(p.lessons, W.lesson),
        }
      : null,
    p.main_files
      ? {
          key: "f",
          icon: <FileText aria-hidden />,
          text: count(p.main_files, FILE_WORD),
        }
      : null,
    p.items
      ? {
          key: "i",
          icon: <Layers aria-hidden />,
          text: `${count(p.items, W.item)} مضمّنة`,
        }
      : null,
    p.has_preview ? { key: "p", icon: <Eye aria-hidden />, text: "معاينة مجانية" } : null,
  ].filter(Boolean) as { key: string; icon: React.ReactNode; text: string }[];

  return (
    <li
      className={cn(
        "relative rounded-[1.4rem] border border-[rgb(23_32_38/0.06)] bg-surface p-3 shadow-[0_3px_0_var(--color-line),0_10px_24px_-20px_rgb(23_32_38/0.35)] transition-shadow hover:shadow-[0_3px_0_var(--color-line-strong),0_18px_30px_-18px_rgb(23_32_38/0.35)] sm:p-3.5",
        STRETCHED_FOCUS,
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-5">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center sm:gap-4">
          <AdminThumb type={p.type} subjectName={p.subject_name} gradeLevel={level} coverUrl={coverUrl} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8rem] leading-6 text-muted">
              <span className={cn("chip min-h-6 px-2.5 text-[0.75rem]", slug ? toneClass(slug) : "tone-default")}>{PRODUCT_TYPE_LABELS[p.type]}</span>
              <span>
                {p.subject_name ?? "كل المواد"}
                {owner ? ` · ${p.teacher_name ?? "محتوى المنصة"}` : ""}
              </span>
            </p>
            <Link href={`/admin/products/${p.id}`} className="stretched mt-0.5 line-clamp-2 font-display text-[1rem] leading-snug font-extrabold text-ink hover:text-brand-700">
              {p.title}
            </Link>
            {chips.length || (p.status === "draft" && p.review_note) ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {p.status === "draft" && p.review_note ? (
                  <span className="chip chip-coral min-h-6 text-[0.75rem]">
                    <Undo2 aria-hidden /> أُعيد للتعديل
                  </span>
                ) : null}
                {chips.map((c) => (
                  <span key={c.key} className="chip min-h-6 bg-mist px-2.5 text-[0.75rem] text-ink-soft">
                    {c.icon}
                    {c.text}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-1.5">
                <span className="chip min-h-6 bg-mist px-2.5 text-[0.75rem] text-muted">
                  <CircleDashed aria-hidden /> لا يوجد محتوى مرفوع بعد
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="relative z-[2] flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-line pt-3 lg:flex-nowrap lg:border-t-0 lg:border-s-2 lg:ps-5 lg:pt-0">
          <div className="lg:min-w-[6.5rem]">
            {proposedOnly ? (
              <p className="leading-tight">
                <span className="block font-display text-[0.72rem] font-bold text-muted">سعر مقترح</span>
                <span className="font-display text-[1.05rem] font-black text-ink-soft">
                  <span className="num">{filsToKwdString(p.proposed_price_fils!)}</span> <span className="text-[0.75rem]">د.ك</span>
                </span>
              </p>
            ) : (
              <p className="leading-tight">
                <span className="font-display text-[1.15rem] font-black text-brand-800">
                  <span className="num">{filsToKwdString(p.price_fils)}</span> <span className="text-[0.75rem] text-muted">د.ك</span>
                </span>
                {p.compare_at_price_fils && p.compare_at_price_fils > p.price_fils ? (
                  <span className="num block text-[0.78rem] text-muted line-through">
                    <span className="sr-only">السعر السابق </span>
                    {filsToKwdString(p.compare_at_price_fils)}
                  </span>
                ) : null}
              </p>
            )}
          </div>
          <p className="flex items-baseline gap-1.5 leading-tight lg:block lg:min-w-[4.5rem]">
            <span className="font-display text-[0.72rem] font-bold text-muted lg:block">المبيعات</span>
            <span className="font-display text-[1.05rem] font-black text-ink">{ar(p.sold)}</span>
          </p>
          <div className="max-lg:ms-auto lg:min-w-[8.5rem]">
            <ProductStatusBadge status={p.status} />
          </div>
          {owner ? (
            <ActionForm action={updateSortAction} compact className="flex items-center gap-1 max-lg:basis-auto">
              <input type="hidden" name="id" value={p.id} />
              <span className="font-display text-[0.72rem] font-bold text-muted" aria-hidden>
                الترتيب
              </span>
              <Input name="sortOrder" type="number" defaultValue={p.sort_order} className="num h-11 w-[4.5rem] px-2 text-center text-sm" aria-label="ترتيب العرض" />
              <Button type="submit" size="sm" variant="soft" className="h-11">
                حفظ
              </Button>
            </ActionForm>
          ) : null}
          <div className="ms-auto flex items-center gap-1 lg:ms-0">
            <Button asChild size="icon" variant="ghost" title="تعديل">
              <Link href={`/admin/products/${p.id}`} aria-label={`تعديل ${p.title}`}>
                <Pencil aria-hidden />
              </Link>
            </Button>
            {!owner ? null : p.status === "published" ? (
              <QuickAction action={setStatusAction} hidden={{ id: p.id, status: "hidden" }} icon={<EyeOff aria-hidden />} variant="ghost" size="icon" title="إخفاء" />
            ) : p.status !== "archived" && p.status !== "in_review" ? (
              <QuickAction action={setStatusAction} hidden={{ id: p.id, status: "published" }} icon={<Send aria-hidden />} variant="ghost" size="icon" title="نشر" />
            ) : null}
            {p.status === "published" ? (
              <Button asChild size="icon" variant="ghost" title="عرض كما يراه الطالب">
                <Link href={`/products/${p.slug}`} target="_blank" aria-label="عرض في الموقع">
                  <Eye aria-hidden />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
