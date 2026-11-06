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
| S02 | 0.90 → 2.15 | CRUST + TITLE | High angle over the seared patty on the griddle (dark mahogany crust, cracks, fat glints), raking light, bubbling fat. **Whip-pan up 1.95 → 2.15** (sub-frame motion blur); the whip dips the frame into S03's tomato red from ≈1.97, so the cut lands on colour, not black. | «كل» «طبقة» «لها» «سالفة» rise into place on 16ths (0.900 / 1.025 / 1.150 / 1.275), stacking like layers without crossing each other, exit with the whip | Four wooden "thocks" on the 16ths · Hijaz pluck tease · whoosh up |
| S03 | 2.15 → 3.90 | BUILD A (red stage) | Whip-in from below. **Heel lands 2.40**. **Patty 1 lands 3.40** (falls from 3.18). Slow push. | 2.40–3.30 «بريوش» / «محمّص بالزبدة» → heel · 3.40–4.30 «سماش…» / «أطرافه مقرمشة» → patty edge | Fall whoosh + low thud + tabl (heel) · thud + sizzle (patty) |
| S04 | 3.90 → 4.25 | INSERT crust edge | Macro slide along patty 1's lacy, glinting edge, shallow DOF, backlit steam (charcoal). | (patty label continues) | Close sizzle |
| S05 | 4.25 → 4.90 | BUILD B (red) | Other side of the stack. **Cheddar lands 4.40** and drapes under its own weight. | 4.40 «تشيدر يذوب» | Soft squish pop + thud + short pour |
| S06 | 4.90 → 5.75 | INSERT melt — **half-time** | Slow push on the front cheese corner folding over the patty; drip grows (charcoal, shallow DOF). | 4.90 «…على مهله» joins (till 5.75) | Groove drops to half-time: one dum, slow clap, long 808, pad · riser back in |
| S07 | 5.75 → 7.15 | BUILD C — double burst (charcoal) | 8th-note burst: **patty 2 at 5.90 · cheddar 2 at 6.15 · pickles at 6.40 · red onion at 6.65**. | 5.90–6.36 «دبل!» · 6.40–7.35 «مخلل وبصل…» / «يقرمشون» | Big thud + group clap + sizzle · squish · crunch · crunch |
| S08 | 7.15 → 7.90 | INSERT sauce | Top-down. Dollop falls, **splats at 7.40** with a splash; drips ooze over the rim. | 7.40–8.30 «صوص ستاك» / «السرّي» | Whoosh down · splat pop + pour |
| S09 | 7.90 → 8.40 | WIDE — top bun | Pull back. Snare roll, then **silence 8.15–8.40**; crown falls from 8.15. | (sauce label exits) | Riser + snare roll → gap |
| S10 | 8.40 → 10.40 | HERO turntable + offer | **Crown slams at 8.40** (match cut on impact into the low hero angle). Burger turns, steam breathes, slow push-in. | 8.55 «ستاك دبل» · 8.90 price badge «٢٫٧٥٠ د.ك» · 9.40 CTA «اطلب الحين ←» (button press on 9.90) | **Drop:** impact + group clap + tabl, full groove, Hijaz pluck hook · pop / bell on price · pop + click on CTA |
| S11 | 10.40 → 11.40 | CLIENT END CARD | Red. **Match cut:** frame 1 of the card shows the burger mark at the hero burger's size and position, layers slightly exploded; it flies up and closes into the lockup (0.5 s, outExpo), then «ستاك برجر» + STAKK BURGER (charcoal); slow scale drift keeps the hold alive. | Slate from 10.55: «إعلان تجريبي — علامة خيالية» + `CONCEPT AD — 02 / BURGER` | Final hit + claps + D chord strum → **tape-stop 10.95–11.40** |
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

Original 120 BPM track (`src/audio.py`, engine `_system/audio/tashaudio.py`). Kick and 808 in Hijaz-on-D (D–Eb movement); Khaleeji `claps_ensemble` on the backbeat plus the push on the "and" of 3 (3+3+2 feel); mirwas dum/tak pattern; 16th hats; oud-ish `pluck` hook in Hijaz in the drop. Every layer drop has its own SFX on the grid: thud, sizzle, squish, crunch, splat, impact. Sizzle runs from frame 0 under the hook. Silence is used twice on purpose: the half-time melt and the 0.25 s gap before the top bun. The music tape-stops into the TASH sonic logo. A gentle −3.5 dB low shelf (110 Hz) sits on the music bus only, because phones can't play the 808's sub and it was eating the loudness budget. The hero impacts keep their full sub. Loudness is normalised to −14 LUFS at mux.

## 6. Clean-plate notes (for the launch-ad editor)

- `?clean=1` hides: title, labels, leader lines, «دبل!», offer, CTA, end card, slates and the TASH signature. Shot timings are identical to the table above.
- 10.40 → 13.80 in the clean plate continues **S10 hero** (turntable + push-in), so there are no end-card frames in the footage.
- Film grain (opacity .05) is kept in the clean plate as part of the footage finish.
- S02's last frames (≈1.97 → 2.15) are the whip: the frame blurs upward and dips into tomato red. For a clean crust shot, cut S02 before 1.95.
- Leader lines and labels are overlay only; none of the ECD look changes moved a shot boundary or a drop time (cues.json unchanged).
- Best clean hero still: `still-hero.png` (clean plate at 10.6 s, 8× jittered supersampling).

## 7. Production notes

- **3D:** Three.js r180 on SwiftShader, everything generated in code with seeded noise. Brioche crown/heel use displaced lathes with 2K baked-colour/bump/roughness maps; 330 instanced sesame seeds sit on the surface normal. The toasted cut faces are textured crumb. Smash patties are polar solids with craggy displacement plus fine crags. The crust map is deep mahogany: caramelised nubs, dark cracks, char flecks and sparse wet-fat glints in the clearcoat map, with no sheen veil. The rim is an alpha-cut lace with lighter, crisp filaments. Cheddar (1.9-unit slices, so both patties' lacy edges show between the corners) is a thick sheet that drapes under gravity, with rounded melted corners and growing drips. Each drip is one teardrop that grows a neck as it lengthens, with the bulb staying round. Pickles are crinkle-cut, red-onion rings use vertex colours, and the sauce is a dollop that morphs into a splat with drips and splash droplets. Raw beef and the press drive the hook.
- **Look:** hand-built softbox environments (PMREM), warm key, two rim lights, front fill card, shadow-catcher floor composited over the exact brand colour, ACES, depth-of-field gather on the macro inserts, grain .05.
- **Motion blur:** real sub-frame accumulation. Falls get a sub-frame count from their on-screen smear (108° shutter, echo spacing ≤ ~11 px, up to 10 sub-frames), so they blur instead of stepping into ghost copies. Other counts: 12 on the fastest whip frames, 28 on the slam's contact frame (16 on either side), 8 on the sauce splat. Impact frames stay crisp, with a short cream flash on the smash and the top-bun slam. Grease and sauce droplets stretch to at least one sub-frame step, so they read as streaks, not beads.
- **Transitions:** the S02 whip-out dips into S03's red. The S10 → S11 cut is a match cut: the client mark is born at the hero burger's size and position, then flies into the lockup. A falling heel's floor shadow softens with height, so the first drop no longer punches a black hole into the red.
- **Timing:** `src/cues.json` is the single source for picture and sound (shots, drops, text in/out, end card, signature).

## 8. Known weaknesses (honest)

- Bread and cheese are stylised-real CGI. They are convincing at feed size but do not look like photography at macro distance. The cheddar reads as processed slices, which is correct for a smash burger but not luxurious.
- The patties' lacy rims are an alpha-cut sheet (no MSAA). At the low side angles of the build and hero shots they read as ragged, crispy fringes rather than a delicate lace.
- The sauce reads as a glossy orange dollop with relish flecks, not a drizzle. The onion rings are cleaner than real sliced onion.
- After the whip-out, about 0.2 s (≈2.10–2.30) is near-empty tomato red before the heel falls in. The heel's landing is locked to the beat at 2.40.
- Shadows of high-flying layers after the heel still show as soft dark ellipses on the red floor for a few frames.
- The mix is still sub-forward (808 + kick) with an LRA of about 3 LU, which is typical for social but not very dynamic.

## 9. Review log (ECD pass, independent of the builder)

| Found (timestamp) | Change | Result |
|---|---|---|
| 0.9–2.15, 3.4–4.25: patty read as orange smoke or leopard print (sheen veil, smash-steam fog over the top-down shot, low-frequency crust) | new crust map (dark mahogany, caramel nubs, cracks, char flecks, fat glints), no sheen, the smash puff kept to S01, per-shot bump strength | S02 and S04 read as seared crust; hero shows two crispy patties |
| hero/poster: cheese hid both patties | slices 2.12 → 1.9 | patty edges show between the drooping corners |
| 4.9–5.75 melt insert: drip looked like a chess pawn with a flat cap | new teardrop drip (closed root, smooth neck/bulb) for cheese and sauce | the drip grows a neck as it lengthens |
| 2.33, 5.67, 7.43: falls stepped into 4 ghost copies | smear-driven sub-frame count, 108° shutter on falls | smooth blur, crisp landings |
| 2.0–2.15: whip went to near-black | the whip dips into S03's red | the cut lands on colour |
| 1.30: «سالفة» crossed «لها» while dropping in | words rise into the empty slot below | no text-over-text |
| 4.0, 5.3: leader line/ring landed on the label, or ran off-frame | leader lines only in wide shots | — |
| 10.33–10.5: flat red frame with a small yellow bar | match cut: the mark is born at the burger's size and position | the end card has a cause |
| STAKK BURGER in mustard on red (2.4:1) | charcoal | legible |
| poster slate at 1590–1720 (under reel UI / grid crop) | slate inside the safe area, compact | — |
| heel cut face showed a red hairline at its rim | face closed to the crust | — |
| 0.5: grease spray as beaded dashes | streaks at least one sub-frame step long | continuous streaks |
| raw ball read as a peach; pickles read as fresh cucumber | darker lean red with chunkier strands; pickled olive palette, tan seeds | — |
| mix: sub band ≈ full band | −3.5 dB low shelf on the music bus | mids and highs +1.3 dB relative |
| 0.40 (hook contact frame): press plate stepped into ~6 ghost plates | 28 sub-frames on the contact frame, 16 either side | one continuous smear |

**How the final was made (ECD pass):** one full re-render of the current source as two single-worker segments (0–5 s, 5–13.8 s), plus a re-render of 0–1.0 s after the slam fix. Frames 1.0–5.0 were re-encoded once with the renderer's x264 settings (crf 14). The segments were concatenated (identical SPS/PPS) and muxed with the renderer's two-pass linear loudnorm. Measured on the delivered file: 414 frames, 1080×1920, 30 fps, H.264 High, AAC 48 kHz; −14.0 LUFS integrated, −1.2 dBTP, LRA 2.8 LU. No freezes ≥0.6 s. Brightness across the splice points changes by less than 2/255 per frame; the only large frame-to-frame changes are planned cuts and the one-frame impact flash. The strongest onset of each hit is within one frame (5–18 ms) of its drop: smash, heel, patty, patty 2, pickles, sauce, crown, end card and sting snap. The cheese squishes and the onion crunch are multi-grain sounds that start on the drop and peak 24–42 ms later.
