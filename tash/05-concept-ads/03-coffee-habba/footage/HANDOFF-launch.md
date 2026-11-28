# HABBA → launch ad hand-off (COFFEE shot 5.00–6.00 → RING 6.00–7.25)

The launch ad's COFFEE shot currently uses `review/launch-footage/habba-pour_5.00-6.60`, which is a clean render of the
**old CGI** HABBA. The HABBA film is now photoreal. These are the clean ranges to pull instead.

**Source of truth.** All times are in the HABBA `?clean=1` render (`05-concept-ads/03-coffee-habba/src/index.html?clean=1`,
1080×1920, 30 fps). That render has the same timeline as the film, with no type, slates or sting, and it carries the HABBA grade
and grain. Frame `f` = round(t × 30). Shot S3 (4.20–7.00) is `footage/ai/k3_pour.mp4` (24 fps, 1080×1912) played at **1.2×**:
source seconds = 1.196 + (t − 4.20) × 1.2. The stream breaks between source frames 93 and 94 (3.896 s), which is exactly
6.45 in the film. Render the range with
`node _system/tools/render.mjs --page "05-concept-ads/03-coffee-habba/src/index.html?clean=1" --from 5.9667 --to 6.9667 --out …`
(the renderer's `--from/--to` are edit seconds; `--from` is inclusive).

## Recommended: one continuous second that ends on a clean rim

| | Clean render | Frames | Source (k3_pour.mp4) | What you see |
|---|---|---|---|---|
| **COFFEE 5.00–6.00** | **5.9667 → 6.9667** (1.00 s) | f179–f208 | 3.316 → 4.476 s (src frames 79.6–107.4) | The last pour into a heart that is nearly formed. The stream thins and **breaks at 6.45** (f193 → f194), then the pitcher lifts up and out of the top of frame. The last frame, **f208 (6.9333)**, is a clean top-down heart and cup with the whole rim visible |

**Match-cut frame for RING:** f208 (or f209, the last frame of S3). In the 9:16 clean frame, the cup's outer rim (the
cream lip) is a circle with its **centre at about (518, 658) px** and an **outer radius of about 312 px**. The liquid edge
(the inner circle) has a radius of about 270 px, and the saucer's outer radius is about 475 px. The camera pushes in slowly through S3, so the
rim radius grows from about 300 px at 5.47 to about 315 px at 6.97, and the centre stays within ±10 px.
- I measured the current pairing in `review/launch-footage/`. The old CGI rim at COFFEE's exit (`habba-pour_5.00-6.60/0047.jpg`) and the
  gold band in RING's first frame (`ring/0000.jpg`) both sit at about **(564, 560) with an outer radius of about 389 px**. The new rim
  is smaller and lower. To restore the match, either scale the RING plate **×0.80 about its centre and move it by about (−46, +98) px**
  (so its band lands on (518, 658), r ≈ 312), or scale COFFEE ×1.245 about (518, 658) and move it by (+46, −98). The second
  option is a ×1.25 upscale of 1080p AI footage and goes visibly softer, so I'd move the RING plate (it is CGI, with plenty of room).
- 4:5 cut: with the launch ad's `FY.COFFEE = 0.26`, the cover-crop offset is (1920 − 1350) × 0.26 ≈ 148 px. The rim centre
  then lands at about (518, 510) in 1080×1350.
- f207 (6.90) still has a speck of the pitcher on the top edge at x ≈ 1000. It is far from the rim, but f208 and f209 are fully clean.

## Alternative: more heart forming, but the spout touches the rim at the exit

| | Clean render | Frames | Source (k3_pour.mp4) | What you see |
|---|---|---|---|---|
| COFFEE 5.00–6.00 | 5.4667 → 6.4667 (1.00 s) | f164–f193 | 2.716 → 3.876 s (src frames 65.2–93.0) | The heart visibly grows and sharpens under the stream, and the cut lands one frame before the stream breaks. **At the exit frame (f193) the pitcher spout reaches the rim's 12 o'clock** (spout tip at y ≈ 380, rim top at y ≈ 360), so the circle is not clean for a match cut. Use this range only if the cut to RING is not a rim match |

## Clean-rim handles straight from the source clip (no HABBA grade)

If you need more than two clean frames of the finished cup, for example to hold the match frame or to slow the exit, pull them from the
source: **`footage/ai/k3_pour.mp4`, 4.458–5.000 s (source frames 107–120, 14 frames at 24 fps)**. That is a top-down view, the pitcher is
completely out of frame, and the heart is complete. The camera is still creeping in.
Caveats: the heart's outline "breathes" very slightly over these frames (an AI artifact; check at full size before holding on
it). These frames are ungraded; HABBA's look is `src/grade.js` with the `k3_pour` match settings in `src/main.js`. Cover-cropping
1080×1912 to 1080×1920 (scale 1.0037/1.0042, centred) moves the rim by less than 3 px. HABBA's S3 framing adds ×1.03 about (540, 660).

Credit if used: *Footage: AI-generated with Higgsfield (GPT Image 2.6 start frames → Kling 3.0 Turbo), art-directed and
approved by TASH.* (k3: image job d9f7c227-cbce-4e0e-ab6e-e0e00d8dafaf → video job e5c4869f-0cfc-4461-9e39-f71a10b89183).
