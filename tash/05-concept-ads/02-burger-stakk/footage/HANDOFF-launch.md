# STAKK photoreal → launch ad: clean ranges

For the launch-ad editor (`tash/04-launch-ad`). Every range below is in the **clean render**
`05-concept-ads/02-burger-stakk/src/index.html?clean=1` (picture only: no type, slates, end card or sting; grade, vignette −20 %
at the corners and grain .04 are baked in, like the rest of the footage finish). The clean timeline is the same as the
film's, frame for frame. From 10.40 to 13.80 it keeps rolling the hero instead of showing the end card.

Times are edit seconds at 30 fps (frame N = N/30). "Source" is the CD-approved Higgsfield clip in `footage/ai/` (24 fps,
1080×1912) and the source second shown on the first and last frame. In-between frames follow the speed noted; the exact
per-frame map is `src/footage/manifest.json` (`src: [source s, frame a, frame b, blend weight]`).

Render a range, for example the burger shot:

```
node _system/tools/render.mjs --page "05-concept-ads/02-burger-stakk/src/index.html?clean=1" \
     --from 7.9 --to 9.4 --out <your folder>/stakk-crown_7.90-9.40.mp4 --workers 2
```

## 1. BURGER shot for the launch ad (launch 3.50–5.00, 1.5 s on red, top bun slams on a beat): use this

| | |
|---|---|
| **Clean range** | **7.900 → 9.400** (45 frames) |
| Source | `b7_crown.mp4` 0.165 s (f4) → 1.600 s (f38/39 blend) · unchanged by the ECD review, re-checked in an actual `--from 7.9 --to 9.4` clean render (45 frames: the crown enters on frame 8, lands crisp on frame 15) |
| The slam | crown lands at **clean 8.400** (source f19, 0.792 s, first fully landed frame), **0.50 s into the range**, so it falls on your 4.00 beat when the range starts at launch 3.50 |
| What you see | 7.90–8.17 the finished stack (sauce, pickles, onion) on the red seamless; 8.17–8.37 the sesame crown falls into frame (real motion blur, 1.25× = one source frame per output frame); 8.40 slam: +4 % scale punch and an 11 px shake that decays in about 6 frames; 8.43–9.40 slow hero push at about 0.85×, steam |
| Colour | stage graded to the client red: measured (226, 59, 46) ±2 = `#E23B2E`, so it cuts cleanly against the STAKK card red |
| Same as before | the old CGI hand-off was also `7.90–9.40` with the crown at 8.40, so your cues (`BURGER in 7.90`, crown 4.00) stay valid. Only the picture changed |

If you'd rather have the slam earlier in the shot: **clean 8.100 → 9.600** puts the crown at 0.30 s (source 0.415 s, f10 → 1.765 s, f43).
If you'd rather conform it yourself without our retime, take the raw source **`b7_crown.mp4` 0.29 → 1.79 s at 1.0×**: the crown
lands at 0.79 s (0.50 s in). That is ungraded and has no punch or shake.

## 2. Other strong ranges

| What | Clean range | Source (clip, s, frames) | Speed | Notes |
|---|---|---|---|---|
| **SMASH** (gloved press hits a beef ball on a black griddle) | **0.000 → 0.900** | `b1_smash.mp4` 0.770 (f18) → 1.558 (f37/38 blend) | 1.1× into the hit, 1.25× (one source frame per output frame) through the compression f29 → f33 (0.400–0.533), then 0.5× frame-blended through the steam | contact on **0.400** (f29, 1.208 s), with the same punch and shake. Dark warm griddle, not red. Don't extend past source 2.5 s (the press wobbles), and don't slow f29–f33 down with blends (the press's motion blur doubles into a ghost rim) |
| **CHEESE MELT** (cheddar folds over a crispy lacy edge, a drip grows down the brioche) | **4.900 → 5.750** | `b4_melt.mp4` 4.530 (f108) → 4.947 (f119) | 0.5×, frame-blended | the calmest and most appetising shot; charcoal background, steam top left |
| **CHEDDAR LANDS** (slice drops onto the patty on red) | **4.267 → 4.900** | `b3_heel.mp4` 3.125 (f75) → 3.925 (f94/95 blend) | 1.25× for the fall (f75–f78), then a **jump f78 → f83** across the contact, then 1.0× | lands flat on **4.400** (f83). Source f79–f82 are an AI ghost: a flat slice already on the patty while the falling slice is still above it. The edit never shows them |
| **TOP-DOWN + SAUCE POUR** (pickles and onion rings lying flat, then an orange sauce stream, glossy pool) | **6.567 → 7.900** (one take) | `b6_sauce.mp4` 0.000 (f0) → 1.385 (f33) | ≈0.85× frame-blended on the still plate (6.567–7.000), 1.25× one-to-one for the pour, 1.0 → 1.2× after contact | the sauce enters the top of frame on **7.000** (f9) and makes contact on **7.400** (f21); red seamless. For a shorter pour-only cut use **7.167 → 7.900** (source 0.583 f14 → 1.385) |
| **CRUST** (top-down seared patty, lacy edge, fat bubbling) | **0.900 → 1.933** | `b2_crust.mp4` 0.800 (f19) → 1.800 (f44) | 1.0× | stop before 1.95 (the whip starts). The frame is lowered 450 px for the title, so the top quarter is a dark falloff |
| **LACE MACRO** (1.6× punch-in on the crispy rim, fat bubbling) | **3.900 → 4.250** | `b2_crust.mp4` 3.000 (f72) → 3.300 (f80) | 1.0× | short (0.35 s); a little soft at 1.6× |
| **PICKLE + ONION LAND** | **6.400 → 6.567** (5 frames) | `b5_stack.mp4` 2.250 (f54) → 2.383 (f57) | 1.0× | pickle lands on 6.400; the first onion ring touches a pickle on the last frame, 6.533 (f57). Don't run past f57: from f58 the ring hovers above the pickles with air under it and the centre pickle morphs (AI glitch) |
| **HERO HANDLE** (finished burger on red, slow push, steam) | **10.400 → 13.800** | `b7_crown.mp4` 2.440 (f58) → 4.976 (f120) | 0.8 → 0.7×, frame-blended | clean only (the film shows the end card here). The burger grows to fill the width by 13.8; best single frame ≈ **11.600** (source ≈ 3.38 s) = `still-hero.png` |

## 3. Avoid

- `b5_stack.mp4` source 0.9–1.5 s (a pickle hovers and drifts upward) and 1.6–2.0 s (a pale upright disc morphs into a pickle).
- `b5_stack.mp4` after 2.4 s (f58 on): the first ring hovers with a gap under it, then every ring ends propped at an impossible angle over the
  pickles (3.3–5.0 s). The old S07c used 3.33–3.58 s; the ECD review removed it.
- `b3_heel.mp4` 3.29–3.42 s (f79–f82): a ghost duplicate cheddar slice (one flat on the patty, one still falling), then a translucent bump.
- `b1_smash.mp4` 1.25–1.37 s (f30–f32) slowed down with frame blending: the press's motion blur doubles into a ghost rim. Play it 1:1.
- Clean 1.950 → 2.400: the whip (vertical smear between the crust and the red stage). It's a transition, not a usable shot.
