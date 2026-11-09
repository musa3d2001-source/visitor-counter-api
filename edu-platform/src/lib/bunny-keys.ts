/** ما لا يعمل البث والتحقق من Webhook بدونه. ملف بلا اعتماديات لأن next.config يقرؤه وقت البناء */
export const BUNNY_REQUIRED_KEYS = ["BUNNY_STREAM_LIBRARY_ID", "BUNNY_STREAM_API_KEY", "BUNNY_STREAM_TOKEN_KEY", "BUNNY_STREAM_READONLY_API_KEY"] as const;

/** رسالة تسمي المتغيرات الناقصة ولا تذكر قيمة أي متغير، أو null إذا اكتمل الإعداد */
export function bunnyConfigProblem(vars: Record<string, string | undefined>): string | null {
  if (vars.VIDEO_PROVIDER !== "bunny") return null;
  const missing = BUNNY_REQUIRED_KEYS.filter((k) => !vars[k]?.trim());
  return missing.length ? `VIDEO_PROVIDER=bunny يتطلب ضبط: ${missing.join("، ")}` : null;
}
