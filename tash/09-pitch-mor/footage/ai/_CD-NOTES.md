# MOR: AI footage, CD notes (read before editing)

All 7 clips passed CD review on the first take. Source: Higgsfield. GPT Image 2.6 start frames (`frames/*.png`) were made
from the owner's reference photos of MOR, then animated with Kling 3.0 Turbo image-to-video at 1080p for 5 s. Each clip is **1080×1912, 24 fps,
5.04 s, no audio**. Scale or crop to 1080×1920 and conform to 30 fps by frame index. Use blending or minterpolate only where you slow down, and
check every frame at full size.

| Clip | What happens | Use for | Notes |
|---|---|---|---|
| `m1_exterior.mp4` | **Two shots in one clip.** 0.0–2.95 s: a wide night view of the white corner building, the backlit MOR sign in a wood box, the uplit tree, pink bougainvillea in the foreground, a gentle push-in, blue-hour sky. **There's a hard cut at about 3.0 s.** 3.0–5.0 s: a closer, lower angle on the same corner, with the sign big, the doors and wooden chairs | The 0–2.95 wide is the exterior shot under «فيه باب بالجهراء…». The 3.0–5.0 part can serve as a second exterior beat or the hook's view through the keyhole | In the close part the sign's **O** has an odd inner curl; MOR's real sign has a plain O. **Prefer the wide part**, where the sign is small. If you use the close part, keep it short (≤0.8 s) or soften it behind the keyhole mask |
| `m2_pour.mp4` | Black-gloved hands, white gooseneck kettle, a steady thin pour into a V60 on the gold slatted bar, white scales, coffee in the glass server. Stable for all 5 s | «…وراه قهوة» | Pass. The hands are clean (5 fingers, no warping) |
| `m3_iced.mp4` | The burgundy cup of iced coffee, ice settling, foam, a red gerbera behind, a slow arc and push-in. **«مور» and "MOR" stay correct and stable**, and so do "Kuwait / Al jahra city" and «الكويت / مدينة الجهراء» | The brand hero under «تسوى المشوار.» | Pass. Best at 2–5 s, where the wordmark reads big |
| `m4_espresso.mp4` | Overhead at 45°: two espressos on striped saucers, sparkling water, red tray, a slow push-in, steam | Montage beat | Pass |
| `m5_red.mp4` | Top-down: a pink-red frothy drink in a white-rimmed cup on the red tray, with an embossed keyhole and MOR on the tray. A slow clockwise rotation and push-in with fizz | Montage beat (the rotation gives energy, so cut it on the beat) | Pass |
| `m6_pecan.mp4` | Macro pecan bar on logo wax paper on a steel plate, the iced cup behind, a slow push-in | Montage beat (appetite) | Pass |
| `m7_mirror.mp4` | A slow lateral dolly past the oval wooden mirror on its brass stand, the red gerbera reflected, a cactus in a pink pot, the burgundy cup with «مور» and «الكويت · مدينة الجهراء» readable | The emotional close under «الباب مفتوح… تفضّل.» | Pass |
| `frames/logo_plate.png` | A flat burgundy plate (about `#5E1F28`) with the cream keyhole emblem above «مور MOR». The Arabic was checked and is correct | Source for MOR's end card: cut the emblem and wordmark into separate layers, e.g. by luminance key, and animate them | Faithful recreation **for this pitch only** |

Job ids (image → video):

| Clip | Image job | Video job |
|---|---|---|
| m1 | efabf02c-9d19-420f-b71b-14eb623ca2dc | 5ad5cee0-ff44-4155-b2df-d1328bfd0b8b |
| m2 | eee5426d-dc0f-4804-aa9a-2e049d994173 | 9b2278ac-91b2-4d93-a0c4-baef6a7b782e |
| m3 | f7f224fe-b63c-42c7-ab2b-cee174e14292 | 60dfedc8-8ad4-48c0-b6b6-84a30d850142 |
| m4 | 20bab60b-d49e-4589-93bf-1f1099933e79 | 031077dd-a400-42c9-9c22-c6c8ad1d1a3d |
| m5 | 22666840-7ab0-4f3f-bd59-88ae0d1f5e46 | a2b44cee-e6ed-4552-bf5d-6e38e33dd8ca |
| m6 | 66e055d9-304d-48d4-8160-5edd3b1a52ba | 3929db16-9712-45da-9970-a71f3ff22966 |
| m7 | dc3813b5-9093-4619-b120-c9241237db34 | d320e3ca-3ebd-468c-a747-66e76699ffd6 |
| logo plate | 1b1ce18a-82c1-44ed-bea1-7b97a06266f5 | — |

**Credit line for SCRIPT.md:** "Footage: AI-generated with Higgsfield (GPT Image 2.6 start frames from reference photos →
Kling 3.0 Turbo), art-directed and approved by TASH. Edit, type, sound design and signature by TASH."

Rules:
- Never call Higgsfield; the credits are the owner's.
- The owner's reference photos are not in the repo and must never appear in the film.
- Delete this file when the film is final, after its credit line and job ids are in SCRIPT.md.
