# TASH boost ad v4 «نقاط مشروعك»: BUILD SPEC (final hybrid, revision 2 after red-team)

Status, 9 Nov 2026: **spec only.** No video generated, nothing rendered, nothing approved. Outside this spec, 4 credits were spent on two candidate stills of the opening shot (job IDs in `tash/HANDOFF.md` §7); the owner saw a first look of frame 0 made from them (`v4/storyboard/firstlook-r2/`). Neither still passes the still gates as generated.
Order of work: owner approves `STORYBOARD.md` stills first, then video, then build. Machine-readable shots: `shots.json`.
Spine: Treatment 1 "World-cut". Grafts from Treatment 2 "Inside the Word" and the circle match-cut idea are marked **[G]**.
Revision 2 answers the two red-team audits ("still ordinary", "tech compliance"): every size below is measured with HarfBuzz on the real fonts, not estimated.

## 1. The idea

**عربي.** «نقاط مشروعك»: كلمة «مشروعك» ثابتة بمكانها، وفوق الشين ثلاث نقاط ليمونية كبيرة: هي نقاط «طشّ»، وهي نفسها نقاط «يكتب…» لما الناس تسولف. ورا الكلمة عوالم مشاريع شكلها حقيقي (قهوة مثلّجة، عود، برجر، كنافة) تتبدّل على البيت. تطيح النقاط فتسحب الألوان معاها، وتصير الكلمة «مسروعك» و«محد يسولف؟». ترجع النقاط فيرجع اللون وتنفجر الشاشة ليموني: «طشّ». بعدها كل مشروع ياخذ دوره، والناس تسأل «شنو حسابهم؟!»، والنقاط تتكاثر من شين الكلمة نفسها لين تغطي الشاشة: «طشّ!». والختام طلب واحد: «اطلب إعلانك بالخاص».

**English.** "Your business's dots": the word «مشروعك» never moves. Its three big lime dots are TASH's dots and the "typing..." dots of people talking. Photoreal product worlds cut behind the word on the beat. The dots fall and drag the colour away; the word reads «مسروعك» and «محد يسولف؟». The dots come back, colour comes back, the screen bursts lime: «طشّ». Each business takes its turn, people ask «شنو حسابهم؟!», the dots multiply out of the word's own ش until they flood the frame: «طشّ!». One ask: DM us.

## 2. Why this is not ordinary

1. Frame 0 is a real splash, not a title card: ice crashing into an iced latte on tangerine, a 172 px Arabic word and three Ø80 lime dots already on it. The dots are the largest lime shape in the frame; there is no logo bug.
2. One fixed word, everything else changes. The eye never searches; cuts land behind the word every 15 frames.
3. The dots do physical work: they drag thirds of the picture away, repaint the world as circles, open as portholes, swell into a Ø680 lens that holds the product, multiply 3-9-27-81 and become the flood.
4. The longest stretch without a picture change is the deliberate dead beat (f45-77, 1.1 s). Everywhere else something lands every 15 f or faster.
5. Colour is led by Lime: 318 of 600 frames (53%) are a Lime field, flood or panel; 402 frames (67%) carry photoreal footage; no Ink field anywhere; the dead state is bright Paper-grey.
6. v3 was white type on black for 60% of its length; v4 has zero frames of type on black.

## 3. Decisions taken where the judges disagreed

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Opener action | **Ice crash, no pour source** | Owner's 9 Nov example; a floating carafe is the top morph risk. No steam, hands or straw. |
| D2 | Loop | **No reversed footage.** f588-593 an iris opens onto source frame 0 held frozen; f594-599 the frozen frame | Reverse reads as a glitch; frozen first frame makes f599 = f0. |
| D3 | Multiplication | **Solid lime typing dots born from W's own ش**, grounds cut through the three world colours | Keeps the word in the payoff; three more picture cuts on the beat. |
| D4 | CTA ground | **Lime panel (y 0-1130) for the type, live worlds in the band below (y 1130-1920), cutting every 30 f** | Calm reading ground and a moving picture at the same time. |
| D5 | Worlds | **5 shots**: coffee, kunafa, oud, burger (A-20) + pool (B-20 hook only). Abaya stays cut | Pool is never shown in A-20 because it is never introduced there. |
| D6 | Punch-ins | **Code only, 1.25x or less, always about (540,900)** | The product can only move down and outward, never into the type. |
| D7 | Backdrops | **Three plus Paper**: tangerine, hot pink, azure | ECD colour note. |
| D8 | Brand bug | **Deleted** | It out-shouted the idea dots at f0. Brand = Lime dots at f0, wordmark at f90. |
| D9 | "Word wears the world" **[G]** | **Default is the dot-lens (Ø680).** Footage inside the 172 px letters is an upgrade used only if it passes the name-the-product test (section 12) | Letter strokes are about 40 px; a product may not survive inside them. |

## 4. Palette per section

Brand: Ink `#0B0B0B`, Paper `#F5F5E9`, Lime `#C6FF00`, Smoke `#8E9088`, Char `#1A1A18`.
Owner-directed, non-brand backdrops: Tangerine `#FF7A1A`, Hot pink `#FF4F9A`, Azure `#1EA7FF`. Dead field: Paper-grey `#DCDCD0`.
Luma used in every gate: `Y' = 0.2126 R' + 0.7152 G' + 0.0722 B'` on gamma-encoded sRGB values 0-1 (not linear). Tangerine 0.56, azure 0.57, hot pink 0.48, Paper-grey 0.86, Lime 0.88, Paper 0.96.

| Frames | Section | Ground | W and tag style | Dots |
|---|---|---|---|---|
| 0-44 | Hook + drain | Tangerine footage, then hot-pink footage in falling thirds | W Paper fill, Ink keyline; tag Lime | Lime Ø80, Ink ring |
| 45-89 | Dead + return | Paper-grey; coffee inside repaint circles from f78 | W hollow; line Ink | Smoke on the floor, Lime from f72 |
| 90-134 | Offer card | Lime | Ink | Ink, then footage portholes |
| 135-284 | Categories | Tangerine / Hot pink / Azure / Hot pink footage; lens beats on Lime | On footage: W Paper, tag Lime. On Lime: W and tag Ink | Lime; on Lime: Ink, Paper ring |
| 285-374 | Talk | Paper, then flat Tangerine, Hot pink, Azure (code fields) | W and line Ink, 6 px Paper keyline | Lime, Ink ring |
| 375-449 | Flood, snap, tagline | Lime | Ink | burst dots in world colours |
| 450-587 | CTA | Lime panel + footage band | Ink | Ink, Paper ring |
| 588-599 | Wind-up | Tangerine (frozen source frame 0) | W Paper | Lime |

Rules: no Ink, Char or Smoke field at any frame. No lime-coloured object inside AI footage. Burst-dot colours: tangerine, hot pink, azure, Paper, Ink (never rectangles).

## 5. Fixed geometry (9:16, 1080x1920)

| Name | Value |
|---|---|
| Word **W** | «مشروعك» dotless Path2D, Alexandria 800, 172 px. Measured ink 778 x 202 px: x 151-929, y 331-533, baseline y 483. Never moves. Visible f0-89, f135-374, f594-599. |
| Dot row | three discs **Ø80**, 8 px Ink ring, hard Ink shadow (+6,+6); nominal centres (623,342) (715,342) (807,342), spacing 92; `word_export.py` prints the ش teeth centre and the row is centred on it. `typing()` amp 22 px, period 30 f, 5 f lag; highest point y 280. |
| Word style | On footage: Paper fill, 8 px Ink keyline behind the fill (round joins, counters open), hard Ink shadow (+8,+8). On Lime / Paper / flat colour: Ink fill, 6 px Paper keyline, no shadow. 3-frame pulse 1.04 to 1.00 on every picture cut. |
| Tag slot **T** | one line, centred x 540, **baseline y 757, one common size 200 px**, tilt -4 deg about its centre. After tilt the ink box must sit inside x 150-930, y 560-840 (wholly Zone A); a tag that does not fit steps down 10 px at a time. On footage: Lime fill, 10 px Ink keyline behind, Ink block shadow (+10,+10). On Lime: Ink fill, Paper shadow. |
| Lens **L** | circle r 340 centred (540,1270), 12 px Ink rim: x 200-880, clear of the TikTok rail. Shows un-shifted footage (the hero box centre is its centre). |
| Wordmark **M** | «طشّ» logo path, Ink on Lime. Offer card and tagline: 440 px wide, x 320-760, y 290-539. Snap (f390-404): **840 px wide**, x 120-960, y 300-776. |
| Zones | A: key text y 270-840, x 120-960. B: short lines y 840-1250, x 300-780. Below y 1250: decoration and footage only. TikTok rail: nothing readable and no dot centre in x > 960 over y 1100-1750. |
| Hero box in every still | product inside x 300-780, **y 930-1610**; y 0-880 flat backdrop with nothing in it. |

Measured ink widths (uharfbuzz, Alexandria ExtraBold; px at the size used, before tilt):

| Line | Size | Width | x range | Line | Size | Width | x range |
|---|---|---|---|---|---|---|---|
| «حلو…» | 200 | 464 | 308-772 | «محد يسولف؟» | 126 | 828 | 126-954 |
| «قهوة؟» | 200 | 628 | 226-854 | «خلّ إعلانك» | 120 | 610 | 235-845 |
| «عطر؟» | 200 | 501 | 290-790 | «علينا» | 150 | 333 | 373-707 |
| «برجر؟» | 200 | 464 | 308-772 | «شنو» | 170 | 353 | 364-716 |
| «حلويات؟» | 180 | 722 | 179-901 | «حسابهم؟!» | 98 | 471 | 304-776 |
| «شاليه؟» (B-20) | 200 | 676 | 202-878 | «خلّهم يسولفون» | 104 | 805 | 138-942 |
| «اطلب إعلانك» | 120 | 745 | 167-913 | «عنك!» | 170 | 404 | 338-742 |
| «بالخاص» | 160 | 599 | 240-840 | «دزّ لنا» (TikTok) | 120 | 278 | 401-679 |
| `@tash.creative.kw` (JetBrains Mono 600) | 60 | 608 | 236-844 | `@tash.creative` | 60 | 497 | 291-789 |

Tag vertical extent at 200 px, baseline 757, tilt included: y 552-847 worst case for a 700 px word, so «حلويات؟» runs at 180 px (y 573-834). The product top is y 930, so no tag touches a product, also after a 1.25x punch-in about (540,900) (product top moves to y 937).

## 6. Frame 0

Picture: `seq/S1/0000.jpg`, the first frame of the Seedance clip, which is the approved opener still (gate: SSIM 0.95 or more against the approved still, else the still itself is drawn at f0). Tall ribbed glass of iced latte on flat tangerine; five clear ice cubes hang at y 930-1150 above the rim (y 1170); glass base y 1610.
On top at f0, no fade-in:
- **W** «مشروعك» 172 px, Paper with Ink keyline and shadow, ink y 331-533.
- Three lime dots Ø80 on the ش, first dot at the top of its bounce.
- Nothing else. «حلو…» slams into slot T at f3 (3 f, scale 1.2 to 1.0), so the first frame is word + dots + product only.
Sound at f0: 808 with harmonics, ice-on-glass crack, V1 «مشروعك حلو…» starts at 0.00 s.
Acceptance at 270x480 (25%): a first-time viewer reads «مشروعك», counts three lime dots and names a cold drink. Cover frame for the post = f10 (splash crown up, tag in).
Zero-credit test arm (and the fallback if the opener fails its gates): same type on flat Lime, dots Ink with Paper ring, no footage until f15.

## 7. Beat table, A-20 Instagram (600 frames, 30 fps, 120 BPM, beat = 15 f)

Source frames are written `S1 s0-14` (opener, index on the 30 fps conform) and `S2 n0-14` (Kling, native 24 fps frames played one per timeline frame). Section 9 holds the full remap, including the 24 fps fallback for S1. Every picture cut is on a multiple of 15.

| f_in | f_out | Picture | AI shot | Arabic on screen (px, position) | Sound / voice | Build note |
|---|---|---|---|---|---|---|
| 0 | 14 | Opener full frame. Ice hits the latte inside the first 0.3 s, splash crown up by f10-14 | S1 s0-14 | W + three dots. «حلو…» slot T 200 px from f3 | 808 + ice crack f0. V1 «مشروعك حلو…» from 0.00 s. Ticks f0/5/10 | No inflating echo dot. Dots type |
| 15 | 29 | Same shot, hard punch-in 1.25x about (540,900): the crown fills the lower frame | S1 s15-29 | W. «حلو…» pulses 1.08 to 1.0 on f15 | Clap f15 on the voiced «حلو» | Cut is fixed at f15. Stem V1 is shifted or stretched (6% or less) so the «حلو» onset sits at 0.500 s |
| 30 | 44 | Cut to kunafa (حلو = sweet). Dots fall at f32/34/36 growing Ø80 to Ø260 toward the lens; each drags its vertical third (x 720-1080, 360-720, 0-360) down by 1920*easeIn((f-fi)/9). Paper-grey underneath | S5 n0-14 | W turns hollow third by third. «حلو…» leaves with the middle third at f34 (on screen f3-36, 1.1 s) | Nut scatter and syrup sound f30. Ticks 1480 / 1244.5 / 1174.7 Hz at f32/34/36. Low-pass closes 8 kHz to 400 Hz | Second world inside the first 1.5 s |
| 45 | 77 | Dead state on Paper-grey. W = hollow «مسروعك» with three dashed empty circles Ø80 (`setLineDash [8,7]`). The three fallen dots lie drained (Smoke fill, Ink ring) at (420,1560) (540,1560) (660,1560), rolled to rest by f50. At f72 they turn Lime and jump | none | «محد يسولف؟» one line, 126 px Ink, baseline 740, x 126-954. In at f45, settled f47, **static f47-89 (1.43 s)**. No tilt, no fill switch | Room tone. Soft tap f45. Ghost clicks f57/60/63 that stop. Riser from f72 | Ghost triplet (Smoke Ø24) types in the dot slot f57-68, sags 12 px, fades by f72 **[G]**. The only still beat in the film |
| 78 | 89 | Dots land on the ش at f78/81/84 (they pass W, never the line). Each landing opens a repaint circle r = (f - f_land)*260 from its dot, rim 10 px Lime + 6 px Ink, showing the splash crown again. Full colour by f87 | S1 s6-17 | Line stays Ink and static on top to f89 | Rising ticks f78/81/84. Filter opens | W gets its Paper fill back as each rim passes **[G]** |
| 90 | 104 | 2-frame luma ramp, shockwave from (715,342): r 0 to 2300 in 4 f, Ink wavefront 24 px. Flat Lime. M slams 1.3 to 1.0 (easeOutBack, 4 f) | none | M «طشّ» 440 px wide. «خلّ إعلانك» f90, 120 px Ink, baseline 720. «علينا» f93, 150 px Ink, baseline 960 | HERO 1: 808 + group clap + V3 «طشّ!» dry f90-114. Full groove | Wordmark on screen at 3.00 s. Offer line complete f93, **static f93-134 (1.4 s)** |
| 105 | 134 | Three Ink dots drop from M and open as footage portholes Ø220 at (270,1125) (540,1125) (810,1125), 12 px Ink ring, opening f105/108/111 (easeOutBack 6 f). At f120 all three cut to their next 15 frames. f131-134 the centre porthole irises r 110 to 2300, 24 px Ink wavefront | S3 n0-29 (left), S1 s18-47 (centre), S2 n0-29 (right); 400 px sequences | M + offer line held, static | Three pops f105/108/111. Clap f120. Mirwas fill into f135 | Only the portholes move **[G]** |
| 135 | 149 | Coffee A: full frame, the crown again | S1 s4-18 | W. Tag «قهوة؟» 200 px Lime | Kick f135, ice clink | Iris lands exactly on f135 |
| 150 | 164 | Coffee B: flat Lime. Lens L (r 340 at (540,1270)) holds the coffee, entering 1.08 to 1.0 in 3 f | S1 s30-44 in L | W and tag turn Ink. Dots Ink, Paper ring | Clap f150 | Tag «قهوة؟» on screen f135-164 = 1.0 s |
| 165 | 179 | Oud A: full frame, hot pink. Smoke puff starts on f165 | S2 from puff onset p: n(p)..n(p+14) | W. Tag «عطر؟» 200 px Lime | Kick f165, charcoal crackle | p measured in QC (target n0-4). Never reversed |
| 180 | 194 | Oud B: punch-in 1.25x about (540,900) | S2 n(p+15)..n(p+29) | same, tag pulses | Clap f180, breath of smoke | Gate: smoke stays below y 880 before the punch |
| 195 | 209 | Oud C: Lime. Lens L slides in from x -340 on a 3 f smear | S2 n(p+30)..n(p+44) in L | W and tag Ink | Kick f195 | Tag «عطر؟» f165-209 = 1.5 s |
| 210 | 224 | Burger A: full frame, azure. Top bun in the air | S3 n(i-15)..n(i-1) | W. Tag «برجر؟» 200 px Lime | Kick f210, sizzle bed (sound only) | i = bun impact frame, target n15 |
| 225 | 239 | Burger B: bun lands exactly on f225, punch-in 1.2x about (540,900), 2 f camera bump 10 px | S3 n(i)..n(i+14) | same | 808 + thump f225 | If S3 fails its still gate, S3-alt, else kunafa takes f210-284 |
| 240 | 254 | Burger C: Lime. Lens L drops in with one bounce | S3 n(i+15)..n(i+29) in L | W and tag Ink | Kick f240 | Tag «برجر؟» f210-254 = 1.5 s |
| 255 | 269 | Kunafa A: top-down, hot pink, syrup sheen spreading | S5 n15-29 | W. Tag «حلويات؟» 180 px Lime | Kick f255, soft crunch | Fourth world |
| 270 | 284 | Kunafa B: Lime. Lens L is concentric with the round tray (centre (540,1270), tray Ø 440-480): a circle inside the dot | S5 n30-44 in L | W and tag Ink | Clap f270 | Tag «حلويات؟» f255-284 = 1.0 s. Hard cut out |
| 285 | 329 | Hard cut to flat Paper. W stays (Ink, Paper keyline), its three Lime dots keep typing | none | «شنو» f285, 170 px Ink, baseline 730. «حسابهم؟!» f291, 98 px Ink, baseline 950 (Zone B) | V2 «شنو حسابهم؟!» f285-318. Groove drops to mirwas + bass | Clean hold f291-329 = 1.3 s; only the dots move |
| 330 | 344 | Ground cuts to flat Tangerine. 9 Lime dots (Ø150): each of W's three dots throws two children on 3 f smear arcs | none | W + talk line static, same style | Typing ticks, riser starts | Seeded table |
| 345 | 359 | Ground cuts to flat Hot pink. 27 dots (Ø110) | none | static | Ticks x3, pitch up a fourth | Dots avoid the W box, the talk boxes and x > 960 over y 1100-1750 |
| 360 | 374 | Ground cuts to flat Azure. 81 dots (Ø70), all typing in triplets | none | static, now partly covered | Ticks x9, riser | Cap 81 |
| 375 | 389 | Flood: 81 dots inflate, radius = 35 + ease*190. Rings fade by f381. Solid Lime by f387 | none | W and line covered by f384 | Riser peak. Duck f381. Silence pocket f386-389 | Luma rises over 12 f, no step |
| 390 | 404 | Snap: M 840 px wide slams 1.3 to 1.0 in 4 f on Lime; its three dots are footage portholes. 81 burst dots fly out in triplets (closed-form, world colours). M shrinks to 440 px over f400-402 | S1 s48-62, S2 n20-34, S3 n(i+15)..n(i+29); 400 px | M. Tagline words: «خلّهم» f402, «يسولفون» f404 (104 px, baseline 700), «عنك!» f406 (170 px, baseline 900) | HERO 3: V3 stacked x3 + clap + 808 + pop | Burst speed factor 1 to 0.1 by f400. No rectangles |
| 405 | 449 | Tagline hold. M 440 px, dots solid Ink. Burst dots drift slowly | none | «خلّهم يسولفون عنك!» **static f407-449 (1.43 s)** | Half-time groove | |
| 450 | 479 | CTA. Cut on the beat: Lime panel y 0-1130 with a 10 px Ink edge; below it the footage band y 1130-1920 (footage drawn 230 px lower so the hero box sits in the band). M and tagline fall out in 6 f | S2 n40-69 in band | «اطلب إعلانك» f453, 120 px Ink, baseline 440. «بالخاص» f457, 160 px Ink, Paper hard shadow (+8,+8), baseline 660. `@tash.creative.kw` f461, JetBrains Mono 600, 60 px Ink, baseline 800. Three Ink typing dots Ø64 at (448,965) (540,965) (632,965) from f463 | Calm groove. Two-note pop f457 | All CTA text in Zone A. No pill, arrow, box, underline or cursor |
| 480 | 509 | CTA hold, band cuts to burger | S3 n40-69 in band | CTA static | Groove | |
| 510 | 539 | CTA hold, band cuts to kunafa | S5 n40-69 in band | CTA static | Groove | |
| 540 | 587 | CTA hold, band cuts to the settled coffee | S1 s72-119 in band | CTA static | Last bar thins out | **Readable hold f463-587 = 125 f = 4.17 s** |
| 588 | 599 | Wind-up. CTA lines tip 0 to 14 deg and fall (gone by f593). Iris from the middle typing dot opens onto frozen opener frame 0 (f588-593). f594-599 = the f0 picture | S1 s0 frozen | W back to Paper fill, dots Lime. No tag (as at f0) | Reverse swell, 2 f of air | `typing()` phase at f600 equals phase at f0 |

Reading holds: 1-word tags 1.0-1.5 s; «محد يسولف؟» 1.43 s; offer line 1.4 s; talk line 1.3 s clean + 1.5 s more; tagline 1.43 s; CTA 4.17 s.
Luma steps (full-field change of 0.10 or more): f30, f45, f135, f150, f165, f195, f210, f240, f255, f270, f285 (small), f330, f450 (band only). Largest density: one opposing pair per second (two steps per second) in f135-284. The f90 and f375 changes are ramped. Irises and thirds are counted by `M11` as steps on the frame where the changed area passes 25% of the frame.

## 8. Drawing modules (self-contained, buildable in parallel)

Every module exports `draw(ctx, f, V)` where `f` is the integer frame and `V` the variant record (section 11). Pure function of `f`: no state kept between frames, seeded tables only (mulberry32), because render workers seek to arbitrary frames.

| Module | Inputs | Draws | Acceptance check |
|---|---|---|---|
| `M0 timeline` | `cues.v4.json`, variant id | Cue lookup, easing set, `window.TASH {ready, seek(t)}`, draw order | `seek` of any frame twice, in any order, gives byte-identical PNGs |
| `M1 footage` | JPEG sequences, remap table (section 9) | `frame(shot, f)` returns a decoded image; cover-fit, punch-in about (540,900), band offset; 400 px variants for portholes | Awaits `decode()`; LRU 24 images per worker; max 4 full-res draws per frame; a missing frame throws, never draws blank |
| `M2 word` | `word_export.py` Path2D body «مشروعك» (without ش dots), wordmark «طشّ», ش teeth centre | W in three fills: Paper, hollow, Ink (optional footage-clipped, D9). Keyline behind fill, shadow, cut pulse | Ink box x 151-929, y 331-533 (+/- 2 px) at every frame W is visible; counters of م و ع open; outline contrast 3:1 or more on every ground |
| `M3 dots` | dot row constants, cue frames | `typing()`, fall toward lens, drained floor state, jump back, ghost triplet, inversion on Lime, CTA typing dots | Three dots at Ø80 whenever W is live; no dot above y 270; phase at f600 = f0; drained and ghost dots never Lime |
| `M4 thirds` | shot frame, fall cues f32/34/36 | Three vertical thirds sliding off with their dots, Paper-grey under | By f45 no footage pixel remains; every frame mean luma Y' 0.40 or more |
| `M5 circles` | centre, radius function, rim spec | One shared circle mask: repaint circles, iris cuts, shockwave, portholes, lens L | Iris reaches r 2300 on the frame before the beat; 2-frame luma ramp at f90; lens L inside x 200-880 |
| `M6 type` | text, px, baseline, style, word cue frames, measured-width table | Lines animated per WORD (never per letter), RLM so «؟ ! …» sit left; tag slot T; keyline type | Shadda intact on «طشّ», «خلّ», «خلّهم», «دزّ»; measured ink box of every line (after tilt) inside its zone; a line that is over shrinks by 10 px steps and the build prints it |
| `M7 offer` | M path, S1/S2/S3 400 px sequences | Offer card f90-134: wordmark slam, offer line, three portholes | Offer text static f93-134; portholes inside x 160-920, y 1015-1235 |
| `M8 talk` | W, seeded position table per format | Talk lines, 3-9-27-81 dots from W's ش, world-colour grounds, inflate to flood | Talk line clean f291-329; exactly 81 dots at f360; solid Lime at f387; no dot centre in the TikTok rail box; no dot over W or the talk boxes before f360 |
| `M9 snap` | M path, burst table, 400 px sequences | Snap, porthole dots, burst dots, tagline, M shrink | 81 burst dots, flat colours, none Lime, no rectangles; tagline static f407-449 |
| `M10 cta` | band sequences, handle string, platform | Lime panel, footage band, CTA lines, typing dots, wind-up to f0 | Readable hold 3.0 s or more in every variant (A-20 4.17 s, A-14 3.1 s); all CTA text in Zone A; f599 differs from f0 by typing phase only (SSIM 0.99 or more) |
| `M11 qc` | rendered frames | Debug overlay of zones (off in render). Counters per frame and per 30 f window: luma steps of 0.10 or more over 25% or more of the frame in either direction (cuts, irises, thirds, lens entries all counted), opposing pairs per second, saturated-red test (R/(R+G+B) 0.8 or more: none of the palette reaches it, tangerine 0.63, hot pink 0.52), mean luma Y', Lime share, text-in-zone, **tag ink box does not intersect the product mask** | Report JSON beside each MP4; build fails if any counter breaks section 12 |
| `M12 score` | `cues.v4.json`, voice stems | `audio.py` renders the 20.000 s WAV (and 14.000 s) | Section 10 targets measured and printed |
| `M13 variants` | variant table | Hook B, TikTok CTA, A-14 cue set, 4:5 layout | Section 11 rules; each variant passes M11 on its own |

## 9. Footage pipeline

1. **Intake.** `ffprobe` each clip: resolution, `r_frame_rate`, `nb_frames`. Count duplicate frames with `mpdecimate`. Drop the audio track. **The native rate of the opener is probed on the 480p draft, before the 64-credit final is ordered.**
2. **Opener S1 (Seedance, 4 s).** Native 30 fps: copy frames, 120 frames `seq/S1/0000.jpg`-`0119.jpg`, use column A. Native 24 fps: no fps filter, 96 native frames played one per timeline frame (1.25x, no duplicates, no judder), use column B. Any other rate: conform with `fps=30`, check the splash at 100%, use column A.
3. **Kling shots (24 fps, about 1080x1912, 3 s = 72 native frames n0-71).** No fps filter: one native frame per timeline frame (plays 1.25x). All 72 frames are extracted.
4. **Extract.** `ffmpeg -i clip.mp4 -an -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -q:v 2 seq/<id>/%04d.jpg`, plus `scale=400:-2` copies in `seq/<id>_400/` for S1, S2, S3.
5. **Draw.** `ctx.drawImage(await frame(id, idx), ...)` inside `seek()`. Punch-ins scale about (540,900). Lens L clips un-shifted footage. CTA band draws the frame 230 px lower, clipped to y 1130-1920.
6. **No in-canvas slow motion.** Anything slower than 1x is interpolated offline with ffmpeg, baked into the sequence and checked.

### Time-remap table (A-20). Column A = S1 at native 30 fps; column B = S1 at native 24 fps, 1:1

| Shot | Timeline frames | Source A | Source B | Framing | Use |
|---|---|---|---|---|---|
| S1 | 0-14 | s0-14 | n0-14 | full | Hook; impact inside 0.30 s |
| S1 | 15-29 | s15-29 | n15-29 | 1.25x about (540,900) | Punch on «حلو» |
| S1 | 78-89 | s6-17 | n5-16 | full, inside repaint circles | Return (crown again) |
| S1 | 105-134 | s18-47 | n14-43 | 400 px, centre porthole | Offer card |
| S1 | 135-149 | s4-18 | n3-17 | full | Coffee A (crown again) |
| S1 | 150-164 | s30-44 | n24-38 | lens L | Coffee B |
| S1 | 390-404 | s48-62 | n38-52 | 400 px, M dot | Snap |
| S1 | 540-587 | s72-119 | n48-95 | CTA band | Settled coffee |
| S1 | 588-599 | s0 frozen | n0 frozen | full, behind iris | Loop |
| S5 | 30-44 / 255-269 / 270-284 / 510-539 | n0-14 / n15-29 / n30-44 / n40-69 | same | thirds / full / lens L / band | Drain, Kunafa A, B, CTA |
| S2 | 105-134 / 390-404 / 450-479 | n0-29 / n20-34 / n40-69 | same | 400 px porthole / 400 px M dot / band | Offer, snap, CTA |
| S2 | 165-179 / 180-194 / 195-209 | n(p)..(p+14) / (p+15)..(p+29) / (p+30)..(p+44) | same | full / 1.25x / lens L | Oud A, B, C; p = puff onset, target 0-4 |
| S3 | 105-134 / 480-509 | n0-29 / n40-69 | same | 400 px porthole / band | Offer, CTA |
| S3 | 210-224 / 225-239 / 240-254 (and 390-404) | n(i-15)..(i-1) / (i)..(i+14) / (i+15)..(i+29) | same | full / 1.2x / lens L (400 px M dot) | Burger A, B, C; i = bun impact, target 15 |
| S6 | B-20 only, see section 11 | | | | |

Rule for column B outside f0-29: index B = round(index A x 0.8), so the same moment in seconds is shown; the CTA band always takes the last frames of the clip (A-20 n48-95, A-14 n57-95), so the opener must be calm by 2.0 s. S1 screen time: 45 frames full frame at the top of the film, 15 more as Coffee A, plus lens, portholes and 48 frames in the CTA band; all 4 paid seconds are used. If i for S3 is below 15, hold n0 for the missing frames; if above 20, shift A later and accept a shorter C (no automatic regeneration). If p for S2 is above 10, Oud C ends on n71 held.

## 10. Audio plan

Score is synthesised (`audio.py`), 120 BPM, Khaleeji-modern: mirwas pattern, group claps, 808. Voices are the three existing stems, re-timed, not re-recorded.

| Frames | Music | Voice | Sound design |
|---|---|---|---|
| 0-29 | 808 on f0, mirwas pickup, clap f15 | V1 «مشروعك حلو…» at 0.00 s, «حلو» onset aligned to 0.500 s | Ice-on-glass crack f0, ticks f0/5/10 |
| 30-44 | Low-pass closes 8 kHz to 400 Hz | none | Nut scatter and syrup f30. Falling ticks f32/34/36 (1480, 1244.5, 1174.7 Hz) |
| 45-71 | Out. Room tone at -40 dBFS | none | Soft tap f45. Ghost clicks f57/60/63, then nothing |
| 72-89 | Riser, filter opens | none | Jump whoosh f72, rising landing ticks f78/81/84 |
| 90-134 | HERO 1 on f90: 808 + group clap. Full groove | V3 «طشّ!» dry, single take, f90 | Porthole pops f105/108/111, clap f120 |
| 135-284 | Groove peak, kick on every beat, clap on 2 and 4 | none | One world sound per entry: ice clink f135, charcoal crackle f165, sizzle f210, bun thump f225, crunch f255 |
| 285-329 | Mirwas + bass only | V2 «شنو حسابهم؟!» at f285 (1.1 s) | Typing ticks under the triplet |
| 330-389 | Riser; duck -9 dB at f381; silence pocket f386-389 | none | Typing ticks tripling per step (f330/345/360), pitch up a fourth per step |
| 390-449 | HERO 3 on f390: 808 + clap + pop. Half-time groove | V3 stacked x3 (0 / +35 / +70 ms; 0 / +2 / -3 semitones; centre / left / right) | Burst pop f390 |
| 450-587 | Calm groove: mirwas, soft bass, soft kick on f480/510/540 | none | Two-note pop f457 (synthesised, not a platform sound) |
| 588-599 | Reverse swell, 2 f of air | none | Tail designed so f599 into f0 is seamless |

Phone-speaker rules (measured on the final mix, printed by `audio.py`):
- Energy share 500 Hz-6 kHz: **25% or more.** Energy below 150 Hz: **50% or less.**
- Integrated loudness **-14 LUFS** (+/- 0.5). True peak **-2 dBTP or lower.**
- 808: 55 Hz fundamental with saturated harmonics at 110 / 165 / 220 Hz so the hit is heard on a phone.
- Voices: high-pass 120 Hz, +3 dB at 3 kHz, music side-chained -6 dB under each voice.
- Sound-off check: the film must read with no audio; every voiced line is also on screen.
- The 14 s score is its own render (hits at 3.0 s and 10.0 s), not a trim of the 20 s file.

## 11. Derivation rules

**A-20 TikTok.** Same 600 frames. Changes: CTA line 1 «دزّ لنا» 120 px (baseline 440), line 2 «بالخاص» unchanged, handle `@tash.creative` 60 px (baseline 800). `M11` proves no text, dot centre, porthole or lens sits in x > 960 over y 1100-1750.

**B-20 «شاليه؟».** Rows f0-89 are replaced by this table; f90-599 are A-20 with two changes listed under it. No V1 voice.

| f_in | f_out | Picture | AI shot | Arabic on screen | Sound |
|---|---|---|---|---|---|
| 0 | 14 | Pool full frame, azure. The ring lands on the water inside the first 0.3 s, real splash | S6 n0-14 | W + three dots. «شاليه؟» slot T 200 px Lime (keyline + block shadow) from f3 | 808 + water splash f0 |
| 15 | 29 | Punch-in 1.25x about (540,900) | S6 n15-29 | tag pulses on f15 | Clap f15 |
| 30 | 44 | Drain exactly as A-20, on kunafa | S5 n0-14 | tag leaves at f34 (on screen 1.1 s) | as A-20 |
| 45 | 77 | Dead state, identical | none | «محد يسولف؟» static f47-89 | as A-20 |
| 78 | 89 | Repaint circles reveal the pool splash | S6 n3-14 | line static | as A-20 |

Changes after f90: CTA band f540-587 = S6 n24-71 (water settling); wind-up f588-599 opens onto frozen S6 n0 with W and dots, so the loop closes on its own f0. Everything else, including both coffee beats, is unchanged.

**A-14 (420 frames, 14.000 s).** Same 15-frame grid, same geometry, same styles. TikTok and 4:5 rules apply to it unchanged.

| f_in | f_out | Picture | AI shot | Arabic on screen | Sound / voice |
|---|---|---|---|---|---|
| 0 | 134 | Identical to A-20 f0-134 (wordmark at 3.00 s) | as A-20 | as A-20 | as A-20 |
| 135 | 149 | Coffee A, full | S1 s4-18 | Tag «قهوة؟» | Kick, ice clink |
| 150 | 164 | Coffee B, lens L on Lime | S1 s30-44 | tag Ink (1.0 s total) | Clap |
| 165 | 179 | Oud A, full, puff on f165 | S2 n(p)..(p+14) | Tag «عطر؟» | Kick, crackle |
| 180 | 194 | Oud C, lens L on Lime | S2 n(p+15)..(p+29) | tag Ink (1.0 s) | Clap |
| 195 | 209 | Burger A, full | S3 n(i-15)..(i-1) | Tag «برجر؟» | Kick, sizzle |
| 210 | 224 | Burger B, bun lands on f210, 1.2x | S3 n(i)..(i+14) | same (1.0 s) | 808 + thump |
| 225 | 239 | Kunafa A, full | S5 n15-29 | Tag «حلويات؟» | Kick, crunch |
| 240 | 254 | Kunafa B, lens L on Lime | S5 n30-44 | tag Ink (1.0 s) | Clap |
| 255 | 269 | Talk on Paper, W stays | none | «شنو» f255, «حسابهم؟!» f260 | V2 f255-287 |
| 270 | 284 | Ground cuts to flat Tangerine. Dots 9 / 27 / 81 at f270 / 275 / 280 | none | talk line static | Ticks tripling, riser |
| 285 | 299 | Flood, solid Lime by f297 | none | line covered by f293 (readable f260-292, 1.1 s) | Riser peak, pocket f296-299 |
| 300 | 314 | Snap: M 840 px, porthole dots, burst dots. No tagline | S1 s48-62, S2 n20-34, S3 n(i+15)..(i+29) | M | HERO 3 at 10.0 s |
| 315 | 344 | CTA: panel + band. Lines f316/318/320, static from f321 | S2 n40-69 in band | CTA lines as A-20 | Calm groove, pop f318 |
| 345 | 374 | Band cuts to burger | S3 n40-69 | CTA static | Groove |
| 375 | 413 | Band cuts to settled coffee. Hold f321-413 = 93 f = 3.1 s | S1 s72-110 | CTA static | Last bar |
| 414 | 419 | Wind-up: lines fall, iris f414-416, frozen f417-419 | S1 s0 frozen | W + dots | Reverse swell |

**4:5 (1080x1350).** Its own layout, not a crop of the 9:16 render.
- Footage: source rows y 285-1635 (hero box becomes y 645-1325). Type layer: every y in this spec minus 208. W ink y 123-325; dots never above y 72.
- Tag slot T: 170 px (and 153 px for «حلويات؟»), baseline 545, so the tilted ink box ends at y 626 or higher, above the product top (y 645).
- Dead line baseline 532; M offer y 82-331, offer baselines 512 / 752, portholes y 917; talk baselines 522 / 742; snap M y 92-568; tagline baselines 492 / 692.
- Lens L: r 300 centred (540,985). CTA: panel y 0-760, baselines 232 / 452 / 592, typing dots y 690, band y 760-1350 with the hero box top drawn at y 790.
- Margins 72 px or more on all sides for all text. Thirds travel 1350 px, iris and shockwave end at r 1800. Multiplication table re-seeded for 1080x1350 (81 dots, same rules).

## 12. Acceptance checklist (every export, every variant)

| Check | Pass condition |
|---|---|
| Thumb-stop | f0 at 270x480: word readable, three lime dots countable and the largest lime shape, product named. Physical impact inside the first 0.30 s. Splash crown visible by f14 |
| Brand and idea by 3 s | Lime dots on «مشروعك» from f0; wordmark on screen at f90 (3.00 s) and settled by f94; offer line complete by f93. Muted 10-phone test before any spend: viewer says who is advertising and what they sell by 5 s |
| Colour | Lime field, flood or panel on 40% or more of frames (plan 53%); footage on 45% or more of frames (plan 67%). Zero frames with an Ink, Char or Smoke field |
| No dark muddy frames | Mean gamma luma Y' of every frame 0.40 or more (formula in section 4); the darkest planned ground is hot pink, 0.48 |
| Cuts on beats | Every picture cut on a multiple of 15 f; at most 2 cuts per second; no stretch longer than 15 f without a picture change in f90-449 except the two reading holds; impacts by remap: ice inside 0.30 s, puff f165, bun f225 |
| Safe zones | All key text inside Zone A, short lines in Zone B within x 300-780; measured, after tilt; nothing readable below y 1250; TikTok rail box empty; 4:5 margins 72 px |
| Tags and products | No tag ink box intersects the product in any frame, including punch-ins (`M11` mask test) |
| Readable holds | 1 word 0.9 s or more; 2 words 1.1 s or more; **3 words 1.4 s or more**; CTA 3.0 s or more with all lines static |
| Flash limit | In any 30 f window: 3 or fewer opposing pairs of luma steps (0.10 or more over 25% or more of the frame), every cut, iris, third and lens entry counted (plan: 1 pair per second). No saturated-red transitions. PEAT or equivalent pass. Ramps at f90 and f375 |
| Lens test | At 270x480, 3 of 3 first-time viewers name the product inside lens L for each world. Footage inside the letters of W (D9) may replace a lens beat only if it passes the same test |
| Arabic | Per-word animation only; no split letters; shadda intact; RLM punctuation on the left; proofread by a second read of every line in section 7 |
| CTA | Two lines + handle only; nothing shaped like a button; handle 60 px or more, contrast 7:1 or more |
| Loop | f599 to f0 SSIM 0.99 or more; audio tail seamless |
| Honesty | No prices, numbers, results, reviews or client names; «شنو حسابهم؟!» is a dramatised line, never presented as a real comment; worlds are generic style samples; no logos, labels, text, faces or hands in footage; AI label ON; caption line «الصور والأصوات بالإعلان مولّدة بالذكاء الاصطناعي.» |
| Determinism | Any frame rendered twice is identical; report JSON from `M11` attached |

## 13. Recorded as owner decisions (not director choices)

- Seedance 2.5 for the opener only (one shot, 4 s, 1080p), everything else Kling 3.0 Pro, hard cap 200 credits («خله للبداية و ضبط الدنيا»).
- Lime-led bright frames and three non-brand backdrop colours («ألوان ليموني فاقعة»).
- «طشّ!» voiced twice (dry at f90, stacked at f390). AI label ON.
- No video is generated before the owner approves the stills storyboard; cost is stated before every generation.

## 14. Still open (needs the owner or a measurement)

- Onset of the voiced «حلو» in stem V1: measure, then shift or stretch the stem (6% or less) to 0.500 s. If it needs more than 6%, the owner hears both versions.
- Native frame rate of Seedance output: read from the 480p draft; picks column A or B in section 9.
- Seedance finalise quote: assumed 64 credits; confirmed at generation time, before spending.
- Exact ش teeth centre from `word_export.py` (dot row nominal x 623 / 715 / 807).
- Burger still: two candidates, owner picks, or kunafa takes the slot.
- A fifth, non-food world (flowers or abaya fabric, +7.25 credits) was asked for by the red team and is not in this plan; owner decides.
- Carried over from v3: muted 10-phone test, and the caption wording that an ad at this level is quoted separately.
- `cues.v4.json` is to be written from section 7 at build time.
