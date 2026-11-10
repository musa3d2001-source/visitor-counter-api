/** بصمة محتوى السلة: يقارن بها المتصفح نسخة صفحة السلة المحفوظة عنده بآخر ما أضافه */
export function cartSignature(ids: readonly string[]): string {
  return [...ids].sort().join(",");
}
