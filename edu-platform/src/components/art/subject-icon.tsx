import {
  Atom,
  Book,
  BookOpen,
  Calculator,
  FlaskConical,
  Globe,
  Globe2,
  Landmark,
  Languages,
  Layers,
  Monitor,
  Moon,
  MoonStar,
  Music,
  Palette,
  type LucideIcon,
} from "lucide-react";

/** أيقونة كل مادة حسب مفتاحها (slug) */
export const SUBJECT_ICONS: Record<string, LucideIcon> = {
  math: Calculator,
  science: FlaskConical,
  english: Languages,
  arabic: BookOpen,
  islamic: MoonStar,
  social: Globe2,
};

/** أيقونات حسب اسم الأيقونة المخزن في قاعدة البيانات (subjects.icon) */
export const ICONS_BY_NAME: Record<string, LucideIcon> = {
  book: Book,
  "book-open": BookOpen,
  languages: Languages,
  calculator: Calculator,
  flask: FlaskConical,
  globe: Globe,
  moon: Moon,
  monitor: Monitor,
  palette: Palette,
  music: Music,
  landmark: Landmark,
  atom: Atom,
};

/**
 * أيقونة المادة: بالمفتاح ‎`slug`‎ (math…) أو باسم الأيقونة ‎`name`‎ (calculator…) — المفتاح أولًا.
 * زخرفية دائمًا (aria-hidden): ضع اسم المادة نصًا بجوارها.
 */
export function SubjectIcon({
  slug,
  name,
  size,
  strokeWidth = 2.2,
  className,
}: {
  slug?: string | null;
  name?: string | null;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Icon = (slug && SUBJECT_ICONS[slug]) || (name && ICONS_BY_NAME[name]) || (slug || name ? Book : Layers);
  const s = size ?? (className ? undefined : 22);
  return <Icon {...(s ? { size: s } : {})} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
