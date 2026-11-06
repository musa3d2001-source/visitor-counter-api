import type { Viewport } from "next";
import { Boxes } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { AdminPageHeader, Panel } from "@/components/admin/page-header";
import { SPIKE3D_LAYOUTS } from "@/game/spike3d/layouts3d";
import { runHeadless3 } from "@/game/spike3d/sim3d";
import { loadRapier3Node } from "@/game/spike3d/rapier3d-node";
import type { ServerReplay3 } from "./spike3d-runner";
import { Spike3dClient } from "./spike3d-client";

export const metadata = { title: "تجربة اللعبة ثلاثية الأبعاد" };

/** ملء الشاشة على iPhone: الطبقة تمتد تحت الشق وشريط المنزل، وenv(safe-area-inset-*) يعمل فقط مع cover */
export const viewport: Viewport = { themeColor: "#0a6b66", width: "device-width", initialScale: 1, viewportFit: "cover" };

/**
 * تجربة 3D للمالك فقط (المرحلة 2، قبل كود الإنتاج): تقيس على جهاز المالك أحجام التحميل، وزمن الجاهزية،
 * وسلاسة الرسم بكاميرا خلف المرقاب، وتطابق بصمات كل التصاميم مع إعادة الخادم (الحزمة -compat في Node).
 * لا تكتب شيئًا في قاعدة البيانات.
 */
export default async function GameSpike3dPage() {
  await requireOwnerPage();
  const t0 = performance.now();
  const R = await loadRapier3Node();
  const initMs = performance.now() - t0;
  const server: ServerReplay3 = { node: process.version, initMs: Math.round(initMs), layouts: {} };
  for (const l of SPIKE3D_LAYOUTS) {
    const r = runHeadless3(R, l, () => performance.now());
    server.layouts[l.key] = { hashes: r.hashes, ms: Math.round(r.ms * 10) / 10, steps: r.steps, bodies: r.bodies };
  }
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="تجربة اللعبة ثلاثية الأبعاد"
        description="قياس تقني قبل البناء: الكاميرا خلف المرقاب، والفيزياء الحتمية بحد ١٢٠ جسمًا، والشظايا المرئية. افتحها من جوالك واضغط «ابدأ القياس»، ثم «انسخ النتيجة» وأرسلها. وجرّب الرمي بنفسك لتحكم على الإحساس."
        icon={<Boxes />}
        tone="violet"
      />
      <Panel>
        <Spike3dClient server={server} />
      </Panel>
    </div>
  );
}
