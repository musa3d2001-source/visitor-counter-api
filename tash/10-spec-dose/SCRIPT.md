# specialty dose «سبيشلتي دوز» — spec story ad · «ناقصك دوز.»

`SPEC AD — NOT COMMISSIONED BY SPECIALTY DOSE` · «إعلان تجريبي غير رسمي — مقترح من طشّ لـ سبيشلتي دوز»

This is an **unofficial spec story ad** made by TASH for specialty dose, a real specialty café in Al Jahra, Kuwait
(`@sdosecafe`). The owner will post it as a **TASH Instagram story that mentions @sdosecafe**. specialty dose has
**not** commissioned it, approved it or seen it. The tag «إعلان تجريبي · مقترح من طشّ» is in frame for the whole
film, and the film ends on the spec slate (Arabic + English).

| File | Format |
|---|---|
| `DOSE-spec-story-9x16.mp4` | 1080×1920 · 30 fps · H.264 High yuv420p + AAC 48 kHz · 18.00 s · −14.0 LUFS integrated · true peak −2.1 dBTP · LRA 1.6 LU (measured on the v3 MP4 with `audio-check.sh`) |
| `poster.png` | 1080×1920 story cover (film time 12.45 s): the terrace with the recreated dose mark on the wall (the leaf shadows fall across the letter faces), the mood widget at ١٠٠٪, their line (v3: riding the wall above the sign, 40 px right of centre, clear of the tree), the spec slate line «إعلان تجريبي غير رسمي — مقترح من طشّ لـ سبيشلتي دوز» and the tag. The film's own frame 0 (what loads first) is the grey pour with «مزاجك ١٥٪؟» landed and the red battery |
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
وواقفة على ١٥٪ وتومض، ووراها القهوة والثلج ينصبون من الإبريق بس الدنيا رمادية ومغبّشة: «مزاجك ١٥٪؟» … «ناقصك دوز.».
أول جرعة تدق مع أول ضربة بالموسيقى: قطع على المطاحن بكامل ألوانها، والبطارية تطير فوق على اليسار وتشحن خطوة مع نغمة طالعة.
كل لقطة جرعة: البن من إثيوبيا والسلفادور وكولومبيا (الأسامي تنطبع على كروت المطاحن)، الفلتر البارد والثلج يطيح من
الإبريق مع القهوة، الإسبريسو ينصب على الحليب والثلج، والكيكة والصوص ينصب عليها.
على الطاولة البرتقالية برّا ترجع البطارية لنص الشاشة وتنشحن ١٠٠٪ (مثل البداية، بس مليانة)، والكاميرا ترتفع لين لوحة dose
على الجدار الأبيض، وتنزل جملتهم هم: «تعديل المزاج يبدأ من هنا.».
اللوحة نفسها تصير شعارهم: الجدار يذوب لأبيض الجص والشعار ثابت بمكانه، وبعدين يستقر بالنص مع «سبيشلتي دوز · الجهراء»
و@sdosecafe. آخر شي توقيع طشّ ولوحة «إعلان تجريبي غير رسمي».

## The idea (English)

«dose» means «جرعة». Everyone knows a low-mood day. The film opens on a **mood battery**: an orange pill battery
labelled «المزاج», stuck at **١٥٪** and blinking, over a grey, out-of-focus pour (ice tumbling out of the carafe with the
coffee: the start of the very pour S2 pays off in colour): «مزاجك ١٥٪؟» … «ناقصك دوز.» ("Mood at 15%? You're missing a
dose."). The first dose lands on bar 1: a hard cut to the grinders in full colour, the battery flies to the top-left
and charges a step, with a rising note. Every shot is one dose: beans from Ethiopia, El Salvador and Colombia
(the names print onto the hopper cards), iced filter with the ice tumbling out of the carafe with the coffee, espresso
into iced milk, the cake under its sauce. On the orange terrace table the battery returns to centre stage and pops to
**١٠٠٪** (the hook's 15 % and the payoff's 100 % rhyme), the camera cranes up to the orange dose sign on the white wall,
and their own line lands: «تعديل المزاج يبدأ من هنا.» ("Mood adjustment starts here."). Then the sign becomes the end
card: the wall dissolves to white plaster while the mark stays put, and the lockup settles centre-frame with
«سبيشلتي دوز · الجهراء» and `@sdosecafe`. TASH signature + spec slate.

**What it buys dose:** one simple device (a mood battery anyone reads with the sound off) that turns their menu into
"doses", ends on their own tagline, and lands their mark. Story-native: sticker-like UI, 18 s, one story segment.

**About the mark:** every dose mark in the film (the wall sign, the S2 and hook cup print, the end card) is a **faithful
recreation of dose's mark, not their own file**: `frames/logo_plate.png` (GPT Image 2.6, job 836ec4b1), keyed by
`key_logo.py` and matched to ref06 in proportion, used under the owner-approved brief. Never tell dose «we used your
logo file».

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
| S0 HOOK | 0.00–1.80 | d2d_carafe · 0.00 → 1.47 s (f0–f35.3) · 0.83×, blend | **v2: moves from frame 1.** The start of the iced pour (the ice tumbles out of the carafe with the coffee; S2 continues the same pour from f37.6), grey (sat 0.1), dark (×0.4) and defocused (an 8× down/up blur ladder, so the falling ice still reads), a slow 1.00→1.10 push-in, under the big mood widget (1.85×, centre). v3: the cup in the hook carries the recreated lockup too (it showed the AI's off-model «doee» print through the blur) | «مزاجك ١٥٪؟» already landed on frame 0 (the thumbnail) · «ناقصك دوز.» 0.42 (v3; sharp ≈ 0.63–1.56) · ١٥٪ solid red-orange on frame 0, then blinking on the two low-battery chirps 0.08 / 0.42 |
| S1 dose 1 | 1.80–4.20 | d1_grinders · 0.00 → 2.96 s · exactly 1.25× (every edit frame is one whole source frame; the clip's own near-static first 0.75 s eases the start) | **Hard cut on the downbeat** from the grey pour to the grinders in full colour and focus (+16 % flash); the widget flies to the top-left. Slider past the hoppers; top-right anchored 1.12→1.14× frame (keeps grinder 2's invented rating plate out of frame); **v3: from 3.30, as COLOMBIA prints, the frame pushes in on card 3 (1.14→1.30×, ease in-out, the window's top-left corner held), so card 3 grows toward the centre**; card 1 leaves frame right at the end, as the camera passes it | **v3: the origin chips STACK** (one row each, 94 px apart, under the widget): «جرعة من إثيوبيا…» 2.00 (ETHIOPIA prints on card 1) · «…والسلفادور» 2.70 (EL / SALVADOR, card 2) · «…وكولومبيا» 3.30 (COLOMBIA, card 3); all three leave together at 4.08 · ٣٥٪ |
| S2 dose 2 | 4.20–6.60 | d2d_carafe · 1.567 → 3.933 s (f37.6–f94.4) · 1.0×, nearest-frame | Gloved hand pours iced filter from the carafe's spout; the cubes slide over the lip with the coffee and tumble into the dose cup (the owner's shot). The cup carries the recreated dose lockup (v2; v3: one clean «e», opaque «specialty») | widget + chip mid-left over the dark forearm (widget y ≈ 700–780, chip ≈ 790–872, x 64–480; the stream runs at x ≥ 527 there) · «جرعة صافية.» 4.36 · ٥٥٪ |
| S3 dose 3 | 6.60–8.40 | d3_iced · 0.117 → 1.883 s (part A, f2.8–f45.2) · 1.0× | Espresso from the glass pitcher into iced milk, the whole wordmark above the reply bar | widget + chip top-left over the grey backdrop (the pitcher and its stream are at x ≥ 495) · «جرعة باردة.» 6.74 · ٧٥٪ |
| S4 dose 4 | 8.40–10.20 | d4_cake · 0.000 → 1.276 s (f0–f30.6) · 0.72× | The cocoa-crumble square on the steel tray, milky coffee sauce ribbon, push-in; out before the sauce channel starts to read as a split (v2) | widget + chip top-left over the wall (the sauce ribbon falls at x ≈ 540) · «وجرعة حلا.» 8.54 · ٩٥٪ |
| S5 100 % | 10.20–12.60 | d5b_terrace · 2.300 → 4.967 s (f55.2–f119.2) · 1.0×, **true 30p** (v2: motion-compensated in-betweens; runs to 12.9 under the dissolve) | Tray (espresso, yellow cup, cake) on the orange table → crane up past the bistro chairs → rack focus onto dose's sign (the recreated mark, comped). v3: the in-betweens no longer tear (see Footage) | the widget is re-placed at centre stage **on the 10.20 cut** (a 0.24 s pop-in, 1.05→1.55×; the wall sign is never covered) and lands **١٠٠٪ on the 10.80 frame** with the A5 + C6 notes (pop, two rings, sheen), exits 11.40 · «تعديل المزاج يبدأ من هنا.» 11.70 (v3; ink on the wall as the sign racks into focus, **riding the wall**: it drifts down with the crane, 12 px above the sign, 40 px right of centre to clear the tree) |
| S6 END CARD | 12.60–15.30 | — | **Graphic match:** the flat mark fades in exactly over the wall sign (12.60–12.68), the wall dissolves to warm plaster white (12.60–12.92); v3: under the dissolve the plate cross-fades (f380 50 %, f381 on) to the same frames with the AI sign removed and no mark (`Ec`), so the moving mark leaves no ghost sign behind; then the lockup (line + mark) leaves at the camera's own speed and settles centre-frame (12.70–13.65, Hermite ease; the line eases back to centre); a 1.4 % breath on the hold | «تعديل المزاج يبدأ من هنا.» · mark (600 px wide = 56 % of the frame) · «سبيشلتي دوز · الجهراء» + `@sdosecafe` 13.15 |
| S7 TASH | 15.30–18.00 | — | An ink panel wipes up over the end card (15.08–15.30, now with a soft whoosh) and lands on the TASH signature (local `sting-short.js`: typing dots → converge → snap 16.42 → shadda → «خلّهم يسولفون عنك!» → @tash.creative.kw) | slate from 15.30 (v3; 0.25 s fade, fully on ≈ 15.45–18.0), **under the TASH lockup** (y ≈ 1300–1400, v2; was under the IG header): «إعلان تجريبي غير رسمي — مقترح من طشّ لـ سبيشلتي دوز» · `SPEC AD — NOT COMMISSIONED BY SPECIALTY DOSE` |

Whole film: the tag «إعلان تجريبي · مقترح من طشّ» (IBM Plex Sans Arabic 500, 27 px, on an ink pill with a lime dot),
bottom-right at y ≈ 1544–1590 (v3: 22 px higher), above the story reply bar.

**Rhythm:** the montage tightens 4 → 4 → 3 → 3 beats, then the payoff gets 4 beats and the end card 4½. The hook → dose 1 cut (1.8)
and the cuts at 4.2 and 6.6 sit on bar lines, 8.4, 10.2 and the match at 12.6 on beat 3. Every meter step lands its **number,
bump and fill surge on the cue frame** (f54, f126, f198, f252, f324), with its pluck (v2; v1 counted up for 0.34 s and landed ~7
frames late). The origin chips land on half-beats (2.0 / 2.7 / 3.3) and stack (v3).

**Overlay placement rule (owner, v2):** the widget + chip never sit on the money moment. Through the montage they are a left-aligned
0.8× stack re-placed on each cut (S1 top-left over the wall, S2 mid-left over the forearm, S3 top-left over the backdrop, S4
top-left over the wall), clear of the carafe spout, the ice over the lip, the stream, the pitcher and the sauce ribbon. v3: the
S1/S3/S4 stack starts 30 px lower (widget top ≈ 292, was 262), and in S1 the three origin chips stack at y ≈ 390–660, x 64–≈480
(wall and ceiling light; card 1 is at x ≥ 680, card 2 at y ≥ 915, card 3 at y ≥ 1040).

---

## On-screen copy (proofread at full size: RTL order, punctuation side, Arabic-Indic digits, whole words only)

| Time | Text | Type / place |
|---|---|---|
| 0.00–1.70 | **مزاجك ١٥٪؟** | Alexandria 800, 118 px, white, soft shadow; above the widget. Fully landed on frame 0 (the story's thumbnail), exits from 1.50 |
| 0.42–1.79 | **ناقصك دوز.** | same, below the widget; «دوز.» lands 0.08 s after «ناقصك»; v3: whole line sharp ≈ 0.63–1.56 (≈ 0.9 s; v2 0.70 s), gone before the 1.80 downbeat |
| 0–11.7 | **المزاج** · battery · **١٥٪ → ٣٥٪ → ٥٥٪ → ٧٥٪ → ٩٥٪ → ١٠٠٪** | the mood widget: a white pill (story-sticker language), «المزاج» Alexandria 700 36 px ink, an orange (#F26A21) pill battery that fills right→left (Arabic's direction) with its nub on the left, the percentage Alexandria 800 40 px in Arabic-Indic digits, **changing on the cue frame** |
| 2.00 / 2.70 / 3.30 → 4.08 | **جرعة من إثيوبيا…** · **…والسلفادور** · **…وكولومبيا** | white chips under the widget (left-aligned, 0.8×), Alexandria 700 54 px ink, the origin in dose orange; a sticker pop on the beat. **v3: stacked, one row each** (tops 380 / 474 / 568), all leave at 4.08: readable ≈ 2.1–4.0 / 2.8–4.0 / 3.4–4.0, the whole sentence together 3.4–4.0 (v2 swapped them: 0.50 / 0.43 / 0.63 s each) |
| 4.36 · 6.74 · 8.54 | **جرعة صافية.** · **جرعة باردة.** · **وجرعة حلا.** | same chips; the dose word in orange |
| 2.0–4.2 (on the cards) | `ETHIOPIA` · `EL / SALVADOR` · `COLOMBIA` | Archivo ExtraBold (wght 800, **v3: wdth 90**; v2 118, expanded), black ink, top-left of each card like dose's bar cards; **one size on all three cards** (the longest word spans 72 % of the card), so the caps are ≈ 29 % taller than v2; ≥ 11.7 % of the card's width/height clear on every side on every frame (measured, see Footage); homography-tracked, the card's light and defocus (card 3: σ 1.3, v2 1.8). COLOMBIA's dark cap band on the rendered MP4 measures 15 px at f105–f113 and 17 px at f125 (v2: 9 px by the same measure, ink < 120 inside the card) |
| 11.70–15.1 | **تعديل المزاج يبدأ من هنا.** | dose's own line. Alexandria 700, 64 px, ink #1B1511 on their white plaster. v3: it rides the wall (box top = the sign's top − 97 px: ink ≈ 262 → 384 px down to ≈ 320 at 12.6, 12+ px clear of «specialty»), 40 px right of centre (ink x ≈ 169–993, clear of the tree's leaf tips at x ≈ 130–147); eases back to centre and down into the end-card lockup during the settle |
| 13.15–15.1 | **سبيشلتي دوز · الجهراء** · `@sdosecafe` | IBM Plex Sans Arabic 600, 42 px ink · 40 px **ink** (v2: orange on plaster measured 3.3:1); the mark stays the orange element |
| 15.30–18.0 | **إعلان تجريبي غير رسمي — مقترح من طشّ لـ سبيشلتي دوز** · `SPEC AD — NOT COMMISSIONED BY SPECIALTY DOSE` | IBM Plex Sans Arabic 500 40 px #F2EFE6 · JetBrains Mono 600 28 px #CFD0C8; under the TASH lockup (y ≈ 1300–1400), above the tag |
| 16.4–18.0 | **طشّ** · **خلّهم يسولفون عنك!** · @tash.creative.kw | TASH signature (the only lime in the film besides the tag's dot) |

Everything that reads sits inside the story safe area (y 250–1620, x 64–1016). v3 margins: the spec tag ends at y 1590 (was 1611);
the S1/S3/S4 widget starts at y ≈ 292 (was 262); their line's ink starts at y ≈ 262 when it lands and is below 290 from ≈ 12.1 s
(it cannot sit lower at 11.7 without touching the sign, which is still high in frame then).

---

## Footage: clean ranges used, and what was fixed (no footage outside the reviews' clean ranges)

| Clip | Review range used | Fix in post (all in `src/tools/`, baked by `prep.py` before the conform) |
|---|---|---|
| `d1_grinders.mp4` | 0.00–2.96 s, inside the review's continuous take (its only faults in that span are grinder 2's rating plate, which the review clears with a top-anchored ≥ 1.12× punch-in, and card 1 reaching the right edge from 2.54 s; grinder 3's plate starts at 3.5 s) | **Plate:** not painted; kept out of frame by the top-anchored 1.12–1.15× frame for the whole shot (the plate starts at source y ≈ 1745 > 1920/1.12). **Speed:** exactly 1.25× so no frame is ever a blend. **Cards (`fx_cards.py`, v2 after the owner caught COLOMBIA running off card 3):** v1 fitted lines to a whiteness mask, which took the hopper glass's bright highlight beside card 3 as card: its quad sat ~35 px past the real left edge with a tilted top, and the 87 %-wide COLOMBIA overflowed. v2 tracks each card from ONE hand-measured reference quad (read off a 3–5× pixel grid: c1 f20, c2 f40, c3 f45) by affine ECC chained through all 75 frames (correlation ≥ 0.96), corners smoothed by a robust degree-5 fit (median residual ≤ 0.3 px). The label is set on a canonical face with the card's own aspect (no squash), one type size on all three cards (the longest word = 72 % of the card's width, 13 % left margin, 20 % top). **v3 (the owner will look at COLOMBIA again; CD: it read as a 10 px grey smudge):** Archivo width 90 instead of 118 at the same 72 % of the card (caps ≈ 29 % taller), card 3's ink defocus σ 1.3 (was 1.8; its edges measure σ 1.7–2.3), and the S1 push-in on card 3 from 3.30. **Measured on every frame f0–f74 after warp + defocus (ink alpha > 0.03 to each tracked card edge, top / right / bottom / left):** c1 44 / 67 / 152 / 39 px, c2 27 / 27 / 72 / 23 px, c3 20 / 17 / 76 / 14 px conformed = ≥ 11.7 % of the card's width/height on every side; checked by eye at 1:1 on the rendered f101–f125 (card 3) and f60–f125 (cards 1–2) |
| `d2d_carafe.mp4` (Seedance 2.5, 720p) | **hook:** 0.00–1.47 s (f0–f35.3, unused by S2), grey and defocused. **S2:** 1.567–3.933 s, inside the best range 1.54–3.96 (cut before the f100 ice-pile pop) | Upscaled ×1.5 (lanczos + light unsharp 0.45). **The cup print is the recreated dose lockup (v2, `fx_specialty.py`; the keyed logo plate, not their file):** the CD found the AI's «dose» off-model (hairline counters where the real mark has wide slits, a much taller d ascender, squatter bowls), so the whole printed lockup (specialty / dose / cafe) is replaced, f36–f99, by the keyed plate's own pixels: the rigid print is tracked against f110 (v1 track), the real lockup is wrapped round the cup by a cylinder model (R ≈ 247 px, ellipse sag, 0.3° tilt) fitted on 14 landmarks read off f110 (rms 8 / 9 px; the AI's letter spacing differs), scaled 2.5 % so the e stays clear of the thumb; the AI print is lifted out (REF mask carried in + this frame's own ink, dilated 4 px, Telea fill from the coffee / foam / stream behind) and the real alpha goes on as opaque ink in the frame's own print colour, shaded by the AI print's smooth light falloff; the thumb in front of the cup is kept in front (row-wise skin boundary). This also removes v1's doubled «alty» at f74–f80. **v3 (CD: a darker-red second «e» with its slit running on to the thumb, f150–f197; «specialty» see-through):** the AI ink in the thumb's shadow measures R ≈ 90–130, below the old orange-ness test (R > 120), so the lift-out now takes every orange OR deep red-orange piece CONNECTED to the carried print mask (dilated 13 px; loose coffee specks are dropped); the thumb restore never brings back ink-coloured pixels, and the thumb is masked out of the Telea source (no pink fill by the e); the light falloff is a plane fitted to the lit AI ink (v2's local σ-20 ratio saturated by the thumb and drew a hard dark curve through the e); «specialty» / «cafe» get a lighter pre-blur (σ 0.7) and a 1.45 alpha gain, so their strokes print opaque. Checked at 3× on f40–f94: one «e» contour, the slit stops at the letter edge. **Hook plate (v3):** `track_hook()` extends the rigid track to f0–f35 (chained from f36, cubic fit, max residual 1.9 / 4.5 px x / y) so the grey, defocused hook cup carries the recreated lockup too. **Cadence:** nearest frame (no blending of transparent ice), the 24p repeats placed on f4k+2 |
| `d3_iced.mp4` | part A, 0.117–1.883 s (never across the hard cut at 1.958 s; last blend pair f45/f46) | none needed; warmed in the grade (the cool one) |
| `d4_cake.mp4` | 0.000–1.276 s (f0–f30.6; v2 pulled back from f35.3: from ~f36 the sauce channel on the front-right face reads as the block splitting) | none needed; 0.72× linear blend |
| `d5b_terrace.mp4` (Kling 3.0 Pro) | 2.300–4.967 s (inside 2.29–5.04: no paint needed); 1.0×, **true 30p** (`conform.py` mode `flow`: DIS optical flow both ways on the comped frames, both frames warped to the in-between time. **v3 fix (CD: chipped espresso rim and a stair-stepped table edge on f310–f333, worst on the ١٠٠٪ frame f324):** v2 used the round-trip error map in frame A's coordinates as a mask at time t and pasted the UNWARPED nearest frame there; v3 carries the error map to time t, falls back to the one-sided warp from the nearer frame, and feathers wider (σ 8, 15 px dilate): 4.4 % of pixels fall back on average, 7.7 % at most. Checked at 1:1 on f306–f340: the rim, its red line, the saucer line and the table's far edge are whole on every frame, including f310/313/315/319/320/324/326/328. The 'nearest' fallback for f306–f333 was not needed. **Clean variant `d5b_terrace_clean` (v3):** the same frames f112–f120 with the AI sign removed and NO mark, conformed as segment `Ec` for the end-card dissolve) | **Espresso steam (owner: «الاسبرسو مايطلع منه دخان»):** the steam exists only in 0.00–2.20 s; the edit starts at 2.30 s. Checked frame by frame at full size (source f55–f66 around the cup, then the 8 fps film): no wisp or ghost. **Wall sign** (`fx_sign.py`): the AI redrew the letterforms (separate letters, bold condensed specialty/cafe). The sign is tracked (scale + translation vs f117, cubic fit, residual ≤ 2.3 px), its defocus measured per frame (σ ≈ 2.1 px until the rack at ~3.6 s, ~0.5 px at the end), the AI sign and its shadow are removed with a cloned-plaster clean plate (nearest valid wall offsets, Poisson-blended, the window arch excluded), and the recreated mark (`logo_a.png`, the keyed plate's own pixels) is placed on the wall (−1.07°, 478 px wide at f117) with a 2–3 px return edge, the measured offset drop shadow (+19, +10 px, 30 %), the wall's leaf-shadow pattern on the letter faces at full strength, shifted toward the light by the sign's depth (v2; v1 used 55 % and read evenly lit), and the frame's defocus. The same placement drives the end card's match |
| `frames/logo_plate.png` | — | **A faithful recreation of dose's mark** (GPT Image 2.6 job 836ec4b1, from their sign / bean-bag photos ref06 / ref04; matched to ref06 in proportion: «specialty» 0.61 and «cafe» 0.85 of the mark's width, as on their sign), **not their own file**, used under the owner-approved brief. `key_logo.py`: keyed by colour projection, de-noised at 2× and re-thresholded (no redrawing), set to dose orange #F26A21 (the plate measured #EC6C19). It fills 56 % of the frame width on the card (the plate filled 85 %) |

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
**Fmaj9 | Dm9 | Bbmaj9 · Gm9 | C9sus4 → F6/9 (١٠٠٪) | Bbmaj9 · C9sus4 | Fmaj9 on the match** (the sign becomes the mark = home), a round
bass, a soft four-on-the-floor kick, finger snaps on 2 & 4 from dose 2, a swung shaker, a light sidechain duck.

| Time | Cue |
|---|---|
| 0.00–1.80 | the flat room: a muffled pulse on the beats, a dull lowpassed pad, the grey pour heard through it (lowpassed 420 Hz); **low-battery chirps** 0.08 / 0.42 (v3: the second lands with «ناقصك دوز.»; two chirps, two blinks); a charging riser into the downbeat |
| **1.80** | power-on: soft impact + whoosh; music in; **pluck C5** (35 %) |
| 1.85–3.6 | grinder whirr (motor + burr grit) and beans rattling in the hopper |
| **4.20** | **pluck D5** (55 %); the iced pour; ice plunging into the cup on the visible landings 4.76 / 5.05 / 5.43 / 5.63 / 5.76 / 6.01 / 6.15 (v2: f141–142, f150, f163, f168–169, f172–173, the f180 splash, the f184–185 splash) |
| **6.60** | **pluck F5** (75 %); the espresso pour (v2: no ice clinks: the ice in d3 does not move) |
| **8.40** | **pluck G5** (95 %); the sauce |
| 10.20 | the terrace (open air, a far car, two birds); C9sus4; the groove thins to the shaker (the build). v2: no spoon clink (the spoon never moves) |
| **10.80** | **١٠٠٪: A5 + C6** over F6/9 (the 4-note motif resolves), shimmer, soft impact; full groove back |
| 11.40 · 12.00 | Bbmaj9 under their line (the music dips 2 dB at 11.70, v3) · C9sus4 |
| **12.60** | the match: whoosh, **Fmaj9** resolve + bell, last kick; the terrace air fades; the bass holds the whole card. **v3 (CD: on a phone speaker the card was a dull F2 fading out, −29…−31 dB above 300 Hz):** the end-card pad 0.18 → 0.26, the Fmaj9 voicing re-struck at 13.50 and on the pushed 16th 14.55, an F3 octave partial on the held bass, a light shaker 13.20–15.0. Measured: 300 Hz high-passed 200 ms RMS −21.7…−26.0 dBFS over 12.6–15.0 (v2 −21.7…−30.7; the body runs at a −25.7 median) |
| 15.08–15.30 | the ink wipe's whoosh (v3: gain 0.15 → 0.25); the music ducks −15 dB for the tail and **a separate soft Fmaj9 pad on the sting bus (v3)** holds the bed between the sting's ticks at −37.6…−39.9 dBFS (50 ms RMS over 15.6–16.1; v2 −44…−48), the ticks 15–16 dB above it, until the طشّ hit at 16.42 |
| 15.30 | `sonic_logo()` → the طشّ hit on the snap (16.42) |

Master: −14 LUFS integrated, true peak held at −1.6 dBTP by an explicit 4× oversampled limiter loop in `audio.py`; the
render muxes it with a two-pass linear loudnorm (−14 LUFS, −1.5 dBTP).

---

## Grade and finish (`src/grade.js`, one per-pixel pass, a pure function of t)

- Per-clip match (`main.js → MATCH`): d2d gets more contrast (coffee deeper, less amber), d3 is warmed (wb 1.045 / 1 / 0.91),
  the rest a light contrast lift. The shared look: soft highlight shoulder, blacks to a warm coffee-black (14, 10, 8), whites
  capped at warm plaster white (254, 250, 244). A light vignette, kit grain at .045 overlay (the 720p d2d and the Kling
  clips share one grain), base scale ≥ 1.03 on every shot.
- The hook: saturation 0.1, exposure 0.4, an 8× blur ladder over the moving pour; all three snap off on the downbeat cut (+16 % flash).
- Palette: dose orange #F26A21 / white / ink in their world. TASH lime only in the tag's dot and the TASH tail.

---

## Known weaknesses (honest)

1. **The wall sign is a comp.** At full size the cloned plaster around the mark is a touch brighter in places (a soft halo
   at the top of «dose» and right of the «e»). v2 puts the leaf shadows across the letter faces (the CD's main point);
   cloning more shadow texture into the cleaned band right of the «e» and around «cafe» (the CD's second step) was **not
   done** (it means rebuilding the plate, `fx_sign.py` analyse, by hand). At story size it reads as their sign.
2. **The S2 cup print is a comp** (the recreated lockup replaced the AI's in v2; v3 fixed the doubled «e» and the
   see-through «specialty»). The AI print is lifted out with a Telea fill, so a soft, smoother-than-foam patch can show for
   a few px around «specialty» where the AI word sat higher than the plate's, and a few pink-grey px can remain in the
   2–4 px gap between the «e» and the thumb on some frames (the glove's soft edge). The plate lockup's letter spacing
   differs from the AI's by up to ~8 px, which is why the whole lockup was replaced rather than patched.
3. **d2d keeps the model's micro-judder** (every 4th frame steps twice as far). The carafe's rim outline is a little wavy
   (Seedance).
4. **The hook plate is the start of the same pour S2 shows** (f0–f36, S2 continues from f37.6): a tease, not a repeat, but
   the same carafe and cup appear twice in 6 s. v3: the hook cup carries the recreated lockup too (a separate cubic track,
   ≤ 4.5 px residual; under the 8× defocus and grey grade any misfit is invisible).
5. **COLOMBIA is still the smallest label** because card 3 is the farthest card (one physical type size on all three
   cards). v3 makes it read: narrower Archivo (caps ≈ 29 % taller), σ 1.3 ink, and a push-in on card 3 from 3.30, with
   ≥ 11.7 % clear on every side of every card on every frame; the stacked Arabic chip «…وكولومبيا» stays up 3.3–4.08.
6. **d5b's left edge:** the parked car becomes soft AI mush after ≈ 4.0 s (source); it sits at the frame edge, out of focus.
   The 30p in-betweens fall back to the one-sided warp on 4.4 % of the pixels on average (occlusions); checked at 1:1 on
   f306–f340 on the espresso rim and its red line, the saucer line and the table's far edge.
7. Foley is synthesised (pour, ice, grinder): designed sound, not recorded. The tail bed is now a dedicated pad
   (−38…−40 dBFS between the ticks).
8. **Their line lands 12 px inside the 250 px top safe line** (y ≈ 262 at 11.7 s) and is below 290 only from ≈ 12.1 s:
   at 11.7 the wall sign is still high in frame (its top at y ≈ 364), so the line cannot sit lower without touching it.
   It rides down with the wall from there (≈ 320 by 12.6 s).

## Review ledger

| Round | Looked at | Findings → change |
|---|---|---|
| Comp tests (builder) | sign at f60/f80/f100/f118 before/after at 2×; «specialty» on 15 frames f37–f95; labels on f0/20/40/60 | sign plate v1 smeared (Telea/FSR) → clone-from-wall + Poisson; the mark was distorted by an affine fit (rejected: never alter the mark) → similarity only, sized to cover the AI sign; the arch reveal got filled → excluded by colour. «specialty» alpha caught the foam edge and bubbles → letters only; doubled edges → per-frame refinement on the visible ink + stray-ink lift. Card corners jittered on the soft left edges → robust degree-5 fit |
| Stills (builder) | 15 full-size stills | the hook blur showed a grid (single 16× upscale) → a 2× ladder; the low fill was too pale → floor 0.42; the line «تعديل المزاج يبدأ من هنا.» touched the tree → 64 px; the end-card lockup sat high → +50 px |
| MP4 v1 (builder, 8 fps, all 144 frames) | every cut and text change | ETHIOPIA showed faintly two frames before its cue (blend of an inked source frame) → the print-on keys off the previous source frame; the widget overlapped the sign on the terrace for 1.3 s → it returns to centre stage for the ١٠٠٪ peak (rhymes with the hook); «ناقصك دوز.» ghosted past the downbeat → the hook lines exit at 1.50; the end card → tail dip went through grey → an ink panel wipes up; the info line came late → 13.70 |
| MP4 v2 (8 fps + full-size crops) | the sign, the cups, the cards | **the old AI «cafe» showed under the new one** (the arch filter had eaten the letters' soft edges, so they were never masked) → the AI letters are now masked by their strict colour, swept along their return direction, and only large tan/dark bodies count as the arch; plate rebuilt, clean. The poster showed the battery sheen → hidden |
| MP4 v3 (full-size frames) | blends | **blend ghosting:** ETHIOPIA doubled by ~6 px at 3.95 s (d1 at a non-integer speed) and the espresso rim doubled at 10.25 s (the near cups move ~15 px a frame) → d1 at exactly 1.25× (whole frames only) and d5b at 1.0× with the adaptive blend. That freed the end card to start on the beat at 12.6 (2.7 s for their line, the mark and the info line). Score re-timed (F6/9 on 100 %, C9sus4 into the match) |
| MP4 v4 (8 fps over all 144 frames + full-size crops at every cut and text change) | cuts 1.8 / 4.2 / 6.6 / 8.4 / 10.2 / 12.6 / 15.3, every chip swap, the meter steps, the labels, the sign, the cup print, the espresso | no doubled names or rims; no text crosses a cut; no steam on the espresso; the mark lands on the wall sign at 12.6 with no jump; spec tag on every frame; all type inside y 250–1620. −14.0 LUFS, −1.5 dBTP. Left as known weaknesses 1–7 |

---

| **v2: owner + three CD lenses on v1** (owner watched it; picture, Arabic-truth and sound reviews, all 540 frames) | owner: «COLOMBIA» overflows card 3; «be the director» (moving hook, never cover the pour). CD: overlays over the money pours, off-model «dose» on the S2 cup, dead hook, late ١٠٠٪, 24p hitch in S5, cake split at the out-point, origin chips too short, weak slate / handle, plunks off-picture, foley without a cause, end-card energy hole | **cards** re-tracked from hand-measured reference quads (ECC), labels fitted inside every card (≥ 10.9 % margins, measured every frame, checked at 1:1 on every printed frame of all three cards). **Hook** = the start of the iced pour, grey and defocused, moving from frame 1, text landed on frame 0, two blinks. **Stack** re-placed per shot, never over the pour / pitcher / sauce (checked every 2nd–3rd frame of S2–S4). **Meter** number + bump + fill on the cue frame (checked f54/126/198/252/324). **S5** widget cut to centre on 10.20 (sign never covered), true 30p (no repeated frame: min frame diff 10.4 vs 0.6). **S4** out at f30.6. **S2 cup** = the recreated dose lockup (keyed plate). **Sign** leaf shadows on the faces. **Copy** origin chips 2.70 / 3.30, «ناقصك دوز.» 0.72, slate under the TASH lockup 40 / 28 px, handle in ink 40 px. **Sound** plunks on the visible landings, no chair / spoon / d3 ice, end-card bass held, tail duck −10 dB, wipe whoosh, the hook's muffled pour. −14.0 LUFS, −1.5 dBTP, LRA 2.0. Rejected / partial: see Known weaknesses 1 and 7 |

| **v3: CD re-review of v2** (picture, Arabic-truth, sound-spec lenses) + the owner's notes still binding (COLOMBIA inside its card on every frame, with clear margins; be the director) | majors: S5 in-betweens tear (chipped espresso rim, stepped table edge, worst on the ١٠٠٪ frame f324); a doubled «e» on the S2 cup by the thumb; origin chips too short to read; end-card energy hole on a phone speaker. Minors: «ناقصك دوز.» sharp 0.7 s; COLOMBIA a 10 px smudge; «specialty» see-through; hook cup still the AI print; ghost sign at the match; their line touching the tree; slate 2.3 s; tail pocket −44…−48; safe-zone margins; docs calling the recreated mark «real» | **flow** error map carried to t, one-sided fallback, wider feather (1:1 on f306–f340: clean). **Cup** connected deep-red ink lift-out, ink-guarded thumb restore, thumb out of the fill source, fitted light plane, opaque small words (3× on f40–f94: one «e»); hook plate tracked f0–f35. **Cards** Archivo wdth 90, card 3 σ 1.3, push-in on card 3 3.30→4.20 (≥ 11.7 % margins every frame; 1:1 on f101–f125). **Chips** stacked to 4.08. **Hook line** 0.42 (+ chirp/blink). **Match** clean-wall plate under the dissolve (no ghost). **Their line** rides the wall, 40 px right, lands 11.70. **Slate** 15.30, 0.25 s fade. **Safe zone** stack +30, tag −22. **Sound** end-card re-strikes + bass partial + shaker (HP300 ≥ −26.0), tail duck −15 + tail pad (bed −38…−40, ticks +15 dB). **Docs** «real mark» → «faithful recreation». Nothing generated; no paid call |

## Files (`src/`)

- `index.html` · `main.js` (footage draw + framing, the hook, the end-card plaster and the sign's screen affine) ·
  `grade.js` · `layout.js` · `overlay.js` (the tag, hook lines, the mood widget, chips, their line, the end-card mark and
  info, slate, TASH tail) · `poster.js` (`?poster=1`) · `sting-short.js` (copied from the MOR ad) · `footage.js` ·
  `cues.js` + `cues.json` · `style.css`
- `audio.py` → `audio.wav`
- `tools/common.py` (decode at the edit geometry, the time map) · `tools/key_logo.py` → `assets/logo.png`, `logo_a.png`,
  `logo.json` · `tools/fx_sign.py` → `assets/sign.json`, `sign_plate.png`, `sign_mask.png` · `tools/fx_specialty.py` →
  `assets/specialty.json`, `specialty_a.png`, `cup_lockup.json`, `cup_ai_mask.png` (the recreated lockup on the S2 cup; v3: also the hook plate, `track_hook()`) · `tools/fx_cards.py` → `assets/cards.json` · `tools/prep.py` (applies the
  fixes to the used source frames → `footage/_src/`, ~600 MB lossless, git-ignored; v3: also `d5b_terrace_clean/`, the wall with no sign) · `tools/conform.py` → `footage/<H, A–E, Ec>/`
  (30 fps JPEG sequences, ~83 MB) + `footage/manifest.json` · `tools/extract.sh` (prep + conform)

## Rebuild (from `tash/`)

Needs ffmpeg, Node + Playwright (as for the other ads), Python 3 with numpy, scipy, pillow and OpenCV
(`pip install opencv-contrib-python-headless`).

```
python3 10-spec-dose/src/tools/key_logo.py          # assets/logo*.png (committed; only if the plate changes)
python3 10-spec-dose/src/tools/fx_sign.py           # assets/sign*.json/png (committed; ~5 min)
python3 10-spec-dose/src/tools/fx_specialty.py      # assets/specialty*, cup_lockup.json, cup_ai_mask.png (committed; --hook-only re-tracks f0-f35)
python3 10-spec-dose/src/tools/fx_cards.py          # assets/cards.json (committed)
bash 10-spec-dose/src/tools/extract.sh              # footage/_src (fixed source frames) → footage/H, A–E, Ec (d5b's 30p flow: ~35 s)
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
