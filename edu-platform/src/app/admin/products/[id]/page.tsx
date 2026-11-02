import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  BadgeCheck,
  CircleCheck,
  Circle,
  Eye,
  EyeOff,
  FileText,
  ImageIcon,
  Package,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { requireStaff } from "@/server/auth/permissions";
import {
  bundleCandidates,
  catalogOptions,
  getAdminProduct,
  getBundleItemsAdmin,
  getLessonsAdmin,
  getProductFiles,
  publishBlockers,
  teacherOptions,
} from "@/server/admin/products";
import { activeVideoProvider } from "@/server/video/service";
import { bunnyConfigured } from "@/server/video/bunny";
import { storage } from "@/server/storage";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { ProductStatusBadge } from "@/components/admin/status-badge";
import { FileUploader } from "@/components/admin/file-uploader";
import { LessonUploader } from "@/components/admin/lesson-uploader";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton, QuickAction } from "@/components/admin/confirm-button";
import { AutoSyncLessons } from "@/components/admin/auto-sync";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { filsToKwdString } from "@/lib/money";
import { ACCESS_MODE_LABELS, PROCESSING_STATUS_LABELS, PRODUCT_TYPE_LABELS, isContainerType, isPdfType, isVideoType } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  addBundleItemAction,
  addBunnyLessonAction,
  approveAndPublishAction,
  deleteFileAction,
  deleteLessonAction,
  deleteProductAction,
  moveFileAction,
  moveLessonAction,
  regeneratePreviewAction,
  removeBundleItemAction,
  removeCoverAction,
  removeLessonThumbAction,
  renameFileAction,
  returnForChangesAction,
  setStatusAction,
  submitForReviewAction,
  syncLessonsAction,
  updateLessonAction,
  updateProductAction,
  withdrawReviewAction,
} from "../actions";

export const metadata = { title: "تعديل المحتوى" };

function fmtSize(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} م.ب` : `${Math.max(1, Math.round(n / 1024))} ك.ب`;
}

function fmtDuration(sec: number | null) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function kuwaitDate(d: Date | null) {
  return d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(new Date(d)) : "";
}

const STATUS_TONE = { ready: "success", processing: "warning", uploading: "neutral", failed: "danger" } as const;

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; approved?: string; returned?: string }> }) {
  const actor = await requireStaff();
  const owner = actor.kind === "owner";
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const product = await getAdminProduct(id, actor);
  if (!product) notFound();

  const isPdf = isPdfType(product.type);
  const isVideo = isVideoType(product.type);
  const isContainer = isContainerType(product.type);
  const editable = owner || product.status === "draft";
  const canUpload = editable && (owner || (actor.kind === "teacher" && actor.canUpload));
  const provider = activeVideoProvider();

  const [files, blockers, options, bundleItems, candidates, lessons, teachers] = await Promise.all([
    getProductFiles(id),
    publishBlockers(id),
    catalogOptions(),
    isContainer ? getBundleItemsAdmin(id) : Promise.resolve([]),
    isContainer && editable ? bundleCandidates(id, product.grade_id, actor) : Promise.resolve([]),
    isVideo ? getLessonsAdmin(id) : Promise.resolve([]),
    owner ? teacherOptions() : Promise.resolve([]),
  ]);
  const mainFiles = files.filter((f) => f.kind === "main");
  const preview = files.find((f) => f.kind === "preview");
  const coverUrl = product.cover_key ? storage().publicUrl(product.cover_key) : null;
  const itemsTotal = bundleItems.reduce((s, i) => s + i.price_fils, 0);
  const processing = lessons.some((l) => l.processing_status === "processing" || l.processing_status === "uploading");
  const totalDuration = lessons.reduce((s, l) => s + (l.duration_seconds ?? 0), 0);

  const checklist = [
    { done: true, label: owner ? "البيانات الأساسية والسعر" : "البيانات الأساسية" },
    ...(isPdf ? [{ done: mainFiles.length > 0, label: "رفع ملف PDF واحد على الأقل" }] : []),
    ...(product.type === "bundle" ? [{ done: bundleItems.length > 0, label: "إضافة محتويات إلى الباقة" }] : []),
    ...(isVideo
      ? [
          { done: lessons.some((l) => l.is_published) || bundleItems.length > 0, label: "إضافة درس فيديو منشور" },
          { done: lessons.length > 0 && !lessons.some((l) => l.is_published && l.processing_status !== "ready"), label: "اكتمال معالجة كل الفيديوهات" },
          { done: lessons.some((l) => l.is_free_preview), label: "درس مجاني للمعاينة (اختياري)", optional: true },
        ]
      : []),
    ...(isPdf ? [{ done: Boolean(preview), label: "معاينة مجانية (اختياري)", optional: true }] : []),
    { done: Boolean(coverUrl), label: "صورة غلاف (اختياري)", optional: true },
  ];

  const backLabel = owner ? "المحتوى والمنتجات" : "محتواي";

  return (
    <div>
      <AdminPageHeader
        title={product.title}
        description={`${PRODUCT_TYPE_LABELS[product.type]}، ${product.grade_name}${product.subject_name ? `، ${product.subject_name}` : ""}${owner ? `، ${product.teacher_name ?? "محتوى المنصة"}` : ""}`}
        crumbs={[{ label: backLabel, href: "/admin/products" }, { label: "تعديل" }]}
        actions={
          owner || product.status === "published" ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/products/${product.slug}`} target="_blank">
                <Eye aria-hidden /> معاينة كما يراها الطالب
              </Link>
            </Button>
          ) : null
        }
      />
      {sp.created ? (
        <Alert tone="success" title="تم إنشاء المسودة" className="mb-5">
          الخطوة التالية: {isPdf ? "ارفع ملف PDF" : isVideo ? "ارفع دروس الفيديو" : "أضف المحتويات"}
          {owner ? "، ثم انشر المنتج." : "، ثم أرسله للمراجعة."}
        </Alert>
      ) : null}

      {sp.approved && product.status === "published" ? (
        <Alert tone="success" title="تم اعتماد المحتوى ونشره للطلاب" className="mb-5">
          السعر المعتمد: <span className="num font-bold">{filsToKwdString(product.price_fils)}</span> د.ك
        </Alert>
      ) : null}
      {sp.returned && owner ? (
        <Alert tone="info" title="أُعيد المحتوى للمعلم مع ملاحظاتك" className="mb-5">
          سيظهر للمعلم في قائمة «محتوى أُعيد إليك للتعديل».
        </Alert>
      ) : null}

      {/* حالة المراجعة */}
      {!owner && product.status === "draft" && product.review_note ? (
        <Alert tone="warning" title="أُعيد المحتوى للتعديل" className="mb-5">
          <p className="whitespace-pre-line">{product.review_note}</p>
          <p className="mt-1 text-xs">عدّل المطلوب ثم أعد الإرسال للمراجعة.</p>
        </Alert>
      ) : null}
      {!owner && product.status === "in_review" ? (
        <Alert tone="info" title="بانتظار مراجعة إدارة المنصة" className="mb-5">
          لا يمكن تعديل المحتوى أثناء المراجعة. سيُنشر بعد الاعتماد وتحديد السعر، أو يعود إليك مع ملاحظات.
          <div className="mt-2">
            <QuickAction action={withdrawReviewAction} hidden={{ id }} icon={<Undo2 aria-hidden />} label="سحب من المراجعة للتعديل" variant="outline" />
          </div>
        </Alert>
      ) : null}
      {!owner && (product.status === "published" || product.status === "hidden" || product.status === "archived") ? (
        <Alert tone="info" className="mb-5">
          هذا المحتوى معتمد. لأي تعديل عليه تواصل مع إدارة المنصة.
        </Alert>
      ) : null}

      {owner && product.status === "in_review" ? (
        <section className="mb-6 rounded-lg border-2 border-accent-200 bg-accent-50 p-4 sm:p-6" aria-labelledby="review-h">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="review-h" className="flex items-center gap-2 text-lg font-bold">
                <BadgeCheck className="size-5 text-accent-700" aria-hidden /> مراجعة المحتوى قبل النشر
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                أرسله {product.teacher_name ?? "المعلم"} {product.submitted_at ? `في ${formatDateTime(product.submitted_at)}` : ""}
                {product.proposed_price_fils !== null ? (
                  <>
                    {" "}
                   ، السعر المقترح: <span className="num font-bold">{filsToKwdString(product.proposed_price_fils)}</span> د.ك
                  </>
                ) : null}
              </p>
            </div>
            <ConfirmButton
              action={returnForChangesAction}
              hidden={{ id }}
              label="إعادة للتعديل"
              icon={<Undo2 aria-hidden />}
              variant="outline"
              title="إعادة المحتوى للمعلم؟"
              description="اكتب ملاحظة واضحة بما يجب تعديله، ستظهر للمعلم في صفحة المحتوى."
              requireReason
              reasonLabel="ملاحظات المراجعة (إلزامي)"
              confirmLabel="إعادة للتعديل"
            />
          </div>
          {blockers.length ? (
            <Alert tone="warning" className="mb-4">
              لا يمكن الاعتماد الآن: {blockers.join("، ")}
            </Alert>
          ) : null}
          <ActionForm action={approveAndPublishAction} className="grid gap-4 sm:grid-cols-4">
            <input type="hidden" name="id" value={id} />
            <Field label="السعر المعتمد (د.ك)" htmlFor="ap-price" required>
              <Input id="ap-price" name="price" defaultValue={filsToKwdString(product.proposed_price_fils ?? product.price_fils)} inputMode="decimal" dir="ltr" className="num text-start" />
            </Field>
            <Field label="السعر السابق (اختياري)" htmlFor="ap-compare">
              <Input id="ap-compare" name="compareAtPrice" defaultValue={product.compare_at_price_fils ? filsToKwdString(product.compare_at_price_fils) : ""} inputMode="decimal" dir="ltr" className="num text-start" />
            </Field>
            <Field label="فترة الإتاحة بعد الشراء" htmlFor="ap-mode">
              <Select id="ap-mode" name="accessMode" defaultValue={product.access_mode}>
                {Object.entries(ACCESS_MODE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="حتى تاريخ" htmlFor="ap-until">
                <Input id="ap-until" name="accessUntil" type="date" defaultValue={kuwaitDate(product.access_until)} dir="ltr" className="num px-2" />
              </Field>
              <Field label="أو أيام" htmlFor="ap-days">
                <Input id="ap-days" name="accessDays" type="number" min={1} defaultValue={product.access_days ?? ""} className="num" />
              </Field>
            </div>
            <div className="sm:col-span-4">
              <SubmitButton disabled={blockers.length > 0} pendingText="جارٍ الاعتماد…">
                <BadgeCheck aria-hidden /> اعتماد ونشر
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {isVideo ? (
            <Section
              id="lessons"
              title="دروس الفيديو"
              description={
                provider === "bunny"
                  ? "تُرفع مباشرة إلى Bunny Stream وتُعالَج بجودات متعددة. لا يُنشر المحتوى قبل اكتمال المعالجة."
                  : "تُرفع إلى التخزين الخاص للمنصة وتُبث للمشتركين فقط."
              }
              actions={
                lessons.some((l) => l.provider === "bunny") ? (
                  <QuickAction action={syncLessonsAction} hidden={{ productId: id }} icon={<RefreshCw aria-hidden />} label="تحديث الحالة" variant="ghost" />
                ) : null
              }
            >
              <AutoSyncLessons productId={id} active={processing && lessons.some((l) => l.provider === "bunny")} />
              {lessons.length ? (
                <>
                  <p className="mb-3 text-sm text-muted">
                    <span className="num">{lessons.length}</span> درس، المدة الإجمالية <span className="num">{fmtDuration(totalDuration)}</span>
                  </p>
                  <ul className="mb-5 space-y-2" data-testid="lesson-list">
                    {lessons.map((l, i) => {
                      const thumb = l.thumbnail_key ? storage().publicUrl(l.thumbnail_key) : null;
                      return (
                        <li key={l.id} className="rounded-lg border border-line">
                          <details className="group">
                            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-3 text-sm sm:flex-nowrap [&::-webkit-details-marker]:hidden">
                              <span className="num w-5 shrink-0 text-center text-xs text-muted">{i + 1}</span>
                              <span className="relative grid aspect-video w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-canvas sm:w-20">
                                {thumb ? <Image src={thumb} alt="" fill sizes="80px" className="object-cover" /> : <PlayCircle className="size-5 text-brand-600" aria-hidden />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="font-semibold">{l.title}</span>
                                <span className="block text-xs text-muted">
                                  {l.unit_title || "بدون قسم"}، <span className="num">{fmtDuration(l.duration_seconds)}</span>، {l.provider === "bunny" ? "Bunny Stream" : "ملف خاص"}
                                  {l.size_bytes ? `، ${fmtSize(Number(l.size_bytes))}` : ""}
                                </span>
                              </span>
                              <span className="flex w-full flex-wrap items-center gap-1 ps-8 sm:w-auto sm:justify-end sm:ps-0">
                                <Badge tone={STATUS_TONE[l.processing_status]} data-testid="lesson-status">
                                  {PROCESSING_STATUS_LABELS[l.processing_status]}
                                </Badge>
                                {l.is_free_preview ? <Badge tone="accent">مجاني</Badge> : null}
                                {!l.is_published ? <Badge tone="neutral">مخفي</Badge> : null}
                              </span>
                            </summary>
                            <div className="space-y-3 border-t border-line p-3">
                              {l.processing_status === "failed" ? <Alert tone="danger">فشلت معالجة الفيديو{l.processing_error ? ` (${l.processing_error})` : ""}. احذف الدرس وارفعه من جديد.</Alert> : null}
                              {l.processing_status === "uploading" ? <Alert tone="warning">لم يكتمل رفع هذا الفيديو. إن توقف الرفع، احذف الدرس وارفعه من جديد.</Alert> : null}
                              <div className="flex flex-wrap items-center gap-2">
                                <Button asChild variant="ghost" size="sm">
                                  <Link href={`/watch/${id}?lesson=${l.id}`} target="_blank">
                                    <Eye aria-hidden /> مشاهدة
                                  </Link>
                                </Button>
                                <span className="text-xs text-muted">آخر تحقق: {formatDateTime(l.status_checked_at)}</span>
                              </div>
                              {editable ? (
                                <>
                                  <ActionForm action={updateLessonAction} compact className="grid gap-3 sm:grid-cols-2">
                                    <input type="hidden" name="productId" value={id} />
                                    <input type="hidden" name="lessonId" value={l.id} />
                                    <Field label="العنوان" htmlFor={`t-${l.id}`}>
                                      <Input id={`t-${l.id}`} name="title" defaultValue={l.title} maxLength={160} />
                                    </Field>
                                    <Field label="القسم / الوحدة" htmlFor={`u-${l.id}`}>
                                      <Input id={`u-${l.id}`} name="unitTitle" defaultValue={l.unit_title} maxLength={120} />
                                    </Field>
                                    <Field label="الوصف" htmlFor={`d-${l.id}`} className="sm:col-span-2">
                                      <Textarea id={`d-${l.id}`} name="description" defaultValue={l.description} rows={2} />
                                    </Field>
                                    <div className="flex flex-wrap gap-5 sm:col-span-2">
                                      <Checkbox name="isFreePreview" defaultChecked={l.is_free_preview} label="معاينة مجانية" />
                                      <Checkbox name="isPublished" defaultChecked={l.is_published} label="منشور" />
                                    </div>
                                    <div className="sm:col-span-2">
                                      <SubmitButton size="sm">حفظ الدرس</SubmitButton>
                                    </div>
                                  </ActionForm>
                                  <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
                                    <FileUploader target="lesson_thumb" productId={id} lessonId={l.id} accept="image/jpeg,image/png,image/webp" label={thumb ? "تغيير الصورة المصغرة" : "رفع صورة مصغرة"} hint="16:9، JPG أو PNG أو WEBP" compact />
                                    {thumb ? <QuickAction action={removeLessonThumbAction} hidden={{ productId: id, lessonId: l.id }} icon={<ImageIcon aria-hidden />} label="إزالة الصورة" variant="ghost" /> : null}
                                  </div>
                                  <div className="flex flex-wrap gap-1 border-t border-line pt-3">
                                    <QuickAction action={moveLessonAction} hidden={{ productId: id, lessonId: l.id, dir: "up" }} icon={<ArrowUp aria-hidden />} label="لأعلى" variant="ghost" />
                                    <QuickAction action={moveLessonAction} hidden={{ productId: id, lessonId: l.id, dir: "down" }} icon={<ArrowDown aria-hidden />} label="لأسفل" variant="ghost" />
                                    <ConfirmButton action={deleteLessonAction} hidden={{ productId: id, lessonId: l.id }} label="حذف" icon={<Trash2 aria-hidden />} title="حذف الدرس؟" description="سيتم حذف الدرس وملف الفيديو الخاص به نهائيًا." confirmLabel="حذف" />
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="mb-5 rounded-lg bg-canvas p-4 text-center text-sm text-muted">لا توجد دروس بعد.</p>
              )}
              {canUpload ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-4">
                    <h3 className="mb-4 font-semibold">{lessons.length ? "إضافة درس آخر" : "رفع أول درس فيديو"}</h3>
                    <LessonUploader productId={id} provider={provider} />
                  </div>
                  {owner && bunnyConfigured() ? (
                    <details className="rounded-lg border border-line p-4">
                      <summary className="cursor-pointer font-semibold">ربط فيديو موجود في Bunny Stream</summary>
                      <ActionForm action={addBunnyLessonAction} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-2">
                        <>
                          <input type="hidden" name="productId" value={id} />
                          <Field label="عنوان الدرس" htmlFor="b-title" required>
                            <Input id="b-title" name="title" maxLength={160} />
                          </Field>
                          <Field label="Video ID من Bunny" htmlFor="b-ref" required>
                            <Input id="b-ref" name="videoRef" dir="ltr" className="text-start" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                          </Field>
                          <Field label="القسم / الوحدة" htmlFor="b-unit">
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
                  ) : null}
                </div>
              ) : null}
            </Section>
          ) : null}

          {isPdf || (isVideo && (mainFiles.length > 0 || canUpload)) ? (
            <Section
              id="files"
              title={isPdf ? "ملفات المذكرة" : "ملفات مرفقة (PDF)"}
              description={isPdf ? "الملفات الأصلية تُحفظ في تخزين خاص ولا تُعرض إلا لمن اشترى المنتج." : "أوراق عمل أو ملخصات تُرفق مع الفيديو للمشتركين (اختياري)."}
            >
              {canUpload ? (
                <FileUploader target="main" productId={id} accept="application/pdf,.pdf" multiple label="اسحب ملفات PDF هنا أو اضغط للاختيار" hint="PDF فقط، حتى 100 ميجابايت للملف، يمكن رفع عدة ملفات" compact={!isPdf} />
              ) : null}
              {mainFiles.length ? (
                <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
                  {mainFiles.map((f, i) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                      <FileText className="hidden size-5 shrink-0 text-brand-600 sm:block" aria-hidden />
                      <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                        {editable ? (
                          <ActionForm action={renameFileAction} compact className="flex items-center gap-1.5">
                            <input type="hidden" name="productId" value={id} />
                            <input type="hidden" name="fileId" value={f.id} />
                            <Input name="title" defaultValue={f.title} className="h-9 text-sm" aria-label="اسم الملف" maxLength={160} />
                            <Button type="submit" size="sm" variant="ghost">
                              حفظ
                            </Button>
                          </ActionForm>
                        ) : (
                          <p className="font-semibold">{f.title}</p>
                        )}
                        <p className="mt-1 text-xs text-muted">
                          <span className="num">{f.page_count ?? "?"}</span> صفحة، <span className="num">{fmtSize(f.size_bytes)}</span>، {formatDateTime(f.created_at)}
                        </p>
                      </div>
                      <div className="ms-auto flex items-center gap-1">
                        {editable ? (
                          <>
                            <QuickAction action={moveFileAction} hidden={{ productId: id, fileId: f.id, dir: "up" }} icon={<ArrowUp aria-hidden />} variant="ghost" size="icon" title="تحريك لأعلى" />
                            <QuickAction action={moveFileAction} hidden={{ productId: id, fileId: f.id, dir: "down" }} icon={<ArrowDown aria-hidden />} variant="ghost" size="icon" title="تحريك لأسفل" />
                          </>
                        ) : null}
                        <Button asChild variant="ghost" size="icon" title="فتح الملف">
                          <Link href={`/read/${f.id}`} target="_blank" aria-label={`فتح ${f.title}`}>
                            <Eye aria-hidden />
                          </Link>
                        </Button>
                        {editable ? (
                          <ConfirmButton
                            action={deleteFileAction}
                            hidden={{ productId: id, fileId: f.id }}
                            label=""
                            icon={<Trash2 aria-hidden />}
                            size="icon"
                            variant="ghost"
                            title="حذف الملف؟"
                            description={`سيتم حذف «${f.title}» نهائيًا من التخزين.${i === 0 && isPdf ? " هذا هو الملف الأول، ستُعاد توليد المعاينة." : ""}`}
                            confirmLabel="حذف"
                          />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : isPdf ? (
                <p className="mt-4 rounded-lg bg-canvas p-4 text-center text-sm text-muted">لم يُرفع أي ملف بعد.</p>
              ) : null}
            </Section>
          ) : null}

          {isPdf ? (
            <Section title="المعاينة المجانية" description={`تُولَّد تلقائيًا من أول ${product.preview_pages} صفحات من الملف الأول، أو ارفع ملف معاينة مخصص.`}>
              {preview ? (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                  <Eye className="size-5 text-brand-600" aria-hidden />
                  <div className="flex-1 text-sm">
                    <p className="font-semibold">{preview.is_auto_preview ? "معاينة تلقائية" : "معاينة مخصصة (مرفوعة يدويًا)"}</p>
                    <p className="text-xs text-muted">
                      <span className="num">{preview.page_count ?? "?"}</span> صفحة، متاحة للجميع بدون تسجيل
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/preview/${preview.id}`} target="_blank">
                      فتح
                    </Link>
                  </Button>
                </div>
              ) : (
                <p className="mb-4 rounded-lg bg-canvas p-3 text-sm text-muted">لا توجد معاينة حاليًا{product.preview_pages === 0 ? " (عدد صفحات المعاينة = 0)" : mainFiles.length ? "" : "، ارفع ملفًا أولًا"}.</p>
              )}
              {editable ? (
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  {canUpload ? <FileUploader target="preview" productId={id} accept="application/pdf,.pdf" label="رفع معاينة مخصصة (PDF)" compact /> : <span />}
                  <div className="flex flex-col gap-2">
                    <QuickAction action={regeneratePreviewAction} hidden={{ productId: id, dropCustom: "1" }} icon={<RotateCcw aria-hidden />} label="توليد تلقائي" />
                  </div>
                </div>
              ) : null}
            </Section>
          ) : null}

          {isContainer && (bundleItems.length > 0 || candidates.length > 0 || product.type === "bundle") ? (
            <Section
              title={product.type === "bundle" ? "محتويات الباقة" : "محتويات مضمّنة"}
              description={
                product.type === "bundle"
                  ? "من نفس الصف، فيديوهات ومذكرات ودورات. المشتري يحصل على كل المحتويات (بأي عمق) ولا تُحتسب المكررة."
                  : "أضف وحدات أو دروسًا منفردة لتكوين الدورة/الوحدة، من يشتريها يحصل عليها كلها، ويمكن بيع كل جزء منفردًا أيضًا."
              }
            >
              {bundleItems.length ? (
                <>
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {bundleItems.map((it) => (
                      <li key={it.product_id} className="flex items-center gap-3 p-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <Link href={`/admin/products/${it.product_id}`} className="font-semibold hover:text-brand-700">
                            {it.title}
                          </Link>
                          <p className="text-xs text-muted">
                            {PRODUCT_TYPE_LABELS[it.type]}، {it.subject_name ?? "—"}
                            {owner && it.teacher_name ? `، ${it.teacher_name}` : ""} {it.status !== "published" ? "، غير منشور" : ""}
                          </p>
                        </div>
                        <span className="num whitespace-nowrap">{filsToKwdString(it.price_fils)} د.ك</span>
                        {editable ? <QuickAction action={removeBundleItemAction} hidden={{ bundleId: id, productId: it.product_id }} icon={<Trash2 aria-hidden />} variant="ghost" size="icon" title="إزالة" /> : null}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-muted">
                    قيمة المحتويات منفردة: <span className="num font-bold text-ink">{filsToKwdString(itemsTotal)}</span> د.ك، السعر:{" "}
                    <span className="num font-bold text-ink">{filsToKwdString(product.price_fils)}</span> د.ك
                    {itemsTotal > product.price_fils && product.price_fils > 0 ? (
                      <>
                        {" "}
                       ، توفير <span className="num font-bold text-success">{filsToKwdString(itemsTotal - product.price_fils)}</span> د.ك
                      </>
                    ) : null}
                  </p>
                </>
              ) : (
                <p className="rounded-lg bg-canvas p-4 text-center text-sm text-muted">لا توجد محتويات مضمّنة بعد.</p>
              )}
              {candidates.length ? (
                <ActionForm action={addBundleItemAction} className="mt-5">
                  <input type="hidden" name="bundleId" value={id} />
                  <p className="mb-2 text-sm font-semibold">إضافة محتوى من {product.grade_name}</p>
                  <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
                    {candidates.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-brand-50">
                        <input type="checkbox" name="productId" value={c.id} className="size-4 accent-[var(--brand)]" />
                        <span className="min-w-0 flex-1">
                          {c.title}
                          <span className="block text-xs text-muted">
                            {c.subject_name ?? "—"}، {PRODUCT_TYPE_LABELS[c.type]}
                            {owner && c.teacher_name ? `، ${c.teacher_name}` : ""} {c.status !== "published" ? "، غير منشور" : ""}
                          </span>
                        </span>
                        <span className="num text-xs whitespace-nowrap">{filsToKwdString(c.price_fils)}</span>
                      </label>
                    ))}
                  </div>
                  <SubmitButton size="sm" variant="secondary" className="mt-3">
                    إضافة المحدد
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </Section>
          ) : null}

          <section aria-labelledby="details-h">
            <h2 id="details-h" className="mb-3 text-lg font-bold">
              بيانات المحتوى
            </h2>
            <ProductForm
              mode="edit"
              role={actor.kind}
              readOnly={!editable}
              action={updateProductAction.bind(null, id)}
              grades={options.grades}
              subjects={options.subjects}
              teachers={owner ? teachers : undefined}
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
                proposedPrice: product.proposed_price_fils !== null ? filsToKwdString(product.proposed_price_fils) : "",
                isDownloadable: product.is_downloadable,
                isFeatured: product.is_featured,
                previewPages: String(product.preview_pages),
                sortOrder: String(product.sort_order),
                slug: product.slug,
                teacherId: product.teacher_id ?? "",
                accessMode: product.access_mode,
                accessUntil: kuwaitDate(product.access_until),
                accessDays: product.access_days ? String(product.access_days) : "",
              }}
            />
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          <div className="rounded-lg border border-line bg-surface p-5">
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
              {owner ? (
                <>
                  {product.status === "published" ? (
                    <QuickAction action={setStatusAction} hidden={{ id, status: "hidden" }} icon={<EyeOff aria-hidden />} label="إخفاء عن الطلاب" variant="outline" size="md" />
                  ) : product.status !== "in_review" ? (
                    <QuickAction action={setStatusAction} hidden={{ id, status: "published" }} icon={<Send aria-hidden />} label="نشر للطلاب" variant="primary" size="md" />
                  ) : null}
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
                </>
              ) : product.status === "draft" ? (
                <QuickAction action={submitForReviewAction} hidden={{ id }} icon={<Send aria-hidden />} label="إرسال للمراجعة" variant="primary" size="md" />
              ) : null}
              {editable ? (
                <ConfirmButton
                  action={deleteProductAction}
                  hidden={{ id, redirect: "1" }}
                  label={owner ? "حذف المنتج" : "حذف المسودة"}
                  icon={<Trash2 aria-hidden />}
                  title="حذف نهائيًا؟"
                  description="إذا كان المنتج مرتبطًا بطلبات أو صلاحيات طلاب فسيتم أرشفته بدل حذفه حفاظًا على مشتريات الطلاب."
                  confirmLabel="حذف"
                />
              ) : null}
            </div>
            <dl className="mt-5 space-y-1 border-t border-line pt-4 text-xs text-muted">
              {owner || product.price_fils > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt>السعر المعتمد</dt>
                  <dd className="num">{filsToKwdString(product.price_fils)} د.ك</dd>
                </div>
              ) : null}
              {product.proposed_price_fils !== null ? (
                <div className="flex justify-between gap-2">
                  <dt>السعر المقترح</dt>
                  <dd className="num">{filsToKwdString(product.proposed_price_fils)} د.ك</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt>فترة الإتاحة</dt>
                <dd>
                  {product.access_mode === "until_date"
                    ? `حتى ${formatDate(product.access_until)}`
                    : product.access_mode === "days"
                      ? `${product.access_days} يومًا`
                      : "غير محددة"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>آخر تحديث</dt>
                <dd>{formatDateTime(product.updated_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>تاريخ النشر</dt>
                <dd>{formatDateTime(product.published_at)}</dd>
              </div>
              {product.reviewed_at ? (
                <div className="flex justify-between gap-2">
                  <dt>آخر مراجعة</dt>
                  <dd>
                    {formatDateTime(product.reviewed_at)}
                    {owner && product.reviewed_by_name ? `، ${product.reviewed_by_name}` : ""}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt>الرابط</dt>
                <dd className="num truncate" dir="ltr">
                  /products/{product.slug}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-line bg-surface p-5">
            <h2 className="mb-3 font-bold">صورة الغلاف</h2>
            {coverUrl ? (
              <div className="mb-3 overflow-hidden rounded-lg border border-line">
                <div className="relative aspect-[4/5]">
                  <Image src={coverUrl} alt="غلاف المنتج" fill sizes="320px" className="object-cover" />
                </div>
              </div>
            ) : (
              <div className="mb-3 grid aspect-[4/5] place-items-center rounded-lg bg-canvas text-center text-sm text-muted">
                <span>
                  <Package className="mx-auto mb-2 size-7 opacity-50" aria-hidden />
                  يُعرض غلاف تلقائي بألوان الهوية
                </span>
              </div>
            )}
            {canUpload ? (
              <FileUploader target="cover" productId={id} accept="image/jpeg,image/png,image/webp" label={coverUrl ? "تغيير الغلاف" : "رفع صورة غلاف"} hint="JPG أو PNG أو WEBP، حتى 5 م.ب، نسبة 4:5" compact />
            ) : null}
            {coverUrl && editable ? (
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
