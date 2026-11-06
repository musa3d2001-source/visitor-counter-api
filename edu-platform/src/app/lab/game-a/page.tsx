/**
 * مختبر فقط: الاتجاه الفني أ «فانوس الساحل» للعبة الشهب (المرحلة ٠، ليس كود إنتاج).
 * ليل دافئ بأسلوب toon: سماء كحلية عميقة، بحر فيروزي مضيء، قناديل ذهبية بهالات ناعمة بلا bloom،
 * أشكال ودودة سميكة بحواف واضحة. مجلد /lab يعيد 404 في الإنتاج (layout.tsx).
 * الشاشات: ?screen=scene | question | results | map  (و ?screen=question&state=ask لما قبل الإجابة)
 */
import "@fontsource-variable/cairo";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/500.css";
import "@fontsource/tajawal/700.css";
import "@fontsource/tajawal/800.css";
import type { Metadata } from "next";
import { GameALab } from "./lab";
import { SCREENS, type Screen } from "./data";

export const metadata: Metadata = { title: "مختبر اللعبة: فانوس الساحل" };

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const raw = typeof sp.screen === "string" ? sp.screen : "scene";
  const screen: Screen = SCREENS.some((x) => x.key === raw) ? (raw as Screen) : "scene";
  const state = sp.state === "ask" ? "ask" : "wrong";
  return <GameALab screen={screen} state={state} />;
}
