/**
 * أقسام لوحة الإدارة الخاصة بالمالك. التخطيط (app/admin/layout.tsx) يرفض المعلم فيها مبكرًا قبل بث الصفحة لتعود 404 صحيحة،
 * وكل صفحة فيها تستدعي requireOwnerPage() بنفسها أيضًا. tests/unit/admin-owner-pages.test.ts يتأكد من الأمرين معًا:
 * لا صفحة مالك خارج هذه القائمة، ولا صفحة داخلها بلا requireOwnerPage.
 */
export const OWNER_ONLY_PREFIXES = [
  "/admin/teachers",
  "/admin/review",
  "/admin/catalog",
  "/admin/bundles",
  "/admin/orders",
  "/admin/students",
  "/admin/coupons",
  "/admin/reports",
  "/admin/settings",
  "/admin/mail",
  "/admin/security",
  "/admin/ops",
  "/admin/launch",
  "/admin/content-health",
] as const;

/** مطابقة على حدود المقطع: /admin/orders و/admin/orders/x نعم، /admin/ordersx لا */
export function isOwnerOnlyPath(path: string): boolean {
  return OWNER_ONLY_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
