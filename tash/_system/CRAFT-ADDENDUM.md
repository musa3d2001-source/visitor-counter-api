# TASH / طشّ — Craft Addendum (v1, 2026-11)

A companion to `BRIEF.md`. The brief says **what** we make and the rules we never break. This file covers **how to make it
look like a studio did it**. It condenses the best-regarded open community skills on motion, product film, sound and
design, rewritten in our own words, adapted to our pipeline (HTML/SVG/Canvas + Three.js → headless Chromium →
FFmpeg, audio from `tashaudio.py`) and to Arabic-first, RTL, Kuwaiti work.

**Precedence.** If anything here conflicts with `BRIEF.md`, the brief wins. Known tensions are settled in §0.
Times are in seconds and frames at 30 fps (1 f = 0.033 s, 3 f = 0.10 s, 6 f = 0.20 s, 10 f = 0.33 s, 15 f = 0.5 s).
H = frame height (1920), W = frame width (1080).

---------------------------------------------------------------------------------------------------
## 0. Six ideas that matter most, and where the references disagree with us

1. **Every beat buys one belief.** Before animating, write one line per shot: *"Buys: the viewer now believes ___."*
   If you can't finish the sentence, cut the shot. (motionmaxxing)
2. **Show it happening; don't caption it.** A claim set in type should be followed by the product *doing* it: the spray,
   the pour, the sizzle. Show cause and then effect. (motionmaxxing, motion-video-kit)
3. **Shots hand off.** The last 6 frames of shot A and the first 6 of shot B are planned together: shared object,
   position (within ~2% of frame), velocity, colour. Cut on motion, never on rest. (motionmaxxing, motion-video-kit)
4. **Spend emphasis once.** Use one visible spring, one light sweep, one crash zoom, one dots-wipe and up to 3
   whole-frame impacts per piece. Anything repeated on every beat starts to read as a template. (all sources)
5. **The edit's sound has an arc.** Use 1–3 hero hits you place by hand, dip or silence before the biggest move, and duck
   the music while people read. A hit on every cut is a giveaway. (motionmaxxing, video-shotcraft, motion-video-kit)
6. **The builder never certifies the work.** A fresh reviewer judges the rendered pixels and measured audio against §7.
   (motion-video-kit "Gauntlet", OpenMontage reviewer, motionmaxxing gates)

**Tensions settled:**
- *"Never show tracked-caps labels, counters, timecodes"* (motionmaxxing) vs our **slate**. The `CONCEPT AD` slate and
  «إعلان تجريبي — علامة خيالية» are legally required, so we keep them, in the tail and on the poster only. Don't scatter HUD
  chrome (scene counters, corner timecodes, `SC 03 · TK 1`) through the body of a client ad. TASH's own brand pieces
  may use one slate moment per piece as a deliberate device, never as a persistent corner label.
- *"A dot that becomes the logo is house-style slop"* (motionmaxxing). That warning covers films that use the device by
  default. For TASH the dots **are** the brand idea, so it holds in our sting. Inside a **client** concept ad, though,
  the client's logo should arrive because something in the ad causes it, not through our dots.
- *"Near-black + one acid-green accent + mono labels + #0B0B0B"* is listed by Anthropic's `frontend-design` as one of the
  commonest AI-generated looks. That is literally our palette. The palette is fixed, so the difference has to come
  from the **idea**, the **Arabic typography**, real **light and material**, restraint (lime ≤10%), and Kuwaiti specifics.
  Never rely on the palette alone to look designed.
- Reading time: some sources allow 0.2 s/word when a voice-over carries the text. We have no VO and Arabic readers need
  more time, so the brief's floor (≥0.9 s per 3 words) stands, and §4 gives a formula above it.

---------------------------------------------------------------------------------------------------
## 1. Product-shot vocabulary for CGI product films (perfume · burger · coffee)

### 1.1 The studio first (the lighting is the product)
- **Environment = reflections.** Glass, metal, glaze and coffee surfaces show their surroundings. Build a studio scene of
  emissive cards, bake it with `PMREMGenerator.fromScene`, and set `scene.environment`. A starting recipe (world units,
  product ≈ 2 units tall, adapted from motionmaxxing's hero3d studio):

  | card | size | position | intensity / colour | job |
  |---|---|---|---|---|
  | horizon strip | 24 × 0.5 | (0, −1.4, 16), behind camera, low | 3.5, white | the long clean line across glass and metal |
  | key card | 5 × 7 | (−9, 6, 8) | 5, warm `#fff1e0` | broad body highlight, top-left |
  | rim strip | 2 × 16 | (12, 1, −7) | 6, cool `#dcefff` | separates the silhouette, lights bevels |
  | overhead | 10 × 3 | (0, 16, 0) | 1.5 | tops of caps, buns and rims |
  | cyclorama | sphere | around everything | near-black, faint horizon glow | dark seamless sweep |
- **Glass has two classic setups.** Use **dark-field** (black behind the bottle, two tall white strips just outside its
  silhouette left and right) for crisp white edge lines on black. That is the luxury perfume look and fits our Ink ground.
  Use **bright-field** (white or paper backdrop, black flags at the sides) for dark edge lines on paper, which suits clean
  "fresh" scents. Pick one per piece.
- Use **hard-edged strips** for glass (graphic lines) and **feathered cards** (radial alpha in the card's `CanvasTexture`)
  for food and ceramics (soft wraps). Unfeathered cards give hard-edged reflections everywhere.
- **Key + rim + falloff + contact shadow.** Use one key direction, one rim and a grounded shadow: a blurred radial
  gradient texture on a plane under the product is cheap and deterministic. Apply bloom only to true light sources
  (strength 0.03–0.08, high threshold), and never use it as atmosphere (brand rule: no glow).
- **Tone mapping.** Use ACES for dark chrome and glass. Use `NeutralToneMapping` (available in our r180) when a brand
  colour must stay exact, because AgX desaturates saturated accents. Always sample the rendered background pixel and
  compare it to the token: tone mapping shifts the ground colour, so compensate by pushing the linear background colour
  rather than editing the token.
- **Camera like a lens.** For 9:16, use a vertical FOV of **28–38°** for hero shots (tele look, flattering on bottles),
  **18–26°** plus a close camera for macro feel, and **50–60°** only for environment shots. Avoid roll, use pitch within
  ±20°, and spend depth of field on **one** rack focus per piece.
- **Materials (`MeshPhysicalMaterial`):**
  - *Perfume glass*: `transmission 1`, `roughness 0.02–0.05`, `ior 1.5`, `thickness 0.5–1.5`, optional `dispersion
    0.1–0.3` for prismatic edges. For the juice, use a separate inner mesh about 3% smaller with `attenuationColor` and
    `attenuationDistance` for depth tint. Nested refraction isn't physical in Three.js, so judge it by eye. The cap is
    metal (`metalness 1`, `roughness 0.15–0.25`) or lacquer (`clearcoat 1`). Draw the label to a `CanvasTexture` on a
    plane offset ~0.5% off the glass.
  - *Burger*: bun `roughness 0.55`, `clearcoat 0.3` (egg-wash glaze) with a top-to-bottom colour gradient; 80–150
    seeded instanced sesame seeds; patty `roughness 0.8` plus a noise bump; cheese with `sheen` and a faint warm
    emissive (0.05–0.1) as fake subsurface; lettuce as a displaced ruffled plane, `DoubleSide`, slight transmission,
    backlit; tomato `clearcoat 1`, `roughness 0.2`. Appetite reads from **glisten** (clearcoat speculars), **steam** and
    **drip**.
  - *Coffee*: ceramic `clearcoat 1`, `roughness 0.35`. The liquid surface is near-black brown `#2a160c` at
    `roughness ≈ 0.05`: softbox reflections on black coffee are the shot. Crema is an fbm swirl shader (tan
    `#c58a52` → `#8a5530`). Beans are deformed ellipsoids with a crease (`roughness 0.4`, `clearcoat 0.6`), instanced.
- **Macro exposes low poly and flat textures.** For any shot closer than ~15% of product height, add procedural normal
  detail (seeded canvas noise) and raise segment counts.

### 1.2 Named shots (each: move · lens · light · duration · how to fake it)
Durations follow the brief: 0.6–2.0 s energetic, 1.5–3 s luxury. Every shot starts already moving.

- **S1 Hero orbit.** Camera arcs **20–40°** (never a showy 360°) around the product, 5–10° below centre.
  Vertical FOV 30°. Studio env above; the env stays fixed, so reflections slide naturally across glass.
  2.5–4 s. *Fake:* spherical coordinates around the target. Angle is linear (`cruise`) with a short ease-in head and
  tail so velocity never hits zero at a cut. Use it to reveal form, not to show off a spin.
- **S2 Turntable + gobo.** The object rotates 15–30°/s with the camera locked while a patterned light (lattice /
  mashrabiya-like, or blinds) rakes across it. 2–3 s. *Fake:* `SpotLight.map = CanvasTexture(pattern)` with
  `castShadow = true` (needed for the projection), penumbra 0.3–0.6. Slow the gobo drift to 1–2%/s for luxury.
- **S3 Macro slide.** Camera very close, gliding 2–5% of product size across a surface (glass facets, sesame, crema
  bubbles). Vertical FOV 18–24°, focus plane on the surface. 1.2–2.0 s, linear drift. *Fake:* `BokehPass` with
  `focus` = camera–surface distance, or a pre-blurred background plate (§1.3).
- **S4 Rack focus.** Focus pulls from a foreground element (droplet, bean, cap) to the hero in **0.4–0.8 s** on
  `inOutSine`, with background blur capped at ~11 px equivalent. Pull back by blur, never by opacity. *Fake:* animate
  the `BokehPass` focus, or the two-plane crossfade in §1.3.
- **S5 Light-sweep reveal.** The product sits in near-dark while a narrow softbox travels across it. A reflection
  streak crosses the glass or metal and reveals silhouette and label. 1.2–2.0 s. *Fake:* add a moving emissive card
  (width ~0.8, intensity ~14, tilted ~0.35 rad so it reads as a diagonal sweep) to the env scene and re-bake the PMREM
  per frame. **Dispose the previous env texture every frame**, because PMREM targets leak memory over long renders.
  Use it once per piece, on the hero only, and keep it inside the object. A flash over the whole object at once reads
  as a glitch.
- **S6 Silhouette rim reveal.** Open on rim only (strips behind left and right, dark-field), with the key ramping
  0 → 1 over 1.0–1.5 s to reveal the front. Best for the perfume hook and the coffee steam (steam only reads when
  backlit). *Fake:* animate the env card intensities, re-baked per frame or crossfaded between two baked envs.
- **S7 Top-down pour.** Overhead 90°, vertical FOV 30–35°, framed tight (wide top-downs show texture tiling). 1.5–3 s.
  *Fake:* a `TubeGeometry` along a curve with animated length plus noise wobble, transmission material; crema blooms
  outward as a polar-coordinate noise shader. Pair with `pour()`.
- **S8 Exploded-layer drop (burger).** Layers hover apart, then drop into the stack bottom-up (bun → patty → cheese →
  lettuce → tomato → bun). Each falls with an ease-in and lands with a **3–6% squash**, recovering over ~30% of the
  fall time. Stagger 4–6 f, whole cascade ≤ 1.2 s. Camera at 15–25° elevation, 3/4 view. *Fake:* per-layer
  `y(t)`; use **smootherstep** (`x³(x(6x−15)+10)`) for lifts, because an ease that starts at full speed pops in one
  frame. A held exploded view "breathes" +10–15% separation so it isn't frozen.
- **S9 Dolly zoom.** The camera dollies in while FOV widens, keeping the subject the same size while the background
  stretches. 0.8–1.5 s, used once as the "wow" (aroma hit, first sip). *Fake:*
  `fov = 2·atan(K / d)` with `K = d0·tan(fov0/2)`, then `camera.updateProjectionMatrix()`.
- **S10 Crash push.** A 6 f push to **2.4–2.8×** with ease-in, optionally preceded by a 3–4% pull-back over 6–8 f.
  Land either with a 3–6% overshoot settling in 5 f, or with a hard stop plus a shake envelope of
  `amp·e^(−t/1.8 f)` (amp 7–14 px, gone in ~6 f; above 20 px reads as a bug). Motion blur on the push only.
  At most 2 per piece. (video-shotcraft)
- **S11 Hero creep.** A slow push of 1.0 → 1.06–1.12 over 2–3 s, linear. The default way to keep a hold alive under text.
- **S12 Low-angle hero.** Camera 10–20° below product centre, vertical FOV 28–35°; the top cuts against the dark sweep.
  Reflective floor: mirror-duplicate the product (`scale.y = −1`) below a dark semi-transparent gradient plane
  (cheaper than `Reflector`). 1.5–3 s. This is the payoff and end-card frame.
- **S13 Bullet-time freeze orbit.** The action freezes mid-air (droplets, seeds, splash) while the camera orbits
  45–55° over 1.0–1.5 s. Run two clocks: content time is the integral of a speed curve (8 f ramp-down → freeze →
  8 f ramp-up), while camera time stays real. Frozen things keep their in-motion pose (trails, stretch). Use once.
  (video-shotcraft)
- **S14 Speed ramp.** 1.0× → 0.2× at the money moment (spray, splash, pour, cheese stretch) and back. Content-time remap
  only. Pair with a low-passed, slowed whoosh or silence. At most once.
- **S15 Pull-back isolation (ending).** The camera pulls out (scale ~2.2 → 0.6 over ~3.5 s, `outCubic`) while the
  surroundings darken in order of distance and the product is left alone. Don't combine it with a busy "everything
  flies in" ending; pick one.
- **S16 Spray burst (perfume).** The cap squashes 2–3 f, then mist streams as seeded `Points` with a soft sprite in a
  15–25° cone, decelerating exponentially (drag), **backlit** by the rim so the mist glows. ≈0.45 s plus a slow-mo
  tail. `spray()`.
- **S17 Steam (coffee/burger).** 3–6 billboard planes with an upward-scrolling fbm shader at 5–15% opacity, additive
  blending, backlit on a dark ground. Never on a light ground (invisible).
- **S18 Label lock.** End on a front 3/4 angle where the label text is **≥0.04 H** (≈77 px) and razor-sharp. The label
  is a `CanvasTexture` drawn after `document.fonts.ready`, at 2–4× display resolution.

**Per product, start from:**
- *Perfume (luxury, 1.5–3 s shots):* S6 hook → S3 → S4 → S16 + S14 → S1/S2 → S12 + name → end.
- *Burger (energetic, 0.6–1.2 s shots):* S10 or a slam hook (patty lands at 0.3 s) → S8 → S13 → S3 (cheese glisten)
  → S12 → end.
- *Coffee (warm, 1–2 s shots):* S7 hook (pour already running at frame 0) → S17 → S4 (bean → cup) → S9 (first sip /
  aroma) → S12 → end.

### 1.3 How to do it in our pipeline
- Each 3D page exposes `pose(t)` (sets everything from `t` only) and `render(t)`; `boot({seek})` calls them. No RAF, no
  `Date`, no `Math.random` (use `rng(seed)`). Hand-off poses come from **shared functions** used by both shots, so the
  cut matches by construction.
- **Motion blur by sub-frame accumulation** (our renderer has no shutter option, so do it inside `seek`):
  ```js
  // inside seek(t): N sub-frames over a 180° shutter, equal-weight running average
  const N = subframesFor(t);                     // 1 when slow; 8 floor for fast moves; 16–24 for very fast edges
  for (let i = 0; i < N; i++) {
    pose(t + ((i + 0.5) / N - 0.5) * (0.5 / 30)); renderer.render(scene, camera);
    acc.globalAlpha = 1 / (i + 1); acc.drawImage(renderer.domElement, 0, 0);
  }   // renderer: { alpha:false, preserveDrawingBuffer:true }; show the 2D `acc` canvas, hide the WebGL one
  ```
  Pick N from on-screen speed so the echo spacing stays ≤ 4–6 px. Ramp the shutter angle in and out over ~6 frames so
  blur never switches on in a single frame. Cost is ×N per frame (SwiftShader runs heavy glass at 1–2 s/frame), so
  only fast frames should pay it.
- **Cheap depth of field:** render sharp, then crossfade between 4–6 **pre-blurred** versions of a background plate
  rather than animating a full-frame `filter: blur()` (live blur on a full-frame layer can triple render time). For
  real DOF use `BokehPass` and test one still first.
- **Big zooms:** interpolate scale in log space, `s = exp(lerp(ln a, ln b, e))`. A linear scale tween appears to
  slow down as it zooms in.
- **Measured motion** (a real-feeling fold, cap twist or lid opening): write keys as (t → value) and interpolate them
  with a monotone cubic (Fritsch–Carlson, zero end slopes). Smoothstepping between keys creates a mid-move hiccup.
  Plot units per frame: one peak, no second bump. (motion-video-kit)
- Render the hero still at full size first (`render.mjs --stills`); if it isn't screenshot-worthy, fix the light
  before animating anything.

---------------------------------------------------------------------------------------------------
## 2. Edit grammar for 9:16 social ads

### 2.1 The first 1.5 s
Rules: **frame 0 is a finished, moving composition** (not black, not a fade-up, not a half-entered word, no logo).
The first salient event lands at **0.2–0.5 s**. If there's text, it reads by 0.5 s: ≤3 words at ≥120 px. Sound starts at
frame 0, and the first hit is tied to something visible.

| Hook | What happens | Good for |
|---|---|---|
| **Macro mystery** | Frame 0 is an extreme close-up of a texture (glass facet, sesame, crema), already sliding; identity revealed by a pull-back or scale cut at ~1.0–1.3 s | perfume, coffee |
| **Impact first** | Something lands at 0.3 s: patty slams, cup set down, bottle drops into frame. Sound hit on the contact frame | burger, energetic |
| **Contrast / question** | Two states that can't both be true, read in <1 s (≤3 words): heat vs ice, empty vs full | any |
| **Pattern interrupt** | Unexpected axis: product falls from above, rotates in from off-axis, frame splits | social energy |
| **Chat bubble** (brand-native) | A typing bubble «…» appears, then a short dramatised line (no names, no numbers) | TASH pieces, playful clients |
| **Result first** | The finished hero frame for 0.5 s, then a hard cut back to the process | food, transformations |
| **Cold-open triplet** | Three 9 f shots (very different framings, each with a 1→1.04 linear push), then 6 f of pure black and silence, then the real opening | trailer-style launches; once |

### 2.2 Pacing curves
- **Shorten, then linger:** shot lengths shrink through the build and the last shot holds (e.g. 1.7 / 1.5 / 0.8 /
  1.44 s). Never use the same length three times in a row. Equal-length beats read as a slideshow.
- **Energy arc:** low-to-mid open → one hero with a complete action arc (≥2–3 s, slowest and richest) → build
  alternating high and calm shots → peak → **the ending is smaller than the peak**.
- **Cut cadence:** inside a sequence, cut every 0.3–2.3 s; claim and product phases 1.5–3 s. On music, choose a tempo
  whose beat is a whole number of frames and cut on multiples:

  | BPM | 90 | 100 | 112.5 | 120 | 128.57 | 150 | 180 |
  |---|---|---|---|---|---|---|---|
  | frames/beat @30 | 20 | 18 | 16 | 15 | 14 | 12 | 10 |
- First drafts are almost always **too fast**. The reference studios' feedback ran one way ("slow down, hold"). Budget
  the holds before the moves, and give the brand mark a full ≥1 s settle. (video-shotcraft)

**Starter shapes:**
- *Energetic 15 s (burger, 120 BPM):* hook 0–1.2 · build 4 × 0.75 (cut on beat) · turn 1.8 (freeze orbit; music
  drops out 0.3 s before) · desire 3.5 (macro 1.0 / top-down 0.8 / low-angle 1.7) · offer 2.5 · client card 1.2 +
  TASH tail 1.8.
- *Luxury 20 s (perfume, 90 BPM):* hook 1.5 (rim reveal) · macro 2.0 · rack 1.5 · spray slow-mo 1.0 · orbit 3.0 ·
  turntable 2.0 · hero + name 3.5 · client card 3.0 (two moving beats) · TASH tail 2.5.

### 2.3 Cut-on-action and match-cut recipes
- **Anatomy of a good cut:** (1) A *accelerates* into the cut over its last 3–8 f; (2) the cut is one frame, no fade;
  (3) B's first frame is already moving or built; (4) optionally 0–3 empty frames that continue the vector; (5) B's
  motion continues A's direction.
- **Handoff table** (fill one row per cut before animating):

  | cut @f | A last frame: object · pos · scale · colour · blur · velocity | B first frame: same fields | carried element | type |
  |---|---|---|---|---|
- **Match cuts we can own:** cup rim (circle) → lime dot → bottle cap; pour stream (vertical line) → spray mist
  column; steam curl → Arabic word stroke (via a mask); burger stack silhouette → lockup block; a rotation that
  continues across the cut at the same angular speed; colour match (crema tan → client palette field).
- **Cut on action:** cut at the **peak** of the action (max velocity, max compression, the drop's contact frame),
  never after it settles. Cut before a press releases; the viewer completes it.
- **Scale cut:** a one-frame jump in distance (ratio 0.56–0.77) followed by a 0.3–0.6 s decelerating tail reads as
  editing, while a long zoom tween reads as a preset. Change content in the same frame as the scale jump.

### 2.4 Transition library (pick with a purpose; ≤2 kinds of wipe per piece)
| Transition | Use when | Recipe |
|---|---|---|
| **Hard cut on motion** | default, ~70% of joins | as above; carried object or matched vector |
| **Match cut** | shape, rotation or colour rhyme exists | position within 2% of frame, same velocity |
| **Whip pan** | fast sequence, energy→energy | 8 f, peak speed at t≈0.25, cut **at** peak speed; B starts already blurred and resolves over ~8 f; directional blur on the last 3 f of A. Overscan the world 10–15% so its edge **never** shows |
| **Dots-wipe** (brand) | the one signature transition | three lime dots, staggered right→left 2–3 f, scale on ease-in to cover the frame (10–14 f); cut hidden at full cover; B revealed as dots exit leftward. Once per piece |
| **Light-sweep / burn** | a warm, ceremonial chapter change | light intensity rises on ease-in over ~28 f, the cut hides on the peak frame, then it decays over ~40 f; at peak raise brightness +60–85% and drop contrast to ~50%, so the old frame burns out rather than having light pasted on top. Once |
| **Foreground occlusion** | invisible scene change | an out-of-focus object passes close to the lens (oversize, blurred, motion-smeared); cut inside the covered frames |
| **Effect becomes ground** | ground or colour change with a cause | the pour fills the frame → coffee-brown ground; mist → paper white; a growing dot → lime field |
| **Feathered wipe in B's colour** | two content-heavy frames | 0.56 s, feather 30–40% of the axis, painted in B's ground colour; B's hero enters 0.1 s before the wipe ends; alternate the direction |
| **Blur-matched cut** | between zoom levels | A ramps to ~18 px blur; B starts at ≥ that much blur and resolves in ~8 f |

**Avoid:** crossfades between scenes (allowed only for a calm brand voice, or when the dissolve *is* the meaning); random
spins, yaw and roll "shock" transitions (they read as an editing-app preset); glitch spam (if used at all: localized,
≤6 f, once); a white flash as the default; light leaks or zoom-throughs on every cut; circle irises without a circular
motivation; page-turn or cube presets; one transition used on every cut; fade to black by default.

### 2.5 How to end
- The final shot is ≤25% of the film. The client end-card has the logo arriving because of something in the shot (the
  product's motion leads into it). Its hold is 0.6–1.4 s with one thing still alive (drift, light, a pulse). Then the
  TASH tail per the brief (2.2–3 s total, as two moving beats, never one frozen card).
- The ending is quieter and smaller than the climax. End in motion or on a designed stillness, not a fade to black.
- The CTA or offer is readable at phone size for ≥1.5 s. For loopable social pieces, let the last frame rhyme with
  frame 0 (colour or position) so a replay feels continuous.

### 2.6 How to do it in our pipeline
Keep a `shots = [{id, at, dur, buys, carry}]` table in `src/` and use `shotAt()` from kit.js. Export the same table
(plus hits) as `src/cues.json` and have `src/audio.py` read it, one source of truth like `endcard-cues.json`. Render
stills at `cut − 2f`, `cut`, `cut + 1f` for every cut and check them as a strip.

---------------------------------------------------------------------------------------------------
## 3. Motion that reads "made", not "generated"

### 3.1 Durations and easing (measured defaults from motionmaxxing's 4,300 professional moves)
- The median move is **10 f**. Translate and scale entries take ~12 f, opacity ~6 f, blur ~7 f, translate exits ~13 f.
  Treat 6 f and 24 f as the normal range; >1 s moves are drifts.
- **Landings decelerate and departures accelerate.** Entries put 50–70% of their travel in the first 4–5 f, then a
  0.4–0.6 s tail. Exits ease *in* and leave at peak speed. Ease-out exits look reluctant and ease-in entries look
  sluggish.
- **Mapping to kit.js `E`** (percent done at 10/25/50% of the time):

  | Role | Feel | kit.js | Frames |
  |---|---|---|---|
  | hero / CTA land | snap + long tail (50/82/97) | `E.outExpo` | 10–18 |
  | word / panel land | soft land (27/58/88) | `E.outCubic` (`outQuart` firmer) | 10–15 |
  | medium move, camera push | glide | `E.outQuad` | 8–18 |
  | exit off frame | accelerate | `E.inCubic` / `E.inQuart` (to a hard cut) | 9–17 |
  | fade start, slow push into a cut | gentle in | `E.inQuad` | 6–10 |
  | ground/colour ramp, focus pull | S-curve | `E.inOutSine` | 9–20 |
  | drift, creep, counters | constant | `E.linear` (drift only) | 26+ |
  | late small lean (overshoot) | peak ≈5–8% at t≈0.6 | `E.outBack(x, 1.2–1.5)` | 12–18 |
- **Overshoot is rare, late and small:** ~9% of professional moves overshoot at all, mostly by leaning past the mark at
  t≈0.6–0.7. kit's default `outBack` (s = 1.70) peaks at **+10% at t = 0.58**; use s = 1.2 (+5%) or 1.5 (+8%).
- **kit `spring` overshoot is large by default** (measured peak over rest):

  | `{freq, damp}` | 2.2, 5.5 (default) | 2, 6.5 | 1.9, 7 | 2, 9 | 2, 12 | 2, 14 |
  |---|---|---|---|---|---|---|
  | peak | **+31%** | +22% | +19% | +13% | +7.5% | +5% |
  Keep one visible spring per piece (the payoff). Everything else settles with `damp ≥ 12`, or uses `outExpo` with no
  overshoot. The default spring ends ~0.1% off rest at x = 1, so snap to the exact rest value at the end.
- **Vary eases and speeds deliberately:** no more than two independent tweens in a scene should share an ease, and the
  slowest scene should be ~3× slower than the fastest. Entrances take longer than exits (in 0.7–1.3 s on a strong
  ease-out, out 0.35–0.55 s on ease-in).

### 3.2 Anticipation, follow-through, stagger
- **Anticipation** lasts 20–30% of the main action (a 0.75 s action gets 0.15–0.22 s): a 3 f counter-drift opposite to
  the travel, a 0.96 pre-shrink, or a 0.1 s still before a press. Put it on the **key** move only.
- **Follow-through:** nothing stops all at once. Use a drag hierarchy (container → main part → details → accents), each
  level offset 2–4 f. Never let all parts land on the same frame.
- **Stagger:** siblings 1–3 f apart with *uneven* gaps (e.g. 3,2,2,2,2,2); each move about 2× its gap so tails overlap.
  The whole cascade stays under ~0.6 s. Stagger in **order of importance**, not DOM order. CTA stacks get wider gaps (~8 f).
- **Press physics:** a 2–3 f squeeze to 0.75–0.90, the target reacts 0–1 f later, release slower (6–10 f, optional +5%
  rebound). Brighten the target; no ripple rings, no white flash.

### 3.3 No dead frames (but let it breathe)
- Any hold longer than 3 f keeps **one living thing**: 1–3 px/f drift, 0.5–1%/s scale creep, a light moving across the
  ground, steam, a slow gobo.
- A **designed breath** of 0.6–1.5 s right before a payoff is good. Only the payoff itself may be fully still, and for
  under ~1 s.
- Don't make everything busy either: human films average a calm-to-medium motion level. Calm and legible beat frantic
  in blind picks.
- In the last 0.2 s before a cut, accelerate the hold slightly (2–5× drift) so the cut feels pulled.

### 3.4 Blur grammar — choose ONE per piece
1. **Smear:** directional blur along the travel axis on frame 1 of a fast move, roughly halving each frame (e.g.
   20 → 4 → 2 → 0 px over 3 f), length ≈ 0.5–1× that frame's displacement, capped at ~0.15 W. Optional faint trail copies
   (0.22 / 0.12 / 0.06 alpha).
2. **Crisp steps:** no blur at all; things change during the move instead. This suits technical and flat brands.
3. **Shutter:** sub-frame accumulation (§1.3), so everything blurs by its own speed. Never stack it with smear, and
   never use it on an on-twos piece.
Mixing grammars reads as two different authors. Separately, blur is also a **focus** tool (rack focus, blur-resolve on
words) in any grammar.

### 3.5 Camera rules
- Move **one camera group**. Product, ground and props live inside it. Screen-fixed type and the grain overlay sit
  outside. Never zoom text on its own.
- **Pans are two pushes**, not one ease: a fast start, a slow drift, a second accelerating push, then a long settle.
  One global ease reads as a keyframe.
- **Shake:** no handheld wobble on bright product films (a tiny 0.02 amount is acceptable only on dark atmospheric
  pieces). Impact shake is an event: `amp·e^(−t/τ)` with amp 7–14 px and τ ≈ 0.055 s (our sting uses 7 px · e^(−18t)),
  done within ~6 f. Use **≤3 whole-frame impacts per piece**, ≥16 beats apart, never during reading. Beat-synced
  pulsing of the whole frame reads as jitter.
- **Parallax:** 3 layers at speed ratios of ≥2× (e.g. 0.35 / 0.7 / 1.4), plus a fixed (0×) type layer. Anchor depth
  with a ~5 px background blur, 0.7 saturation and haze, and a ~7 px foreground blur. Use at most 4 layers, and the
  reading layer is never blurred.
- **Micro-drift:** when the camera "holds", it still moves ≥1 px/f; if it must be locked, something else moves.

### 3.6 Texture and finish (subtle, consistent, once)
- **Grain:** kit `grain` at opacity 0.03–0.06, scale 2, the **same level for the whole piece**. It hides 8-bit banding in
  vignettes and dark gradients, which matters on Ink. Platform re-encoding smears heavy grain into blotches, so keep it
  fine.
- **Vignette:** −10 to −20% at the corners, centred on the subject, constant per piece.
- **Chromatic aberration:** if used at all, radial at the frame edges at ≤1–1.5 px, or as a 1–4 f event on the single
  biggest hit (fringe ~10–15 px decaying to 0 by ~9 f). Never on reading text at rest.
- **Halation:** only on true speculars (perfume glass, coffee surface), tinted warm red-orange, ≤10%, small radius. It
  must never read as glow (brand rule).
- **Grade:** one grade per piece, applied as the last pass (CSS on the root, or a `ShaderPass` on WebGL). Lift blacks
  slightly and roll off highlights; never pure #000 or #FFF in renders. Sample brand colours after tone mapping.
- **Slop tells to delete on sight:** opacity-only fades on everything; one ease on everything; bounce on every pop;
  constant 0.1 s stagger; logos growing from scale 0; generic floor glow under every scene; lens flares; bloom haze;
  orbiting an object for no reason; ghost text at 3–9% opacity; hairline grids as decoration.

### 3.7 How to do it in our pipeline
Build a local `src/motion-extra.js` (don't touch `_system`) with `smootherstep`, `logLerp`, a Fritsch–Carlson `keys()`
interpolator, a `shake(t, t0, amp, tau)` helper and `smear(el, px, axis)`, which sets `stdDeviation="px 0"` on an SVG
`feGaussianBlur` referenced by `filter:url(#id)`. Directional blur needs SVG, because CSS `blur()` is isotropic.
Everything stays a pure function of `t`.

---------------------------------------------------------------------------------------------------
## 4. Kinetic typography — Arabic first

### 4.1 Non-negotiables (shaping)
- **The unit is the word or the line.** Arabic letters change form by position; any per-letter element breaks the
  joins. Use kit `words()` (one `inline-block` span per whole word). **Never put a span inside a word.** To colour or
  reveal part of a word (e.g. the ش dots), duplicate the whole word on a layer and mask it.
- **No letter-spacing, no fake bold or italic, no non-uniform scale** (`scaleX` squash looks like broken type on
  Arabic). Emphasis comes from size, weight (between the layout's two allowed weights; Alexandria is variable, so a
  `wght` swell is legitimate on an isolated word with a reserved width), colour (lime on Ink only), position or timing.
- **Masks need headroom:** Arabic has tall ascenders (ا ل ك), deep descenders (ي ع ر و ن), dots and shadda. Clip masks
  overscan **≥0.3 em above and ≥0.35 em below** (kit `reveal()` uses −20%; increase that for display weights with
  shadda). Set display line-height 1.25–1.5.
- **Bidi hygiene:** wrap Latin and numbers (prices, handles, «3.500 KD», phone-style strings) in `<bdi>` or
  `dir="ltr"` spans. Add a right-to-left mark (U+200F) after a trailing Latin or number run so ، ؟ ! sit at the left
  end. Choose Western or Eastern Arabic digits once per piece and keep them consistent. Kuwaiti dinar prices have
  **3 decimals**.
- **Underlines collide with descenders.** For a highlight use a marker band *behind* the word (z-index below, centred
  around the letter body), a pill or colour, never `text-decoration`.

### 4.2 Direction and flow
- Reading flows right→left, so **"forward" is leftward**: wipes and mask edges travel right→left, word stagger starts
  at the rightmost word (DOM order in RTL, so kit `headlineIn` already does this), and "the next item" enters from the
  left as the camera moves toward it.
- A hard clip edge sweeping **right→left through a connected word** reads like a pen writing. It is the most native
  Arabic reveal. Add 8–16 px of drift leftward during the reveal, ~0.3–0.5 s per word.
- Mixed lines: Latin and numerals keep their own LTR internal order, but the line's choreography still runs RTL.

### 4.3 Entry mechanics (choose per line; one blur grammar for the whole piece, §3.4)
| Line type | Mechanic | Numbers |
|---|---|---|
| hook, 2–4 words | **rise + unblur** (kit `headlineIn`) | rise 0.03–0.05 H (58–96 px); blur 6–10 → 0 px over 6–8 f; opacity as a 4–6 f helper; gaps 3–5 f, uneven |
| thesis word / payoff | **arrive from oversize** | starts 1.3–1.9×, `outExpo`, ~86% of the shrink in 0.13 s, at rest by ~0.6 s; once per piece |
| calm luxury line | **RTL mask write-on** | clip edge right→left 0.3–0.5 s/word, slight leftward drift; no bounce |
| offer / CTA words | **blur-resolve in place** | per word: blur 8→6→4→1.5→0 px, opacity .12→.3→.65→.9→1, 4 f per word, back-to-back |
| state change / punch | **hard step** | 1-frame cut-on of whole words, no ramp; works with a drifting phrase |
| a reply line (chat) | **change axis** | first line rises, the reply slides in from the left with a 3 f anticipation |
| key word | **act out the meaning** | e.g. «وايد» stretches, «الحين» lands hard on a beat, a word that "leaves" exits alone; spend this on 1–2 words per piece |
- **Exits** are faster than entries: 3–4 f per word, 1 f apart, overlapping the next entry by ~2 f, leaving by moving
  (up 0.03–0.07 H on ease-in), never a slow fade.
- **Accent on arrival:** the new key word can arrive lime for 4–8 f and settle to Paper, or stay lime if it is *the* lime
  word of the layout. One accent with one meaning per piece.
- **The brand ellipsis:** at one moment per piece, the typing dots (•••) can serve as the punctuation of a line («…»
  after «يسولفون»). This is our ownable kinetic-type device; don't use it in every line.

### 4.4 Timing per word count (no voice-over)
- Gaps: hook 3–5 f, headline 4–6 f, with ±40% jitter in a speech-like pattern. Leave a longer gap (8–10 f) **before**
  the payoff word, since the pause is the emphasis.
- **Full-hold time once assembled** ≥ `max(0.9, 0.4 + 0.35 × words)` s. That gives 2 words ≥ 1.1 s, 3 → 1.45 s,
  4 → 1.8 s, 6 → 2.5 s (above the brief's 0.9 s/3 words floor). The hold is never fully still (§3.3).
- Max ~6 words on screen (brief). More than 6 words means two beats, or turn it into a picture.

### 4.5 Hierarchy and layout in 9:16
- Sizes (brief): hero 120–170 px (Alexandria 800–900, 1–3 words), support 44–60 px (IBM Plex Sans Arabic 500–600),
  labels 22–26 px. Keep at least a **1.5–2× scale step** between levels and no more than 3 levels per frame.
- Text-safe area: x 72–1008, y 220–1500. In the lower half (y > ~900), also stay clear of the platforms' **right-side
  action rail**: keep ~120 px from the right edge. Right-aligned Arabic is the most exposed, so centre hero lines or
  indent them.
- Effective size is what reaches the screen: font-size × every ancestor scale × perspective. Captions must be ≥56 px
  effective and support text ≥32 px. Check at 25% (a 270 px-wide thumbnail): if it doesn't read, it is too small.
- Break lines by meaning. Never leave a one-word widow on a hero line; `text-wrap: balance` works for RTL in Chromium.
- Sentence-like rhythm over shouting: one weight change or one lime word, not both on the same line.

### 4.6 How to do it in our pipeline
`words(el)` + `headlineIn/Out` + `reveal(el, k, 'rtl')` cover most of this. For write-on reveals, animate `reveal()`
per word with `E.outCubic` and add a `translateX` drift. Proofread every string twice, render stills at 200% around
every word that holds a shadda or hamza (أ إ آ ؤ ئ), and check the لا ligature and the punctuation side.

---------------------------------------------------------------------------------------------------
## 5. Logo animation, bumpers and the three-dots sting

### 5.1 Principles that matter most for marks
- **Timeline shape 20 : 50 : 30** (anticipation : action : follow-through). A 1.5 s reveal is ~0.3 + 0.75 + 0.45 s.
- **Drag hierarchy:** the root lands first, then primary parts, then accents, offset 2–4 f per level. Parts with more
  visual mass move slower.
- **Arcs:** a dot travelling to its slot follows a slight arc, not a straight diagonal (the sting already does this).
- **Arrive, don't grow:** marks never scale up from 0. They decelerate in from oversize (1.1–1.4× for calm brands,
  ~3.5× crash-in for heavy ones) or are revealed by a mask, draw-on or cause.
- **Personality sets the numbers.** TASH is *confident, witty, crafted*, between "energetic" and "friendly": parts take
  0.25–0.6 s, one overshoot of 4–8% on the key part, squash ≤10% and only on the dots (they are bouncy by meaning). For
  fictional clients: luxury gets no squash, ≤2% overshoot, mask wipes, 1.4–1.8 s; food and fun get up to 15–25% squash
  on landings and 0.6–0.9 s.
- **Final Frame Contract:** the last frame of any logo animation must match the static logo pixel-for-pixel. Render
  `?t=end` and the static SVG and diff them.
- **Draw-on strokes** (monoline marks): `pathLength="1"`, butt caps, `stroke-dasharray: 1 1`, offset 1 → 0. Round caps
  leave a dot visible at t = 0.
- **Wipe direction = reading direction:** Arabic wordmarks wipe right→left (the sting's body wipe already does), with a
  2–4 px drift in the same direction.
- **Idle loops** must be seamless (state at 0% = state at 100%). Check the frames just before and after the seam.

### 5.2 Applying it to our sting (`/_system/motion/endcard.js`; build variants locally)
- Current beats (`endcard-cues.json`): typing 0–0.74 → converge 0.74–1.12 (with arc) → body wipe RTL + slam 1.14 → 1 at
  1.12 → shadda drop 1.3 → tagline 1.55 → handle 2.1 → pulse 2.9 → end 4.2. Its shape is already right: anticipation
  (typing), action (converge + slam), follow-through (shadda, tagline).
- **Springs in it today** (from the table in §3.1): bubble ≈ +18%, dot appear ≈ +22%, slam ≈ +19% of its 0.14 travel
  (a small ~3% scale dip), shadda ≈ +24% of a 260 px drop. For short tails inside client ads (2.2–3 s), make **the
  shadda drop the one visible spring** and settle the bubble and dot pops with `damp ≥ 12`. Two bouncy beats in under
  half a second dilute the slam.
- **Anticipation on the converge:** a 2–3 f compress-and-pause of the dots (scale 0.92, a 4–6 px move against travel)
  just before 0.74 makes the flight read as intended.
- **Sound** (`sonic_logo()`): ticks at the dot peaks, the whoosh's peak on the converge's peak velocity, `tash_hit` 4 ms
  before the snap, a pop on the shadda. In a full ad, **duck the music 10–15 dB for 0.2–0.3 s before the snap** and let
  the music resolve *before* the sting, or end it on the snap. The ticks are pitched ≈2.2/2.5/2.8 kHz (≈C#7, D#7, F7).
  If the track's key clashes, retune them (`tick(freq)`) to scale tones.
- **Dots as a device in client work:** use them as a bumper (dots-wipe, §2.4) or as a closing transition into the TASH
  tail, once or twice per piece. No permanent corner watermark that sits pinned through 3+ shots (that reads as HUD).

### 5.3 Client end-cards (fictional brands)
- The logo arrives through something in the ad: the product's last motion leads the eye to it (the cap lands where the
  mark sits; steam resolves into the mark's mask; the burger stack's top bun becomes the lockup's base line).
- Use one tagline at most, sized ≤ half the logo's width. Hold 1.0–1.4 s with one living thing. No "logo + tagline +
  button + URL" web-footer card.

---------------------------------------------------------------------------------------------------
## 6. Music and sound design to picture

### 6.1 Structure follows the edit
- Lock the picture first, then export `cues.json` (cuts, hero events, text holds) and compose to it. When timing
  changes, **re-place every SFX**. Pin each SFX relative to its shot start, not to an absolute time.
- The arrangement changes where the film changes: intro (sparse: ticks, mirwas tak, a filtered pad), build (group
  claps, shaker), the drop on the product reveal, a break of near-silence before the payoff, resolve on the client
  card, then `sonic_logo()`.
- **Hero hits: 1–3 per piece**, chosen by hand (the slam, the reveal, the name). A hit on every cut is a giveaway.
- **Silence before the hit:** drop the music 8–15 dB, or cut it, for 0.2–0.5 s before the biggest move.
- **Reading dips:** pull the music down 6–10 dB while a claim or offer is being read.
- Music must cover the whole cut with no silent tail, and resolve on the last grid unit before the end.
- **Sentence to reuse:** riser → impact → shimmer (setup, landing, afterglow). The riser's top sits exactly on the impact
  frame. Shorter risers (0.5–1 bar) feel modern; long risers feel like trailers.
- **Whoosh placement:** start it 3–4 f before the peak visual velocity so its loudest point meets the peak smear. Keep it
  0.3–0.5 s and light below 150 Hz: whooshes with >35–50% of their energy under 150 Hz read as a repeated boom and were
  rejected by clients.
- **Foley first:** real-world actions get their own sound (`spray`, `sizzle`, `pour`, `shutter`, `pop` for bubbles),
  trimmed to exactly the action's length. Use 3–5 SFX kinds per piece and reuse them. Avoid game-like bleeps and
  confirmation tones unless the piece is about a notification.
- **Repeated SFX** (cascades, ticks): alternate 2 variants, step the gain down along the sequence (e.g. 0, −1.5, −3 dB …),
  let the spacing follow the animation's acceleration, and fold into a single swoosh when it gets too dense.

### 6.2 Why synthesized audio sounds cheap, and the fixes
Clients in the motion-video-kit case studies rejected synthesized sine sweeps, sine ticks and synth "thocks" ("a pitched
tom"). The causes, with fixes in `tashaudio` terms:

| Cheap tell | Fix |
|---|---|
| Pure sine tones, static spectrum | **Layer every hit:** transient (1–5 ms band-passed noise, 2–8 kHz) + body (short pitched drop, 80–250 Hz, pitch envelope 2–3× falling over 20–60 ms) + air (high-passed noise >4 kHz, short, sent to reverb). Move the timbre: `svf_sweep` across phrases |
| Machine-gun repetition | **Seeded humanisation:** per hit pitch ±1–3%, gain −0 to −2 dB, timing ±4–10 ms (never on hero hits or cut-synced hits), alternating seeds and variants |
| Sub you can't hear on phones | Phones roll off below ~150–200 Hz. Add harmonics: `sat` on the 808 or bass (drive 1.5–3), or a parallel high-passed (150 Hz) saturated copy at −10 dB. Keep pure sub for 1–3 hero hits, and keep it short |
| Everything dry, or everything drowned | **Shared reverb sends on buses:** a short room (0.4–0.8 s) for percussion and a plate or hall (1.6–2.5 s) for pads and hits; pre-delay 10–25 ms; high-pass the return at ~250 Hz and low-pass at 6–8 kHz; sub and kick stay dry (`impact()` already does "sub dry, top wet") |
| Fake-wide or mono mush | Keep <150 Hz mono. Widen only high-passed content (Haas `width` on full-band material combs when summed to mono). Pan percussion ±0.2–0.4 |
| Harsh 2–5 kHz | `peak_eq(x, 3500, −2 to −4, q≈1.2)` on bright buses. Cap the 2–8 kHz lift of small SFX at ~+4 dB over the music |
| Clicks and endless tails | 5 ms fade-in on every first sample, ≥10 ms fade-outs, high-pass non-bass at 30–40 Hz, and an envelope on every sub (`sub_decay`) |
| Flat "wall of sound" | Loudness range ≥3 LU for energetic pieces. Sections and dips, not a constant bed |
| A loop that ignores the picture | Change the arrangement at turns, and drop elements under reading moments |

Regional colour: `claps_ensemble` (humanised 8–12 ms spread), `mirwas_dum` on strong beats with `tak` fills, and a 3–5
note Bayati (`nf('Ed4')`-style quarter-tones) or Hijaz motif on `pluck`, repeated with variation rather than looped.

### 6.3 Levels and loudness
- **Final:** −14 LUFS integrated, ≤ −1 dBTP (brief). The renderer applies single-pass `loudnorm=I=-14:TP=-1:LRA=9`, which
  can pump if the input is far from target. **Pre-master the WAV to −14 to −15 LUFS, true peak ≤ −1.5 dBTP, LRA 4–8 LU**,
  so loudnorm barely moves anything. `Mix.master()` limits **sample** peaks: at `ceiling_db=-1.0` a test mix measured
  −0.8 dBTP (inter-sample overs), so master with `ceiling_db=-1.5`. Check the WAV and the MP4 with `audio-check.sh`
  (always pass the spectrogram path; without it the script exits 1).
- **Relative levels:** hero hits +8–10 dB in-band over the music; small SFX +3–4 dB in-band; whooshes gentle (+2–3 dB);
  sounds within 0.15 s of each other ×0.6 so they don't stack.
- **Sidechain:** `duck_curve` from kick times on pad and bass: depth −4 to −8 dB, attack 4 ms, hold 30 ms, release about
  ¼–½ beat (≈0.12–0.25 s at 120 BPM).
- **Sync:** the hero transient must sit on the exact video frame (±1 f). AAC encoder priming (~1024–2112 samples) can
  shift the whole track by 0.5–1.3 f. Verify once per pipeline change with a one-frame flash and a click.

### 6.4 How to do it in our pipeline
```python
import sys, json, numpy as np; sys.path.insert(0, '/home/user/visitor-counter-api/tash/_system/audio')
from tashaudio import *
C = json.load(open('src/cues.json')); m = Mix(C['duration']); r = np.random.default_rng(42)
for k, t in enumerate(C['ticks']):                     # humanised, alternating, stepped down
    m.add(tick(2300 * (1 + r.uniform(-.02, .02))), t + r.uniform(-.006, .006), gain=db(-1.5 * min(k, 3)), pan=r.uniform(-.3, .3))
hit = C['hero']; m.add(impact(), hit, gain=0.9); m.add(impact(), hit, gain=0.25, bus='verb')   # send
m.process_bus('verb', lambda b: hp(reverb(b, decay=1.8, mix=1.0, pre=0.02, tone=6500), 250))
N = len(m.buf); g = duck_curve(N, [hit - 0.3], depth_db=-12, attack=0.05, hold=0.22, release=0.35)
m.process_bus('music', lambda b: b * g[:, None])       # clear the air before the hit (music added with bus='music')
m.master('src/audio.wav', ceiling_db=-1.5)            # then: _system/tools/audio-check.sh src/audio.wav spec.png
```

---------------------------------------------------------------------------------------------------
## 7. The critic: protocol and scorecards

### 7.1 Protocol (the Gauntlet, merged with motionmaxxing's gates and OpenMontage's critique rules)
1. **Separate builder and judge.** The review is done by a fresh agent or person who sees only the render (MP4 or PNG),
   the brief and this rubric, not the builder's reasoning or a list of "what I fixed".
2. **Look first, judge second.** Use a contact sheet at 2 fps, frames every 0.2 s, dense 1/30 s strips around **every
   cut**, and 6–10 full-size stills. **Describe every sheet frame in one sentence** (what's on screen, what's the hero,
   would it pass as a slide?). A frame you can't describe has no hero.
3. **Four looks:** *thumbnail* (25% scale: does anything read?), *cover* (hide the logo: could it be a competitor's
   ad? hide the text: is there still a picture?), *mid-change* (frames 2 before each cut: any blended half-states,
   blank or flash frames?), *real speed* (reading time, where it drags, where it rushes).
4. **Findings must be accurate, complete and constructive:** each one cites a timestamp or frame and region. After
   finding one problem, scan for the rest of its class. Every critical finding carries a concrete fix.
5. **Fix in this order:** untrue or broken → idea and clarity on mute → connections between shots → hierarchy and
   scale → timing → finish → sound polish. Don't tune easing while the idea is unclear.
6. **Verification round:** a *new* reviewer marks each prior item FIXED / PARTLY / STILL PRESENT, lists regressions, and
   ends with SHIP or ONE MORE PASS (≤3 fixes). Stop at the bar, or when the remaining items are sub-frame cosmetics.
7. Keep a short ledger in the report (round → top findings → change → measured result). Never write "verified" about
   your own film; quote the numbers.

### 7.2 Video: hard gates (any FAIL = rework, no score)
- [ ] Renders, decodes, correct length, 1080×1920 / 30 fps / H.264 / AAC 48 k, audio present
- [ ] Arabic correct: shaped, never split, RTL order, punctuation side, proofread twice; no clipped dots or shadda in masks
- [ ] Legal: `CONCEPT AD` + «إعلان تجريبي — علامة خيالية» in the tail and on the poster; no real brands or people;
      no invented claims, numbers or testimonials; original audio only
- [ ] Safe zones respected (top 220, bottom 420, sides 72; right-rail clearance in the lower half)
- [ ] No frozen stretch > 0.6 s except a designed breath (≤1.5 s, before a payoff) and the end hold (0.6–1.4 s per beat)
- [ ] No single black, flash or NaN frames; no unintended pops; no text-over-text in any frame, transitions included
- [ ] −14 ±1 LUFS, ≤ −1 dBTP, no clicks, no endless sub, no harsh 2–5 kHz build-up
- [ ] Brand: no glow, outer-glow or lens-flare spam; no lime text on paper; lime ≈10% and used as a signal
- [ ] Determinism: one frame rendered twice from different seek orders gives identical pixels

### 7.3 Video scorecard (0–4 per line × weight; **ship ≥ 80/100 with no line below 2**)
| # | Dimension | W | 4 = studio | 2 = acceptable | 0 = rework |
|---|---|---|---|---|---|
| 1 | Hook (first 1.5 s) | 10 | composed and moving at frame 0, event ≤0.5 s, readable muted | clear but slow or generic | logo, blank or fade-in start |
| 2 | Idea and ownership | 10 | only this (fictional) brand could own it; every shot "buys" something | coherent but generic | feature-tour slideshow |
| 3 | Picture: light, material, lens | 15 | screenshot-worthy hero frame; reflections tell the shape; one light logic | clean but CG-plastic | flat swatch grounds, grey default materials |
| 4 | Motion quality | 15 | role-specific eases, rare late overshoot, overlap, no dead frames, one blur grammar | mostly eased, a few floaty or linear moves | linear or fade-only, everything bounces |
| 5 | Edit rhythm and transitions | 10 | cuts on action, carried objects, shorten-then-linger, transitions with motives | hard cuts, some on rest | crossfades or preset spins everywhere |
| 6 | Typography (Arabic) | 15 | per-word choreography, RTL flow, clear hierarchy, timing ≥ formula, effective sizes met | correct but static or crowded | split letters, wrong order, unreadable |
| 7 | Sound to picture | 15 | 1–3 hero hits, silence before the peak, reading dips, foley, layered, −14 LUFS | music fits, SFX generic or over-dense | wallpaper loop, hit on every cut, cheap synth |
| 8 | Finish and consistency | 5 | one grade, grain and vignette constant, no banding | minor drift | mixed looks per shot |
| 9 | Ending | 5 | smaller than the peak, logo arrives by cause, holds 0.6–1.4 s alive, clean TASH tail | correct but static | web-footer card, fade to black, held too long |
Score = Σ (points ÷ 4 × weight).

### 7.4 Static design scorecard (posters, carousels, stories, brand guide; ship ≥ 80, no line < 2)
| # | Dimension | W | What a 4 looks like |
|---|---|---|---|
| 1 | Concept | 15 | one idea, grounded in the subject's materials and vernacular; not interchangeable |
| 2 | Focal point and hierarchy | 15 | the eye knows where to land in 0.2 s; ≤3 levels; 1.5–2× steps; boldness spent in one place |
| 3 | Layout and whitespace | 15 | 8 px rhythm, consistent margins (≥72 px), intentional alignment (RTL-first), nothing overlapping |
| 4 | Typography | 15 | correct Arabic shaping, roles honoured (Alexandria / Plex / Archivo / Mono), max 2 weights, optical Arabic–Latin match |
| 5 | Colour discipline | 10 | palette ratio held, contrast ≥4.5:1 body and ≥3:1 display, one accent with one meaning |
| 6 | Picture and craft | 15 | built light, material and texture rather than a flat swatch with text; pixel-clean edges at 100% |
| 7 | Copy | 10 | Kuwaiti, short, specific, no hype or invented claims; reads in one glance |
| 8 | Format fitness | 5 | exact size, safe zones, survives a 25% thumbnail and platform crops |
Hard gates as in §7.2 where they apply (Arabic, legal, brand, contrast).

### 7.5 How to do it in our pipeline
- `bash _system/tools/contact.sh v.mp4 sheet.png`; stills via `render.mjs --stills` at hook, each cut ±1 f, the peak and
  the end.
- Frozen stretches: `ffmpeg -i v.mp4 -vf freezedetect=n=-60dB:d=0.6 -an -f null - 2>&1 | grep freeze`.
- Black frames: `ffmpeg -i v.mp4 -vf blackdetect=d=0.03:pix_th=0.10 -an -f null - 2>&1 | grep black`.
- Cut list: `ffmpeg -i v.mp4 -vf "select='gt(scene,0.3)',showinfo" -an -f null - 2>&1 | grep pts_time`.
- Loudness: `bash _system/tools/audio-check.sh v.mp4 spec.png`. Spec: `ffprobe -v error -show_streams v.mp4`.

---------------------------------------------------------------------------------------------------
## 8. Static design quality (posters, carousels, stories, brand guide)

### 8.1 What makes a design look templated (delete on sight)
- A centred stack of headline + sub-line + button. A kicker or eyebrow label above every heading. "01 / 02 / 03"
  markers when the content isn't a sequence. Meta strings joined with middle dots. "→" appended to every CTA.
- Identical rounded cards with the same soft grey shadow and one radius everywhere. Gradient washes as decoration.
  Glassmorphism by default.
- A stat slide (big number + small label, centred). An accent on one word of every headline. ALL-CAPS labels
  everywhere. Ghost text at 3–9% opacity. Hairline rules and grids as decoration.
- A flat swatch with small text on it ("a card on a void"). Everything the same size and brightness. Four rendering
  styles in one frame.
- Our own risk: Ink + one lime accent + mono labels is a known generated look (§0). It has to be **earned** with the idea,
  the Arabic type and the craft. Keep slates rare, lime ≤10%, and put a real picture in the frame.

### 8.2 Principles that raise the work
- **Ground it in the subject.** Distinctive choices come from the client's world: materials (glass, paper, ceramic,
  grill steel), vernacular (Kuwaiti signage, souq stalls, diwaniya cups) and real product shapes. Write the concept as
  one sentence and 4–6 named hex colours before drawing.
- **Spend boldness in one place.** One memorable element; everything around it is quiet and disciplined. Before export,
  take one accessory off.
- **Picture over text:** about 90% visual, 10% essential words. If a claim needs more than 6 words, it becomes two frames
  or a picture.
- **Refine, don't add.** On the second pass, make what's there crisper instead of adding a new shape, filter or font.
- **Light, depth, texture:** even a poster has a ground with light, a material with texture (grain at ~0.03–0.05) and
  depth planes. A flat swatch is allowed only if the client brand is flat on purpose.
- **Numbers:** 8 px base grid; margins 72 px on 1080 widths (more for luxury: 96–120). Hero 120–170 px, body ≥34 px,
  labels 22–26 px; ≤3 type levels; 1.5–2× steps. Contrast ≥4.5:1 body, ≥3:1 large display. Text area under ~20% of
  ad canvases. One CTA.
- **Arabic + Latin together:** Arabic looks smaller at the same point size. Set Latin at ~85–92% of the Arabic size on a
  shared line and align by eye (x-height and letter body), not by bounding box. RTL alignment is the default anchor.
- **Brand guide pages:** show rules as do / don't pairs with real examples (e.g. clear space expressed in dot units,
  D = 24 px from `tokens.css`; minimum sizes; colour ratios as a proportional bar; type roles with live Arabic samples).

### 8.3 Format checks
- **Poster / feed post:** 1080×1350 (4:5) is the feed workhorse, with 1080×1080 as needed. The critical content sits in
  the central ~80%. The thumbnail test at 25% must still read the hero and the brand.
- **Story / Reel cover:** 1080×1920, text inside y 220–1500, right-rail clearance in the lower half, hero subject around
  y 0.40–0.55 H.
- **Carousel (1080×1350 per slide):** slide 1 is a hook with one idea; the last slide is the signature or CTA. Keep a
  shared grid with the same margins and anchor positions on every slide. Elements crossing slide edges (a panorama split
  exactly at 1080 px) reward the swipe. Order follows RTL swipe logic. Number slides only if it really is a sequence.
- **Concept-ad covers:** the `CONCEPT AD` slate and «إعلان تجريبي — علامة خيالية» are always visible (brief).

### 8.4 How to do it in our pipeline
Design static pieces as HTML at the exact pixel size using `tokens.css`, render with `render.mjs --stills` or the
same Playwright path, then inspect at 100%, 200% (edges, Arabic marks) and 25% (thumbnail). Process: tokens and an ASCII
wireframe → check the plan against §8.1 → build → score with §7.4 → refine (don't add) → re-score.

---------------------------------------------------------------------------------------------------
## Sources (read as reference only; nothing executed, no code copied)
- **Tejashmakwana/motionmaxxing:** `SKILL.md`, `references/motion.md` (measured durations, 12 eases, smear, camera),
  `type.md` (word cadence, reading time, emphasis), `transitions.md` (cut anatomy, handoffs, transition catalogue),
  `sound-sync.md` (phrase-level sound, hits, tempo-frame table), `close.md` (endings), `world.md` (light, ground,
  texture), `slop.md` (AI-default vs pro table, gates, four looks), `taste/edits.md`; `runtime/README.md` and
  `hero3d.js` comments (studio softbox recipe, tone mapping). → §0, §1.1, §2, §3, §4, §5, §6.1, §7.
- **echris6/motion-video-kit (business-motion-film):** `SKILL.md`, `motion-grammar.md`, `product-hero-realism.md`
  (measured curves, sub-frame blur, glints, PMREM leak), `three-js-patterns.md` (exploded layers, smootherstep),
  `audio.md` (synth rejections, whoosh energy, levels, back-timing), `quality-bar.md`, `gauntlet.md`,
  `critic-prompts.md`, `launch-film-notes.md`. → §0, §1, §3, §6.2, §6.3, §7.
- **Vincentwei1021/video-shotcraft:** `SKILL.md`, `references/aesthetic-rules.md` (hold ≥1 s, slow down, ≤3
  frame-level impacts, light effects once, no handheld, effective text height), `sequences/promo-energy-arc.md`,
  `sound-design.md` (riser→impact→sparkle, anti-machine-gun, AAC offset), shot cards `camera/crash-zoom-punch`,
  `tension-camera-moves`, `depth-layer-moves`, `effects/light-play-moves`, `transition/shot-transitions`,
  `transition-hidden-cut`, `rhythm/trailer-grammar-moves`. → §1.2, §2, §3.5, §6.1, §7.
- **calesthio/OpenMontage:** `skills/creative/short-form.md` (hooks, platform safe zones), `cinematic.md` (pacing
  rhythm, never the same length 3×), `sound-design.md` (levels, whoosh lead), `typography.md`, `core/color-grading.md`
  (one grade per piece), `meta/reviewer.md` (accurate, complete, constructive critique; slideshow risk),
  `meta/taste-direction.md`; `.agents/skills/hyperframes-creative/references/motion-principles.md` (vary eases and
  speeds, build/breathe/resolve). → §2, §3, §6, §7.
- **nolangz/pixel2motion:** `SKILL.md`, `references/twelve-principles-for-logos.md`, `motion-personality.md`,
  `reveal-patterns.md` (20:50:30, drag hierarchy, draw-on dash artefacts, final-frame contract). → §3.2, §5.
- **bangtutorial/bang-motion:** `references/anti-ppt.md` (anti-slide rules, transition menu, asymmetric in/out, whip
  edge reveal), `references/techniques.md` §1 (emphasis menu: none/pill/under/marker/box/colour/strike). → §2.4, §3.1, §4.
- **nextlevelbuilder/ui-ux-pro-max-skill:** `ui-ux-pro-max/SKILL.md`, `references/pro-rules.md`, `banner-design`,
  `design/references/social-photos-design.md`, `brand/references/consistency-checklist.md` (contrast, 8 px rhythm,
  2 fonts, one CTA, safe areas, formats). → §8.
- **anthropics/skills** and local `/mnt/skills`: `frontend-design` (AI-default traits, spend boldness once, remove one
  accessory, ground in the subject), `canvas-design` (visual-first, craftsmanship, refine not add), `algorithmic-art`
  (seeded generative systems), `brand-guidelines` and `theme-factory` (palette and type discipline as a system),
  `examples/video-making` (look at full-size frames before the full render). → §0, §8, §7.
- **iart-ai/motion-skills:** index plus `tools/verify` (freeze, tile, assert the encoded spec); the individual skill
  packs were not in the clone. **zhuyansen/awesome-claude-video-skills:** used only as a map of the field. → §7.5.
