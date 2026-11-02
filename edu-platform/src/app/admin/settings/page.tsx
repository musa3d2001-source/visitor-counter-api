import { requireOwnerPage } from "@/server/auth/permissions";
import Image from "next/image";
import { CircleCheck, CreditCard, TriangleAlert } from "lucide-react";
import { getSettings } from "@/server/platform/settings";
import { paymentsConfig } from "@/server/payments/service";
import { bunnyConfigured } from "@/server/video/bunny";
import { filsToKwdString } from "@/lib/money";
import { env } from "@/server/env";
import { storage } from "@/server/storage";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { SettingsForm } from "@/components/admin/settings-form";
import { FileUploader } from "@/components/admin/file-uploader";
import { QuickAction } from "@/components/admin/confirm-button";
import { Badge } from "@/components/ui/badge";
import { removeLogoAction, saveSettingsAction } from "./actions";

export const metadata = { title: "إعدادات المنصة" };

function Row({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-ink-soft">{label}</span>
      <span className={`flex items-center gap-1.5 font-semibold ${ok ? "text-success" : "text-warning"}`}>
        {ok ? <CircleCheck className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
        {text}
      </span>
    </li>
  );
}

export default async function SettingsPage() {
  await requireOwnerPage();
  const s = await getSettings();
  const e = env();
  const cfg = paymentsConfig();
  const logoUrl = s.logo_key ? storage().publicUrl(s.logo_key) : null;
  const webhookUrl = `${e.APP_URL.replace(/\/$/, "")}/api/payments/myfatoorah/webhook`;
  const callbackUrl = `${e.APP_URL.replace(/\/$/, "")}/payment/return`;
  const modeLabel = { disabled: "معطّل", sandbox: "بيئة اختبار (Sandbox)", live: "إنتاج (Live)" }[e.PAYMENTS_MODE];

  return (
    <div className="space-y-6">
      <AdminPageHeader title="إعدادات المنصة" description="الاسم والشعار والألوان والتواصل والأسئلة الشائعة — تُطبق فورًا دون تعديل الكود." />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
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
            fee_percent: String(s.fee_percent_bps / 100),
            fee_fixed: filsToKwdString(s.fee_fixed_fils),
          }}
        />

        <aside className="space-y-6">
          <Section title="الشعار">
            <div className="mb-3 grid h-28 place-items-center rounded-xl bg-canvas">
              {logoUrl ? <Image src={logoUrl} alt="شعار المنصة" width={96} height={96} className="max-h-24 w-auto object-contain" /> : <span className="text-sm text-muted">يُستخدم الشعار الافتراضي</span>}
            </div>
            <FileUploader target="logo" accept="image/png,image/jpeg,image/webp" label={logoUrl ? "تغيير الشعار" : "رفع شعار"} hint="PNG بخلفية شفافة يفضل · مربع" compact />
            {logoUrl ? (
              <div className="mt-2">
                <QuickAction action={removeLogoAction} label="إزالة الشعار" variant="ghost" />
              </div>
            ) : null}
          </Section>

          <Section title="بوابة الدفع" description="تُضبط من متغيرات البيئة على الخادم — لا تُعرض المفاتيح هنا أبدًا.">
            <div className="mb-3 flex items-center gap-2">
              <CreditCard className="size-5 text-brand-600" aria-hidden />
              <span className="font-bold">MyFatoorah</span>
              <Badge tone={cfg.enabled ? (cfg.environment === "live" ? "success" : "warning") : "neutral"}>{cfg.enabled ? modeLabel : "غير مفعّل"}</Badge>
            </div>
            {!cfg.enabled ? <p className="mb-3 rounded-lg bg-warning-50 p-2 text-xs text-warning">{cfg.reason}</p> : null}
            <ul className="divide-y divide-line">
              <Row label="الوضع (PAYMENTS_MODE)" ok={e.PAYMENTS_MODE !== "disabled"} text={modeLabel} />
              <Row label="مفتاح API" ok={Boolean(e.MYFATOORAH_API_KEY)} text={e.MYFATOORAH_API_KEY ? "مضبوط" : "غير مضبوط"} />
              <Row label="مفتاح توقيع Webhook" ok={Boolean(e.MYFATOORAH_WEBHOOK_SECRET)} text={e.MYFATOORAH_WEBHOOK_SECRET ? "مضبوط" : "غير مضبوط"} />
              {e.PAYMENTS_MODE === "live" ? <Row label="تأكيد الإنتاج" ok={e.MYFATOORAH_LIVE_CONFIRMED} text={e.MYFATOORAH_LIVE_CONFIRMED ? "مؤكد" : "غير مؤكد"} /> : null}
            </ul>
            <div className="mt-4 space-y-2 text-xs">
              <p className="font-semibold text-ink-soft">رابط Webhook (يُضاف في لوحة MyFatoorah — الإصدار V2):</p>
              <code className="block rounded-lg bg-canvas p-2 break-all" dir="ltr">
                {webhookUrl}
              </code>
              <p className="font-semibold text-ink-soft">رابط العودة بعد الدفع:</p>
              <code className="block rounded-lg bg-canvas p-2 break-all" dir="ltr">
                {callbackUrl}
              </code>
            </div>
          </Section>

          <Section title="مزود الفيديو" description="يُضبط من متغيرات البيئة — لا تُعرض المفاتيح هنا.">
            <ul className="divide-y divide-line">
              <Row label="مزود الرفع (VIDEO_PROVIDER)" ok text={e.VIDEO_PROVIDER === "bunny" ? "Bunny Stream" : "تخزين المنصة الخاص"} />
              <Row label="Bunny Stream مضبوط" ok={bunnyConfigured()} text={bunnyConfigured() ? "نعم" : "لا"} />
              <Row label="مفتاح توقيع Webhook" ok={Boolean(e.BUNNY_STREAM_READONLY_API_KEY)} text={e.BUNNY_STREAM_READONLY_API_KEY ? "مضبوط" : "غير مضبوط"} />
              <Row label="نطاق صور المعاينة (CDN)" ok={Boolean(e.BUNNY_STREAM_CDN_HOSTNAME)} text={e.BUNNY_STREAM_CDN_HOSTNAME ? "مضبوط" : "غير مضبوط"} />
            </ul>
            <div className="mt-4 space-y-2 text-xs">
              <p className="font-semibold text-ink-soft">رابط Webhook (يُضاف في إعدادات مكتبة Bunny Stream):</p>
              <code className="block rounded-lg bg-canvas p-2 break-all" dir="ltr">
                {`${e.APP_URL.replace(/\/$/, "")}/api/video/bunny/webhook`}
              </code>
            </div>
          </Section>

          <Section title="التخزين">
            <ul className="divide-y divide-line">
              <Row label="مزود التخزين" ok text={e.STORAGE_DRIVER === "supabase" ? "Supabase Storage" : "تخزين محلي"} />
              <Row label="البريد" ok={e.MAIL_DRIVER === "smtp"} text={e.MAIL_DRIVER === "smtp" ? "SMTP" : "سجل داخلي (تطوير)"} />
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}
