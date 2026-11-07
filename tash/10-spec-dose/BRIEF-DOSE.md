# «سبيشلتي دوز» (specialty dose) spec ad: CD brief

**What this is:** the TASH owner asked for a story ad for **specialty dose**, a real specialty café in Al Jahra, Kuwait (Instagram
`@sdosecafe`). The owner will post it as **a TASH Instagram story that mentions @sdosecafe**.
- Owner decision, 7 Nov: «ستوري مع علامة واضحة».
- specialty dose has **not** commissioned, approved or seen this ad.

So the label rules are stricter than MOR's:
- A small, always-legible tag sits in a corner **for the whole film**: «إعلان تجريبي · مقترح من طشّ».
  - It must clear the IG story UI: inside y 250–1620 on 1080×1920, or just under the top progress bar.
- The film ends on the slate «إعلان تجريبي غير رسمي — مقترح من طشّ لـ سبيشلتي دوز» + `SPEC AD — NOT COMMISSIONED BY SPECIALTY DOSE`.

No invented facts. The only factual lines allowed are from their own posts:
- They import from Ethiopia, El Salvador and Colombia («نستورد محاصيلنا من جميع أنحاء العالم.. من أثيوبيا والسلفادور وكولومبيا»).
- Their tagline: «تعديل المزاج يبدأ من هنا».
- They serve iced latte, filter coffee, espresso and a cocoa-crumble cake in a milky coffee sauce. **Don't name the cake.**
- No prices, hours, awards, "best", reviews or people's faces.

Reference photos (owner's screenshots of their Instagram; **not in git, never shown in the film**):
- Originals: `tash/review/dose-refs/ref01…11.png`.
- Phone UI cropped out: `ref01_c…ref11_c.jpg`.

## Identity (read from the references)
- **Wordmark:** «specialty» (small, lowercase, medium weight) over a **huge, ultra-condensed, heavy «dose»**.
  - Stencil-like vertical cuts run through the counters of the d, o and e.
  - «cafe» or «coffee house» sits underneath.
  - It appears in orange on white (sign, `ref06_c`), white on dark coffee beans (`ref04_c`), and orange on clear cups (`ref01_c`, `ref07_c`).
  - The logo plate must be a faithful recreation, made for this pitch only. Never alter or redraw the design.
- **Colours:**
  - signature **orange**, about `#F26A21`–`#F45A1E`
  - clean white plaster
  - warm beige/oak interior
  - brushed stainless steel trays and tables
  - **yellow** paper cups, about `#F5C518`, with their illustration (a kettle pouring into an orange abstract shape)
  - white retro ceramic cups with thin red/orange rim lines, on white saucers
  - orange spoon handles
- **Space and objects:**
  - **Outside:** a white curved plaster facade with a big **arched window**, an orange «dose» sign, orange folding bistro chairs and table, and an orange tray. A Jahra street sits behind.
  - **Inside:** beige walls, a long oak ledge, terrazzo-like floor, menu and origin cards on the bar, glass carafes, an orange V60 dripper.
  - **Grinders:** a row of commercial grinders with tall clear hoppers full of beans and white origin cards.
- **Service:**
  - Gloved hands (clear/grey nitrile).
  - A glass carafe of filter coffee poured into a clear «dose» cup.
  - Espresso from a small glass pitcher cascading into iced milk.
  - The cocoa-crumble cake square in a pool of milky sauce on a white plate, on a stainless tray.

## The idea: «ناقصك دوز.» ("you're missing a dose")
«dose» = «جرعة». Everyone knows the feeling of a day with low mood. The film opens on a **mood battery**: an orange
pill-shaped battery meter labelled «المزاج». It sits at **١٥٪**, nearly empty and blinking.
- Every shot is one *dose*, and the meter charges a step on the beat with a rising note.
- It reaches **١٠٠٪** on their outdoor orange table.
- The film lands on their own line, «تعديل المزاج يبدأ من هنا.», and the dose wordmark.

The meter is a graphic overlay we render ourselves, never generated. It is the one recurring device, built from their orange and their
rounded, condensed shapes.

| Time (≈) | Shot | Text (Kuwaiti) · meter |
|---|---|---|
| 0.0–1.6 | **HOOK.** Dark, desaturated, tight on the empty meter blinking at ١٥٪. A low-battery blip. | «مزاجك ١٥٪؟» → «ناقصك دوز.» |
| 1.6–4.0 | `d1_grinders`: a slow lateral dolly past tall hoppers of beans with blank origin cards | «جرعة من إثيوبيا…» «…والسلفادور» «…وكولومبيا» (word swaps on the beat) · ٣٥٪ |
| 4.0–6.4 | `d2_carafe`: a gloved hand pours filter coffee from a glass carafe into a clear dose cup | «جرعة صافية.» · ٥٥٪ |
| 6.4–8.8 | `d3_iced`: macro, espresso cascading into iced milk in a clear dose cup, marbling | «جرعة باردة.» · ٧٥٪ |
| 8.8–11.0 | `d4_cake`: the crumble cake; milky coffee sauce pours over it and pools | «وجرعة حلا.» · ٩٥٪ |
| 11.0–13.2 | `d5_terrace`: the outdoor orange chairs and table, an orange tray with the retro espresso cup, a yellow iced cup and the cake, golden light, a gloved or plain hand lifts the cup | meter pops to **١٠٠٪** → «تعديل المزاج يبدأ من هنا.» |
| 13.2–15.6 | **End card** from `logo_plate.png`: the dose wordmark on orange (or orange on white plaster), «سبيشلتي دوز · الجهراء», `@sdosecafe` | — |
| 15.6–18.0 | **TASH tail**: the short sting + the spec slate | slate text above |

Make it better if you can; this is a starting structure. Target 16–18 s, 9:16 (1080×1920, 30 fps). It is a story ad, so stay under about 20 s.
Arabic type:
- RTL, per word or line, never split letters, never over busy detail. Use Alexandria / IBM Plex Sans Arabic.
- Digits are Arabic-Indic («١٥٪»).
- Their world is orange, white and steel, so the type sits in their palette. TASH lime appears only in the TASH tail and the small spec tag.

## Footage plan: Higgsfield budget, **owner-approved cap 75 credits**
Balance before starting: **253.75**. Stop if the balance would go below **178.75**.

| ID | Still (GPT Image 2.6, medium, 2k, 9:16, refs) ≈1 | Video (Kling 3.0 Turbo, 1080p, 5 s) ≈10 |
|---|---|---|
| d1_grinders | refs `ref05_c` | slow lateral dolly; beans settle slightly |
| d2_carafe | refs `ref02_c`, `ref01_c` | steady pour stream, liquid level rises in the cup |
| d3_iced | refs `ref07_c`, `ref01_c` | espresso falls, blooms down through the milk, ice shifts |
| d4_cake | refs `ref11_c`, `ref10_c` | sauce ribbon falls onto the crumble and pools outward |
| d5_terrace | refs `ref08_c`, `ref09_c`, `ref06_c` | slow push-in; a hand lifts the espresso cup |
| logo_plate | refs `ref06_c`, `ref04_c` | still only |

That comes to about 56 credits, leaving about 19 for re-rolls.

Prompt rules (`_system/PLAYBOOK.md` §2):
- Use the 5-layer still prompt.
- Lock one product-description block per cup and cake type and copy it word for word.
- Describe the physics and direction of every motion: liquid falls *down* under gravity, the level *rises*, the sauce *spreads outward*.
- **Ask for no text** except the cup wordmark. Origin cards and menus stay blank, and there are no grinder brand logos.
- No faces: hands, gloved hands and cropped torsos only.
- A real camera must be able to shoot it.

Grinders, carafes and trays must be generic. No third-party brand marks (no Mahlkönig logo).

## Sound (original, `_system/audio`)
Bright, warm lo-fi/house groove at about 100 BPM.
- **Hook:** a low-battery blip.
- **Each meter step:** a rising pluck note (a 4-note ascending motif, resolving on 100%).
- **Shots:** grinder whirr, beans rattle, carafe pour, ice clinks, a spoon on ceramic, the scrape of a bistro chair outside.
- **Ending:** a warm resolve on the end card, then the TASH sonic logo.

Mix to −14 LUFS, true peak ≤ −1 dBTP.

## Deliverables (`tash/10-spec-dose/`)
- `DOSE-spec-story-9x16.mp4`
- `poster.png`
- `contact-sheet.png`
- `SCRIPT.md` (job ids, credits spent, idea in Arabic and English, posting note)
- `src/` (reproducible, modelled on `09-pitch-mor/src`)
- `footage/ai/*.mp4` + `footage/ai/frames/*.png`

Also add an Arabic posting note:
- Story caption and mention «@sdosecafe».
- The spec label is already in the frame.
- No music sticker.
