/**
 * نموذج المرحلة 0: نمط المشهد (ألوان وخامات) بلا أي استيراد لـ three، فيمكن للخادم والمختبر قراءته.
 */
import type { MaterialKey } from "./layouts";

export type SceneStyle = {
  key: string;
  /** ألوان الخامات (hex) */
  mats: Record<MaterialKey, string>;
  projectile: string;
  ground: string;
  groundTop: string;
  sea: string | null;
  outline: { color: string; scale: number } | null;
  toonSteps: number;
  lanternGlow: string;
  hemi: [string, string, number];
  moon: [string, number];
  stars: number;
  /** طبقات parallax داخل WebGL (null = الخلفية في DOM/SVG خلف canvas شفاف) */
  parallax: { color: string; z: number; height: number }[] | null;
  depth: number;
  bevel: boolean;
};

export const SPIKE_STYLE: SceneStyle = {
  key: "spike",
  mats: { frond: "#d9b45a", teak: "#a8673a", stone: "#8fa3ad", glass: "#59d6e8", cloud: "#f3f6ff", lightbox: "#ffd54a", lantern: "#ffb547" },
  projectile: "#ffe9a8",
  ground: "#1d3557",
  groundTop: "#e9c98b",
  sea: "#0d4f63",
  outline: { color: "#0b1530", scale: 1.07 },
  toonSteps: 3,
  lanternGlow: "#ffcf6b",
  hemi: ["#9ad1ff", "#1b2a4a", 1.4],
  moon: ["#fff1cf", 2.2],
  stars: 260,
  parallax: [
    { color: "#16294d", z: -60, height: 9 },
    { color: "#1f3a63", z: -38, height: 6 },
    { color: "#28507a", z: -22, height: 3.5 },
  ],
  depth: 1.1,
  bevel: false,
};

