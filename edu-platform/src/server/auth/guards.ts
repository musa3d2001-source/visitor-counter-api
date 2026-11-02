import "server-only";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser, type SessionUser } from "./session";

/** يتطلب تسجيل الدخول — وإلا تحويل لصفحة الدخول مع العودة لنفس الصفحة */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const h = await headers();
    const path = nextPath ?? h.get("x-pathname") ?? "/";
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  return user;
}

/** يتطلب صلاحية مدير — الطالب يحصل على 404 (لا نكشف وجود اللوحة) */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (user.role !== "admin") notFound();
  return user;
}

/** لاستخدامها داخل Server Actions: ترمي خطأ بدل التحويل */
export async function assertAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("FORBIDDEN");
  return user;
}

export async function assertUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
