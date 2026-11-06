# STAKK — «ستاك برجر» · Concept ad 02 / Burger

> **إعلان تجريبي — علامة خيالية.** STAKK BURGER is a fictional brand made up for this concept. No real restaurant, product, price or claim.
> Made by طشّ | TASH Creative to show the craft. All visuals are procedural Three.js CGI, all type is live Chromium text from OFL fonts, and all sound is synthesised with `_system/audio`.

| | |
|---|---|
| Format | 9:16 · 1080×1920 · 30 fps · H.264 + AAC 48 kHz · 13.8 s |
| File | `STAKK-concept-9x16.mp4` (final, with audio) |
| Clean plate | `src/index.html?clean=1` renders the **same timeline** with no text, slates, UI, end card or signature (pure footage). From 10.4 s onward it keeps rolling the hero turntable, so editors get 3.4 s of extra hero handle. |
| Source | `src/index.html` + `src/scene.js` (3D shots) + `src/overlay.js` (type / end card / signature) + `src/lib/*` (burger, world, post) · `src/cues.json` (timing shared by picture and sound) · `src/audio.py` → `src/audio.wav` |

---

## 1. الفكرة · The idea

**«كل طبقة لها سالفة»** (every layer has a story).

Arabic: البرجر ما ينبني مرة وحدة. كل طبقة تنزل على الإيقاع ومعاها سالفتها القصيرة. الإعلان كله «تجميع» برجر على الدقّة: كل ما نزلت طبقة تطلع كلمة تشرح ليش هي هني. والإيقاع نفسه يحكي القصة: سريع، بعدين يهدّي مع الجبن («على مهله»)، بعدين ينفجر بالدبل.

English: a smash burger built live, one layer per beat. Each layer lands with its own sound and its own one-line story, pinned to it by a tracked callout line. The edit is the joke. Everything is fast and punchy until the cheese, where the cut slows to half-time to match the copy «تشيدر يذوب… على مهله» ("cheddar melting… taking its time"). Then the double drops in a burst of 8th notes. The title itself stacks like layers, word by word.

**Improvements over the brief idea:** a double smash stack (STAKK = stack, more crust on screen); the half-time melt beat; the title built as a stack of words; callout lines tracked to the 3D layers like an exploded product diagram; a wind-up before the smash (anticipation → impact).

## 2. القدرة اللي يثبتها · Capability shown

High-energy social ad: **rhythm editing** (cuts and drops locked to a 120 BPM grid, with a deliberate half-time section and a silence gap before the top bun), **kinetic Arabic typography** (animated per word, never per letter; stacked title; sticker labels with tracked leader lines), **stacking/exploded product animation** (9 layers with squash, settle, stack compression, cheese drape physics, sauce splat), **appetite appeal** (raking and rim light, glinting fat on the crust, glossy sauce, melting cheddar with drips, steam), and design **for the client**: their own palette (tomato red, mustard, cream, charcoal) and type, with TASH lime only in our signature.

## 3. Shot list (locked timings, seconds; beat k = 0.4 + 0.5·k)

| # | In → Out | Shot | Camera / action | On-screen text (hidden in `?clean=1`) | Sound |
|---|---|---|---|---|---|
| S01 | 0.00 → 0.90 | **SMASH** (hook) | Low macro on a black griddle. Raw beef ball, bokeh kitchen lights, steam wisps. The steel press winds up (0.00–0.22) and **slams at 0.40**: ball squashes into a lacy disc, grease spray, steam burst, camera shake, tilt down. | — | Griddle sizzle from frame 0 · press whoosh · **impact + sizzle burst + group clap at 0.40** · groove starts |
| S02 | 0.90 → 2.15 | CRUST + TITLE | High angle over the seared patty on the griddle, raking light, bubbling fat. **Whip-pan up 1.95 → 2.15** (sub-frame motion blur). | «كل» «طبقة» «لها» «سالفة» drop in on 16ths (0.900 / 1.025 / 1.150 / 1.275), stack like layers, exit with the whip | Four wooden "thocks" on the 16ths · Hijaz pluck tease · whoosh up |
| S03 | 2.15 → 3.90 | BUILD A (red stage) | Whip-in from below. **Heel lands 2.40**. **Patty 1 lands 3.40** (falls from 3.18). Slow push. | 2.40–3.30 «بريوش» / «محمّص بالزبدة» → heel · 3.40–4.30 «سماش…» / «أطرافه مقرمشة» → patty edge | Fall whoosh + low thud + tabl (heel) · thud + sizzle (patty) |
| S04 | 3.90 → 4.25 | INSERT crust edge | Macro slide along patty 1's lacy, glinting edge, shallow DOF, backlit steam (charcoal). | (patty label continues) | Close sizzle |
| S05 | 4.25 → 4.90 | BUILD B (red) | Other side of the stack. **Cheddar lands 4.40** and drapes under its own weight. | 4.40 «تشيدر يذوب» | Soft squish pop + thud + short pour |
| S06 | 4.90 → 5.75 | INSERT melt — **half-time** | Slow push on the front cheese corner folding over the patty; drip grows (charcoal, shallow DOF). | 4.90 «…على مهله» joins (till 5.75) | Groove drops to half-time: one dum, slow clap, long 808, pad · riser back in |
| S07 | 5.75 → 7.15 | BUILD C — double burst (charcoal) | 8th-note burst: **patty 2 at 5.90 · cheddar 2 at 6.15 · pickles at 6.40 · red onion at 6.65**. | 5.90–6.36 «دبل!» · 6.40–7.35 «مخلل وبصل…» / «يقرمشون» | Big thud + group clap + sizzle · squish · crunch · crunch |
| S08 | 7.15 → 7.90 | INSERT sauce | Top-down. Dollop falls, **splats at 7.40** with a splash; drips ooze over the rim. | 7.40–8.30 «صوص ستاك» / «السرّي» | Whoosh down · splat pop + pour |
| S09 | 7.90 → 8.40 | WIDE — top bun | Pull back. Snare roll, then **silence 8.15–8.40**; crown falls from 8.15. | (sauce label exits) | Riser + snare roll → gap |
| S10 | 8.40 → 10.40 | HERO turntable + offer | **Crown slams at 8.40** (match cut on impact into the low hero angle). Burger turns, steam breathes, slow push-in. | 8.55 «ستاك دبل» · 8.90 price badge «٢٫٧٥٠ د.ك» · 9.40 CTA «اطلب الحين ←» (button press on 9.90) | **Drop:** impact + group clap + tabl, full groove, Hijaz pluck hook · pop / bell on price · pop + click on CTA |
| S11 | 10.40 → 11.40 | CLIENT END CARD | Red. Burger mark builds (3 bars drop on 16ths), «ستاك برجر» + STAKK BURGER. | Slate from 10.55: «إعلان تجريبي — علامة خيالية» + `CONCEPT AD — 02 / BURGER` | Final hit + claps + D chord strum → **tape-stop 10.95–11.40** |
| S12 | 11.40 → 13.80 | TASH SIGNATURE | Official `createSting()` (typing dots → ش → طشّ) at a smaller logo size, played from sting time 0 to 2.4 s, so the dot behaviour and cues are untouched. | `TASH / 2026` · «إعلان تجريبي — علامة خيالية» · `CONCEPT AD — 02 / BURGER` · `@tash.creative.kw` | `sonic_logo()` at 11.40 (same cue file), faded out over the last 0.35 s |

Average shot length ≈ 1.15 s.

## 4. On-screen copy (Kuwaiti) — proofread

| Arabic | Gloss |
|---|---|
| كل طبقة لها سالفة | every layer has a story |
| بريوش · محمّص بالزبدة | brioche · toasted in butter |
| سماش… · أطرافه مقرمشة | smash… · its edges are crispy |
| تشيدر يذوب · …على مهله | cheddar melting · …taking its time |
| دبل! | double! |
| مخلل وبصل… · يقرمشون | pickles and onion… · crunching |
| صوص ستاك · السرّي | STAKK sauce · the secret one |
| ستاك دبل · ٢٫٧٥٠ د.ك · اطلب الحين | STAKK double · 2.750 KD (fictional price) · order now |
| ستاك برجر · STAKK BURGER | client logo (fictional) |

No claims, no "best in Kuwait", no reviews, no numbers except the fictional price. Arabic is animated per word or per line only.

## 5. Sound

Original 120 BPM track (`src/audio.py`, engine `_system/audio/tashaudio.py`). Kick and 808 in Hijaz-on-D (D–Eb movement); Khaleeji `claps_ensemble` on the backbeat plus the push on the "and" of 3 (3+3+2 feel); mirwas dum/tak pattern; 16th hats; oud-ish `pluck` hook in Hijaz in the drop. Every layer drop has its own SFX on the grid: thud, sizzle, squish, crunch, splat, impact. Sizzle runs from frame 0 under the hook. Silence is used twice on purpose: the half-time melt and the 0.25 s gap before the top bun. The music tape-stops into the TASH sonic logo. Loudness is normalised to −14 LUFS at mux.

## 6. Clean-plate notes (for the launch-ad editor)

- `?clean=1` hides: title, labels, leader lines, «دبل!», offer, CTA, end card, slates and the TASH signature. Shot timings are identical to the table above.
- 10.40 → 13.80 in the clean plate continues **S10 hero** (turntable + push-in), so there are no end-card frames in the footage.
- Film grain (opacity .05) is kept in the clean plate as part of the footage finish.
- Best clean hero still: `still-hero.png` (clean plate at 10.6 s, 8× jittered supersampling).

## 7. Production notes

- **3D:** Three.js r180 on SwiftShader, everything generated in code with seeded noise. Brioche crown/heel use displaced lathes with 2K baked-colour/bump/roughness maps; 330 instanced sesame seeds sit on the surface normal. The toasted cut faces are textured crumb. Smash patties are polar solids with craggy displacement, a matte sear, a separate wet/fat gloss map (clearcoat) and an alpha-cut lacy rim. Cheddar is a thick sheet that drapes under gravity (curvature beyond the patty edge), with rounded melted corners, blisters and growing drips. Pickles are crinkle-cut, red-onion rings use vertex colours, and the sauce is a dollop that morphs into a splat with drips and splash droplets. Raw beef and the press drive the hook.
- **Look:** hand-built softbox environments (PMREM), warm key, two rim lights, front fill card, shadow-catcher floor composited over the exact brand colour, ACES, depth-of-field gather on the macro inserts, grain .05.
- **Motion blur:** real sub-frame accumulation on falls, whips, the slam and splashes (4 sub-frames for solid layers, 10 for thin ones, 9 on the slam). Impact frames stay crisp, with a short cream flash on the smash and the top-bun slam.
- **Timing:** `src/cues.json` is the single source for picture and sound (shots, drops, text in/out, end card, signature).

## 8. Known weaknesses (honest)

- In the hero turntable the two cheddar drapes dominate, so the patties read as dark bands and their lacy edges barely show. Smaller slices would fix it but need a full re-render.
- The sauce reads as a glossy dollop, not a rich drizzle. Grease spatter in the hook reads as short golden dashes, not continuous streaks.
- Bread and cheese are stylised-real CGI. They are convincing at feed size but do not look like photography at macro distance.
- The whip-pan transition passes through ~2 near-black frames (camera tilting off the griddle) before the red stage.
