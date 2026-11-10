import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { NotFoundView } from "@/components/site/not-found-view";

/** عنوان التبويب والسجل: «الصفحة غير موجودة | منصة فرقد» عبر قالب العنوان في التخطيط الجذري */
export const metadata: Metadata = { title: "الصفحة غير موجودة", robots: { index: false } };

/**
 * notFound() داخل القارئ أو لوحة الإدارة يُعرض داخل تخطيطها (main موجود مسبقًا)، وصفحات الموقع لها (site)/not-found،
 * أما الروابط غير الموجودة إطلاقًا فتُعرض هنا بلا تخطيط. نميّز الحالتين بالمسار (x-pathname من proxy)
 * حتى لا يتكرر الرأس والتذييل ولا يتداخل عنصرا main.
 */
const NESTED = [/^\/(read|preview|watch)\/[^/]+\/?$/, /^\/admin(\/|$)/];

export default async function NotFound() {
  const path = (await headers()).get("x-pathname") ?? "";
  const nested = NESTED.some((r) => r.test(path));
  return (
    <>
      {nested ? null : <SiteHeader />}
      <NotFoundView nested={nested} />
      {nested ? null : <SiteFooter />}
    </>
  );
}
