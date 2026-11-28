# «طشّ للطلاب» — the launch ad for TASH's student line · «المرة الجاية… خلّ التصميم على طشّ.»

This is an ad for **TASH's own account** that opens the new line «طشّ للطلاب»: design, layout and production of
students' digital work (presentations, reports, research formatting, posters, videos, CVs, any Office file). It is not
a spec for another brand. **Status: built (fix round 2 applied, 26 Nov). The fix-round-1 render was sent to the owner as a
draft on 26 Nov ~06:30 at his request; this fix-round-2 render is not delivered yet. Not approved, not published.**

> **Nobody has listened to the edited voice-over** (the owner picked take 1 on 26 Nov; the cut edit is unheard). Claude cannot hear audio. The dialect, the pronunciation («باچر»،
> «الياية»، «بريزنتيشن»، «طشّ»، «سي في»), the cuts inside the read, the 1.08× tempo-up and the moved breath were all
> judged from measurements only. **The owner judges the dialect** before anything is posted. The music and the sound
> effects have not been heard by anyone either.

| File | Format |
|---|---|
| `TASH-students-9x16-vo.mp4` | **the one to post.** 1080×1920 · 30 fps · 891 frames · 29.70 s · H.264 High yuv420p (BT.709) + AAC-LC 48 kHz stereo 320 kb/s · voice + music + SFX · −13.9 LUFS integrated · true peak −1.3 dBTP · LRA 1.2 LU (measured on the MP4 with `audio-check.sh`, fix round 2) |
| `TASH-students-9x16-novo.mp4` | the same picture, music + SFX only (spare; the film reads without sound) · −14.0 LUFS · true peak −1.6 dBTP · LRA 2.6 LU |
| `poster.png` | 1080×1920 reel cover made for the grid: the splash's lime field, the lock-up «طشّ للطلاب» big in the centre 3:4 (y 240–1680; fix round 2: the film's one lock-up, an ink pill with a lime outline 24 px under the wordmark), card 1 «مسار» under it with «نماذج من تصميمنا». Source `src/poster.html`. For a TikTok frame pick use the end card around f850 (28.33 s), when everything is on (the fan behind it is blurred and faint: no sample is readable there, so no label is needed) |
| `contact-sheet.png` | the film at 4 fps (every 7.5 frames), frame numbers on each tile |
| `caption.md` | Instagram + TikTok captions (from `script.json`), alt text, posting notes in Arabic (AI label ON) |
| `script.json` · `SCRIPT-COPY.md` | the final copy (every on-screen string is copied from `script.json`) |
| `samples/` | the 18 sample works (HTML → PNG, fictional topics), reusable as portfolio |
| `src/` | the reproducible source (see *Rebuild*) |

---

<div dir="rtl">

## الفكرة (عربي)

**«السلايد الفاضي».** كل طالب يعرف السلايد الفاضي الساعة ٢ الفجر.

الإعلان يبدأ من ورا طالب حاط إيدينه على راسه قدام لابتوب شاشته بيضا، والسؤال طالع من أول كادر: «عندك برزنتيشن؟»، وبعده «تقرير؟ بحث؟» مع الإيقاع.
والساعة «٢:٤٧ ص» صغيرة فوق على اليسار من أول كادر، وهي نفسها تصير ساعة التطبيق بعد ما ندخل الشاشة.
الكاميرا تنغمس بالشاشة لين تصير بيضا، ونفس البياض هو السلايد الفاضي: الكاميرا ترجع لورا ونشوف تطبيق عرض فاضي: الساعة ٢:٤٧ ص،
رسالة بالقروب «منو مسوّي البرزنتيشن؟؟»، وإشعار «التسليم: باجر ٨:٠٠ ص». السطر الكبير الوحيد: «والتسليم… باجر؟».

بعدين الإشعار يطير والتطبيق يغمق، وتنزل رسالة كبيرة من طشّ بنص الشاشة، تكتب نفسها كلمة كلمة: «المرة الجاية…» / «خلّ التصميم على»،
وتحتها نقاط الكتابة «•••» تنتفخ مع الصعود الموسيقي. على الضربة **النقاط تنفجر طشّة ليموني** تغرق الشاشة كلها ورا الرسالة وتمسح
ملف الطالب (ملفه ما ينعرض وهو مخلّص أبداً: ما نوعد إننا ننقذه بنفس الليلة). النقاط ما تتحرك: هي نفسها نقاط الشعار، وجسم «طشّ»
يطلع حواليها بنفس السطر، فالرسالة تنقرا: «المرة الجاية… خلّ التصميم على طشّ.» وبعدها «للطلاب» تلزق تحت الشعار.
بعد ما ينقرا الشعار، أول نموذج من تصميمنا يطير من تحت كشي جديد (مو ملف الطالب)، مكتوب عليه «نماذج من تصميمنا».

بعدها النماذج تجاوب الأسئلة بنفس الترتيب، وكل واحد يطيح على نفس البقعة مع ضربة، وملصقه يطلع معاه هو: برزنتيشن «يشدّ من
أول سلايد.»، تقرير «نرتّبه.»، بحث «ننسّقه عدل.» (عناوين، ترقيم، مراجع)، بوستر، فيديو، CV، وإكسل «وأي ملف أوفيس.».

التفاصيل: صفحة فهرس مايلة، والخطوط تنضبط على الهامش مع «نضبّطها.». وبعدين القاعدة كلمة بكلمة على سلايد واحد قبل/بعد،
**بنفس الكلمات بالجهتين**: «المعلومة منك… والترتيب والتصميم علينا.» (إحنا نصمّم ونرتّب، ما نكتب بدال الطالب).

نفس السلايد يطلع على شاشة قاعة محاضرات (قطع مطابق): «ويوم التسليم… خلّ شغلك يسولف عنك.» (كلمة «التسليم» ترجع فخر مو خوف).
الكرت الأخير: «طشّ» + «للطلاب» + «شغل يبيّض الوجه.» + «اطلب الحين — دزّ لنا بالخاص» + الحسابين، وآخر كلمة: «بس مو آخر ليلة.»
وعلى اللوب ترجع للبداية.

</div>

## The idea (English)

**"The blank slide."** Every student knows the blank slide at 2 a.m. The film opens behind a student with both hands in
his hair in front of a laptop with a white screen; «عندك برزنتيشن؟» is on from frame 0 (with a small «٢:٤٧ ص» at the top
left, which becomes the app's own clock inside the screen), «تقرير؟ بحث؟» punch in on the beat. The camera dives into the screen to white, and that white IS the blank slide: the camera whips back and we are
inside a generic slide app: 2:47 a.m., a group chat «منو مسوّي البرزنتيشن؟؟», a reminder «التسليم: باجر ٨:٠٠ ص», and the
one big line «والتسليم… باجر؟».

The reminder flies off, the app dims, and a big message from TASH lands in the middle of the screen and types itself
word by word: «المرة الجاية…» / «خلّ التصميم على», with the typing dots «•••» on the row under them, swelling on the
riser. On the hit **the dots fire a lime splash** that floods the whole screen behind the message and washes the
student's file away (it is never shown finished: the ad does not promise a same-night rescue). The dots do not move:
they are the wordmark's dots, and the body of «طشّ» slams in around them on the same row, so the message reads «المرة
الجاية… خلّ التصميم على طشّ.»; «للطلاب» snaps under it. Once the lock-up has read, TASH's first sample flies up from
below as a new object (not the student's file), labelled «نماذج من تصميمنا».

The samples then answer the three questions in the same order, each dealt onto one lit spot on a beat, each with its own
chip riding on it: presentation «يشدّ من أول سلايد.», report «نرتّبه.», research «ننسّقه عدل.» (headings, numbering,
references), poster, video, CV and an Excel dashboard «وأي ملف أوفيس.». Details: a tilted contents page whose rows and
guides snap onto the margin on «نضبّطها.»; then the rule line word for word on one before/after slide with **the same
words on both sides**: «المعلومة منك… والترتيب والتصميم علينا.» (we design and format; we do not write the student's
work). The same slide goes up on a lecture-hall screen (match cut): «ويوم التسليم… خلّ شغلك يسولف عنك.» End card: the
logo, «للطلاب», «شغل يبيّض الوجه.», «اطلب الحين — دزّ لنا بالخاص», both handles, and the twist «بس مو آخر ليلة.»,
which loops back into the hook.

---

## Final timeline (891 frames · 30 fps · 125 BPM · beat k at 1.401 + 0.48·k s; the music inserts one beat after the payoff chord)

| Frames | Seconds | Scene | Picture | On screen (from `script.json`) | VO (take 1, edited) | Sound |
|---|---|---|---|---|---|---|
| 0–77 | 0.00–2.60 | `s1_hook` | AI plate h1 (Kling): the student from behind, hands in hair to ≈ f50, then his head drops (no typing at any point); a camera lunge already moving on f0 and one on each question; the desk and hands lifted ≈ +0.4 stop to f40, then his head and shoulders lifted with a cool rim; from f64 a dive into the screen with shutter blur and bloom; pure white on f77 | «عندك برزنتيشن؟» on from f0 · «٢:٤٧ ص» (56 px prop, top left) from f0, burns out with the white · «تقرير؟» f42 · «بحث؟» f62 (sharp to f73) | «عندك برزنتيشن؟ تقرير؟ بحث؟» 0.10–2.71 | room tone, laptop fan, tension drone, three dry hits f13/f42/f62, dive whoosh cut dead on the white |
| 78–223 | 2.60–7.47 | `s2_screen` | match cut on the white: f78 is the blank slide filling the frame; the camera whips back to the app (settled ≈ f87); then ONE continuous move on the app layer only, f87 → the hit (push 1.00 → 1.08, 1.5° of roll, a slow drift, accelerating into the riser); «باجر؟» throbs on the heartbeat; blank white slide, caret on the beat, cursor wandering; the reminder flies out to the right on f137–141 (on its own row); the app dims 40 % under TASH's message | small props: «٢:٤٧ ص» (the hook's clock settles onto the status bar f78–90), «عرض بدون عنوان», «انقر لإضافة عنوان», group chat «منو مسوّي البرزنتيشن؟؟» f83, «تذكير / التسليم: باجر ٨:٠٠ ص» f85 · the big line «والتسليم…» f92, «باجر؟» f117 (punch) | «والتسليم… باجر؟» 3.06–4.59 | blip f78, chat pop + phone buzz f83 (ends 2.99 s), ding f85 (short: done before the voice), clock tick on every beat to the hit |
| 140–257 | 4.67–8.60 | `s3_splash` | the TASH message springs up from 220 px below on f141 (first seen f142) into the middle of the frame (the message group sits ≈ 170 px lower than before: centred ≈ y 935 at the hit); the bubble is always grown BEFORE its content (two rows f157, the row-2 width by f180, three rows f184) and each word pops whole inside it; typing dots on row 1 (f142–146), row 2 (f161–181), row 3 from f189 (= the wordmark's dots), swelling on the riser; **the splash on f215** (bar line): solid droplets burst out of the bubble's rim (under it, never on the type), the lime floods behind the bubble; the wordmark's body lands around the dots (f216), the shadda drops, the full stop lands clear of the ش; «للطلاب» f229, the film's one lock-up (ink pill, lime outline, lime type, 24 px under the wordmark); card 1 flies up from below f238–257 while the message steps back up and to 0.90 (f236–252), and lands ≥ 48 px under it, on the parade camera's first view | «•••» f142 · «المرة الجاية…» f150/160 (stays to the cut) · «خلّ التصميم على» f185–204 + «•••» · on the hit «…على / طشّ.» · «للطلاب» f229 · «نماذج من تصميمنا» from f238 (card 1's first frame) | «المرة الجاية… خلّ التصميم على طشّ.» 4.98–7.59 (the word «طشّ» is the hit) | bubble pop f143, soft typing, riser f193 cut at the hit, **SPLASH f215** (water + TASH clap + sub; its 0.4–3 kHz band is cut 6 dB for 0.13 s under the spoken «طَ»; the groove drops), lock-up snap f229 |
| 258–516 | 8.60–17.23 | `s4_parade` | the samples as physical cards on a dark glossy stage, one 3D camera that never stops (it starts on card 1 low and tilted, where s3 left it; a steady push through f284–296); the school deck GROWS out from behind card 1 on the beat (f287–296); each card lands sharp on its cue frame and is filed into the fan over 18–20 frames (eased, with a motion blur at the fastest part); the report's cover turns f338–348 and its contents page f354–363, and both close on the frame clock as it is filed; full fan hold f503–516 with the deck «مسار» as the near left wing, the video card peeking out at the top, the dashboard the hero | chips (each pops on its own card's land frame and rides on it): «برزنتيشن؟» f261 · «تقرير؟» f330 · «بحث؟» f366 · «بوستر» f416 · «فيديو» f431 · «CV» f452 · «إكسل» f481; answers (one spot, y 1404; each holds until the next replaces it, dimmed to 70 % under the next card) «يشدّ من أول سلايد.» f287–345 · «نرتّبه.» f346–384 · «ننسّقه عدل.» f385–440; tags «عناوين/ترقيم/مراجع» (46 px, ink pills with a lime outline) f388–395; «وأي ملف أوفيس.» f481; `.pptx .docx .xlsx .pdf .mp4` f488–503 (row tops at y ≈ 1472, under the dots of «وأي») | «برزنتيشن؟ يشدّ من أول سلايد. تقرير؟ نرتّبه. بحث؟ ننسّقه عدل. بوستر. فيديو. سي ڤي. وأي ملف أوفيس.» 8.58–16.89 | one hit per card (pitch rising), whooshes; a fan flick + three flicks as the school deck grows (f287); one page flip on each report turn (f342, f357); a flip as the research spread lands; shutter, rising pluck as the chart draws, five clicks on the file chips, held chord on the fan |
| 517–686 | 17.23–22.90 | `s5_details` | A: macro push into the report's contents page; the rows sit visibly out of line (ragged ±40–80 px both ways, one row tilted 3°, the numbers off their column) while the guides draw on «الهوامش…»; on f553 everything **snaps** onto the margin at once (≈ 15 % overshoot, settled f555); the guides, the band and the handles stop at y ≈ 1190, above the caption; B (hard cut f589): ONE slide before/after with the same words on both sides: it opens on a 1.30× macro of the plain slide easing back, pulls back faster on the swipe (f618, bar line; 82 % of the width on f640), turns at f664 and pushes back in to exactly s6's screen rect on f686, still moving | «حتى الهوامش…» f524 · «نضبّطها.» f553, both held to the cut (f588) · «قبل» f589 · «المعلومة منك…» f589/606 · swipe f618 · «بعد» f620 · «والترتيب والتصميم علينا.» f625–660, held to f686 | «حتى الهوامش… نضبّطها.» 17.46–19.05 · breath 19.21–19.58 · «المعلومة منك… والترتيب والتصميم علينا.» 19.62–22.54 | macro whoosh, music thins, margin snap (click + bell) f553, rule line: music back to the beat, nothing busy; swipe whoosh f618 |
| 687–775 | 22.90–25.87 | `s6_payoff` | match cut: the same slide on the lecture-hall screen (AI still h2, mirrored so the presenter stands at the left edge; 2.5D push-in with a parallax near-row layer, her hand in front of the slide); on the chord (f719) a one-frame 1.00 → 1.06 punch-in toward the screen, the slow push continuing from there, and the two classmates' phones flare (+40 %, 6-frame decay) | «ويوم التسليم…» f689 (above the screen, 68 px) · «خلّ شغلك / يسولف عنك.» (116 px, two right-aligned rows at x 920, on a 35 % ink band) f719, complete f748, held to f775 | «ويوم التسليم… خلّ شغلك يسولف عنك.» 22.86–25.41 | room air, low swell, **wide chord f719**, the beat builds back (one inserted beat) |
| 776–890 | 25.87–29.70 | `s7_end` | end card on ink: the logo wipes and slams, its dots type and drop into the ش; a 3 % push to the last frame and the parade's fan drifting behind, blurred 12 px at 7 % (no sample readable); the stack on one rhythm (24 / 24 / 40 / 56 / 64 px between ink), centred ≈ y 900; the dots answer the sonic logo, the CTA glows on its hit | «طشّ» + «للطلاب» (the lock-up: ink pill, lime outline) + «شغل يبيّض الوجه.» f776–782 · «اطلب الحين — دزّ لنا بالخاص» (the only solid lime pill, 47 px) f784 · «إنستقرام: ‎@tash.creative.kw» f791 · «تيك توك: ‎@tash.creative» f793 · «بس مو آخر ليلة.» f820–842 (82 px, a lime underline draws 12 px under its lowest dot) | «دزّ لنا بالخاص…» 26.10–27.03 · «بس مو آخر ليلة.» 27.30–28.44 | clean hit f776, CTA pop f784, handle ticks, wink pluck f813 (before «بس»), the bar-52 fill without its two kicks and clap under «ليلة.», **TASH sonic logo**: ticks from f854 (after the last word), hit f863, alone after the voice |

The samples label «نماذج من تصميمنا» is on every frame from card 1's first visible frame (f238) to the end of the payoff
(f775), top right, one opaque pill (36 px for card 1's first 15 frames). Every on-screen string is copied byte for byte
from `script.json` through `src/cues.json` (`src/tools/build_cues.py` asserts it). «سي ڤي» is said and written «CV»,
as the script decides.

## The VO edit

- Source: `vo/take1.mp3` (ElevenLabs `eleven_v4`, voice «Jassim Almathkour» `lB6K69u17Gb2FSiT9pVV`, generation
  `78njtU9gFZpS7XmjjyqV`, 28.32 s), **the owner's pick** (26 Nov, «ابي صوت take1»). Take 2 (`G1C1EOc1VgQpsji2ZXsx`,
  28.88 s) is not used.
- The read was cut into 24 phrases at measured silences (`src/tools/vo_pieces.py`; the aligner was up to 0.36 s off,
  so the cut points come from the waveform, not the word timings), sped up 1.08× with rubberband (pitch and formants
  kept) and placed on the 125 BPM grid (`src/tools/vo_edit.py`): every grid-placed key word starts within 8 ms of its
  beat or half-beat. The take's one inhale was moved from before «حتى الهوامش» to before the rule line (film
  19.21–19.58 s). Result: `src/vo/vo_edit.wav` (voice 0.10–28.44 s) + `src/vo/vo_timeline.json`.
- Fix round (26 Nov), measured on the new `vo_edit.wav`: «بوستر.» → «فيديو.» keeps the take's own pause (104 ms heard,
  was 1 ms: they ran together); «فيديو.» ends on a normal 35 ms tail and «سي ڤي.» starts after 100 ms of air (p4c is no
  longer cut as a joint inside running speech; the «و» was clipped); «ويوم التسليم…» starts 0.12 s earlier, on the cut
  to the hall, so «خلّ» gets 240 ms of air (was 35 ms); «بحث؟» starts 0.07 s later (160 ms after «نرتّبه.», was 65 ms);
  «دزّ لنا بالخاص…» and «بس مو آخر ليلة.» start one beat later (the closing line now holds before the end card). Every
  heard gap between two lines is ≥ 160 ms and every gap ≥ 100 ms.
- In the mix the music is ducked 7 dB under the voice and, in the 1.5–5 kHz band, a further 5 dB (a carve keyed to the
  same side-chain); the SFX are ducked 6 dB; the voice is de-essed and levelled per phrase.

## Sound

Original, synthesised by `src/audio.py` with the house engine `_system/audio/tashaudio.py` (no samples, no stock, no
paid tool): 125 BPM in F major, UK-garage 2-step with swung hats and Jersey-club kick rolls into the turns; the home
chord (F) is held back to the payoff chord and the sonic logo. One beat is inserted after the payoff chord
(`cues.json → music_insert`: the music's logical beat k ≥ 48 sounds at film beat k + 1), so the chord rings a full bar
into the end card. The sonic logo is rebuilt from the TASH ingredients and timed to the cues (ticks after the last word,
hit f863) instead of the 4.2 s `tash-sonic-logo.wav`. Both mixes are mastered to −14 LUFS, true peak ≤ −1 dBTP, then
muxed with a two-pass linear loudnorm. Every SFX is placed on its cue frame (39 of the 40 cue events, all within 1 frame of
`cues.json → sfx`, checked from the audio's own event log; `kbd_taps` stays cut: his hands are in his hair).

Intelligibility (VO mix, measured on the exact stems, voice against everything else): every phrase is 10.1 dB or
more above the bed at 1–4 kHz (the weakest «برزنتيشن؟» on card 1; «بس مو آخر ليلة.» 14.9 dB, was 6.4), and no voiced
50 ms window (300–3400 Hz) is under +5.7 dB (the splash «طشّ» and «دزّ»). The sonic-logo bus is silent until the voice ends (28.44 s).

## Sources and credits

| What | Source | Cost |
|---|---|---|
| Hook plate `h1_desk` | Higgsfield: GPT Image 2.6 still, job `78632359-5cb0-4b24-a1dd-e0a77e671c17` → Kling 3.0 Pro 5 s video, job `503ca4db-1c04-4bb3-b70f-918c224c4448` (first ≈ 2.6 s used, 1.25× without interpolation) | 12.75 Higgsfield credits in total for the three jobs, by the balance (415.25 → 402.5) |
| Payoff plate `h2_class` | Higgsfield: GPT Image 2.6 still, job `efd5fefe-6cf4-4677-a10a-030ece748b93` (mirrored; 2.5D camera, slide comped into the screen, presenter's hand matted in front) | (in the 12.75) |
| Voice-over | ElevenLabs, voice «Jassim Almathkour», model `eleven_v4`, two takes (take 1 used) | 924 ElevenLabs credits (462 per take) |
| Sample works | 18 designs made by TASH for this ad as HTML → PNG (`samples/src/`), fictional topics, names and numbers (every number labelled sample data) | 0 |
| Music, SFX, sonic logo | `src/audio.py` + `_system/audio/tashaudio.py` (original) | 0 |
| Type | Alexandria, IBM Plex Sans Arabic, Archivo, JetBrains Mono (all SIL OFL, in `_system/fonts`) | 0 |
| Logo | `_system/brand/logo.mjs` (TASH wordmark) | 0 |
| Edit, motion, comps, type, sound design | TASH (Claude, as the studio's builder), in `src/` | 0 |

The student shot, the lecture hall and the voice are AI-generated; the caption says so and the AI label goes ON at
upload (`caption.md`). No paid tool was called during the edit, the integration or the fix round.

## Rebuild (from the `tash/` root)

```bash
python3 12-students-ad/src/tools/vo_pieces.py && python3 12-students-ad/src/tools/vo_edit.py   # VO edit (deterministic)
python3 12-students-ad/src/tools/build_cues.py            # cues.json from script.json + vo_timeline.json
python3 12-students-ad/src/tools/prep_h1.py && python3 12-students-ad/src/tools/prep_h2.py      # footage frames
(cd 12-students-ad/samples/src && node render.mjs before-slide 1920 1080)                       # the plain BEFORE slide
(cd 12-students-ad && python3 src/assets/s4_parade/prep_assets.py && python3 src/assets/s5_details/prep_s5.py \
   && python3 src/assets/s6_payoff/prep_s6.py)           # baked scene assets (s6: the mirrored room)
python3 12-students-ad/src/audio.py                       # src/audio/mix_vo.wav + mix_novo.wav (≈ 20 s)
WORKERS=3 bash 12-students-ad/src/build.sh                # picture (≈ 5 min on 4 cores) + both muxes
bash _system/tools/audio-check.sh 12-students-ad/TASH-students-9x16-vo.mp4
node 12-students-ad/src/tools/sweep.mjs 0 890 1           # every frame: safe area, platform map, strings, ink overlap → issues: 0
node _system/tools/render.mjs --page 12-students-ad/src/poster.html --stills 0 --stills-dir <dir>   # → poster.png
```

Stills of any moment: `node _system/tools/render.mjs --page "12-students-ad/src/index.html?guide=1" --stills 7.2,8.5
--stills-dir 12-students-ad/review/x` (`?guide=1` draws the safe area and flags type outside it). The build contract
for the scenes is `src/CONTRACT.md`; the mixes and `out/` and `review/` are git-ignored and regenerated.

## Integration pass (lead, 26 Nov)

Five builders filled the scaffold (s1+s2, s3+s7, s4, s5+s6, audio). The lead rendered the whole film, pulled every
cut and every text change at 1:1 and swept all frames in the page for text outside the safe area and for strings that
are not in `script.json`. What changed then (also logged in `src/REQUESTS.md`): a clean white hand-over s1 → s2; the
splash lock-up stacked; the TASH bubble inside the safe area; the samples label from card 1's first frame; no stacked
chips; the video timecode's minutes roll over; «١٫٧» hidden; the rule line and the closing line no longer edge to edge;
the hook's keyboard taps cut. (Several of these were superseded by the fix round below.)

## Fix round (lead, 26 Nov, after four hostile review lenses: arabic-truth, picture, sound-spec, audience)

All fatal and major findings were applied, and every minor one that was cheap and clearly right. No paid tool, no new
footage, no new VO. Where a fix differs from the reviewer's suggestion, or a finding was not applied, the reason is here.

**The splash (the most important 2.5 s).**
- *Student's slide → card 1 continuity (arabic-truth major, picture major).* Fixed by construction. Card 1 is no longer
  a lime-coated card on the student's slide rect: the lime field holds no slide-shaped object from the hit until card 1
  enters on f232; then card 1 flies up from below the frame as a new object, tilted, ≈ 70 % of the frame width, into
  the lower third (its top stays below y ≈ 1080, under the lock-up), and settles exactly where the parade's camera now
  first sees it (`s4_parade.js → HANDOFF`, card 1 centred ≈ (540, 1300), 760 px wide, rolled −3°). The parade's camera
  then lifts it to the spot. The only dark rounded rectangle on the lime from f216 is TASH's own message bubble (it was
  on screen before the hit, carries the line and the wordmark, and never shows a slide).
- *Lock-up misread «خلّ التصميم على مسار» (picture major) / climax under-delivers (audience major).* The wordmark now
  lands exactly where the dots were, on its own row under «خلّ التصميم على», ≈ 560 px wide in the middle of the frame;
  the dots never move (they ARE the logo's dots), so it never reads «طس»; «للطلاب» snaps under it; card 1 appears only
  after the lock-up has read, below it. Deviation: the reviewer asked for the wordmark «on the same baseline» as «على»;
  on its own row it can be end-card size, which the audience lens asked for; the reading order is unchanged.
- *Turn beat stillest and smallest (picture major).* TASH's message is now the hero: centred, 84 / 100 px type (110 px,
  as suggested, does not fit «خلّ التصميم على» inside x 64–1016 on one row), each word popping with a 2-frame overshoot,
  the bubble springing to hold it, the app dimmed 40 %, the dots swelling on the riser. Not taken: pushing the camera
  1.6× (it would carry the bubble off the safe area).
- *Lower third empty / bubble jammed top-right / small sender (audience minor).* The bubble is centred and the sender is
  44 px. Not taken: moving the app down 260 px; it would put the student's slide where card 1 now arrives (the
  continuity the arabic-truth lens forbids).
- *Clip-art burst over «على» (picture major).* The stroked amoeba, the 50 % ghost blob and the stroked oval droplets are
  gone. The burst is solid lime droplets with an inner shade and a one-frame smear, drawn under the text, from the dots.
- *Bubble text spilling out (arabic-truth minor).* The text is clipped to the bubble's own rect every frame.
- *Full stop on the ش (arabic-truth minor) / missing full stop (picture minor).* The full stop is a paper dot on the
  ط's baseline, left of the ش's measured leftmost ink with a clear gap (≈ 20 px at 1:1), from f222.
- *Lime run-off drips (picture minor).* Superseded: card 1 is never coated.
- *Frozen f242–257 (picture major).* Card 1 is still flying in (a soft overshoot into f257), the bubble breathes, ripples
  run on the lime.
- *Reminder fragment beside the bubble (picture minor).* The reminder flies off as the message lands (f140–144).

**Hook and screen.**
- *Frame 0 (audience major).* «عندك برزنتيشن؟» is on, full size and sharp, from f0; the first camera lunge is already
  moving on f0; the desk and hands are lifted ≈ +0.4 stop (×1.32 through a soft mask) to f40.
- *«بحث؟» sharp for 7 frames (arabic-truth minor).* It lands on f59 (≈ 0.2 s before the word; its hit moved with it) and
  stays sharp to f73.
- *Black head mass f50–77 (picture minor).* Its blacks are lifted ≈ +12 IRE with a cool rim of the laptop's light; the
  old sentence «his hands are in his hair the whole time» was wrong: his hands are in his hair to ≈ f50, then his head
  drops; there is no typing at any point.
- *Dip to grey at the hand-over (picture minor).* A real match cut: f78 is the app's blank slide scaled 3.75× (its white
  fills the frame), the camera whips back to the app by ≈ f87; no white layer, no exposure filter. The group chat pops
  on f83 (once its bubble is inside the safe area; still before the reminder on f85).

**Parade.**
- *Chips pop on the previous card (arabic-truth minor, picture major).* Every chip pops on its own card's land frame,
  rides on that card's bottom-right corner (projected from the card's current pose every frame) and is gone on the
  frame the next card lands; card 1's chip pops 3 frames after the cut, once the camera has lifted its corner. Swept:
  no two chips are ever on screen together.
- *Back slides showing cut title lines (picture minor).* The two middle university slides sit fully behind the title
  (only their dark edges); every slide that shows, shows a whole headline.
- *Research tags too small (audience minor).* 46 px, lime chips with ink type.
- *High-school read (audience minor).* Partly taken: the school deck's title slide «دورة الماء في الطبيعة» is now the
  nearest wing of card 1's fan, and the recycle poster stays the most visible card of the full-fan hold; the school
  deck is also in the end card's drifting fan. Not taken: re-stacking the full fan (the dashboard is card 7's hero).
- *Samples label blinking grey (picture minor).* One opaque pill (#161616) on every frame.

**Details, payoff, end card.**
- *Before/after unreadable (picture major) and not word for word (arabic-truth minor).* `samples/src/before-slide.html`
  now carries exactly the words of the after slide («مشروع تخرّج», the year, «مسار», the subtitle, the four meta lines
  including «فاضي الحين · موقف ب-١٤», «٠١ / ١٢») as a plain default slide: title ≈ 71 px and body ≈ 34 px on screen.
- *Locked-off rule-line slide (picture major).* One continuous push 0.92 → 1.00 from f589 to s6's screen rect on f686,
  still moving at the match cut.
- *Lines cut too soon (arabic-truth minor).* The rule line now holds 0.90 s after its last word (f660 → f686, was 0.77 s)
  and the closing line 0.90 s (f748 → f775, was 0.53 s): the film is 891 frames = 29.70 s. Deviation: the reviewer asked
  for the s5 cut on f689; it is on f686/687 so that «ويوم…» (moved 0.12 s earlier for air before «خلّ», a sound-spec
  major) starts on the cut, not over the rule-line slide; one music beat was inserted after the chord instead of
  shifting the grid by 14 frames, so the end card and the sonic logo stay on the music's bar lines.
- *Presenter under the button column (picture minor).* The hall is mirrored (plate, hand matte, near rows, phones;
  `prep_s6.py MIRROR`); she stands at x ≈ 20–170; the slide is comped un-mirrored; s5's match cut follows the new
  screen rect.
- *End card frozen and template-like (picture major / minor), CTA under-ranked (audience minor), em dash short (picture
  minor).* A 3 % ease-in push to the last frame, the parade's fan drifting behind at ≈ 13 %; the CTA is a lime pill with
  ink type (57 px: 64 px would not fit inside the safe area on one line), pulsing once on the logo hit; the tagline is
  quiet (44 px); handles 48 px with paper labels; «بس مو آخر ليلة.» 82 px with its own beat and a lime underline; the
  em dash is drawn from IBM Plex Sans Arabic at full length (the character is unchanged).
- *Cover (picture major, audience minor).* A dedicated `poster.png` (see the table at the top).

**Platform UI (sound-spec major, audience major).** Every key line ends at y ≤ 1540 (most at ≤ 1500) and keeps its
right edge at x ≤ 950 over y 1100–1750, and x ≤ 920 for the key lines over y 900–1650: the hook's bottom row (lifted
70 px; higher would cover his hands), «باجر؟» (170 px, lifted), the parade answers and file chips, «حتى الهوامش… /
نضبّطها.» (110 px higher, the camera shifted so the margin guide sits at x ≈ 915), the rule line and the payoff pair
(right-aligned at x 920), the end card. Swept on every frame (see below).

**Sound.** The music carve + the −6 dB SFX duck (intelligibility above); the wink pluck now sits in the gap before
«بس» (f813); the sonic-logo ticks start after the last word and the VO mix's tail lift starts at the end of the voice.

**Checks run after the fix round.** Every frame of the page swept for visible text (opacity through all ancestors) outside
x 64–1016 / y 250–1620, below y 1540, past x 950 over y 1100–1750, past x 920 over y 900–1650 for key lines, and for
strings not in `script.json`: 891 frames, 0 issues. Every changed moment pulled from the final MP4 and inspected at 1:1 (the hook's
first frames, f55–78, the match cut f77–92, f138–160, f205–262, every chip change, f585–627, f680–695, f744–780,
f812–890).

## Fix round 2 (lead, 26 Nov, after the same four lenses re-reviewed the fix-round film)

All 1 fatal and 17 major findings were applied, and every minor one (14). No paid tool, no new footage, no new VO; the
film stays 891 frames = 29.70 s. Where a fix differs from the reviewer's suggestion, the reason is given.

**Arabic kept whole (the fatal and the dots).**
- *The file-chip row over the dots of «وأي» (fatal, picture; major, arabic-truth).* The row moved 36 px down (centre y 1498,
  tops ≈ 1472, bottoms ≈ 1524). **New build check** (`scratchpad/…/r2/sweep2.mjs`, rule E): on every frame, every visible
  Arabic line's real glyph ink (canvas glyph metrics on each text run, dots below the baseline included, +2 px) is tested
  against the box of every chip, pill, file chip, label, CTA, underline, guide and handle; it was proven on the old row
  (it flags f490–500 at the old y 1462) and passes on all 891 frames now.
- *The underline through the dots of «بس مو آخر ليلة.» (three findings).* It now sits 12 px under the line's lowest dot
  (measured ink), checked by rule E on f821–890.
- *Guides and a snap handle beside «حتى» (two findings).* The whole guide plane (guides, margin band, dimension, the
  handles) is masked to frame y ≤ 1190, ≥ 30 px above the caption's ink; rule E checks it (clipped at the mask).
- *Droplets landing as extra dots (two findings).* The burst now flies out of the bubble's rim and is drawn UNDER the
  bubble: no droplet is ever over a letter.
- *Words revealed through the bubble's clip edge (two findings).* The bubble is grown before its content (row-1 width
  from its first frame, two rows f157, the row-2 width by f180, three rows f184); every word pops whole inside it (first
  seen two frames before its land frame); the typing dots go one frame before each word shows (row 1 f142–146, row 2
  f161–181) and the wordmark's dots spawn on row 3 from f189. The width spring was softened so the rim stays in x 64–1016.
- *«فهرس تلقائي» erasing the dots of «التنفيذي» (minor) and its time (minor).* The optional callout is dropped (the script
  makes it conditional on free time, and that time is D1's hold).
- *caption.md «بالإنستقرام / بالتيك توك» (minor).* Now «على الإنستقرام … وعلى التيك توك …»; no «بال…» left in the folder
  except the rule that forbids it.

**Lines held ≥ 1 s (minor).** «يشدّ من أول سلايد.» to f345 (dimmed to 70 % from f330); «نرتّبه.» to f384 (the same rule,
not in the finding: it was 0.63 s); «ننسّقه عدل.» to f437 under the poster and the video card; «حتى الهوامش… / نضبّطها.» to the
cut (f588). Each answer is cut on the frame before the next one punches in (2 frames), so two answers never overlap. The three answers share one spot, 32 px lower than before (y 1404), so no chip touches their ink (rule E found
«تقرير؟» 12 px into «نرتّبه.»); the «بحث؟» chip is kept ≥ 40 px above «ننسّقه» (audience).

**Motion.**
- *Seconds 3–6 the stillest (audience major) / the turn freezes (picture major).* One continuous push on the app layer only,
  f87 → the hit, 1.00 → 1.08 with 1.5° of roll about (540, 720), accelerating into the riser; the big line, TASH's message
  and the dimmer stay in screen space. Deviation: 1.08, not 1.10, and the roll counter-clockwise: at 1.10 the clock and the
  file name left the safe area (swept). A slow drift (down 30 px, left 18 px, home by the hit) starts at full speed on
  f87, «باجر؟» throbs on the heartbeat under the clock ticks (every half beat after it lands), the bubble springs up from
  220 px below on f141, and the typing dots stay alive on row 2 through f161–181. Measured with the lens's own metric (mean
  frame difference, 108×192 grey): f88–214 0.95 → 1.22, the turn f140–214 1.29 → 1.59, f92–112 0.16 → 0.37, f150–179
  0.24 → 0.78, f161–182 0.10 → 0.68; the longest run of near-still frames (< 0.35) is now 7 frames (it was 18, f119–136).
  Not reached: the 1.5 target over the whole f88–214; that needs a camera fast enough to push the app's props out of the
  safe area, and the props must stay in it.
- *Filing teleports + the school deck popping in (picture major).* The report's pages close on the frame clock (12 frames)
  instead of on the filing curve (that was the 126° → 30° jump on f367 → f368: frame difference 27.0 → 7.4); every filing
  runs 18–20 frames, eased in and out (inOutSine), with a 4 px motion blur at its fastest. Deviation: 6–8 frames, as
  suggested, would move a card 500+ px in 70–130 px steps; 18 frames with blur keep the largest step under ≈ 85 px. The
  spikes left at f451 → 452 and f480 → 481 are the NEXT card landing (the CV thrown in, the dashboard dropped, both with
  motion blur, on the beat), not the filed card. The school deck grows out from behind card 1 over 9 frames from the beat
  (f287; f295 → 296 frame difference 19.2 → 0.6); a camera key at f296 keeps the push moving through f284–296 (2–4 px per
  frame).
- *Rule-line beat locked off (picture major).* The second option, extended: it opens on a 1.30× macro of the plain BEFORE
  slide (it overfills the width) easing back from the cut, pulls back faster on the swipe (f618; the slide is 885 px =
  82 % of the width on f640), turns a little past the rect (0.94 on f664) and pushes back in to exactly s6's screen rect on
  f686, still moving into the match cut (Hermite keys, `s5_details.js`). Mean frame difference f589–686 0.66 → 1.29. The
  last 22 frames still measure under 0.35 although the card grows 794 → 844 px: a dark slide on the dark stage moves few
  grey levels. Not taken: "0.70 → 1.00" (that makes the slide smaller, against the same finding's 80 % rule).
- *The margin snap does not read (minor).* The rows are visibly wrong until f552 (ragged ±40–80 px both ways, row 3 tilted
  3°, the numbers out of their column) and all land on the guide on f553 with a ≈ 15 % overshoot, settled by f555.
- *Emotional peak with no event (audience minor).* A one-frame 1.00 → 1.06 punch-in on f719, the slow push continuing from
  there (its end trimmed 1.105 → 1.08 so the screen never reaches «ويوم التسليم…»), and both phones flare +40 % with a
  6-frame decay.

**The climax and the lock-up.**
- *Lock-up in the top third (picture major).* The whole message group sits ≈ 170 px lower for the turn and the hit (centred
  ≈ y 935 on f219–236); while card 1 flies in (f238–257) it steps back up and to 0.90 (f236–252), so card 1 lands ≥ 48 px
  under it (measured: 70 px at f257); card 1's hand-off is 30 px lower (`s4_parade.js HANDOFF.cy` 1330). Deviation: the
  reviewer's numbers were measured on a 0.6× still (the bubble was at y 333–1001, not 200–620); a group 200 px lower for
  the whole scene would sit on card 1.
- *Three lock-up treatments (picture minor), «للطلاب» a small sticker (audience minor), two identical lime pills on the end
  card (audience minor).* One lock-up everywhere (s3, s7, poster): an ink pill with a 3 px lime outline and lime type,
  24 px under the wordmark's ink, −3°; 78 px type in the splash (≈ 390 px wide, ≈ 1.3× the old one), 70 px on the end
  card, 96 px on the poster. Card 1 flies on f238–257 (was f232), so «للطلاب» reads alone for ≈ 0.3 s. The CTA is now the
  only solid lime shape on the end card.
- *Reminder fly-off collision (minor).* It flies out to the right on its own row (f137–141), gone on f141; the bubble is
  first seen on f142.

**Payoff and end card.**
- *Closing line under-weighted (picture major).* «خلّ شغلك / يسولف عنك.» in two right-aligned rows at x 920, 116 px, ≤ 700 px
  each, on a 35 % ink band (y 1250–1560), each word punching in with a small overshoot from f719. To make room (and keep
  the two phones clear) «ويوم التسليم…» moved above the screen (68 px, centred at x 500, clear of the samples label).
- *Unlabelled samples behind the end card (major).* Option (b): the drifting fan is blurred 12 px at 7 %; no sample text is
  readable (checked on f782 and f850). caption.md's cover note says so.
- *End-card spacing (minor).* One rhythm on the ink: 24 px under the wordmark, 24 under «للطلاب», 40 above the CTA, 56 above
  the handles, 64 above «بس مو آخر ليلة.»; the stack is centred ≈ y 900 (≈ 420–1412). Deviation: the CTA now sits below
  y 900, so to keep it inside x 920 (the right button column) at every frame it is 47 px (was 57) and its hit pulse is a
  lime glow ring instead of a scale.
- *Full-fan hold (minor).* Re-ordered: the deck «مسار» is the near left wing (its title readable), the video card's frame
  peeks out at the top, the dashboard stays the hero.
- *The 2 a.m. moment (audience minor).* «٢:٤٧ ص» (the existing ui string) is a 56 px paper timestamp at the top left from
  f0, burns out with the white, and settles onto the app's status-bar clock (f78–90): one object.
- *Research card lime clump (audience minor).* The tags are annotations (ink pills, lime outline, lime type); the card's
  chip «بحث؟» is the only solid lime pill on it, ≥ 40 px above «ننسّقه».

**Sound** (`audio.py`, measured on the new stems with `scratchpad/…/r2/snd_check.py`).
- *Card 2's page turns (major).* New cues `card2_turn1` f342 and `card2_turn2` f357 (`build_cues.py`) drive both the
  picture's two turns and one paper flip each (SFX bus −38 → −28 dB on f342–344 and f357–359; it was silent at f354–359);
  `deck_school` f287 drives the school deck's growth and a fan flick + three flicks (it was −69 to −95 dB).
- *The bar-52 fill under «ليلة.» (minor).* Kicks on 16ths 219/220 and the clap on 220 are skipped; music 300–3400 Hz at
  28.16–28.20 s −17.6 → −21.3 dB; SNR on «لي» 300–3400 Hz 4.8 → 8.5 dB, 1–4 kHz 7.4 → 10.0 dB.
- *«طشّ» under the splash (minor).* The splash's 0.4–3 kHz band is cut 6 dB over its first 0.13 s (back by 0.20 s); SNR on
  the spoken «طَ» (40 ms windows, 1–4 kHz) −1.2 / +3.2 / −0.6 → +1.6 / +7.0 / +3.1 dB.
- *The third hook hit (minor).* «بحث؟» and its hit on f62 (was f59): ≈ 20 ms before the word, like hit 2. Not done: "move the
  q3 camera lunge" — there is none (the camera's move on «بحث؟» is the dive, which starts on f64 as before).
- *Ding and buzz under «والتسليم…» (minor).* Buzz pulses end 2.99 s; the ding's tone decay 0.35 → 0.18 s, body 1.2 → 0.5 s;
  1–4 kHz SNR in the voiced windows from 3.10 s: +7.8 / +11.2 / +18.9 / +16.3 dB (was +1.9 / +2.5 / +8.4 / +2.7). The two
  windows still under 0 dB (3.06, 3.14) are gaps inside the word (the voice is at −38 to −40 dB there), not masking.

**Checks run after fix round 2.** `src/tools/sweep.mjs` on all 891 frames (rules A–E: safe area, platform map, strings,
and the new glyph-ink overlap): 0 issues. Both MP4s measured with `audio-check.sh` (−13.9 / −14.0 LUFS, true peak −1.3 /
−1.6 dBTP), 1080×1920, 30 fps, 891 frames, H.264 High + AAC-LC 48 kHz. Every changed moment pulled from the rendered
picture and inspected (most at 1:1, the Arabic moments zoomed): f0–2, f56–92 (the hook's «بحث؟» and the clock through the
white), f100–142 (the push, the throb, the reminder's exit), f140–262 every frame of the turn, the hit, the lock-up, the
step back and the hand-off, f284–300, f336–372, f384–396, f410–440, f446–456, f476–520 (the «وأي» dots against the chips,
zoomed), f520–592 (the caption against the guides, zoomed), f614–644, f680–692, f714–750, f772–790, f816–826 and f880–890
(the underline under the dots, zoomed), f858–872.

## Known issues (honest)

1. **Nobody has listened to the VO, the music or the sound effects** (Claude cannot hear). The owner judges the
   dialect and the words «باچر», «الياية», «بريزنتيشن», «طشّ», «سي في», «ننسّقه» before posting. The cuts inside the
   read, the 1.08× tempo-up and the moved breath are unheard too.
2. The owner picked take 1 (26 Nov); he has not heard the edited VO (the cuts and the 1.08× tempo-up).
3. **Still to confirm with the owner:** the design-not-writing rule («المعلومة منك… والترتيب والتصميم علينا»), «دزّ
   لنا بالخاص» against his «راسلنا بالخاص», and the short on-screen tagline «شغل يبيّض الوجه.».
4. The splash lands on the spoken «طشّ» by design, so that phrase has the least air over the bed: the phrase is ≥ 10 dB at
   1–4 kHz, and the 80 ms of «طَ» under the hit, after the fix-round-2 carve, measure +1.6 / +7.0 / +3.1 dB (40 ms windows).
   In the voice mix the music and the sonic logo come up 3.5 dB after the last word.
5. The sonic logo is rebuilt from the TASH sound ingredients and timed to this film; it is not the 4.2 s
   `tash-sonic-logo.wav` file.
6. Small print is texture, not copy: the app props in s2 (30–34 px), the file chips (28 px), the research body text,
   the dashboard's small numbers, the video timecode. Nothing has been checked on a real phone.
7. The end card's logo no longer types its dots in a bubble above the wordmark (the TASH sting): the dots pop in place
   in the ش with the body and type there, so the logo never reads «طس» (the same rule as the splash).
8. The hall is mirrored (an AI still with no text in it); the slide on its screen is not.
9. In the margins shot the samples label sits over the contents page's running header (the label keeps its pill).
10. The s3 → s4 cut is a hard colour cut (lime field → dark stage) on the card-1 hit; card 1 keeps its exact place
    across it, so it reads as one card.
11. Rendering with `--workers 3` once failed with "Unable to capture screenshot" under load; a re-run passes. The mixes
    (`src/audio/*.wav`) are git-ignored: run `src/audio.py` before `build.sh` on a fresh checkout.
12. (fix round 2) The CTA is 47 px (it was 57): with the end-card stack centred on y ≈ 900 it sits below y 900, and it must
    stay inside x 920 (the right-hand button column) on every frame. It is the only solid lime shape on the card.
13. (fix round 2) Before the snap, the page rows are deliberately out of line and one guide crosses two of them (the sample
    page, not the caption); the caption itself never meets a guide or a handle (checked on every frame).
14. Status: **not delivered, not approved, not published.** Claude never posts.
