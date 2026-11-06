import { notFound } from "next/navigation";
import { KuwaitSkyline } from "@/app/(site)/_home/exam-band";
import { Sparkle, Sunrise } from "@/components/art";
import type { MockState } from "../_mock/game-mock";
import { MockClient } from "../_mock/mock-client";
import { DIRECTIONS, type DirKey } from "../_mock/directions";

/**
 * مختبر الاتجاهات الفنية للعبة (المرحلة 0): ‎/lab/game/a|b|c?state=aim|question|result‎
 * للتطوير فقط (‎/lab‎ يعيد 404 في الإنتاج). استيراد الأفق من exam-band هنا مؤقت للمختبر؛
 * نقله إلى src/components/art مخطط في المرحلة 4 حسب الأمر.
 */
export default async function GameLabPage({ params, searchParams }: { params: Promise<{ dir: string }>; searchParams: Promise<{ state?: string }> }) {
  const { dir } = await params;
  const { state } = await searchParams;
  if (!(dir in DIRECTIONS)) notFound();
  const st: MockState = state === "aim" || state === "result" ? state : "question";
  return <MockClient dir={dir as DirKey} state={st} art={{ skyline: <KuwaitSkyline />, sun: <Sunrise />, sparkle: <Sparkle />, sparkleWhite: <Sparkle color="#fff" /> }} />;
}
