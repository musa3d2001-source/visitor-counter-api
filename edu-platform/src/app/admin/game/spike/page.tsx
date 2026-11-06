import { FlaskConical } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { AdminPageHeader, Panel } from "@/components/admin/page-header";
import { SPIKE_LAYOUTS } from "@/game/spike/layouts";
import { runHeadless } from "@/game/spike/sim";
import { loadRapierNode } from "@/game/spike/rapier-node";
import type { ServerReplay } from "./spike-runner";
import { SpikeClient } from "./spike-client";

export const metadata = { title: "تجربة محرك اللعبة" };

/**
 * تجربة المرحلة 0 للمالك فقط (‎/lab‎ يعيد 404 في الإنتاج): تقيس على جهاز المالك أحجام التحميل،
 * وزمن الجاهزية، وfps، وتطابق بصمات كل التصاميم مع إعادة الخادم في Node.
 */
export default async function GameSpikePage() {
  await requireOwnerPage();
  const R = await loadRapierNode();
  const server: ServerReplay = { node: process.version, layouts: {} };
  for (const l of SPIKE_LAYOUTS) {
    const r = runHeadless(R, l, () => performance.now());
    server.layouts[l.key] = { hashes: r.hashes, ms: Math.round(r.ms * 10) / 10, steps: r.steps };
  }
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="تجربة محرك اللعبة"
        description="قياس تقني قبل البناء: حزمتا الفيزياء، وزمن التحميل، وسلاسة الرسم، وتطابق النتائج بين هذا الجهاز والخادم. افتحها من جوالك واضغط «ابدأ القياس»، ثم انسخ النتيجة وأرسلها."
        icon={<FlaskConical />}
        tone="violet"
      />
      <Panel>
        <SpikeClient server={server} />
      </Panel>
    </div>
  );
}
