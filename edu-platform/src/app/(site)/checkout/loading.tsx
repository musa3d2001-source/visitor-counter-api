import { CommerceSkeleton } from "@/components/site/page-skeletons";

/** هيكل إتمام الشراء: القائمة والملخص. الصفحة قد تنتظر فحص طلب سابق قبل حساب السلة */
export default function Loading() {
  return (
    <CommerceSkeleton rows={2} />
  );
}
