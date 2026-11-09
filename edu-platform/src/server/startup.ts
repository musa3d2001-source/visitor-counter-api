import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { env } from "./env";

/**
 * فحص الإعدادات عند بدء الخادم. رمي خطأ من register لا يكفي: Next يسجله ويبقى مستمعًا ويرد بخطأ على كل طلب،
 * فيبدو الخادم حيًا. لذلك نخرج صراحة، ولا تحوي الرسالة إلا أسماء المتغيرات.
 *
 * الخروج يخص الخادم وحده: عمال البناء يحملون هذا الملف أيضًا، وفحص البناء في next.config وله رسالته الخاصة.
 * المتغيرات التشغيلية الأحدث (CRON_SECRET و OPS_ALERT_EMAIL) ليست إلزامية هنا عمدًا:
 * غيابها يعني وظيفة مرفوضة وتحذيرًا للمالك في «صحة المنصة»، لا موقعًا متوقفًا.
 */
export function stopIfMisconfigured(): void {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;
  try {
    const e = env();
    // القيمة الافتراضية للتطوير المحلي فقط: على الإنتاج تعني روابط وإيصالات وعودة دفع تذهب إلى localhost
    if (e.NODE_ENV === "production" && !process.env.APP_URL?.trim()) throw new Error("APP_URL مطلوب على الإنتاج");
  } catch (err) {
    console.error(err instanceof Error ? err.message : "إعدادات الخادم غير صحيحة");
    process.exit(1);
  }
}
