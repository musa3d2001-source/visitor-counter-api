# CD notes for the launch-ad builder (read before planning the edit)

The owner subscribed to Higgsfield, so the launch ad now gets **photoreal people and hands**: the one thing our
code-built 3D can't do convincingly. The CD art-directed these clips (start frames written, picked and regenerated to
remove clichés), then animated them with Kling 3.0. They are in `footage/ai/`: 1076×1924 at 24 fps (scale or crop to 1080×1920 and conform to 30 fps by frame index), about 5 s each. Each clip has a generated audio track: **discard it**.
The table below has the CD-approved in/out ranges. **Use only those ranges.**

| file | what it is | where it goes |
|---|---|---|
| `s1_hook.mp4` | an ordinary office: a hand in a white dishdasha sleeve photographs a plain, unlabeled perfume bottle with a phone under flat fluorescent light, and the thumb taps the shutter | **HOOK 0.0–~1.6 s** under «هذا منتجك.» Cut on the shutter tap → HARD CUT on the impact into the LAYL bottle in full cinematic glory, «وهذا إعلانه.» (ordinary bottle → our bottle; the drop lands on the cut) |
| `s2_diwaniya.mp4` | diwaniya at night: three young men; one shows his phone (back to camera), one points and laughs, one leans in | **PAYOFF** (≈17–21 s), first reaction shot |
| `s3_cafe.mp4` | sunlit café: two young women in abayas; one shows her phone, the other laughs behind her hand | **PAYOFF**, second reaction shot |
| `s4_car.mp4` | night, parked car: a young man reads his phone, smiles and starts typing a reply | **PAYOFF**, third: he's *typing*, so this is the bridge into the ONE typing bubble (•••) that starts the sting |
| `s5_owner.mp4` | evening, small oud & perfume shop: the owner glances at his phone on the counter as it lights up, with a quiet proud smile and incense smoke | optional: the emotional button before the sting, or graded dark and blurred behind «عندك مشروع؟» in the CTA (keep the CTA text perfectly legible) |

## How to use them (rules)
- **Payoff rhythm:** 0.6–0.9 s per reaction shot, cut on the beat. The chat bubbles («منو مسوي هالإعلان؟!» «شفتوا إعلانهم؟» «وين مكانهم؟») pop over and between the people (Arabic set in code, RTL, never baked into the AI footage). Then all bubbles collapse into ONE typing bubble (•••) → createSting. This replaces, or intercuts with, the generic phone-frame idea. People talking about the work IS the tagline.
- **Phone screens:** never show or fake the contents of a phone screen in these clips (the backs face the camera by design). Don't composite UI onto them.
- **Inspect every frame you use at full size**: hands, fingers, teeth and faces must not morph. If a range has an artifact, shorten it. Prefer the first 2–3 s of each clip, where image-to-video is most stable.
- **Speed:** 0.8–1.0×. No speed ramps that expose AI motion.
- **Grade to match:** a light shared grade (warm, slightly lifted blacks), the same grain as the rest of the ad, and a gentle 1.02–1.05 scale to hide edge drift. Extract to JPEG sequences in tash/review/launch-footage/ and draw by frame index, like the concept footage.
- **Honesty:** these are not clients and not testimonials. No names, no numbers, no "real reactions" claims. Keep the small «نماذج تجريبية · CONCEPT WORK» line in the montage. In SCRIPT.md credit the people shots as "generated with Higgsfield (Kling 3.0) from CD-art-directed frames".
- **Audio:** drop the clips' generated audio; the music and SFX stay ours (sync the bubble pops to the claps).
- Also cut the **4:5 feed version** so the faces stay in frame.

## CD-approved ranges (seconds in the source clip; checked on a 4 fps contact sheet + full-size hand/face crops)
- `s1_hook.mp4`: **0.00–1.80** is approved. Handheld drift, thumb on the shutter, and the bottle on the screen is stable. The tap itself is subtle, so SELL it: a fast white shutter blink on the phone screen area, plus a dry shutter click in the audio, on the cut frame. Then hard cut to the LAYL glory shot on the drop.
- `s2_diwaniya.mp4`: **0.25–3.25** is approved (pointing hand and faces are clean at full size). Best beat ≈ 1.75–2.75, where the middle man grins at the phone.
- `s4_car.mp4`: **0.50–3.75** is approved (face and hands clean). He looks down and grins while typing, which leads into the typing bubble.
- `s3_cafe.mp4`, `s5_owner.mp4`: ranges are added here once reviewed. If a file is missing, it failed review: don't use it.
