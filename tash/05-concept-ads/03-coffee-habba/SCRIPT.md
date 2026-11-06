# HABBA «حبّة» — Concept ad 03 / Specialty coffee

`CONCEPT AD — 03 / COFFEE` · «إعلان تجريبي — علامة خيالية». HABBA is a fictional brand made up for this piece.
9:16 · 1080×1920 · 30 fps · 15.6 s · H.264 + AAC 48 kHz · −14 LUFS

---

## الفكرة (عربي)

**«قهوتك… على مهلك.»** ثم **«حبّة… حبّة.»**

«حبّة» اسم المحل، ومعناها حبّة القهوة. و«حبّة حبّة» بلهجتنا تعني «على راحتك، شوي شوي». فاسم العلامة نفسه
صار هو الوعد: قهوة تنسوّى بهدوء وتنشرب بهدوء.

الإعلان صباح واحد على طاولة جنب دريشة فيها ستارة شرائح. الستارة تنفتح، والشمس تنزل خطوط على الطاولة وتلف على الكوب.
البخار يطلع من الكوب، والحليب ينصب ويرسم قلب. حبّات القهوة تطيح بالتصوير البطيء، وكل حبّة تنزل على الطاولة ومعها
كلمة: «حبّة…» وبعدين «حبّة.». الكوب يلف على صحنه ويبيّن الشعار، وآخر حبّة تنزل وتصير هي نقطة الباء في الشعار.
بعدها الستارة تتسكّر والغرفة تظلم، ويطلع توقيع طشّ.

**القدرة اللي يثبتها الإعلان:** بناء أجواء وعالم كامل للعلامة. يعني ضوء وملمس (لمعة السيراميك، عروق الخشب،
حبيبات الورق)، وإيقاع هادي، وطباعة تحريرية فيها مساحات فاضية، ونظام هوية صغير متكامل للعميل: شعار عربي ولاتيني،
وألوان، وخطوط، ونبرة كلام.

## The idea (English)

**"Your coffee… at your own pace."** Then **"Habba… habba."**

*Habba* is the café's name and means "a (coffee) bean". In Kuwaiti and Gulf speech, *habba habba* means
"slowly, bit by bit". So the brand's own name carries the promise: coffee made slowly and drunk slowly.

The film is one morning at a table by a window with blinds. The blinds open and the sun falls in bars across the
table and wraps around the cup. Steam curls up, milk is poured into a heart, and beans tumble in slow motion. Each
of the two hero beans lands on the beat of its word: «حبّة…», then «حبّة.». The cup turns on its saucer to show its
mark, and a last bean drops into the logo as the dot of ب. Then the blinds close, the room goes dark, and the TASH
signature types itself in.

**Capability shown:** atmosphere and brand-world storytelling, through light (a gobo through blinds as the one
light logic), texture (glazed stoneware with iron speckle, walnut grain, limewash wall, paper grain), calm pacing
(1.9–2.95 s shots on an 85.7 BPM grid) and editorial typography with generous negative space. It also shows a
small but complete client design system: mark, palette, type roles and tone of voice.

---

## HABBA design system (client side, no TASH lime anywhere before the tail)

| | |
|---|---|
| **Mark** | «حبّة» outlined from Alexandria (OFL, wght 500) with HarfBuzz shaping. The single dot under ب is replaced by a roasted coffee bean (S-crease cut out), so the letter carries the product. Built by `src/tools/build_logo.py` → `src/habba-logo-data.mjs`; markup in `src/habba-logo.mjs` |
| **Latin** | HABBA in Archivo expanded (125%) 500, tracked .42em · SPECIALTY COFFEE 500, .5em |
| **Palette** | paper `#EFE6D8` · roasted `#4A2F23` · terracotta `#C46A4A` (the cup glaze) · ink `#17110E` · crema `#C58A52` (in the latte only) |
| **Type roles** | Arabic lines: Alexandria Light 300 (calm, editorial). Latin: Archivo expanded. Two weights per layout at most |
| **Colour rule** | paper type over the dark room; roasted type over the sunlit wall. Text sits in shade or on a plain ground, never over the light bars |
| **Objects** | terracotta-glazed cup with a hand-dipped cream rim, speckled cream saucer, the mark printed in cream glaze on the cup |

---

## Shot list (locked timings, in seconds; 1 beat = 0.7 s = 21 frames; cuts sit on beats)

The **same timeline** renders with `?clean=1` (pure footage for the launch-ad editor). The source of truth is
`src/cues.json`; `src/shots.js` and `src/audio.py` both read it.

| # | Start | End | Shot (camera · light · action) | On screen (normal) | `?clean=1` |
|---|---|---|---|---|---|
| S1 | 0.00 | 2.10 | **Blinds open.** High 3/4 (≈50° → 47°) slow push 5.6 → 5.25 and a small arc. Frame 0 shows thin slits of light across the table and cup. Between 0.28 and 1.53 the slats tilt open and the bars widen; the room fills with warm light. Steam rises; the finished heart is in the cup. | — | same |
| S2 | 2.10 | 4.20 | **Steam macro.** Side view at rim height against the dark room, push-in 4.9 → 4.6, focus on the rim. Steam curls up and glows only where it crosses a bar of sun. | «قهوتك…» writes on right→left at 2.45; exits up from 3.85, gone by 4.15 | same, no type |
| S3 | 4.20 | 7.00 | **Top-down pour.** ≈80° overhead, slow 9° rotation and push. The milk stream is already falling at frame 0. A white bloom grows in the crema (4.20–5.85); the pull-through (5.85–6.40) draws it into a heart; the stream lifts away at 6.45. The bars slide across the saucer, and the lower frame sits in shade for the line. | «على مهلك.» writes on at 4.55 (2nd word +0.26); exits from 6.60, gone by 6.94 | same, no type |
| S4 | 7.00 | 9.80 | **Beans, slow motion.** Low on the table, shallow focus, the barred wall behind. Beans tumble down through the light at about ⅛ speed. **Bean 1 lands at 7.70, bean 2 at 8.40** (crease up, a small slow bounce, settle). Others land soft and out of focus behind and in front. | «حبّة…» drops in at 7.70 · «حبّة.» at 8.40; exits from 9.42, gone by 9.76 | same, no type |
| S5 | 9.80 | 12.75 | **The cup turns on its saucer.** Low hero angle, push-in 4.75 → 4.25. The cup turns 72° (9.90–11.20, outCubic) and settles with a **clink at 11.20**; its printed mark comes round to face us. Bars of sun on the wall, steam thins. **Client end card on the wall:** the mark writes on right→left (10.80–11.70); its bean falls and **lands in the ب slot at 11.50**; HABBA tracks in (11.55); SPECIALTY COFFEE (11.80). Full lockup holds to 12.75. | HABBA end card | the footage only (no mark, no Latin) |
| S6 | 12.75 | 15.60 | **Tail.** The blinds close (12.75–13.10): the bars narrow to slits and the room goes dark. The TASH signature (local `sting-short.js`, same dots as `createSting`) runs from **13.00**: typing 13.00–13.74 → converge → **snap 14.12** → shadda 14.30 → «خلّهم يسولفون عنك!» 14.55 → @tash.creative.kw 15.10. The `CONCEPT AD — 03 / COFFEE` + «إعلان تجريبي — علامة خيالية» slate is visible from 13.10 to the end. | TASH tail + concept slate | **S5 continues**: light stays on, push-in continues to 15.60, the cup holds with its mark (no close, no sting, no slate) |

Hand-offs: S1 → S2 carry the steam. S3 → S4 carry the downward motion (the stream lifts away, the beans fall). S4 → S5 go from a bean at rest
to a cup at rest that then moves. The light bars run through every shot (one light logic), and the blinds that open
the film also close it.

---

## On-screen text (proofread twice)

| Time | Text | Notes |
|---|---|---|
| 2.45–4.15 | **قهوتك…** | paper `#EFE6D8` on the dark room, 150 px Alexandria 300. The ellipsis sits on the left (end of the RTL line) |
| 4.55–6.94 | **على مهلك.** | paper, 140 px, lower frame (in shade); the full stop sits at the left end |
| 7.70–9.76 | **حبّة…  حبّة.** | paper, 150 px, lower frame; each word drops in as its bean lands. Shadda on ب in both |
| 10.80–13.10 | mark **حبّة** + HABBA + SPECIALTY COFFEE | roasted `#4A2F23` on the sunlit wall |
| 13.10–15.60 | `CONCEPT AD — 03 / COFFEE` · **إعلان تجريبي — علامة خيالية** | TASH slate (JetBrains Mono / IBM Plex Sans Arabic) |
| 13.00–15.60 | **طشّ** · **خلّهم يسولفون عنك!** · @tash.creative.kw | TASH signature |

Arabic is animated per word only (a feathered mask travelling right→left, or a soft drop with unblur) and never split into letters.
There are no claims, prices, numbers or reviews.

---

## Sound (all original, `src/audio.py` → `src/audio.wav`, engine `_system/audio/tashaudio.py`)

Warm lo-fi at **85.714 BPM** (1 beat = 0.7 s = 21 frames, so cuts land on beats). Rootless e-piano chords use a local
FM voice: 1:1 bark into sine, a tine attack and a slow stereo tremolo. The progression is Gmaj9 → F#m11 → Em9 →
A7sus4 → **Dmaj9, which resolves on the end card**. Under it: a round sine bass, a gentle swung mirwas groove
(dum/tak + shaker) and vinyl crackle from frame 0.

| Time | Cue |
|---|---|
| 0.00 | vinyl crackle + the first chord, low-passed (dark) and hushed (−7 dB, rising to full by 2.6 s) |
| 0.26 | **blinds open**: a ripple of slat clicks over a soft air swish; the keys' low-pass opens 0.25 → 1.6 s with the light; a faint shimmer as the room fills |
| 2.50 · 3.20 | two soft plucks answer «قهوتك…» (A4 → F#4); music dips 2 dB while it reads |
| 2.80 | groove and bass enter (mirwas dum/tak, swung 16ths, a round sine bass) |
| 4.15–6.65 | **milk pour** (synth pour, low-passed, thinning as the stream lifts) |
| 7.00–9.80 | the music hushes −5 dB and the groove thins out for the slow motion. **Bean taps at 7.70 and 8.40** (tick + small wooden knock, each with a bounce 0.42 s later), and a pluck **D5 on each landing**: the same note twice, «حبّة… حبّة.». Soft out-of-focus taps behind |
| 9.90–11.20 | the music comes back up as the cup turns; its foot slides on the saucer (very soft ceramic scrape); a 5 dB dip just before the clink |
| **11.20** | **hero: the ceramic clink** on the downbeat of the Dmaj9 resolve |
| 11.50 | a small tap as the bean drops into the mark |
| 12.75 | blinds close (slat ripple); the music bows out −15 dB into the tail |
| 13.00 | `sonic_logo()`: ticks → whoosh → **طشّ hit at 14.12** → shadda pop |

Arc: hushed intro → groove → slow-motion hush → fuller resolve → near-silence → the TASH hit (WAV LRA 3.8 LU).
Master: pre-mastered to −14 LUFS, true peak ≤ −1.5 dBTP; the renderer's loudnorm then sets the final level.

---

## Files

- `HABBA-concept-9x16.mp4`: the final with audio
- `poster.png`: designed cover (1080×1920): a small TASH pill + `CONCEPT AD — 03 / COFFEE` + «إعلان تجريبي — علامة خيالية», the HABBA mark, HABBA, «قهوتك… على مهلك.», and the cup with its mark in the sun (`?poster=1`)
- `still-hero.png`: the best clean frame (`?clean=1`)
- `contact-sheet.png`: 2 fps
- `src/`: `index.html` · `main.js` (renderer, light, post) · `scene.js` (world, materials, steam, latte, DOF/grade) ·
  `shots.js` (frameSpec(t)) · `overlay.js` (type, end card, slate, tail) · `poster.js` · `sting-short.js` (local
  damped variant of `_system/motion/endcard.js`) · `habba-logo.mjs` + `habba-logo-data.mjs` + `tools/build_logo.py` ·
  `cues.json` · `audio.py` → `audio.wav`

URL params: `?clean=1` gives pure footage on the same timeline · `?poster=1` gives the cover · `?t=…` / `?play` give a preview.
