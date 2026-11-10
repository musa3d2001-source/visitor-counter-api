/**
 * الصفحة تصل مبثوثة، فقد يُختار ملف قبل أن يرتبط React بالحقل فلا يصله حدث change.
 * عند الربط نأخذ ما في الحقل ونفرغه: لو أعاد React تشغيل الحدث بعدها وجد الحقل فارغًا، فلا يُرفع الملف مرتين.
 */
export function takePickedFiles(input: { files: ArrayLike<File> | null; value: string } | null): File[] {
  if (!input?.files?.length) return [];
  const picked = Array.from(input.files);
  input.value = "";
  return picked;
}
