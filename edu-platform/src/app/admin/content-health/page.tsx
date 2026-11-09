import { Eye, FileWarning, Package, RefreshCw, ScanSearch, ShieldCheck, Tag, UserRoundX } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { contentHealthCounts, contentHealthReport } from "@/server/admin/content-health";
import { FILE_PROBLEM_LABELS } from "@/server/access/file-check";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { DataList, DataRow } from "@/components/admin/data-list";
import { ProductStatusBadge, StatusPill } from "@/components/admin/status-badge";
import { ToneIcon } from "@/components/admin/icon-tile";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { ar } from "@/lib/design";
import { PREVIEW_ISSUE_LABELS, PREVIEW_RULE_TEXT } from "@/lib/preview-policy";
import { QuickAction } from "@/components/admin/confirm-button";
import { recheckFileAction, regeneratePreviewsAction, scanFilesAction } from "./actions";

export const metadata = { title: "سلامة المحتوى" };

/** الفحص يقرأ ملفات كبيرة من التخزين، والدفعة الواحدة أقل من هذه المهلة */
export const maxDuration = 60;

export default async function ContentHealthPage() {
  await requireOwnerPage();
  const [counts, report] = await Promise.all([contentHealthCounts(), contentHealthReport()]);
  const clean = counts.flagged + counts.unchecked + counts.badPreviews + counts.unpriced + counts.noShare + counts.stoppedBundles === 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="سلامة المحتوى" description="ما يجب إصلاحه قبل أن يصل إلى طالب دفع ثمنه: ملفات لا تفتح، ومعاينات تكشف أكثر مما يجب، ومنتجات بلا سعر أو بلا نسبة معلم." />

      {clean ? (
        <Alert tone="success" title="لا يوجد ما يحتاج إلى قرارك">
          كل الملفات مفحوصة، وكل المعاينات ضمن القاعدة، وكل المنتجات المنشورة لها سعر ونسبة معلم.
        </Alert>
      ) : null}

      {counts.unchecked > 0 ? (
        <Section icon={<ScanSearch />} tone="sky" title="ملفات لم تُفحص بعد" description="ملفات رُفعت قبل إضافة الفحص. يُجرَّب ختم كل ملف ثم يُفتح كما يفتحه الطالب، ولا يتغير الملف نفسه.">
          <ActionForm action={scanFilesAction} className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink-soft">
              المتبقي: <b className="font-display font-extrabold text-ink">{ar(counts.unchecked)}</b> ملف، والمنشور يُفحص أولًا. الدفعة الواحدة تستغرق أقل من دقيقة.
            </p>
            <SubmitButton variant="primary" size="md" pendingText="جارٍ الفحص…">
              <ScanSearch aria-hidden /> فحص الدفعة التالية
            </SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {report.flagged.length ? (
        <Section icon={<FileWarning />} tone="coral" title="ملفات معيبة" description="هذه الملفات تفشل عند الطالب. احذف الملف من صفحة المنتج وارفع نسخة سليمة بدون حماية. وإن كان ظهورها هنا بعد عطل عابر في التخزين فأعد فحصها.">
          <DataList data-testid="health-flagged">
            {report.flagged.map((f) => (
              <DataRow
                key={f.id}
                href={`/admin/products/${f.product_id}`}
                leading={
                  <ToneIcon tone="coral" size="sm">
                    <FileWarning />
                  </ToneIcon>
                }
                title={f.title}
                sub={`${f.product_title}، ${FILE_PROBLEM_LABELS[f.check_status]}`}
                badges={<ProductStatusBadge status={f.product_status} />}
                aside={<QuickAction action={recheckFileAction} hidden={{ fileId: f.id, productId: f.product_id }} icon={<RefreshCw aria-hidden />} label="إعادة الفحص" />}
              />
            ))}
          </DataList>
        </Section>
      ) : null}

      {report.previews.length ? (
        <Section icon={<Eye />} tone="gold" title="معاينات مخالفة أو قديمة" description={`هذه المعاينات لا تظهر للطلاب حاليًا. القاعدة: ${PREVIEW_RULE_TEXT}`}>
          <ActionForm action={regeneratePreviewsAction} className="mb-4 flex flex-col items-start gap-2">
            <SubmitButton variant="primary" size="md" pendingText="جارٍ التوليد…">
              <RefreshCw aria-hidden /> إعادة توليد الكل
            </SubmitButton>
          </ActionForm>
          <DataList data-testid="health-previews">
            {report.previews.map((p) => (
              <DataRow
                key={p.id}
                href={`/admin/products/${p.product_id}`}
                leading={
                  <ToneIcon tone="gold" size="sm">
                    <Eye />
                  </ToneIcon>
                }
                title={p.product_title}
                sub={`${PREVIEW_ISSUE_LABELS[p.issue]}. المعاينة ${ar(p.page_count ?? 0)} من ${ar(p.main_pages ?? 0)} صفحة`}
                badges={
                  <>
                    <ProductStatusBadge status={p.product_status} />
                    {p.is_auto_preview ? null : <StatusPill tone="neutral">مخصصة</StatusPill>}
                  </>
                }
              />
            ))}
          </DataList>
        </Section>
      ) : null}

      {report.unpriced.length ? (
        <Section icon={<Tag />} tone="coral" title="منشور بسعر صفر دون قرار" description="نُشرت قبل هذا الضابط، ومتوقف بيعها الآن. افتح المنتج وحدد سعره، أو علّمه مجانيًا إن كان ذلك مقصودًا.">
          <DataList data-testid="health-unpriced">
            {report.unpriced.map((p) => (
              <DataRow key={p.id} href={`/admin/products/${p.id}`} title={p.title} sub={p.teacher_name ?? "محتوى المنصة"} badges={<ProductStatusBadge status={p.status} />} />
            ))}
          </DataList>
        </Section>
      ) : null}

      {report.noShare.length ? (
        <Section icon={<UserRoundX />} tone="coral" title="منشور لمعلم بلا نسبة" description="بيع هذه المنتجات متوقف، فبدون نسبة لا يُسجَّل للمعلم حقه. حدد النسبة في صفحة المعلم.">
          <DataList data-testid="health-noshare">
            {report.noShare.map((p) => (
              <DataRow key={p.id} href={`/admin/products/${p.id}`} title={p.title} sub={p.teacher_name ?? ""} badges={<ProductStatusBadge status={p.status} />} />
            ))}
          </DataList>
        </Section>
      ) : null}

      {report.stoppedBundles.length ? (
        <Section icon={<Package />} tone="coral" title="باقات توقف بيعها بسبب ما بداخلها" description="في كل باقة منتج لمعلم بلا نسبة أو ملف معيب، فلا يمكن شراؤها حتى يُحل ذلك.">
          <DataList data-testid="health-stopped-bundles">
            {report.stoppedBundles.map((p) => (
              <DataRow key={p.id} href={`/admin/products/${p.id}`} title={p.title} sub={p.teacher_name ?? "محتوى المنصة"} badges={<ProductStatusBadge status={p.status} />} />
            ))}
          </DataList>
        </Section>
      ) : null}

      {clean ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <ShieldCheck className="size-4" aria-hidden /> الفحص يتكرر تلقائيًا مع كل ملف جديد عند رفعه.
        </p>
      ) : null}
    </div>
  );
}
