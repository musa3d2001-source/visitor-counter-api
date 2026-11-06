/**
 * مولّد مستويات MVP-A (GAME_DESIGN.md §2 و§5 و§12): مساعدات بناء صغيرة تُنتج ملفات JSON في src/game/levels/،
 * فالتصاميم قابلة لإعادة الإنتاج ومراجعة الفروق. البنى عامة بخامات خليجية (عريش، مظلّة سوق، هيكل قلافة،
 * برج هواء، فنار، ساحة) بلا قلاع ولا تيجان ولا معالم حقيقية.
 *
 *   npx tsx scripts/game/build-levels.ts            يكتب الملفات
 *   npx tsx scripts/game/build-levels.ts --check    يتحقق أن الملفات مطابقة للمولّد (بلا كتابة)
 *
 * الإحداثيات بالسنتيمتر أعدادًا صحيحة؛ مركز الجسم y = القاع + h/2 (h زوجي دائمًا).
 * par و slots تُضبطان بعد إيجاد الحل المرجعي بـ scripts/game/solve-level.ts (par = طول الحل، +1 للطبقتين 1 و 2).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { levelSchema, type Level, type LevelBody, type LevelLantern } from "../../src/game/core/level-schema";
import type { MaterialKey } from "../../src/game/core/materials";

export const LEVELS_DIR = resolve(__dirname, "../../src/game/levels");

/* ── مساعدات البناء ── */

/** صندوق من قاعه: المركز y = bottom + h/2 (يُرفض الكسر حتى تبقى الإحداثيات صحيحة) */
function box(m: MaterialKey, x: number, bottom: number, z: number, w: number, h: number, d: number): LevelBody {
  const y = bottom + h / 2;
  if (!Number.isInteger(y) || ![x, z, w, h, d].every(Number.isInteger)) throw new Error(`non-integer box ${m} at ${x},${bottom},${z}`);
  return { m, x, y, z, w, h, d };
}

/** القنديل صندوق 50×60×50 من قاعه */
function lantern(x: number, bottom: number, z: number): LevelLantern {
  return { x, y: bottom + 30, z };
}

type Built = { bodies: LevelBody[]; lanterns: LevelLantern[]; top: number };

/** عريش: أربعة أعمدة وسقف؛ span بين مراكز الأعمدة، و over بروز السقف من كل جهة */
function pavilion(o: { post: MaterialKey; roof: MaterialKey; x: number; z: number; bottom?: number; spanX: number; spanZ?: number; h: number; p?: number; rt?: number; over?: number }): Built {
  const bottom = o.bottom ?? 0;
  const p = o.p ?? 24;
  const rt = o.rt ?? 16;
  const over = o.over ?? 20;
  const sx = o.spanX / 2;
  const sz = (o.spanZ ?? o.spanX) / 2;
  const bodies = [
    box(o.post, o.x - sx, bottom, o.z - sz, p, o.h, p),
    box(o.post, o.x + sx, bottom, o.z - sz, p, o.h, p),
    box(o.post, o.x - sx, bottom, o.z + sz, p, o.h, p),
    box(o.post, o.x + sx, bottom, o.z + sz, p, o.h, p),
    box(o.roof, o.x, bottom + o.h, o.z, o.spanX + p + 2 * over, rt, (o.spanZ ?? o.spanX) + p + 2 * over),
  ];
  return { bodies, lanterns: [], top: bottom + o.h + rt };
}

/** إطار بوابي: عمودان وعارضة (للهيكل والمظلّات) */
function portal(o: { post: MaterialKey; beam: MaterialKey; x: number; z: number; bottom?: number; span: number; h: number; p?: number; bh?: number; bd?: number; over?: number }): Built {
  const bottom = o.bottom ?? 0;
  const p = o.p ?? 26;
  const bh = o.bh ?? 20;
  const bd = o.bd ?? 50;
  const over = o.over ?? 20;
  const s = o.span / 2;
  return {
    bodies: [box(o.post, o.x - s, bottom, o.z, p, o.h, p), box(o.post, o.x + s, bottom, o.z, p, o.h, p), box(o.beam, o.x, bottom + o.h, o.z, o.span + p + 2 * over, bh, bd)],
    lanterns: [],
    top: bottom + o.h + bh,
  };
}

/** منصة: عمود ولوح فوقه (قاعدة قنديل) */
function stand(o: { post: MaterialKey; top: MaterialKey; x: number; z: number; bottom?: number; h: number; p?: number; tw?: number; tt?: number }): Built {
  const bottom = o.bottom ?? 0;
  const p = o.p ?? 36;
  const tw = o.tw ?? 70;
  const tt = o.tt ?? 12;
  return { bodies: [box(o.post, o.x, bottom, o.z, p, o.h, p), box(o.top, o.x, bottom + o.h, o.z, tw, tt, tw)], lanterns: [], top: bottom + o.h + tt };
}

/** سور من صفوف وأعمدة كتل متساوية على محور x، بفاصل صغير بين الكتل */
function wall(m: MaterialKey, cx: number, z: number, cols: number, rows: number, w: number, h: number, d: number, gap = 2, bottom = 0): LevelBody[] {
  const out: LevelBody[] = [];
  const pitch = w + gap;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(box(m, cx + (c * 2 - (cols - 1)) * (pitch / 2), bottom + r * h, z, w, h, d));
  return out;
}

/**
 * كوّة مرجانية: جدار أمامي (نحو المرقاب) وجداران جانبيان من الحجر، مفتوحة من الأعلى والخلف، والقنديل داخلها على الأرض.
 * الشهاب لا يكسر الحجر، فتُحرَّر بقوس يسقط فيها أو بدفع الجدار الأمامي؛ والثقيل يكسرها اختصارًا.
 */
function niche(x: number, z: number, h = 90): Built {
  return {
    bodies: [box("stone", x, 0, z + 60, 130, h, 24), box("stone", x - 53, 0, z - 1, 24, h, 94), box("stone", x + 53, 0, z - 1, 24, h, 94)],
    lanterns: [lantern(x, 0, z)],
    top: h,
  };
}

function merge(...parts: Built[]): { bodies: LevelBody[]; lanterns: LevelLantern[] } {
  return { bodies: parts.flatMap((p) => p.bodies), lanterns: parts.flatMap((p) => p.lanterns) };
}

type Def = Omit<Level, "version" | "streakReward"> & { version?: number };

function level(d: Def): Level {
  return levelSchema.parse({ version: d.version ?? 1, streakReward: "heavy", ...d });
}

/* ── التصاميم الثمانية (طبقتان لكل مستوى صعوبة) ── */

/** الطبقة 1: عريش سعف وقنديل فوقه، ومنصة ساج بعيدة عنه بقنديل ثانٍ (رمية لكل قنديل) */
function palmArbour(): Level {
  const a = pavilion({ post: "frond", roof: "frond", x: -140, z: 0, spanX: 150, spanZ: 120, h: 140 });
  const s = stand({ post: "teak", top: "teak", x: 220, z: 120, h: 80 });
  const { bodies } = merge(a, s);
  return level({ key: "palm-arbour", title: "عريش السعف", tier: 1, slots: 4, par: 3, bodies, lanterns: [lantern(-140, a.top, 0), lantern(220, s.top, 120)] });
}

/** الطبقة 1: ثلاث مظلّات سوق متجاورة، قنديل على كل سقف */
function marketCanopy(): Level {
  const xs = [-270, 0, 270];
  const zs = [40, -60, 40];
  const parts = xs.map((x, i) => pavilion({ post: "teak", roof: "frond", x, z: zs[i], spanX: 120, spanZ: 100, h: i === 1 ? 170 : 130, p: 22 }));
  const { bodies } = merge(...parts);
  const lanterns = parts.map((p, i) => lantern(xs[i], p.top, zs[i]));
  return level({ key: "market-canopy", title: "مظلّات السوق", tier: 1, slots: 4, par: 4, bodies, lanterns });
}

/** الطبقة 2: هيكل قلافة (مظلّة بناء السفن): ثلاثة إطارات ساج وألواح سعف، وقناديل فوقها وتحتها، ومنصة جانبية */
function dhowShed(): Level {
  const frames = [150, 0, -150].map((z) => portal({ post: "teak", beam: "teak", x: -60, z, span: 260, h: 190, bd: 40 }));
  const top = frames[0].top;
  const planks = [-160, -60, 40].map((x) => box("frond", x, top, 0, 44, 14, 360));
  const panels = [-1, 1].flatMap((sgn) => [75, -75].map((z) => box("glass", -60 + sgn * 130, 0, z, 12, 110, 120)));
  const keel = [box("teak", -60, 0, 0, 40, 40, 300), box("frond", -60, 40, 0, 30, 30, 200)];
  const side = stand({ post: "teak", top: "frond", x: 300, z: 150, h: 90 });
  const bodies = [...frames.flatMap((f) => f.bodies), ...planks, ...panels, ...keel, ...side.bodies];
  return level({
    key: "dhow-shed",
    title: "هيكل القلافة",
    tier: 2,
    slots: 5,
    par: 4,
    bodies,
    lanterns: [lantern(-60, top + 14, 0), lantern(-130, 0, 100), lantern(10, 0, -100), lantern(300, side.top, 150)],
  });
}

/** الطبقة 2: سور مرجاني منخفض أمام منصّات القناديل؛ الشهاب يعلو فوقه، والثقيل يكسره (اختصار لا شرط) */
function coralWall(): Level {
  const w = wall("stone", 0, 260, 7, 2, 56, 46, 40);
  const left = stand({ post: "teak", top: "frond", x: -170, z: 0, h: 110 });
  const right = stand({ post: "teak", top: "frond", x: 170, z: 0, h: 110 });
  const hut = pavilion({ post: "frond", roof: "glass", x: 0, z: -140, spanX: 110, spanZ: 90, h: 100, p: 22, rt: 12 });
  const bodies = [...w, ...left.bodies, ...right.bodies, ...hut.bodies];
  return level({
    key: "coral-wall",
    title: "سور المرجان",
    tier: 2,
    slots: 5,
    par: 4,
    bodies,
    lanterns: [lantern(-170, left.top, 0), lantern(170, right.top, 0), lantern(0, 0, -140)],
  });
}

/*
 * الطبقتان 3 و 4: مناطق متباعدة في زاوية الاتجاه (≥ 6° بينها من المرقاب) حتى لا تخترق رمية مسطحة منطقتين،
 * وجدران وكوّات مرجانية توقف الاختراق وتطلب قوسًا. صندوق الضوء أبعد من 3.2 م عن قناديل المناطق الأخرى.
 */

/** الطبقة 3: برج هواء (دور أرضي بأعمدة مرجانية ودوران من الساج وزجاج معشّق في الأعلى)، ومنصتان جانبيتان، وكوّة أمامية */
function windTower(): Level {
  const bodies: LevelBody[] = [];
  const lanterns: LevelLantern[] = [];
  const z = -100;
  let y = 0;
  const posts: MaterialKey[] = ["stone", "teak", "teak"];
  for (let f = 0; f < 3; f++) {
    const p = pavilion({ post: posts[f], roof: "teak", x: 0, z, bottom: y, spanX: 150, h: 120, p: f === 0 ? 32 : 26, rt: 14, over: 12 });
    bodies.push(...p.bodies);
    if (f !== 1) lanterns.push(lantern(0, y, z));
    y = p.top;
  }
  bodies.push(box("glass", -75, y - 134, z, 10, 100, 120), box("glass", 75, y - 134, z, 10, 100, 120));
  lanterns.push(lantern(0, y, z));
  for (const sx of [-1, 1]) {
    const s = stand({ post: "teak", top: "frond", x: sx * 320, z: 120, h: 100 });
    bodies.push(...s.bodies, ...wall("frond", sx * 320, 230, 2, 2, 46, 40, 30, 4));
    lanterns.push(lantern(sx * 320, s.top, 120));
  }
  const n = niche(-160, 240);
  bodies.push(...n.bodies);
  lanterns.push(...n.lanterns);
  return level({ key: "wind-tower", title: "برج الهواء", tier: 3, slots: 5, par: 4, bodies, lanterns });
}

/** الطبقة 3: فنار على قاعدة مرجانية وفوقه غرفة زجاج، وكوخا سعف على الجانبين، ومنصة خلفية، وكوّة أمامية */
function harbourLight(): Level {
  const bodies: LevelBody[] = [];
  // القاعدة: 3×3 كتل حجر
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) bodies.push(box("stone", i * 52, 0, k * 52 - 60, 50, 50, 50));
  // الجذع: 2×2 ساج بطبقتين
  for (let r = 0; r < 2; r++) for (const i of [-1, 1]) for (const k of [-1, 1]) bodies.push(box("teak", i * 26, 50 + r * 50, k * 26 - 60, 50, 50, 50));
  // غرفة الضوء: أعمدة زجاج وسقف ساج
  const room = pavilion({ post: "glass", roof: "teak", x: 0, z: -60, bottom: 150, spanX: 80, h: 80, p: 16, rt: 12, over: 10 });
  bodies.push(...room.bodies);
  const huts = [-280, 280].map((x) => pavilion({ post: "frond", roof: "frond", x, z: 60, spanX: 100, spanZ: 90, h: 100, p: 22, rt: 14 }));
  bodies.push(...huts.flatMap((h) => h.bodies));
  const back = stand({ post: "teak", top: "teak", x: 260, z: -280, h: 120 });
  bodies.push(...back.bodies);
  const n = niche(-150, 260);
  bodies.push(...n.bodies);
  return level({
    key: "harbour-light",
    title: "فنار المرسى",
    tier: 3,
    slots: 5,
    par: 5,
    bodies,
    lanterns: [lantern(0, 150, -60), lantern(0, room.top, -60), lantern(-280, huts[0].top, 60), lantern(280, huts[1].top, 60), lantern(260, back.top, -280), ...n.lanterns],
  });
}

/** الطبقة 4: ساحة صناديق الضوء: صندوق ضوء خلف جدار مرجاني بين قنديلين، وعريش وكوّة ومنصتان في اتجاهات متباعدة */
function lightboxCourt(): Level {
  const bodies: LevelBody[] = [];
  const lanterns: LevelLantern[] = [];
  // يسار (−16°): عريش سعف بقنديل فوقه وقنديل تحته
  const left = pavilion({ post: "frond", roof: "frond", x: -340, z: 50, spanX: 110, spanZ: 100, h: 110, p: 22, rt: 14 });
  bodies.push(...left.bodies);
  lanterns.push(lantern(-340, left.top, 50), lantern(-340, 0, 50));
  // يسار الأمام (−7°): كوّة مرجانية
  const n = niche(-135, 150);
  bodies.push(...n.bodies);
  lanterns.push(...n.lanterns);
  // الوسط الخلفي (+2°): صندوق ضوء بين قنديلين على منصتين، وجدار مرجاني أمامه
  bodies.push(box("lightbox", 50, 0, -280, 56, 56, 56));
  const s1 = stand({ post: "teak", top: "frond", x: -70, z: -280, h: 40, p: 40, tw: 60 });
  const s2 = stand({ post: "teak", top: "frond", x: 170, z: -280, h: 40, p: 40, tw: 60 });
  bodies.push(...s1.bodies, ...s2.bodies, ...wall("stone", 50, -190, 5, 2, 56, 50, 30));
  lanterns.push(lantern(-70, s1.top, -280), lantern(170, s2.top, -280));
  // يمين (+9°): منصة ساج
  const right = stand({ post: "teak", top: "frond", x: 180, z: 100, h: 110 });
  bodies.push(...right.bodies);
  lanterns.push(lantern(180, right.top, 100));
  // يمين بعيد (+16°): قنديل خلف كتلتي حجر
  bodies.push(...wall("stone", 390, 0, 2, 1, 56, 70, 40));
  lanterns.push(lantern(390, 0, -100));
  return level({ key: "lightbox-court", title: "ساحة صناديق الضوء", tier: 4, slots: 6, par: 5, bodies, lanterns });
}

/** الطبقة 4: مرفأ الفجر: هيكل قلافة وبرج هواء ورصيف مرجاني وكوّة وعمود مرجاني، في ست مناطق متباعدة وثمانية قناديل */
function dawnHarbour(): Level {
  const bodies: LevelBody[] = [];
  const lanterns: LevelLantern[] = [];
  // A (−16°): هيكل قلافة بقنديل فوقه وقنديل تحته
  const frames = [140, -20].map((z) => portal({ post: "teak", beam: "teak", x: -330, z, span: 160, h: 150, bd: 40 }));
  for (const f of frames) bodies.push(...f.bodies);
  bodies.push(box("frond", -366, frames[0].top, 60, 44, 14, 240), box("frond", -294, frames[0].top, 60, 44, 14, 240));
  bodies.push(box("glass", -410, 0, 60, 12, 90, 110), box("glass", -250, 0, 60, 12, 90, 110));
  lanterns.push(lantern(-330, frames[0].top + 14, 60), lantern(-330, 0, 60));
  // B (−8°): منصة سعف خلف كتلة مرجانية ضيقة
  const st = stand({ post: "frond", top: "frond", x: -135, z: 300, h: 70 });
  bodies.push(...st.bodies, ...wall("stone", -135, 370, 1, 2, 60, 50, 30));
  lanterns.push(lantern(-135, st.top, 300));
  // C (0°): برج هواء من دورين في الخلف
  let y = 0;
  for (let f = 0; f < 2; f++) {
    const p = pavilion({ post: "teak", roof: "teak", x: 0, z: -300, bottom: y, spanX: 120, h: 120, p: 24, rt: 14, over: 12 });
    bodies.push(...p.bodies);
    if (f === 1) lanterns.push(lantern(0, y, -300));
    y = p.top;
  }
  bodies.push(box("glass", -60, y - 134, -300, 10, 100, 100), box("glass", 60, y - 134, -300, 10, 100, 100));
  lanterns.push(lantern(0, y, -300));
  // D (+7°): كوّة مرجانية
  const n = niche(150, 50);
  bodies.push(...n.bodies);
  lanterns.push(...n.lanterns);
  // E (+15°): رصيف مرجاني وعليه كوخ سعف
  for (const i of [-1, 0, 1]) for (const k of [0, 1]) bodies.push(box("stone", 310 + i * 58, 0, 129 - k * 58, 56, 40, 56));
  const hut = pavilion({ post: "frond", roof: "glass", x: 310, z: 100, bottom: 40, spanX: 120, spanZ: 50, h: 90, p: 20, rt: 12, over: 10 });
  bodies.push(...hut.bodies);
  lanterns.push(lantern(310, hut.top, 100));
  // F (+9.5°، خلف الكوّة D): عمود من ثلاث كتل مرجانية وقنديل فوقه، فالرمية المسطحة تصطدم بالكوّة أولًا
  for (let r = 0; r < 3; r++) bodies.push(box("stone", 280, r * 50, -420, 50, 50, 50));
  lanterns.push(lantern(280, 150, -420));
  return level({ key: "dawn-harbour", title: "مرفأ الفجر", tier: 4, slots: 6, par: 5, bodies, lanterns });
}

export function buildLevels(): Level[] {
  return [palmArbour(), marketCanopy(), dhowShed(), coralWall(), windTower(), harbourLight(), lightboxCourt(), dawnHarbour()];
}

/** كائن مسطح في سطر واحد بنمط prettier ({ "k": v }) */
function inline(o: object): string {
  return `{ ${Object.entries(o)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(", ")} }`;
}

/** JSON ثابت الترتيب بنمط prettier: الحقول العليا سطرًا لكل منها، وكل جسم في سطر */
export function serializeLevel(l: Level): string {
  const head = { key: l.key, title: l.title, version: l.version, tier: l.tier, slots: l.slots, par: l.par, streakReward: l.streakReward };
  const lines = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  const arr = (name: string, items: object[], last: boolean) => `  ${JSON.stringify(name)}: [\n${items.map((b) => `    ${inline(b)}`).join(",\n")}\n  ]${last ? "" : ","}`;
  return `{\n${lines.join("\n")}\n${arr("bodies", l.bodies, false)}\n${arr("lanterns", l.lanterns, true)}\n}\n`;
}

function main() {
  const check = process.argv.includes("--check");
  mkdirSync(LEVELS_DIR, { recursive: true });
  let stale = 0;
  for (const l of buildLevels()) {
    const file = resolve(LEVELS_DIR, `${l.key}.json`);
    const text = serializeLevel(l);
    if (check) {
      const same = existsSync(file) && readFileSync(file, "utf8") === text;
      if (!same) stale++;
      console.log(`${same ? "ok   " : "STALE"} ${l.key}`);
    } else {
      writeFileSync(file, text);
      console.log(`wrote ${l.key}.json  tier ${l.tier}  bodies ${l.bodies.length}  lanterns ${l.lanterns.length}`);
    }
  }
  if (stale) process.exit(1);
}

if (process.argv[1] && /build-levels\.ts$/.test(process.argv[1])) main();
