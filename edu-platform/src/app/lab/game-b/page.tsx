/**
 * مختبر فقط (المرحلة ٠، ليس كود إنتاج): الاتجاه الفني ب «مرصد البلّور» للعبة «شُهُب فرقد».
 * كتاب قصص بلّوري 2.5D: طبقات ساحل مقصوصة، ماء فيروزي زجاجي، خامات بحافة ذهبية مضيئة،
 * تظليل cel حاد، وواجهة لعب حديثة نظيفة. مجلد /lab يعيد 404 في الإنتاج (layout.tsx).
 * الشاشات: ?screen=scene | question | results | map  (و ?state=ask لسؤال قبل الإجابة، و ?quality=low)
 */
import type { Metadata } from "next";
import { KuwaitSkyline } from "@/app/(site)/_home/exam-band";
import { NightSky, Sunrise } from "@/components/art";
import { GameBLab } from "./lab";
import { SCREENS, type Screen } from "./data";
import s from "./game-b.module.css";

export const metadata: Metadata = { title: "مختبر اللعبة: مرصد البلّور" };

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const raw = typeof sp.screen === "string" ? sp.screen : "scene";
  const screen: Screen = SCREENS.some((x) => x.key === raw) ? (raw as Screen) : "scene";
  const state = sp.state === "ask" ? "ask" : "wrong";
  const quality = sp.quality === "low" ? "low" : "high";
  // رسوم السماء تُرسم على الخادم وتُمرَّر جاهزة (أفق الكويت خلفية بعيدة فقط، ليس هدفًا أبدًا).
  // لا تستوردها من lab.tsx (مكوّن عميل): ذلك يكبّر وحدة decor المشتركة في كل صفحات الموقع.
  const skyline = {
    skyline: <KuwaitSkyline className="size-full" />,
    moon: <NightSky className={s.moon} />,
    moonPage: <NightSky className={s.moonPage} />,
    sun: <Sunrise className={s.sun} />,
  };
  return <GameBLab screen={screen} state={state} quality={quality} skyline={skyline} />;
}
