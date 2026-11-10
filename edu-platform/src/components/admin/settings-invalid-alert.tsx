import { Alert } from "@/components/ui/alert";

/**
 * تنبيه المالك في صفحة الإعدادات: حقول محفوظة لم تعد مقبولة فعادت إلى قيمتها الافتراضية وحدها.
 * labels: أسماء الحقول كما تظهر في النموذج.
 */
export function SettingsInvalidAlert({ labels }: { labels: string[] }) {
  if (!labels.length) return null;
  return (
    <Alert tone="warning" title="بعض الإعدادات المحفوظة لم تُقبل" data-testid="settings-invalid">
      <p>{`القيمة المحفوظة في ${labels.map((l) => `«${l}»`).join("، ")} لم تعد مقبولة، فيعرض الموقع القيمة الافتراضية مكانها. باقي الإعدادات تعمل كما حفظتها.`}</p>
      <p>راجع هذه الحقول في النموذج أدناه ثم احفظ.</p>
    </Alert>
  );
}
