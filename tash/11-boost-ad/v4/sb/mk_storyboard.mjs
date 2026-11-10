// Storyboard round 3: the 16 key frames of STORYBOARD.md section 1 on the seven fitted stills,
// plus the option frames (opener, burger, B-20 pool), the TikTok checks and the 4:5 layouts.
// usage: node mk_storyboard.mjs <out dir>   -> key.frames.json, options.frames.json, tiktok.frames.json, r45.frames.json
// Everything here is layout only (0 credits). Numbers come from BUILD-SPEC.md sections 5, 7 and 11.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2]; if (!out) throw new Error('usage: node mk_storyboard.mjs <out dir>');
mkdirSync(out, { recursive: true });

const TANG = '#FF7A1A', PINK = '#FF4F9A', AZURE = '#1EA7FF', GREY = '#DCDCD0', CLEAR = 'rgba(0,0,0,0)', SHEET_BG = '#141412';
const S = k => `/_stills/${k}_fit.png`;
const SLOT = [715, 352], DOT_Y = 342, DOT_X = [623, 715, 807];
const tc = f => `f${f} · ${(f / 30).toFixed(2)}s`;

// ---- W «مشروعك» (dotless body; the three dots are separate discs) ----
const word = (o = {}, dy = 0) => ({ t: 'word', key: 'mashrou3ak', size: 172, slot: [SLOT[0], SLOT[1] + dy], fill: 'paper', stroke: 'ink', lw: 16, shadow: { dx: 8, dy: 8, color: 'ink' }, dots: false, ...o });
const wordInk = (o = {}, dy = 0) => word({ fill: 'ink', stroke: 'paper', lw: 12, shadow: null, ...o }, dy);       // on Lime / Paper / flat colour
const wordHollow = (o = {}) => word({ fill: CLEAR, stroke: 'ink', lw: 8, shadow: null, ...o });                    // dead state «مسروعك»

// ---- the dot row: three discs, typing offsets per dot (left to right) ----
const dots = (offs = [0, -10, -22], dy = 0) => DOT_X.flatMap((x, j) => { const y = DOT_Y + dy + offs[j]; return [
  { t: 'dot', x: x + 6, y: y + 6, r: 44, fill: 'ink' }, { t: 'dot', x, y, r: 40, fill: 'lime', ring: { color: 'ink', lw: 8 } }]; });
const dotsInk = (offs = [0, -10, -22]) => DOT_X.map((x, j) => ({ t: 'dot', x, y: DOT_Y + offs[j], r: 40, fill: 'ink', ring: { color: 'paper', lw: 8 } }));
const dashed = xs => xs.map(x => ({ t: 'dot', x, y: DOT_Y, r: 40, fill: null, ring: { color: 'ink', lw: 5, dash: [8, 7] } }));

// ---- tag slot T ----
const tag = (s, size = 200, y = 757) => ({ t: 'text', s, size, x: 540, y, w: 800, fill: 'lime', stroke: 'ink', lw: 20, shadow: { dx: 10, dy: 10, color: 'ink' }, rot: -4 });
const tagInk = (s, size = 200, y = 757) => ({ t: 'text', s, size, x: 540, y, w: 800, fill: 'ink', shadow: { dx: 10, dy: 10, color: 'paper' }, rot: -4 });
const line = (s, size, y, o = {}) => ({ t: 'text', s, size, x: 540, y, w: 800, fill: 'ink', ...o });
const handle = (s, y) => ({ t: 'text', s, size: 60, x: 540, y, w: 600, font: '"JetBrains Mono"', dir: 'ltr', fill: 'ink' });

// ---- pictures ----
const still = (k, o = {}) => ({ t: 'still', src: S(k), ...o });
const punch = (k, scale) => still(k, { scale, cx: 0.5, cy: 900 / 1920 });                                           // punch-in about (540,900)
const LENS = { x: 540, y: 1270, r: 340 };
const lens = (k, L = LENS, dy = 0) => [still(k, { clip: { type: 'circle', ...L }, dy }), { t: 'dot', x: L.x, y: L.y, r: L.r - 6, fill: null, ring: { color: 'ink', lw: 12 } }];
// porthole: source point (sx, sy) of the still lands on the circle centre, picture drawn at `scale`
const port = (k, x, y, r, scale, sx, sy, ring = 12) => [still(k, { clip: { type: 'circle', x, y, r }, scale, cx: sx / 1080, cy: sy / 1920, ax: x, ay: y }),
  { t: 'dot', x, y, r: r - ring / 2, fill: null, ring: { color: 'ink', lw: ring } }];

// ---- TASH wordmark M: box top-left (x0, y0), width w ----
const mark = (x0, y0, w, o = {}) => { const s = w / 2579; return { t: 'mark', x: x0 + 1080 * s, y: y0 + 437 * s, scale: s, fill: 'ink', dotFill: 'ink', ...o }; };

// ---- seeded helpers (deterministic) ----
const lcg = seed => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };

// 27 dots at f350 = W's three + 24 loose ones in 8 typing triplets (3 -> 9 -> 27 -> 81)
const talkDots = () => { const P = [[250, 1110], [700, 1150], [360, 1310], [770, 1350], [240, 1510], [660, 1550], [380, 1720], [780, 1760]];
  const offs = [[0, -12, -24], [-24, -12, 0], [-10, -24, -4], [-20, 0, -12]];
  return P.flatMap(([cx, cy], i) => [-1, 0, 1].flatMap((n, j) => { const x = cx + n * 118, y = cy + offs[i % 4][j]; return [
    { t: 'dot', x: x + 6, y: y + 6, r: 59, fill: 'ink' }, { t: 'dot', x, y, r: 55, fill: 'lime', ring: { color: 'ink', lw: 8 } }]; })); };

// 81 burst dots at f392 = 27 triplets in the world colours (none Lime, no rectangles), flying out from the wordmark:
// each triplet lies along its own ray from the centre of M and grows a little toward the lens. Clear of the M box and of the TikTok rail.
const burst = () => { const rnd = lcg(20261110), cols = [TANG, PINK, AZURE, 'paper', 'ink'], placed = [], layers = [];
  const C = { x: 540, y: 538 }, box = { x0: 120 - 30, y0: 300 - 30, x1: 960 + 30, y1: 776 + 30 };
  const hitsBox = (x, y, r) => x + r > box.x0 && x - r < box.x1 && y + r > box.y0 && y - r < box.y1;
  const hitsRail = (x, y, r) => x + r > 960 && y + r > 1100 && y - r < 1750;
  let n = 0, guard = 0;
  while (n < 27 && guard++ < 40000) {
    const ang = rnd() * Math.PI * 2, d0 = 330 + rnd() * 1050, far = Math.min(1, (d0 - 330) / 1050), R = 22 + far * 30 + rnd() * 8;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    let d = d0; const pts = [0.78, 0.89, 1].map(k => { const r = R * k, p = { x: C.x + ux * d, y: C.y + uy * d, r }; d += r * 2.42; return p; });
    if (pts.some(p => hitsBox(p.x, p.y, p.r) || hitsRail(p.x, p.y, p.r) || p.x < -p.r * 0.5 || p.x > 1080 + p.r * 0.5 || p.y < 30 || p.y > 1905)) continue;
    if (pts.some(p => placed.some(q => Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r + 22))) continue;
    placed.push(...pts); const c = cols[n % cols.length]; pts.forEach(p => layers.push({ t: 'dot', x: +p.x.toFixed(1), y: +p.y.toFixed(1), r: +p.r.toFixed(1), fill: c })); n++;
  }
  if (n < 27) throw new Error('burst: placed only ' + n + ' triplets'); return layers; };

// ================= the 16 key frames (A-20, Instagram layout) =================
const easeIn = t => t * t;   // BUILD-SPEC names easeIn without defining it: quadratic is used here
const drop = f0 => Math.round(1920 * easeIn((36 - f0) / 9));
const D1 = drop(32), D2 = drop(34);   // right third and middle third at f36 (left third starts on f36)
const col3 = (x, w) => ({ x, y: 0, w, h: 1920 });

const key = [
  { id: '01_f000', tc: tc(0), note: 'أول فريم: «مشروعك» ونقاطه الثلاث تكتب، والثلج طايح على الكوب. ولا شي ثاني.',
    layers: [still('s1'), word(), ...dots()] },
  { id: '02_f010', tc: tc(10), note: 'صورة الغلاف: تطلع «حلو…» والقهوة تطش من الكوب (الطشّة تبيّن بالفيديو، مو بالصورة).',
    layers: [still('s1'), tag('حلو…'), word(), ...dots([-12, -22, -6])] },
  { id: '03_f020', tc: tc(20), note: 'زووم قوي على الكوب مع الضربة، والكلمة ثابتة بمكانها.',
    layers: [punch('s1', 1.25), tag('حلو…'), word(), ...dots([-22, -8, 0])] },
  { id: '04_f036', tc: tc(36), note: 'قطع على الكنافة. النقاط تطيح وحدة وحدة، وكل نقطة تسحب ثلث الصورة وياها والكلمة تفضى.',
    layers: [{ t: 'fill', color: GREY },
      still('s5', { clip: col3(720, 360), dy: D1 }), still('s5', { clip: col3(360, 360), dy: D2 }), still('s5', { clip: col3(0, 360) }),
      tag('حلو…', 200, 757 + D2),
      wordHollow({ clip: col3(360, 720) }), word({ clip: col3(0, 360) }),
      ...dashed([715, 807]),
      { t: 'dot', x: 623 + 6, y: DOT_Y + 6, r: 44, fill: 'ink' }, { t: 'dot', x: 623, y: DOT_Y, r: 40, fill: 'lime', ring: { color: 'ink', lw: 8 } },
      { t: 'dot', x: 715 + 8, y: DOT_Y + D2 + 8, r: 64, fill: 'ink' }, { t: 'dot', x: 715, y: DOT_Y + D2, r: 60, fill: 'lime', ring: { color: 'ink', lw: 8 } },
      { t: 'dot', x: 807 + 10, y: DOT_Y + D1 + 10, r: 84, fill: 'ink' }, { t: 'dot', x: 807, y: DOT_Y + D1, r: 80, fill: 'lime', ring: { color: 'ink', lw: 8 } }] },
  { id: '05_f060', tc: tc(60), note: 'بدون النقاط صارت «مسروعك»: الصورة طفت والنقاط طايحة رمادية. اللحظة الهادية الوحيدة بالإعلان.',
    layers: [{ t: 'fill', color: GREY }, wordHollow(), ...dashed(DOT_X),
      ...DOT_X.map((x, j) => ({ t: 'dot', x, y: DOT_Y + [4, 0, -4][j], r: 12, fill: 'smoke' })),
      line('محد يسولف؟', 126, 740),
      ...[420, 540, 660].map(x => ({ t: 'dot', x, y: 1560, r: 50, fill: 'smoke', ring: { color: 'ink', lw: 8 } }))] },
  { id: '06_f084', tc: tc(84), note: 'النقاط ترجع على الشين، ومن كل نقطة تنفتح دائرة ترجّع اللون والقهوة للصورة.',
    layers: [{ t: 'fill', color: GREY }, still('s1', { clip: { type: 'circle', x: 807, y: DOT_Y, r: 1560 } }),
      { t: 'dot', x: 807, y: DOT_Y, r: 1555, fill: null, ring: { color: 'lime', lw: 10 } }, { t: 'dot', x: 807, y: DOT_Y, r: 1563, fill: null, ring: { color: 'ink', lw: 6 } },
      { t: 'dot', x: 715, y: DOT_Y, r: 775, fill: null, ring: { color: 'lime', lw: 10 } }, { t: 'dot', x: 715, y: DOT_Y, r: 783, fill: null, ring: { color: 'ink', lw: 6 } },
      word(), ...dots([0, 0, 0]), line('محد يسولف؟', 126, 740)] },
  { id: '07_f100', tc: tc(100), note: 'الضربة الأولى: «طشّ!» بالصوت والشعار على لايم، وتحته العرض: خلّ إعلانك علينا.',
    layers: [{ t: 'fill', color: 'lime' }, mark(320, 290, 440), line('خلّ إعلانك', 120, 720), line('علينا', 150, 960)] },
  { id: '08_f125', tc: tc(125), note: 'ثلاث نقاط تطيح من الشعار وتنفتح شبابيك: برجر، قهوة، عطر. الشعار يبقى بنقاطه.',
    layers: [{ t: 'fill', color: 'lime' }, mark(320, 290, 440), line('خلّ إعلانك', 120, 720), line('علينا', 150, 960),
      ...port('s3', 270, 1125, 110, 0.31, 540, 1275), ...port('s1', 540, 1125, 110, 0.31, 540, 1250), ...port('s2', 810, 1125, 110, 0.31, 532, 1250)] },
  { id: '09_f140', tc: tc(140), note: 'المشروع الأول: «قهوة؟». الصورة كاملة والقهوة تطش.',
    layers: [still('s1'), tag('قهوة؟'), word(), ...dots([-6, -22, -12])] },
  { id: '10_f155', tc: tc(155), note: 'نفس القهوة داخل نقطة كبيرة على لايم، والكلمة تقلب أسود. كل نص ثانية قطعة.',
    layers: [{ t: 'fill', color: 'lime' }, ...lens('s1'), tagInk('قهوة؟'), wordInk(), ...dotsInk([-22, -10, 0])] },
  { id: '11_f170', tc: tc(170), note: 'المشروع الثاني: «عطر؟». دخّان العود يطلع من المبخرة.',
    layers: [still('s2'), tag('عطر؟'), word(), ...dots([0, -12, -22])] },
  { id: '12_f225', tc: tc(225), note: 'المشروع الثالث: «برجر؟». الخبزة تطيح على البرجر مع الضربة وزووم على اللقطة.',
    layers: [punch('s3', 1.2), tag('برجر؟'), word(), ...dots([-14, -22, -4])] },
  { id: '13_f275', tc: tc(275), note: 'المشروع الرابع: «حلويات؟». صينية الكنافة دائرة داخل النقطة.',
    layers: [{ t: 'fill', color: 'lime' }, ...lens('s5'), tagInk('حلويات؟', 180), wordInk(), ...dotsInk([0, -14, -22])] },
  { id: '14_f350', tc: tc(350), note: 'الناس تسأل: «شنو حسابهم؟!» والنقاط تتكاثر مع كل ضربة: ٣ ثم ٩ ثم ٢٧ ثم ٨١.',
    layers: [{ t: 'fill', color: PINK }, wordInk(), ...dots([-8, -22, 0]),
      line('شنو', 170, 730, { stroke: 'paper', lw: 12 }), line('حسابهم؟!', 98, 950, { stroke: 'paper', lw: 12 }), ...talkDots()] },
  { id: '15_f392', tc: tc(392), note: 'الضربة الكبيرة: النقاط تنفجر بألوان المشاريع، وشعار طشّ يملى الشاشة ونقاطه شبابيك.',
    layers: [{ t: 'fill', color: 'lime' }, ...burst(), mark(120, 300, 840, { dots: false }),
      ...port('s1', 120 + 1080 * 840 / 2579 + 212 * 840 / 2579, 300 + 437 * 840 / 2579, 29.3, 0.115, 540, 1290, 5),
      ...port('s2', 120 + 1080 * 840 / 2579, 300 + 437 * 840 / 2579, 29.3, 0.115, 500, 1300, 5),
      ...port('s3', 120 + 1080 * 840 / 2579 - 212 * 840 / 2579, 300 + 437 * 840 / 2579, 29.3, 0.115, 540, 1290, 5)] },
  { id: '16_f470', tc: tc(470), note: 'الختام ٤ ثواني: اطلب إعلانك بالخاص + الحساب. والصورة تحت تتبدل: عطر، برجر، كنافة، قهوة.',
    layers: [still('s2', { clip: { x: 0, y: 1130, w: 1080, h: 790 }, dy: 230 }),
      { t: 'rect', x: 0, y: 0, w: 1080, h: 1130, fill: 'lime' }, { t: 'rect', x: 0, y: 1120, w: 1080, h: 10, fill: 'ink' },
      line('اطلب إعلانك', 120, 440), line('بالخاص', 160, 660, { shadow: { dx: 8, dy: 8, color: 'paper' } }), handle('@tash.creative.kw', 800),
      ...[448, 540, 632].map((x, j) => ({ t: 'dot', x, y: 965 + [0, -8, -16][j], r: 32, fill: 'ink', ring: { color: 'paper', lw: 6 } }))] },
];

// ================= options: the picks the owner has to make =================
const options = [
  { id: 'o1_opener_1', tc: 'البداية · خيار ١', note: 'خيار ١ للبداية: كوب طويل مضلّع وثلج طايح فوقه.',
    layers: [still('s1'), tag('حلو…'), word(), ...dots()] },
  { id: 'o2_opener_2', tc: 'البداية · خيار ٢', note: 'خيار ٢ للبداية: كوب قصير عريض، الثلج أكبر وأقرب.',
    layers: [still('s1alt'), tag('حلو…'), word(), ...dots()] },
  { id: 'o3_burger_1', tc: 'البرجر · خيار ١', note: 'خيار ١ للبرجر: الخبزة بالهوا وتطيح مع الضربة (حركة أقوى).',
    layers: [still('s3'), tag('برجر؟'), word(), ...dots()] },
  { id: 'o4_burger_2', tc: 'البرجر · خيار ٢', note: 'خيار ٢ للبرجر: برجر جاهز والجبن يسيل (أهدى).',
    layers: [still('s3alt'), tag('برجر؟'), word(), ...dots()] },
  { id: 'o5_burger_1_lens', tc: 'البرجر ١ داخل النقطة', note: 'خيار ١ داخل النقطة: اللوح أعرض من الدائرة وينقص من الصوبين.',
    layers: [{ t: 'fill', color: 'lime' }, ...lens('s3'), tagInk('برجر؟'), wordInk(), ...dotsInk()] },
  { id: 'o6_burger_2_lens', tc: 'البرجر ٢ داخل النقطة', note: 'خيار ٢ داخل النقطة: البرجر كامل داخل الدائرة.',
    layers: [{ t: 'fill', color: 'lime' }, ...lens('s3alt'), tagInk('برجر؟'), wordInk(), ...dotsInk()] },
  { id: 'o7_b20_f000', tc: 'نسخة B · f0', note: 'النسخة الثانية للاختبار: نفس الإعلان بس يبدأ بالشاليه (حلقة السباحة تطيح بالماي).',
    layers: [still('s6'), word(), ...dots()] },
  { id: 'o8_b20_f010', tc: 'نسخة B · f10', note: 'النسخة الثانية: تطلع «شاليه؟» بدل «حلو…» والماي يطش.',
    layers: [still('s6'), tag('شاليه؟'), word(), ...dots([-12, -22, -6])] },
];

// ================= TikTok: same frames under the TikTok chrome, and the TikTok ending =================
const pick = id => key.find(f => f.id === id);
const tiktok = [
  { ...pick('02_f010'), id: 't1_f010', note: 'تيك توك: الكلمة و«حلو…» داخل المنطقة الآمنة.' },
  { ...pick('10_f155'), id: 't2_f155', note: 'تيك توك: النقطة الكبيرة ما توصل أزرار الجنب.' },
  { ...pick('14_f350'), id: 't3_f350', note: 'تيك توك: ولا نقطة تحت أزرار الجنب.' },
  { ...pick('15_f392'), id: 't4_f392', note: 'تيك توك: الانفجار بعيد عن أزرار الجنب.' },
  { id: 't5_cta', tc: tc(470), note: 'ختام تيك توك: دزّ لنا بالخاص + حساب تيك توك.',
    layers: [still('s2', { clip: { x: 0, y: 1130, w: 1080, h: 790 }, dy: 230 }),
      { t: 'rect', x: 0, y: 0, w: 1080, h: 1130, fill: 'lime' }, { t: 'rect', x: 0, y: 1120, w: 1080, h: 10, fill: 'ink' },
      line('دزّ لنا', 120, 440), line('بالخاص', 160, 660, { shadow: { dx: 8, dy: 8, color: 'paper' } }), handle('@tash.creative', 800),
      ...[448, 540, 632].map((x, j) => ({ t: 'dot', x, y: 965 + [0, -8, -16][j], r: 32, fill: 'ink', ring: { color: 'paper', lw: 6 } }))] },
  { ...pick('16_f470'), id: 't6_ig_cta', note: 'للمقارنة: ختام إنستغرام.' },
];

// ================= 4:5 (1080x1350): its own layout, drawn on the 9:16 canvas and cropped to the top 1350 rows =================
const T = -208, FOOT = -285;                                     // type moves up 208; footage shows source rows 285-1635
const mask45 = [{ t: 'rect', x: 0, y: 1350, w: 1080, h: 570, fill: SHEET_BG }, { t: 'text', s: '4:5 · 1080 × 1350', size: 40, x: 540, y: 1440, w: 600, font: '"JetBrains Mono"', dir: 'ltr', fill: 'lime' }];
const tag45 = (s, size = 170) => tag(s, size, 545);
const r45 = [
  { id: 'r45_01_f000', tc: tc(0), note: 'مقاس ٤:٥ (للفيد): أول فريم.',
    layers: [still('s1', { dy: FOOT }), word({}, T), ...dots([0, -10, -22], T), ...mask45] },
  { id: 'r45_09_f140', tc: tc(140), note: 'مقاس ٤:٥: «قهوة؟» فوق الكوب بدون ما تغطيه.',
    layers: [still('s1', { dy: FOOT }), tag45('قهوة؟'), word({}, T), ...dots([-6, -22, -12], T), ...mask45] },
  { id: 'r45_16_f470', tc: tc(470), note: 'مقاس ٤:٥: الختام.',
    layers: [still('s2', { clip: { x: 0, y: 760, w: 1080, h: 590 }, dy: -140 }),
      { t: 'rect', x: 0, y: 0, w: 1080, h: 760, fill: 'lime' }, { t: 'rect', x: 0, y: 750, w: 1080, h: 10, fill: 'ink' },
      line('اطلب إعلانك', 120, 232), line('بالخاص', 160, 452, { shadow: { dx: 8, dy: 8, color: 'paper' } }), handle('@tash.creative.kw', 592),
      ...[448, 540, 632].map((x, j) => ({ t: 'dot', x, y: 690 + [0, -8, -16][j], r: 32, fill: 'ink', ring: { color: 'paper', lw: 6 } })), ...mask45] },
];

const write = (name, title, frames) => { writeFileSync(join(out, name), JSON.stringify({ title, frames }, null, 1)); console.log(name, frames.length, 'frames'); };
write('key.frames.json', 'طشّ · الإعلان الجديد · ستوري بورد من ١٦ لقطة', key);
write('options.frames.json', 'طشّ · الإعلان الجديد · الخيارات', options);
write('tiktok.frames.json', 'طشّ · الإعلان الجديد · فحص تيك توك', tiktok);
write('r45.frames.json', 'طشّ · الإعلان الجديد · مقاس ٤:٥', r45);
