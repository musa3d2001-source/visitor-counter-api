/**
 * [تجربة المرحلة 0 - كود مؤقت] التصاميم الثمانية التمثيلية (مولّدة بـ scripts/game-spike/gen-layouts.mjs)
 * والحلول المرجعية بخطوات المنزلقين والبصمات الذهبية (مولّدة بسكربتات القياس).
 */
import { parseLevel, type Level, type Shot } from "../level-schema";
import t1FirstTower from "./t1-first-tower.json";
import t1GlassWindow from "./t1-glass-window.json";
import t2TeakScaffold from "./t2-teak-scaffold.json";
import t2CloudBounce from "./t2-cloud-bounce.json";
import t3StoneKeep from "./t3-stone-keep.json";
import t3LightboxChain from "./t3-lightbox-chain.json";
import t4DominoRow from "./t4-domino-row.json";
import t4GrandObservatory from "./t4-grand-observatory.json";
import solutionsJson from "./solutions.json";

export const LAYOUTS: Level[] = [t1FirstTower, t1GlassWindow, t2TeakScaffold, t2CloudBounce, t3StoneKeep, t3LightboxChain, t4DominoRow, t4GrandObservatory].map((l) => parseLevel(l));

export interface ReferenceSolution {
  seed: number;
  shots: Shot[];
}

export const SOLUTIONS = solutionsJson as Record<string, ReferenceSolution>;
