# «نقاط مشروعك» / The Dots on Your Project: TASH's paid boost ad (Instagram + TikTok)

> **Status (9 Nov 2026): built and self-checked by Claude, after two independent review rounds; QC numbers are in §9.**
> - **The voices are AI (ElevenLabs), so the AI label is ON** (§7).
> - Not yet approved by the owner and not reviewed by the CD.
> - **Not published.** Claude never logs in, never posts and never boosts.
>
> - The locked creative plan is `TREATMENT.md` (rev. 2, with a red-team ledger); the research is `STRATEGY.md`.
> - This file is the record of what was **actually built**: the cues, every deviation from the treatment, the copy, the boost setup,
>   the gates before any spend, provenance and how to rebuild.

---

## 1. The idea

**عربي.** الشين في «مشروعك» فوقها ثلاث نقاط: نقاط طشّ، ونفس نقاط «يكتب الحين…».
- المشروع اللي محد يسولف عنه تطيح نقاطه، والكلمة تصير «مسروعك»: نفس الشكل، بس ما تنقرى.
- طشّ يرجّع النقاط: تصير ثلاث لمبات تحدّد الكلمة بالنور. أول ما تقعد على الشين يشتغل النور كله، والكلمة تنقرى من جديد، والسالفة تبدأ: «شنو حسابهم؟!».
- والسالفة نفسها… هي «طشّ».

**English.** The ش in «مشروعك» ("your project") carries three dots: TASH's dots, and also the "typing…" indicator.
- When nobody talks about a project, its dots fall off and the word stops reading: «مسروعك», the same shape saying nothing.
- TASH brings the dots back as three studio lamps that outline the word in light. When the dots land back on the ش, the
  full light comes on, the word reads again, and the talk starts: «شنو حسابهم؟!» ("what's their account?!", the question people ask in Kuwait when an ad works).
- The talk turns out to be **طشّ**.

The picture is 100% code: 2D canvas plus a Three.js studio. The music and effects are synthesised here.
**The three voice lines are AI-generated (ElevenLabs), at the owner's choice (9 Nov), so the AI label is ON** on both platforms (§7).

## 2. Files

| File | What | Use |
|---|---|---|
| `out/TASH-boost-A-20s-9x16-ig.mp4` | **Master.** Hook A, 20.0 s, 1080×1920 30 fps, IG CTA | IG organic Reel + boost; week-1 arm |
| `out/TASH-boost-A-20s-9x16-tt.mp4` | Same, TikTok CTA («دزّ لنا بالخاص» + @tash.creative) | TikTok organic + Spark (week 2, budget permitting) |
| `out/TASH-boost-B-20s-9x16-ig.mp4` | Hook B: «شاليه؟» (held 1 s) → «مشروعك» at f30 (identical to A from f33) | Week-1 arm (an ad only, not a grid post) |
| `out/TASH-boost-A-14s-9x16-ig.mp4` | 14.0 s cut (compressed studio, no talk line or tagline) | Week-1 arm (the length test) |
| `out/TASH-boost-A-20s-4x5-ig.mp4` | 1080×1350, re-laid out (A = 600, 578), 3D re-rendered | Feed placement (asset customisation) |
| `out/poster-ig.png` · `out/poster-ig-4x5.png` | Designed cover (`?poster=1`): the lit 3D «مشروعك» with the dots home (×1.35), «خلّ إعلانك علينا» and a small «طشّ», all inside the 3:4 grid crop | Reel / ad cover (§7) |
| `out/contact-*.png` | 2 fps contact sheet per file | QC |
| `src/` | The page (`index.html`, `main.js`), the 3D studio (`scene3d.js`), the shared camera (`rig.js`), `cues.json`, `audio.py`, `assets/word.json` | Rebuild (§11) |
| `tools/word_export.py` | HarfBuzz + skia-pathops: the dotless word bodies and the ش slot | Rebuild |

## 3. The film, beat by beat (master, 20.000 s = 600 f; A = (600, 490))

| t | Picture | Sound |
|---|---|---|
| 0.00–1.00 | «مشروعك» slams in (1.06→1.00) under lime dots that are already typing on its ش, with contact shadows; «حلو…» under it | onset thump · ticks D6/E♭6/F♯6 · **voice 1 (AI): «مشروعك حلو…» 0.00–0.96** (hook A only) |
| 1.00–1.50 | The talk breaks: the tick cracks, «حلو…» is knocked out, and the dots fall toward the camera one by one (Ø28→Ø160, as lime smears). The word dims to «مسروعك» | broken tick · three falls + heavy thumps |
| 1.50–2.40 | «محد يسولف عنه؟»; the dim word keeps sinking | room air + a low D pad (never digital silence) |
| 2.40–3.00 | The dots come back from below right, arc over the line, line up and drop | low dum · rising ticks · six rapid ticks · whoosh |
| 3.00–5.00 | **HERO 1:** «طشّ» slams around the same dots; «خلّ إعلانك علينا» | tash_hit + claps + 808; the groove starts (bar 1) |
| 5.00–6.00 | Hard cut into a lit paper studio. The 3D «مشروعك» is a dark silhouette against a light pool; the camera pulls back | the room opens (plate) · E♭ (the bII of Hijaz) |
| 6.00–7.00 | The dots lift and fly out to three lamp stations; each lamp lights up on arrival | three lamp clacks + filament hum |
| 7.00–8.40 | Edge-lit: lime-paper rims on the bevels; the camera orbits ≈10° to a low angle | hum bed · riser |
| 8.40–9.00 | The dots fly home, line up above the ش and drop; the camera lands frontal | three wooden tocks |
| 9.00–11.50 | **HERO 2:** lights on: the key floods and the word reads again, lit. «شنو حسابهم؟!» rises above it | lamp thunk + dum + claps; back to D · **voice 2 (AI): «شنو حسابهم؟!» at 9.38** |
| 11.50–12.62 | Punch-in ×1.10 rendered in 3D; 18 small typing triplets bloom on the floor, fold into single dots and stream into the ش | group claps on the triplets + an applause swell · riser |
| 12.62–15.40 | **HERO 3:** the studio falls away; «طشّ» snaps around the dots; the shadda drops; «خلّهم يسولفون عنك!» | the local sonic logo: ticks on the typing peaks, one tash_hit, the shadda pop · **voice 3 (AI): «طشّ!» with its «ط» on the snap** |
| 15.40–20.00 | Hand-back: «مشروعك» with the dots typing, «اطلب إعلانك بالخاص» (lime «بالخاص») + @tash.creative.kw; held 3.87 s; the wind-up lands in f0's slam | G minor → E♭ → D cadence; the last bar ends on the triplet |

**Loop:** the typing has a 1 s period and the film is 20 s, so the bounce phase at 20.0 equals the phase at 0.0.
The body winds up 1.00→1.06 over f594–f599, and f0 starts at 1.06.

## 4. What changed from TREATMENT.md (and why)

**This file supersedes TREATMENT.md on copy and the boost route:**
- §6 replaces TREATMENT §7's caption and TikTok text, §11's "the 14 s cut's lines move to its caption" note, and the price wording in §13 item 6.
  The price line is `07-ops/04-pricing.md` line 4, verbatim.
- §7 replaces TREATMENT §7's "Use existing post" route: all three arms are new ads with identical primary text.
- Consents and voice releases come in writing by Instagram DM (the DM-only rule), not by WhatsApp as TREATMENT §9 and §13 say.

1. **The 3D is rendered live in the same page** (WebGL/SwiftShader, deterministic) rather than pre-rendered to 238 PNGs.
   - The page and the studio share one camera model (`rig.js`), so the dots stay pixel-locked to the word.
   - The 5.00 and 9.00 cuts land on the exact hero pose (the front face maps 1:1 onto the flat word).
2. **Lamp stations.**
   - They sit just behind the word's front plane, so they rake the bevels: from 2.5–4 units back the rims never showed.
   - They are range-capped (5 units), so they don't wash the floor seam or the wall. The dotless word is still never front-lit.
   - The stations are ordered like the dots (right / top / left), so no two flights cross on screen.
   - Dot 1 therefore goes to the right station, not top-back.
3. **Motion blur uses smear frames:** each dot is stretched along its path over a 180° shutter; the crowd uses 90°.
   - No smear is drawn across a cut.
   - Accumulation made the fast dots dim and segmented.
4. **The studio.**
   - Darker and moodier than the treatment's QC numbers (pixels above sRGB 48: 13–31% over 5.0–8.4 s vs ≥30%). An evenly lit sweep looked like a flat grey slab.
   - After 9.0 the talk zone sits at sRGB ≈ 90–125 (target ≤40), but measured white-on-zone contrast is ≥ 6:1, so the 4.5:1 rule holds.
   - The cove is pushed back (it starts 15 units behind the word, radius 6).
   - The floor behind the word is darkened by a decal and falls to the wall level.
   - The sweep is matte (Lambert, no specular).
   - The floor's albedo dips around the word's base, so the key's hot spot, which the long lens squeezes into 1–2 px, is a soft table edge (luma ≈ 80–95) rather than a glowing line.
   - The key's cone is tighter (0.34 rad).
   - A soft contact-shadow decal grounds the word.
5. **Extrusion:** depth 0.14 units (0.10 em), the plan's value. The bevel is 0.04 units (0.029 em) against 0.02 em, because the rims need a visible bevel to catch the lamps.
6. **The falls.**
   - The dots grow toward the camera early (Ø28→Ø160 on an ease-out), so they're big while still in Zone A/B.
   - They accelerate down out of the bottom edge on the same frames as before (f40 / f42 / f44).
7. **The hush (1.50–2.40)** never freezes:
   - the dim word sinks ≈28 px and shrinks 1.00→0.97 about its own centre;
   - there is no lime from f45 to f71: this is the "nobody's talking" beat, held while «محد يسولف عنه؟» is read;
   - the first dot re-enters at f72 (was f76). The arcs are solved per format to stay clear of the IG/TikTok right rail
     (x ≤ 965 over y 1100–1750) and of the question line's end (≥ 12 px clear).
8. **The crowd:**
   - births end at f360;
   - each triplet folds into one dot, which rises like a fountain past the word and drops onto one home dot;
   - the dots are hidden in the whole word band (dot-row bottom to floor line), so nothing shows between or over the letters;
   - each smear is capped at 2×Ø and fades over the last 45% of its flight.
9. **The fall-away (12.62)** shrinks in the camera, not by CSS, so the frame edge never shows; CSS only blurs, with 3% overscan.
10. **Sound.**
    - **Voices (owner's decision, 9 Nov):** AI voices, generated by the owner on their ElevenLabs account (`eleven_v3`) and sent in chat:
      - voice 1 «مشروعك حلو…» (Jassim Almathkour): trimmed to the speech and ×1.12 (pitch kept) so it ends at 0.96 s, before the crack. Hook A only.
      - voice 2 «شنو حسابهم؟!» (Noorah): at 9.38 with the talk line's words. 20 s files only; the 14 s cut has no talk line.
      - voice 3 «طشّ!» (Fahad): its «ط» lands on the logo snap (13.00 / 9.00 in the 14 s cut). The tash_hit steps back (−4 dB) under it.
      - The voices sit ≥ 5 dB above the un-ducked mix in 300–4000 Hz, and the music ducks −8 to −9 dB under them.
      - An earlier take of voice 1, generated by Claude on the same account, was replaced by the owner's take.
      - Claps are still synthesised.
    - **The talk line changed** (owner, 9 Nov) from «من وين طلبتيه؟!» to «شنو حسابهم؟!».
      - The old line could read as being about TASH itself, and it addressed a woman.
      - The new one is what people ask in Kuwait when an ad works: they want the seller's account.
    - Hook A fills its voice slot with dotted-8th echoes of the typing triplet and a tock under «حلو…» (0.50 s). Hook B keeps its word-swap tocks (0.50 / 1.00 s) and has no echoes.
    - The two are closer in density, but A still has no voice.
    - Hook A now has its voice, so the A/B tests hook A (voice + «حلو…») against hook B (the word roll-call, no voice), as the treatment planned.
11. **Mastering is loop-aware and done in `audio.py`.**
    - The 2 s tail is folded onto the head.
    - Compression and limiting are primed on a 3× tile, so frame 0 has its full transient and the seam is continuous.
    - The limiter is look-ahead with no delay, detects true peaks on 4× oversampling, and its gain starts at 1. (`_system`'s limiter faded in the first ≈150 ms and added 4 ms per pass.)
    - Loudness is set with ffmpeg's own meter to −14.0 LUFS, true peak ≤ −2.0 dBTP.
    - The MP4 is a plain AAC 320k mux, with no loudnorm pass.
12. **The mix moved toward phone speakers.**
    - 808 −6 dB, plus a saturated 250–1500 Hz copy so the note reads on phones.
    - The thumps are short, with a felt knock and click; the hush pad is an octave up and starts at the crack; the room air sits at 0.9–4 kHz.
    - Measured on the final WAVs: <150 Hz is 59–60% of the energy (was 80%), and 500 Hz–6 kHz is 16–17% (was 7%).
    - Momentary loudness (400 ms), full band: HERO 1 / 2 / 3 at −10.4 / −9.1 / −10.5 LUFS, against the exit thumps at −13.2 and the hush at −14.1.
    - On a 250 Hz high-passed "phone" version: heroes −12.3 / −13.4 / −12.5, thumps −13.9.
    - Some groove bars in the studio and the crowd's applause swell peak as high as the heroes; they are part of the build to them.
    - The f0 slam has a mid-band body.
    - LRA is 8.1 LU (the CTA dip is now −5 dB, was −8).
    - Nothing new starts after the end, so only tails fold into the head.
13. **The CTA lines** resolve word by word (f468 / f472 / f476) in every branch.
14. **Hook B is one category word** (owner, 9 Nov): «شاليه؟», chalet rentals, a business popular with young Kuwaiti men and women.
    - It is held 1.00 s (read, not just recognised), then «مشروعك» lands at f30 with a heavy tock and the talk breaks.
    - It replaces the treatment's «مشاوي؟» → «رموش؟» roll-call. The owner rejected «رموش؟».
    - The word must carry a ش (the dots' slot) and no other dots above the line.
      «شاي كرك؟» and «شوكولا؟» were too wide for the frame.
14. **The 14 s cut** holds «طشّ» to 9.77 s (was 9.40); the CTA is built by 10.50 and held 3.50 s.
    - The calm typing ticks start at 11.00, after the dots settle.
    - It has no tagline or talk line on screen. Its primary text is the same as the other arms (§6), so the A-20 vs A-14 test also compares a
      shorter story, not only a shorter film. Read it that way.
15. **The cover is designed** (§2), not the bare 9.30 frame. In the 3:4 grid tile it says who and what.
16. **Not built (P3 in the treatment):** the proof arm and the 6 s bumper.

## 5. Copy (every on-screen line)

| Line | When | Proofread |
|---|---|---|
| «مشروعك» (dotless body + TASH's dots on the ش) | 0.00–3.00, 15.40–20.00 (3D 5.00–12.62) | — |
| «حلو…» | 0.00–1.07 (hook A only) | «…» on the left ✓ |
| «محد يسولف عنه؟» | 1.50–3.00 | «؟» on the left ✓ |
| «طشّ» (wordmark) | 3.00–5.00, 13.00–15.57 | shadda ✓ |
| «خلّ إعلانك علينا» | 3.10–5.00 | shadda on خلّ, hamza on إ ✓ |
| «شنو حسابهم؟!» | 9.40–11.47 | «؟!» on the left ✓ (616 px at 84 px, x 182–798) |
| «خلّهم يسولفون عنك!» | 13.43–15.47 | shadda ✓ |
| IG «اطلب إعلانك بالخاص» + `@tash.creative.kw` | 15.60–20.00 | ✓ |
| TT «دزّ لنا بالخاص» + `@tash.creative` | 15.60–20.00 | shadda on دزّ ✓ |
| Hook B «شاليه؟» | 0.00–1.00 | ✓ the owner's pick (9 Nov), replacing «مشاوي؟» → «رموش؟»; ink x 169–662 |

**The talk line is dramatised.** «شنو حسابهم؟!» is a question about the viewer's hypothetical project. It has no name,
avatar, quote marks or timestamp. Never quote it as a real reaction in ad text or DMs. «خلّهم يسولفون عنك!» states an aim,
not a result.

## 6. Captions and ad text (the price line is the owner-approved wording, verbatim from `07-ops/04-pricing.md`)

**Instagram (the organic Reel, and the primary text of every ad arm):**
```text
مشروعك حلو… بس محد يسولف عنه؟ خلّ إعلانك علينا
ريل أو ستوري عمودي حتى ١٥ ثانية: يبدأ من ٤٠ د.ك، فكرة ومونتاج وصوت مناسب وجولتان، والسعر النهائي بعد مراجعة المطلوب.
شوف نماذج من شغلنا بالهايلايت «شغلنا»
اطلب إعلانك بالخاص •••
الأصوات بالإعلان مولّدة بالذكاء الاصطناعي.

إنستقرام: @tash.creative.kw
تيك توك: tash.creative

#TASHcreative #اعلانات_الكويت #مشاريع_كويتية #kuwait #adproduction #ريلز #موشن_جرافيك #q8
```
- **Line 3 only if the «شغلنا» highlight is live before launch** (§8.4). If it isn't, launch without line 3: line 4 already asks for
  the DM.
  - Decide this once before launch.
  - **Never edit the primary text while the A/B runs.** Editing resets learning and splits the arms.
- **The other platform's handle is written without the @** («تيك توك: tash.creative» on Instagram, «إنستقرام: tash.creative.kw» on
  TikTok).
  - On Instagram an @ auto-links, and IG's @tash.creative is not TASH's account. On TikTok, @tash.creative.kw may be someone else.
  - Keep the @ only if the owner confirms owning both names on both platforms.
- **Optional line, not yet approved:** «إعلان مثل هذا الفيديو سعره حسب المطلوب، نعطيك السعر بالخاص.» It avoids «عرض».
  Use it only with the owner's written OK.
- No café or brand name and no tagged handle other than ours.
- **The ad arms (A-20, B-20, A-14) all use the same primary text:** lines 1–4 + the two handle lines, no hashtags. Never put
  «شنو حسابهم؟!» in any ad text or DM as a real reaction: it is a dramatised line.

**TikTok** (organic post = the Spark Ad; 48 characters before the handles):
```text
مشروعك حلو… بس محد يسولف عنه؟ دزّ لنا بالخاص •••

إنستقرام: tash.creative.kw
تيك توك: @tash.creative

#TASHcreative #اعلانات_الكويت #مشاريع_كويتية #kuwait #موشن_جرافيك
```

**DM welcome** (saved reply): «هلا والله! شنو اسم مشروعكم؟ •••»
- Quick replies: «أبي إعلان حق مشروعي» · «شنو تحتاجون مني؟» · «كم الأسعار؟» · «أبي أشوف شغلكم».
- «أبي أشوف شغلكم», **before the highlight is live:** send 2–3 concept films directly in the DM. Each keeps its burned-in tag, with
  this text: «هذي نماذج من شغلنا: إعلانات تجريبية لعلامات خيالية، وبعضها فيه لقطات مسوّاة بالذكاء الاصطناعي. تبون نسوي لمشروعكم شي مثلها؟ •••».

## 7. Boost setup (the owner does this in Ads Manager; Claude never logs in)

- **Week-1 A/B (Meta A/B test tool):** A-20 vs B-20 vs A-14, equal budgets, 7 days, KWD 5–15/day.
  - **Build all three arms the same way:** as *new ads*, each with the §6 primary text verbatim, the "Send message" button
    and its own cover (§2).
  - Don't use "Use existing post" for one arm only: its organic likes and comments would skew the test.
  - The organic Reel (A-20 with the IG caption) is posted separately for the grid.
  - Read the hook (A vs B) on hook rate × hold, and the length (A-20 vs A-14) on cost per *qualified* conversation.
  - Below KWD 5/day: run A-20 alone as one ad.
- **Objective:** Engagement → Messaging apps → **Instagram only** → maximise conversations.
  - Add the 4:5 file through "asset customisation" for Feed.
  - In every ad's Advantage+ creative panel, switch **OFF**: text improvements, translate text, image/video expansion, add overlays, visual touch-ups, enhance CTA, music, relevant comments, 3D animation and site links.
  - Don't use the in-app Boost button: it hides these toggles.
- **Covers:**
  - IG Reel: Edit cover → add from camera roll → `poster-ig.png`.
  - Ads Manager: set a custom thumbnail on every arm (`poster-ig.png`; for 4:5, `poster-ig-4x5.png`).
  - TikTok: upload the cover image, or select the 9.3 s frame.
  - **Never** pick a frame from 1.1–3.0 s or 5.5–9.0 s: the dotless «مسروعك» on a still reads as a typo.
- **TikTok** (from week 2, budget ≥ ~KWD 12/day): Spark Ad of the organic post with `-tt.mp4`.
  - Inbox open to Everyone.
  - At upload: Content disclosure **ON** → "Your brand"; Branded content **OFF**; AI-generated content **ON** (the voices are AI).
  - Original sound, no in-app music.
- **AI label: ON on both platforms** (§1 and §10: the voices are AI-generated).
  - Instagram: switch on "Add AI label" when posting the Reel, and keep it on the ads.
  - TikTok: at upload, More options → "AI-generated content" **ON**. Content disclosure stays ON ("Your brand").
  - The caption carries the plain line «الأصوات بالإعلان مولّدة بالذكاء الاصطناعي.». The other two arms' primary text gets the same line.

## 8. Before the first fils of spend (gates)

1. **Muted 10-phone test** (replaces the treatment's animatic test, run on this film).
   - Ten Kuwaiti non-designers, muted, phone at arm's length, A then B, once each.
   - Ask: «شنو صار للكلمة؟», «منو هذول وشنو يسوون؟» and "did it freeze?".
   - Ship if ≥6/10 say the dots fell or left or the word broke, and ≤2/10 report a freeze.
2. **Recording session (optional, ≈30 min, phone ≈50 cm away in a quiet room).** It makes hook A stronger.
   - Optional now that the voices are AI. **Real recordings would replace the AI voices and let the AI label go OFF.**
   - Voice 1, a man, warm: «مشروعك حلو…» (3 takes).
   - Voice 2: «شنو حسابهم؟!» (3 takes).
   - Claps: 3–4 friends clapping together once, 6–8 separate takes (`clap_1.wav`, `clap_2.wav` …). `audio.py` uses them round-robin
     for every group clap in place of the synthesised ones.
   - Release from each person, sent in writing: «أوافق إن طشّ تستخدم التسجيل الصوتي اللي سجّلته لها في إعلاناتها على الإنستقرام وتيك توك، بدون مقابل.»
   - Then drop `voice1.wav` / `voice2.wav` / `clap_*.wav` into `src/assets/rec/` and rebuild the audio (§11).
   - The stems are high-passed at 90 Hz, lightly de-essed and loudness-matched; ticks and music duck −6 dB under each voice.
   - It's an audio-only re-mux.
3. **Owner confirms in writing:**
   - the captions in §6;
   - the launch gate in TREATMENT §13 item 12 (licence and bio disclosures).
4. **The destinations are ready** (the paid ad sends people there). This is a **soft** gate: without the highlight, launch
   without caption line 3 (§6) and answer «أبي أشوف شغلكم» in the DM. With it:
   - The «شغلنا» highlight is live.
   - The cover reads «نماذج من شغلنا».
   - Every story carries its burned-in tag from TREATMENT §13. STAKK and HABBA use AI footage: «إعلان تجريبي · علامة خيالية · لقطات بالذكاء الاصطناعي».
5. **The `/price` saved reply** (`07-ops/01-welcome-and-quick-replies.md`) is rewritten for use inside a DM before spend:
   - drop «دزّوا لنا بالخاص»;
   - end with «تبون نبدأ؟ قولوا لنا شنو مشروعكم •••»;
   - add the AI-use sentence in the plural, like the rest of the DM: «نبني الإعلان بالكود والموشن والثري دي، وبعض الإعلانات نستخدم فيها
     لقطات بالذكاء الاصطناعي: نقول لكم قبل، وإذا استخدمناها لازم تحطّون علامة الذكاء الاصطناعي على الإنستقرام وتيك توك.»
   Also take the 30% rush fee out of `/time` until the owner confirms it. These are 07-ops files, flagged here, not edited by this build.
6. **Preview the safe zones:** Meta's Reels overlay and TikTok's RTL template, on one phone set to Arabic and one to English.
7. **Photosensitivity:** run the A, B and 14 s files through the free Trace Center PEAT tool. Not run by Claude.
8. **A Kuwaiti ear** on the groove and the tick. Claude has checked the sound by measurement only (loudness, true peak,
   band energy), **not by listening**.

## 9. QC record (measured by Claude on the final files, 9 Nov)

| File | Format | Loudness / true peak / LRA | Size |
|---|---|---|---|
| `TASH-boost-A-20s-9x16-ig.mp4` | 1080×1920, 30 fps, H.264 yuv420p (crf 18, max 10 Mbps, tune grain), AAC 320k 48 kHz, 20.000 s | −14.2 LUFS / −1.7 dBTP / 8.4 LU | 19.4 MB |
| `TASH-boost-A-20s-9x16-tt.mp4` | same | −14.2 / −1.7 / 8.4 | 19.5 MB |
| `TASH-boost-B-20s-9x16-ig.mp4` | same | −14.2 / −1.9 / 8.4 | 19.4 MB |
| `TASH-boost-A-14s-9x16-ig.mp4` | same, 14.000 s | −14.0 / −2.1 / 8.0 | 14.1 MB |
| `TASH-boost-A-20s-4x5-ig.mp4` | 1080×1350, otherwise the same | −14.2 / −1.7 / 8.4 | 14.1 MB |

- **Picture:**
  - no freeze ≥ 0.3 s (freezedetect n = 0.003) and no black ≥ 0.2 s in any file;
  - 2 fps contact sheets in `out/contact-*.png`;
  - cut strips checked at the seam, 5.00, 9.00 and 13.00.
- **Audio in the MP4 = the mastered WAV:** correlation 0.9993–0.9997, 0 samples of lag. Frame 0 has its full transient; the loop seam is continuous.
- **Mix (from the WAVs):**
  - <150 Hz is 53–56% of the energy, 500 Hz–6 kHz 16–20%.
  - Momentary (400 ms) peaks:
    - hook (with voice) −11.0;
    - HERO 1 / 2 / 3: −10.9 / −9.6 / −10.5 LUFS;
    - exit thumps −13.8;
    - hush −14.6;
    - CTA −16.8.
  - The voices sit ≥ 4–6 dB above the un-ducked mix in 300–4000 Hz.
- **Studio** (stills 5.0 / 6.2 / 7.6 / 9.3 / 11.0 / 12.3):
  - at 9.3 the faces are ك 198 / ش 227 / م 225 (ك is 87% of ش, against the ≥70% target);
  - the floor edge at the word's base peaks at luma ≈ 76–96 (was 166–191);
  - the talk zone holds ≥ 6:1 contrast.
- **Not checked by Claude:** PEAT photosensitivity, listening by ear, and the platforms' own safe-zone previews (§8).

## 10. Provenance

- **Picture.**
  - 2D: canvas code.
  - 3D: Three.js r180, vendored and MIT.
  - Fonts: Alexandria, IBM Plex Sans Arabic and JetBrains Mono (SIL OFL).
  - The «مشروعك» outline: Alexandria glyphs, unioned by `tools/word_export.py`.
  - The «طشّ» wordmark comes from `_system/brand/`.
- **Sound.** Synthesised by `src/audio.py` on `_system/audio/tashaudio.py`.
- **Voices (AI, ElevenLabs `eleven_v3`, generated by the owner, 9 Nov):**
  - Voice 1: Jassim Almathkour, «مشروعك حلو…».
  - Voice 2: Noorah, «شنو حسابهم؟!».
  - Voice 3: Fahad – Saudi Warm & Confident, «طشّ!».
  - The owner's original MP3s are kept as `src/assets/rec/src_voice*.mp3`.
  - Edited here: trimmed to the speech, voice 1 sped up ×1.12 (pitch kept), HPF 90 Hz, light de-ess, loudness-matched.
  - Files: `src/assets/rec/voice1.wav`, `voice2.wav`, `voice3_tash.wav`.
- **Nothing else is used:** no AI images or footage, no other AI voice or music; no samples, loops, stock or library music. No café,
  brand or person appears.
- **Paid/credit tools:** ElevenLabs only (the owner's account). Claude spent 43 credits on a first voice-1 take, which was then replaced; the owner generated the three lines used. No Higgsfield.

## 11. Rebuild

```bash
cd tash/11-boost-ad
pip install skia-pathops                     # once
python3 tools/word_export.py                  # → src/assets/word.json
python3 src/audio.py --len 20 --hook A        # → src/audio/audio-20A.wav, mastered (also --hook B, --len 14)
cd .. && node _system/tools/render.mjs --page "11-boost-ad/src/index.html" --out pic.mp4 --workers 3      # picture only
ffmpeg -i pic.mp4 -i 11-boost-ad/src/audio/audio-20A.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -ar 48000 -shortest -movflags +faststart 11-boost-ad/out/TASH-boost-A-20s-9x16-ig.mp4
#   no loudnorm at mux: the WAV is already −14.0 LUFS / ≤ −2.0 dBTP by ffmpeg's meter
#   cover: index.html?poster=1 (and &fmt=45) → render.mjs --stills 9.3
#   variants: ?plat=tt · ?hook=B (audio-20B) · ?len=14 (audio-14A) · ?fmt=45 · preview a frame: index.html?t=9.3 · fast 2D-only: ?no3d
```
The WAVs in `src/audio/` are build products and are not committed.
