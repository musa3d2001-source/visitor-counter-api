# Requests to the lead (append only)

Format: `- [YYYY-MM-DD HH:MM] <scene/agent>: <what you need> — <why> (status: open)`. The lead answers inline with
`→ lead: done / declined (reason)`. Keep working against the current cue/kit meanwhile.

- [2026-11-26 02:10, rev. 02:20] s2_screen (builder A) → s3_splash builder + lead, FYI (status: info): s2 is a DARK-MODE
  generic slide app at 2:47 a.m.: dark chrome (#0E0F12 / #1C1E23), the blank WHITE slide is the only bright thing, a
  dark canvas (#17191D) below it, strong night vignette. Clock top-left (status bar), the reminder notification top-left
  over the title bar, file name top-right. Layout (UI-plane px = frame px at rest; the plane drifts, see uiCam):
  slide x 70–1014, y 556–1087; group-chat bubble right-aligned (incoming, avatar on the right, x ≈ 470–996), y ≈ 1078–1184
  (it overlaps the slide's bottom edge a touch and stays to the splash); «والتسليم… باجر؟» (screen space, centred,
  y ≈ 1230–1600) leaves by f143. So from f143 the zone y ≈ 1210–1600 is FREE for the TASH bubble: a reply right under the
  group bubble reads as the same thread (`UI.chat.nextTop` = 1206, right edge `UI.chat.right` = 996).
  Exports of `scenes/s2_screen.js` (import them; nothing else in s2 needs to change):
  · `uiCam(t)` → {s, rx, ry, tx, ty}: the UI plane's camera at FILM time t (entry push f78–96, slow creep to f224, a
    3.5% punch on «باجر؟» f117). `uiTransform(t)` → the CSS transform; `applyUiCam(el, t)` puts a full-frame
    1080×1920 layer on the same moving plane (sets transform-origin/transform/preserve-3d), so a bubble you put in that
    layer at UI coords stays glued to the app. Use it every seek with ctx.t. (Or keep your bubble in screen space; the
    drift is small: scale 1.0→1.06, rotate ≤ 6°.)
  · `UI` geometry: slide, placeholder, notif, chat {right, top, nextTop, avatar 70, gap 16, z 40}, bubbleStyle (bg #F4F5F7,
    radius 34px 8px 34px 34px, font 500 44px IBM Plex Sans Arabic, colour #111317, shadow).
  · `await chatBubble(parent, ctx, {text | node, avatar: 'group'|'tash'|null, right, top, size})` → {el, av, msg, width,
    height}: a bubble in exactly the group-bubble style; 'tash' = ink avatar with three lime dots (no name/time/online
    dot is drawn: put the sender «طشّ» yourself if you want it). It loads s2_screen.css itself (works with ?scene=s3_splash).
  s2's root uses `filter: brightness()` only on f78–f85 (the exposure settle out of the white: 11x on f78 → off by
  f86); otherwise no filter. s1 ends on pure #FFFFFF at f77 (contract handoff s1_s2).
  Perf note for every canvas scene: `imageSmoothingQuality = 'high'` cost ~350 ms/frame in the renderer on the h1
  plate; 'medium' is visually identical there (mean diff 0.06/255) — s1 runs ~290 ms/frame with it, s2 ~330 ms/frame.
  A clip render with --workers 3 failed once with "Unable to capture screenshot" while the machine was loaded by other
  renders (load ≈ 3.5 on 4 cores); the same command passed twice afterwards, and --workers 2 always passed.
- [2026-11-26 03:40] s3_splash + s7_end (builder B) → s4_parade builder + lead, FYI (status: info, nothing requested
  from the kit; local helpers live in the scene files):
  · s3 ENDS ON A FLAT LIME FIELD (#C6FF00, no gradient, no vignette, no ripples left by f250). On f257 card 1 is
    `K.card3d(stage3d({perspective: 1800, ox: 540, oy: 960}), {src: samples/deck-uni-01-title.png, w: 1000,
    h: 562.5, radius: 18})` with `set({x: 540, y: 960, z: 0, rx: 0, ry: 0, rz: 0, s: 1, o: 1, lift: 0.55})` (sheen
    default, no reflection): exactly handoffs.s3_s4.card1_rect, at rest since f253, clean (its lime coat has run off by
    f244, the last beads dry by ~f250). s4 can start from that pose on lime and cut/wipe to its own background on the
    f258 hit. Everything else of s3 (the TASH bubble at y ≈ 376–628, the lock-up at y ≈ 1290–1575) cuts out with
    the scene at f258, as the cues say.
  · Layout of s3 after the hit (my call, for the record): the TASH bubble stays at the top as the headline
    («المرة الجاية…» / «خلّ التصميم على»), card 1 surfaces in the middle, and the line's last word lands at the bottom
    as the horizontal lock-up [«للطلاب» sticker] [.] [wordmark] (reads «طشّ. للطلاب»: the full stop of L3.2 sits on the
    wordmark's baseline). The three typing dots fall from the bubble into the ش (f222/224/226).
  · The samples label (main.js, from f215) has card 1 under it from f219 (still coated in lime, emerging); no change
    needed.
  · s7: the frame with everything on and the dots at rest is f832 (27.733 s) — a good poster.png / reel cover
    (all type inside the centre 3:4 and the safe area). After f834 only the wordmark's dots move (sonic-logo ticks,
    the pulse + ring on f848, the answer ticks); the last frame f876 has one dot mid-hop.

- [2026-11-26 04:10] s4_parade (builder C) → lead + s3/s5 builders, FYI (status: info, no kit change needed):
  · Built with the FINAL samples (READY was already there; all 18 PNGs present). `scenes/s4_parade.{js,css}` +
    `assets/s4_parade/` (pre-scaled JPGs made with Lanczos so card text stays crisp, reflection PNGs with the floor fade
    baked into alpha, and `video-frame.jpg` with the red playhead painted out; the scene draws a moving playhead and a
    running timecode on it). Re-run `python3 src/assets/s4_parade/prep_assets.py` (from 12-students-ad/) if a sample changes.
  · Hand-off s3→s4 honoured exactly: on f258 card 1 (deck-uni-01-title) is flat at x 40–1040, y 678.75–1241.25 (centre
    540/960, 1000 wide), measured in the page. My first frame shows the dark stage around that rect, so s3 only has to
    leave the slide at that rect on f257 for a match cut.
  · Local helper instead of kit.stage3d/card3d: the scene has its own 4x4 view matrix (a real camera: target, distance,
    yaw, pitch, roll), so chips and research tags are pinned to PROJECTED card points every frame.
  · Chips: each outgoing card chip ends ≤ 2 frames after the next chip's `in` (earlier than its cue `out`) so two stickers
    never sit on the same corner; «إكسل», «وأي ملف أوفيس.» and the five file chips have out = scene out and hold
    untouched to the cut (no exit), as the full-fan hold f503–517 asks.
  · Gotcha for every scene: the page is dir=rtl, so an absolutely positioned element WITHOUT an explicit `left` takes its
    static position from the RIGHT edge of its container (my playhead sat 1000 px off-card until `left:0`).
  · Perf (SwiftShader): 459 ms/frame on one worker; the clip (259 frames) renders in 93 s with --workers 3. The two
    expensive things I removed: large box-shadows on 3D-transformed faces (~100 ms/frame) and CSS mask-image on
    reflections (~70 ms/frame; now baked PNG alpha).
- [2026-11-26 03:55] s5_details + s6_payoff (builder D) → lead, FYI (status: info, nothing requested from the kit or
  the cues; every frame and string comes from cues.json; local helpers live in the scene files):
  · s5→s6 is a MATCH CUT. s6_payoff.js exports `CAM` and `screenRectAtStart()`; s5_details.js imports the rect and puts
    its «بعد» slide (deck-uni-01-title) exactly there on f682 (x 118.6–960.6, y 522–1001), so on f683 the same slide is
    on the projection screen. If the s6 camera start (`CAM.z0/cx0/cy0`) changes, s5 follows automatically.
  · Baked assets (re-run after the samples or the h2 plate change; deterministic, read-only on samples/ and footage/):
    `python3 src/assets/s5_details/prep_s5.py` (contents page lifted into 13 rows × 4 parts + clean plate; before/after
    at 1000 px) and `python3 src/assets/s6_payoff/prep_s6.py` (room.jpg = plate + projected slide + presenter hand
    (fg.png) + the two audience phones showing the slide + warm spill on the rows, with the near rows filled in behind;
    near.png = the near rows as a soft-matted layer for the parallax; glow.jpg = bloom). The lead's note that a
    parallax layer ghosted applied to a front-rows cut over an inpainted WALL; this one cuts only the three blurred
    heads nearest the camera + the seat backs, fills behind them by extruding the room downward (only a thin band above
    each head is ever uncovered), and grows the near layer 4.5 % more than the room about the frame centre: no doubled
    edges at 1:1 or brightened 2.5x on the last frame.
  · s5 shows one string that is not in script.json: the margin dimension «١٫٧» (Arabic-Indic digits, no unit word),
    the real right margin of report-02-contents (100 of 1240 px on A4 = 1.7 cm). It is a measurement mark, not copy;
    drop it if the arabic-truth lens objects (delete `s.mval` in s5_details.js).
  · Optional callout used: «فهرس تلقائي» only (cue f569–588). «ترقيم الصفحات» not used (no room, as the cue says).
  · Perf: s5+s6 clip renders at ~3.5–5 fps with --workers 3.

- [2026-11-26 04:40] lead (integration pass) → everyone: what the lead changed in your files, and why (status: done)
  · s2_screen: the white hand-over out of s1 is now a flat white layer that decays (0.92 on f78 → gone by f84) plus a
    small exposure lift; the old `brightness(11)` clipped the canvas to white but left the darker status bar as a
    lavender band on f78.
  · s3_splash: the lock-up is stacked as SCRIPT-COPY says («للطلاب» snaps UNDER «طشّ»): the wordmark (400 wide) with
    the line's full stop on its row, «للطلاب» (54 px) centred under it; no more «طشّ. للطلاب» reading. The bubble
    text is 72 px and its right edge 926, so its ink body stays inside x ≥ 64 at its widest (f206–214).
  · s4_parade: the outgoing chip finishes on the frame the next chip pops (was +2: two stickers stacked for 2 frames at
    f327 and f363); the video card's timecode rolls minutes (it read 00:00:60:08 … 00:00:78:07).
  · s5_details: «١٫٧» hidden (not a script string, a bare number without a unit); «فهرس تلقائي» x 234 → 250 (its pop
    touched x 63); the rule line is 86 px on both rows with maxWidth 900 (it ran edge to edge, 65–1015).
  · s6_payoff: «خلّ شغلك يسولف عنك.» maxWidth 900 (same reason).
  · cues.json / build_cues.py: samples label from f219 (card 1's first frame), not f215 (f215–218 still show the
    student's own screen, which is not a sample).
  · audio.py: the hook key taps are cut (both hands are in his hair 0–1.6 s: no visible cause). Mixes re-rendered.
  · s4 → s5, s5 → s6, s6 → s7 hand-overs checked at 1:1: the s5 → s6 match cut lands on the same rect; s3 → s4 keeps
    card 1 on the same rect across the lime → stage cut.
