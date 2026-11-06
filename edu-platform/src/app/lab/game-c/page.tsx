/**
 * مختبر فقط (المرحلة ٠، ليس كود إنتاج): الاتجاه الفني ج «سماء الشروق» للعبة «شُهُب فرقد».
 * احتفال بالتقدّم: السماء هي شريط التقدّم، تنتقل من ليل كحلي إلى شروق ذهبي فوق أفق الكويت
 * كلما صعد قنديل محرَّر نجمةً في الكوكبة. ألوان toon مشبعة وجريئة. مجلد /lab يعيد 404 في الإنتاج.
 * الشاشات: ?screen=scene | question | results | map
 * ومعه: ?state=ask (السؤال قبل الإجابة)، ?freed=0..3 (رحلة السماء)، ?quality=low
 */
import type { Metadata } from "next";
import { KuwaitSkyline } from "@/app/(site)/_home/exam-band";
import { GameCLab } from "./lab";
import { SCREENS, type Screen } from "./data";

export const metadata: Metadata = { title: "مختبر اللعبة: سماء الشروق" };

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const raw = typeof sp.screen === "string" ? sp.screen : "scene";
  const screen: Screen = SCREENS.some((x) => x.key === raw) ? (raw as Screen) : "scene";
  const state = sp.state === "ask" ? "ask" : "wrong";
  const quality = sp.quality === "low" ? "low" : "high";
  const f = Number(typeof sp.freed === "string" ? sp.freed : "1");
  const freed = Number.isInteger(f) && f >= 0 && f <= 3 ? f : 1;
  // أفق الكويت يُرسم على الخادم ويُمرَّر جاهزًا (خلفية بعيدة فقط، ليس هدفًا أبدًا)
  return <GameCLab screen={screen} state={state} freed={freed} quality={quality} skyline={<KuwaitSkyline className="size-full" />} />;
}
