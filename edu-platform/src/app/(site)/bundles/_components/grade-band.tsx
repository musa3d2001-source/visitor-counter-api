import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GradeArt } from "@/components/art";
import { ar, count, gradeClass, type CountWord } from "@/lib/design";
import { cn } from "@/lib/utils";
import s from "./bundles.module.css";

export const BUNDLE_WORD: CountWord = { one: "باقة", two: "باقتان", plural: "باقات", acc: "باقة", oneSuffix: "واحدة" };

/** شريط رأس الصف: تدرّج الصف، رقمه الكبير في مربع أبيض مائل، رسم الصف، العنوان (h2) وعدد باقاته الحقيقي */
export function GradeBand({ id, level, name, slug, bundles }: { id: string; level: number | null; name: string; slug: string; bundles: number }) {
  return (
    <div className={cn(s.band, gradeClass(level), "on-dark")}>
      {level != null ? (
        <span className={s.art} aria-hidden>
          <GradeArt level={level} />
        </span>
      ) : null}
      {level != null ? (
        <span className={s.numBig} aria-hidden>
          {ar(level)}
        </span>
      ) : null}
      <div className="min-w-0 flex-1 lg:flex-none">
        <h2 id={id} className="scroll-mt-32 font-display text-[clamp(1.6rem,1.2rem+1.4vw,2.3rem)] leading-tight font-black text-white">
          {name}
        </h2>
        <p className="mt-1 font-display font-bold text-white/90">{count(bundles, BUNDLE_WORD)} لهذا الصف</p>
      </div>
      <Link href={`/grades/${slug}`} className="btn btn-3d btn-light btn-md relative shrink-0 lg:mt-auto">
        كل محتوى {name}
        <ArrowLeft aria-hidden />
      </Link>
    </div>
  );
}
