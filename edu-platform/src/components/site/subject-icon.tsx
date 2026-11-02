import {
  Atom,
  Book,
  BookOpen,
  Calculator,
  FlaskConical,
  Globe,
  Landmark,
  Languages,
  Monitor,
  Moon,
  Music,
  Palette,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
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

export function SubjectIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Book;
  return <Icon className={className} aria-hidden />;
}
