/**
 * أرقام الهواتف الكويتية: 8 أرقام، تبدأ أرقام الجوال بـ 4 أو 5 أو 6 أو 9.
 * تُخزَّن بالصيغة الدولية +965XXXXXXXX
 */
export function normalizeKuwaitPhone(input: string): string | null {
  const digits = input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[\s\-()]/g, "")
    .replace(/^\+?00965|^\+965|^965/, "");
  if (!/^[4569]\d{7}$/.test(digits)) return null;
  return `+965${digits}`;
}

export function displayPhone(stored: string | null | undefined): string {
  if (!stored) return "";
  const local = stored.replace(/^\+965/, "");
  return `${local.slice(0, 4)} ${local.slice(4)}`;
}
