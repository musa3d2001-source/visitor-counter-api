import { requireOwnerPage } from "@/server/auth/permissions";
import { storageFileCap, uploadLimitLabel } from "@/server/storage";
import Image from "next/image";
import { CircleCheck, CreditCard, Database, Image as ImageIcon, TriangleAlert, Video } from "lucide-react";
import { getSettingsReport, SETTINGS_LABELS } from "@/server/platform/settings";
import { SettingsInvalidAlert } from "@/components/admin/settings-invalid-alert";
import { paymentsConfig } from "@/server/payments/service";
import { webhookDeliveryStatus } from "@/server/payments/monitoring";
import { bunnyConfigured } from "@/server/video/bunny";
import { videoHostingBlocked } from "@/server/video/policy";
import { ar, count } from "@/lib/design";
import { stampedCopyBudgetBytes } from "@/server/access/copy-store";
import { WEBHOOK_REJECTION_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { env } from "@/server/env";
import { storage } from "@/server/storage";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { SettingsForm } from "@/components/admin/settings-form";
import { TeacherMoneyRules } from "@/components/admin/teacher-money-rules";
import { FileUploader } from "@/components/admin/file-uploader";
import { QuickAction } from "@/components/admin/confirm-button";
import { StatusPill } from "@/components/admin/status-badge";
import { LogoMark } from "@/components/art";
import { PageBand } from "../_components/overview/bands";
import { DELIVERY } from "../_components/overview/money";
import { removeLogoAction, saveSettingsAction } from "./actions";

export const metadata = { title: "إعدادات المنصة" };

function Row({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
      <span className="font-medium text-ink-soft">{label}</span>
      <StatusPill tone={ok ? "success" : "warning"} icon={ok ? <CircleCheck aria-hidden /> : <TriangleAlert aria-hidden />}>
        {text}
      </StatusPill>
    </li>
  );
}

function Url({ label, url }: { label: string; url: string }) {
  return (
    <div className="space-y-1.5">
      <p className="font-display text-[0.8rem] font-bold text-ink-soft">{label}</p>
      <code className="block rounded-xl border border-dashed border-line-strong bg-canvas px-3 py-2 text-[0.75rem] leading-5 break-all text-ink" dir="ltr">
        {url}
      </code>
    </div>
  );
}

export default async function SettingsPage() {
  await requireOwnerPage();
  const { settings: s, invalid } = await getSettingsReport();
  const e = env();
  const storageCap = storageFileCap();
  const cfg = paymentsConfig();
  const delivery = await webhookDeliveryStatus();
  const logoUrl = s.logo_key ? storage().publicUrl(s.logo_key) : null;
  const webhookUrl = `${e.APP_URL.replace(/\/$/, "")}/api/payments/myfatoorah/webhook`;
  const callbackUrl = `${e.APP_URL.replace(/\/$/, "")}/payment/return`;
  const modeLabel = { disabled: "معطّل", sandbox: "بيئة اختبار (Sandbox)", live: "إنتاج (Live)" }[e.PAYMENTS_MODE];
  // مساحة النسخ المختومة (F24): على Supabase بالخطة المجانية تتسع لنسخ قليلة، فتُحذف الأقدم ويُعاد ختمها عند فتحها
  const copyBudget = stampedCopyBudgetBytes();
  const copySpaceOk = e.STORAGE_DRIVER !== "supabase" || e.STORAGE_PLAN === "paid" || e.STAMPED_COPY_BUDGET_GB > 0;
  const copySpaceSize = copyBudget >= 1024 ** 3 ? `${ar(Math.round(copyBudget / 1024 ** 3))} جيجابايت` : `${ar(Math.round(copyBudget / 1024 ** 2))} ميجابايت`;
  const copySpaceText = e.STAMPED_COPY_BUDGET_GB > 0 ? `${copySpaceSize} (STAMPED_COPY_BUDGET_GB)` : copySpaceOk ? copySpaceSize : `${copySpaceSize} فقط، حتى STORAGE_PLAN=paid`;

  return (
    <div className="space-y-6">
      <PageBand tone="slate" art="settings">
        <AdminPageHeader title="إعدادات المنصة" description="الاسم والشعار والألوان والتواصل والأسئلة الشائعة، تُطبق فورًا دون تعديل الكود." className="mb-0" />
      </PageBand>

      <SettingsInvalidAlert labels={invalid.map((k) => SETTINGS_LABELS[k])} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <SettingsForm
          action={saveSettingsAction}
          values={{
            site_name: s.site_name,
            tagline: s.tagline,
            hero_title: s.hero_title,
            hero_subtitle: s.hero_subtitle,
            primary_color: s.primary_color,
            accent_color: s.accent_color,
            whatsapp_number: s.whatsapp_number,
            contact_email: s.contact_email,
            contact_phone: s.contact_phone,
            instagram_url: s.instagram_url,
            academic_year: s.academic_year,
            videos_enabled: s.videos_enabled,
            watermark_enabled: s.watermark_enabled,
            faq: s.faq,
            footer_note: s.footer_note,
            seller_legal_name: s.seller_legal_name,
            seller_license_number: s.seller_license_number,
            seller_address: s.seller_address,
            mail_provider_name: s.mail_provider_name,
            fee_percent: String(s.fee_percent_bps / 100),
            fee_fixed: filsToKwdString(s.fee_fixed_fils),
            fee_rules_confirmed_on: s.fee_rules_confirmed_at ? formatDateTime(s.fee_rules_confirmed_at) : null,
          }}
        />

        <aside className="space-y-6">
          <Section title="الشعار" icon={<ImageIcon />} tone="pink">
            <div className="bg-sunny mb-4 grid h-32 place-items-center rounded-[1.25rem] border border-white shadow-xs">
              {logoUrl ? (
                <Image src={logoUrl} alt="شعار المنصة" width={96} height={96} className="max-h-24 w-auto object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-2">
                  <LogoMark size={56} />
                  <span className="text-sm font-medium text-muted">يُستخدم الشعار الافتراضي</span>
                </span>
              )}
            </div>
            <FileUploader target="logo" accept="image/png,image/jpeg,image/webp" label={logoUrl ? "تغيير الشعار" : "رفع شعار"} hint="PNG بخلفية شفافة يفضل، مربع" compact />
            {logoUrl ? (
              <div className="mt-2">
                <QuickAction action={removeLogoAction} label="إزالة الشعار" variant="ghost" />
              </div>
            ) : null}
          </Section>

          <TeacherMoneyRules audience="owner" feePercentBps={s.fee_percent_bps} feeFixedFils={s.fee_fixed_fils} />

          <Section title="بوابة الدفع" description="تُضبط من متغيرات البيئة على الخادم، لا تُعرض المفاتيح هنا أبدًا." icon={<CreditCard />} tone="green">
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-canvas px-3 py-2.5">
              <span className="font-display font-black text-ink" dir="ltr">
                MyFatoorah
              </span>
              <StatusPill tone={cfg.enabled ? (cfg.environment === "live" ? "success" : "warning") : "neutral"}>{cfg.enabled ? modeLabel : "غير مفعّل"}</StatusPill>
            </div>
            {!cfg.enabled ? <p className="mb-3 rounded-xl bg-warning-50 px-3 py-2 text-xs leading-6 font-semibold text-warning">{cfg.reason}</p> : null}
            <ul className="divide-y divide-line">
              <Row label="الوضع (PAYMENTS_MODE)" ok={e.PAYMENTS_MODE !== "disabled"} text={modeLabel} />
              <Row label="مفتاح API" ok={Boolean(e.MYFATOORAH_API_KEY)} text={e.MYFATOORAH_API_KEY ? "مضبوط" : "غير مضبوط"} />
              <Row label="مفتاح توقيع Webhook" ok={Boolean(e.MYFATOORAH_WEBHOOK_SECRET)} text={e.MYFATOORAH_WEBHOOK_SECRET ? "مضبوط" : "غير مضبوط"} />
              {e.PAYMENTS_MODE === "live" ? <Row label="تأكيد الإنتاج" ok={e.MYFATOORAH_LIVE_CONFIRMED} text={e.MYFATOORAH_LIVE_CONFIRMED ? "مؤكد" : "غير مؤكد"} /> : null}
              <Row label="آخر إشعار صحيح من البوابة" ok={Boolean(delivery.lastValid)} text={delivery.lastValid ? formatDateTime(delivery.lastValid.at) : "لم يصل بعد"} />
              <Row label="إشعارات مرفوضة (٢٤ ساعة)" ok={delivery.rejectedLast24h === 0} text={delivery.rejectedLast24h ? count(delivery.rejectedLast24h, DELIVERY) : "لا يوجد"} />
              {delivery.lastRejected ? (
                <Row label="آخر سبب رفض" ok={false} text={`${WEBHOOK_REJECTION_LABELS[delivery.lastRejected.reason] ?? delivery.lastRejected.reason}، ${formatDateTime(delivery.lastRejected.at)}`} />
              ) : null}
              {delivery.stuckEvents ? <Row label="إشعارات عالقة بانتظار إعادة الإرسال" ok={false} text={count(delivery.stuckEvents, DELIVERY)} /> : null}
            </ul>
            <div className="mt-4 space-y-3">
              <Url label="رابط Webhook (يُضاف في لوحة MyFatoorah، الإصدار V2):" url={webhookUrl} />
              <Url label="رابط العودة بعد الدفع:" url={callbackUrl} />
            </div>
          </Section>

          <Section title="مزود الفيديو" description="يُضبط من متغيرات البيئة، لا تُعرض المفاتيح هنا." icon={<Video />} tone="sky">
            <ul className="divide-y divide-line">
              <Row label="مزود الرفع (VIDEO_PROVIDER)" ok text={e.VIDEO_PROVIDER === "bunny" ? "Bunny Stream" : "تخزين المنصة الخاص"} />
              <Row label="نشر وبيع الفيديو" ok={!videoHostingBlocked()} text={videoHostingBlocked() ? "متوقف: ملفات خام بلا ALLOW_FILE_VIDEO" : e.VIDEO_PROVIDER === "file" ? "متاح كملف خام يمكن تنزيله" : "متاح"} />
              <Row label="Bunny Stream مضبوط" ok={bunnyConfigured()} text={bunnyConfigured() ? "نعم" : "لا"} />
              <Row label="مفتاح توقيع Webhook" ok={Boolean(e.BUNNY_STREAM_READONLY_API_KEY)} text={e.BUNNY_STREAM_READONLY_API_KEY ? "مضبوط" : "غير مضبوط"} />
              <Row label="نطاق صور المعاينة (CDN)" ok={Boolean(e.BUNNY_STREAM_CDN_HOSTNAME)} text={e.BUNNY_STREAM_CDN_HOSTNAME ? "مضبوط" : "غير مضبوط"} />
            </ul>
            <div className="mt-4">
              <Url label="رابط Webhook (يُضاف في إعدادات مكتبة Bunny Stream):" url={`${e.APP_URL.replace(/\/$/, "")}/api/video/bunny/webhook`} />
            </div>
          </Section>

          <Section title="التخزين" icon={<Database />} tone="violet">
            <p className="mb-2 text-[0.85rem] leading-7 text-ink-soft" data-testid="storage-plan-note">
              {storageCap.source === "free_plan"
                ? "خطة Supabase المجانية لا تقبل ملفًا فوق 50 ميجابايت، فيُرفض الملف الأكبر قبل بدء رفعه. بعد الترقية ارفع «Global file size limit» من إعدادات Storage، ثم اضبط STORAGE_PLAN=paid في بيئة النشر."
                : storageCap.source === "override"
                  ? "الحد مضبوط يدويًا عبر STORAGE_MAX_FILE_MB، ويجب أن يطابق «Global file size limit» في إعدادات Storage."
                  : e.STORAGE_DRIVER === "supabase"
                    ? "الخطة مدفوعة حسب STORAGE_PLAN. تأكد أن «Global file size limit» في إعدادات Storage لا يقل عن هذه الحدود، وإلا رفض التخزين الملف بعد رفعه."
                    : "التخزين محلي، والحدود هي قواعد الرفع في المنصة."}
            </p>
            <ul className="divide-y divide-line">
              <Row label="مزود التخزين" ok text={e.STORAGE_DRIVER === "supabase" ? "Supabase Storage" : "تخزين محلي"} />
              <Row label="حد ملف PDF" ok={storageCap.source !== "free_plan"} text={uploadLimitLabel("pdf")} />
              <Row label="حد ملف الفيديو المخزن" ok={storageCap.source !== "free_plan"} text={uploadLimitLabel("video")} />
              <Row label="مساحة نسخ الطلاب المختومة" ok={copySpaceOk} text={copySpaceText} />
              <Row label="البريد" ok={e.MAIL_DRIVER === "smtp"} text={e.MAIL_DRIVER === "smtp" ? "SMTP" : "سجل داخلي، لا يصل لأحد"} />
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}
