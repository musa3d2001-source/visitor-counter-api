import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowLeft,
  Atom,
  BookOpen,
  Calculator,
  Clock,
  Earth,
  Eye,
  Feather,
  FileText,
  Layers,
  MessagesSquare,
  MoonStar,
  Play,
  PlayCircle,
} from "lucide-react";
import type { ProductCard, TeacherCard } from "@/server/catalog/queries";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { ARABIC_DIGITS, minutes } from "../data";
import { SubjectMotif } from "./art";
import {
  countAr,
  countParts,
  gradeTone,
  initialOf,
  LESSONS,
  PAGES,
  savePercent,
  SUBJECT_TONES,
  toneFor,
  type SubjectKey,
  type Tone,
} from "./tones";
import s from "./v2a.module.css";

export const toneVars = (t: Tone): CSSProperties =>
  ({ "--from": t.from, "--to": t.to, "--solid": t.solid, "--tint": t.tint, "--s-ink": t.ink }) as CSSProperties;

/** صيغ المعدود فقط (الرقم يُعرض منفصلًا فوقه) */
const VIDEO_LESSONS_LABEL = { one: "درس مرئي", two: "درسان مرئيان", few: "دروس مرئية", many: "درسًا مرئيًا", hundred: "درس مرئي" };
const ITEMS_LABEL = { one: "شرح أو مذكرة", two: "شرحان أو مذكرتان", few: "شروحات ومذكرات", many: "شرحًا ومذكرة", hundred: "شرح ومذكرة" };

const SUBJECT_ICONS: Record<SubjectKey, typeof Atom> = {
  math: Calculator,
  science: Atom,
  arabic: Feather,
  english: MessagesSquare,
  islamic: MoonStar,
  social: Earth,
  other: BookOpen,
};

export function SubjectIcon({ k, className }: { k: SubjectKey; className?: string }) {
  const I = SUBJECT_ICONS[k];
  return <I className={className} aria-hidden strokeWidth={2.2} />;
}

export function Price({ fils, compareAt, tone = "light" }: { fils: number; compareAt?: number | null; tone?: "light" | "dark" }) {
  return (
    <span className={s.price} data-tone={tone}>
      <span className={s.priceNow}>
        <bdi className="num">{filsToKwdString(fils)}</bdi>
        <span className={s.cur}>د.ك</span>
      </span>
      {compareAt && compareAt > fils ? (
        <del className={s.priceWas}>
          <span className="sr-only">السعر قبل الخصم </span>
          <bdi className="num">{filsToKwdString(compareAt)}</bdi>
        </del>
      ) : null}
    </span>
  );
}

export function SectionHead({
  eyebrow,
  icon,
  color = "#6C47FF",
  title,
  lead,
  action,
  id,
  dark,
}: {
  eyebrow: string;
  icon: ReactNode;
  color?: string;
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
  id?: string;
  dark?: boolean;
}) {
  return (
    <div className={s.shead} data-dark={dark ? "" : undefined}>
      <div className={s.sheadText}>
        <span className={s.eyebrow} style={{ "--c": color } as CSSProperties}>
          <span className={s.eyebrowIcon}>{icon}</span>
          {eyebrow}
        </span>
        <h2 className={s.h2} id={id}>
          {title}
        </h2>
        {lead ? <p className={s.lead}>{lead}</p> : null}
      </div>
      {action ? <div className={s.sheadAction}>{action}</div> : null}
    </div>
  );
}

/** بطاقة درس مرئي: غلاف بلون المادة وزخرفتها، زر تشغيل للمعاينة، وتفاصيل حقيقية */
export function VideoCard({ p }: { p: ProductCard }) {
  const t = toneFor(p.subjectSlug, p.subjectName);
  const save = savePercent(p.priceFils, p.compareAtPriceFils);
  const dur = minutes(p.totalDurationSeconds);
  const previewHref = p.previewLessonId ? `/watch/${p.id}?lesson=${p.previewLessonId}` : null;
  return (
    <article className={s.vcard} style={toneVars(t)}>
      <div className={s.vcover}>
        <SubjectMotif k={t.key} className={s.vmotif} />
        <div className={s.vtop}>
          <span className={`${s.chipLight} ${s.chipType}`}>{PRODUCT_TYPE_LABELS[p.type]}</span>
          {previewHref ? (
            <span className={s.chipGold}>
              <Eye aria-hidden className={s.ic14} />
              معاينة مجانية
            </span>
          ) : null}
        </div>
        {previewHref ? (
          <Link href={previewHref} className={s.vplay} aria-label={`شاهد المعاينة المجانية: ${p.title}`}>
            <Play aria-hidden className={s.vplayIcon} fill="currentColor" />
          </Link>
        ) : (
          <span className={s.vplay} data-static="" aria-hidden>
            <Play className={s.vplayIcon} fill="currentColor" />
          </span>
        )}
        <div className={s.vbottom}>
          <span className={s.vsubject}>{p.subjectName ?? p.gradeName}</span>
          {p.lessonCount ? (
            <span className={s.chipDark}>
              <PlayCircle aria-hidden className={s.ic14} />
              {countAr(p.lessonCount, LESSONS)}
            </span>
          ) : null}
        </div>
      </div>
      <div className={s.vbody}>
        <p className={s.vmeta}>
          <span className={s.vmetaGrade}>
            <span className={s.vmetaDot} aria-hidden />
            {p.gradeName}
          </span>
          {dur ? (
            <span className={s.vmetaDur}>
              <Clock aria-hidden className={s.ic14} />
              {dur}
            </span>
          ) : null}
        </p>
        <h3 className={s.vtitle}>
          <Link href={`/products/${p.slug}`} className={s.stretch}>
            {p.title}
          </Link>
        </h3>
        {p.teacherName ? (
          <p className={s.vteacher}>
            <span className={s.miniAvatar} aria-hidden>
              {initialOf(p.teacherName)}
            </span>
            {p.teacherName}
          </p>
        ) : null}
        <div className={s.vfoot}>
          <Price fils={p.priceFils} compareAt={p.compareAtPriceFils} />
          {save ? <span className={s.save}>وفّر {ARABIC_DIGITS(save)}٪</span> : null}
        </div>
      </div>
    </article>
  );
}

/** صف مراجعة في قسم «موسم الاختبارات» الداكن */
export function ReviewRow({ p }: { p: ProductCard }) {
  const t = toneFor(p.subjectSlug, p.subjectName);
  const dur = minutes(p.totalDurationSeconds);
  return (
    <li className={s.rrow} style={toneVars(t)}>
      <span className={s.ricon}>
        <SubjectIcon k={t.key} className={s.ic24} />
      </span>
      <div className={s.rtext}>
        <h4 className={s.rtitle}>
          <Link href={`/products/${p.slug}`} className={s.stretch}>
            {p.title}
          </Link>
        </h4>
        <p className={s.rmeta}>
          {p.gradeName}
          {p.teacherName ? ` · ${p.teacherName}` : ""}
        </p>
        <p className={s.rchips}>
          {p.lessonCount ? <span>{countAr(p.lessonCount, LESSONS)}</span> : null}
          {dur ? (
            <span>
              <Clock aria-hidden className={s.ic14} />
              {dur}
            </span>
          ) : null}
          {p.previewLessonId ? <span data-free="">معاينة مجانية</span> : null}
        </p>
      </div>
      <Price fils={p.priceFils} compareAt={p.compareAtPriceFils} tone="dark" />
    </li>
  );
}

/** بطاقة معلم: صورة رمزية متدرجة بلون مادته وحرفه الأول */
export function TeacherTile({ t }: { t: TeacherCard }) {
  const first = t.subjects[0];
  const tone = toneFor(first?.slug, first?.name);
  return (
    <article className={s.tcard} style={toneVars(tone)}>
      <div className={s.tbanner}>
        <SubjectMotif k={tone.key} className={s.tmotif} />
      </div>
      <div className={s.tavatarWrap}>
        <span className={s.tavatar} aria-hidden>
          {initialOf(t.name)}
        </span>
        <span className={s.tbadge} aria-hidden>
          <SubjectIcon k={tone.key} className={s.ic16} />
        </span>
      </div>
      <h3 className={s.tname}>
        <Link href={`/teachers/${t.slug}`} className={s.stretch}>
          {t.name}
        </Link>
      </h3>
      {t.headline ? <p className={s.thead}>{t.headline}</p> : null}
      {t.subjects.length ? (
        <ul className={s.tsubs} aria-label="المواد">
          {t.subjects.slice(0, 3).map((x) => (
            <li key={x.id} style={toneVars(toneFor(x.slug, x.name))}>
              {x.name}
              <span className={s.tsubGrade}>{x.gradeName}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className={s.tstats}>
        <div>
          <dt>{countParts(t.videoCount, VIDEO_LESSONS_LABEL).label}</dt>
          <dd>{countParts(t.videoCount, VIDEO_LESSONS_LABEL).num}</dd>
        </div>
        <div>
          <dt>{countParts(t.productCount, ITEMS_LABEL).label}</dt>
          <dd>{countParts(t.productCount, ITEMS_LABEL).num}</dd>
        </div>
      </dl>
      <span className={s.tcta} aria-hidden>
        صفحة المعلم
        <ArrowLeft className={s.ic16} />
      </span>
    </article>
  );
}

/** بطاقة باقة: أوراق مروحية بألوان المواد، وملصق التوفير الحقيقي */
export function BundleTile({ p, level }: { p: ProductCard; level: number }) {
  const g = gradeTone(level);
  const saveFils = p.compareAtPriceFils && p.compareAtPriceFils > p.priceFils ? p.compareAtPriceFils - p.priceFils : 0;
  const pct = savePercent(p.priceFils, p.compareAtPriceFils);
  const sheets: SubjectKey[] = ["math", "science", "arabic"];
  return (
    <article
      className={s.bcard}
      style={{ "--g-from": g.from, "--g-via": g.via, "--g-to": g.to, "--g-ink": g.ink, "--g-glow": g.glow } as CSSProperties}
    >
      <div className={s.bart}>
        <span className={s.bnum} aria-hidden>
          {ARABIC_DIGITS(level)}
        </span>
        <div className={s.bsheets} aria-hidden>
          {sheets.map((k, i) => (
            <span key={k} className={s.bsheet} data-i={i} style={toneVars(SUBJECT_TONES[k])}>
              <span className={s.bsheetHead}>
                <SubjectIcon k={k} className={s.ic14} />
              </span>
              <i />
              <i />
              <i />
            </span>
          ))}
        </div>
        {saveFils ? (
          <span className={s.sticker}>
            <span className={s.stickerTop}>وفّر</span>
            <span className={s.stickerAmt}>
              <bdi className="num">{filsToKwdString(saveFils)}</bdi>
            </span>
            <span className={s.stickerCur}>د.ك</span>
          </span>
        ) : null}
        {pct ? <span className={`${s.save} ${s.bdiscount}`}>خصم {ARABIC_DIGITS(pct)}٪</span> : null}
      </div>
      <div className={s.bbody}>
        <p className={s.bmeta}>
          <Layers aria-hidden className={s.ic14} />
          باقة كاملة · {p.gradeName}
        </p>
        <h3 className={s.btitle}>
          <Link href={`/products/${p.slug}`} className={s.stretch}>
            {p.title}
          </Link>
        </h3>
        <div className={s.bfoot}>
          <Price fils={p.priceFils} compareAt={p.compareAtPriceFils} />
          <span className={s.barrow} aria-hidden>
            <ArrowLeft className={s.ic18} />
          </span>
        </div>
      </div>
    </article>
  );
}

/** بطاقة مذكرة: ورقة بلون المادة مع عدد الصفحات الحقيقي */
export function NoteTile({ p }: { p: ProductCard }) {
  const t = toneFor(p.subjectSlug, p.subjectName);
  return (
    <article className={s.ncard} style={toneVars(t)}>
      <div className={s.nart} aria-hidden>
        <span className={s.nsheetBack} />
        <span className={s.nsheet}>
          <span className={s.nsheetHead}>
            <SubjectMotif k={t.key} className={s.nmotif} />
            <SubjectIcon k={t.key} className={s.ic18} />
          </span>
          <span className={s.nlines}>
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
        <span className={s.nfile}>
          <FileText className={s.ic14} />
          ملف
        </span>
      </div>
      <div className={s.nbody}>
        <p className={s.nmeta}>{p.gradeName}</p>
        <h3 className={s.ntitle}>
          <Link href={`/products/${p.slug}`} className={s.stretch}>
            {p.title}
          </Link>
        </h3>
        <p className={s.nfacts}>
          {p.pageCount ? <span>{countAr(p.pageCount, PAGES)}</span> : null}
          {p.hasPreview ? (
            <span data-free="">
              <Eye aria-hidden className={s.ic14} />
              معاينة مجانية
            </span>
          ) : null}
        </p>
        <Price fils={p.priceFils} compareAt={p.compareAtPriceFils} />
      </div>
    </article>
  );
}
