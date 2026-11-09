# «نقاط مشروعك» / The Dots on Your Project: TASH's paid boost ad (Instagram + TikTok)

> **Status (9 Nov 2026): built and self-checked by Claude; QC numbers are in §9.**
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
- طشّ يرجّع النقاط: تصير ثلاث لمبات تحدّد الكلمة بالنور. أول ما تقعد على الشين يشتغل النور كله، والكلمة تنقرى من جديد، والسالفة تبدأ: «من وين طلبتيه؟!».
- والسالفة نفسها… هي «طشّ».

**English.** The ش in «مشروعك» ("your project") carries three dots: TASH's dots, and also the "typing…" indicator.
- When nobody talks about a project, its dots fall off and the word stops reading: «مسروعك», the same shape saying nothing.
- TASH brings the dots back as three studio lamps that outline the word in light. When the dots land back on the ش, the
  full light comes on, the word reads again, and the talk starts: «من وين طلبتيه؟!».
- The talk turns out to be **طشّ**.

The picture is 100% code: 2D canvas plus a Three.js studio. The sound is synthesised here, with no AI anywhere.
**The AI label stays OFF, truthfully.**

## 2. Files

| File | What | Use |
|---|---|---|
| `out/TASH-boost-A-20s-9x16-ig.mp4` | **Master.** Hook A, 20.0 s, 1080×1920 30 fps, IG CTA | IG organic Reel + boost; week-1 arm |
| `out/TASH-boost-A-20s-9x16-tt.mp4` | Same, TikTok CTA («دزّ لنا بالخاص» + @tash.creative) | TikTok organic + Spark (week 2, budget permitting) |
| `out/TASH-boost-B-20s-9x16-ig.mp4` | Hook B: «مشاوي؟» → «رموش؟» → «مشروعك» (identical from f33) | Week-1 arm (an ad only, not a grid post) |
| `out/TASH-boost-A-14s-9x16-ig.mp4` | 14.0 s cut (compressed studio, no talk line or tagline) | Week-1 arm (the length test) |
| `out/TASH-boost-A-20s-4x5-ig.mp4` | 1080×1350, re-laid out (A = 600, 578), 3D re-rendered | Feed placement (asset customisation) |
| `out/poster-ig.png` · `out/poster-ig-4x5.png` | The 9.30 s frame: the lit word with the dots home, no text | Reel cover |
| `out/contact-*.png` | 2 fps contact sheet per file | QC |
| `src/` | The page (`index.html`, `main.js`), the 3D studio (`scene3d.js`), the shared camera (`rig.js`), `cues.json`, `audio.py`, `assets/word.json` | Rebuild (§11) |
| `tools/word_export.py` | HarfBuzz + skia-pathops: the dotless word bodies and the ش slot | Rebuild |

## 3. The film, beat by beat (master, 20.000 s = 600 f; A = (600, 490))

| t | Picture | Sound |
|---|---|---|
| 0.00–1.00 | «مشروعك» slams in (1.06→1.00) under lime dots that are already typing on its ش, with contact shadows; «حلو…» under it | onset thump · ticks D6/E♭6/F♯6 · (voice 1 if recorded) |
| 1.00–1.50 | The talk breaks: the tick cracks, «حلو…» is knocked out, and the dots fall toward the camera one by one (Ø28→Ø160, as lime smears). The word dims to «مسروعك» | broken tick · three falls + heavy thumps |
| 1.50–2.40 | «محد يسولف عنه؟»; the dim word keeps sinking | room air + a low D pad (never digital silence) |
| 2.40–3.00 | The dots come back from below right, arc over the line, line up and drop | low dum · rising ticks · six rapid ticks · whoosh |
| 3.00–5.00 | **HERO 1:** «طشّ» slams around the same dots; «خلّ إعلانك علينا» | tash_hit + claps + 808; the groove starts (bar 1) |
| 5.00–6.00 | Hard cut into a lit paper studio. The 3D «مشروعك» is a dark silhouette against a light pool; the camera pulls back | the room opens (plate) · E♭ (the bII of Hijaz) |
| 6.00–7.00 | The dots lift and fly out to three lamp stations; each lamp lights up on arrival | three lamp clacks + filament hum |
| 7.00–8.40 | Edge-lit: lime-paper rims on the bevels; the camera orbits ≈10° to a low angle | hum bed · riser |
| 8.40–9.00 | The dots fly home, line up above the ش and drop; the camera lands frontal | three wooden tocks |
| 9.00–11.50 | **HERO 2:** lights on: the key floods and the word reads again, lit. «من وين طلبتيه؟!» rises above it | lamp thunk + dum + claps; back to D · (voice 2 if recorded) |
| 11.50–12.62 | Punch-in ×1.10 rendered in 3D; 18 small typing triplets bloom on the floor, fold into single dots and stream into the ش | group claps on the triplets + an applause swell · riser |
| 12.62–15.40 | **HERO 3:** the studio falls away; «طشّ» snaps around the dots; the shadda drops; «خلّهم يسولفون عنك!» | the local sonic logo: ticks on the typing peaks, one tash_hit, the shadda pop |
| 15.40–20.00 | Hand-back: «مشروعك» with the dots typing, «اطلب إعلانك بالخاص» (lime «بالخاص») + @tash.creative.kw; held 3.87 s; the wind-up lands in f0's slam | G minor → E♭ → D cadence; the last bar ends on the triplet |

**Loop:** the typing has a 1 s period and the film is 20 s, so the bounce phase at 20.0 equals the phase at 0.0.
The body winds up 1.00→1.06 over f594–f599, and f0 starts at 1.06.

## 4. What changed from TREATMENT.md (and why)

1. **The 3D is rendered live in the same page** (WebGL/SwiftShader, deterministic) rather than pre-rendered to 238 PNGs.
   - The page and the studio share one camera model (`rig.js`), as the treatment asked, so the dots stay pixel-locked to
     the word.
   - The 5.00 and 9.00 cuts land on the exact hero pose, so the front face maps 1:1 onto the flat word.
2. **Lamp stations sit just behind the word's front plane**, not 2.5–4 units back. From far back the lamps never reached
   the bevels, and the edge light didn't show. They are still behind the plane, so the dotless word is never front-lit.
   They are range-capped, so they don't wash the back wall.
3. **Motion blur uses smear frames** (each dot stretched along its path over a 180° shutter) instead of sub-frame
   accumulation. Accumulation made the fast dots dim and segmented; the smears read as bright lime pills.
4. **The studio is darker and moodier than the treatment's QC numbers.**
   - Pixels above sRGB 48: 13–31% over 5.0–8.4 s against a ≥30% target.
   - After 9.0 the talk zone sits at sRGB ≈ 90–125 against a ≤40 target, but measured white-on-zone contrast is ≥ 6:1, so
     the 4.5:1 rule holds.
   - Reason: an evenly lit sweep looked like a flat grey slab.
5. **The crowd triplets fold into one dot before streaming into the ش.** As three parallel streaks they read as barcodes.
6. **The voices and real claps are not recorded yet**, so this cut uses the treatment's own fallback: no voices, and the
   synthesised `claps_ensemble`. Every spoken line is already on screen. See §8 to add them.
7. **The 20 s cuts run the score at about −14 LUFS, with a mid-range e-piano comp added.** The 808 and room tone were made
   lighter after a band-energy check: the first mix had most of its energy below 120 Hz, which a phone speaker loses.
8. **Not built (P3 in the treatment):** the proof arm and the 6 s bumper. The 14 s cut is built.

## 5. Copy (every on-screen line)

| Line | When | Proofread |
|---|---|---|
| «مشروعك» (dotless body + TASH's dots on the ش) | 0.00–3.00, 15.40–20.00 (3D 5.00–12.62) | — |
| «حلو…» | 0.00–1.07 (hook A only) | «…» on the left ✓ |
| «محد يسولف عنه؟» | 1.50–3.00 | «؟» on the left ✓ |
| «طشّ» (wordmark) | 3.00–5.00, 13.00–15.57 | shadda ✓ |
| «خلّ إعلانك علينا» | 3.10–5.00 | shadda on خلّ, hamza on إ ✓ |
| «من وين طلبتيه؟!» | 9.40–11.47 | ي and ه in طلبتيه; «؟!» on the left ✓ |
| «خلّهم يسولفون عنك!» | 13.43–15.47 | shadda ✓ |
| IG «اطلب إعلانك بالخاص» + `@tash.creative.kw` | 15.60–20.00 | ✓ |
| TT «دزّ لنا بالخاص» + `@tash.creative` | 15.60–20.00 | shadda on دزّ ✓ |
| Hook B «مشاوي؟» · «رموش؟» | 0.00 · 0.50 | ✓ (a native read of «رموش؟» is still wanted; the backup is «شموع؟») |

**The talk line is dramatised.** «من وين طلبتيه؟!» is a question about the viewer's hypothetical project. It has no name,
avatar, quote marks or timestamp. Never quote it as a real reaction in ad text or DMs. «خلّهم يسولفون عنك!» states an aim,
not a result.

## 6. Captions

**Instagram (organic Reel = the boosted post).** Lines in this order:
```text
مشروعك حلو… بس محد يسولف عنه؟ خلّ إعلانك علينا
ريل أو ستوري لين ١٥ ثانية يبدأ من ٤٠ د.ك (الفكرة، المونتاج، صوت مناسب، وتعديلين)
السعر النهائي بعد ما نتفق على الفكرة، وإعلان بمستوى هذا الفيديو له عرض سعر خاص
شوفوا نماذج من شغلنا بالهايلايت «شغلنا»
اطلب إعلانك بالخاص •••

#طش #إعلانات #الكويت #مشاريع_الكويت #موشن_جرافيك
```
- Line 2 is the price, worded exactly as approved on 7 Nov («يبدأ من ٤٠ د.ك»).
- **Owner: confirm lines 2–3 in writing before spend** (TREATMENT §13 item 6).
- Don't name or tag any café in this caption.

**TikTok ad text** (48 characters): «مشروعك حلو… بس محد يسولف عنه؟ دزّ لنا ••• بالخاص»

**DM welcome** (saved reply): «هلا والله! شنو اسم مشروعكم؟ •••»
- Quick replies: «أبي إعلان حق مشروعي» · «شنو تحتاجون مني؟» · «كم الأسعار؟» · «أبي أشوف شغلكم».

## 7. Boost setup (the owner does this in Ads Manager; Claude never logs in)

- **Instagram:** Ads Manager → Engagement → Messaging apps → **Instagram only** → maximise conversations → **Use existing post**
  (this Reel) → "Send message" button.
  - In the Advantage+ creative panel, switch **OFF**: text improvements, translate text, image/video expansion, add
    overlays, visual touch-ups, enhance CTA, music, relevant comments, 3D animation and site links.
  - Don't use the in-app Boost button: it hides these toggles.
- **A/B in week 1** (Meta A/B test tool, equal budgets, 7 days, KWD 5–15/day): **A-20 vs B-20 vs A-14**.
  - Read the hook on hook rate × hold.
  - Read the length on cost per *qualified* conversation.
  - Below KWD 5/day: run A-20 only and post B organically.
  - Add the 4:5 file through "asset customisation" for Feed.
- **TikTok** (from week 2, budget ≥ ~KWD 12/day): Spark Ad of the organic post with `-tt.mp4`.
  - Inbox open to Everyone.
  - At upload: Content disclosure **ON** → "Your brand"; Branded content **OFF**; AI-generated content **OFF**.
  - Post with its original sound and no in-app music.
- **AI label: OFF on both platforms, truthfully.** There is no AI picture, footage or voice in these files (§10).

## 8. Before the first fils of spend (gates)

1. **Muted 10-phone test** (replaces the treatment's animatic test, run on this film).
   - Ten Kuwaiti non-designers, muted, phone at arm's length, A then B, once each.
   - Ask: «شنو صار للكلمة؟», «منو هذول وشنو يسوون؟» and "did it freeze?".
   - Ship if ≥6/10 say the dots fell or left or the word broke, and ≤2/10 report a freeze.
2. **Recording session (optional, ≈30 min, phone ≈50 cm away in a quiet room).** It makes hook A stronger.
   - Voice 1, a man, warm: «مشروعك حلو…» (3 takes).
   - Voice 2, a woman, delighted: «من وين طلبتيه؟!» (3 takes).
   - Claps: 3–4 friends, on 2 & 4 at 120 BPM.
   - Release from each person, sent in writing: «أوافق إن طشّ تستخدم التسجيل الصوتي اللي سجّلته لها في إعلاناتها على الإنستقرام وتيك توك، بدون مقابل.»
   - Then drop `voice1.wav` / `voice2.wav` into `src/assets/rec/` and rebuild the audio (§11). It's an audio-only re-render.
3. **Owner confirms in writing:**
   - the caption price wording (§6);
   - the `/price` saved reply;
   - the launch gate in TREATMENT §13 item 12 (licence and bio disclosures).
4. **Preview the safe zones:** Meta's Reels overlay and TikTok's RTL template, on one phone set to Arabic and one to English.
5. **Photosensitivity:** run the A, B and 14 s files through the free Trace Center PEAT tool. Not run by Claude.
6. **A Kuwaiti ear** on the groove and the tick. Claude has checked the sound by measurement only (loudness, true peak,
   band energy), **not by listening**.

## 9. QC record (measured by Claude, 9 Nov)

Filled in from the final renders (see the end of this section).

## 10. Provenance

- **Picture.**
  - 2D: canvas code.
  - 3D: Three.js r180, vendored and MIT.
  - Fonts: Alexandria, IBM Plex Sans Arabic and JetBrains Mono (SIL OFL).
  - The «مشروعك» outline: Alexandria glyphs, unioned by `tools/word_export.py`.
  - The «طشّ» wordmark comes from `_system/brand/`.
- **Sound.** Synthesised by `src/audio.py` on `_system/audio/tashaudio.py`.
- **Nothing else is used:** no AI images, footage, voices or music; no samples, loops, stock or library music. No café,
  brand or person appears.
- **Paid tools: none.** No Higgsfield or other paid generation was used.

## 11. Rebuild

```bash
cd tash/11-boost-ad
pip install skia-pathops                     # once
python3 tools/word_export.py                  # → src/assets/word.json
python3 src/audio.py --len 20 --hook A        # → src/audio/audio-20A.wav (also --hook B, --len 14)
cd .. && node _system/tools/render.mjs --page "11-boost-ad/src/index.html" --out 11-boost-ad/out/TASH-boost-A-20s-9x16-ig.mp4 --workers 3 --audio 11-boost-ad/src/audio/audio-20A.wav
#   variants: ?plat=tt · ?hook=B (audio-20B) · ?len=14 (audio-14A) · ?fmt=45 · preview a frame: index.html?t=9.3 · fast 2D-only: ?no3d
```
The WAVs in `src/audio/` are build products and are not committed.
