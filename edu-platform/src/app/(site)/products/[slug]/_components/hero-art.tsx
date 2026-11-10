import Image from "next/image";
import Link from "next/link";
import { Play, Sparkles } from "lucide-react";
import type { ProductCard } from "@/server/catalog/queries";
import { BundleStack, Sparkle, SubjectArt, SubjectIcon } from "@/components/art";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { filsToKwdString } from "@/lib/money";
import { ar, count, countParts, gradeTone, savings, shortName, subjectTone, toneClass, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { includesLabel } from "./labels";
import s from "./product.module.css";

type Save = ReturnType<typeof savings>;

/** عملة «وفّر» الذهبية: تظهر فقط عند توفير حقيقي (السعر قبل الخصم أعلى من السعر) */
function SaveCoin({ save, className }: { save: Save; className?: string }) {
  if (!save) return null;
  return (
    <span className={cn(s.coin, className)} aria-hidden>
      <small>وفّر</small>
      <b className="num">{filsToKwdString(save.fils)}</b>
      <small>د.ك</small>
    </span>
  );
}

/**
 * ملصق الفيديو الكبير: بطاقة بيضاء مائلة فيها غلاف بتدرج المادة ورسمها، وزر تشغيل يقود للمعاينة
 * المجانية الحقيقية (أو للمشاهدة إن كان المنتج في المكتبة)، وتحتها المعلم والسعر.
 */
export function VideoPosterArt({
  subjectSlug,
  coverUrl,
  typeLabel,
  teacherName,
  teacherPhotoUrl,
  priceFils,
  compareAtPriceFils,
  play,
  hasPreview,
  lessonsText,
}: {
  lessonsText?: string | null;
  subjectSlug: string | null;
  coverUrl: string | null;
  typeLabel: string;
  teacherName: string | null;
  teacherPhotoUrl: string | null;
  priceFils: number;
  compareAtPriceFils: number | null;
  /** رابط التشغيل الحقيقي (معاينة أو متابعة) مع اسمه ومعرّف الاختبار */
  play: { href: string; label: string; testId: string } | null;
  hasPreview: boolean;
}) {
  const save = savings(priceFils, compareAtPriceFils);
  return (
    <div className={cn(s.stage, s.vstage)}>
      <span className={s.vback} aria-hidden />
      <div className={s.vcard}>
        <div className={cn("poster", s.vposter, toneClass(subjectSlug))}>
          {coverUrl ? (
            <Image src={coverUrl} alt="" fill priority sizes="(max-width: 1024px) 90vw, 480px" className="object-cover" />
          ) : (
            <span className={s.vart}>
              <SubjectArt slug={subjectSlug} />
            </span>
          )}
          <span className="chip chip-glass absolute bottom-3 left-3 z-[3]">{typeLabel}</span>
          {play ? (
            <Link prefetch={false} href={play.href} className={s.vplay} data-testid={play.testId} aria-label={play.label}>
              <span className={cn("play-dot", s.playBig)}>
                <Play className="size-7 translate-x-[-2px] fill-current" aria-hidden />
              </span>
            </Link>
          ) : (
            <span className={s.vplay} aria-hidden>
              <span className={cn("play-dot", s.playBig)}>
                <Play className="size-7 translate-x-[-2px] fill-current" />
              </span>
            </span>
          )}
        </div>
        <div className={s.vfoot} aria-hidden>
          {teacherName ? (
            <>
              <TeacherAvatar name={teacherName} photoUrl={teacherPhotoUrl} size={40} subjectSlug={subjectSlug} decorative />
              <span className="min-w-0 flex-1 truncate font-display text-[0.95rem] font-extrabold">{shortName(teacherName)}</span>
            </>
          ) : (
            <span className="flex-1" />
          )}
          {lessonsText ? <span className={cn("chip shrink-0", toneClass(subjectSlug))}>{lessonsText}</span> : null}
        </div>
      </div>
      {hasPreview ? (
        <span className={cn(s.sticker, "animate-bob top-0 right-0 sm:right-[-0.5rem]")} aria-hidden>
          <span className={s.stickerDot}>
            <Play className="fill-current" />
          </span>
          <span>
            <b>معاينة مجانية</b>
            <small>شاهد قبل الشراء</small>
          </span>
        </span>
      ) : null}
      <SaveCoin save={save} className="top-0 left-0 sm:left-[-0.75rem]" />
      <Sparkle className="absolute bottom-[18%] -right-1 z-[2] size-5" />
    </div>
  );
}

/**
 * غلاف المذكرة: ورقة بيضاء مطوية الزاوية برأس بلون المادة وأوراق خلفها، وشارة عدد الصفحات،
 * وملصق «أول الصفحات مجانًا» فقط إن وُجدت معاينة.
 */
export function NotePaperArt({
  subjectSlug,
  subjectName,
  typeLabel,
  gradeName,
  pages,
  previewPages,
  hasPreview,
  priceFils,
  compareAtPriceFils,
}: {
  subjectSlug: string | null;
  subjectName: string | null;
  typeLabel: string;
  gradeName: string;
  pages: number | null;
  previewPages: number | null;
  hasPreview: boolean;
  priceFils: number;
  compareAtPriceFils: number | null;
}) {
  const save = savings(priceFils, compareAtPriceFils);
  const freeLabel = !previewPages ? "معاينة مجانية" : previewPages === 1 ? "الصفحة الأولى مجانًا" : previewPages === 2 ? "أول صفحتين مجانًا" : `أول ${count(previewPages, W.page)} مجانًا`;
  return (
    <div className={cn(s.stage, s.pstage, toneClass(subjectSlug))} aria-hidden>
      <div className={s.paper}>
        <span className={s.paperBack} />
        <span className={s.paperBack2} />
        <div className={s.sheet}>
          <div className={s.shead}>
            <span className={s.sicon}>
              <SubjectIcon slug={subjectSlug} size={28} />
            </span>
            <div className="min-w-0 max-w-full">
              <span className={s.ssub}>{subjectName ?? typeLabel}</span>
              <span className="mt-1.5 block font-display text-sm font-extrabold text-white/95">{gradeName}</span>
            </div>
          </div>
          <div className={s.slines}>
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <span className={s.fold} />
      </div>
      {pages ? (
        <span className={cn(s.pagesBadge, "bottom-3 left-1 sm:left-3")}>
          {pages > 2 ? (
            <>
              <b>{countParts(pages, W.page).num}</b>
              <small>{countParts(pages, W.page).label}</small>
            </>
          ) : (
            <b className="!text-[1.05rem]">{count(pages, W.page)}</b>
          )}
        </span>
      ) : null}
      {hasPreview ? (
        <span className={cn(s.sticker, "animate-bob top-3 right-0")}>
          <span className={cn(s.stickerDot, "!bg-linear-to-br !from-[#ffd25e] !to-[#eb9b00] !text-[#3d2a00] !shadow-[0_0_0_4px_#fff0c7]")}>
            <Sparkles />
          </span>
          <span>
            <b>{freeLabel}</b>
            <small>تصفّح قبل الشراء</small>
          </span>
        </span>
      ) : null}
      <SaveCoin save={save} className="top-[38%] right-[-0.25rem] !size-[5.25rem] [&_b]:!text-[1.1rem]" />
      <Sparkle className="absolute top-[12%] left-[10%] size-5" color="#fff" />
    </div>
  );
}

/**
 * غلاف الباقة: أوراق مروحية بألوان المواد التي تضمها الباقة فعلًا، رقم الصف الكبير،
 * وملصق «وفّر» الذهبي فقط عند توفير حقيقي، ورموز المواد.
 */
export function BundleFanArt({
  level,
  items,
  priceFils,
  compareAtPriceFils,
}: {
  level: number | null;
  items: ProductCard[];
  priceFils: number;
  compareAtPriceFils: number | null;
}) {
  const save = savings(priceFils, compareAtPriceFils);
  const subjects = [...new Map(items.map((i) => [i.subjectSlug ?? i.subjectName ?? i.id, i])).values()];
  const g = gradeTone(level);
  // ورقة لكل منتج فعلي في الباقة (بلون مادته)، وأوراق بيضاء فارغة لإكمال المروحة دون ادّعاء مواد إضافية
  const sheets = items.slice(0, 5).map((i) => subjectTone(i.subjectSlug).to);
  const colors = items.length ? [...Array(Math.max(0, 3 - sheets.length)).fill("#ffffff"), ...sheets] : ["#ffffff", g.deep, g.to];
  return (
    <div className={cn(s.stage, s.fstage)} aria-hidden>
      {level != null ? <span className={s.fnum}>{ar(level)}</span> : null}
      <span className={s.fglow} />
      <div className={s.fsvg}>
        <BundleStack colors={colors} />
      </div>
      {save ? (
        <span className={cn(s.ribbon, "animate-bob top-[6%] right-[2%]")}>
          وفّر <b className="num">{filsToKwdString(save.fils)}</b> د.ك
        </span>
      ) : null}
      {subjects.length ? (
        <div className="absolute inset-x-0 bottom-0 z-[2] flex flex-wrap items-center justify-center gap-2">
          <span className={s.subjDots}>
            {subjects.slice(0, 6).map((i) => (
              <span key={i.id} className={cn(s.subjDot, toneClass(i.subjectSlug))}>
                <SubjectIcon slug={i.subjectSlug} size={16} strokeWidth={2.4} />
              </span>
            ))}
          </span>
          <span className="chip chip-white">{includesLabel(items.length)}</span>
        </div>
      ) : null}
      <Sparkle className="absolute top-[30%] left-[4%] size-6" />
      <Sparkle className="absolute top-[4%] left-[40%] size-4" color="#fff" />
    </div>
  );
}
