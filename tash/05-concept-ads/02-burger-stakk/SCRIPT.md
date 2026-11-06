# STAKK — «ستاك برجر» · Concept ad 02 / Burger (photoreal cut)

> **إعلان تجريبي — علامة خيالية.** STAKK BURGER is a fictional brand invented for this concept. No real restaurant,
> product, price or claim. Made by طشّ | TASH Creative to show the craft.
>
> **Footage: AI-generated with Higgsfield (GPT Image 2.6 start frames → Kling 3.0 Turbo), art-directed and approved by TASH. Edit, type, sound design and signature by TASH.**
> The owner approved Higgsfield for this ad after judging the CGI version «كرتوني مو حقيقي». The CD generated and approved
> the seven clips in `footage/ai/`; the edit team did not generate anything.
> `footage/ai/` also holds `b1_smash_v2.mp4` and `b1_smash_v3.mp4` (and their start frames in `footage/ai/frames/`), which
> appeared on 2026-11-06 at 19:15 and 19:18 during the ECD review. No notes or job ids came with them, so they are not
> listed below, and this cut does not use them. All type is live Chromium text from OFL fonts,
> and the score and sound design are synthesised with `_system/audio`.

| Shot | Image job (start frame) | Video job |
|---|---|---|
| b1 smash | cce37c0b-16d9-4ebf-9311-f19b9b042617 | 80e1d8d0-9051-4e3f-a4ec-f14764bb1ef6 |
| b2 crust | ccf1c92d-105f-4aa1-af87-a745454893bd | 21783c54-54eb-469c-8740-0722b8cd65e8 |
| b3 heel | 9e3dd31f-fb02-41ae-ad6c-2310949fc4b2 | ff8b7e30-e12b-4e4a-9ba6-fc61dc6094a7 |
| b4 melt | a61e78e2-61a3-486b-a1c7-936ea2ccbe22 | a8d0f2d0-0b1c-441f-96a1-e25f5680e1cc |
| b5 stack | eead7c0e-2dd8-4f1e-a0f8-961580c95532 | bcfec400-f017-4460-9dfe-a64b7b126109 |
| b6 sauce | bd8c31bf-e6d9-4cd3-8a91-fa17ffd59959 | aa36060b-44ba-47cb-9168-d52d45f237f9 |
| b7 crown | 621fc520-a580-4775-a8d7-b2d49b49e00f | f7ee3a67-011f-44e4-baf4-61825934d7d2 |

| | |
|---|---|
| Format | 9:16 · 1080×1920 · 30 fps · H.264 + AAC 48 kHz · 13.8 s |
| File | `STAKK-concept-9x16.mp4` (final, with audio) · `poster.png` (reel cover) · `still-hero.png` (clean hero frame) · `contact-sheet.png` |
| Clean plate | `src/index.html?clean=1` renders the **same timeline** with no type, slates, end card or sting. From 10.40 it keeps rolling the hero to 13.80. Ranges for the launch ad: `footage/HANDOFF-launch.md` |
| Source | `src/index.html` + `src/main.js` (picture: footage, cameras, whip) + `src/overlay.js` (type, end card, slates, signature) + `src/footage.js` (frame loader) · `src/edl.json` (in-points, speeds, framing) → `src/tools/extract.sh` / `conform.py` → `src/footage/<seq>/` (graded 30 fps JPEGs) · `src/cues.json` (timing shared by picture and sound) · `src/audio.py` → `src/audio.wav` |
| Kept for reference | `src/_cgi-v1/` = the Three.js version (scene, lib, its overlay/index, SCRIPT-v1, audio-v1). Not loaded by the film |

---

## 1. الفكرة · The idea (unchanged)

**«كل طبقة لها سالفة»** (every layer has a story).

البرجر ما ينبني مرة وحدة. كل طبقة تنزل على الإيقاع ومعاها سالفتها القصيرة: سريع، بعدين يهدّي مع الجبن («على مهله»)، بعدين ينفجر بالدبل.

A smash burger built live, one layer per beat. Each layer lands with its own sound and a one-line story pinned to it by a
leader line. Everything is fast until the cheese, where the cut drops to half-time for «تشيدر يذوب… على مهله», then the
double lands in a burst of cuts, the crown slams, and the offer holds.

## 2. القدرة اللي يثبتها · Capability shown

Rhythm editing of real-looking food footage: every physical event (press contact, patty, cheddar, pickle, onion, sauce,
crown) is retimed to land on its beat. Speed ramps and frame-accurate in-points, one shared grade across seven clips
(the red stage is pulled to the client's exact red, the blacks are matched), motivated transitions (a whip that drops the heel
onto its beat, cuts on contact, a graphic match cut into the logo), and kinetic Arabic type placed only on calm ground with
leader lines that touch the real object. Designed for the client: their palette (tomato red, mustard, cream, charcoal) and type.
TASH lime appears only in our signature.

## 3. Shot list (cue grid locked; beat k = 0.4 + 0.5·k)

Speeds are source seconds per edit second. "f" = source frame (24 fps). Every event frame is shown crisp (no blend).

| # | In → Out | Source · in-point · speed | Picture / edit | On-screen (hidden in `?clean=1`) | Sound |
|---|---|---|---|---|---|
| S01 | 0.00 → 0.90 | `b1_smash` 0.77 s (f18) → 1.56 · 1.1× into the hit, 1.25× one-to-one through the compression (f29 → f33, 0.40–0.53), then 0.5× frame-blended steam | Gloved steel press over a raw ball on a black griddle; **contact f29 on 0.40**; +3.5 % punch and 11 px shake (τ 55 ms); slow push | — | sizzle from frame 0 · press whoosh · **impact + sizzle burst + group clap 0.40** |
| S02 | 0.90 → 2.15 | `b2_crust` 0.80 s (f19) → 2.05 · 1.0× | Top-down seared crust, fat bubbling. Frame lowered 450 px into a dark falloff so the title sits on griddle, not crust. **Whip 1.95 →**: the red stage rides in above the plate with a vertical smear sized to the per-frame travel | «كل» «طبقة» «لها» «سالفة» rise into four stacked slots on 16ths (0.900 / 1.025 / 1.150 / 1.275) and ride the whip out (vertical blur) | four wooden thocks · Hijaz pluck tease · whip whoosh |
| S03 | 2.15 → 3.90 | `b3_heel` f0 held under the whip (the source opens on a locked-off bun) · 0.5× · then 1.25× for the fall | The whip lands the camera on the heel **at 2.40** with a short bounce. The heel "drops" onto its beat. The patty enters at 2.89 and **lands f21 on 3.40**; nearest frames (1.25× = one source frame per output frame) | 2.40 «بريوش» / «محمّص بالزبدة» (left, above the heel; exits 3.12–3.26, before the falling patty reaches its band) · 3.40 «سماش…» → leader to the patty · 3.62 «أطرافه مقرمشة» | fall whoosh + thud + tabl 2.40 · 0.45 s fall whoosh + thud + sizzle 3.40 |
| S04 | 3.90 → 4.25 | `b2_crust` 3.00 s (f72) → 3.33 · 1.0× · **1.6× punch-in** | Macro on the patty's crispy lace and bubbling fat, slow lateral slide | the crisp claim's leader lands on a real lace tip; label out by the S05 cut | close sizzle |
| S05 | 4.25 → 4.90 | `b3_heel` 3.13 s (f75) → 3.93 · 1.25× for the fall (f75–f78), **jump f78 → f83** across the contact, then 1.0× | Cheddar slice falls (real motion blur) and slaps down flat: **lands f83 on 4.40** (source f79–f82, an AI ghost double of the slice, are never shown) | 4.40 «تشيدر يذوب» → leader to the slice corner | soft squish pop + thud + short pour |
| S06 | 4.90 → 5.75 | `b4_melt` 4.53 s (f108) → 4.95 · **0.5×**, frame-blended | **Half-time**: cheddar folded over a lacy edge, the drip grows down the brioche; slow push toward the drip | 4.90 «…على مهله» joins (leader to the drip) | groove drops to half-time: one dum, slow clap, long 808, pad · riser back in |
| S07 | 5.75 → 6.55 | `b5_stack`, two cuts: **a** 0.00 s (f0) → 0.31 at 0.5× · **b** 2.25 s (f54) → 2.38 (f57) at 1.0× | **a** the finished double stack, punch-ins on 5.90 («دبل!») and 6.15 (cheese2). **b** cut on contact: the centre pickle lands **f54 on 6.40**, the first onion ring touches a pickle **f57 on 6.533**, and the shot cuts on that frame (from f58 the ring hovers, AI) | 5.90–6.36 «دبل!» · 6.40 «مخلل وبصل…» → leader to a pickle · 6.525 «يقرمشون» (both ride the cut into S08) | thud + group clap + sizzle 5.90 · squish 6.15 · crunch 6.40 · **onion crunch 6.525** (was 6.65, see §5) |
| S08 | 6.55 → 7.90 | `b6_sauce` 0.00 s (f0) → 1.39 (f33) · ≈0.85× blended on the still plate, 1.25× one-to-one for the pour, 1.0 → 1.2× after contact | **One top-down take on red**: pickles and onion rings lying flat (6.57–7.00), then the sauce enters the top of frame at 7.00, **makes contact f21 on 7.40** and pools; slow push that grows from the top | «مخلل وبصل… / يقرمشون» stays across the cut, leader re-targets to the flat left pickle, exits 7.01–7.15 (the sauce reaches the label's band ≈7.17) · 7.40 «صوص ستاك» / «السرّي» (left of the stream) → leader to the pool; exits 8.06–8.20, before the crown falls through | **stream from 7.00** (`sauceIn`) · **thick plop on contact 7.40** · glossy pour |
| S09 | 7.90 → 8.40 | `b7_crown` 0.165 s (f4) → 0.79 · 1.25× | The finished stack on red; the sesame crown falls into frame at 8.17 (silence 8.15–8.40) | — | riser + snare roll → gap · crown fall whoosh |
| S10 | 8.40 → 10.40 | `b7_crown` 0.79 s (f19) → 2.44 · 0.85 → 0.8×, frame-blended | **Crown lands f19 on 8.40**: +4 % punch and 11 px shake, then a slow hero push, steam | all in the red band above the crown, never on the food: 8.55 «ستاك دبل» · 8.90 badge «٢٫٧٥٠ د.ك» · 9.40 CTA «اطلب الحين ←» (press on 9.90) | **drop**: impact + group clap + tabl, full groove, Hijaz pluck hook · pop/bell on price · pop + click on CTA |
| S11 | 10.40 → 11.40 | graphic | **Match cut**: frame 1 of the client card draws the burger mark exactly over the real burger's silhouette (x 33–1079, y 598–1606 on the last hero frame), then it flies up into the lockup (0.5 s outExpo) | «ستاك برجر» + STAKK BURGER · slate from 10.55: «إعلان تجريبي — علامة خيالية» + `CONCEPT AD — 02 / BURGER` | final hit + claps + D chord → tape-stop 10.95–11.40 |
| S12 | 11.40 → 13.80 | graphic | Official `createSting()` (typing dots → ش → طشّ), smaller logo, sting time 0.1 → 2.5 s (`stingOffset`: the cut lands on the typing bubble, not on two empty Ink frames) | `TASH / 2026` · «إعلان تجريبي — علامة خيالية» · `CONCEPT AD — 02 / BURGER` · `@tash.creative.kw` | `sonic_logo()` from its 0.1 s point at 11.40 (same offset as the picture; its bubble pop re-placed on the cut), faded over the last 0.35 s |

Clean plate only: 10.40 → 13.80 continues S10 (`b7_crown` 2.44 → 4.98 s, 0.8 → 0.7×).

## 4. On-screen copy (Kuwaiti), proofread twice at full size

| Arabic | Gloss | On screen |
|---|---|---|
| كل · طبقة · لها · سالفة | every layer has a story | 0.90–2.15 |
| بريوش · محمّص بالزبدة | brioche · toasted in butter | 2.40–3.26 |
| سماش… · أطرافه مقرمشة | smash… · its edges are crispy | 3.40–4.25 |
| تشيدر يذوب · …على مهله | cheddar melting · …taking its time | 4.40–5.75 |
| دبل! | double! | 5.90–6.36 |
| مخلل وبصل… · يقرمشون | pickles and onion… · crunching | 6.40–7.15 |
| صوص ستاك · السرّي | STAKK sauce · the secret one | 7.40–8.20 |
| ستاك دبل · ٢٫٧٥٠ د.ك · اطلب الحين ← | STAKK double · 2.750 KD (fictional price) · order now | 8.55–10.40 |
| ستاك برجر · STAKK BURGER | client logo (fictional) | 10.60–11.40 |
| إعلان تجريبي — علامة خيالية · CONCEPT AD — 02 / BURGER | concept slate | 10.55–13.80 |

Same words as the CGI version. No claims, no "best in Kuwait", no reviews, no numbers except the fictional price. Arabic is
animated per word (never per letter); ellipses and «!» sit on the RTL end, «…على مهله» leads with its ellipsis (it continues
«تشيدر يذوب»), and the shadda in «محمّص» and «السرّي» is checked. Two hero lines wrap to two lines because at 126 px they're
wider than the 936 px safe width («محمّص بالزبدة» 983 px, «أطرافه مقرمشة» 1074 px, measured with HarfBuzz).

## 5. Sound

Same original 120 BPM score as the CGI cut (`src/audio.py`, engine `_system/audio/tashaudio.py`): Hijaz-on-D 808 and kick,
Khaleeji `claps_ensemble` with the 3+3+2 push, mirwas dum/tak, 16th hats, oud-ish pluck hook, half-time for the melt, a
0.25 s silence before the crown, tape-stop into the TASH sonic logo. Only three SFX changed, where the picture changed
(plus the ECD-review offset of the sonic logo, below):

- **Patty (3.40):** its fall whoosh runs 0.45 s (was 0.25) because the real patty falls for 0.5 s on screen.
- **Onions:** the crunch moved from 6.65 to **6.525** (one 16th earlier, same grid). In the footage the first ring lands
  three source frames after the pickle. Stretching that gap to 0.25 s needed 0.5×, which either stuttered the ring
  (nearest frames) or doubled it (blends). `cues.json` → `drops.onions` and its `_onions` note.
- **Sauce (7.40):** the CGI dollop's whoosh + splat became a pour. A thin stream sound starts when the sauce enters the
  top of frame (7.00, `cues.json` → `sauceIn`; S08 now opens at 6.55 on the still top-down plate), then a thick low plop on
  contact, then a glossy pour into the pool.
- **Sonic logo (ECD review):** the sting picture starts 0.1 s in (`stingOffset`), so `audio.py` starts `sonic_logo()` 0.1 s in
  too (5 ms fade-in on the trimmed head) and re-places its bubble pop on the 11.40 cut. Typing ticks now sit at 11.48 / 11.64 / 11.80,
  on the dot peaks.

Mixed by `audio.py` to −14.0 LUFS (true peak −1.9 dBTP); the renderer's two-pass loudnorm muxes it at −14 LUFS.

## 6. Footage pipeline and grade

`bash src/tools/extract.sh` (→ `conform.py`) rebuilds `src/footage/` from `footage/ai/*.mp4` and `src/edl.json`. It writes only
the frames the edit uses: 429 graded JPEGs at 1080×1920 and q:v 3, 66 MB. Then `manifest.json` maps every edit frame to its
source frame(s).

- **Decode:** BT.709, tv range → full-range RGB (the clips are BT.709; decoding them as BT.601 had made the red look crimson).
- **Retime:** each sequence is a cubic Hermite through `[edit t, source t, speed in, speed out]` keys, so ramps are smooth and
  measurable. Event frames are always shown crisp. Calm or slow content blends the two neighbouring source frames in linear
  light (S01 once the press is down, the near-static crust S02/S04, S03's bun before the drop, S05 after the landing, S06, S07a,
  S08's still plate, S10). Anything that falls or moves fast uses nearest frames (the S01 compression, the S03 patty drop, the
  S05 slice, S07b, the S08 pour, S09). AI glitch frames are skipped outright (S05 jumps f78 → f83).
  At 1.25×, 24 fps maps one-to-one onto 30 fps.
- **Framing:** a single Lanczos resample per frame (cover crop, punch-ins 1.18–1.6×). The page adds a 1.02–1.07 overscan
  (1.03 base; it hides AI edge artefacts), slow pushes, two impact shakes (smash and crown only) and the whip.
- **Grade (one for all seven clips):** (1) a per-clip black match measured on a clean reference frame (0.5th percentile → 10/9/7);
  (2) a shared look: saturation 0.93 (AI clips run hot), a gentle S-curve, and highlights rolled off toward the client cream
  (white → ≈245/240/225, never pure white); (3) a red-stage secondary on b3/b6/b7 that pulls the seamless to `#E23B2E`.
  Measured after grading: stage red (225–226, 58–59, 45–46) on S03, S09 early, mid and late. Dark-clip 0.5th percentiles
  (7–15, 7–10, 3–7). Grain .04 and a constant vignette (−20 % at the corners, also over the client card, so the match cut
  keeps its corners).

### Events: CD notes vs measured (frame by frame, at full resolution)

| Clip | CD note | Measured / used | Note |
|---|---|---|---|
| b1 smash | contact ≈1.21 s | f28 touches, **f29 (1.208 s)** compresses → on 0.40 | ✓ · f30–f32 carry heavy AI motion smear (a doubled press rim): shown one-to-one, never blended at slow speed |
| b3 patty | lands ≈0.875 s | **f21 (0.875 s)** → 3.40 | ✓ |
| b3 cheddar | lands ≈3.375 s | f79–f82 are a **ghost duplicate**: a flat slice already lies on the patty while the falling slice is still above it, then a translucent bump as one morphs into the other. **f83 (3.458 s)** is the first clean flat frame → 4.40 | glitch not in the notes; the edit jumps f78 → f83 (ECD review) |
| b5 pickles | first land ≈1.50 s | f37 (1.54 s) lands, but **f22–f35 a pickle hovers and drifts up** and **f38–f48 a pale upright disc morphs into a pickle**. Used the centre pickle **f54 (2.25 s)** → 6.40 | glitches not in the notes; avoided |
| b5 onions | land ≈2.2–2.35 s | first ring touches a pickle on **f57 (2.375 s)** → 6.533; from f58 **it hovers above the pickles** with air under it, a second wave falls f61–f73, and the rings end **propped at impossible angles** (f80 on). S07 cuts on f57 to the b6 top-down, where the rings lie flat | the suggested 1.1–1.3× ramp couldn't hit both cues (0.75 s of source in 0.25 s of edit would need 3×) |
| b6 sauce | first touches ≈0.75 s | f0–f8 a still plate (pickles + rings flat); the blob enters the top on **f9 (0.375 s)** → 7.00; at 0.75 s it is still above the onion; **contact f21 (0.875 s)**, spreads f22 → 7.40 | 3 frames later than the note |
| b7 crown | lands ≈0.79 s | f18 touches (blurred), **f19 (0.792 s)** landed → 8.40 | ✓ |

**Rejected:** ffmpeg `minterpolate` (mci/aobmc/bidir) on the b5 falls. Every in-between frame warped (a half-transparent
pickle, torn and fogged ring interiors). Plain frame blending doubled the falling pickles, rings and cheddar. Falls are now
nearest-frame only.

## 7. Clean-plate notes (launch-ad editor)

- `?clean=1` hides the title, labels, leader lines, «دبل!», offer, CTA, end card, slates and the TASH signature. The cue
  table above is identical, including the S07 inner cut (6.40), the S07 → S08 cut (6.55, on the onion's contact frame) and
  the whip (1.95–2.40).
- The finish (grade, vignette, grain .04, punch and shake on the smash and the crown) stays in the clean plate.
- The best BURGER range for the launch ad is **clean 7.90 → 9.40** (crown slams at 8.40 = 0.5 s in), the same range as
  before, so the launch cues stay valid. More ranges and their source seconds: `footage/HANDOFF-launch.md`.
- `still-hero.png` = clean frame at 11.60 (b7 source ≈3.38 s).

## 8. Known weaknesses (honest)

- **It is AI footage.** At full size the brioche and cheddar read as real. Some tells remain, and the edit routes around
  them rather than hiding them completely. The S03 patty falls as a streaky AI smear (3.13–3.37, about 8 frames at
  real speed), and on 3.33 the heel's top goes olive under it (the patty's shadow, rendered oddly). In S07b the ring
  touches the pickle at a tilt on the cut frame (6.53). The S05 slice reaches the patty in one frame (f78 → f83, the
  ghost frames skipped), which reads as a hard slap. The b3 patty is a regular round patty, not a lacy smash patty,
  so the crisp claim is shown on b2's lace (S04), not on it. The b2 crust's texture is a little too even, pebbly and
  'perfect' at full size.
- **Three burgers, three sets.** The build is the b3 single on the red stage, the melt and the double on charcoal (b4, b5),
  then the top-down and the hero back on red (b6, b7). The cuts are on action and the grade matches, but a careful eye can
  see these are different burgers.
- **S02 is composited.** The frame is lowered 450 px, and the top quarter is a synthetic dark falloff (the griddle's own
  edge tone, darkened), so the stacked title sits on calm ground. It reads as the light pool ending, but it is not
  photographed. The b2 crust also shows pink, under-seared patches (it's the raw side up).
- **S03 holds source frame 0 for 0.47 s** under the whip (1.93–2.40). The source opens on a locked-off bun, so the hold is
  invisible under the smear, but it is outside the 0.5–1.25× rule.
- **S04 is a 1.6× punch-in on 1080p AI footage**, so it's slightly soft (it reads as macro, but it is not sharp).
- **The onion beat moved one 16th** (6.65 → 6.525) to follow the real landing. S07b is now only 5 frames (6.40–6.53).
- **Reading time:** «مخلل وبصل… / يقرمشون» is up 6.40–7.15 (0.75 s for three words), under the 0.9 s floor; the sauce
  enters the label's band at ≈7.17, so it can't stay longer. «بريوش / محمّص بالزبدة» is up 2.40–3.26 (0.86 s).
- **The poster composites** the hero frame at 62 % over its own seamless red (feathered edges). The seam isn't visible,
  but the burger is smaller than in any film frame.
- **The match cut into the client card** goes from a photographed burger to a flat graphic mark (born on the burger's
  silhouette). It's a graphic match, not a morph.
- Leader lines re-target on three cuts (S03 → S04, S05 → S06, S07 → S08), so the dot jumps with the picture.
- «السرّي» and «يقرمشون» sit just above the top-down bun; their lowest strokes touch the dark crust rim (still legible: cream
  with the charcoal drop shadow).
- **Determinism:** two renders of the same frame from different seek orders differ by at most 1/255 on ≤7 of 2.07 M pixels
  (re-checked after the ECD review at 2.20, 4.40 and 6.60: ≤2 pixels).
- The mix is still sub-forward with LRA ≈3 LU, typical for social but not very dynamic.

## 9. Review log

| Round | Found (timestamp) | Change | Result |
|---|---|---|---|
| 1 | 4.27: cheddar slice ghosted (frame blend at 1.0×); 6.17 and 7.13: falling pickles and rings doubled | nearest frames on all falls; blending only ≤0.85× on calm content | crisp falls |
| 1 | b5: ring hover (f57–64), second ring wave through the label zone, pickle hover/morph | S07 rebuilt as three cuts on the beat grid (5.75 / 6.40 / 6.65) | no glitch frames on screen; labels on clean dark ground |
| 1 | 2.17–2.37: the whip's tail dragged S02's dark band in as a black bar; 12-sample smear stepped | after the cut, S03's own floor fills below; samples = blur length / 5 (≤56) | the heel drops in on red and lands on 2.40 |
| 1 | 2.70, 3.80: hero lines overflowed the 936 px safe width | measured with HarfBuzz; long heroes wrap to two lines; offer name 150 → 120 px | everything inside x 72–1008 |
| 1 | 9.0: price badge overlapped «ستاك دبل» | name right, badge left, CTA under the name; all above the crown (≥55 px gap at 10.37) | — |
| 1 | 10.40: end-card mark born 30 % taller than the burger (exploded layers × 4.8 scale) | born in place on the burger's silhouette; small drag only in flight | crown edge at y 600 vs the real 595 |
| 1 | 4.60: «تشيدريذوب»: the pop spring overshot the word scale to 1.10 and closed the word space | overshoot kept in rise/rotation; scale capped at 1 | the space stays |
| 2 | 4.27: the patty label was still fading while the cheddar fell under it | label leaves on the S05 cut (4.11–4.25) | no text over moving food |
| 2 | «أطرافه / مقرمشة» lines nearly touching | line-height 0.96 → 1.0 (still clears the lace) | — |
| 2 | 7.17–7.20 (every cut ±1 f): «يقرمشون» still on screen in S08 with the sauce stream falling through it | crunch label leaves on the S08 cut (7.01–7.15) | no text over the stream |
| 2 | vignette −30 % at the corners (the addendum says −10 to −20 %); the red card's corners went muddy | −20 % | — |
| 3 (ECD, independent) | 6.65–7.15: S07c held the b5 onion rings **propped at impossible angles** over the pickles for 0.5 s, with the leader pointing at them; 6.57–6.63 the first ring hovers over a pickle | S07 cuts on the ring's contact frame (6.55); S08 becomes one b6 top-down take from 6.55 (rings and pickles lying flat, sauce enters 7.00, contact 7.40); crunch leader re-targets to a flat pickle; stream SFX moved to the sauce's entry (`sauceIn`) | no floating or propped rings on screen |
| 3 | 4.33–4.43: **ghost duplicate cheese slice** (source f79–f82: a flat slice already on the patty while the falling one is still above, then a translucent bump) | S05 retimed: f75–f78 one-to-one, jump to the clean flat f83 on 4.40 | one slice, slaps down on the beat |
| 3 | 0.43–0.57: frame blends of the press's motion-smeared frames at 0.55× drew a **doubled press rim** for 4 frames | S01 runs f29 → f33 one-to-one (1.25×, nearest), blends only once the press is down (0.55–0.90) | single press, real motion blur for 2 frames |
| 3 | 2.17–2.23: after the whip's cut the title's smear kept riding down over the red stage (its plate was already gone) | the title leaves with S02's plate at 2.15 | clean red stage under the falling heel |
| 3 | 3.23–3.30: the falling patty passed through the fading heel label | heel label exits 3.12–3.26 | no text over the patty |
| 3 | 11.40–11.43: two empty Ink frames at the cut into the sting (the bubble is char on ink, the dots not yet in) | sting picture and sonic logo both start 0.1 s in (`stingOffset`) | the cut lands on the bubble and the first lime dot |
| 3 | poster: the dot under «طبقة»'s ب sat between «سالفة»'s ا/ل ascenders (line-height 1.08, text over text) | line-height 1.36, slate 268, title 338, burger 12 px lower | lines clearly apart; still inside the reel-safe area and the centre 3:4 |
| 3 | `main.js`: the `tg` smoothing settings sat inside a comment (whip and poster plate resampled at the default quality) | moved onto their own line | — |

## 10. Verification (measured on the delivered files)

- `STAKK-concept-9x16.mp4`: 414 frames, 13.80 s, 1080×1920, 30 fps, H.264 High (yuv420p, BT.709), AAC-LC 48 kHz stereo,
  38.0 MB (re-rendered after the ECD review). Rendered by `_system/tools/render.mjs --workers 2 --audio src/audio.wav` (two-pass linear loudnorm).
- Loudness (`audio-check.sh`): **−14.0 LUFS** integrated, **−1.4 dBTP**, LRA 2.8 LU. The spectrogram shows no clicks: the
  only thin vertical lines are the sting's typing ticks, and the sonic logo's sub fades out by the last frame.
- Event frames (from `src/footage/manifest.json`, shown crisp): smash f29 @ 0.400 · patty f21 @ 3.400 · cheddar f83 @ 4.400 ·
  pickle f54 @ 6.400 · onion ring f57 @ 6.533 · sauce enters f9 @ 7.000 · sauce contact f21 @ 7.400 · crown f19 @ 8.400.
  Audio onsets measured on the final MP4 (steepest 40–400 Hz envelope rise): +9 to +19 ms after each hit frame (0.40, 2.40, 3.40,
  4.40, 6.40, 7.40, 8.40, 10.40); MP4 vs WAV lag 0 samples.
- The clean range **7.90 → 9.40** rendered with `--from/--to` from `?clean=1`: 45 frames; the crown enters on frame 8
  (+0.267 s) and lands crisp on frame 15 (**+0.500 s**).
- Large frame-to-frame luma changes happen only at planned cuts (scene detect: 0.90, 3.90, 4.27, 4.90, 5.77, 6.40, 6.57, 7.90,
  10.40, 11.40, plus the whip 1.95–2.40), not inside shots. No flash frames. `blackdetect` flags only sting frames, where the
  small bubble, dots or mark sit on Ink (11.40–11.47, 11.73–12.03, 12.17–12.70); the 11.40 frame itself now shows the bubble and
  the first lime dot. `freezedetect` at −60 dB finds no still stretch ≥0.6 s; at a looser −50 dB, only the typing bubble
  (11.77–12.20, the dots still bob) and the end hold on the TASH mark (12.73–13.80, the slate fading in).
- Every cut checked at −1/0/+1 frame (the strip in the review folder). Every Arabic string proofread at full size
  (shaping, shadda, ellipsis/«!» side, word spacing). `?clean=1` checked at 1.3, 3.6, 4.6, 6.1, 9.6, 10.4, 11.6, 12.9 and
  13.77 s: picture only; re-checked after the ECD review at 1.30, 2.27, 3.23, 6.60, 7.20, 7.90, 8.40, 10.40, 11.60 and 13.77.
  The 7.90 → 9.40 range was re-rendered from `?clean=1` after the review (crown still on frame 15).
- Poster: slate, title, burger and brand all sit inside the reel-safe area (y 220–1500, x 72–1008) and inside the profile
  grid's centre 3:4 (y 240–1680).
