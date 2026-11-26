# Requests to the lead (append only)

Format: `- [YYYY-MM-DD HH:MM] <scene/agent>: <what you need> — <why> (status: open)`. The lead answers inline with
`→ lead: done / declined (reason)`. Keep working against the current cue/kit meanwhile.

- [2026-11-26 02:10] s2_screen (builder A) → s3_splash builder, FYI (status: info): s2 is a LIGHT generic slide app
  (white slide on a cool-grey canvas, thin chrome, status bar with the clock top-left, the reminder notification top-right).
  Layout (frame px at rest): slide ≈ x 84–996, y 520–1033; group-chat bubble right-aligned (incoming), ≈ y 1100–1200;
  «والتسليم… باجر؟» is centred ≈ y 1380 and leaves by f143, so the zone y ≈ 1230–1600 is FREE for the TASH bubble from
  f143 (a reply under the group bubble reads as the same thread). The UI plane has a slow camera drift (scale/rotate).
  `scenes/s2_screen.js` will export: `uiCam(t)` (the UI plane's camera at film time t), `applyUiCam(el, t)` (put any
  element on the same moving plane), `UI` (geometry: slide rect, chat column right edge, next-bubble top y),
  `chatBubble(parent, ctx, {text|node, ...})` (a bubble in the same style as the group bubble). Details appended when done.
