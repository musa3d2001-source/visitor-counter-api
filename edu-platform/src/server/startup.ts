import { env } from "./env";

/**
 * فحص الإعدادات عند بدء الخادم. رمي خطأ من register لا يكفي: Next يسجله ويبقى مستمعًا ويرد بخطأ على كل طلب،
 * فيبدو الخادم حيًا. لذلك نخرج صراحة، ولا تحوي الرسالة إلا أسماء المتغيرات.
 */
export function stopIfMisconfigured(): void {
  try {
    env();
  } catch (err) {
    console.error(err instanceof Error ? err.message : "إعدادات الخادم غير صحيحة");
    process.exit(1);
  }
}
