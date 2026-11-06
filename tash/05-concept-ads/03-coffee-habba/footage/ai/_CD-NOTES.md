# HABBA: photoreal footage, CD notes (read before editing)

The owner watched the CGI cut and said the coffee looks cartoonish, not real. The owner approved Higgsfield
generation for this ad, and the CD art-directed and approved the clips in this folder. **The final film uses only these clips
for picture.** No Three.js plates in the final.

Pipeline: GPT Image 2.6 start frame (`frames/*.png`, approved first) → Kling 3.0 Turbo image-to-video, 1080p, 5 s.
Source format: **1080×1912, 24 fps, 5.04 s, no audio**. Scale/crop to 1080×1920 and conform to 30 fps by frame index
(blend or minterpolate where you slow down; this ad is calm, so 0.6–0.85× slow-downs will help).

The art direction is the same as before: one morning, terracotta cup with a hand-dipped cream rim, speckled cream saucer, walnut
table, limewash wall, warm sun through venetian blinds. One light logic runs through every shot.

| Clip | What happens | Use for | CD verdict |
|---|---|---|---|
| `k1_blinds.mp4` | High three-quarter view of the espresso cup on its saucer, steam rising, bars of sun across the table. A steady push-in from wide to close (the cup grows from about 30% to 70% of frame width). **The blinds do not visibly open**: the bars stay about the same | S1 (0–2.1): use about 0.0–3.0 s at about 0.7–1.0×. Sell "blinds open" in the grade: start about 1.5 stops under and ramp up to normal with an animated soft light-bar wipe over 0.28–1.53, on the slat-click SFX | Pass. Real, calm and beautiful |
| `k2_steam.mp4` | Side view at rim height, close on the cream rim. Steam curls up through one diagonal bar of sun against a dark room. Subtle; all 5 s are usable | S2 (2.1–4.2) under «قهوتك…». The upper dark area carries the text | Pass. The steam is gentle, so don't speed it up |
| `k3_pour.mp4` | Top-down. The milk stream pours into the crema, and **a real latte-art heart (tulip) forms between about 1.5 and 4.0 s**; the pitcher lifts away at about 4.0–4.6 s, leaving a clean heart at 5.0 s. The cup sits in the upper-middle of the frame, and the lower third is shaded walnut table, where «على مهلك.» goes | S3 (4.2–7.0). Map the source so the stream lifts on the cue `streamOff` 6.45, or retime the pour SFX to the picture | Pass. **The best shot of the set** |
| `k4_beans.mp4` | Low at table level, shallow focus, beans on walnut, barred wall behind. **About 0–2.2 s are static**; then beans fall from top of frame (about 2.3–3.9 s) and land around the hero beans, settling by about 4.3 s. The upper half is blurred sunlit wall | S4 (7.0–9.8, «حبّة… حبّة.»): use the falling part, measure the two clearest landings frame-accurately, and land them on bean1 7.70 / bean2 8.40 (a speed ramp is fine; a real slow-mo feel at 0.5–0.7× works). Paper text needs shade or a soft plate; consider roasted `#4A2F23` type on the bright wall instead | Pass. By the end the table gets busy, so don't use past about 4.5 s |
| `k5_hero.mp4` | Low hero angle: cup on saucer at table height, a gentle arc/push. The cup moves from left-centre to centre-right and gets larger. The upper half is the sunlit limewash wall with light bars, which is the perfect ground for the HABBA lockup | S5 (9.8–12.75) client end card on the wall (mark + bean dot + HABBA + SPECIALTY COFFEE in roasted). S6 tail: "the blinds close", made as a grade/light-bar wipe to dark (12.75–13.10), then the TASH sting | Pass. **The cup does not turn**, so the ceramic clink at 11.20 no longer has a visible cause: move it to the arc's settle, or make it the bean-dot landing tap, or drop it. **The cup carries no printed mark** now; don't fake one on the ceramic |

Rules:
- **Copy:** keep all of it («قهوتك…» «على مهلك.» «حبّة… حبّة.»), the HABBA mark and Latin, the slates and the TASH tail, and keep the score unless a cue loses its picture (fix minimally in audio.py and re-render audio.wav).
- **Legibility:** text sits in shade or on a plain ground, never over a bright light bar. Check every string at full size.
- **Grade:** one shared warm grade with matched blacks, grain about .04, scale 1.02–1.05. Watch for AI artifacts (morphing beans, rim warping, a pitcher melting) at full size and cut around them.
- **Clean mode:** `?clean=1` must still render the same timeline with no type (the launch-ad editor uses it). Also export a clean heart moment the launch ad's COFFEE shot (about 1 s) can use.
- **Honesty:** credit this in SCRIPT.md: "Footage: AI-generated with Higgsfield (GPT Image 2.6 start frames → Kling 3.0 Turbo), art-directed and approved by TASH. Edit, type, sound design and signature by TASH." Keep «إعلان تجريبي — علامة خيالية» and the CONCEPT AD slates.
- **Job ids**, image → video:

  | Shot | Image job | Video job |
  |---|---|---|
  | k1 | b98e3f6e-6bef-47ab-82c3-ab0efb91891d | adea8097-a29c-43fc-bf8e-77b75e5ddeba |
  | k2 | 2c5379ec-4329-4f26-a96a-aa9401be01ca | 00ebd75e-58f6-4ad4-bae3-42a65ff2ad0f |
  | k3 | d9f7c227-cbce-4e0e-ab6e-e0e00d8dafaf | e5c4869f-0cfc-4461-9e39-f71a10b89183 |
  | k4 | ecc33200-265f-40eb-9986-3d98e109f78f | fe79fff4-b5e5-4a7f-a357-dd7435398138 |
  | k5 | a5c74746-61dd-4645-b24f-d2be7064a53d | a94a36e0-d239-40c3-acf9-378bc2440133 |

- **No new generations:** do not call Higgsfield yourself. The credit budget is the owner's and the CD controls it.
- Delete this file when the film is final.
