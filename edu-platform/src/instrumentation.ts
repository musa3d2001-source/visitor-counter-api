/**
 * يعمل مرة واحدة عند بدء الخادم وقبل قبول أي طلب: إعداد ناقص يوقف البدء برسالة تسمي المتغير الناقص،
 * بدل أن يفشل عند أول طالب يضغط تشغيل.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { stopIfMisconfigured } = await import("./server/startup");
  stopIfMisconfigured();
}
