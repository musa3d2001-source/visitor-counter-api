import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Archive, CircleCheck, Circle, Eye, EyeOff, FileText, Package, PlayCircle, RotateCcw, Send, Trash2 } from "lucide-react";
import {
  bundleCandidates,
  catalogOptions,
  getAdminProduct,
  getBundleItemsAdmin,
  getLessonsAdmin,
  getProductFiles,
  publishBlockers,
} from "@/server/admin/products";
import { storage } from "@/server/storage";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { ProductStatusBadge } from "@/components/admin/status-badge";
import { FileUploader } from "@/components/admin/file-uploader";
import { LessonUploader } from "@/components/admin/lesson-uploader";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton, QuickAction } from "@/components/admin/confirm-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { filsToKwdString } from "@/lib/money";
import { PDF_PRODUCT_TYPES, PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import {
  addBundleItemAction,
  addBunnyLessonAction,
  deleteFileAction,
  deleteLessonAction,
  deleteProductAction,
  moveFileAction,
  moveLessonAction,
  regeneratePreviewAction,
  removeBundleItemAction,
  removeCoverAction,
  renameFileAction,
  setStatusAction,
  updateLessonAction,
  updateProductAction,
} from "../actions";

export const metadata = { title: "تعديل منتج" };

function fmtSize(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} م.ب` : `${Math.max(1, Math.round(n / 1024))} ك.ب`;
}

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const product = await getAdminProduct(id);
  if (!product) notFound();
  const isPdf = PDF_PRODUCT_TYPES.includes(product.type);
  const [files, blockers, options, bundleItems, candidates, lessons] = await Promise.all([
    getProductFiles(id),
    publishBlockers(id),
    catalogOptions(),
    product.type === "bundle" ? getBundleItemsAdmin(id) : Promise.resolve([]),
    product.type === "bundle" ? bundleCandidates(id, product.grade_id) : Promise.resolve([]),
    product.type === "video_course" ? getLessonsAdmin(id) : Promise.resolve([]),
  ]);
  const mainFiles = files.filter((f) => f.kind === "main");
  const preview = files.find((f) => f.kind === "preview");
  const coverUrl = product.cover_key ? storage().publicUrl(product.cover_key) : null;
  const itemsTotal = bundleItems.reduce((s, i) => s + i.price_fils, 0);

  const checklist = [
    { done: true, label: "البيانات الأساسية والسعر" },
    ...(isPdf ? [{ done: mainFiles.length > 0, label: "رفع ملف PDF واحد على الأقل" }] : []),
    ...(product.type === "bundle" ? [{ done: bundleItems.length > 0, label: "إضافة منتجات إلى الباقة" }] : []),
    ...(product.type === "video_course" ? [{ done: lessons.some((l) => l.is_published), label: "إضافة درس فيديو منشور" }] : []),
    ...(isPdf ? [{ done: Boolean(preview), label: "معاينة مجانية (اختياري)", optional: true }] : []),
    { done: Boolean(coverUrl), label: "صورة غلاف (اختياري)", optional: true },
  ];

  return (
    <div>
      <AdminPageHeader
        title={product.title}
        description={`${PRODUCT_TYPE_LABELS[product.type]} · ${product.grade_name}${product.subject_name ? ` · ${product.subject_name}` : ""}`}
        crumbs={[{ label: "المذكرات والمنتجات", href: "/admin/products" }, { label: "تعديل" }]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/products/${product.slug}`} target="_blank">
              <Eye aria-hidden /> معاينة كما يراها الطالب
            </Link>
          </Button>
        }
      />
      {sp.created ? (
        <Alert tone="success" title="تم إنشاء المسودة" className="mb-5">
          الخطوة التالية: {isPdf ? "ارفع ملف PDF للمذكرة" : product.type === "bundle" ? "أضف المنتجات إلى الباقة" : "أضف دروس الفيديو"}، ثم انشر المنتج.
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {isPdf ? (
            <Section id="files" title="ملفات المذكرة" description="الملفات الأصلية تُحفظ في تخزين خاص ولا تُعرض إلا لمن اشترى المنتج.">
              <FileUploader target="main" productId={id} accept="application/pdf,.pdf" multiple label="اسحب ملفات PDF هنا أو اضغط للاختيار" hint="PDF فقط · حتى 100 ميجابايت للملف · يمكن رفع عدة ملفات" />
              {mainFiles.length ? (
                <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                  {mainFiles.map((f, i) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                      <FileText className="hidden size-5 shrink-0 text-brand-600 sm:block" aria-hidden />
                      <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                        <ActionForm action={renameFileAction} compact className="flex items-center gap-1.5">
                          <input type="hidden" name="productId" value={id} />
                          <input type="hidden" name="fileId" value={f.id} />
                          <Input name="title" defaultValue={f.title} className="h-9 text-sm" aria-label="اسم الملف" maxLength={160} />
                          <Button type="submit" size="sm" variant="ghost">
                            حفظ
                          </Button>
                        </ActionForm>
                        <p className="mt-1 text-xs text-muted">
                          <span className="num">{f.page_count ?? "?"}</span> صفحة · <span className="num">{fmtSize(f.size_bytes)}</span> · {formatDateTime(f.created_at)}
                        </p>
                      </div>
                      <div className="ms-auto flex items-center gap-1">
                        <QuickAction action={moveFileAction} hidden={{ productId: id, fileId: f.id, dir: "up" }} icon={<ArrowUp aria-hidden />} variant="ghost" size="icon" title="تحريك لأعلى" />
                        <QuickAction action={moveFileAction} hidden={{ productId: id, fileId: f.id, dir: "down" }} icon={<ArrowDown aria-hidden />} variant="ghost" size="icon" title="تحريك لأسفل" />
                        <Button asChild variant="ghost" size="icon" title="فتح الملف">
                          <Link href={`/read/${f.id}`} target="_blank" aria-label={`فتح ${f.title}`}>
                            <Eye aria-hidden />
                          </Link>
                        </Button>
                        <ConfirmButton
                          action={deleteFileAction}
                          hidden={{ productId: id, fileId: f.id }}
                          label=""
                          icon={<Trash2 aria-hidden />}
                          size="icon"
                          variant="ghost"
                          title="حذف الملف؟"
                          description={`سيتم حذف «${f.title}» نهائيًا من التخزين.${i === 0 ? " هذا هو الملف الأول — ستُعاد توليد المعاينة." : ""}`}
                          confirmLabel="حذف"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl bg-canvas p-4 text-center text-sm text-muted">لم يُرفع أي ملف بعد.</p>
              )}
            </Section>
          ) : null}

          {isPdf ? (
            <Section title="المعاينة المجانية" description={`تُولَّد تلقائيًا من أول ${product.preview_pages} صفحات من الملف الأول، أو ارفع ملف معاينة مخصص.`}>
              {preview ? (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                  <Eye className="size-5 text-brand-600" aria-hidden />
                  <div className="flex-1 text-sm">
                    <p className="font-semibold">{preview.is_auto_preview ? "معاينة تلقائية" : "معاينة مخصصة (مرفوعة يدويًا)"}</p>
                    <p className="text-xs text-muted">
                      <span className="num">{preview.page_count ?? "?"}</span> صفحة · متاحة للجميع بدون تسجيل
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/read/${preview.id}`} target="_blank">
                      فتح
                    </Link>
                  </Button>
                </div>
              ) : (
                <p className="mb-4 rounded-xl bg-canvas p-3 text-sm text-muted">لا توجد معاينة حاليًا{product.preview_pages === 0 ? " (عدد صفحات المعاينة = 0)" : mainFiles.length ? "" : " — ارفع ملفًا أولًا"}.</p>
              )}
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <FileUploader target="preview" productId={id} accept="application/pdf,.pdf" label="رفع معاينة مخصصة (PDF)" compact />
                <div className="flex flex-col gap-2">
                  <QuickAction action={regeneratePreviewAction} hidden={{ productId: id, dropCustom: "1" }} icon={<RotateCcw aria-hidden />} label="توليد تلقائي" />
                </div>
              </div>
            </Section>
          ) : null}

          {product.type === "bundle" ? (
            <Section
              title="محتويات الباقة"
              description="المنتجات من نفس الصف. الطالب الذي يشتري الباقة يحصل على كل محتوياتها (ولا تُحتسب المكررة)."
            >
              {bundleItems.length ? (
                <>
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {bundleItems.map((it) => (
                      <li key={it.product_id} className="flex items-center gap-3 p-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <Link href={`/admin/products/${it.product_id}`} className="font-semibold hover:text-brand-700">
                            {it.title}
                          </Link>
                          <p className="text-xs text-muted">
                            {PRODUCT_TYPE_LABELS[it.type]} · {it.subject_name ?? "—"} {it.status !== "published" ? "· غير منشور" : ""}
                          </p>
                        </div>
                        <span className="num whitespace-nowrap">{filsToKwdString(it.price_fils)} د.ك</span>
                        <QuickAction action={removeBundleItemAction} hidden={{ bundleId: id, productId: it.product_id }} icon={<Trash2 aria-hidden />} variant="ghost" size="icon" title="إزالة من الباقة" />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-muted">
                    قيمة المحتويات منفردة: <span className="num font-bold text-ink">{filsToKwdString(itemsTotal)}</span> د.ك · سعر الباقة:{" "}
                    <span className="num font-bold text-ink">{filsToKwdString(product.price_fils)}</span> د.ك
                    {itemsTotal > product.price_fils ? (
                      <>
                        {" "}
                        · توفير <span className="num font-bold text-success">{filsToKwdString(itemsTotal - product.price_fils)}</span> د.ك
                      </>
                    ) : null}
                  </p>
                </>
              ) : (
                <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">الباقة فارغة. أضف منتجات من القائمة أدناه.</p>
              )}
              {candidates.length ? (
                <ActionForm action={addBundleItemAction} className="mt-5">
                  <input type="hidden" name="bundleId" value={id} />
                  <p className="mb-2 text-sm font-semibold">إضافة منتجات من {product.grade_name}</p>
                  <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
                    {candidates.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-brand-50">
                        <input type="checkbox" name="productId" value={c.id} className="size-4 accent-[var(--brand)]" />
                        <span className="min-w-0 flex-1">
                          {c.title}
                          <span className="block text-xs text-muted">
                            {c.subject_name ?? "—"} · {PRODUCT_TYPE_LABELS[c.type]} {c.status !== "published" ? "· غير منشور" : ""}
                          </span>
                        </span>
                        <span className="num text-xs whitespace-nowrap">{filsToKwdString(c.price_fils)}</span>
                      </label>
                    ))}
                  </div>
                  <SubmitButton size="sm" variant="secondary" className="mt-3">
                    إضافة المحدد إلى الباقة
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </Section>
          ) : null}

          {product.type === "video_course" ? (
            <Section title="دروس الفيديو" description="ارفع ملفات MP4 إلى التخزين الخاص، أو اربط فيديو من Bunny Stream (حماية أقوى للبث).">
              {lessons.length ? (
                <ul className="mb-5 space-y-2">
                  {lessons.map((l) => (
                    <li key={l.id} className="rounded-xl border border-line">
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-3 p-3 text-sm [&::-webkit-details-marker]:hidden">
                          <PlayCircle className="size-5 shrink-0 text-brand-600" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="font-semibold">{l.title}</span>
                            <span className="block text-xs text-muted">
                              {l.unit_title || "بدون وحدة"} · {l.provider === "bunny" ? "Bunny Stream" : "ملف خاص"}
                              {l.size_bytes ? ` · ${fmtSize(Number(l.size_bytes))}` : ""}
                            </span>
                          </span>
                          {l.is_free_preview ? <Badge tone="accent">مجاني</Badge> : null}
                          {!l.is_published ? <Badge tone="neutral">مخفي</Badge> : null}
                        </summary>
                        <div className="border-t border-line p-3">
                          <ActionForm action={updateLessonAction} compact className="grid gap-3 sm:grid-cols-2">
                            <input type="hidden" name="productId" value={id} />
                            <input type="hidden" name="lessonId" value={l.id} />
                            <Field label="العنوان" htmlFor={`t-${l.id}`}>
                              <Input id={`t-${l.id}`} name="title" defaultValue={l.title} maxLength={160} />
                            </Field>
                            <Field label="الوحدة" htmlFor={`u-${l.id}`}>
                              <Input id={`u-${l.id}`} name="unitTitle" defaultValue={l.unit_title} maxLength={120} />
                            </Field>
                            <Field label="الوصف" htmlFor={`d-${l.id}`} className="sm:col-span-2">
                              <Textarea id={`d-${l.id}`} name="description" defaultValue={l.description} rows={2} />
                            </Field>
                            <div className="flex flex-wrap gap-5 sm:col-span-2">
                              <Checkbox name="isFreePreview" defaultChecked={l.is_free_preview} label="معاينة مجانية" />
                              <Checkbox name="isPublished" defaultChecked={l.is_published} label="منشور" />
                            </div>
                            <div className="flex flex-wrap gap-2 sm:col-span-2">
                              <SubmitButton size="sm">حفظ الدرس</SubmitButton>
                            </div>
                          </ActionForm>
                          <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3">
                            <QuickAction action={moveLessonAction} hidden={{ productId: id, lessonId: l.id, dir: "up" }} icon={<ArrowUp aria-hidden />} label="لأعلى" variant="ghost" />
                            <QuickAction action={moveLessonAction} hidden={{ productId: id, lessonId: l.id, dir: "down" }} icon={<ArrowDown aria-hidden />} label="لأسفل" variant="ghost" />
                            <ConfirmButton action={deleteLessonAction} hidden={{ productId: id, lessonId: l.id }} label="حذف" icon={<Trash2 aria-hidden />} title="حذف الدرس؟" description="سيتم حذف الدرس وملف الفيديو الخاص به نهائيًا." confirmLabel="حذف" />
                          </div>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-5 rounded-xl bg-canvas p-4 text-center text-sm text-muted">لا توجد دروس بعد.</p>
              )}
              <div className="space-y-4">
                <details className="rounded-xl border border-line p-4" open={lessons.length === 0}>
                  <summary className="cursor-pointer font-semibold">رفع درس من ملف MP4</summary>
                  <div className="mt-4">
                    <LessonUploader productId={id} />
                  </div>
                </details>
                <details className="rounded-xl border border-line p-4">
                  <summary className="cursor-pointer font-semibold">ربط فيديو من Bunny Stream</summary>
                  <ActionForm action={addBunnyLessonAction} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-2">
                    <>
                        <input type="hidden" name="productId" value={id} />
                        <Field label="عنوان الدرس" htmlFor="b-title" required>
                          <Input id="b-title" name="title" maxLength={160} />
                        </Field>
                        <Field label="Video ID من Bunny" htmlFor="b-ref" required>
                          <Input id="b-ref" name="videoRef" dir="ltr" className="text-start" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                        </Field>
                        <Field label="الوحدة" htmlFor="b-unit">
                          <Input id="b-unit" name="unitTitle" maxLength={120} />
                        </Field>
                        <Field label="المدة بالدقائق (اختياري)" htmlFor="b-dur">
                          <Input id="b-dur" name="durationMinutes" type="number" min={0} step="0.5" className="num" />
                        </Field>
                        <Field label="الوصف" htmlFor="b-desc" className="sm:col-span-2">
                          <Textarea id="b-desc" name="description" rows={2} />
                        </Field>
                        <Checkbox name="isFreePreview" label="درس مجاني للمعاينة" />
                        <div className="sm:col-span-2">
                          <SubmitButton size="sm">إضافة الدرس</SubmitButton>
                        </div>
                    </>
                  </ActionForm>
                </details>
              </div>
            </Section>
          ) : null}

          <section aria-labelledby="details-h">
            <h2 id="details-h" className="mb-3 text-lg font-bold">
              بيانات المنتج
            </h2>
            <ProductForm
              mode="edit"
              action={updateProductAction.bind(null, id)}
              grades={options.grades}
              subjects={options.subjects}
              submitLabel="حفظ التعديلات"
              defaults={{
                type: product.type,
                title: product.title,
                summary: product.summary,
                description: product.description,
                contents: product.contents,
                gradeId: product.grade_id,
                subjectId: product.subject_id ?? "",
                academicYear: product.academic_year,
                term: product.term ? String(product.term) : "",
                price: filsToKwdString(product.price_fils),
                compareAtPrice: product.compare_at_price_fils ? filsToKwdString(product.compare_at_price_fils) : "",
                isDownloadable: product.is_downloadable,
                isFeatured: product.is_featured,
                previewPages: String(product.preview_pages),
                sortOrder: String(product.sort_order),
                slug: product.slug,
              }}
            />
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">حالة النشر</h2>
              <ProductStatusBadge status={product.status} />
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-2">
                  {c.done ? <CircleCheck className="size-4 text-success" aria-hidden /> : <Circle className="size-4 text-line-strong" aria-hidden />}
                  <span className={c.done ? "text-ink-soft" : "text-muted"}>{c.label}</span>
                </li>
              ))}
            </ul>
            {blockers.length && product.status !== "published" ? (
              <Alert tone="warning" className="mt-4">
                {blockers.join("، ")}
              </Alert>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              {product.status !== "published" ? (
                <QuickAction action={setStatusAction} hidden={{ id, status: "published" }} icon={<Send aria-hidden />} label="نشر للطلاب" variant="primary" size="md" />
              ) : (
                <QuickAction action={setStatusAction} hidden={{ id, status: "hidden" }} icon={<EyeOff aria-hidden />} label="إخفاء عن الطلاب" variant="outline" size="md" />
              )}
              {product.status === "archived" || product.status === "hidden" ? (
                <QuickAction action={setStatusAction} hidden={{ id, status: "draft" }} label="إرجاع إلى المسودات" variant="ghost" />
              ) : null}
              {product.status !== "archived" ? (
                <ConfirmButton
                  action={setStatusAction}
                  hidden={{ id, status: "archived" }}
                  label="أرشفة"
                  icon={<Archive aria-hidden />}
                  variant="ghost"
                  title="أرشفة المنتج؟"
                  description="يختفي المنتج من الموقع ومن قائمة المنتجات الافتراضية، ويبقى متاحًا لمن اشتراه في مكتبته."
                  confirmLabel="أرشفة"
                />
              ) : null}
              <ConfirmButton
                action={deleteProductAction}
                hidden={{ id, redirect: "1" }}
                label="حذف المنتج"
                icon={<Trash2 aria-hidden />}
                title="حذف المنتج نهائيًا؟"
                description="إذا كان المنتج مرتبطًا بطلبات أو صلاحيات طلاب فسيتم أرشفته بدل حذفه حفاظًا على مشتريات الطلاب."
                confirmLabel="حذف"
              />
            </div>
            <dl className="mt-5 space-y-1 border-t border-line pt-4 text-xs text-muted">
              <div className="flex justify-between gap-2">
                <dt>آخر تحديث</dt>
                <dd>{formatDateTime(product.updated_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>تاريخ النشر</dt>
                <dd>{formatDateTime(product.published_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>الرابط</dt>
                <dd className="num truncate" dir="ltr">
                  /products/{product.slug}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-3 font-bold">صورة الغلاف</h2>
            {coverUrl ? (
              <div className="mb-3 overflow-hidden rounded-xl border border-line">
                <div className="relative aspect-[4/5]">
                  <Image src={coverUrl} alt="غلاف المنتج" fill sizes="320px" className="object-cover" />
                </div>
              </div>
            ) : (
              <div className="mb-3 grid aspect-[4/5] place-items-center rounded-xl bg-canvas text-center text-sm text-muted">
                <span>
                  <Package className="mx-auto mb-2 size-7 opacity-50" aria-hidden />
                  يُعرض غلاف تلقائي بألوان الهوية
                </span>
              </div>
            )}
            <FileUploader target="cover" productId={id} accept="image/jpeg,image/png,image/webp" label={coverUrl ? "تغيير الغلاف" : "رفع صورة غلاف"} hint="JPG أو PNG أو WEBP · حتى 5 م.ب · نسبة 4:5" compact />
            {coverUrl ? (
              <div className="mt-2">
                <QuickAction action={removeCoverAction} hidden={{ productId: id }} label="إزالة الغلاف" variant="ghost" />
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
