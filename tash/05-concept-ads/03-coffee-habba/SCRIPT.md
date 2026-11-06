# HABBA «حبّة» — Concept ad 03 / Specialty coffee (photoreal cut)

`CONCEPT AD — 03 / COFFEE` · «إعلان تجريبي — علامة خيالية». HABBA is a fictional brand made up for this piece.
9:16 · 1080×1920 · 30 fps · 15.6 s · H.264 + AAC 48 kHz · −14 LUFS (measured −13.9 LUFS, true peak −1.5 dBTP)

> **Footage: AI-generated with Higgsfield (GPT Image 2.6 start frames → Kling 3.0 Turbo), art-directed and approved by
> TASH. Edit, type, sound design and signature by TASH.**
>
> The owner watched the first, all-CGI cut and said «جاي كرتوني مو حقيقي واقعي» (it looks cartoonish, not real). He then
> approved Higgsfield for this ad, and the CD generated and approved the five clips below. This version keeps the same idea, the same
> beat grid and cues, the same copy, client identity, end card, slates, TASH signature and original score. **Every picture now comes
> from those clips.** No Three.js plate is in the film; the v1 CGI sources are kept for reference in `src/_cgi-v1/` and are not loaded.

| Clip | Shot | Image job (GPT Image 2.6 start frame) | Video job (Kling 3.0 Turbo, 1080p, 5 s) |
|---|---|---|---|
| `footage/ai/k1_blinds.mp4` | S1 | b98e3f6e-6bef-47ab-82c3-ab0efb91891d | adea8097-a29c-43fc-bf8e-77b75e5ddeba |
| `footage/ai/k2_steam.mp4` | S2 | 2c5379ec-4329-4f26-a96a-aa9401be01ca | 00ebd75e-58f6-4ad4-bae3-42a65ff2ad0f |
| `footage/ai/k3_pour.mp4` | S3 | d9f7c227-cbce-4e0e-ab6e-e0e00d8dafaf | e5c4869f-0cfc-4461-9e39-f71a10b89183 |
| `footage/ai/k4_beans.mp4` | S4 | ecc33200-265f-40eb-9986-3d98e109f78f | fe79fff4-b5e5-4a7f-a357-dd7435398138 |
| `footage/ai/k5_hero.mp4` | S5 (+ clean tail) | a5c74746-61dd-4645-b24f-d2be7064a53d | a94a36e0-d239-40c3-acf9-378bc2440133 |

Start frames: `footage/ai/frames/*.png`. Source format: 1080×1912, 24 fps, 121 frames (5.04 s), no audio. No new
generations were made for this edit.

---

## الفكرة (عربي)

**«قهوتك… على مهلك.»** ثم **«حبّة… حبّة.»**

«حبّة» اسم المحل، ومعناها حبّة القهوة. و«حبّة حبّة» بلهجتنا تعني «على راحتك، شوي شوي». فاسم العلامة نفسه
صار هو الوعد: قهوة تنسوّى بهدوء وتنشرب بهدوء.

الإعلان صباح واحد على طاولة جنب دريشة فيها ستارة شرائح. الغرفة تبدأ معتمة وفيها خطوط شمس رفيعة، وبعدين الستارة تنفتح
والشمس تنزل خطوط على الطاولة والكوب. البخار يطلع من الإسبريسو، وبعدين الحليب ينصب من فوق ويرسم قلب. حبّات القهوة تطيح
بالتصوير البطيء، وكل حبّة تنزل على الطاولة ومعها كلمة: «حبّة…» وبعدين «حبّة.». بعدها الكاميرا تنزل لمستوى الطاولة قدّام
الجدار المشمس، والشعار ينكتب على الجدار، وحبّة القهوة تنزل وتصير هي نقطة الباء. آخر شي الستارة تتسكّر والغرفة تظلم،
ويطلع توقيع طشّ.

## The idea (English)

**"Your coffee… at your own pace."** Then **"Habba… habba."**

*Habba* is the café's name and means "a (coffee) bean". In Kuwaiti and Gulf speech, *habba habba* means
"slowly, bit by bit". So the brand's own name carries the promise: coffee made slowly and drunk slowly.

The film is one morning at a table by a window with venetian blinds: a terracotta cup with a
hand-dipped cream rim, a speckled cream saucer, a walnut table, a limewash wall and warm sun through the slats. The room opens in
thin slits of sun, and then the light widens to full. Steam curls through a bar of sun, and a top-down pour draws a real latte-art
heart. Beans fall in slow motion: «حبّة…» lands with the first, and «حبّة.» with the second. At table height, the HABBA
mark writes itself on the sunlit wall above the cup, and its terracotta bean drops into the ب. Then the blinds close and
the TASH signature types itself in.

**Capability shown:** a commercial that looks shot, not rendered. That means footage direction and selection, frame-accurate retiming to a
music grid, one grade across five generated clips, Arabic editorial type placed into the real light (including a falling bean that
passes *in front of* the type), and a complete small client identity system.

---

## HABBA design system (client side, no TASH lime anywhere before the tail)

| | |
|---|---|
| **Mark** | «حبّة» outlined from Alexandria (OFL, wght 500) with HarfBuzz shaping. The single dot under ب is replaced by a roasted coffee bean (S-crease cut out). Built by `src/tools/build_logo.py` → `src/habba-logo-data.mjs`; markup in `src/habba-logo.mjs` |
| **Latin** | HABBA in Archivo expanded (125%) 500, tracked .42em · SPECIALTY COFFEE 500, .5em |
| **Palette** | paper `#EFE6D8` · roasted `#4A2F23` · terracotta `#C46A4A` (the bean in the mark: one accent, one meaning) · ink `#17110E` (the graded black point) · crema `#C58A52` |
| **Type roles** | Arabic lines: Alexandria Light 300. Latin: Archivo expanded. Two weights per layout at most |
| **Colour rule** | paper type over the dark room and the shaded table; roasted type over the sunlit wall. Type never sits over a bright light bar or over food detail |
| **Objects** | the terracotta cup and speckled saucer in the footage. **The cup carries no printed mark in this cut** (the AI cup has none, and we don't fake one on the ceramic); the brand lives on the wall |

---

## Shot list (locked timings in seconds; 1 beat = 0.7 s = 21 frames; picture cuts sit on beats, and S4's scale cut sits on the 8th before bean 2)

The source of truth is `src/cues.json`: the cue times (read by the page and by `src/audio.py`) plus `footage.segs`, the edit list with
each segment's clip and time map (edit time → source seconds). `src/tools/extract.sh` → `src/tools/conform.py` bakes it into
30 fps JPEG sequences (`src/footage/<seg>/NNNN.jpg`, 1080×1920 cover-cropped, q:v 3, 57 MB). The page draws them by
frame index. The same timeline renders with `?clean=1`.

| # | Edit | Source (clip · source seconds · speed) | Picture | Measured event → cue |
|---|---|---|---|---|
| S1 | 0.00–2.10 | k1_blinds · 0.100–1.885 s · 0.85× | High three-quarter view of the cup on its saucer, steam, bars of sun on the walnut table. The clip's own push-in carries the shot; framing is ×1.03. **Blinds open:** the clip's blinds don't move, so the opening is made in the grade. The room starts 1.5 stops under with thin slits of full light at the footage's own sun angle (25°), and the slits widen to full light over 0.28–1.53 on the slat clicks | blindsOpen 0.28 / 1.25 s |
| S2 | 2.10–4.20 | k2_steam · 0.150–1.830 s · 0.8× | Side view at rim height, the cream lip in the foreground, and steam curling up through one diagonal bar of sun against the dark room. Push ×1.03 → 1.055. Cut from S1 on the rising steam | — |
| S3 | 4.20–7.00 | k3_pour · 1.196–4.556 s · 1.2× | Top-down. The milk stream is already falling at the cut, and a real latte-art heart grows under it. The stream **breaks between source frames 93 and 94 (3.896 s) = 6.45**, and then the pitcher lifts up and out of the top of frame (clean from 6.93). A graduated falloff darkens the lower table under the line | streamOff 6.45 |
| S4a | 7.00–8.133 | k4_beans · 2.121–2.971 s · 0.75× | Low at table level, shallow focus, the barred wall behind. Push ×1.03 → 1.05 (the camera is locked off). Bean A enters the top of frame at 7.07 and **hits the hero bean between source frames 63 and 64 (2.646 s) = 7.70**. A second bean (B) falls through the wall behind «حبّة…» | bean1 7.70 |
| S4b | 8.133–9.80 | k4_beans · 3.804–4.638 s · 0.5× | **Scale cut** in (×1.30 → 1.33, bottom-anchored). Bean D continues the falling motion from the same screen position as B, and **lands between source frames 94 and 95 (3.9375 s) = 8.40**. It rocks, then tips onto its side at about 9.02. The two clean landings are 1.29 s apart in the source but one beat (0.7 s) apart on the grid, so a cut was needed. The busy rest of the take (a fused double bean, source frames 80–89) is cut out | bean2 8.40 |
| S5 | 9.80–12.75 | k5_hero · from 0.050 s · 0.85× | Low hero angle: cup and saucer at table height, the clip's gentle arc and push, and the sunlit limewash wall with light bars above. A soft sun pool on the wall (+0.55 stop, static) sits behind the **client end card**: the mark writes on right→left (10.80–11.70), its terracotta bean **lands in the ب slot at 11.50**, HABBA tracks in (11.55), then SPECIALTY COFFEE (11.80). Full lockup to 12.75 | logoIn 10.80 · beanDot 11.50 |
| S6 | 12.75–15.60 | (S5 continues under the tail; source to 4.98 s) | **The blinds close:** the same light-bar mask narrows to slits and the room drops 4 stops (12.75–13.10). The TASH signature (local `sting-short.js`, same dots and cues as `createSting`) runs from **13.00**: typing → converge → **snap 14.12** → shadda 14.30 → «خلّهم يسولفون عنك!» 14.55 → @tash.creative.kw 15.10. The `CONCEPT AD — 03 / COFFEE` + «إعلان تجريبي — علامة خيالية» slate is visible from 13.10 to the end | `?clean=1`: S5 keeps rolling to 15.60 (light stays on; no close, sting or slate) |

**Hand-offs:** S1 → S2 carry the steam. S3 → S4: the pitcher leaves through the top of frame, and the first bean enters through the
top 2 frames later. S4a → S4b: a falling bean at the same screen position and direction (B → D). S4 → S5 cuts from a bean at rest to
the cup at rest under the arc. One light logic (sun through blinds, from the right) runs through every shot. The blinds that open the
film also close it.

**Retiming method:** no synthesised in-betweens. I tested ffmpeg `minterpolate` (mci/aobmc) and OpenCV DIS optical flow at full size,
and both tore the background around the falling beans (rejected). `conform.py` uses **frame blending** where the picture moves
slowly (S1, S2, S5). It uses a **motion-adaptive blend** for S3 and S4: a blend where the picture is still, and the nearest real
frame where something moves fast. That means no double-exposed beans and no ghost pitcher.

---

## On-screen copy (proofread twice at full size: RTL order, punctuation side, shadda, whole words only)

| Time | Text | Where / how |
|---|---|---|
| 2.45–4.15 | **قهوتك…** | paper `#EFE6D8`, 150 px Alexandria 300, top 250, in the dark room above the steam (measured ≈13:1). Feathered right→left write-on per word. The ellipsis sits at the left end |
| 4.55–6.94 | **على مهلك.** | paper, 140 px, top 1300, on the shaded walnut table below the saucer, with a soft ink text-shadow (measured ≥5.9:1 even on the brighter bars, ≈10:1 median). The full stop sits at the left end |
| 7.70 / 8.40–9.76 | **حبّة…  حبّة.** | roasted `#4A2F23`, 150 px, top 330, on the sunlit wall above the beans (+0.5 stop sun pool behind it; ≈3:1 on the darker bars, ≈3.8:1 median). Each word drops in as its bean lands. Shadda on ب in both. **Depth:** beans B and D pass in front of the word (7.97–8.25), matted from a clean plate of the locked-off wall |
| 10.80–13.10 | mark **حبّة** + HABBA + SPECIALTY COFFEE | roasted on the sunlit wall above the cup (SPECIALTY COFFEE is now in roasted too, for contrast) |
| 13.10–15.60 | `CONCEPT AD — 03 / COFFEE` · **إعلان تجريبي — علامة خيالية** | TASH slate (JetBrains Mono / IBM Plex Sans Arabic) |
| 13.00–15.60 | **طشّ** · **خلّهم يسولفون عنك!** · @tash.creative.kw | TASH signature |

There are no claims, prices, numbers or reviews. There are no leader lines in this piece (none in v1 either).

---

## Sound (original, `src/audio.py` → `src/audio.wav`, engine `_system/audio/tashaudio.py`)

**The score is unchanged from v1:** warm lo-fi at 85.714 BPM. Rootless e-piano chords use a local FM voice; the progression is
Gmaj9 → F#m11 → Em9 → A7sus4 → Dmaj9, resolving at 11.20. Under it: a round sine bass, a swung mirwas groove and vinyl crackle.
Only the SFX whose picture changed were moved (`cues.json` → `ev._sfxNote`):

| Time | Cue | v1 → this cut |
|---|---|---|
| 0.26 | blinds open: slat ripple + air swish, keys' low-pass opening with the light | unchanged (on the light-bar wipe) |
| 4.15–6.70 | milk pour, thinning as the stream lifts | unchanged: the footage was retimed so the stream breaks on 6.45 |
| 7.70 · 8.40 | bean taps (tick + wooden knock) + pluck D5 on each landing | unchanged times, now on the measured contacts |
| 7.80 · 9.02 | soft secondary contacts | **new times**: bean A grazing off the bean it hit, and bean D tipping onto its side (measured). The v1 "+0.42 s bounces" and the eight out-of-focus taps were removed because the footage has no such contacts |
| 9.90–11.20 | ceramic scrape of the turning cup | **removed**: the AI cup does not turn |
| 11.20 | ceramic clink (v1 hero hit) | **removed**: it had no cause. The Dmaj9 resolve still lands here |
| **11.50** | **hero: the bean drops into the mark** | **promoted** from a small tap to the hero hit (layered wooden tok + a little body + room send), with a −2.5 dB breath in the music just before it (it replaces v1's dip before the clink) |
| 12.75 | blinds close (slat ripple); music bows out −15 dB | unchanged |
| 13.00 | `sonic_logo()` → طشّ hit at 14.12 | unchanged |

Master: `audio.wav` is pre-mastered to −14.1 LUFS with a true peak of −1.5 dBTP (LRA 3.2 LU). The renderer's two-pass loudnorm gives the MP4
**−13.9 LUFS, −1.5 dBTP**. `audio-check.sh` spectrogram: no clicks and no harsh 2–5 kHz build-up; the sub of the TASH hit decays
under the end hold.

---

## Grade and finish (`src/grade.js`, one per-pixel pass, a pure function of t)

- **Per-clip match** (`src/main.js` → `MATCH`): input black point per channel, exposure, white balance and saturation, so the five clips read as one
  morning. The graded black is identical in every shot (21, 15, 12 ≈ HABBA ink). Highlights roll off on a shoulder to a cream cap (251, 243, 228);
  nothing goes to pure white.
- **Shared look:** a slight mid contrast, a constant vignette (−15 to −20% in the corners), kit `grain` at .04 overlay, and a base scale of ≥1.03 on every shot.
- **Light, motivated:** the blinds open and close as a light-bar mask at the footage's own sun angle; S3 has a graduated table falloff under its
  line; S4 and S5 have a static sun pool on the wall behind the roasted type.
- Determinism: with frames rendered in different seek orders, the only differences are ≤ 10 single pixels at 1 level on the right-edge column (from
  kit's grain upscale). I removed `will-change` from the animated words, because the promoted layers gave seek-order-dependent blur.

---

## Known weaknesses (honest)

1. **The blinds never move in the footage.** "The blinds open/close" is a grade effect (a light-bar mask), not a real slat move. It
   reads as light, but it is not a shot of blinds.
2. **S4 needs a scale cut.** The two clean landings in k4 are 1.29 s apart in the source and the copy needs them 0.7 s apart, so S4b is a
   ×1.30–1.33 punch-in on 1080p AI footage. It is softer than the rest at full size. It also cuts out the busy part of the take, including a
   fused double bean (source frames 80–89).
3. **AI artifacts still visible frame by frame:** at 7.70 the hero bean that bean A hits changes pose within one source frame. It reads as
   a knock at speed, but a frame-step shows it. Bean A's motion blur has a streaky texture. In S3 the heart's outline "breathes"
   slightly in the final source frames.
4. **The slow motion is stepped, not interpolated.** S4 runs at 0.75× and 0.5× with real frames only (blend where still, nearest frame where fast).
   The falling beans therefore advance in 2–3-frame steps. Optical-flow in-betweens were tested and rejected for tearing.
5. **«حبّة…» is partly covered by the falling beans for about 0.3 s (7.97–8.25).** This is deliberate (they pass in front of it), but the word is not
   fully clear for that moment.
6. **There is a brightness step at 7.00** from the darker overhead table to the sunlit wall (mean luma 72 → 98). It is motivated by the new
   angle facing the light, and k4 was pulled down 0.35 stop, but it is the biggest exposure step in the film.
7. **The cup no longer turns and carries no mark.** v1's "the cup turns and shows its mark" beat is gone. 9.80–10.80 is a one-second
   breath (cup, steam, wall, the clip's arc) before the logo, so it is quieter than v1 here.
8. Roasted type on the wall measures about 3:1 against the darker light bars, even with the sun pool. It is fine at 150 px and for the
   heavy mark, but it is not a high-contrast setting.
9. In the clean tail (to 15.60) the cup drifts right, and its handle ends close to the right edge.
10. The cue grid is v1's. Cues were not re-timed to the footage; the footage was retimed to the cues. Only the SFX listed above moved.

---

## Review ledger (self-review, hostile CD; numbers measured, not "verified")

| Round | Looked at | Findings → change |
|---|---|---|
| 1 | contact sheet at 4 fps (r1), cut strips f−1/f/f+1 for every cut, 12 full-size stills, freeze/black/scene detect, audio-check | (a) the pitcher ghosted at 6.75 (frame blend) → S3 switched to the motion-adaptive blend; (b) bean B crossed «حبّة…» → depth matte (bean in front of the type); (c) bean D sat behind the word at the scale cut → matte extended to S4b; (d) roasted type measured 2.1–2.7:1 on the darker wall bars → static sun pool on the wall + SPECIALTY COFFEE in roasted; (e) the blinds-close slits were invisible (inCubic) → inOutSine; (f) DOM blur differed by seek order → `will-change` removed |
| 2 | contact sheet at 4 fps (r2/final), cut strips from the encoded MP4, full-size tail strings, clean-mode stills, determinism re-test, luminance across cuts | the 7.00 brightness step (71 → 100) → k4 −0.35 stop (98 now; remaining step accepted and listed above). Freeze detect: only the designed end hold (14.93–15.60). Black detect: only the TASH tail on ink. Final MP4: −13.9 LUFS, −1.5 dBTP |

---

## Files

- `HABBA-concept-9x16.mp4`: the final with audio (1080×1920, 30 fps, H.264 High + AAC 48 kHz, 15.60 s)
- `poster.png`: designed reel cover from a photoreal k5 frame (edit 10.6 s, lifted 90 px). It has a TASH pill + `CONCEPT AD — 03 / COFFEE` +
  «إعلان تجريبي — علامة خيالية», the HABBA mark, HABBA, «قهوتك… على مهلك.» and the cup in the low sun. Everything sits inside the
  profile grid's centre 3:4 (y 240–1680) and the slate is inside the safe area (`?poster=1`). The bottom 90 px, outside the crop, continue the table with
  its own mirror image
- `still-hero.png`: the clean top-down heart at 6.9333 (`?clean=1`, the frame after the pitcher clears)
- `contact-sheet.png`: 2 fps
- `footage/HANDOFF-launch.md`: clean ranges for the launch ad's COFFEE → RING match cut
- `src/`: `index.html` · `main.js` (footage draw, framing, light, depth matte, poster framing) · `grade.js` · `footage.js` (frame loader) ·
  `cues.js` + `cues.json` · `overlay.js` (type, end card, slate, tail) · `poster.js` · `sting-short.js` · `habba-logo.mjs` +
  `habba-logo-data.mjs` · `audio.py` → `audio.wav` · `tools/extract.sh` + `tools/conform.py` (rebuild `src/footage/`) ·
  `tools/build_logo.py` · `_cgi-v1/` (the previous CGI cut, reference only)

URL params: `?clean=1` gives pure footage on the same timeline · `?poster=1` gives the cover · `?t=…` / `?play` give a preview · `?info=1` gives a review HUD
(segment, clip, source frame).
