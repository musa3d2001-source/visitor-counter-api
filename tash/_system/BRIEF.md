# TASH / طشّ — Production Bible (read fully before producing anything)

You are part of the in-house team of **طشّ | TASH Creative**, a new Kuwaiti ad-production studio.
We make the ad itself — idea → script → production → delivered file. We do **not** manage accounts, post for clients,
run paid campaigns, sell followers, or promise sales/views. Never show or imply services beyond:
1) ad videos, 2) social ads (Reels/TikTok/Stories), 3) ad design (posters/visuals), 4) ad ideas & scripts, 5) motion graphics & editing.

Goal: when a Kuwaiti business owner opens @tash.creative.kw they think: «أبي نفس هالمستوى حق مشروعي. شلون أطلب؟»
The work itself is the proof. Quality bar = a real studio reel, not "someone using AI tools".

> **Also read `tash/_system/CRAFT-ADDENDUM.md` (if present)** — a distillation of the best community skills
> (Anthropic official skills, video-shotcraft, OpenMontage, ui-ux-pro-max, motionmaxxing, motion-video-kit, …):
> product-shot vocabulary, edit grammar, motion principles, Arabic kinetic type, sting craft, sound-to-picture,
> and the critic rubric. Apply it; the rules in this bible still win where they differ.

> **AI footage (owner-approved exception to §3.5):** the owner subscribed to Higgsfield and approved photoreal AI footage
> for (a) the launch ad's people/hands shots (`tash/04-launch-ad/footage/ai/`) and (b) the STAKK burger and HABBA coffee
> concept ads, after the owner judged their CGI "cartoonish, not real" (`tash/05-concept-ads/{02-burger-stakk,03-coffee-habba}/footage/ai/`).
> Only the CD generates (the credits are the owner's); teammates never call Higgsfield. Before editing, read the folder's `_CD-NOTES.md`:
> it gives event times, usable ranges, flaws and the credit line. Type, edit, sound and the TASH signature stay ours.
> **Real-brand exception (owner request): `tash/09-pitch-mor/`** is a *spec pitch* ad for MOR «مور», a real café, made to be shown
> to MOR. It is not client work and must never read as commissioned: keep the spec slate, invent no facts, and see `09-pitch-mor/BRIEF-MOR.md`.

---------------------------------------------------------------------------------------------------
## 1. Brand idea (the thing every piece must express)

**Tagline:** «طشّ… خلّهم يسولفون عنك!» — *make them talk about you.*

**The big idea — "the three dots".** The three dots of the letter ش in our logo are drawn as a perfect row of circles:
the universal **"typing…" indicator** (•••). Static, the logo reads correctly as طشّ. In motion the dots bounce
right→left like someone typing — *people are talking about you*. The dots are our ownable device:
- the **sting**: a chat bubble with typing dots → dots fly into the ش → the word slams in → «خلّهم يسولفون عنك!»
- bullets, loaders, separators, transitions (dots scale up to wipe the frame), watermark.
Use the device with intent — once or twice per piece, not sprinkled everywhere.

**Secondary device — "the slate".** Small mono labels (JetBrains Mono, uppercase, tracked) like a film slate / timecode:
`CONCEPT AD — 01 / PERFUME`, `TASH / 2026`, `SC 03 · TK 1`. It says *production studio*. Keep it small and sparse.

**Personality:** confident, witty, Kuwaiti, craft-obsessed. Clever > loud. Restraint is luxury.

---------------------------------------------------------------------------------------------------
## 2. Identity system (already built — reuse, do not reinvent)

- Tokens: `/_system/tokens.css` (colours, fonts, scale, safe zones). Logo builders: `/_system/brand/logo.mjs`
  (`wordmarkSVG`, `wordmarkInner`, `lockupHorizontalSVG`, `lockupStackedSVG`, `symbolSVG`, `avatarSVG`, `dots()`).
- Exported logos: `tash/02-logo/` (svg/png/avatar). Sting: `tash/02-logo/motion/` (+ `src/sting.html`).
- **Colour:** Ink `#0B0B0B` · Paper `#F5F5E9` · Lime `#C6FF00` · Smoke `#8E9088` · Char `#1A1A18` · Line `#2C2C29`.
  Ratio ≈ Ink 60 / Paper 25 / Lime 10 / rest 5. Lime = signal: dots, one key word, a CTA, a wipe. **Never lime text on paper**
  (contrast 1.1:1). **No neon glow, no outer-glow, no lens-flare spam, no gradients-on-everything.**
- **Type (all OFL, commercial-safe):** Arabic display **Alexandria** 600–900 · Arabic text **IBM Plex Sans Arabic** 400–700 ·
  Latin display **Archivo** 800–900 with `font-stretch:125%` · labels **JetBrains Mono** 500–700 uppercase `.24em`.
  Never letter-space Arabic. Never fake-bold/italic Arabic. Max 2 weights per layout.
- Concept ads for fictional clients use **the client's own palette/type** — TASH branding appears only in the closing
  signature + the "CONCEPT AD" slate. That proves we design *for the client*, not just ourselves.

---------------------------------------------------------------------------------------------------
## 3. Hard rules (any violation = rework)

1. **Arabic correctness.** Text must shape correctly (rendered by Chromium from real fonts — never images of text from
   generators). Animate Arabic per **word** or per **line** (mask, translate, opacity, blur). **Never split Arabic into
   letters.** RTL everywhere; check punctuation (، ؟ !) sits on the correct side. Proofread every string twice.
2. **Kuwaiti dialect** for marketing copy — natural, smart, short. Examples of tone: «خلّ إعلانك علينا», «شلون أطلب؟»,
   «وايد», «الحين», «يسولفون», «مو بس…», «على مهلك». Avoid stiff MSA clichés («نقدم لكم أفضل الحلول المتكاملة»),
   avoid fake hype words («الأفضل في الكويت», «رقم ١»).
3. **No fabrication.** No invented clients, testimonials, reviews, follower counts, view numbers, "+500 clients", awards,
   or results. Dramatised chat bubbles inside an ad («منو مسوي هالإعلان؟») are fine — no names, no numbers, no claims.
4. **Concept work is labelled.** Every concept/demo ad shows a visible slate: `CONCEPT AD` + «إعلان تجريبي — علامة خيالية»
   at least in the final seconds (and on its poster/cover). Fictional brands only. No real logos, real products,
   real restaurant names, real people, celebrity look-alikes, or trademarks (no Apple UI, no Instagram/TikTok logos —
   generic phone/chat UI only).
5. **Licensing.** Only our OFL fonts, our own code-generated visuals, and our own synthesised audio (`_system/audio`).
   No downloaded stock footage, images, music or SFX. No paid AI generators, except the owner-approved Higgsfield footage named
   in the note at the top (CD-generated only, credited in each SCRIPT.md).
6. **Determinism.** Video pages must be pure functions of time (see §5). No CSS animations/transitions, no `Math.random()`
   (use `rng(seed)` from kit.js), no real-time clocks.
7. **Do not edit `/_system/`** (shared by parallel teammates). Extend locally in your own `src/` folder. If you find a real
   bug in `_system`, work around it locally and mention it in your final report.
8. **Do not run `git` commands.** The lead commits.
9. Don't claim anything you didn't produce and verify. If something falls short, say so in your report.

---------------------------------------------------------------------------------------------------
## 4. Craft standards

**Video (9:16, 1080×1920, 30fps, H.264, AAC 48k):**
- Hook inside the first **1.5 s** — a visual question, a contrast or an impact. No logo intros at the start.
- Every shot has a job; average shot length 0.6–2.0 s for energetic pieces, 1.5–3 s for luxury/mood pieces.
  Constant subtle motion (camera drift, parallax, light movement) — no dead frames.
- Transitions with purpose: match-cuts (shape/rotation/colour), the dots-wipe, light-sweep wipes, whip-pans with
  directional blur, hard cuts on the beat. Not random spins, not glitch spam.
- Text: max ~6 words on screen at once; on screen ≥ 0.9 s per 3 words; inside reel safe zone (top 220 px & bottom 420 px
  kept clear of key text; side margins 72 px). Sizes: hero 120–170 px, support 44–60 px, labels 22–26 px.
- Film finish: subtle grain (kit.js `grain`, opacity ≤ .06), gentle vignette, consistent colour grade per piece.
- End: the TASH signature. For concept ads use a ~2.2–3 s tail: client end-card → `CONCEPT AD` slate + TASH wordmark
  small + «إعلان تجريبي — علامة خيالية». Import `createSting` from `/_system/motion/endcard.js` (you may call
  `render(t)` with your own offset, or build a shorter variant locally that keeps the same dot behaviour).
- Export a `poster.png` (best frame / designed cover 1080×1920) and a `contact-sheet.png` per video.

**3D (Three.js, `/_system/vendor/three/`):** import map: `{"three":"/_system/vendor/three/three.module.min.js","three/addons/":"/_system/vendor/three/addons/"}`.
- Premium product look comes from **lighting**, not geometry: build your own studio environment (emissive strip/softbox
  panels rendered via `PMREMGenerator.fromScene`) to get long clean reflections; add rim lights; dark seamless sweep
  or reflective floor; ACES tone-mapping; `MeshPhysicalMaterial` (transmission/thickness/ior/attenuation for glass &
  liquid; clearcoat; sheen for fabric). Use LatheGeometry/ExtrudeGeometry/curves for believable product shapes.
- Labels/branding on 3D products: draw to a `CanvasTexture` with real fonts (wait for `document.fonts.ready`).
- Render cost ≈ 1–2 s/frame for heavy glass at 1080×1920 with SwiftShader. Plan shots accordingly; test with stills.
- Camera language: slow push-ins, orbit arcs, macro rack-focus feel (fake DOF via blur passes or layered depth),
  low-angle hero shots. Motion blur may be faked by accumulating sub-frames when it matters.

**2D/motion:** SVG/Canvas/DOM. Kit helpers: `/_system/motion/kit.js` (`E` easings, `tw`, `spring`, `typing`, `words`,
`reveal`, `headlineIn/Out`, `grain`, `rng`, `boot`, `css`). Prefer expo/back/spring easing; overshoot sparingly.

**Audio (original — `/_system/audio/tashaudio.py`):** `Mix`, `Grid`, instruments (`kick`, `sub808`, `clap`,
`claps_ensemble` (Khaleeji group clap), `mirwas_dum/tak` (Kuwaiti hand drum), `tabl`, `hat`, `shaker`, `snare`, `rim`,
`pluck` (oud-ish Karplus-Strong), `pad`, `bass_synth`, `bell`), SFX (`tick`, `pop`, `whoosh`, `riser`, `downlifter`,
`impact`, `tash_hit`, `shimmer`, `spray`, `sizzle`, `pour`, `shutter`, `tape_stop`), processing (`reverb`, `compress`,
`limiter`, `duck_curve`, `lp/hp/bp`, `svf_sweep`, `sat`), pitches `nf('D3')`, quarter-tones `nf('Ed4')` (Bayati).
`sonic_logo()` = the TASH signature audio aligned to `/_system/motion/endcard-cues.json`.
- Write your own `src/audio.py` that imports the engine (`sys.path.insert(0, '<abs path>/tash/_system/audio')`).
- Music must be composed to the edit: hits on cuts, risers into reveals, silence used deliberately.
  Kuwaiti/Khaleeji flavour where it fits (claps, mirwas, Bayati/Hijaz motifs) blended with modern production.
- Check with `/_system/tools/audio-check.sh file.mp4 spec.png`: final ≈ −14 LUFS, true peak ≤ −1 dBTP, no clicks
  (vertical lines in the spectrogram), no endless sub tails, no harsh 2–5 kHz build-up.

---------------------------------------------------------------------------------------------------
## 5. Pipeline & commands (all paths relative to `tash/`)

- Page contract: `window.TASH = {width,height,fps,duration,ready,seek(t)}` — call `boot({...})` from kit.js.
  Absolute URLs like `/_system/...` work because the renderer serves `tash/` as web root.
- Stills: `node _system/tools/render.mjs --page <dir>/src/index.html --stills 0.5,2,4.25 --stills-dir review/<name>`
- Video: `node _system/tools/render.mjs --page <dir>/src/index.html --out <dir>/<name>.mp4 --audio <dir>/src/<audio>.wav --workers 2`
  (use `--workers 2` for 3D, up to 3 for light 2D). Muxing applies loudnorm −14 LUFS automatically.
- Live preview in a browser: open the page with `?play` or `?t=3.2` (needs the static server; the renderer starts one).
- Contact sheet: `bash _system/tools/contact.sh <video.mp4> <out.png>`; look at it, and open key stills at full size.
- Python: `python3` has numpy, scipy, PIL, fonttools, uharfbuzz. Node 22 + Playwright (Chromium) + FFmpeg 6.1.
- Put scratch files in `tash/review/<your-name>/` (git-ignored). Deliverables in your assigned folder only.

---------------------------------------------------------------------------------------------------
## 6. Self-review protocol (do this before you report)

Watch your own output as a hostile creative director would:
1. Contact sheet at 2 fps + 6–10 full-size stills — is every second worth watching? Any dead/empty frames, popping,
   jitter, aliasing, banding, text collisions, cut-off Arabic, wrong RTL order, misplaced punctuation?
2. Would a stranger understand the message with sound off? Is the hook in 1.5 s? Is the end memorable?
3. Does it look like a studio made it — or like a template? Remove anything generic. Simplify.
4. Brand check: palette ratios, type roles, no glow, lime used as signal only, safe zones respected.
5. Legal/truth check: concept labels present, no fake claims, no real brands, original audio only.
6. Fix, re-render, re-check. Iterate at least twice on anything below the bar.
Report honestly: what was made (paths), what you checked, what's still weak.
