import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/site/auth-card";
import { getCurrentUser } from "@/server/auth/session";
import { listGrades } from "@/server/catalog/queries";
import { safeNextPath } from "@/lib/utils";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "إنشاء حساب", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/library");
  if (await getCurrentUser()) redirect(next);
  const grades = await listGrades();
  return (
    <AuthCard title="إنشاء حساب جديد" subtitle="حساب واحد لكل مذكراتك — يستغرق أقل من دقيقة">
      <RegisterForm next={next} grades={grades.map((g) => ({ id: g.id, name: g.name }))} />
    </AuthCard>
  );
}
