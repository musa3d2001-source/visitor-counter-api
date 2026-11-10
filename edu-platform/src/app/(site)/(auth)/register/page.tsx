import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/site/auth-card";
import { getCurrentUser } from "@/server/auth/session";
import { authPagePerks } from "@/server/platform/site-facts";
import { listGrades } from "@/server/catalog/public-data";
import { safeNextPath } from "@/lib/utils";
import { RegisterForm } from "./register-form";
import { MobilePerks } from "../_components/mobile-perks";

export const metadata: Metadata = { title: "إنشاء حساب", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const perks = await authPagePerks();
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/library");
  if (await getCurrentUser()) redirect(next);
  const grades = await listGrades();
  return (
    <AuthCard perks={perks} title="إنشاء حساب جديد" subtitle="حساب واحد لكل مشترياتك، ويستغرق أقل من دقيقة">
      <RegisterForm next={next} grades={grades.map((g) => ({ id: g.id, name: g.name }))} />
      <MobilePerks perks={perks} />
    </AuthCard>
  );
}
