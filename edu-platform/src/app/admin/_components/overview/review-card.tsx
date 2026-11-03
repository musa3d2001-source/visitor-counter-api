import Link from "next/link";
import { BadgeCheck, CalendarClock, Clock, FileText, GraduationCap, Layers, Package, PlayCircle } from "lucide-react";
import { EmptyValue } from "@/components/admin/data-list";
import { ToneIcon } from "@/components/admin/icon-tile";
import { StatusPill } from "@/components/admin/status-badge";
import { STRETCHED_FOCUS, type AdminTone } from "@/components/admin/tones";
import { Button } from "@/components/ui/button";
import { count, W } from "@/lib/design";
import { PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";
import { FILE, Kwd } from "./money";

const TYPE_TONE: Record<ProductType, AdminTone> = {
  video_lesson: "sky",
  unit: "sky",
  video_course: "sky",
  quiz_review: "violet",
  exam_review: "violet",
  final_notes: "coral",
  exam_night: "coral",
  exam_model: "green",
  answer_key: "green",
  review_notes: "coral",
  bundle: "pink",
};

export type ReviewItem = {
  id: string;
  title: string;
  type: ProductType;
  teacher_name: string | null;
  grade_name: string;
  subject_name: string | null;
  proposed_price_fils: number | null;
  lessons: number;
  not_ready: number;
  files: number;
  items: number;
  submitted_at: Date | null;
};

/** بطاقة عنصر في طابور المراجعة: العنوان رابط ممتد (اسم الرابط = عنوان المحتوى فقط) وزر «مراجعة» منفصل */
export function ReviewCard({ item: p }: { item: ReviewItem }) {
  const tone = TYPE_TONE[p.type] ?? "sky";
  const parts = [p.lessons ? count(p.lessons, W.lesson) : null, p.files ? count(p.files, FILE) : null, p.items ? count(p.items, W.item) : null].filter(Boolean) as string[];
  return (
    <li
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-[1.6rem] border-2 border-[#FFE7A8] bg-surface p-4 sm:p-5",
        "shadow-[0_5px_0_#F6DC9A,0_22px_36px_-26px_rgb(201_133_0/0.7)]",
        STRETCHED_FOCUS,
      )}
    >
      <span className="pointer-events-none absolute -end-10 -top-12 size-32 rounded-full bg-[#FFF4D6]" aria-hidden />
      <div className="relative flex items-start gap-3.5">
        <ToneIcon tone={tone} size="md">
          {p.type === "bundle" ? <Package /> : p.lessons ? <PlayCircle /> : <FileText />}
        </ToneIcon>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill tone="review" pulse>
              بانتظار المراجعة
            </StatusPill>
            <span className="chip">{PRODUCT_TYPE_LABELS[p.type]}</span>
          </div>
          <h2 className="mt-2 font-display text-[1.15rem] leading-snug font-black text-ink">
            <Link href={`/admin/products/${p.id}`} className="stretched line-clamp-2 hover:text-brand-700">
              {p.title}
            </Link>
          </h2>
        </div>
      </div>

      <dl className="relative mt-4 mb-4 grid grid-cols-2 gap-2.5 text-[0.85rem]">
        <div className="min-w-0 rounded-2xl bg-[#FFE6F1]/60 px-3 py-2">
          <dt className="flex items-center gap-1 font-display text-[0.75rem] font-bold text-[#A8256F]">
            <GraduationCap className="size-3.5" aria-hidden /> المعلم
          </dt>
          <dd className="line-clamp-2 font-display leading-snug font-extrabold text-ink">{p.teacher_name ?? <EmptyValue label="بدون معلم" />}</dd>
        </div>
        <div className="min-w-0 rounded-2xl bg-[#DEF8EE]/70 px-3 py-2">
          <dt className="flex items-center gap-1 font-display text-[0.75rem] font-bold text-[#0A6F52]">
            <Layers className="size-3.5" aria-hidden /> الصف / المادة
          </dt>
          <dd className="line-clamp-2 font-display leading-snug font-extrabold text-ink">
            {p.grade_name}
            {p.subject_name ? ` · ${p.subject_name}` : ""}
          </dd>
        </div>
        <div className="min-w-0 rounded-2xl bg-[#E6EEFF]/70 px-3 py-2">
          <dt className="font-display text-[0.75rem] font-bold text-[#2B33B5]">المكونات</dt>
          <dd className="font-display font-extrabold text-ink">{parts.length ? parts.join("، ") : <EmptyValue label="لا يوجد" />}</dd>
        </div>
        <div className="min-w-0 rounded-2xl bg-[#FFF4D6] px-3 py-2">
          <dt className="font-display text-[0.75rem] font-bold text-[#8A5A00]">السعر المقترح</dt>
          <dd className="font-display font-black text-ink">{p.proposed_price_fils !== null ? <Kwd fils={p.proposed_price_fils} /> : <EmptyValue label="لم يُحدَّد" />}</dd>
        </div>
      </dl>

      <div className="relative mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-line-strong pt-4">
        <div className="flex flex-wrap items-center gap-2 text-[0.8rem] text-muted">
          {p.submitted_at ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4 text-[#C98500]" aria-hidden />
              أُرسل {formatDateTime(p.submitted_at)}
            </span>
          ) : null}
          {p.not_ready ? (
            <StatusPill tone="warning" icon={<Clock aria-hidden />}>
              {count(p.not_ready, W.lesson)} قيد المعالجة
            </StatusPill>
          ) : null}
        </div>
        <Button asChild size="sm" variant="accent" className="relative z-[2]">
          <Link href={`/admin/products/${p.id}#review-h`}>
            <BadgeCheck aria-hidden /> مراجعة
          </Link>
        </Button>
      </div>
    </li>
  );
}
