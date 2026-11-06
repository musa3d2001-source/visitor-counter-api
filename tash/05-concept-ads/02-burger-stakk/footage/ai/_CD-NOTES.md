# STAKK: photoreal footage, CD notes (read before editing)

The owner watched the CGI cut and said the burger looks cartoonish, not real. The owner approved Higgsfield
generation for this ad, and the CD art-directed and approved the clips in this folder. **The final film uses only these clips
for picture.** No Three.js plates go in the final.

Pipeline: GPT Image 2.6 start frame (`frames/*.png`, approved first) → Kling 3.0 Turbo image-to-video,
1080p, 5 s. Source format is **1080×1912, 24 fps, 5.04 s**. The clips carry **no audio**. Scale/crop to 1080×1920 and
conform to 30 fps by frame index (or blend/minterpolate where you slow down).

| Clip | What happens (event times in source seconds, measured frame-accurately by the CD) | Use it for | CD verdict |
|---|---|---|---|
| `b1_smash.mp4` | Gloved hand holds a steel smasher over a raw beef ball on a black griddle. The press comes down and **contacts the ball at ≈1.21 s**; it is flat by ≈1.33 s. Steam and fat spray follow, and the press lifts and wobbles a little after 2.5 s | S01 SMASH hook (smash cue 0.40): pick an in-point so 1.21–1.25 lands on 0.40 | Pass. The patty ends up thicker than a classic smash. Don't hold past ≈2.5 s |
| `b2_crust.mp4` | Top-down: seared patty with a dark mahogany crust and lacy edges on the griddle, fat bubbling, steam. Barely any movement; the whole clip is usable | S02 CRUST + TITLE, and S04 crust-edge insert as a 1.3–1.5× punch-in on the lacy rim | Pass. The best "crispy" proof |
| `b3_heel.mp4` | Red stage. A patty falls and **lands on the toasted heel at ≈0.875 s**. A cheddar slice falls and **lands at ≈3.375 s**, then sits flat | S03 BUILD A (patty cue 3.40 = 0.875 s); S05 cheddar (cue 4.40 = 3.375 s). There is no heel-landing moment, so open S03 on the bun alone (0.0–0.6 s) and land the heel SFX on the cut | Pass. This patty is a regular round patty, not lacy, so put «أطرافه مقرمشة» on the b2 insert (S04), not on this patty |
| `b4_melt.mp4` | Charcoal background. Cheddar folds over a crispy lacy edge, drips grow slowly, steam. Slow and calm; the whole clip is usable | S06 half-time melt «…على مهله» | Pass. The most appetising shot |
| `b5_stack.mp4` | Charcoal, double stack, steam. Crinkle pickles fall and **the first ones land at ≈1.50 s**, more land through ≈2.0. Red onion rings fall and **land at ≈2.2–2.35 s**, the last ring at ≈2.9. It settles by 3.5 s | S07 double burst: the «دبل!» beat on the stack (0–0.4 s), pickles cue 6.40 = 1.50 s, onions cue 6.65 = 2.25 s. Speed-ramp between the two landings (≈1.1–1.3×) so both hit their cues | Pass. Mid-air, the falling pickles read as pale lemon or cucumber discs because of motion blur; once landed they're green crinkle-cut. Keep the airborne frames short |
| `b6_sauce.mp4` | Top-down on red: pickles and onion on cheese. A stream of orange sauce **first touches at ≈0.75 s** and pours into a glossy pool through ≈3 s | S08 sauce (cue 7.40 = 0.75 s). It's a pour, not a dollop splat, which is fine; maybe retime the SFX from "splat" to a thick "pour + plop" | Pass. Cut before the stream thins (≈3.5 s) |
| `b7_crown.mp4` | Red stage, double stack (sauce, pickles, onion). The sesame crown falls and **lands at ≈0.79 s**, then a gentle hero push/orbit through 5 s. Beautiful hero | S09 drop + S10 HERO (crown cue 8.40 = 0.79 s); the 10.4→ hero handle for clean mode | Pass. The best frame is about 3–5 s. The burger sits a little low and left, so place the price badge and CTA around it, never over the food |

Rules:
- **Type:** keep all copy, the badge «٢٫٧٥٠ د.ك», the CTA, the client end card, slates and the TASH signature exactly as now. Leader lines must touch the real object in the footage, or be removed. No text over busy detail.
- **Grade:** use one shared grade. The tomato-red stage must match across b3, b6 and b7, and the brand red is #E23B2E. Blacks must match between b1, b2, b4 and b5. Add grain about .04 and scale 1.02–1.05 to hide edge artifacts.
- **Artifacts:** inspect every frame range you use at full size, and cut around any AI glitch (morphing, a melting press, ghost duplicates).
- **Clean mode:** `?clean=1` must still give the launch-ad editor the same timeline with no type.
- **Honesty:** credit this in SCRIPT.md: "Footage: AI-generated with Higgsfield (GPT Image 2.6 start frames → Kling 3.0 Turbo), art-directed and approved by TASH. Edit, type, sound design and signature by TASH." Keep «إعلان تجريبي — علامة خيالية» and the CONCEPT AD slates.
- **Job ids**, image → video:

  | Shot | Image job | Video job |
  |---|---|---|
  | b1 | cce37c0b-16d9-4ebf-9311-f19b9b042617 | 80e1d8d0-9051-4e3f-a4ec-f14764bb1ef6 |
  | b2 | ccf1c92d-105f-4aa1-af87-a745454893bd | 21783c54-54eb-469c-8740-0722b8cd65e8 |
  | b3 | 9e3dd31f-fb02-41ae-ad6c-2310949fc4b2 | ff8b7e30-e12b-4e4a-9ba6-fc61dc6094a7 |
  | b4 | a61e78e2-61a3-486b-a1c7-936ea2ccbe22 | a8d0f2d0-0b1c-441f-96a1-e25f5680e1cc |
  | b5 | eead7c0e-2dd8-4f1e-a0f8-961580c95532 | bcfec400-f017-4460-9dfe-a64b7b126109 |
  | b6 | bd8c31bf-e6d9-4cd3-8a91-fa17ffd59959 | aa36060b-44ba-47cb-9168-d52d45f237f9 |
  | b7 | 621fc520-a580-4775-a8d7-b2d49b49e00f | f7ee3a67-011f-44e4-baf4-61825934d7d2 |

- **No new generations:** do not call Higgsfield yourself. The credit budget is the owner's and the CD controls it.
- Delete this file when the film is final.
