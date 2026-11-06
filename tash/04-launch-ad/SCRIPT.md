# TASH / طشّ — Launch ad «هذا منتجك. / وهذا إعلانه.»

**Deliverables:** `TASH-launch-9x16.mp4` (1080×1920, 30 fps, 25.5 s) · `TASH-launch-4x5.mp4` (1080×1350 feed cut, re-laid out)
· `poster.png` (reel cover, 1080×1920; everything that matters sits inside the centre 3:4) · `contact-sheet.png` (2 fps)
· `src/` (the edit page, score, tools) · `footage/` (every clip the edit draws from).

## 1. The idea (one line)
**Show the gap, then close it.** An ordinary phone photo of an ordinary product («هذا منتجك.») hard-cuts on the drop to the
same kind of product in full cinematic light («وهذا إعلانه.»). The rest of the film proves it: five categories, how we
make it (idea → board → production → edit → every size), and the payoff of the tagline: people talking about the ad,
their chat collapsing into one *typing…* bubble, which **is** the TASH sting. TASH then *answers the chat* with the CTA.

Story in Kuwaiti: هذا منتجك. وهذا إعلانه. — نسوّي عطور، مطاعم، قهوة، مجوهرات — من الفكرة للتسليم وبكل المقاسات —
والناس تسولف: «منو مسوي هالإعلان؟!» — طشّ… خلّهم يسولفون عنك! — عندك مشروع؟ خلّ إعلانك علينا.

## 2. Storyboard / shot list (locked; single source of truth = `src/cues.json`, read by `src/main.js` and `src/audio.py`)
120 BPM, 1 beat = 0.5 s = 15 f. The drop (1.50) is bar 1; bars start at 1.5 + 2k. Every cut is on a beat or an 8th.

| # | in–out (s) | shot / source | on screen | sound | buys |
|---|---|---|---|---|---|
| 1 HOOK | 0.00–1.50 | AI clip `s1_hook` src 0.22–1.72 (1.0×), flat grade + phone sensor noise | «هذا منتجك.» (ink, rises in 0.17) | room tone + fluorescent hum, a dry tick on the line, a held-breath swell; **shutter click 1.40** with a white blink on the phone screen (1.40–1.47); 2 f of silence | this is an ordinary photo of an ordinary product — yours |
| 2 GLORY | 1.50–3.50 | LAYL clean orbit (`layl-final_3.00-6.00`, src 3.30–5.30), scale-cut tail 1.06→1 | «وهذا إعلانه.» — «إعلانه.» lime, arrives from 1.45× ON the drop frame; exits 3.22 | **DROP**: impact + group clap + Hijaz stab + shimmer; groove starts | this is what its ad looks like |
| 3 BURGER | 3.50–5.00 | STAKK clean (`stakk-crown_7.80-9.60`, src 7.90–9.40): top bun lands 4.00 on the beat, hero turntable | slate «مطاعم · FOOD» + «نماذج تجريبية · CONCEPT WORK» | **whip pan** in (smear 6 f, swish peaking on the cut); crown hit 4.00 | we do food |
| 4 COFFEE | 5.00–6.00 | HABBA clean (`habba-pour_5.00-6.60`, src 5.58–6.58): the pour draws the heart | «قهوة · COFFEE» | **light-sweep burn** 4.70–5.40 (swell); pour foley | and coffee |
| 5 RING | 6.00–7.25 | **new build** (`src/built/ring/`): 21K-style gold band, engraved khatam frieze, emerald, lacquer floor | «مجوهرات · JEWELLERY» | **match cut**: cup rim → ring (same centre, same Ø ≈ 780 px), then expo settle; one glass 'ting' | and jewellery — and this is editing, not a slideshow |
| 6 SPRAY | 7.25–9.50 | LAYL clean spray (`layl-spray_6.00-8.00`, src 6.08–7.99 at 0.85×) | «عطور · PERFUME» | the breath: drums out, pad + oud-like Hijaz pluck phrase, spray foley, riser 7.75→9.50 | back to your perfume; breathe before the how |
| — | 9.02–9.78 | **dots-wipe** (the brand transition, once): three lime dots appear at the end of the mist, *type*, grow right→left to cover, exit left | — | three typing ticks + swish | |
| 7 IDEA | 9.50–10.50 | script card (paper) on ink | step bar «فكرة ← سيناريو ← إنتاج ← تسليم» (active word paper + lime dot); «تمشي… ويبقى ليل.» per word, lime marker on «ليل.»; `LAYL · NO.07 — SCRIPT V3` | process groove (4-on-floor, rim, shaker, bass); a rim tick per word | it starts as a line on paper |
| 8 BOARD | 10.50–11.75 | three pencil boards (`src/assets/sketch-sc0*.jpg`, XDoG of our own frames) draw on right→left; push into SC 02 (log-scale) | `SC 01–03` | pencil strokes; swish on the push | then every shot is planned |
| 9 PROD | 11.75–13.50 | LAYL BTS **wire → clay → final**, same camera (src 3.00–4.75); sketch → wire is a match | `WIRE · CLAY · FINAL` | RTL wipes 12.25 / 12.75 with swishes | then it's built — the same shot, three passes |
| 10 EDIT | 13.50–14.50 | the frame shrinks into a viewer; editor with our clips on V1, type on V2, **our own waveform** on A1, moving playhead, running timecode | `TASH_LAUNCH_v12 · 9:16 · 30P` | downlifter on the shrink | then a real edit, picture and sound |
| 11 SIZES | 14.50–15.50 | viewer reframes 9:16 → 1:1 → 16:9 → 9:16, then becomes a phone screen | `9:16 · 1:1 · 16:9`, «كل المقاسات» | three snaps, swish into the phone | delivered in every size |
| 12 PHONE | 15.50–16.25 | generic phone (no brand cues) playing LAYL's end card (snapshot of its final, incl. its own CONCEPT AD slate) | bubble 1 «منو مسوي هالإعلان؟!» at 15.75 | **breakdown**: pad + sub; each bubble pops ON a group clap | the ad is out |
| 13 DIWAN | 16.25–17.00 | AI `s2_diwaniya` src 1.70–2.38 (0.9×), shared warm grade | bubble 2 «شفتوا إعلانهم؟» at 16.50 | clap + pop | people talk about it |
| 14 CAFE | 17.00–17.75 | AI `s3_cafe` src 0.80–1.48 (0.9×) | bubble 3 «وين مكانهم؟» at 17.25 | clap + pop | — everywhere |
| 15 CAR | 17.75–19.10 | AI `s4_car` src 0.55–1.77 (0.9×) → ink 18.50–19.02 | the chat collapses (18.40–18.80) into ONE typing bubble born **over his phone**, which rises to the logo position | sting ticks (sonic logo starts 18.38) | someone is typing about you right now |
| 16 STING | 18.38–21.50 | official `createSting` (endcard.js), started at 18.38 so the **snap = bar downbeat 19.50** | طشّ · «خلّهم يسولفون عنك!» · @tash.creative.kw; slow creep | `sonic_logo()` exactly aligned (ticks, whoosh, tash_hit 19.496, shadda pop); music ducked −14 dB 0.3 s before the snap | that typing is TASH |
| 17 ASK | 21.50–23.00 | AI `s5_owner` src 0.40–1.75 (0.9×), blurred, graded dark (top-down) | logo glides to the header; «عندك مشروع؟» | tail: Hijaz pluck cadence, soft claps + mirwas | you, the owner: got a project? |
| 18 CTA | 23.00–25.50 | ink | TASH **replies**: one lime 'sent' bubble «خلّ إعلانك علينا.» (23.08) · «اطلب إعلانك بالخاص» (23.42) · @tash.creative.kw (23.62); the logo's dots type once more at 24.25 | warm pop + ting on the reply; D cadence on bar 11 (23.50); three soft ticks under the last typing; fade in the last 0.25 s | leave your ad to us — DM to order |

Reading times (addendum §4.4, ≥ max(0.9, 0.4 + 0.35·words)): «هذا منتجك.» 1.33 s · «وهذا إعلانه.» 1.72 s · bubble 1 2.65 s,
bubble 2 1.90 s, bubble 3 1.15 s · «خلّهم يسولفون عنك!» ≥1.57 s · «عندك مشروع؟» 1.36 s · CTA reply 2.42 s, sub 2.08 s.

## 3. Transitions (each has a motive; emphasis spent once)
hard cut on the shutter → drop · **whip** (glory → burger) · **light-sweep burn** (burger → coffee) · **match cut** cup rim → ring ·
hard cut on the spray press · **dots-wipe** (once; the dots are born from the mist) · sketch → wire match · RTL wipes (the pen
direction) · continuous frame → viewer → formats → phone · cut on the beat with bubbles carried across cuts · the chat
collapses into the sting's own bubble · the sting logo glides into the end card. One visible spring: the reply bubble.

## 4. Sound (all original, `src/audio.py` on `_system/audio/tashaudio.py`)
Khaleeji-modern hybrid at 120 BPM in D Hijaz: group claps (`claps_ensemble`) on 2 & 4 with off-beat answers, mirwas dum/tak,
808 with saturated harmonics for phone speakers, bold detuned-saw stabs (D / E♭ colour), oud-like pluck phrases.
Arc: held breath + silence → **drop on «وهذا إعلانه.»** → montage groove → breath under the slow-mo spray + riser → typing
ticks on the dots-wipe → lighter process groove with UI foley → breakdown under the bubbles (pops on claps) → silence →
**`sonic_logo()` exactly on the sting** (snap = downbeat) → tail under the CTA resolving on D. Hero hits: the drop, the crown,
the snap. Pre-mastered to −14 LUFS / −1.5 dBTP (`Mix.master`), then the renderer's linear loudnorm.

## 5. Credits & honesty
- **Concept work, labelled.** LAYL, STAKK BURGER and HABBA are our teammates' fictional concept ads (05-concept-ads). The
  montage shows them as clean plates (`?clean=1`) with «نماذج تجريبية · CONCEPT WORK» on screen for the whole montage
  (3.50–9.22); the phone shows LAYL's own end card with its CONCEPT AD slate. No real clients, names, numbers or claims.
- **People shots** (`footage/ai/`): generated with Higgsfield (Kling 3.0) from CD-art-directed frames — supplied by the CD per
  `_CD-NOTES.md`; used only inside the CD-approved ranges, generated audio discarded, never composited onto phone screens
  (the hook's camera viewfinder is the clip's own image and is covered by the shutter blink at the cut). Dramatised chat
  bubbles only — no names, no numbers, no "real reactions" claim.
- **Built for this film:** the jewellery shot (Three.js), the storyboard sketches (filtered from our own frames), every
  piece of type, UI, phone, bubble and transition, and the whole score/sound design.

## 6. Formats
- **9:16:** key text inside x 72–1008, y 220–1500; bubbles keep 120 px off the right rail in the lower half (`?guides=1` overlays them).
- **4:5 (`?fmt=45`, 1080×1350):** not a crop of the 9:16 — each shot has its own vertical focus (faces stay in frame), the
  type, step bar, card, editor, phone, bubbles, sting (logo 560 px, cy 0.42) and CTA are re-laid out for the shorter frame.
- **poster.png (`?poster=1`):** before / after split with the three dots on the seam; «هذا منتجك.» over the phone photo,
  «وهذا إعلانه.» over LAYL; wordmark, handle and «نماذج تجريبية · CONCEPT WORK» lower right — all inside y 240–1680.

## 7. Reproduce
```
python3 04-launch-ad/src/tools/sketch.py            # storyboard boards → src/assets/
bash 04-launch-ad/src/tools/extract.sh              # footage/ mp4s → review/launch-footage/ JPEG sequences + manifest
python3 04-launch-ad/src/audio.py                   # score → src/audio.wav (+ src/assets/wave.json for the editor UI)
node _system/tools/render.mjs --page 04-launch-ad/src/index.html --out 04-launch-ad/TASH-launch-9x16.mp4 --audio 04-launch-ad/src/audio.wav --workers 2
node _system/tools/render.mjs --page "04-launch-ad/src/index.html?fmt=45" --out 04-launch-ad/TASH-launch-4x5.mp4 --audio 04-launch-ad/src/audio.wav --workers 2
node _system/tools/render.mjs --page "04-launch-ad/src/index.html?poster=1" --stills 0 --stills-dir review/launch/poster
```
Footage kept in `footage/`: `ai/` (CD) · `clean/` (`?clean=1` renders: habba-pour 5.00–6.60, layl-spray 6.00–8.00,
stakk-crown 7.80–9.60) · `bts/` (LAYL wire/clay/final 3.00–6.00) · `final/` (snapshots of the finished concept ads) ·
`built/ring.mp4` (from `src/built/ring/index.html`, 1.8 s).

## 8. Self-review ledger
Builder-reviewed (no separate fresh reviewer was available in this session). Every round = stills or full render → look
at 25 %, 100 % and cut strips (cut−2f / cut / cut+1f) → fix → re-check.

| round | what I looked at | top findings | change | measured after |
|---|---|---|---|---|
| look-dev | ring stills v1–v5 | bronze gold; the transmission stone read as a dark hole; floating ring + reflection read as two rings; hard horizon line | neutral strips over a dim warm dome; mirror-faceted emerald; ring stands on the floor; floor fades by depth behind the ring | v5 gold reads gold, single grounded reflection |
| look-dev | storyboard filter | XDoG threshold > 0 turned flat paper grey | threshold below zero, lighter wash, sparse hatch | paper white, pencil edges |
| stills 1 | 48 stills (hook → CTA) | hero lines overflowed at 150 px; «إعلانه.» crash-in overlapped «وهذا» (text over text); slate sat on LAYL's label; script card mis-placed (no left/top) | 136 px hero; crash grows from the gap side; slate starts at the first montage cut; card anchored | all text inside x 72–1008 |
| stills 2 | payoff + end | typing bubble landed on the man's mouth; CTA was a generic "logo + line + button" card | bubble is born over his phone (where the typing is) and rises; TASH **replies** with one lime bubble | — |
| cut strips | 13 cuts × 3 frames | «إعلانه.» 2 f late on the drop; script card drawn over the dots-wipe; the three dots merged into one blob + ~8 f of full lime | word on the drop frame; wipe on its own top canvas, UI revealed where the dots have passed; dots appear and *type* at the end of the mist, ~6 f cover | — |
| draft 1 (full) | 2 fps sheet, freezedetect, spectrogram, section loudness | frozen 20.33–21.37 and 23.87–end; the "breath" was louder than the groove (−12.5 vs −13.0 LUFS); hook room tone too loud | creep on the sting hold; logo glides into a centred CTA; dots type once more at 24.25; breath −16.1 LUFS, hook −24.1 LUFS | draft 2: no freeze > 0.6 s; −14.0 LUFS, LRA 3.2 |
| draft 2 (full) | determinism (fwd vs reverse seek order), 100 % crops | 24.6 s differed on 7,723 px (kit `words()` will-change keeps a stale raster scale); note mono 17 px < 22 px floor; WIRE/CLAY/FINAL low contrast on clay | will-change off on word spans; seeks serialised; note 22–24 px; pass labels on a pill | 5 test frames (incl. text scaling) 0 px different |
| final v1 | 20 frames from the MP4 at 25 % and 100 % | chat tails rendered as square slivers (CSS `clip-path` tail) | SVG tails curling out of the bubble corner (paper; lime ×1.3 on the reply) | re-rendered both formats |

FINAL_QC_PLACEHOLDER

## 9. Known weaknesses (honest)
- **Footage policy needs the lead's confirmation.** BRIEF §3.5 still says "only our own code-generated visuals … no paid AI
  generators", while the launch-ad note in the same BRIEF and `_CD-NOTES.md` say the owner subscribed and the CD approved the
  Higgsfield clips. I followed the launch-specific instruction and credited the clips. If they are rejected, shots 1, 13–15
  and 17 need replacing (the generic phone + bubbles at 15.50 already carry the payoff idea without people).
- The hook clip's phone shows its own camera viewfinder (generic shutter/thumbnail layout, no logo; I did not composite UI on
  it) and the phone backs in the diwaniya/café shots have a triple-lens bump reminiscent of a known phone (no logos). Flagged
  for legal taste; the hook's screen is covered by the shutter blink on the cut.
- Cuts and pops on 8th notes (7.25, 11.75, 15.75, 16.25, 17.25, 17.75) fall on half frames at 30 fps; the picture event lands
  on the next frame (≤ 17 ms, within ±1 f of the sound).
- The concept ads are still being revised by teammates; the edit uses snapshots rendered/cut during this session
  (`footage/clean`, `footage/final`), so later improvements to STAKK/HABBA/LAYL are not in this cut until re-extracted.
- Audio judged by meters and spectrogram, not by ear. LRA ≈ 3 LU is modest; the low end (808) is dense.
- The jewellery shot is on screen 1.25 s; the engraved frieze is subtle at phone size. The ASK shot's header logo sits over
  the owner's (darkened) turban.
- blackdetect flags the designed typing-dots-on-ink frames right before the snap (≈18.93–19.13, 19.27–19.47).
