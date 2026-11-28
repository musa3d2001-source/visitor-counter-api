# TASH boost ad: asset inventory (what we can legally and technically put in the film)

> **Owner's direction (9 Nov 2026):** the launch ad («هذا منتجك. / وهذا إعلانه.», `04-launch-ad/`) is **already posted**.
> This boost ad must be a **new ad from scratch with a new idea**, built primarily **in code** (Three.js 3D, canvas/SVG motion graphics,
> kinetic Arabic type, procedural sound), or however the team judges strongest. Do **not** re-cut the launch ad or reuse its idea/lines.
> The footage below is optional seasoning only (e.g. a 0.3 s flash of real work), never the backbone.
>
> **Owner's follow-up (same day): "look at the MOR ad and the others for ideas, you decide."** Then: **"MOR café belongs to my
> friend; he agrees, use it normally."** Decision (strategy lead), superseding the earlier "MOR stays out":
> - **MOR may appear** (owner reports MOR's owner consents). The owner is asked to keep that consent **in writing** (e.g. a WhatsApp
>   message), since Meta/TikTok can ask for proof of rights to a third-party trademark.
> - **Label it truthfully:** «سوّيناه لمقهى مور» + `@morkwt`. Never «عميلنا» / "client", never imply it was paid or commissioned
>   (it was a spec ad; MOR approved its use). Use MOR's own approved film `09-pitch-mor/MOR-spec-ad-9x16.mp4` and its sources
>   (`09-pitch-mor/src/`, conformed footage, keyed logo layers). Mind the known AI flaws in its SCRIPT.md (the sign's "O"; the
>   softened micro-Arabic on the cups).
> - (Superseded: "MOR content stays OUT of the paid ad … only with MOR's written approval.")
> - **specialty dose (@sdosecafe, Al Jahra) also consents** (owner, same day). Its spec story ad already exists:
>   `tash/10-spec-dose/` (`DOSE-spec-story-9x16.mp4`, 18 s, v3; idea «ناقصك دوز.» with a mood battery 15 % → 100 %; footage
>   `footage/ai/d1_grinders, d2d_carafe, d3_iced, d4_cake, d5b_terrace`; keyed mark; read its `SCRIPT.md` for clean ranges and
>   known flaws). Same labelling rule as MOR: true wording such as «سوّيناه لسبيشلتي دوز» + `@sdosecafe`, never "client".
>   The owner is asked to keep both consents in writing.
>
> **Hard project rules that bind this ad** (`tash/HANDOFF.md`, owner decisions):
> - **Contact is DM only**: no WhatsApp, no phone number, no contact buttons. CTA = «اطلب إعلانك بالخاص» / «دزّ لنا بالخاص».
> - Handles: Instagram **@tash.creative.kw**, TikTok **@tash.creative**. Use «على» with platforms («تابعونا على الإنستقرام»), never «بال…».
> - **Owner-approved prices (7 Nov):** a product ad image KWD 10 (one revision); a vertical reel/story up to 15 s **starts at KWD 40**
>   (idea, editing, suitable audio, two revisions); final video price confirmed after scope. Any price on screen must say «يبدأ من».
>   No rush fees or turnaround promises.
> - Owner's working rule: act as a real director; decide craft yourself; ask the owner only about money or facts.
> - Claude never logs into or posts to the owner's accounts.
> - **Borrow MOR's method, not its content:** the brand mark IS the story; the film opens and closes on the same shape (in through the
>   keyhole, out through the keyhole). For TASH, our own mark and its three dots (•••) can carry that role.
> - **The concept ads (LAYL / STAKK / HABBA) may appear as fast proof-of-craft flashes**, labelled as concept work on screen. For a new
>   studio with no clients or testimonials, showing the work is the strongest trust signal.

Every row is something that exists in the repo **today** and is cleared for TASH's own public ad. **No new footage can be generated**
for this ad: Higgsfield credits are the owner's and only the CD generates. Everything else (type, motion graphics, 3D in Three.js,
UI, sound) we build in code with the pipeline in `tash/_system/` (`render.mjs`, `kit.js`, `endcard.js` / `createSting`,
`tashaudio.py`).

4 fps contact strips of every clip: `tash/review/boost/inventory/*.jpg` (overviews: `_people.jpg`, `_burger.jpg`, `_coffee.jpg`).
Source clips are 24 fps and ~5.04 s (121 frames), conformed to 30 fps JPEG sequences by frame index (see `09-pitch-mor/src/tools/conform.py`).

## A. People (AI, Higgsfield → Kling 3.0, CD-approved ranges) — `tash/04-launch-ad/footage/ai/`
| clip | what | approved range | best beat / notes |
|---|---|---|---|
| `s1_hook` | office, flat fluorescent light; a hand in a white dishdasha sleeve photographs a plain unlabeled perfume bottle with a phone | 0.00–1.80 | the "ordinary phone photo" (the BEFORE). The thumb tap is subtle; sell it with a shutter blink + click |
| `s2_diwaniya` | diwaniya at night, three young men, one shows his phone (back to camera), one points and laughs | 0.25–3.25 | 1.75–2.75 the middle man grins at the phone |
| `s3_cafe` | sunlit café, two young women in abayas, one shows her phone, the other laughs behind her hand | 0.00–4.00 | 0.75–2.25 |
| `s4_car` | night, parked car, young man in ghutra reads his phone, smiles, types a reply | 0.50–3.75 | he is *typing* → bridge into the typing bubble (•••) |
| `s5_owner` | evening, small oud & perfume shop: the owner glances at his phone on the counter as it lights up, quiet proud smile, incense smoke | 0.00–4.50 | the business owner = our audience. Emotional button, or graded down behind a CTA |
Rules: never show or fake phone-screen contents; 0.8–1.0× speed; no speed ramps that expose AI motion; inspect hands/faces at full size; no names, no "real reactions" claims.

## B. STAKK burger (fictional brand, photoreal AI) — `tash/05-concept-ads/02-burger-stakk/footage/ai/`
`b1_smash` gloved press smashes a raw ball on a griddle (contact ≈ f29 / 1.2 s), steam · `b2_crust` top-down lacy seared crust, fat bubbling ·
`b3_heel` red stage: bun heel, patty falls in (lands f21), cheddar slice falls (lands f83; f79–82 are an AI ghost, never show) ·
`b4_melt` cheddar folding over a lacy edge, drip · `b5_stack` double stack, pickles then onion rings fall (pickle lands f54; from f58 a ring hovers, AI) ·
`b6_sauce` top-down on red: sauce stream, contact f21 · `b7_crown` sesame crown falls onto the stack (lands f19), hero.
Do NOT use `b1_smash_v2/_v3` (no notes or job ids). The finished film: `STAKK-concept-9x16.mp4` (13.8 s); `src/index.html?clean=1` renders it with no type.
Must carry «إعلان تجريبي — علامة خيالية» / `CONCEPT AD` when shown.

## C. HABBA specialty coffee (fictional brand, photoreal AI) — `tash/05-concept-ads/03-coffee-habba/footage/ai/`
`k1_blinds` cup + saucer, bars of sun on walnut · `k2_steam` steam curling through a sun bar · `k3_pour` top-down latte-art heart forms (stream breaks 3.896 s) ·
`k4_beans` beans falling in slow motion against a sunlit wall · `k5_hero` low hero of the cup, limewash wall. Film: `HABBA-concept-9x16.mp4` (15.6 s), `?clean=1` available.
Must carry the concept label when shown.

## D. LAYL perfume (fictional brand, 100 % Three.js — ours, no AI) — `tash/05-concept-ads/01-perfume-layl/`
Glass bottle, gold cap, dark-field studio, orbit, spray mist, wire → clay → final BTS passes. Film: `LAYL-concept-9x16.mp4` (15.9 s).
The scene is code (`src/scene.js`, `shots.js`): it can be re-rendered from any camera (≈1–2 s/frame). Concept label required.

## E. TASH's own film and system
- `04-launch-ad/TASH-launch-9x16.mp4` (27 s): «هذا منتجك. / وهذا إعلانه.», the 3D ring shot (`src/built/ring/`), storyboard sketches,
  the editor-UI shot, formats shot, the phone + chat bubbles, the CTA reply bubble. Its source is reusable.
- Brand: `_system/brand/logo.mjs` (wordmark, dots), `_system/motion/endcard.js` (`createSting`: typing bubble → dots → ش → طشّ), sonic logo
  (`tashaudio.sonic_logo()`), tokens (ink #0B0B0B, paper #F5F5E9, lime #C6FF00), fonts (Alexandria, IBM Plex Sans Arabic, Archivo, JetBrains Mono).
- Copy: `06-copy/voice-and-tone.md`, `06-copy/cta-bank.md` (58 tested lines, e.g. «هذا منتجك. وهذا إعلانه.», «لا تطوّف… شوف الفرق.»,
  «مشروعك حلو… بس محد يسولف عنه؟», «ما مسكتهم أول ثانية؟ راحوا.», «خلّ إعلانك علينا.»), `06-copy/instagram-profile.md` (WhatsApp link, pre-filled «هلا طشّ، عندي مشروع وأبي إعلان.»).
- Audio engine `_system/audio/tashaudio.py`: claps_ensemble, mirwas, tabl, pluck (oud-ish), 808, pads, foley (pour, sizzle, spray, shutter, whoosh, impact, tash_hit…).

## F. NOT allowed
- ~~`09-pitch-mor/` never on our account~~ → now ALLOWED with MOR's consent (see the top), labelled «سوّيناه لمقهى مور», never as a paid client.
- Any new AI generation, stock footage/music, real brands/logos, platform UI logos (generic phone/chat UI only), real people's names.
- Invented clients, testimonials, numbers, "best in Kuwait", guarantees of views/sales. Prices only if the owner approves `07-ops/04-pricing.md` (marked provisional).
