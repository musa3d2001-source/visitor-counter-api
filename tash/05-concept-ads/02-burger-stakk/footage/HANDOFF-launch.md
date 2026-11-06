# STAKK photoreal → launch ad: clean ranges

For the launch-ad editor (`tash/04-launch-ad`). Every range below is in the **clean render**
`05-concept-ads/02-burger-stakk/src/index.html?clean=1` (picture only: no type, slates, end card or sting; grade, vignette −20 %
at the corners and grain .04 are baked in, like the rest of the footage finish). The clean timeline is the same as the
film's, frame for frame. From 10.40 to 13.80 it keeps rolling the hero instead of showing the end card.

Times are edit seconds at 30 fps (frame N = N/30). "Source" is the CD-approved Higgsfield clip in `footage/ai/` (24 fps,
1080×1912) and the source second shown on the first and last frame. In-between frames follow the speed noted; the exact
per-frame map is `src/footage/manifest.json` (`src: [source s, frame a, frame b, blend weight]`).

**One-stage cut (this revision).** From 2.40 to the hero, the film is one burger on one tomato-red stage, cut from four chained
Kling clips (`c1_patty` → `c2_double` → `c3_toppings` → `c4_sauce`, each starting on the previous one's last frame) and then
`b7_crown`, which starts on `c4_sauce`'s last frame. The old `b3_heel`, `b4_melt`, `b5_stack` and `b6_sauce` clips are deleted;
nothing below uses them. Every red-stage range shares one framing, so they cut together.

Render a range, for example the burger shot:

```
node _system/tools/render.mjs --page "05-concept-ads/02-burger-stakk/src/index.html?clean=1" \
     --from 7.9 --to 9.4 --out <your folder>/stakk-crown_7.90-9.40.mp4 --workers 2
```

## 1. BURGER shot for the launch ad (launch 3.50–5.00, 1.5 s on red, top bun slams on a beat): use this — unchanged

| | |
|---|---|
| **Clean range** | **7.900 → 9.400** (45 frames) |
| Source | `b7_crown.mp4` 0.165 s (f4) → 1.600 s (f38/39 blend) · **unchanged by the one-stage cut** (S09 keeps its in-point, camera and grade; re-checked: crown on f19 at 8.400) |
| The slam | crown lands at **clean 8.400** (source f19, 0.792 s, first fully landed frame), **0.50 s into the range**, so it falls on your 4.00 beat when the range starts at launch 3.50 |
| What you see | 7.90–8.17 the finished stack (sauce pooled, pickles, onion) on the red seamless; ≈8.17–8.37 the sesame crown falls into frame (real motion blur, 1.25× = one source frame per output frame); 8.40 slam: +4 % scale punch and an 11 px shake that decays in about 6 frames; 8.43–9.40 slow hero push at about 0.85×, steam |
| Colour | stage graded to the client red: measured median (225–226, 60, 46) on S09 = `#E23B2E` ±1 |
| Same as before | your cues (`BURGER in 7.90`, crown 4.00) stay valid, and your rendered `04-launch-ad/footage/clean/stakk-crown_7.90-9.40.mp4` still matches the film |

If you'd rather have the slam earlier in the shot: **clean 8.100 → 9.600** puts the crown at 0.30 s (source 0.415 s, f10 → 1.765 s, f43).
If you'd rather conform it yourself without our retime, take the raw source **`b7_crown.mp4` 0.29 → 1.79 s at 1.0×**: the crown
lands at 0.79 s (0.50 s in). That is ungraded and has no punch or shake.

## 2. Other strong ranges

| What | Clean range | Source (clip, s, frames) | Speed | Notes |
|---|---|---|---|---|
| **SMASH** (gloved press slams a compact, finely ground beef ball on a black griddle) | **0.000 → 0.900** | `b1_smash_v3.mp4` 1.250 (f30) → 2.333 (f56) | 1.25×, nearest, no blends | unchanged: ball whole and sharp 0.000–0.367; first compressed frame on **0.400** (f42); first sharp pressed frame 0.500 (f45). Dark griddle, not red. Never blend f36–f44 (the press's motion blur doubles into a ghost rim) |
| **CRUST** (top-down seared patty, lacy edge, fat bubbling) | **0.900 → 2.400** | `b2_crust.mp4` 0.800 (f19) → 2.267 (f54/55) | 1.0×, frame-blended | the whole shot is usable now (the whip is gone; it ends on a hard cut at 2.40). The frame is lowered 450 px for the title, so the top quarter is a dark falloff |
| **HEEL → PATTY SLAM** (empty toasted brioche heel on red, the patty drops onto it) | **2.400 → 3.633** | `c1_patty.mp4` 0.000 (f0) → 0.292 (f7, on 3.233) at 0.35× blended, then f8 → f11 one-to-one, **jump f11 → f18** on 3.400, then f18 → f25 | 0.35× → 1.25× | the stage opens with a 4.5 % scale settle on 2.400; the patty enters the top on 3.267 and touches on **3.367** (f11, motion smear); 3.400 first clean landed frame. Raw source if you conform it yourself: don't use f12–f17 (the patty slides, curls and ghosts its edges) |
| **LACE PUNCH-IN** (the patty's charred, crispy rim over the brioche, 1.31× crop) | **3.667 → 4.233** | `c1_patty.mp4` 1.083 (f26) → 1.792 (f43) | 1.25× | same burger, slow creep; a little soft at 1.31× |
| **CHEDDAR LANDS** (slice drops onto the patty on red) | **4.267 → 4.900** | `c1_patty.mp4` 2.833 (f68) → 3.583 (f86) | 1.25×, nearest | the slice is falling on the first frame; corner touches 4.333 (f70), slaps down, **flat on 4.400** (f72, one frame of flap blur), then the melt starts |
| **CHEESE MELT** (cheddar drip growing down the patty over the heel, 1.31× crop, red stage) | **4.900 → 5.750** | `c1_patty.mp4` 4.167 (f100) → 4.667 (f112) | 0.6×, frame-blended | the calmest, most appetising beat. Replaces the old charcoal `b4_melt` range |
| **DOUBLE** (second patty drops onto the cheddar, then the second slice) | **5.767 → 6.233** | `c2_double.mp4` 1.167 (f28) → 1.583 (f38), **jump** to 2.750 (f66) → 2.875 (f69) on 6.133 | 1.25×, nearest | patty 2 touches 5.867, **down on 5.900** (f32); the jump cut lands on the second slice slumping, lying down on **6.167** (f67). The falling patty (5.767–5.867) is heavy AI motion smear |
| **PICKLES + ONION** (pickle rain, then an onion ring lands) | **6.267 → 6.900** | `c3_toppings.mp4` 0.583 (f14) → 0.875 (f21), **jump** to 2.000 (f48) → 2.417 (f58) on 6.533 | 1.25×, nearest | pickle **down on 6.400** (f18); onion ring **lands on 6.667** (f52). Raw source: c3 f43–f45 show broken ring-shaped motion smears |
| **SAUCE POUR** (sauce stream onto the onion, side view on red) | **6.900 → 7.900** | `c4_sauce.mp4` 1.750 (f42) → 3.133 (f75) | 1.25× one-to-one, ramping to 2.0× after contact | the tip enters the top on 6.933 (f43) and **touches the onion on 7.400** (f57). The 6.900 frame is a small jump from c3 (rings settle a few px). Raw source: the stream breaks ≈4.0 s (f96), the pool settles by f120 = `b7_crown` f0 |
| **HERO HANDLE** (finished burger on red, slow push, steam) | **10.400 → 13.800** | `b7_crown.mp4` 2.440 (f58) → 4.976 (f120) | 0.8 → 0.7×, frame-blended | unchanged; clean only (the film shows the end card here). Best single frame ≈ **11.600** (source ≈ 3.38 s) = `still-hero.png` |

## 3. Avoid

- Clean **6.867 → 6.900** and **7.867 → 7.900** as transitions inside your own cut: they are jump cuts inside the locked shot (rings settle;
  then the sauce stream vanishes and the pool is suddenly complete). Fine in STAKK on its beats, odd if they land mid-phrase elsewhere.
- `c1_patty.mp4` f12–f17 (0.50–0.71 s): the landed patty slides, its tips curl and its edges ghost (AI). STAKK jumps f11 → f18.
- `c3_toppings.mp4` f43–f45 (1.79–1.88 s): broken ring-shaped motion smears.
- Never frame-blend anything that falls (patties, slices, pickles, rings, the sauce tip, the crown): blending doubles it into a ghost. Use
  1.25× (24 → 30 fps one-to-one) or nearest frames.
- `b1_smash_v3.mp4` 1.50–1.83 s (f36–f44) slowed down with frame blending: the press's motion blur doubles into a ghost rim.
- The deleted clips (`b1_smash.mp4`, `b3_heel.mp4`, `b4_melt.mp4`, `b5_stack.mp4`, `b6_sauce.mp4`) — even from an old export: they show
  different burgers on a different background.
