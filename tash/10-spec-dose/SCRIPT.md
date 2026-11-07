# specialty dose «سبيشلتي دوز» — spec story ad · «ناقصك دوز.»

`SPEC AD — NOT COMMISSIONED BY SPECIALTY DOSE` · «إعلان تجريبي غير رسمي — مقترح من طشّ لـ سبيشلتي دوز»

This is an **unofficial spec story ad** made by TASH for specialty dose, a real specialty café in Al Jahra, Kuwait
(`@sdosecafe`). The owner will post it as a **TASH Instagram story that mentions @sdosecafe**. specialty dose has
**not** commissioned it, approved it or seen it. The tag «إعلان تجريبي · مقترح من طشّ» is in frame for the whole
film, and the film ends on the spec slate (Arabic + English).

| File | Format |
|---|---|
| `DOSE-spec-story-9x16.mp4` | 1080×1920 · 30 fps · H.264 High yuv420p + AAC 48 kHz · 18.00 s · −14.0 LUFS · true peak ≤ −1.5 dBTP (see the review ledger for the measured values) |
| `poster.png` | 1080×1920 story cover / thumbnail: the terrace with dose's real mark on the wall, the mood widget at ١٠٠٪, their line, the spec slate line and the tag |
| `contact-sheet.png` | the film at 4 fps |
| `src/` | the reproducible source (see *Rebuild*) |

> **Footage: AI-generated with Higgsfield (GPT Image 2.6 start frames from the owner's reference screenshots → Kling 3.0
> Turbo / Kling 3.0 Pro / Seedance 2.5), art-directed and reviewed by TASH. Edit, comps, type, motion, sound design and
> signature by TASH.** No generation and no paid call was made for this edit: the footage is final. The reference
> screenshots are not in the repo and never appear in the film.

---

## الفكرة (عربي)

**«ناقصك دوز.»**

«dose» يعني «جرعة». كلنا نعرف يوم المزاج فيه طايح. الإعلان يبدأ ببطارية مزاج: كبسولة برتقالية مكتوب عليها «المزاج»
وواقفة على ١٥٪ وتومض، والدنيا وراها رمادية ومغبّشة: «مزاجك ١٥٪؟» … «ناقصك دوز.».
أول جرعة تدق مع أول ضربة بالموسيقى: الصورة توضح وترجع الألوان، والبطارية تطلع فوق وتشحن خطوة مع نغمة طالعة.
كل لقطة جرعة: البن من إثيوبيا والسلفادور وكولومبيا (الأسامي تنطبع على كروت المطاحن)، الفلتر البارد والثلج يطيح من
الإبريق مع القهوة، الإسبريسو ينصب على الحليب والثلج، والكيكة والصوص ينصب عليها.
على الطاولة البرتقالية برّا تنشحن البطارية ١٠٠٪ بنص الشاشة (مثل البداية، بس مليانة)، والكاميرا ترتفع لين لوحة dose
على الجدار الأبيض، وتنزل جملتهم هم: «تعديل المزاج يبدأ من هنا.».
اللوحة نفسها تصير شعارهم: الجدار يذوب لأبيض الجص والشعار ثابت بمكانه، وبعدين يستقر بالنص مع «سبيشلتي دوز · الجهراء»
و@sdosecafe. آخر شي توقيع طشّ ولوحة «إعلان تجريبي غير رسمي».

## The idea (English)

«dose» means «جرعة». Everyone knows a low-mood day. The film opens on a **mood battery**: an orange pill battery
labelled «المزاج», stuck at **١٥٪** and blinking, over a grey, out-of-focus café: «مزاجك ١٥٪؟» … «ناقصك دوز.» ("Mood at
15%? You're missing a dose."). The first dose lands on bar 1: focus and colour come back, the battery flies to the top
of frame and charges a step, with a rising note. Every shot is one dose: beans from Ethiopia, El Salvador and Colombia
(the names print onto the hopper cards), iced filter with the ice tumbling out of the carafe with the coffee, espresso
into iced milk, the cake under its sauce. On the orange terrace table the battery returns to centre stage and pops to
**١٠٠٪** (the hook's 15 % and the payoff's 100 % rhyme), the camera cranes up to the orange dose sign on the white wall,
and their own line lands: «تعديل المزاج يبدأ من هنا.» ("Mood adjustment starts here."). Then the sign becomes the end
card: the wall dissolves to white plaster while the mark stays put, and the lockup settles centre-frame with
«سبيشلتي دوز · الجهراء» and `@sdosecafe`. TASH signature + spec slate.

**What it buys dose:** one simple device (a mood battery anyone reads with the sound off) that turns their menu into
"doses", ends on their own tagline, and lands their real mark. Story-native: sticker-like UI, 18 s, one story segment.

**Facts used (only from dose's own posts and sign):** the name, the mark, the handle, Al Jahra, the three origins from
their caption (Ethiopia, El Salvador, Colombia), the drinks and the cake they serve (the cake is not named), and their
tagline. No prices, hours, awards, "best", reviews, people or faces. Card labels are names only (no process / altitude /
notes).

---

## Timeline (seconds; 100 BPM: 1 beat = 0.6 s = 18 frames; the music's bar 1 = the first dose at 1.8 s)

Source of truth: `src/cues.json` (cue times, meter steps, the edit list `footage.segs`; read by the page, the footage
tools and `src/audio.py`).

| # | Edit | Source (clip · in → out · speed) | Picture | Text · meter |
|---|---|---|---|---|
| S0 HOOK | 0.00–1.80 | d1_grinders · frame 0 held | The grinders, grey (sat 0.1), dark (×0.4) and out of focus (a 16× down/up blur ladder) under the big mood widget (1.85×, centre) | «مزاجك ١٥٪؟» 0.10 · «ناقصك دوز.» 0.90 · ١٥٪ blinking (red-orange fill, two low-battery blips 0.08 / 0.68) |
| S1 dose 1 | 1.80–4.20 | d1_grinders · 0.00 → 2.47 s · eased out of the hold, ≈1.0× | No cut: focus, light and colour come back on the downbeat (+16 % flash), the widget flies to the top. Slider past the hoppers; top-right anchored 1.12→1.15× frame (keeps grinder 2's invented rating plate out of frame) | «جرعة من إثيوبيا…» 2.00 (ETHIOPIA prints on card 1) · «…والسلفادور» 3.00 (EL / SALVADOR, card 2) · «…وكولومبيا» 3.60 (COLOMBIA, card 3) · ٣٥٪ |
| S2 dose 2 | 4.20–6.60 | d2d_carafe · 1.567 → 3.933 s (f37.6–f94.4) · 1.0×, nearest-frame | Gloved hand pours iced filter from the carafe's spout; the cubes slide over the lip with the coffee and tumble into the dose cup (the owner's shot) | «جرعة صافية.» 4.36 · ٥٥٪ |
| S3 dose 3 | 6.60–8.40 | d3_iced · 0.117 → 1.883 s (part A, f2.8–f45.2) · 1.0× | Espresso from the glass pitcher into iced milk, the whole wordmark above the reply bar | «جرعة باردة.» 6.74 · ٧٥٪ |
| S4 dose 4 | 8.40–10.20 | d4_cake · 0.000 → 1.472 s (f0–f35.3) · 0.83× | The cocoa-crumble square on the steel tray, milky coffee sauce ribbon, push-in | «وجرعة حلا.» 8.54 · ٩٥٪ |
| S5 100 % | 10.20–13.20 | d5b_terrace · 2.300 → 4.931 s (f55.2–f118.3) · 0.81× (runs to 13.5 under the dissolve) | Tray (espresso, yellow cup, cake) on the orange table → crane up past the bistro chairs → rack focus onto dose's sign (the real mark, comped) | the widget returns to centre (1.55×) and pops to **١٠٠٪** at 10.80 (two rings, sheen), exits 11.50 · «تعديل المزاج يبدأ من هنا.» 11.85 (ink, on the wall) |
| S6 END CARD | 13.20–15.30 | — | **Graphic match:** the flat mark appears exactly over the wall sign (13.20), the wall dissolves to warm plaster white (13.20–13.52), then the lockup (line + mark) leaves at the camera's own speed and settles centre-frame (13.30–14.25, Hermite ease); a 1.4 % breath on the hold | «تعديل المزاج يبدأ من هنا.» · mark (600 px wide = 56 % of the frame) · «سبيشلتي دوز · الجهراء» + `@sdosecafe` 13.70 |
| S7 TASH | 15.30–18.00 | — | An ink panel wipes up over the end card (15.08–15.30) and lands on the TASH signature (local `sting-short.js`: typing dots → converge → snap 16.42 → shadda → «خلّهم يسولفون عنك!» → @tash.creative.kw) | slate from 15.45: `SPEC AD — NOT COMMISSIONED BY SPECIALTY DOSE` · «إعلان تجريبي غير رسمي — مقترح من طشّ لـ سبيشلتي دوز» |

Whole film: the tag «إعلان تجريبي · مقترح من طشّ» (IBM Plex Sans Arabic 500, 27 px, on an ink pill with a lime dot),
bottom-right at y ≈ 1566–1612, above the story reply bar.

**Rhythm:** the montage tightens 4 → 4 → 3 → 3 beats, then the payoff gets 5 beats. Cuts at 4.2 and 6.6 sit on bar lines,
8.4 and 10.2 on beat 3. The hook → dose 1 is not a cut (the held frame comes alive on the downbeat).

---

## On-screen copy (proofread at full size: RTL order, punctuation side, Arabic-Indic digits, whole words only)

| Time | Text | Type / place |
|---|---|---|
| 0.10–1.70 | **مزاجك ١٥٪؟** | Alexandria 800, 118 px, white, soft shadow; above the widget. Rise + unblur per word |
| 0.90–1.75 | **ناقصك دوز.** | same, below the widget |
| whole film until 11.8 | **المزاج** · battery · **١٥٪ → ٣٥٪ → ٥٥٪ → ٧٥٪ → ٩٥٪ → ١٠٠٪** | the mood widget: a white pill (story-sticker language), «المزاج» Alexandria 700 36 px ink, an orange (#F26A21) pill battery that fills right→left (Arabic's direction) with its nub on the left, the percentage Alexandria 800 40 px counting up in Arabic-Indic digits |
| 2.00 / 3.00 / 3.60 | **جرعة من إثيوبيا…** · **…والسلفادور** · **…وكولومبيا** | white chips under the widget, Alexandria 700 54 px ink, the origin in dose orange; a sticker pop on the beat |
| 4.36 · 6.74 · 8.54 | **جرعة صافية.** · **جرعة باردة.** · **وجرعة حلا.** | same chips; the dose word in orange |
| 2.0–4.2 (on the cards) | `ETHIOPIA` · `EL / SALVADOR` · `COLOMBIA` | Archivo ExtraBold, expanded (wght 800, wdth 118), black ink, top-left of each card like dose's bar cards; homography-tracked, the card's light and defocus |
| 11.85–15.1 | **تعديل المزاج يبدأ من هنا.** | dose's own line. Alexandria 700, 64 px, ink #1B1511 on their white plaster; rides into the end-card lockup |
| 13.70–15.1 | **سبيشلتي دوز · الجهراء** · `@sdosecafe` | IBM Plex Sans Arabic 600, 42 px ink · 36 px dose orange |
| 15.45–18.0 | `SPEC AD — NOT COMMISSIONED BY SPECIALTY DOSE` · **إعلان تجريبي غير رسمي — مقترح من طشّ لـ سبيشلتي دوز** | JetBrains Mono 600 22 px · IBM Plex Sans Arabic 500 33 px |
| 16.4–18.0 | **طشّ** · **خلّهم يسولفون عنك!** · @tash.creative.kw | TASH signature (the only lime in the film besides the tag's dot) |

Everything that reads sits inside the story safe area (y 250–1620, x 64–1016).

---

## Footage: clean ranges used, and what was fixed (no footage outside the reviews' clean ranges)

| Clip | Review range used | Fix in post (all in `src/tools/`, baked by `prep.py` before the conform) |
|---|---|---|
| `d1_grinders.mp4` | 0.00–2.50 s (the review's "recommended" range, which needs the grinder-2 rating plate removed) | **Plate:** not painted; kept out of frame by a top-anchored ≥ 1.12× frame (the plate starts at source y ≈ 1745 > 1920/1.12). The second plate (grinder 3) appears only after 3.5 s (unused). **Cards:** `fx_cards.py` tracks cards 1–3 (per-frame line fits of the four card edges, RANSAC so the clip's notch is ignored; corners fitted over time with a robust degree-5 polynomial: crisp right/bottom edges fit to ~0.3 px) and prints ETHIOPIA / EL SALVADOR / COLOMBIA with the card's homography, its light and defocus (card 3 is soft in the clip, σ 2.2), each name inking in over 0.12 s on its Arabic word's beat |
| `d2d_carafe.mp4` (Seedance 2.5, 720p) | 1.567–3.933 s, inside the best range 1.54–3.96 (cut before the f100 ice-pile pop) | Upscaled ×1.5 (lanczos + light unsharp 0.45). **«specialty» re-comp** (`fx_specialty.py`): the stream, the falling cubes and the foam were drawn in front of the printed line. The rigid «dose» letters are tracked (scale + translation) against f110 (clean «specialty» on dark coffee), each frame is refined on its own visible ink (±8 px search), the AI's misplaced ink around the letters is lifted out (small Telea fill), and the clean line goes on top as opaque ink in that frame's own «dose» colour, so the stream and ice sit behind the print (f36–f99). **Cadence:** nearest frame (no blending of transparent ice), the 24p repeats placed on f4k+2 so a hold never sits on the model's double step (f4k−1 → f4k) |
| `d3_iced.mp4` | part A, 0.117–1.883 s (never across the hard cut at 1.958 s; last blend pair f45/f46) | none needed; warmed in the grade (the cool one) |
| `d4_cake.mp4` | 0.000–1.472 s (f0–f35.3; the only clean range, one square cake) | none needed; 0.83× linear blend |
| `d5b_terrace.mp4` (Kling 3.0 Pro) | 2.300–4.931 s (inside 2.29–5.04: no paint needed) | **Espresso steam (owner: «الاسبرسو مايطلع منه دخان»):** the steam exists only in 0.00–2.20 s; the edit starts at 2.30 s. Checked frame by frame at full size (source f55–f66 around the cup, then the 8 fps film): no wisp or ghost. **Wall sign** (`fx_sign.py`): the AI redrew the letterforms (separate letters, bold condensed specialty/cafe). The sign is tracked (scale + translation vs f117, cubic fit, residual ≤ 2.3 px), its defocus measured per frame (σ ≈ 2.1 px until the rack at ~3.6 s, ~0.5 px at the end), the AI sign and its shadow are removed with a cloned-plaster clean plate (nearest valid wall offsets, Poisson-blended, the window arch excluded), and dose's real mark (`logo_a.png`, the plate's own pixels) is placed on the wall (−1.07°, 478 px wide at f117) with a 2–3 px return edge, the measured offset drop shadow (+19, +10 px, 30 %), the wall's leaf-shadow pattern and the frame's defocus. The same placement drives the end card's match |
| `frames/logo_plate.png` | — | `key_logo.py`: keyed by colour projection, de-noised at 2× and re-thresholded (no redrawing), set to dose orange #F26A21 (the plate measured #EC6C19). It fills 56 % of the frame width on the card (the plate filled 85 %) |

Never used: `d5_terrace` (rejected by the owner: «باهتة», and the yellow cup straddled the tray rim), `d2_carafe`,
`d2c_carafe` and everything in `_rejected/`.

---

## Higgsfield jobs and credits (from the session's balance log; this edit made no call)

| Asset | Job (model) | Credits | Status |
|---|---|---|---|
| d1_grinders still | df7f621d-2e12-4d8a-b2e2-8ec0fbc07313 (GPT Image 2.6, medium 2k) | 1 | **used** (start of d1) |
| d2_carafe still v1 | 9fb417e2-7c57-4a4d-bfc2-524aa126122a (GPT Image 2.6) | 1 | rejected (pour from the wrong lip) |
| d3_iced still | 291248a5-6f75-4700-8c8e-1debbdaa9e39 (GPT Image 2.6) | 1 | **used** (start of d3) |
| d4_cake still | 2a4787a0-99c1-4fd1-a897-37daef6e9da4 (GPT Image 2.6) | 1 | **used** (start of d4) |
| d5_terrace still v1 | 792c7a49-b9b5-425f-af95-7b4777f068df (GPT Image 2.6) | 1 | rejected |
| logo_plate | 836ec4b1-c66c-4f9d-b693-9588a89047bc (GPT Image 2.6) | 1 | **used** (end card + the wall-sign comp) |
| d5_terrace still v2 | 90641f03-4d2e-406c-b9d0-3e769372fba5 (GPT Image 2.6) | 1 | rejected |
| d5_terrace still v3 | 3e1df8d5-c10b-429d-8a47-5c5b3f540062 (GPT Image 2.6) | 1 | start of the rejected d5 video |
| d1_grinders video | 966b1da7-deb5-4d4c-9585-79499a8a934b (Kling 3.0 Turbo, 1080p, 5 s) | 10 | **used** |
| d2_carafe video v1 | cb2b423b-fe8b-4b4b-8b7b-883c0d2729dc (Kling 3.0 Turbo) | 10 | rejected (wrong-side pour) |
| d3_iced video | 46fb5e98-5dc8-4381-8d83-791f4d8edd5f (Kling 3.0 Turbo) | 10 | **used** (part A) |
| d4_cake video | f1086e5b-fdd8-453e-90d1-8152648013c7 (Kling 3.0 Turbo) | 10 | **used** (0–1.5 s) |
| d5_terrace video | 863648f9-9c59-4390-be41-a51b3ef64431 (Kling 3.0 Turbo) | 10 | rejected by the owner («باهتة») |
| d2_carafe still v2 | 0f448f38-4373-412e-ab08-f97eb04a2acb (GPT Image 2.6) | 1 | start of d2 v2 (rejected) |
| d2_carafe video v2 | c49fb7bc-32f0-4256-a257-09200e224f6d (Kling 3.0 Turbo) | 10 | rejected (no ice) |
| d5 v4 still (no hand, crane-up) | 6f58fc6b-c2be-4e00-b2be-bd99ec26326d (GPT Image 2.6) | 1 | **used** (start of d5b) |
| d5b_terrace video | 917b5e39-0c56-4f6b-ba28-46f15517dc63 (Kling 3.0 Pro, sound off) | 8.75 | **used** |
| d2c still (iced re-shoot) | 495db32d-8119-4266-9b0e-2198fa8d0ee2 (GPT Image 2.6 high 2k) | 2.75 | start of d2c (rejected) |
| d2c draft | cc7c7323-0a94-4fc8-ad65-d25fddd9f817 (Seedance 2.5, 480p) | 15 | draft only |
| d2c final | 3d060079-e9d6-4eb2-9766-ec99e075a8eb (Seedance 2.5, 1080p) | 80 | rejected (the ice stays in the carafe) |
| d2d still (ice falling) | 4a88e208-fee5-45e9-ba73-0bc35168f065 (GPT Image 2.6 high 2k) | 2.75 | **used** (start of d2d) |
| d2d video | af71658d-b0ee-4bb9-b4b9-22d3b9e79ef2 (Seedance 2.5, 720p) | 35 | **used** |

**Totals:** stills 15.50 · videos 198.75 · **214.25 credits** for the ad (balance 253.75 at the start →
**39.50 by this arithmetic**). The log records the balance after each step up to 175.00, and only "before" values for
the last steps (157.25 before the d2c final, 77.25 before the d2d still), so the closing **39.50 needs confirmation with
`balance`** (the parent session owns the balance log). Credits on the six assets in the film: 1 + 1 + 1 + 1 + 1 + 10
+ 10 + 10 + 8.75 + 2.75 + 35 = 81.50.

---

## Sound (original; `src/audio.py` → `src/audio.wav`; engine `_system/audio/tashaudio.py`)

Warm house / lo-fi at **100 BPM** in F, bar 1 on the first dose (1.8 s). Rootless e-piano chords (the MOR FM voice)
**Fmaj9 | Dm9 | Bbmaj9 · Gm9 | C9sus4 … Bbmaj9 · C9sus4 | Fmaj9 on the match** (the sign becomes the mark = home), a round
bass, a soft four-on-the-floor kick, finger snaps on 2 & 4 from dose 2, a swung shaker, a light sidechain duck.

| Time | Cue |
|---|---|
| 0.00–1.80 | the flat room: a muffled pulse on the beats, a dull lowpassed pad; **low-battery chirps** 0.08 / 0.68; a charging riser into the downbeat |
| **1.80** | power-on: soft impact + whoosh; music in; **pluck C5** (35 %) |
| 1.85–3.6 | grinder whirr (motor + burr grit) and beans rattling in the hopper |
| **4.20** | **pluck D5** (55 %); the iced pour; ice plunging into the cup on the visible landings 4.76 / 5.05 / 5.26 / 5.51 / 5.76 / 6.01 / 6.47 |
| **6.60** | **pluck F5** (75 %); the espresso pour; ice shifting 6.95 / 7.60 |
| **8.40** | **pluck G5** (95 %); the sauce |
| 10.20 | the spoon on the saucer; the terrace (open air, a far car, two birds); the groove thins to the shaker (the build) |
| **10.80** | **١٠٠٪: A5 + C6** (the 4-note motif resolves), shimmer, soft impact; full groove back |
| 11.35 | a bistro chair scraped on the pavement |
| 11.85 | the music dips 2 dB under their line |
| **13.20** | the match: whoosh, **Fmaj9** resolve + bell, last kick |
| 15.08–15.30 | everything bows out under the ink wipe |
| 15.30 | `sonic_logo()` → the طشّ hit on the snap (16.42) |

Master: −14 LUFS integrated, true peak held at −1.6 dBTP by an explicit 4× oversampled limiter loop in `audio.py`; the
render muxes it with a two-pass linear loudnorm (−14 LUFS, −1.5 dBTP).

---

## Grade and finish (`src/grade.js`, one per-pixel pass, a pure function of t)

- Per-clip match (`main.js → MATCH`): d2d gets more contrast (coffee deeper, less amber), d3 is warmed (wb 1.045 / 1 / 0.91),
  the rest a light contrast lift. The shared look: soft highlight shoulder, blacks to a warm coffee-black (14, 10, 8), whites
  capped at warm plaster white (254, 250, 244). A light vignette, kit grain at .045 overlay (the 720p d2d and the Kling
  clips share one grain), base scale ≥ 1.03 on every shot.
- The hook: saturation 0.1, exposure 0.4, the blur ladder; all three release on the downbeat.
- Palette: dose orange #F26A21 / white / ink in their world. TASH lime only in the tag's dot and the TASH tail.

---

## Known weaknesses (honest)

1. **The wall sign is a comp.** At full size the cloned plaster around the mark is a touch brighter in places (a soft halo
   at the top of «dose»), and the leaf shadows on the letters are the wall's, held still (the clip's own leaf shadows
   barely move). At story size it reads as their sign; a frame-by-frame look can find it.
2. **«specialty» on the d2d cup:** in a few frames (≈ f66–f80) a 1 px edge of the AI's own ink still shows beside the
   re-comped letters. It reads as print at 1080; zoomed in it is a slight double edge.
3. **d2d keeps the model's micro-judder** (every 4th frame steps twice as far). The 24p cadence was placed so it is not
   amplified, but it is there. The carafe's rim outline is a little wavy (Seedance).
4. **The hook is a held frame** (1.8 s), deliberately grey and out of focus; it comes alive on the downbeat.
5. **COLOMBIA on card 3 is small and soft** (it matches the card's own defocus). The Arabic chip carries the word.
6. **d5b's left edge:** the parked car becomes soft AI mush after ≈ 4.0 s (source); it sits at the frame edge, out of focus.
7. Foley is synthesised (pour, ice, grinder, chair): it is designed sound, not recorded sound.

---

## Review ledger

| Round | Looked at | Findings → change |
|---|---|---|
| Comp tests (builder) | sign at f60/f80/f100/f118 before/after at 2×; «specialty» on 15 frames f37–f95; labels on f0/20/40/60 | sign plate v1 smeared (Telea/FSR) → clone-from-wall + Poisson; the mark was distorted by an affine fit (rejected: never alter the mark) → similarity only, sized to cover the AI sign; the arch reveal got filled → excluded by colour. «specialty» alpha caught the foam edge and bubbles → letters only; doubled edges → per-frame refinement on the visible ink + stray-ink lift. Card corners jittered on the soft left edges → robust degree-5 fit |
| Stills (builder) | 15 full-size stills | the hook blur showed a grid (single 16× upscale) → a 2× ladder; the low fill was too pale → floor 0.42; the line «تعديل المزاج يبدأ من هنا.» touched the tree → 64 px; the end-card lockup sat high → +50 px |
| MP4 v1 (builder, 8 fps, all 144 frames) | every cut and text change | ETHIOPIA showed faintly two frames before its cue (blend of an inked source frame) → the print-on keys off the previous source frame; the widget overlapped the sign on the terrace for 1.3 s → it returns to centre stage for the ١٠٠٪ peak (rhymes with the hook); «ناقصك دوز.» ghosted past the downbeat → the hook lines exit at 1.50; the end card → tail dip went through grey → an ink panel wipes up; the info line came late → 13.70 |
| MP4 v2 | see the final check below | |

---

## Files (`src/`)

- `index.html` · `main.js` (footage draw + framing, the hook, the end-card plaster and the sign's screen affine) ·
  `grade.js` · `layout.js` · `overlay.js` (the tag, hook lines, the mood widget, chips, their line, the end-card mark and
  info, slate, TASH tail) · `poster.js` (`?poster=1`) · `sting-short.js` (copied from the MOR ad) · `footage.js` ·
  `cues.js` + `cues.json` · `style.css`
- `audio.py` → `audio.wav`
- `tools/common.py` (decode at the edit geometry, the time map) · `tools/key_logo.py` → `assets/logo.png`, `logo_a.png`,
  `logo.json` · `tools/fx_sign.py` → `assets/sign.json`, `sign_plate.png`, `sign_mask.png` · `tools/fx_specialty.py` →
  `assets/specialty.json`, `specialty_a.png` · `tools/fx_cards.py` → `assets/cards.json` · `tools/prep.py` (applies the
  fixes to the used source frames → `footage/_src/`, ~590 MB lossless, git-ignored) · `tools/conform.py` → `footage/<A–E>/`
  (30 fps JPEG sequences, ~83 MB) + `footage/manifest.json` · `tools/extract.sh` (prep + conform)

## Rebuild (from `tash/`)

Needs ffmpeg, Node + Playwright (as for the other ads), Python 3 with numpy, scipy, pillow and OpenCV
(`pip install opencv-contrib-python-headless`).

```
python3 10-spec-dose/src/tools/key_logo.py          # assets/logo*.png (committed; only if the plate changes)
python3 10-spec-dose/src/tools/fx_sign.py           # assets/sign*.json/png (committed; ~5 min)
python3 10-spec-dose/src/tools/fx_specialty.py      # assets/specialty* (committed)
python3 10-spec-dose/src/tools/fx_cards.py          # assets/cards.json (committed)
bash 10-spec-dose/src/tools/extract.sh              # footage/_src (fixed source frames) → footage/A–E
python3 10-spec-dose/src/audio.py                   # src/audio.wav
node _system/tools/render.mjs --page 10-spec-dose/src/index.html --out 10-spec-dose/DOSE-spec-story-9x16.mp4 --audio 10-spec-dose/src/audio.wav --workers 4
node _system/tools/render.mjs --page "10-spec-dose/src/index.html?poster=1" --stills 0 --stills-dir review/dose --prefix poster   # → poster.png
bash _system/tools/contact.sh 10-spec-dose/DOSE-spec-story-9x16.mp4 10-spec-dose/contact-sheet.png 4
bash _system/tools/audio-check.sh 10-spec-dose/DOSE-spec-story-9x16.mp4
```

---

## ملاحظة النشر (للمالك)

- انشره **ستوري** من حساب طشّ، والفيديو كامل بمقطع واحد (١٨ ثانية). لا تقصّه ولا تكبّره.
- سوّ **منشن** لـ @sdosecafe، وحط ستيكر المنشن صغير **تحت على اليسار**؛ لا تغطي علامة «إعلان تجريبي · مقترح من طشّ» اللي
  تحت على اليمين، ولا تحط شي فوق لوحة النهاية.
- **لا تحط ستيكر موسيقى.** الصوت أصلي ومركّب على الإعلان، وأي أغنية بتغطي عليه.
- نص مقترح للستوري (يكتب كنص أو مع المنشن):
  «سوّينا فكرة إعلان ستوري لـ @sdosecafe على طريقتنا. ترى هذا إعلان تجريبي غير رسمي من طشّ، مو بطلب منهم.»
- لا تقول إنه شغل مطلوب منهم، ولا تضيف أسعار أو أوصاف أو "الأفضل".
- إذا ردّوا عليك: اشكرهم. وإذا طلبوا تشيله، شيله على طول.
