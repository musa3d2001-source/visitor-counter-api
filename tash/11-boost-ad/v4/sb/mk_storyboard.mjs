// Storyboard round 3 (after the independent review): 18 key frames on the fitted stills, the picks sheet
// (opener, burger, version B), the TikTok check and the 4:5 layouts.
// usage: node mk_storyboard.mjs <out dir>
//   -> key.frames.json, part1/2/3.frames.json (phone sheets), options.frames.json, tiktok.frames.json, r45.frames.json
// Layout only (0 credits). Numbers come from BUILD-SPEC.md sections 5, 7, 11 and its "Revision 3" section.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2]; if (!out) throw new Error('usage: node mk_storyboard.mjs <out dir>');
mkdirSync(out, { recursive: true });

const TANG = '#FF7A1A', PINK = '#FF4F9A', AZURE = '#1EA7FF', GREY = '#DCDCD0', CLEAR = 'rgba(0,0,0,0)', SHEET_BG = '#141412';
const OP = 's1alt';                                    // the opener we recommend: the short wide tumbler (the tall glass s1 is the alternative)
const S = k => `/_stills/${k}_fit.png`;
const SLOT = [715, 352], DOT_Y = 342, DOT_X = [623, 715, 807];
const tc = f => `f${f} · ${(f / 30).toFixed(2)}s`;

// ---- W «مشروعك» (dotless body; the three dots are separate discs) ----
const word = (o = {}, dy = 0) => ({ t: 'word', key: 'mashrou3ak', size: 172, slot: [SLOT[0], SLOT[1] + dy], fill: 'paper', stroke: 'ink', lw: 16, shadow: { dx: 8, dy: 8, color: 'ink' }, dots: false, ...o });
const wordInk = (o = {}, dy = 0) => word({ fill: 'ink', stroke: 'paper', lw: 12, shadow: null, ...o }, dy);       // on Lime / Paper / flat colour
const wordHollow = (o = {}) => word({ fill: CLEAR, stroke: 'ink', lw: 8, shadow: null, ...o });                    // dead state «مسروعك»

// ---- dots: path Ø80, 8 px ring centred on it (visible lime Ø72, outer edge Ø88), hard Ink shadow (+6,+6) ----
const disc = (x, y, r = 40) => [{ t: 'dot', x: x + 6, y: y + 6, r: r + 4, fill: 'ink' }, { t: 'dot', x, y, r, fill: 'lime', ring: { color: 'ink', lw: 8 } }];
const row = (cx, cy, offs, pitch = 92) => [-1, 0, 1].flatMap((n, j) => disc(cx + n * pitch, cy + offs[j]));
const dots = (offs = [0, -10, -22], dy = 0) => row(715, DOT_Y + dy, offs);
const dotsInk = (offs = [0, -10, -22]) => DOT_X.map((x, j) => ({ t: 'dot', x, y: DOT_Y + offs[j], r: 40, fill: 'ink', ring: { color: 'paper', lw: 8 } }));
const dashed = xs => xs.map(x => ({ t: 'dot', x, y: DOT_Y, r: 40, fill: null, ring: { color: 'ink', lw: 5, dash: [8, 7] } }));

// ---- type ----
const tag = (s, size = 200, y = 757) => ({ t: 'text', s, size, x: 540, y, w: 800, fill: 'lime', stroke: 'ink', lw: 20, shadow: { dx: 10, dy: 10, color: 'ink' }, rot: -4 });
const tagInk = (s, size = 200, y = 757) => ({ t: 'text', s, size, x: 540, y, w: 800, fill: 'ink', shadow: { dx: 10, dy: 10, color: 'paper' }, rot: -4 });
const line = (s, size, y, o = {}) => ({ t: 'text', s, size, x: 540, y, w: 800, fill: 'ink', ...o });
const handle = (s, y) => ({ t: 'text', s, size: 60, x: 540, y, w: 600, font: '"JetBrains Mono"', dir: 'ltr', fill: 'ink' });
const TALK = 'شنو حسابهم؟!', talk = (o = {}) => line(TALK, 114, 740, o);       // one line in the slot of «محد يسولف؟»

// ---- pictures ----
const still = (k, o = {}) => ({ t: 'still', src: S(k), ...o });
const punch = (k, scale) => still(k, { scale, cx: 0.5, cy: 900 / 1920 });                                           // punch-in about (540,900)
const LENS = { x: 540, y: 1270, r: 340 };
const LENS_SCALE = { s1: 0.85, s1alt: 0.86, s2: 0.78, s3: 0.72, s3alt: 0.8, s5: 1 };                                 // so the whole product sits inside the rim
const lens = k => [still(k, { clip: { type: 'circle', ...LENS }, scale: LENS_SCALE[k], cx: 0.5, cy: LENS.y / 1920, ax: LENS.x, ay: LENS.y }),
  { t: 'dot', x: LENS.x, y: LENS.y, r: LENS.r - 6, fill: null, ring: { color: 'ink', lw: 12 } }];
// porthole: source point (sx, sy) of the still lands on the circle centre, picture drawn at `scale`
const port = (k, x, y, r, scale, sx, sy, ring = 12) => [still(k, { clip: { type: 'circle', x, y, r }, scale, cx: sx / 1080, cy: sy / 1920, ax: x, ay: y }),
  { t: 'dot', x, y, r: r - ring / 2, fill: null, ring: { color: 'ink', lw: ring } }];

// ---- TASH wordmark M: box top-left (x0, y0), width w (height = w * 1461 / 2579) ----
const mark = (x0, y0, w, o = {}) => { const s = w / 2579; return { t: 'mark', x: x0 + 1080 * s, y: y0 + 437 * s, scale: s, fill: 'ink', dotFill: 'ink', ...o }; };
// the same wordmark with its three dots drawn separately so they can type
const markTyping = (x0, y0, w, offs = [0, -5, -10]) => { const s = w / 2579, cx = x0 + 1080 * s, cy = y0 + 437 * s;
  return [mark(x0, y0, w, { dots: false }), ...[-1, 0, 1].map((n, j) => ({ t: 'dot', x: cx + n * 212 * s, y: cy + offs[j], r: 90 * s, fill: 'ink' }))]; };

// ---- burst: n triplets in the three world colours (none Lime, Ink or Paper; no rectangles), each on its own ray from (C.x, C.y),
// growing a little toward the lens; clear of `box` and of the TikTok rail (x > 960 over y 1100-1750) ----
const lcg = seed => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const burst = (seed, n, C, box, d0, dr) => { const rnd = lcg(seed), cols = [TANG, PINK, AZURE], placed = [], layers = [];
  const hitsBox = (x, y, r) => x + r > box.x0 && x - r < box.x1 && y + r > box.y0 && y - r < box.y1;
  const hitsRail = (x, y, r) => x + r > 960 && y + r > 1100 && y - r < 1750;
  let k = 0, guard = 0;
  while (k < n && guard++ < 60000) {
    const ang = rnd() * Math.PI * 2, a = d0 + rnd() * dr, far = Math.min(1, (a - d0) / dr), R = 22 + far * 30 + rnd() * 8, ux = Math.cos(ang), uy = Math.sin(ang);
    let d = a; const pts = [0.78, 0.89, 1].map(q => { const r = R * q, p = { x: C.x + ux * d, y: C.y + uy * d, r }; d += r * 2.42; return p; });
    if (pts.some(p => hitsBox(p.x, p.y, p.r) || hitsRail(p.x, p.y, p.r) || p.x < -p.r * 0.5 || p.x > 1080 + p.r * 0.5 || p.y < 30 || p.y > 1905)) continue;
    if (pts.some(p => placed.some(q => Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r + 22))) continue;
    placed.push(...pts); const c = cols[k % cols.length]; pts.forEach(p => layers.push({ t: 'dot', x: +p.x.toFixed(1), y: +p.y.toFixed(1), r: +p.r.toFixed(1), fill: c })); k++;
  }
  if (k < n) throw new Error('burst: placed only ' + k + ' of ' + n + ' triplets'); return layers; };

// ---- "27 dots" at f350 = the word's three + 24 loose ones: eight exact copies of the word's dot row (so they read as the same dots multiplying) ----
const talkDots = () => { const P = [[290, 930], [720, 970], [400, 1100], [800, 1140], [280, 1270], [700, 1310], [410, 1440], [790, 1480]];
  const offs = [[0, -10, -22], [-22, -10, 0], [-8, -22, -4], [-18, 0, -12]];
  return P.flatMap(([cx, cy], i) => row(cx, cy, offs[i % 4])); };

// ---- the ending card: two lines + handle + wordmark signature on Lime, footage band below ----
const cta = ({ l1, h, band = 's5', y1 = 400 }) => [still(band, { clip: { x: 0, y: 1060, w: 1080, h: 860 }, dy: 60 }),
  { t: 'rect', x: 0, y: 0, w: 1080, h: 1060, fill: 'lime' }, { t: 'rect', x: 0, y: 1050, w: 1080, h: 10, fill: 'ink' },
  line(l1, 120, y1), line('بالخاص', 160, 620, { shadow: { dx: 8, dy: 8, color: 'paper' } }), handle(h, 760), ...markTyping(380, 836, 320)];

// ================= the 18 key frames (A-20, Instagram layout) =================
const easeIn = t => t * t;                                    // BUILD-SPEC names easeIn without defining it: quadratic
const fall = (f, f0) => Math.round(1920 * easeIn((f - f0) / 9)), grow = (f, f0) => 40 + 90 * (f - f0) / 9;   // drop in px, dot radius (Ø80 -> Ø260)
const col3 = (x, w) => ({ x, y: 0, w, h: 1920 });
const F4 = 40, DR = [fall(F4, 32), fall(F4, 34), fall(F4, 36)], RR = [grow(F4, 32), grow(F4, 34), grow(F4, 36)];   // right, middle, left

const key = [
  { id: '01_f000', tc: tc(0), note: 'أول لقطة: «مشروعك» ونقاطه الثلاث تتحرك مثل نقاط «يكتب…»، والثلج بالهوا فوق الكوب. ولا شي ثاني.',
    layers: [still(OP), word(), ...dots()] },
  { id: '02_f010', tc: tc(10), note: 'صورة الغلاف: تطلع «حلو…» والقهوة تطش من الكوب (الطشّة بالفيديو)، وبعدها زووم قوي مع الإيقاع.',
    layers: [still(OP), tag('حلو…'), word(), ...dots([-12, -22, -6])] },
  { id: '03_f031', tc: tc(31), note: 'عند كلمة «حلو» تتبدل الصورة لكنافة (حلو = حلويات)، لنص ثانية بس.',
    layers: [still('s5'), tag('حلو…'), word(), ...dots([-22, -8, 0])] },
  { id: '04_f040', tc: tc(F4), note: 'النقاط تطيح من الشين وحدة وحدة، وكل نقطة تسحب ثلث الصورة وياها، والكلمة تفضى.',
    layers: [{ t: 'fill', color: GREY },
      still('s5', { clip: col3(720, 360), dy: DR[0] }), still('s5', { clip: col3(360, 360), dy: DR[1] }), still('s5', { clip: col3(0, 360), dy: DR[2] }),
      wordHollow(), ...dashed(DOT_X),
      ...[[623, 2], [715, 1], [807, 0]].flatMap(([x, i]) => { const y = DOT_Y + DR[i], r = RR[i];
        return [{ t: 'dot', x: x + 8, y: y + 8, r: r + 4, fill: 'ink' }, { t: 'dot', x, y, r, fill: 'lime', ring: { color: 'ink', lw: 8 } }]; })] },
  { id: '05_f060', tc: tc(60), note: 'بدون النقاط صارت «مسروعك»: الصورة طفت والنقاط طايحة رمادية تحت. أهدى لحظة بالإعلان.',
    layers: [{ t: 'fill', color: GREY }, wordHollow(), ...dashed(DOT_X), line('محد يسولف؟', 126, 740),
      ...[420, 540, 660].map(x => ({ t: 'dot', x, y: 1170, r: 50, fill: 'smoke', ring: { color: 'ink', lw: 8 } }))] },
  { id: '06_f084', tc: tc(84), note: 'النقاط ترجع على الشين، ومن كل نقطة تنفتح دايرة ترجّع اللون والقهوة للصورة.',
    layers: [{ t: 'fill', color: GREY }, still(OP, { clip: { type: 'circle', x: 807, y: DOT_Y, r: 1560 } }),
      { t: 'dot', x: 807, y: DOT_Y, r: 1555, fill: null, ring: { color: 'lime', lw: 10 } }, { t: 'dot', x: 807, y: DOT_Y, r: 1563, fill: null, ring: { color: 'ink', lw: 6 } },
      { t: 'dot', x: 715, y: DOT_Y, r: 775, fill: null, ring: { color: 'lime', lw: 10 } }, { t: 'dot', x: 715, y: DOT_Y, r: 783, fill: null, ring: { color: 'ink', lw: 6 } },
      word(), ...dots([0, 0, 0]), line('محد يسولف؟', 126, 740)] },
  { id: '07_f100', tc: tc(100), note: 'الضربة الأولى: «طشّ!» بالصوت والشعار على خلفية ليمونية، وتحته العرض: «خلّ إعلانك علينا».',
    layers: [{ t: 'fill', color: 'lime' }, mark(320, 290, 440), line('خلّ إعلانك', 120, 720), line('علينا', 150, 945)] },
  { id: '08_f125', tc: tc(125), note: 'ثلاث نقاط تطلع من الشعار وتنفتح دواير، من اليمين: عطر، قهوة، برجر. والشعار يتم بنقاطه.',
    layers: [{ t: 'fill', color: 'lime' }, mark(320, 290, 440), line('خلّ إعلانك', 120, 720), line('علينا', 150, 945),
      ...port('s3', 270, 1125, 110, 0.31, 540, 1275), ...port(OP, 540, 1125, 110, 0.31, 540, 1265), ...port('s2', 810, 1125, 110, 0.31, 532, 1250)] },
  { id: '09_f140', tc: tc(140), note: 'أول مشروع: «قهوة؟». الصورة كاملة، والقهوة تطش بالفيديو.',
    layers: [still(OP), tag('قهوة؟'), word(), ...dots([-6, -22, -12])] },
  { id: '10_f155', tc: tc(155), note: 'نفس القهوة داخل نقطة كبيرة على خلفية ليمونية، والكلمة تقلب أسود. والصورة تتبدل كل نص ثانية.',
    layers: [{ t: 'fill', color: 'lime' }, ...lens(OP), tagInk('قهوة؟'), wordInk(), ...dotsInk([-22, -10, 0])] },
  { id: '11_f170', tc: tc(170), note: 'ثاني مشروع: «عطر؟». دخّان العود يطلع من المبخرة.',
    layers: [still('s2'), tag('عطر؟'), word(), ...dots([0, -12, -22])] },
  { id: '12_f225', tc: tc(225), note: 'ثالث مشروع: «برجر؟». الخبزة تطيح على البرجر مع ضربة الإيقاع وزووم على اللقطة (الطيحة بالفيديو).',
    layers: [punch('s3', 1.2), tag('برجر؟'), word(), ...dots([-14, -22, -4])] },
  { id: '13_f275', tc: tc(275), note: 'رابع مشروع: «حلويات؟». الكنافة وسط النقطة: دايرة داخل دايرة.',
    layers: [{ t: 'fill', color: 'lime' }, ...lens('s5'), tagInk('حلويات؟', 180), wordInk(), ...dotsInk([0, -14, -22])] },
  { id: '14_f300', tc: tc(300), note: 'الناس تبدي تسأل: «شنو حسابهم؟!» بنفس مكان «محد يسولف؟». ثانية ونص على خلفية فاتحة، وبس النقاط تتحرك.',
    layers: [{ t: 'fill', color: 'paper' }, wordInk(), ...dots([-8, -22, 0]), talk()] },
  { id: '15_f350', tc: tc(350), note: 'والنقاط تزيد مع كل ضربة: ٣، ٩، ٢٧، ٨١. كل ثلاث نقاط = واحد قاعد يكتب عن مشروعك.',
    layers: [{ t: 'fill', color: PINK }, wordInk(), ...dots([-8, -22, 0]), talk({ stroke: 'paper', lw: 12 }), ...talkDots()] },
  { id: '16_f392', tc: tc(392), note: 'الضربة الكبيرة: النقاط تنفجر بألوان المشاريع وشعار طشّ يملى الشاشة.',
    layers: [{ t: 'fill', color: 'lime' }, ...burst(20261110, 27, { x: 540, y: 538 }, { x0: 50, y0: 230, x1: 1030, y1: 846 }, 330, 1050), mark(120, 300, 840)] },
  { id: '17_f420', tc: tc(420), note: 'جملة طشّ: «خلّهم يسولفون عنك!» تثبت ثانية ونص تحت الشعار.',
    layers: [{ t: 'fill', color: 'lime' }, ...burst(20261111, 14, { x: 540, y: 610 }, { x0: 60, y0: 230, x1: 1020, y1: 990 }, 520, 900),
      mark(320, 290, 440), line('خلّهم يسولفون', 104, 700), line('عنك!', 170, 900)] },
  { id: '18_f470', tc: tc(470), note: 'الختام ٤ ثواني: «اطلب إعلانك بالخاص» والحساب وشعار طشّ، والصورة تحت تتبدل بين المشاريع. وآخر شي يرجع لأول لقطة.',
    layers: cta({ l1: 'اطلب إعلانك', h: '@tash.creative.kw' }) },
].map((f, i) => ({ n: i + 1, ...f }));

// ================= picks: what we recommend, and the alternative =================
const options = [
  { id: 'o1_opener_pick', tc: 'البداية · اختيارنا', note: 'اختيارنا للبداية: كوب قصير عريض. الكوب والثلج أكبر بالشاشة، وفيه مكان أكثر لطشّة القهوة.',
    layers: [still('s1alt'), tag('حلو…'), word(), ...dots()] },
  { id: 'o2_opener_alt', tc: 'البداية · البديل', note: 'البديل: كوب طويل. أنيق بس أصغر بالشاشة، مثل الصور الأولى.',
    layers: [still('s1'), tag('حلو…'), word(), ...dots()] },
  { id: 'o3_burger_pick', tc: 'البرجر · اختيارنا', note: 'اختيارنا للبرجر: الخبزة بالهوا وتطيح مع ضربة الإيقاع. حركة أقوى.',
    layers: [still('s3'), tag('برجر؟'), word(), ...dots()] },
  { id: 'o4_burger_alt', tc: 'البرجر · البديل', note: 'البديل: برجر جاهز والجبن يسيل. أهدى، ونرجع له إذا طيحة الخبزة ما ضبطت بالفيديو.',
    layers: [still('s3alt'), tag('برجر؟'), word(), ...dots()] },
  { id: 'o5_burger_pick_lens', tc: 'البرجر داخل النقطة · اختيارنا', note: 'اختيارنا داخل النقطة: نصغّر الصورة شوي عشان اللوح يدخل كامل بالدايرة.',
    layers: [{ t: 'fill', color: 'lime' }, ...lens('s3'), tagInk('برجر؟'), wordInk(), ...dotsInk()] },
  { id: 'o6_burger_alt_lens', tc: 'البرجر داخل النقطة · البديل', note: 'البديل داخل النقطة.',
    layers: [{ t: 'fill', color: 'lime' }, ...lens('s3alt'), tagInk('برجر؟'), wordInk(), ...dotsInk()] },
  { id: 'o7_b_f000', tc: 'النسخة الثانية · البداية', note: 'نسخة ثانية اختيارية (٥٫٢٥ كريدت زيادة): نفس الإعلان بس يبدي بالشاليه، العوّامة تطيح بالماي.',
    layers: [still('s6'), word(), ...dots()] },
  { id: 'o8_b_f010', tc: 'النسخة الثانية · بعد ثلث ثانية', note: 'النسخة الثانية: تطلع «شاليه؟» بدل «حلو…» والماي يطش.',
    layers: [still('s6'), tag('شاليه؟', 180), word(), ...dots([-12, -22, -6])] },
].map((f, i) => ({ n: i + 1, ...f }));

// ================= TikTok: the same frames under the TikTok chrome, and the TikTok ending =================
const pick = id => key.find(f => f.id === id);
const tiktok = [
  { ...pick('02_f010'), id: 't1_f010', note: 'على التيك توك: الكلمة و«حلو…» بمكان واضح، ما تغطيهم أزرار التطبيق.' },
  { ...pick('10_f155'), id: 't2_f155', note: 'على التيك توك: النقطة الكبيرة ما توصل للأزرار اللي على اليمين.' },
  { ...pick('15_f350'), id: 't3_f350', note: 'على التيك توك: ولا نقطة تحت الأزرار اللي على اليمين.' },
  { ...pick('16_f392'), id: 't4_f392', note: 'على التيك توك: الانفجار بعيد عن الأزرار اللي على اليمين.' },
  { id: 't5_cta', tc: tc(470), note: 'ختام التيك توك: «دزّ لنا بالخاص» + حساب التيك توك.', layers: cta({ l1: 'دزّ لنا', h: '@tash.creative', y1: 414 }) },   // the shadda of «دزّ» is taller: 400 would put it above y 270
  { ...pick('18_f470'), id: 't6_ig_cta', note: 'للمقارنة: ختام الإنستقرام.' },
].map((f, i) => ({ ...f, n: i + 1 }));

// ================= 4:5 (1080x1350): its own layout, drawn on the 9:16 canvas and cropped to the top 1350 rows =================
const T = -208, FOOT = -285;                                     // type moves up 208; footage shows source rows 285-1635
const mask45 = [{ t: 'rect', x: 0, y: 1350, w: 1080, h: 570, fill: SHEET_BG }, { t: 'text', s: '4:5 · 1080 × 1350', size: 40, x: 540, y: 1440, w: 600, font: '"JetBrains Mono"', dir: 'ltr', fill: 'lime' }];
const r45 = [
  { id: 'r45_01_f000', tc: tc(0), note: 'مقاس البوست 4:5 (للفيد): أول لقطة.',
    layers: [still(OP, { dy: FOOT }), word({}, T), ...dots([0, -8, -18], T), ...mask45] },
  { id: 'r45_09_f140', tc: tc(140), note: 'مقاس البوست 4:5، «قهوة؟» فوق الكوب بدون ما تغطيه.',
    layers: [still(OP, { dy: FOOT }), tag('قهوة؟', 170, 530), word({}, T), ...dots([-6, -18, -12], T), ...mask45] },
  { id: 'r45_18_f470', tc: tc(470), note: 'مقاس البوست 4:5، الختام.',
    layers: [still('s5', { clip: { x: 0, y: 800, w: 1080, h: 550 }, dy: -216 }),
      { t: 'rect', x: 0, y: 0, w: 1080, h: 800, fill: 'lime' }, { t: 'rect', x: 0, y: 790, w: 1080, h: 10, fill: 'ink' },
      line('اطلب إعلانك', 120, 202), line('بالخاص', 160, 422, { shadow: { dx: 8, dy: 8, color: 'paper' } }), handle('@tash.creative.kw', 562),
      ...markTyping(420, 616, 240, [0, -4, -8]), ...mask45] },
].map((f, i) => ({ ...f, n: i + 1 }));

const write = (name, spec) => { writeFileSync(join(out, name), JSON.stringify(spec, null, 1)); console.log(name, spec.frames.length, 'frames'); };
const HEAD = 'طشّ · الإعلان الجديد · ';   // no «|» (it reads as the digit ١) and no «·» next to a digit (it reads as ٠)
write('key.frames.json', { title: HEAD + 'ستوري بورد من ١٨ لقطة', titleUi: HEAD + 'شكله على الإنستقرام (الخطوط المنقّطة = حدود الكتابة)', frames: key });
[['الجزء الأول · البداية والمشكلة', 0], ['الجزء الثاني · طشّ والمشاريع', 6], ['الجزء الثالث · الناس تسولف والختام', 12]].forEach(([name, a], i) =>
  write(`part${i + 1}.frames.json`, { title: name, frames: key.slice(a, a + 6) }));
write('options.frames.json', { title: HEAD + 'اختيارنا والبديل', frames: options });
write('options1.frames.json', { title: 'اختيارنا والبديل · البداية والبرجر', frames: options.slice(0, 4) });       // phone sheets, two across:
write('options2.frames.json', { title: 'البرجر داخل النقطة · والنسخة الثانية', frames: options.slice(4) });      // our pick on the right, the alternative beside it
write('tiktok.frames.json', { title: HEAD + 'شكله على التيك توك', frames: tiktok });
write('r45.frames.json', { title: HEAD + 'مقاس البوست 4:5', frames: r45 });
