/**
 * [تجربة المرحلة 0 - كود مؤقت، ليس إنتاجيًا] تجربة تقنية للمالك فقط للعبة «شُهُب فرقد».
 * تقيس الأحجام وfps وإعادة المحاكاة وتقارن حزمتي Rapier، وتطابق بصمات التصاميم بين المتصفح والخادم.
 * محمية بـ requireOwnerPage() (المعلم والطالب يحصلان على 404). تُحذف بعد اعتماد المرحلة 0.
 */
import type { Metadata } from "next";
import { requireOwnerPage } from "@/server/auth/permissions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PageBand } from "../../_components/overview/bands";
import { LAYOUTS, SOLUTIONS } from "./_engine/layouts";
import golden from "./_engine/layouts/golden.json";
import { SpikeClient } from "./spike-client";
import type { LayoutMeta } from "./types";

export const metadata: Metadata = { title: "تجربة تقنية للعبة (مؤقتة)" };

export default async function GameSpikePage() {
  await requireOwnerPage();
  const gold = golden as Record<string, { stateHash: string }>;
  const layouts: LayoutMeta[] = LAYOUTS.map((l) => ({
    key: l.key,
    title: l.title,
    tier: l.tier,
    dynamic: l.bodies.filter((b) => !b.fixed).length + l.lanterns.length,
    shots: SOLUTIONS[l.key]?.shots.length ?? 0,
    par: l.par,
    golden: gold[l.key]?.stateHash ?? "",
  }));
  return (
    <div className="space-y-6">
      <PageBand tone="violet" art="settings">
        <AdminPageHeader
          title="تجربة تقنية للعبة (المرحلة 0)"
          description="صفحة مؤقتة للمالك فقط: تقيس المحرك والعرض وتطابق البصمات بين المتصفح والخادم. ليست جزءًا من اللعبة وتُحذف بعد الاعتماد."
          className="mb-0"
        />
      </PageBand>
      <SpikeClient layouts={layouts} />
    </div>
  );
}
