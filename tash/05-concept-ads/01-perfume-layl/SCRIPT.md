# «ليل» | LAYL — Eau de Parfum No.07
`CONCEPT AD — 01 / PERFUME` · **إعلان تجريبي — علامة خيالية** (fictional brand, made by TASH as a demo)

9:16 · 1080×1920 · 30 fps · 15.90 s · H.264 + AAC 48 k · picture and sound are original code (Three.js + `tashaudio.py`).

---

## 1. الفكرة | The idea

**بالعربي:** العطر الفخم ما ينقال، يبين. نبدأ بالظلام، وخيط نور يمرّ على حافة زجاجة ثقيلة، فيصحى العنبر جوّاها.
الذرات الذهبية هي «النوتات»: عود · عنبر · زعفران. نرشّ مرّة وحدة بالتصوير البطيء، والرذاذ يعلق بالنور. وبعدين السطر:

> **«تمشي…»**
> **«ويبقى ليل.»**

يعني تمشي وريحتك تظل وراك. وكلمة «ليل» هي نفسها اسم العطر، فالجملة تخلص على اسم البراند. والقنينة على شكل قوس،
مثل شبّاك منوّر بالليل.

**English:** Luxury isn't claimed, it's shown. Darkness → a thin strip of light crosses the edge of a heavy glass block and
wakes the amber inside → gold dust drifts like the notes (oud · amber · saffron) → one slow-motion spray, the mist
catching the light → the line «تمشي… / ويبقى ليل.» ("You walk away… and LAYL stays.") → hero pack shot → client end card →
TASH signature.

*Improvement on the brief's line* «عطر يبقى… بعد ما تمشي.» ("a scent that stays… after you leave"): the same thought,
shorter, in natural Kuwaiti («تمشي» = you leave). It ends on the brand name, so the payoff *is* the logo. «ليل» means
"night", so the line also reads "…and the night stays".

## 2. What it proves | القدرة اللي يثبتها
A **CGI product film** built entirely in code:
- **Lighting.** A custom dark-field studio of emissive strip softboxes (soft-edged textures) baked with
  `PMREMGenerator.fromScene` at 512 px, with per-shot rigs. The hook re-bakes the environment every frame as one strip
  travels. Warm key, cool rim, narrow front strips placed *by angle* so the softbox streaks sit where the shot wants
  them.
- **Glass.** `MeshPhysicalMaterial` transmission 1, thickness 1.1, ior 1.5, dispersion 0.25, attenuation. The extruded
  arch has smooth bevel normals and flat faces (a custom normal pass), because non-indexed extrudes show facets in
  refraction. An inner cavity surface adds the glass→air reflections.
- **Liquid.** An inner volume with a custom shader: an intensity-dependent amber ramp (deep red-brown → honey), backlit
  radial falloff, a caustic band at the base, refracted studio env, and a "glow front" that rises through it. The juice
  deepens toward the cavity walls (longer light path) and the fill line carries a thin meniscus highlight over a slightly
  darker band. In S2 the refracted back light comes up with the glow, so the unlit juice opens deep and dark. The hook's
  light bar lights a moving band inside it.
- **Brass.** Lathe-turned cap (384 segments, real vertex tangents) with anisotropic brushed `MeshPhysicalMaterial`, a
  canvas-drawn brushing map, chamfers, a groove and an atomiser orifice with a fine polished bezel. The vertex tangents
  matter in macro: derivative tangents are per triangle and showed as stair-stepped facets on the rim.
- **Label.** «ليل» / LAYL / EAU DE PARFUM · No.07 drawn to a `CanvasTexture` with the real fonts (Alexandria 300,
  Archivo expanded 300/400), as hot-foil on the clear glass plinth.
- **Macro detail and lens.** Depth of field via a half-res gather blur composited by circle of confusion, plus a
  vertical lens shift for straight verticals in the low hero shot.
- **Particles.** Gold dust and atomiser mist as seeded points with their own bokeh and forward-scatter lighting, occluded
  by scene depth. The spray uses a ~0.22× speed ramp.
- **Floor.** A glossy black floor (`Reflector`) with a custom falloff shader.
- **Finish.** ACES tone map, warm lifted blacks, vignette, seeded ±1-LSB dither (no 8-bit banding in near-black
  gradients) and grain at 0.06.
- **Luxury pacing.** Shots of 1.5–3 s on an 80 BPM grid, one light sweep and one speed ramp, with text kept sparse.
  Focus tracks the camera pushes; there is no separate rack-focus pull.

## 3. The product (fictional) | المنتج
- **Bottle.** A thick glass block, 10 × 14 × 4.2 cm in scene scale. Its silhouette is a softly bevelled **pointed
  arch**: two-centred arcs, R = 0.62 W, with a flat neck plateau. It has a heavy clear plinth and an arch-shaped amber
  reservoir with 1.3 cm walls. It is not modelled on any existing perfume.
- **Cap = atomiser.** A heavy lathe-turned brushed-brass cylinder with a fine groove. A pin-hole orifice on its left side
  makes the cap itself the actuator: press, and it sprays.
- **Label.** Hot-foil «ليل» / LAYL / ─── / EAU DE PARFUM · No.07 on the plinth (the same lockup as the end card).

## 4. Client look (not TASH) | هوية العميل
| role | value |
|---|---|
| ground | deep black `#050403` (warm), lifted blacks in the grade |
| amber / honey | `#E09A2D` / `#F2B35A` (key word «ليل.» in the line) |
| brushed brass | `#C9A15B` (cap, rule, note separators) |
| type colour | ivory `#EFE3C8`, sub-line `#C9B48A` |
| Arabic | **Alexandria 300** (light), never letter-spaced |
| Latin | **Archivo** expanded (`font-stretch:125%`) **300 / 400**, LAYL tracked .62em |

TASH lime `#C6FF00` appears **only** in the closing TASH signature (and the tiny TASH mark on the poster). The concept slate
uses TASH's slate style (JetBrains Mono + IBM Plex Sans Arabic, smoke).

## 5. Shot list — LOCKED timings | قائمة اللقطات (التوقيتات ثابتة)
The launch-ad editor cuts from `?clean=1`: **same timeline, same frames, no text / slate / end card / sting.**
Times in seconds; frames at 30 fps (first frame of the shot). Cuts sit on an 80 BPM grid (1 beat = 0.75 s).
8.25 s falls between frames, so the first S5 frame is f248 (8.267 s). Every other cut is frame-exact.

| # | start → end (s) | frames | shot | camera / lens | light | buys (what the viewer now believes) |
|---|---|---|---|---|---|---|
| S1 | **0.00 → 1.50** | 0–44 | **Light sweep, macro glass edge.** The pointed-arch shoulder in near-dark. A thin bar of light is already in frame at f0 and travels right→left behind the flask: refracted sharp through the glass, bending at the bevels, and lighting a band of amber inside the liquid. A matching env strip glints the front bevels. The liquid starts to glow as the bar leaves. | macro, vFOV 38°, slow push-in (cruise ease, never at rest on a cut), DOF focus 1.16 | env re-baked per frame (one moving strip + faint top/side), physical strip behind | this is glass, precious and thick, and something warm is inside |
| S2 | **1.50 → 3.00** | 45–89 | **The arch lights up.** Frontal, symmetric: amber glow rises from the base through the liquid like a window lit at night. Two softbox streaks run down the face. Foil label in the plinth. | vFOV 30°, push-in 3.05 → 2.66 | front strips 15/10, warm back card, dark-field side strips | the juice is amber and alive; the bottle is an arch |
| S3 | **3.00 → 6.00** | 90–179 | **Orbit with gold dust (the notes).** A ~50° orbit at slight high angle, gold dust drifting in front and behind with its own bokeh, glossy floor reflection. | vFOV 36°, r 5.3 → 4.9, lens shift 0.05 | full dark-field studio, env fixed (reflections slide) | an object of craft; its notes are oud, amber, saffron |
| S4 | **6.00 → 8.25** | 180–247 | **Atomiser, slow motion.** Macro on the brushed-brass cap. The cap presses at **6.20–6.30**, mist leaves the orifice at **6.30** in slow motion (~0.22×), backlit so each droplet glints, and drifts left. | vFOV 36°, follows the mist leftward | warm rim strips behind-left (forward scatter) | the heavy brass cap is the atomiser; the scent is real |
| S5 | **8.25 → 10.50** | 248–314 | **The mist lingers.** The plume hangs in the dark and keeps drifting (continuous with S4). The camera follows it slowly. Text beat in the final. | vFOV 38°, focus on the mist | low warm rims only | the scent stays after you leave |
| S6 | **10.50 → 15.90** | 315–476 | **Hero pack shot.** Low angle on a glossy black floor with a strong near-contact reflection. One long push-in (r 7.45 → 6.55) with slight lateral drift. Verticals stay straight (lens shift 0.415). Gold dust settles. | vFOV 40°, cam height 0.36 | full studio + edge streaks + warm backdrop pool | this is LAYL, No.07, a product you could own |

**Final-only layers over S6:** client end card **11.10 → 12.95**, a quick "lights out" dip **12.95 → 13.17** (night
falls), TASH signature **13.15 → 15.90** (local short sting: `src/sting-short.js`; snap at 14.27). The `CONCEPT AD` slate
fades in from **11.90** and stays to the end. These layers were re-timed in the ECD review; **no shot time changed**.
In `?clean=1` the hero simply continues (pure footage) to 15.90.

**BTS range** (for the launch ad): **3.00 → 6.00 (S3 orbit, frames 90–179)**, rendered three ways: `bts/wire.mp4`,
`bts/clay.mp4`, `bts/final.mp4` (the final look, clean). The camera, timing and particles are identical in all three.

## 6. On-screen text (final only) | النص على الشاشة
All Arabic is live text shaped by Chromium from the OFL fonts and animated **per whole word**. RTL, with punctuation on
the left. Proofread twice.

| time (s) | text | type | motion |
|---|---|---|---|
| 3.20 → 5.48 (exit done by 5.90) | «عود · عنبر · زعفران» (oud · amber · saffron) | Alexandria 300, 50 px, brass dots | rise + unblur per word, right→left; exits upward |
| 8.30 → 10.08 (exit done by 10.36) | «تمشي…» | Alexandria 300, 132 px, ivory | feathered right→left write-on (like a pen), leftward drift |
| 8.65 → 10.12 (exit done by 10.44) | «ويبقى ليل.» (ليل. in honey) | Alexandria 300, 132 px | same write-on, words 0.24 s apart; both lines leave before the cut at 10.50 |
| 11.10 → 12.95 | «ليل» / LAYL / ─── / EAU DE PARFUM · No.07 | Alexandria 300, 168 px · Archivo exp. 300, 44 px, .62em · 400, 22 px, .34em | the name writes on as the push settles; Latin tracks in from .95em; the hairline draws from the centre |
| 11.90 → 15.90 | `CONCEPT AD — 01 / PERFUME` + «إعلان تجريبي — علامة خيالية» | JetBrains Mono 600, 22 px · IBM Plex Sans Arabic 400, 26 px | fade in, top safe area (y 232) |
| 13.15 → 15.90 | TASH sting: typing bubble → dots land in ش (14.27) → طشّ → «خلّهم يسولفون عنك!» (from 14.57, fully in ≈14.9) → @tash.creative.kw (from 15.00) | TASH brand | `createSting` behaviour, damped pops; tagline/handle cues 1.42 / 1.85 s (instead of 1.55 / 2.1) so both are readable before the end |

Safe zones: all text sits within x 72–1008 and y 232–1350 (lower lines centred, clear of the right-side action rail); nothing sits in the bottom 420 px.

## 7. Sound | الصوت (original, `src/audio.py` → `src/audio.wav`)
80 BPM, **Hijaz on D** (D Eb F# G A Bb C). It uses oud-like Karplus–Strong plucks (darkened, with risha tremolo re-strikes), a
deep pad, sub swells with a 2nd harmonic for phones, glass bells and a "wet-finger" glass tone, and a soft Khaleeji
mirwas pulse on the hero. Cues come from the same `src/cues.json` as the picture.

| time (s) | cue |
|---|---|
| 0.00 | frame 0: low open D string + sub swell + an airy sweep panned **right→left** with the light bar + glass tone |
| 0.42 / 0.80 | glass pings as the bar hits the arch edge |
| 1.50 | cut S2: oud motif starts on the downbeat (D4 → Eb4 → F#4 → G4, the Hijaz augmented second), D3/A3 pad, sub swell under the rising glow |
| 3.00 | **hero hit 1**, a soft cinematic impact + 808 D: the oud lands on A4 and descends (G F# Eb D); shimmer bells = gold dust |
| 5.35 → 6.25 | short riser into the press; at 6.00 the pad thins to a held b2 colour (Eb) under a low D2 string |
| 6.20 | brass cap click |
| 6.30 | **spray**: real-time «psst» onset stretching into a slowed, darkening hiss (time slows), downlifter, mist shimmer |
| 8.25 | near silence: one low D3 string with long reverb |
| 8.35 / 8.75 | quiet bell under each line («تمشي…», «ويبقى ليل.») |
| 9.20 → 10.50 | sub swell + tonal riser (from 9.40) into the hero |
| 10.50 | **hero hit 2**: impact + 808, oud cadence A4 G4 F#4 Eb4 → D4, mirwas dum … tak tak |
| 11.10 | end card: one deep frame-drum (tabl), glass shimmer + glass tone as the name writes on |
| 12.80 → 13.30 | **lights out**: the score low-passes and drops to a faint dark bed (−20 dB) under the typing ticks (no digital silence) |
| 13.77 → 14.12 | the bed clears completely, so the snap lands on air |
| 13.15 | TASH `sonic_logo()`: ticks → whoosh → **hero hit 3** on the snap (14.27) → shadda pop; soft 0.3 s fade at the end |

Low end (ECD review): sub swells −3 dB, the 808s −3 dB, impacts −1.3 dB, the music bus high-passed at 34 Hz and the sonic
logo at 30 Hz. Energy below 150 Hz went from 53 % to 42 % of the mix, so phone speakers get more of the oud and bells.
Pre-master: −14.1 LUFS, −1.6 dBTP true peak (WAV), so the mux's linear loudnorm (−14 LUFS / −1.5 dBTP) only nudges it.

## 8. Pages, params, commands
- Page: `src/index.html` (+ `main.js`, `scene.js`, `shots.js`, `overlay.js`, `sting-short.js`, `style.css`,
  `cues.json`). It is a pure function of `t`, with seeded particles and grain.
- `?clean=1`: the same timeline with no text, slate, end card or sting (pure footage, grain and vignette kept).
- `?pass=wire` / `?pass=clay`: wireframe / untextured clay of the same shots. These are always clean.
- `?poster=1`: the designed cover layout. `?t=12.6` freezes a frame and `?play` previews.
- Video: `node _system/tools/render.mjs --page 05-concept-ads/01-perfume-layl/src/index.html --out 05-concept-ads/01-perfume-layl/LAYL-concept-9x16.mp4 --audio 05-concept-ads/01-perfume-layl/src/audio.wav --workers 2`
- BTS: `... --page "…/src/index.html?pass=wire" --from 3 --to 6 --out …/bts/wire.mp4` (same for `pass=clay`, `clean=1`).
- Audio: `python3 05-concept-ads/01-perfume-layl/src/audio.py`.

## 9. Notes
- Fictional brand. It shows no claims, numbers, reviews or real products. The bottle is an original design.
- `_system` is untouched. The sting is a local copy (`src/sting-short.js`) with the same cues and dot behaviour; only the
  bubble and dot-pop springs are damped, so the shadda drop is the one visible spring, and the tagline/handle cues come
  in sooner (1.42 / 1.85 s) because the tail inside the film is 2.75 s, not 4.2 s. The typing, converge, snap and shadda
  cues are unchanged, so `sonic_logo()` lines up with the picture exactly.

## 10. Deliverables (this folder)
| file | what |
|---|---|
| `LAYL-concept-9x16.mp4` | final film with audio: 1080×1920, 30 fps, 477 frames, 15.90 s, H.264 + AAC 48 k |
| `poster.png` | designed cover 1080×1920 (`?poster=1`, t = 12.30): tiny TASH credit, `CONCEPT AD — 01 / PERFUME` + «إعلان تجريبي — علامة خيالية», LAYL lockup, hero bottle |
| `still-hero.png` | best clean frame (`?clean=1`, t = 4.70, S3 orbit) |
| `contact-sheet.png` | 2 fps sheet of the final film |
| `bts/wire.mp4`, `bts/clay.mp4`, `bts/final.mp4` | 3.00–6.00 s (S3), 90 frames each, no audio, identical camera |
| `src/` | page + modules, `cues.json`, `audio.py` → `audio.wav` |

## 11. Self-review ledger (measured, not certified)
| round | finding | change | result |
|---|---|---|---|
| 0 | facet stair-steps in refraction; blocky env streaks | smooth side normals, soft-edged strips, PMREM 512 | clean bevel lines at 2× zoom |
| 0 | 8-bit banding in the near-black backdrop | own output pass with seeded ±1 LSB dither, vignette moved into GL | no visible rings |
| 1 | frame 0 near-black; camera eases stopped dead on cuts; bloom 0.2 | bar in frame at f0, cruise ease, bloom 0.07 | composed f0; motion carries through cuts |
| 1 | notes / line text still exiting across cuts | exits re-timed (5.48 / 10.08) | no text over the next shot |
| 1 | end-card hold ≈0.6 s | end card moved to 11.25 | ≈1.2 s full hold with the push still alive (superseded in round 3) |
| 1 | hard clip write-on cut letters mid-glyph | feathered RTL mask with padding for dots and descenders | reads like a pen |
| 2 | S2 glow washed to pale cream | glow ceiling 0.85 → 0.72 | rich amber through the push |
| 2 | ي of «تمشي…» nearly touching «ليل» | line 2 +20 px | clear leading |
| QC | final MP4 | | −14.0 LUFS, −1.5 dBTP, LRA 3.0, no freeze > 0.6 s; blackdetect only flags the designed 0.17 s lights-out (13.47–13.63) and sting frames that are ~98% ink (14.40–15.07) |
| QC | determinism | same frame from different seek orders | identical, except ≤ 4 px at ±1/255 (SwiftShader float noise) |

Still weak / honest notes:
- Builder-reviewed only; there was no separate fresh reviewer.
- S1's last 0.5 s is a dark "breath" (the liquid starting to glow) before the S2 reveal. Intentional, but a stranger may
  not read the macro until 1.5 s.
- The low end is rich: 44–59 % of the energy is below 150 Hz in the film sections. That is fine on headphones; on phone
  speakers the oud, bells and spray carry it.
- Liquid refraction is an artistic shader (Three.js can't nest transmission), judged by eye.
