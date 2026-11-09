import type { Instrumentation } from "next";

/**
 * يعمل مرة واحدة عند بدء الخادم وقبل قبول أي طلب: إعداد ناقص يوقف البدء برسالة تسمي المتغير الناقص،
 * بدل أن يفشل عند أول طالب يضغط تشغيل.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { stopIfMisconfigured } = await import("./server/startup");
  stopIfMisconfigured();
}

/** كل خطأ لم يعالجه الكود: يصل إلى سجل المالك. الرابط والترويسات لا تُمرر عمدًا، لأن الرابط قد يحمل رمزًا والترويسات تحمل الجلسة */
export const onRequestError: Instrumentation.onRequestError = async (err, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportRequestError } = await import("./server/platform/report-error");
  await reportRequestError(err, context);
};
