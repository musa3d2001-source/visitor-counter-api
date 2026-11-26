# «طشّ للطلاب» — build contract (src/)

The lead (technical director + editor) owns the timeline, the page and the kit. Five agents fill it in parallel:
the scene builders (each owns one or more scenes) and the audio builder. **Read this whole file, then `cues.json`, then
`../SCRIPT-COPY.md` and `../script.json`.** The copy is final: every on-screen string is already in `cues.json → text`,
copied byte for byte from `script.json`; use the event's `text`, never retype Arabic.

**Status:** scenes, audio, the lead's integration pass and the fix round after four review lenses are done (26 Nov);
the film is built (see `../SCRIPT.md`, section "Fix round"). Nothing here is delivered, approved or published.

## 0. The film in one table (125 BPM, 30 fps, 891 frames = 29.70 s; the music inserts one beat after the chord)

Beat k is at `1.401 + 0.48·k` s, frame `round(t·30)`; k % 4 = 0 is a bar line. Type **lands on the grid frame**; each VO
key word starts 0.02 s before it (measured, see `vo/vo_timeline.json`).

| scene | frames [in, out) | seconds | what (full brief in `cues.json → scenes[].what`) |
|---|---|---|---|
| `s1_hook` | 0–78 | 0.000–2.600 | live plate h1, «عندك برزنتيشن؟» on from f0, «تقرير؟» f42 (bar), «بحث؟» f59, push INTO the laptop screen, ends on white (f77) |
| `s2_screen` | 78–224 | 2.600–7.467 | match cut on the white (f78 = the blank slide filling the frame, whip back by ≈ f87); group chat (f83), notification + ding (f85), «والتسليم… باجر؟» (f92/f117); the reminder flies off and the app dims 40 % from f140; runs under s3; wiped by the splash |
| `s3_splash` | 140–258 | 4.667–8.600 | the TASH message, centred (f143), «المرة الجاية…» (f150), «خلّ التصميم على» + dots (f185…), **SPLASH f215 (bar)**: the dots become the wordmark's dots in place, «للطلاب» f229; card 1 flies in as a new object f232–257 to s4's `HANDOFF` view |
| `s4_parade` | 258–517 | 8.600–17.233 | 7 sample cards on the beat: f258 · f330 (bar) · f366 · f416 · f431 · f452 · f481; each chip pops on its own card's land frame; file chips f488–f503; fan hold to f517 |
| `s5_details` | 517–687 | 17.233–22.900 | margins: «حتى الهوامش…» f524, **snap «نضبّطها.» f553**; RULE LINE f589 (قبل), swipe **f618 (bar)**, f625 (بعد); one push 0.92 → 1.00 to s6's screen rect |
| `s6_payoff` | 687–776 | 22.900–25.867 | lecture hall h2 (mirrored), card 1's slide on the screen behind her hand; «ويوم التسليم…» f689, «خلّ شغلك يسولف عنك.» f719 (chord), held to f775 |
| `s7_end` | 776–891 | 25.867–29.700 | end card: wordmark + «للطلاب» + tagline f776, CTA f784, handles f791–793, «بس مو آخر ليلة.» f820, sonic-logo ticks f854 (after the voice), hit f863 (the music's bar) |

`cues.key` has every big frame by name (`splash`, `card1`…`card7`, `snap`, `rule`, `swipe`, `chord`, `logo_hit` …).
The samples label «نماذج من تصميمنا» is drawn by `main.js` from f232 (card 1's first visible frame) to f776 (top-right,
`cues.label_pos`, one opaque pill); **scenes do not draw it** and must keep its corner (x 700–1016, y 255–320) free of
anything important.

## 1. Scene interface

`src/scenes/<id>.js` must export:

```js
export default {
  id: 's4_parade',                       // must equal the file name and the cues id
  async mount(root, ctx) { /* build DOM once; await images (kit.img) */ },
  async seek(tl, ctx) { /* set EVERYTHING visible from tl / ctx alone */ },
};
```

- `mount(root, ctx)` runs once before frame 0. `root` is the scene's own absolutely positioned 1080×1920 div (z-order =
  scene order, so s3 sits above s2). During mount the root is laid out but invisible, so `offsetWidth` works.
- `seek(tl, ctx)` runs on every frame where `in ≤ frame < out`; `tl` = film time − scene in (s), already quantised to the
  frame. Outside its range the root is `display:none`. `seek` may be async (await a footage frame) and must be a pure
  function of time: the renderer seeks frames in any order, in several browsers at once.
- `ctx`: `cues`, `vo` (vo_timeline.json), `kit`, `G` (beat grid: `G.t(k)`, `G.f(k)`, `G.k(t)`, `G.pulse(t, kFrom, kTo)`),
  `scene` (its cue entry), `events` (its text events, sorted by `in`), `ev(id)` (any text event), `t`/`f` (film s/frame),
  `tl`/`fl` (local s/frame), `W`, `H`, `fps`, `src` (URL of `src/`), `params`, `loadCSS(url)`.
- Your stylesheet: `await ctx.loadCSS(new URL('./s4_parade.css', import.meta.url))` in `mount`.
- Assets: `src/assets/<your id>/…` (yours), `../samples/*.png` (the sample works; read-only), `src/footage/h1|h2/`
  (read-only), `/_system/fonts`, `/_system/brand/logo.mjs` (the wordmark: `wordmarkInner()`, `dots()`, `COLORS`).
- Wait for `../samples/READY` before treating a sample as final (the parent creates it after review); the 18 PNGs that
  exist now are usable for layout.

## 2. Kit API (`import * as K from '../kit.js'`) — tiny examples

```js
K.C.lime, K.C.ink, K.C.paper, K.SAFE                          // tokens; SAFE = {x0:64, x1:1016, y0:250, y1:1620}
K.E.outCubic(x), K.EX.outCirc(x), K.clamp, K.lerp, K.remap(v,a0,a1,b0,b1), K.smoothstep, K.spring(x), K.rng(seed)
K.kIn(t, inF, landF, ease) // 0→1 between two FILM frames · K.kOut(t, outF, dur) // 0→1 over the dur frames ending at outF

// Arabic text, per WORD (default) or per LINE — straight from a cue event (land/out/words come from cues.json):
const line = K.kinetic(root, ctx.ev('P1.answer'), { x: 540, y: 700, size: 88, style: 'punch', exit: 'lift',
                                                    colors: { 0: K.C.lime }, maxWidth: 952 });
line.render(ctx.t);           // in seek(); styles: punch | rise | pop | slam | type | mask (right→left wipe)
K.kinetic(root, { text: ctx.ev('L2').text, land: 92, out: 143 }, { perLine: true, style: 'rise' });

const c = K.chip(root, { text: ctx.ev('P1.chip').text, theme: 'lime', size: 52, x: 800, y: 600 });
c.render(ctx.t, inF, landF, outF);                                       // sticker pop
const fc = K.fileChip(root, { ext: '.pptx', size: 38, x: 300, y: 1400 }); // LTR, the dot on the left
fc.render(ctx.t, inF, landF, outF);

const s3d = K.stage3d(root, { perspective: 1800, ox: 540, oy: 900 });
const card = K.card3d(s3d, { src: '../samples/deck-uni-01-title.png', w: 900, h: 506, radius: 18, reflection: true });
card.set({ x: 540, y: 900, z: 120, rx: 6, ry: -18, rz: 2, s: 1, o: 1, lift: 0.8 });   // in seek()

const seq = K.frames(ctx.src + 'footage/h1/', 90);  const im = await seq.get(ctx.fl);   // a JPEG sequence by index
K.drawCam(canvasCtx, im, { z, cx, cy });            // draw an image through a zoom camera
el.style.transform = K.quadTransform(w, h, quad);   // map a w×h element onto 4 points (TL,TR,BR,BL), origin 0 0
K.fitQuad(quad, iw, ih) → { z, cx, cy }             // the zoom at which a quad covers the frame
K.plateToFrame([x, y], { z, cx, cy, iw, ih })       // plate px → frame px for that camera
K.arDigits(2026) → '٢٠٢٦'  ·  K.ltr('@tash.creative', parent)  // isolated LTR run
await K.img(url)                                    // preload; the page's ready waits for every K.img
```

Working references: `src/kitdemo.html` (every component; render it with the stills command in §5),
`scenes/s1_hook.js` (plate + push into the screen quad), `scenes/s6_payoff.js` (plate + slide behind the hand).

## 3. Cue names each scene must honour

All frames are in `cues.json`; a scene reads them from `ctx.ev(id)` / `cues.key` / `cues.cards`, never hard-codes them.

- **s1_hook**: `L1.1` («عندك برزنتيشن؟», on from f0), `L1.2` f42, `L1.3` f59 (`key.q3`); the three lines stack and stay
  until the push takes them; last frame f77 must be fully white (`handoffs.s1_s2`). Plate: `footage/h1/` (frame k = film frame
  k), screen quads `footage/h1/screen.json → frames[k].quad_s`. Never cover the student's head/hands or the glowing screen
  with type in 0–1.6 s.
- **s2_screen**: from white (f78); `ui.file`, `ui.placeholder` (low contrast), `ui.clock`, `ui.group_chat` (lands first,
  f81), `ui.notif_title` + `ui.notif` (f85, with the ding; pin drawn, no emoji), `L2` (f92, «باجر؟» f117; leaves f143).
  Generic app chrome only: no Office UI, no logos. Everything is wiped by the splash at f215.
- **s3_splash**: `ui.tash_sender`, `ui.tash_typing` (f143→150), `L3.1` (f150, stays to f258), `L3.2a` («خلّ» f185,
  «التصميم» f191, «على» f204, dots f207), **`L3.2` at f215: the dots fire the splash and stay as the wordmark's dots;
  its body lands around them on their row**, `L3.3` «للطلاب» f229. The splash wipes the WHOLE screen; the student's file
  is never shown finished; card 1 (`cards[0].sample_hint`) arrives as a new object from f232 (`key.card1_in`) and sits
  on f257 exactly where s4's camera sees it on f258 (`s4_parade.js → HANDOFF`, `card1Matrix`).
- **s4_parade**: `cards[]` (7 slots: `land`, `hero_until`, `chip`, `answers`, `sample_hint`), chips `P1.chip`, `P2.chip`,
  `P3.chip`, `P4.1`–`P4.3`, `ui.chip_excel`; answers `P1.answer` (f287), `P2.answer` (f347), `P3.answer` (f383);
  `ui.research_tag1–3` (f388/391/395); `P5` (f481); `ui.file_chip1–5` (f488–503, LTR). Each chip string rendered ONCE.
  Hold the full fan f503–f517.
- **s5_details**: `D1.1` (f524), `D1.2` (f553) = the guides SNAP; optional `ui.callout_toc` (f573–588, only if it reads
  clean; never over the rule line); `R1.1` + `ui.before` (f589), swipe on f618, `ui.after` (f620), `R1.2` (f625); the
  rule line is the most important text of the film: big, calm, nothing busy behind it.
- **s6_payoff**: `C1.1` (f690), `C1.2` (f719, the chord). Plate `footage/h2/plate.jpg`; slide = card 1's hero slide into
  `screen.quad_draw`; then `fg.png` at `fg.box` (her hand stays in front). Push-in ≤ 1.4× (no upsampling). Type must
  not cover the screen or the presenter.
- **s7_end**: `end.wordmark`, `end.line`, `end.tagline`, `end.cta` (f784), `end.ig`, `end.tt` (f791/793: Arabic label +
  the handle as its own LTR run, `K.ltr`; check the «@» sits on the LEFT of the handle in the first rendered frame),
  `E2` (f820). The wordmark is the logo (`/_system/brand/logo.mjs`), never typed text. Sonic-logo ticks after the last
  word (f854), hit f863: the dots answer it, the CTA pulses once; the card keeps a slow push and a faint drifting fan.

## 4. File ownership

| who | may edit |
|---|---|
| lead | `main.js`, `kit.js`, `kit.css`, `cues.json`, `index.html`, `build.sh`, `kitdemo.*`, `scenes/_stub.js`, `tools/*`, `vo/*`, `footage/*`, this file |
| scene agent | ONLY `src/scenes/<its ids>.js`, `src/scenes/<its ids>.css`, `src/assets/<its ids>/` |
| audio agent | ONLY `src/audio.py`, `src/audio/` (writes `src/audio/mix_vo.wav`, `src/audio/mix_novo.wav`) |
| everyone | append (never edit others' lines) to `src/REQUESTS.md` to ask the lead for a kit/cue/page change |

Nobody but the lead edits `main.js`, `kit.*` or `cues.json`. If a cue looks wrong, ask in `REQUESTS.md` (scene id,
what, why); keep working against the current cue meanwhile. Never write outside `src/`; never run git; never call a
paid tool (Higgsfield, ElevenLabs, …): the footage and the VO are final.

## 5. Commands (run from the `tash/` root)

```bash
# stills of one scene (film seconds; ?guide=1 draws the safe zone, the beat light and flags any [data-safe] element
# outside x 64-1016, y 250-1620 with a red box)
node _system/tools/render.mjs --page "12-students-ad/src/index.html?scene=s4_parade&guide=1" \
     --stills 8.65,9.6,11.05,12.25,13.9,14.4,15.1,16.1,16.8,17.2 --stills-dir 12-students-ad/review/s4 --prefix s4
# a clip of one scene (its own frames only: --from = in/30, --to = out/30)
node _system/tools/render.mjs --page "12-students-ad/src/index.html?scene=s4_parade" \
     --from 8.6 --to 17.2333 --out 12-students-ad/review/s4_parade.mp4 --workers 3
# s2 + s3 together (they overlap)
node _system/tools/render.mjs --page "12-students-ad/src/index.html?scene=s2_screen,s3_splash" --from 2.6 --to 8.6 \
     --out 12-students-ad/review/s2s3.mp4 --workers 3
# the kit demo
node _system/tools/render.mjs --page 12-students-ad/src/kitdemo.html --stills 1.75,2.9 --stills-dir 12-students-ad/review/kit
# the whole film: picture + every mix that exists (bash 12-students-ad/src/build.sh --mux-only to re-mux only)
WORKERS=5 bash 12-students-ad/src/build.sh
# live preview in a browser (serve tash/ yourself): index.html?play&from=8.6&to=17.2 · index.html?t=12.2&guide=1
```

Scene in/out seconds for `--from/--to`: s1 0–2.6 · s2 2.6–7.4667 · s3 4.6667–8.6 · s4 8.6–17.2333 · s5 17.2333–22.7667
· s6 22.7667–25.4 · s7 25.4–29.2333. Review output goes to `12-students-ad/review/` (scratch; not a deliverable).

## 6. Performance rules (the renderer seeks every frame in headless Chromium with a software GPU)

- No CSS animations, transitions, `requestAnimationFrame`, timers, `Date`, `Math.random` (use `K.rng(seed)`).
- Animate `transform` and `opacity`; avoid per-frame layout (`width`, `top`, text changes) except where you mean it.
- `filter: blur()` is expensive: blur only a few small elements, only while they move (set `'none'` at rest).
  No `backdrop-filter`. At most one full-frame canvas per scene; draw footage with `drawImage`, not `getImageData`.
- Preload everything in `mount` (`await K.img(url)`); a footage frame is `await seq.get(k)` (an LRU of 10).
- Keep the DOM small (≲ 300 nodes per scene); reuse elements, toggle `display`.
- Measure text once in `mount` (fonts are loaded before mount), never in `seek`.
- Target ≥ 2 frames/s per worker for your scene (check the renderer's fps readout on a clip render).

## 7. Craft rules (non-negotiable)

- Arabic per WORD or per LINE only: never split a word into letters (the letters must stay joined). Never letter-space
  Arabic. Arabic-Indic digits in Arabic lines (`K.arDigits`). «على الإنستقرام», never «بالإنستقرام».
- Every text inside the safe area x 64–1016, y 250–1620 (check with `?guide=1`). Fix round, the platform map on top of
  it: key ink ends at y ≤ 1540; nothing readable at x > 950 over y 1100–1750; key lines keep x ≤ 920 over y 900–1650.
- Never cover the key moment with UI or type (the student, the glowing screen, a card's hero area, her hand on the slide).
- LTR runs (handles, file types) are isolated LTR elements; «؟» sits on the LEFT of an RTL line.
- No Office logos or exact Office UI; no emoji on screen; no real school/university names; samples only from `../samples/`.
- Brand: ink `#0B0B0B`, lime `#C6FF00`, paper `#F5F5E9`; Alexandria (Arabic display), IBM Plex Sans Arabic (text),
  Archivo (Latin display), JetBrains Mono (labels). The samples keep their own palettes.
- Fast, youthful, confident; on the beat; real depth; every transition motivated. One special transition: the splash.

## 8. Audio (the audio agent)

Inputs: `cues.json → sfx[]` (name, frame, t, beat, note; 40 events), `beats[]`, `bpm` 125, `phase` 1.401;
`vo/vo_edit.wav` (48 kHz mono, already on the film timeline, sample peak −3 dBFS, −26 LUFS); `vo/vo_timeline.json`
(phrase and word times for ducking). Engine: `/_system/audio/tashaudio.py` (`Grid(125, offset=1.401)`, `sonic_logo()`,
`tash_hit()`, `Mix`, `duck_curve`, `lufs`, `true_peak_db`). Write `src/audio.py` → `src/audio/mix_vo.wav` (VO + music +
SFX) and `src/audio/mix_novo.wav` (music + SFX), 48 kHz stereo, exactly `duration` long (29.2333 s), −14 LUFS,
true peak ≤ −1 dBTP; duck the music 6–8 dB under the VO. Groove drops on the SPLASH (f215, bar line); the sonic-logo hit
on f848 (bar); after the last word (27.957 s) the sonic logo plays alone. `build.sh` muxes whatever mixes exist.

## 9. The timing chain (lead)

`vo/take1.mp3` → `tools/vo_pieces.py` (measured cut list) → `tools/vo_edit.py` (tempo 1.08×, 125 BPM, phase 1.401;
DP placement on the grid) → `vo/vo_edit.wav` + `vo/vo_timeline.json` → `tools/build_cues.py` (+ `../script.json`) →
`cues.json`. Footage: `tools/prep_h1.py` → `footage/h1/`, `tools/prep_h2.py` → `footage/h2/`. Re-running any of these is
deterministic.
