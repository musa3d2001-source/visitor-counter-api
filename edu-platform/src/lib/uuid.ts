/**
 * شكل UUID الكامل (8-4-4-4-12). الفحص الأضعف مثل /^[0-9a-f-]{36}$/ يقبل ٣٦ شرطة،
 * فيصل الطلب إلى Postgres ويرميه خطأ 22P02 بدل 404 هادئ، وأي زائر يكرره بلا تسجيل دخول.
 * كل معرّف من رابط أو نموذج يمر من هنا قبل أن يصل إلى قاعدة البيانات.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string | null | undefined): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
