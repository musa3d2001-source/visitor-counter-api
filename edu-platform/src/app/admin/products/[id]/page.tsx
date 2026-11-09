import type * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  BadgeCheck,
  Check,
  ChevronDown,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  ImageIcon,
  Layers,
  Link2,
  Package,
  Pencil,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { requireStaff } from "@/server/auth/permissions";
import { bundleCandidates, catalogOptions, getAdminProduct, getBundleItemsAdmin, getLessonsAdmin, getProductFiles, isExtremeShare, productTeacherShares, publishBlockers, teacherOptions } from "@/server/admin/products";
import { FILE_PROBLEM_LABELS, isFlagged, type FlaggedStatus } from "@/server/access/file-check";
import { saleStopReason } from "@/server/commerce/cart";
import { videoHostingBlocked } from "@/server/video/policy";
import { recheckFileAction } from "../../content-health/actions";
import { hasCurrentAgreement, latestRightsAttestation } from "@/server/admin/teacher-agreement";
import { activeVideoProvider } from "@/server/video/service";
import { bunnyConfigured } from "@/server/video/bunny";
import { storage, uploadLimitLabel } from "@/server/storage";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { ProductStatusBadge, StatusPill } from "@/components/admin/status-badge";
import { FileUploader } from "@/components/admin/file-uploader";
import { LessonUploader } from "@/components/admin/lesson-uploader";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton, QuickAction } from "@/components/admin/confirm-button";
import { AutoSyncLessons } from "@/components/admin/auto-sync";
import { ToneIcon } from "@/components/admin/icon-tile";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { subjectSlugFromName } from "@/components/site/card-parts";
import { filsToKwdString } from "@/lib/money";
import { W, ar, count, duration, gradeClass, gradeVars, subjectVars, toneClass, type CountWord } from "@/lib/design";
import { ACCESS_MODE_LABELS, PROCESSING_STATUS_LABELS, PRODUCT_TYPE_LABELS, isContainerType, isPdfType, isVideoType } from "@/lib/labels";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { RIGHTS_ATTESTATION_TEXT } from "@/lib/teacher-agreement";
import { PREVIEW_ISSUE_FIX, PREVIEW_ISSUE_LABELS, PREVIEW_POLICY, PREVIEW_RULE_TEXT, maxPreviewPages, previewIssue } from "@/lib/preview-policy";
import { CatalogBand } from "../../_components/catalog/band";
import { AdminThumb } from "../../_components/catalog/thumb";
import { PosterPreview } from "../../_components/catalog/poster";
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

/** إجراءات هذه الصفحة تفحص ملفات المنتج قبل نشره، وقد تكون كبيرة */
export const maxDuration = 60;

function fmtSize(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} م.ب` : `${Math.max(1, Math.round(n / 1024))} ك.ب`;
}

function kuwaitDate(d: Date | null) {
  return d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(new Date(d)) : "";
}

const STATUS_TONE = {
  ready: "success",
  processing: "warning",
  uploading: "neutral",
  failed: "danger",
} as const;
const FILE_WORD: CountWord = {
  one: "ملف",
  two: "ملفان",
  plural: "ملفات",
  acc: "ملفًا",
};

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    approved?: string;
    returned?: string;
  }>;
}) {
  const actor = await requireStaff();
  const owner = actor.kind === "owner";
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const product = await getAdminProduct(id, actor);
  if (!product) notFound();

  const saleEnded = product.access_mode === "until_date" && product.access_until !== null && new Date(product.access_until).getTime() <= Date.now();
  const isPdf = isPdfType(product.type);
  const isVideo = isVideoType(product.type);
  const isContainer = isContainerType(product.type);
  const editable = owner || product.status === "draft";
  const canUpload = editable && (owner || (actor.kind === "teacher" && actor.canUpload));
  const provider = activeVideoProvider();
  // على منصة المذكرات فقط: المعلم لا يرفع درسًا لن يُنشر أبدًا. المالك يرى السبب في موانع النشر
  const hostingClosed = videoHostingBlocked();
  const saleStop = product.status === "published" ? await saleStopReason(id) : null;

  const reviewing = owner && product.status === "in_review";
  const [files, blockers, options, bundleItems, candidates, lessons, teachers, shares, attestation, agreementOk] = await Promise.all([
    getProductFiles(id),
    // السعر والنسبة قرار يُتخذ داخل نموذج الاعتماد، والمعلم لا يملكهما
    publishBlockers(id, { ...(reviewing || !owner ? { ignorePrice: true, ignoreShare: true } : {}), ignoreVideoHosting: !owner }),
    catalogOptions(),
    isContainer ? getBundleItemsAdmin(id) : Promise.resolve([]),
    isContainer && editable ? bundleCandidates(id, product.grade_id, actor) : Promise.resolve([]),
    isVideo ? getLessonsAdmin(id) : Promise.resolve([]),
    owner ? teacherOptions() : Promise.resolve([]),
    owner ? productTeacherShares(id) : Promise.resolve([]),
    owner ? latestRightsAttestation(id) : Promise.resolve(null),
    actor.kind === "teacher" ? hasCurrentAgreement(actor.userId) : Promise.resolve(true),
  ]);
  const shareMissing = shares.filter((t) => t.share_bps === null);
  const shareExtreme = shares.filter((t) => isExtremeShare(t.share_bps));
  const shareSummary = shares.map((t) => `${t.display_name}: ${t.share_bps === null ? "بلا نسبة" : `${ar(t.share_bps / 100)}٪`}`).join("، ");
  const mainFiles = files.filter((f) => f.kind === "main");
  const preview = files.find((f) => f.kind === "preview");
  const previewProblem = preview ? previewIssue(preview, mainFiles[0]) : null;
  const previewAllowance = maxPreviewPages(mainFiles[0]?.page_count);
  const coverUrl = product.cover_key ? storage().publicUrl(product.cover_key) : null;
  const itemsTotal = bundleItems.reduce((s, i) => s + i.price_fils, 0);
  const processing = lessons.some((l) => l.processing_status === "processing" || l.processing_status === "uploading");
  const totalDuration = lessons.reduce((s, l) => s + (l.duration_seconds ?? 0), 0);
  const slug = subjectSlugFromName(product.subject_name);
  const bandStyle = product.subject_name ? subjectVars(slug) : gradeVars(product.grade_level);

  const checklist = [
    {
      done: !owner || product.is_free || product.price_fils > 0 || reviewing,
      label: owner ? "البيانات الأساسية والسعر" : "البيانات الأساسية",
    },
    ...(isPdf ? [{ done: mainFiles.length > 0, label: "رفع ملف PDF واحد على الأقل" }] : []),
    ...(product.type === "bundle" ? [{ done: bundleItems.length > 0, label: "إضافة محتويات إلى الباقة" }] : []),
    ...(isVideo
      ? [
          {
            done: lessons.some((l) => l.is_published) || bundleItems.length > 0,
            label: "إضافة درس فيديو منشور",
          },
          {
            done: lessons.length > 0 && !lessons.some((l) => l.is_published && l.processing_status !== "ready"),
            label: "اكتمال معالجة كل الفيديوهات",
          },
          {
            done: lessons.some((l) => l.is_free_preview),
            label: "درس مجاني للمعاينة (اختياري)",
            optional: true,
          },
        ]
      : []),
    ...(isPdf
      ? [
          {
            done: Boolean(preview),
            label: "معاينة مجانية (اختياري)",
            optional: true,
          },
        ]
      : []),
    { done: Boolean(coverUrl), label: "صورة غلاف (اختياري)", optional: true },
  ];
  const required = checklist.filter((c) => !("optional" in c && c.optional));
  const requiredDone = required.filter((c) => c.done).length;
  const pct = Math.round((requiredDone / Math.max(1, required.length)) * 100);

  const backLabel = owner ? "المحتوى والمنتجات" : "محتواي";

  return (
    <div className="space-y-6">
      <CatalogBand
        tone="sky"
        style={bandStyle}
        art={
          <div className="absolute end-6 top-0 w-32 rotate-[5deg]">
            <PosterPreview type={product.type} subjectName={product.subject_name} gradeName={product.grade_name} gradeLevel={product.grade_level} coverUrl={coverUrl} sizes="160px" compact />
          </div>
        }
      >
        <AdminPageHeader
          className="mb-0 sm:mb-0"
          title={product.title}
          description={`${PRODUCT_TYPE_LABELS[product.type]}، ${product.grade_name}${product.subject_name ? `، ${product.subject_name}` : ""}${owner ? `، ${product.teacher_name ?? "محتوى المنصة"}` : ""}`}
          crumbs={[{ label: backLabel, href: "/admin/products" }, { label: "تعديل" }]}
          actions={
            owner || product.status === "published" ? (
              <Button asChild variant="outline" size="md">
                <Link href={`/products/${product.slug}`} target="_blank">
                  <Eye aria-hidden /> معاينة كما يراها الطالب
                </Link>
              </Button>
            ) : null
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <ProductStatusBadge status={product.status} />
            <span className={cn("chip", toneClass(slug))}>
              {isVideo ? <PlayCircle aria-hidden /> : isPdf ? <FileText aria-hidden /> : <Layers aria-hidden />}
              {PRODUCT_TYPE_LABELS[product.type]}
            </span>
            <span className={cn("chip", gradeClass(product.grade_level))}>{product.grade_name}</span>
            {isVideo && lessons.length ? (
              <span className="chip chip-white">
                <PlayCircle aria-hidden /> {count(lessons.length, W.lesson)}
              </span>
            ) : null}
            {isPdf && mainFiles.length ? (
              <span className="chip chip-white">
                <FileText aria-hidden /> {count(mainFiles.length, FILE_WORD)}
              </span>
            ) : null}
            {owner || product.price_fils > 0 ? (
              <span className="chip chip-white">
                <span className="num">{filsToKwdString(product.price_fils)}</span> د.ك
              </span>
            ) : null}
          </div>
        </AdminPageHeader>
      </CatalogBand>

      {saleEnded ? (
        <Alert tone="warning" title="انتهى بيع هذا المنتج">
          مضى تاريخ نهاية الإتاحة، فلا يدخل المنتج السلة ولا يُفوتر، ويظهر للطلاب «انتهى البيع». لإعادة بيعه اختر تاريخًا قادمًا في فترة الإتاحة.
        </Alert>
      ) : null}

      {sp.created ? (
        <Alert tone="success" title="تم إنشاء المسودة">
          الخطوة التالية: {isPdf ? "ارفع ملف PDF" : isVideo ? "ارفع دروس الفيديو" : "أضف المحتويات"}
          {owner ? "، ثم انشر المنتج." : "، ثم أرسله للمراجعة."}
        </Alert>
      ) : null}

      {sp.approved && product.status === "published" ? (
        <Alert tone="success" title="تم اعتماد المحتوى ونشره للطلاب">
          السعر المعتمد: <span className="num font-bold">{filsToKwdString(product.price_fils)}</span> د.ك
        </Alert>
      ) : null}
      {sp.returned && owner ? (
        <Alert tone="info" title="أُعيد المحتوى للمعلم مع ملاحظاتك">
          سيظهر للمعلم في قائمة «محتوى أُعيد إليك للتعديل».
        </Alert>
      ) : null}

      {/* حالة المراجعة */}
      {!owner && product.status === "draft" && product.review_note ? (
        <Alert tone="warning" title="أُعيد المحتوى للتعديل">
          <p className="whitespace-pre-line">{product.review_note}</p>
          <p className="mt-1 text-xs">عدّل المطلوب ثم أعد الإرسال للمراجعة.</p>
        </Alert>
      ) : null}
      {!owner && product.status === "in_review" ? (
        <Alert tone="info" title="بانتظار مراجعة إدارة المنصة">
          لا يمكن تعديل المحتوى أثناء المراجعة. سيُنشر بعد الاعتماد وتحديد السعر، أو يعود إليك مع ملاحظات.
          <div className="mt-2">
            <QuickAction action={withdrawReviewAction} hidden={{ id }} icon={<Undo2 aria-hidden />} label="سحب من المراجعة للتعديل" variant="outline" />
          </div>
        </Alert>
      ) : null}
      {!owner && (product.status === "published" || product.status === "hidden" || product.status === "archived") ? (
        <Alert tone="info">هذا المحتوى معتمد. لأي تعديل عليه تواصل مع إدارة المنصة.</Alert>
      ) : null}

      {saleStop ? (
        <Alert tone="warning" title="منشور لكن بيعه متوقف" data-testid="sale-stopped-alert">
          {saleStop === "video_closed" ? (
            "بيع دروس الفيديو غير متاح حاليًا على المنصة، ولا يستطيع الطلاب شراء هذا المحتوى."
          ) : owner ? (
            <>
              لا يستطيع الطلاب شراء هذا المنتج الآن. السبب وطريقة حله في{" "}
              <Link href="/admin/content-health" className="font-bold underline">
                سلامة المحتوى
              </Link>
              .
            </>
          ) : (
            "لا يستطيع الطلاب شراء هذا المحتوى الآن. تواصل مع إدارة المنصة لمعرفة السبب."
          )}
        </Alert>
      ) : null}

      {owner && product.status === "in_review" ? (
        <section
          className="relative isolate overflow-hidden rounded-[1.75rem] border-2 border-[#FFE08A] bg-[linear-gradient(160deg,#FFFBEA,#FFF0C7)] p-4 shadow-[0_5px_0_#F5D27A,0_24px_40px_-28px_#C98500] sm:p-6"
          aria-labelledby="review-h"
        >
          <span className="pointer-events-none absolute -end-16 -top-20 -z-10 size-52 rounded-full border-[20px] border-white/60" aria-hidden />
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <ToneIcon tone="gold" size="md">
                <BadgeCheck />
              </ToneIcon>
              <div className="min-w-0">
                <h2 id="review-h" className="font-display text-[1.3rem] leading-snug font-black text-ink">
                  مراجعة المحتوى قبل النشر
                </h2>
                <p className="mt-1 text-sm leading-7 text-ink-soft">
                  أرسله {product.teacher_name ?? "المعلم"} {product.submitted_at ? `في ${formatDateTime(product.submitted_at)}` : ""}
                  {product.proposed_price_fils !== null ? (
                    <>
                      {" "}
                      ، السعر المقترح: <span className="num font-bold">{filsToKwdString(product.proposed_price_fils)}</span> د.ك
                    </>
                  ) : null}
                </p>
                <p className="mt-1 text-sm leading-7 text-ink-soft" data-testid="rights-attestation">
                  {attestation ? (
                    <>
                      أقرّ {attestation.attested_by ?? "المعلم"} بحقوق هذا المحتوى في {formatDateTime(attestation.attested_at)}، نسخة الإقرار <bdi dir="ltr">{attestation.statement_version}</bdi>.
                    </>
                  ) : (
                    "لا يوجد إقرار حقوق مسجل لهذا المحتوى، فقد أرسله المالك أو أُرسل قبل هذا السجل."
                  )}
                </p>
              </div>
            </div>
            <ConfirmButton
              action={returnForChangesAction}
              hidden={{ id }}
              label="إعادة للتعديل"
              icon={<Undo2 aria-hidden />}
              variant="outline"
              size="md"
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
          {shareMissing.length ? (
            <Alert tone="danger" className="mb-4" title="لا يوجد اتفاق على نسبة المعلم">
              لم تُحدَّد نسبة {shareMissing.map((t) => t.display_name).join("، ")}، فلن يُعتمد هذا المحتوى بسعر. حدد النسبة في صفحة المعلم أولًا، أو اعتمده مجانيًا.
            </Alert>
          ) : null}
          <ActionForm action={approveAndPublishAction} className="grid gap-4 rounded-[1.4rem] bg-white/80 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="submittedAt" value={product.submitted_at?.toISOString() ?? ""} />
            {/* لا يُملأ السعر من اقتراح المعلم ولا بصفر: الاعتماد دون قراءة يتوقف عند هذا الحقل */}
            <Field
              label="السعر المعتمد (د.ك)"
              htmlFor="ap-price"
              required
              hint={product.proposed_price_fils !== null ? `اقتراح المعلم: ${filsToKwdString(product.proposed_price_fils)} د.ك` : undefined}
            >
              <Input id="ap-price" name="price" defaultValue={product.price_fils > 0 ? filsToKwdString(product.price_fils) : ""} inputMode="decimal" dir="ltr" className="num text-start" />
            </Field>
            <Field label="السعر السابق (اختياري)" htmlFor="ap-compare">
              <Input
                id="ap-compare"
                name="compareAtPrice"
                defaultValue={product.compare_at_price_fils ? filsToKwdString(product.compare_at_price_fils) : ""}
                inputMode="decimal"
                dir="ltr"
                className="num text-start"
              />
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
            {shares.length ? (
              <p className="text-sm leading-7 text-ink-soft sm:col-span-2 lg:col-span-4">
                نسبة المعلم من صافي البيع: <b className="font-display font-extrabold text-ink">{shareSummary}</b>
              </p>
            ) : null}
            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
              <Checkbox name="isFree" label="اعتماده مجانيًا، بدون سعر (يُتجاهل السعر المكتوب)" />
              {shareExtreme.length ? (
                <Checkbox name="confirmShare" label={`أؤكد النسبة: ${shareExtreme.map((t) => `${t.display_name} ${ar((t.share_bps as number) / 100)}٪`).join("، ")}`} />
              ) : null}
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <SubmitButton variant="accent" size="lg" disabled={blockers.length > 0} pendingText="جارٍ الاعتماد…">
                <BadgeCheck aria-hidden /> اعتماد ونشر
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ───── حالة النشر (أولًا على الجوال) ───── */}
        <aside aria-labelledby="status-h" className="min-w-0 lg:col-start-2 lg:row-start-1">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-[rgb(23_32_38/0.06)] bg-surface p-5 shadow-card">
            <span className="absolute inset-x-0 top-0 h-1.5 bg-linear-to-l from-[#FF6B5A] via-[#FFC531] via-45% to-[#4D8DFF]" aria-hidden />
            <div className="flex items-center justify-between gap-2">
              <h2 id="status-h" className="font-display text-[1.2rem] font-black text-ink">
                حالة النشر
              </h2>
              <ProductStatusBadge status={product.status} />
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-canvas p-3">
              <span
                className="relative grid size-14 shrink-0 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(var(--brand) ${pct * 3.6}deg, var(--color-line) 0)`,
                }}
                aria-hidden
              >
                <span className="grid size-11 place-items-center rounded-full bg-surface font-display text-[0.85rem] font-black text-brand-800">{ar(pct)}٪</span>
              </span>
              <p className="text-[0.85rem] leading-6 text-ink-soft">
                <b className="font-display font-extrabold text-ink">
                  {ar(requiredDone)} من {ar(required.length)}
                </b>{" "}
                خطوات أساسية مكتملة
              </p>
            </div>

            <ul className="mt-4 space-y-1.5 text-sm">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-2.5">
                  {c.done ? (
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#34D9A0] to-[#0B8A66] text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]">
                      <Check className="size-3.5" strokeWidth={3} aria-hidden />
                    </span>
                  ) : (
                    <span className="size-6 shrink-0 rounded-full border-2 border-dashed border-line-strong" aria-hidden />
                  )}
                  <span className={c.done ? "font-medium text-ink-soft" : "text-muted"}>
                    {c.label}
                    <span className="sr-only">{c.done ? " (مكتمل)" : " (غير مكتمل)"}</span>
                  </span>
                </li>
              ))}
            </ul>
            {blockers.length && product.status !== "published" ? (
              <Alert tone="warning" className="mt-4">
                {blockers.join("، ")}
              </Alert>
            ) : null}
            <div className="mt-5 flex flex-col gap-2 [&_button]:w-full [&_form]:w-full [&_form]:items-stretch">
              {owner ? (
                <>
                  {product.status === "published" ? (
                    <QuickAction action={setStatusAction} hidden={{ id, status: "hidden" }} icon={<EyeOff aria-hidden />} label="إخفاء عن الطلاب" variant="outline" size="md" />
                  ) : product.status !== "in_review" ? (
                    shareExtreme.length && !product.is_free ? (
                      <ConfirmButton
                        action={setStatusAction}
                        hidden={{ id, status: "published", confirmShare: "1" }}
                        label="نشر للطلاب"
                        icon={<Send aria-hidden />}
                        variant="primary"
                        size="lg"
                        title="تأكيد نسبة المعلم"
                        description={`نسبة المعلم من صافي كل بيع: ${shareSummary}. هل هذه هي النسبة المتفق عليها؟`}
                        confirmLabel="نعم، انشر"
                      />
                    ) : (
                      <QuickAction action={setStatusAction} hidden={{ id, status: "published" }} icon={<Send aria-hidden />} label="نشر للطلاب" variant="primary" size="lg" />
                    )
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
                agreementOk ? (
                  <ActionForm action={submitForReviewAction} compact className="w-full">
                    <input type="hidden" name="id" value={id} />
                    <Checkbox name="rightsAttested" required data-testid="rights-attest" className="items-start text-[0.85rem] leading-6" label={RIGHTS_ATTESTATION_TEXT} />
                    <SubmitButton size="lg" className="mt-2 w-full" pendingText="جارٍ الإرسال…">
                      <Send aria-hidden /> إرسال للمراجعة
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <Alert tone="warning" title="اقبل اتفاقية المعلم أولًا" className="w-full" data-testid="agreement-needed">
                    لإرسال المحتوى للمراجعة، اقرأ <Link href="/admin/agreement">اتفاقية المعلم</Link> واقبلها. مسودتك محفوظة وتبقى كما هي.
                  </Alert>
                )
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
            <dl className="mt-5 space-y-0 border-t border-dashed border-line pt-2 text-[0.82rem]">
              {owner || product.price_fils > 0 ? <MetaRow label="السعر المعتمد" value={<span className="num font-bold text-brand-800">{filsToKwdString(product.price_fils)} د.ك</span>} /> : null}
              {product.proposed_price_fils !== null ? <MetaRow label="السعر المقترح" value={<span className="num">{filsToKwdString(product.proposed_price_fils)} د.ك</span>} /> : null}
              <MetaRow
                label="فترة الإتاحة"
                value={product.access_mode === "until_date" ? `حتى ${formatDate(product.access_until)}` : product.access_mode === "days" ? count(product.access_days ?? 0, W.day) : "غير محددة"}
              />
              <MetaRow label="آخر تحديث" value={formatDateTime(product.updated_at)} />
              <MetaRow label="تاريخ النشر" value={formatDateTime(product.published_at)} />
              {product.reviewed_at ? <MetaRow label="آخر مراجعة" value={`${formatDateTime(product.reviewed_at)}${owner && product.reviewed_by_name ? `، ${product.reviewed_by_name}` : ""}`} /> : null}
              <MetaRow
                label="الرابط"
                value={
                  <span className="num block truncate" dir="ltr">
                    /products/{product.slug}
                  </span>
                }
              />
            </dl>
          </div>
        </aside>

        {/* ───── المحتوى ───── */}
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {isVideo ? (
            <Section
              id="lessons"
              icon={<PlayCircle />}
              tone="sky"
              title="دروس الفيديو"
              description={provider === "bunny" ? "تُرفع مباشرة إلى Bunny Stream وتُعالَج بجودات متعددة. لا يُنشر المحتوى قبل اكتمال المعالجة." : "تُرفع إلى التخزين الخاص للمنصة وتُبث للمشتركين فقط."}
              actions={
                lessons.some((l) => l.provider === "bunny") ? (
                  <QuickAction action={syncLessonsAction} hidden={{ productId: id }} icon={<RefreshCw aria-hidden />} label="تحديث الحالة" variant="soft" />
                ) : null
              }
            >
              <AutoSyncLessons productId={id} active={processing && lessons.some((l) => l.provider === "bunny")} />
              {lessons.length ? (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className={cn("chip", toneClass(slug))}>
                      <PlayCircle aria-hidden /> {count(lessons.length, W.lesson)}
                    </span>
                    {totalDuration ? (
                      <span className="chip bg-mist text-ink-soft">
                        <Clock3 aria-hidden /> المدة الإجمالية {duration(totalDuration)}
                      </span>
                    ) : null}
                  </div>
                  <ul className="mb-5 space-y-2.5" data-testid="lesson-list">
                    {lessons.map((l, i) => {
                      const thumb = l.thumbnail_key ? storage().publicUrl(l.thumbnail_key) : null;
                      return (
                        <li key={l.id} className="overflow-hidden rounded-[1.25rem] border border-[rgb(23_32_38/0.07)] bg-surface shadow-[0_3px_0_var(--color-line)]">
                          <details className="group">
                            <summary className="flex min-h-16 cursor-pointer list-none flex-wrap items-center gap-3 p-3 text-sm transition-colors hover:bg-canvas sm:flex-nowrap [&::-webkit-details-marker]:hidden">
                              <span className={cn("num-tile size-9 rounded-[0.8rem] text-[1.05rem]", toneClass(slug))} aria-hidden>
                                {ar(i + 1)}
                              </span>
                              <span className={cn("poster relative hidden aspect-video w-20 shrink-0 sm:grid place-items-center overflow-hidden rounded-xl", toneClass(slug))} aria-hidden>
                                {thumb ? <Image src={thumb} alt="" fill sizes="80px" className="object-cover" /> : <PlayCircle className="size-6 text-white" />}
                              </span>
                              <span className="min-w-0 flex-1 basis-40">
                                <span className="block font-display font-extrabold text-ink">{l.title}</span>
                                <span className="block text-[0.78rem] leading-6 text-muted">
                                  {l.unit_title || "بدون قسم"} · {duration(l.duration_seconds) || "المدة غير معروفة بعد"} · {l.provider === "bunny" ? "Bunny Stream" : "ملف خاص"}
                                  {l.size_bytes ? ` · ${fmtSize(Number(l.size_bytes))}` : ""}
                                </span>
                              </span>
                              <span className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
                                <StatusPill tone={STATUS_TONE[l.processing_status]} pulse={l.processing_status === "processing"}>
                                  <span data-testid="lesson-status">{PROCESSING_STATUS_LABELS[l.processing_status]}</span>
                                </StatusPill>
                                {l.is_free_preview ? <span className="chip chip-gold min-h-7">مجاني</span> : null}
                                {!l.is_published ? <StatusPill tone="neutral">مخفي</StatusPill> : null}
                                <ChevronDown className="ms-1 size-5 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                              </span>
                            </summary>
                            <div className="space-y-4 border-t border-dashed border-line bg-canvas/50 p-4">
                              {l.processing_status === "failed" ? (
                                <Alert tone="danger">
                                  فشلت معالجة الفيديو
                                  {l.processing_error ? ` (${l.processing_error})` : ""}. احذف الدرس وارفعه من جديد.
                                </Alert>
                              ) : null}
                              {l.processing_status === "uploading" ? <Alert tone="warning">لم يكتمل رفع هذا الفيديو. إن توقف الرفع، احذف الدرس وارفعه من جديد.</Alert> : null}
                              <div className="flex flex-wrap items-center gap-2">
                                <Button asChild variant="soft" size="sm">
                                  <Link href={`/watch/${id}?lesson=${l.id}`} target="_blank">
                                    <Eye aria-hidden /> مشاهدة
                                  </Link>
                                </Button>
                                <span className="text-xs text-muted">آخر تحقق: {formatDateTime(l.status_checked_at)}</span>
                              </div>
                              {editable ? (
                                <>
                                  <ActionForm action={updateLessonAction} compact className="grid gap-3 rounded-2xl bg-surface p-4 sm:grid-cols-2">
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
                                    <div className="flex flex-wrap gap-x-6 sm:col-span-2">
                                      <Checkbox name="isFreePreview" defaultChecked={l.is_free_preview} label="معاينة مجانية" />
                                      <Checkbox name="isPublished" defaultChecked={l.is_published} label="منشور" />
                                    </div>
                                    <div className="sm:col-span-2">
                                      <SubmitButton size="sm">حفظ الدرس</SubmitButton>
                                    </div>
                                  </ActionForm>
                                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                                    <FileUploader
                                      target="lesson_thumb"
                                      productId={id}
                                      lessonId={l.id}
                                      accept="image/jpeg,image/png,image/webp"
                                      label={thumb ? "تغيير الصورة المصغرة" : "رفع صورة مصغرة"}
                                      hint="16:9، JPG أو PNG أو WEBP"
                                      compact
                                    />
                                    {thumb ? (
                                      <QuickAction
                                        action={removeLessonThumbAction}
                                        hidden={{
                                          productId: id,
                                          lessonId: l.id,
                                        }}
                                        icon={<ImageIcon aria-hidden />}
                                        label="إزالة الصورة"
                                        variant="ghost"
                                      />
                                    ) : null}
                                  </div>
                                  <div className="flex flex-wrap gap-1 border-t border-dashed border-line pt-3">
                                    <QuickAction
                                      action={moveLessonAction}
                                      hidden={{
                                        productId: id,
                                        lessonId: l.id,
                                        dir: "up",
                                      }}
                                      icon={<ArrowUp aria-hidden />}
                                      label="لأعلى"
                                      variant="ghost"
                                    />
                                    <QuickAction
                                      action={moveLessonAction}
                                      hidden={{
                                        productId: id,
                                        lessonId: l.id,
                                        dir: "down",
                                      }}
                                      icon={<ArrowDown aria-hidden />}
                                      label="لأسفل"
                                      variant="ghost"
                                    />
                                    <ConfirmButton
                                      action={deleteLessonAction}
                                      hidden={{ productId: id, lessonId: l.id }}
                                      label="حذف"
                                      icon={<Trash2 aria-hidden />}
                                      title="حذف الدرس؟"
                                      description="سيتم حذف الدرس وملف الفيديو الخاص به نهائيًا."
                                      confirmLabel="حذف"
                                    />
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
                <EmptyInline icon={<PlayCircle />}>لا توجد دروس بعد.</EmptyInline>
              )}
              {canUpload && hostingClosed && !owner ? (
                <Alert tone="warning" data-testid="lesson-upload-closed">
                  استضافة الفيديو غير مفعّلة على المنصة بعد، فلا يمكن رفع الدروس الآن ولن يُنشر هذا النوع من المحتوى حتى تفعيلها. يمكنك إضافة مذكرات PDF.
                </Alert>
              ) : null}
              {canUpload && (owner || !hostingClosed) ? (
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-[1.4rem] border-2 border-dashed border-brand-200 bg-[linear-gradient(160deg,var(--color-brand-50),#fff_70%)] p-4 sm:p-5">
                    <h3 className="mb-4 flex items-center gap-2.5 font-display text-[1.1rem] font-black text-ink">
                      <ToneIcon tone="teal" size="xs">
                        <Upload />
                      </ToneIcon>
                      {lessons.length ? "إضافة درس آخر" : "رفع أول درس فيديو"}
                    </h3>
                    <LessonUploader productId={id} provider={provider} maxLabel={uploadLimitLabel("video")} />
                  </div>
                  {owner && bunnyConfigured() ? (
                    <details className="group rounded-[1.25rem] border border-line bg-canvas/60 p-4">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-display font-extrabold text-ink [&::-webkit-details-marker]:hidden">
                        <Link2 className="size-4 text-brand-700" aria-hidden />
                        ربط فيديو موجود في Bunny Stream
                        <ChevronDown className="ms-auto size-5 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                      </summary>
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
              icon={<FileText />}
              tone="coral"
              title={isPdf ? "ملفات المذكرة" : "ملفات مرفقة (PDF)"}
              description={isPdf ? "الملفات الأصلية تُحفظ في تخزين خاص ولا تُعرض إلا لمن اشترى المنتج." : "أوراق عمل أو ملخصات تُرفق مع الفيديو للمشتركين (اختياري)."}
            >
              {canUpload ? (
                <FileUploader
                  target="main"
                  productId={id}
                  accept="application/pdf,.pdf"
                  multiple
                  label="اسحب ملفات PDF هنا أو اضغط للاختيار"
                  hint={`PDF فقط، حتى ${uploadLimitLabel("pdf")} للملف، بدون كلمة مرور أو قيود، يمكن رفع عدة ملفات`}
                  compact={!isPdf}
                />
              ) : null}
              {mainFiles.length ? (
                <ul className="mt-4 space-y-2.5">
                  {mainFiles.map((f, i) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[1.25rem] border border-[rgb(23_32_38/0.07)] bg-surface p-3 shadow-[0_3px_0_var(--color-line)]">
                      <span className="relative hidden h-14 w-11 shrink-0 flex-col gap-1 rounded-lg border-2 border-white bg-white p-1 shadow-[0_6px_12px_-6px_rgb(23_32_38/0.45)] sm:flex" aria-hidden>
                        <span className={cn("grid h-4 place-items-center rounded-[0.3rem] bg-linear-to-br from-[var(--a)] to-[var(--b)] text-white", toneClass(slug))}>
                          <FileText className="size-2.5" />
                        </span>
                        <span className="h-1 rounded-full bg-line" />
                        <span className="h-1 w-3/4 rounded-full bg-line" />
                        <span className="h-1 w-1/2 rounded-full bg-line" />
                        <span className="absolute -start-2 -top-2 grid size-5 place-items-center rounded-full bg-ink font-display text-[0.65rem] font-black text-white">{ar(i + 1)}</span>
                      </span>
                      <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                        {editable ? (
                          <ActionForm action={renameFileAction} compact className="flex items-center gap-1.5">
                            <input type="hidden" name="productId" value={id} />
                            <input type="hidden" name="fileId" value={f.id} />
                            <Input name="title" defaultValue={f.title} className="h-11 text-sm" aria-label="اسم الملف" maxLength={160} />
                            <Button type="submit" size="sm" variant="soft" className="h-11">
                              حفظ
                            </Button>
                          </ActionForm>
                        ) : (
                          <p className="font-display font-extrabold text-ink">{f.title}</p>
                        )}
                        {isFlagged(f.check_status) ? (
                          <p className="mt-1 text-xs font-bold text-danger" data-testid="file-flagged">
                            {FILE_PROBLEM_LABELS[f.check_status as FlaggedStatus]}. احذفه وارفع نسخة سليمة.
                          </p>
                        ) : null}
                        {isFlagged(f.check_status) && owner ? (
                          <div className="mt-1">
                            <QuickAction action={recheckFileAction} hidden={{ fileId: f.id, productId: id }} icon={<RefreshCw aria-hidden />} label="إعادة فحص الملف" />
                          </div>
                        ) : null}
                        <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-muted">
                          <span className="chip min-h-6 bg-mist px-2 text-[0.72rem] text-ink-soft">{f.page_count ? count(f.page_count, W.page) : "عدد الصفحات غير معروف"}</span>
                          <span className="chip min-h-6 bg-mist px-2 text-[0.72rem] text-ink-soft">
                            <span className="num">{fmtSize(f.size_bytes)}</span>
                          </span>
                          <span className="self-center">{formatDateTime(f.created_at)}</span>
                        </p>
                      </div>
                      <div className="ms-auto flex items-center gap-1">
                        {editable ? (
                          <>
                            <QuickAction
                              action={moveFileAction}
                              hidden={{
                                productId: id,
                                fileId: f.id,
                                dir: "up",
                              }}
                              icon={<ArrowUp aria-hidden />}
                              variant="ghost"
                              size="icon"
                              title="تحريك لأعلى"
                            />
                            <QuickAction
                              action={moveFileAction}
                              hidden={{
                                productId: id,
                                fileId: f.id,
                                dir: "down",
                              }}
                              icon={<ArrowDown aria-hidden />}
                              variant="ghost"
                              size="icon"
                              title="تحريك لأسفل"
                            />
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
                <EmptyInline icon={<FileText />} className="mt-4">
                  لم يُرفع أي ملف بعد.
                </EmptyInline>
              ) : null}
            </Section>
          ) : null}

          {isPdf ? (
            <Section icon={<Eye />} tone="gold" title="المعاينة المجانية" description={`تُولَّد تلقائيًا من الصفحات الأولى في الملف الأول، أو ارفع ملف معاينة مخصص. ${PREVIEW_RULE_TEXT}`}>
              {previewProblem ? (
                <Alert tone="warning" className="mb-4" title="هذه المعاينة لا تظهر للطلاب">
                  {PREVIEW_ISSUE_LABELS[previewProblem]}. {PREVIEW_ISSUE_FIX[previewProblem]}.
                </Alert>
              ) : null}
              {mainFiles.length && previewAllowance === 0 ? <Alert tone="info" className="mb-4">الملف الأول أقل من {ar(PREVIEW_POLICY.pagesPerFreePage)} صفحات، فلا تتاح له معاينة حتى لا تكشف الملف كله.</Alert> : null}
              {preview ? (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[1.25rem] border-2 border-[#FFE08A] bg-[#FFFBEA] p-3">
                  <ToneIcon tone="gold" size="sm">
                    <Eye />
                  </ToneIcon>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-display font-extrabold text-ink">{preview.is_auto_preview ? "معاينة تلقائية" : "معاينة مخصصة (مرفوعة يدويًا)"}</p>
                    <p className="text-xs text-muted">{preview.page_count ? count(preview.page_count, W.page) : "عدد الصفحات غير معروف"}، متاحة للجميع بدون تسجيل</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/preview/${preview.id}`} target="_blank">
                      فتح
                    </Link>
                  </Button>
                </div>
              ) : (
                <EmptyInline icon={<Eye />} className="mb-4">
                  لا توجد معاينة حاليًا
                  {product.preview_pages === 0 ? " (عدد صفحات المعاينة = ٠)" : mainFiles.length ? "" : "، ارفع ملفًا أولًا"}.
                </EmptyInline>
              )}
              {editable ? (
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  {canUpload ? <FileUploader target="preview" productId={id} accept="application/pdf,.pdf" label="رفع معاينة مخصصة (PDF)" compact /> : <span />}
                  <div className="flex flex-col gap-2">
                    <QuickAction action={regeneratePreviewAction} hidden={{ productId: id, dropCustom: "1" }} icon={<RotateCcw aria-hidden />} label="توليد تلقائي" variant="soft" />
                  </div>
                </div>
              ) : null}
            </Section>
          ) : null}

          {isContainer && (bundleItems.length > 0 || candidates.length > 0 || product.type === "bundle") ? (
            <Section
              icon={<Package />}
              tone="violet"
              title={product.type === "bundle" ? "محتويات الباقة" : "محتويات مضمّنة"}
              description={
                product.type === "bundle"
                  ? "من نفس الصف، فيديوهات ومذكرات ودورات. المشتري يحصل على كل المحتويات (بأي عمق) ولا تُحتسب المكررة."
                  : "أضف وحدات أو دروسًا منفردة لتكوين الدورة/الوحدة، من يشتريها يحصل عليها كلها، ويمكن بيع كل جزء منفردًا أيضًا."
              }
            >
              {bundleItems.length ? (
                <>
                  <ul className="space-y-2">
                    {bundleItems.map((it) => (
                      <li
                        key={it.product_id}
                        className="relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[1.25rem] border border-[rgb(23_32_38/0.07)] bg-surface p-2.5 pe-3 text-sm shadow-[0_3px_0_var(--color-line)]"
                      >
                        <AdminThumb type={it.type} subjectName={it.subject_name} gradeLevel={product.grade_level} size="sm" />
                        <div className="min-w-[min(100%,12rem)] flex-1">
                          <Link href={`/admin/products/${it.product_id}`} className="line-clamp-2 font-display font-extrabold text-ink hover:text-brand-700">
                            {it.title}
                          </Link>
                          <p className="text-xs text-muted">
                            {PRODUCT_TYPE_LABELS[it.type]}، {it.subject_name ?? "كل المواد"}
                            {owner && it.teacher_name ? `، ${it.teacher_name}` : ""} {it.status !== "published" ? "، غير منشور" : ""}
                          </p>
                        </div>
                        {/* على الهاتف: السعر وزر الإزالة ينزلان تحت العنوان حتى لا يضيق */}
                        <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-between max-sm:border-t max-sm:border-dashed max-sm:border-line max-sm:pt-2">
                          <span className="font-display font-black whitespace-nowrap text-ink">
                            <span className="num">{filsToKwdString(it.price_fils)}</span> <span className="text-[0.75rem] text-muted">د.ك</span>
                          </span>
                          {editable ? (
                            <QuickAction action={removeBundleItemAction} hidden={{ bundleId: id, productId: it.product_id }} icon={<Trash2 aria-hidden />} variant="ghost" size="icon" title="إزالة" />
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <ValueTile label="قيمة المحتويات منفردة" value={`${filsToKwdString(itemsTotal)} د.ك`} />
                    <ValueTile label="السعر" value={`${filsToKwdString(product.price_fils)} د.ك`} strong />
                    {itemsTotal > product.price_fils && product.price_fils > 0 ? <ValueTile label="توفير" value={`${filsToKwdString(itemsTotal - product.price_fils)} د.ك`} good /> : null}
                  </div>
                </>
              ) : (
                <EmptyInline icon={<Package />}>لا توجد محتويات مضمّنة بعد.</EmptyInline>
              )}
              {candidates.length ? (
                <ActionForm action={addBundleItemAction} className="mt-5">
                  <input type="hidden" name="bundleId" value={id} />
                  <p className="mb-2 font-display text-[0.95rem] font-extrabold text-ink">إضافة محتوى من {product.grade_name}</p>
                  <div className="max-h-80 space-y-1 overflow-y-auto rounded-[1.25rem] border border-line bg-canvas/50 p-2">
                    {candidates.map((c) => (
                      <label
                        key={c.id}
                        className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-surface has-[:checked]:bg-brand-50 has-[:checked]:ring-1 has-[:checked]:ring-brand-200"
                      >
                        <input type="checkbox" name="productId" value={c.id} className="size-5 shrink-0 accent-[var(--brand)]" />
                        <AdminThumb type={c.type} subjectName={c.subject_name} gradeLevel={product.grade_level} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="font-display font-bold text-ink">{c.title}</span>
                          <span className="block text-xs text-muted">
                            {c.subject_name ?? "كل المواد"}، {PRODUCT_TYPE_LABELS[c.type]}
                            {owner && c.teacher_name ? `، ${c.teacher_name}` : ""} {c.status !== "published" ? "، غير منشور" : ""}
                          </span>
                          {/* على الهاتف: السعر تحت العنوان حتى لا يضيق العنوان */}
                          <span className="mt-0.5 block text-xs font-bold text-ink-soft sm:hidden">
                            <span className="num">{filsToKwdString(c.price_fils)}</span> د.ك
                          </span>
                        </span>
                        <span className="text-xs font-bold whitespace-nowrap text-ink-soft max-sm:hidden">
                          <span className="num">{filsToKwdString(c.price_fils)}</span> د.ك
                        </span>
                      </label>
                    ))}
                  </div>
                  {product.status === "published" && !product.is_free ? (
                    <div className="mt-3">
                      <Checkbox name="confirmShare" label="إن كانت نسبة معلم ما أضيفه ٠٪ أو ١٠٠٪، أؤكد أنها النسبة المتفق عليها" />
                    </div>
                  ) : null}
                  <SubmitButton size="sm" variant="secondary" className="mt-3">
                    إضافة المحدد
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </Section>
          ) : null}

          <Section id="details" icon={<Pencil />} tone="teal" title="بيانات المحتوى" description={editable ? "عدّل البيانات ثم اضغط «حفظ التعديلات» أسفل النموذج." : "للعرض فقط."}>
            <ProductForm
              mode="edit"
              role={actor.kind}
              readOnly={!editable}
              headingLevel={3}
              videoHostingClosed={hostingClosed}
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
                isFree: product.is_free,
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
          </Section>
        </div>

        {/* ───── الغلاف ───── */}
        <aside aria-labelledby="cover-h" className="min-w-0 lg:col-start-2 lg:row-start-2">
          <div className="rounded-[1.75rem] border border-[rgb(23_32_38/0.06)] bg-surface p-5 shadow-card">
            <h2 id="cover-h" className="mb-1 flex items-center gap-2.5 font-display text-[1.2rem] font-black text-ink">
              <ToneIcon tone="pink" size="xs">
                <ImageIcon />
              </ToneIcon>
              صورة الغلاف
            </h2>
            <p className="mb-4 text-[0.82rem] leading-6 text-muted">{coverUrl ? "الغلاف المرفوع يظهر في الموقع بدل الغلاف التلقائي." : "يُعرض غلاف تلقائي بألوان المادة كما في المعاينة."}</p>
            <div className="mx-auto mb-4 max-w-[13rem] lg:max-w-none">
              <PosterPreview
                type={product.type}
                subjectName={product.subject_name}
                gradeName={product.grade_name}
                gradeLevel={product.grade_level}
                coverUrl={coverUrl}
                alt={coverUrl ? "غلاف المنتج" : undefined}
                className={coverUrl ? undefined : "opacity-95"}
              />
            </div>
            {canUpload ? (
              <FileUploader
                target="cover"
                productId={id}
                accept="image/jpeg,image/png,image/webp"
                label={coverUrl ? "تغيير الغلاف" : "رفع صورة غلاف"}
                hint="JPG أو PNG أو WEBP، حتى 5 م.ب، نسبة 4:5"
                compact
              />
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

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line py-2 last:border-0">
      <dt className="shrink-0 font-display font-bold text-muted">{label}</dt>
      <dd className="min-w-0 text-end text-ink-soft">{value}</dd>
    </div>
  );
}

function ValueTile({ label, value, strong, good }: { label: string; value: string; strong?: boolean; good?: boolean }) {
  return (
    <div className={cn("rounded-2xl px-4 py-3", good ? "bg-success-50" : strong ? "bg-brand-50" : "bg-mist")}>
      <p className={cn("font-display text-[0.78rem] font-bold", good ? "text-success" : strong ? "text-brand-800" : "text-ink-soft")}>{label}</p>
      <p className={cn("num font-display text-[1.2rem] font-black", good ? "text-success" : "text-ink")}>{value}</p>
    </div>
  );
}

function EmptyInline({ icon, children, className }: { icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 flex items-center gap-3 rounded-[1.25rem] border-2 border-dashed border-line-strong bg-canvas/70 p-4 text-sm font-medium text-muted", className)}>
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface text-brand-600 shadow-xs [&_svg]:size-5" aria-hidden>
        {icon}
      </span>
      {children}
    </div>
  );
}
