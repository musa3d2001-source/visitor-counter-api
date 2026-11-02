import Link from "next/link";
import { Eye, EyeOff, FileText, Pencil, Plus, Search, Send } from "lucide-react";
import { catalogOptions, listAdminProducts, teacherOptions } from "@/server/admin/products";
import { requireStaff } from "@/server/auth/permissions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ProductStatusBadge } from "@/components/admin/status-badge";
import { ActionForm } from "@/components/admin/action-form";
import { QuickAction } from "@/components/admin/confirm-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";
import { PRODUCT_STATUSES, PRODUCT_STATUS_LABELS, PRODUCT_TYPES, PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { setStatusAction, updateSortAction } from "./actions";

export const metadata = { title: "المذكرات والمنتجات" };

type SP = { q?: string; grade?: string; subject?: string; type?: string; status?: string; teacher?: string; deleted?: string };

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
  const [products, { grades, subjects }, teachers] = await Promise.all([listAdminProducts(actor, filters), catalogOptions(), owner ? teacherOptions() : Promise.resolve([])]);
  const filtered = Boolean(filters.q || filters.gradeId || filters.subjectId || filters.type || filters.status || filters.teacherId);

  return (
    <div>
      <AdminPageHeader
        title={owner ? "المحتوى والمنتجات" : "محتواي"}
        description={owner ? "الفيديوهات والمذكرات والباقات، الأسعار والظهور والمراجعة" : "أنشئ دروسك ومراجعاتك وملفاتك، ثم أرسلها للمراجعة قبل النشر"}
        actions={
          actor.kind === "teacher" && !actor.canUpload ? (
            <span className="rounded-lg bg-warning-50 px-3 py-2 text-sm font-semibold text-warning">صلاحية الرفع موقوفة حاليًا</span>
          ) : (
            <Button asChild>
              <Link href="/admin/products/new">
                <Plus aria-hidden /> {owner ? "إضافة منتج" : "إضافة محتوى"}
              </Link>
            </Button>
          )
        }
      />
      {sp.deleted ? <Alert tone="success" className="mb-4">تم حذف المنتج نهائيًا.</Alert> : null}

      <form className={`mb-5 grid gap-2 rounded-lg border border-line bg-surface p-3 sm:grid-cols-2 ${owner ? "lg:grid-cols-7" : "lg:grid-cols-6"}`} role="search">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input name="q" defaultValue={sp.q} placeholder="ابحث بالعنوان أو الرابط" className="ps-9" aria-label="بحث" />
        </div>
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
        <div className="flex gap-2">
          <Select name="status" defaultValue={filters.status ?? ""} aria-label="الحالة">
            <option value="">كل الحالات (عدا المؤرشف)</option>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PRODUCT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            تصفية
          </Button>
        </div>
      </form>

      {products.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={filtered ? "لا توجد نتائج مطابقة" : "لا توجد منتجات بعد"}
          description={filtered ? "جرّب تغيير معايير البحث." : owner ? "ابدأ بإضافة أول منتج: اختر الصف والمادة والنوع ثم ارفع الفيديو أو ملف PDF." : "ابدأ بإضافة أول محتوى: شرح وحدة، مراجعة اختبار، أو مذكرة."}
          action={
            filtered ? (
              <Button asChild variant="outline">
                <Link href="/admin/products">إزالة التصفية</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/admin/products/new">إضافة منتج</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            <span className="num">{products.length}</span> منتج
          </p>
          <Table>
            <THead>
              <tr>
                <TH>المنتج</TH>
                <TH>الصف / المادة</TH>
                <TH>السعر</TH>
                <TH>المحتوى</TH>
                <TH>المبيعات</TH>
                <TH>الحالة</TH>
                {owner ? <TH>الترتيب</TH> : null}
                <TH>إجراءات</TH>
              </tr>
            </THead>
            <tbody>
              {products.map((p) => (
                <TR key={p.id}>
                  <TD className="max-w-72">
                    <Link href={`/admin/products/${p.id}`} className="line-clamp-2 font-semibold hover:text-brand-700">
                      {p.title}
                    </Link>
                    <p className="text-xs text-muted">
                      {PRODUCT_TYPE_LABELS[p.type]}
                      {owner ? `، ${p.teacher_name ?? "محتوى المنصة"}` : ""}
                    </p>
                    {p.status === "draft" && p.review_note ? <p className="mt-1 text-xs font-semibold text-warning">أُعيد للتعديل</p> : null}
                  </TD>
                  <TD className="text-xs">
                    <p className="font-semibold text-ink-soft">{p.grade_name}</p>
                    <p className="text-muted">{p.subject_name ?? "—"}</p>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {p.teacher_id && p.status !== "published" && p.price_fils === 0 && p.proposed_price_fils !== null ? (
                      <span className="text-xs text-muted">
                        مقترح: <span className="num">{filsToKwdString(p.proposed_price_fils)}</span>
                      </span>
                    ) : (
                      <>
                        <span className="num font-semibold">{filsToKwdString(p.price_fils)}</span> د.ك
                        {p.compare_at_price_fils ? <p className="num text-xs text-muted line-through">{filsToKwdString(p.compare_at_price_fils)}</p> : null}
                      </>
                    )}
                  </TD>
                  <TD className="text-xs text-muted">
                    {[
                      p.lessons ? `${p.lessons} درس` : null,
                      p.main_files ? `${p.main_files} ملف` : null,
                      p.items ? `${p.items} عنصر مضمّن` : null,
                      p.has_preview ? "معاينة" : null,
                    ]
                      .filter(Boolean)
                      .join("، ") || "—"}
                  </TD>
                  <TD className="num">{p.sold}</TD>
                  <TD>
                    <ProductStatusBadge status={p.status} />
                  </TD>
                  {owner ? (
                    <TD>
                      <ActionForm action={updateSortAction} compact className="flex items-center gap-1">
                        <input type="hidden" name="id" value={p.id} />
                        <Input name="sortOrder" type="number" defaultValue={p.sort_order} className="num h-9 w-20 px-2 text-sm" aria-label="ترتيب العرض" />
                        <Button type="submit" size="sm" variant="ghost">
                          حفظ
                        </Button>
                      </ActionForm>
                    </TD>
                  ) : null}
                  <TD>
                    <div className="flex items-center gap-1">
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
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
