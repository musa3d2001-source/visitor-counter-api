# HANDOFF: ذاكرة مشروع «طشّ | TASH Creative»

> **Read this before resuming any TASH work. Update it after every stage and before the session ends.**
> Last updated: 2026-11-07 (DOSE d5_terrace re-rolled after hostile review; brief tray corrected).
> Branch: `claude/optimistic-lovelace-0b5d7t` · PR #3 (draft) on `musa3d2001-source/visitor-counter-api`.
> Status keys: **delivered** means sent to the owner as a file. **approved** means the owner said yes in writing.
> **published** means it is live on Instagram/TikTok. *Claude never publishes.*

---

## 1. The project in one paragraph
- TASH (طشّ) is a Kuwaiti ad studio. Tagline: «طشّ… خلّهم يسولفون عنك!».
- The owner writes in Kuwaiti Arabic. Reply to them in Kuwaiti Arabic, short, and get to the work.
- Services, and only these: ad videos, social ads, ad design, ideas and scripts, motion and editing.
- What we never do or offer:
  - manage accounts
  - post for clients
  - run paid campaigns for clients
  - sell followers
  - promise views or sales
- Every portfolio piece is a **concept ad for a fictional brand** and is labelled as one, on screen and in the caption.
- Full rules: `tash/_system/BRIEF.md`. Delivery index: `tash/README.md`.

## 2. The owner's latest corrections (verbatim)
1. «لا تابعنا على الانستقرام والتيك توم مو بالانستقرام والتيك توك ! مو دارس عربي شكلك»
   - Fixed in `adc3fa3`. Post 8 slide 6 now reads «تابعونا **على** الإنستقرام والتيك توك.»
   - Use «على» with platforms from now on, never «بال…».
2. «حط التيك توك والانستقرام في كل بوست والتواصل خاص فقط حاليا بدون رقم تلفون +تيك اليوزر tash.creative الانستا تعرفه انت»
   - Fixed in `ca43b1a`.
3. «على مو بالا !!!» was **not understood**. I asked the owner what it meant. They then sent correction 1, so it was probably about «بال…» → «على». **Needs confirmation.**
4. Earlier corrections on the STAKK burger, all fixed (see `tash/05-concept-ads/02-burger-stakk/SCRIPT.md`):
   - «ليش شكل البرجر الني جذي جنه مخ»
   - «يلوع الجبد فيه اخطاء ومو متناسق»
   - «كل طبقة لها سالفة شكل البرجر قبيح»
   - «شلون يرفع البرجر عكس 🤣»

## 3. Approved decisions (owner said so)
| Decision | Source |
|---|---|
| **specialty dose (@sdosecafe, Al Jahra) spec story ad**: Higgsfield cap **75 credits** (balance before: 253.75, so stop below 178.75). Owner will post it as a TASH **story with a mention**, with a clear spec label in the frame the whole time + an end slate. | Owner answers, 7 Nov: «إي، لين ٧٥» and «ستوري مع علامة واضحة». Brief: `tash/10-spec-dose/BRIEF-DOSE.md` |
| **No WhatsApp anywhere for now** — public account *and* client ops (`07-ops`). DM is the door for everything (orders, questions, notes, problems). | Owner: «واتس مانبيه حاليا تم» (7 Nov) |
| Email for formal/recorded things only: written offer, invoice, usage rights, final-file links, final approval. On the profile as an **Email contact button** only, not in the bio. | Claude proposed it; owner replied «تم» in the same message. **Needs confirmation** that «تم» covered the email part. The address is unknown: `[[الإيميل]]`. |
| **Contact is DM only for now.** No phone number, no WhatsApp, no contact buttons. | Message «والتواصل خاص فقط حاليا بدون رقم تلفون» (7 Nov) |
| Instagram is **@tash.creative.kw** and TikTok is **@tash.creative**. Both handles go at the end of **every** post caption. | Same message |
| Bio link is `https://www.tiktok.com/@tash.creative`. | Claude inferred this from "no phone". **Needs confirmation.** |
| No more Higgsfield spending without asking first and stating the cost. | Owner rule. Approved budget is about 345 + 1 credits. **Spent: 346.25** (session record; confirm with `balance`). |
| Licensed stock (Mixkit/Pexels/Pixabay) is allowed, with a licence record. Social-media videos are reference only. | `_system/BRIEF.md` (7 Nov) |
| MOR ad is an **unofficial spec pitch**. Send it to @morkwt by DM only. Do **not** post it on TASH without MOR's written approval. | Owner + BRIEF |
| STAKK title shot is `b2_sear` (no spatula). | Owner chose «لقطة صاج بدون معزقة» |
| STAKK was rebuilt in full (one burger, one stage, continuous chain). | Owner chose «أعيد بناءه كامل» |
| Claude never logs into or posts to the owner's accounts, and never asks for passwords. | Owner rule |

**Not yet decided:**
- Profile name. The plan suggests «طشّ TASH | استوديو إعلانات»; the preview shows «طشّ | صناعة إعلانات 🎬».
- Prices. `07-ops/04-pricing.md` is still not approved, so the «الأسعار» highlight is on hold.
  - Note: `07-ops/01` `/hala2` and `/price` quote prices. Don't send those replies until the prices are approved.
- Who goes in pinned slot 2.

## 4. Files: what exists and where

### In git (on this branch)
| What | Path |
|---|---|
| Plan, Arabic, step by step + 30-day marketing (source / PDF 9 pages / text) | `tash/08-instagram/plan/plan.html` · `TASH-plan.pdf` · `TASH-plan.txt` |
| The 9 Instagram posts (masters + `caption.md`) | `tash/08-instagram/01-habba-concept-reel/` … `09-launch-reel/` |
| Posting plan (English, detailed) | `tash/08-instagram/POSTING-PLAN.md` |
| Profile preview | `tash/08-instagram/profile-preview.png` (+ `-light`), source `src/profile/index.html` |
| Stories made for the package | `tash/08-instagram/stories/day2-new-work-habba.png`, `new-work-stakk.png` |
| Highlight covers + stories templates | `tash/03-templates/examples/highlight-1-work.png` … `highlight-5-faq.png`, `highlights-preview.png`, `story-*.png`, `story-new-work-anim.mp4` |
| Avatars | `tash/02-logo/avatar/tash-avatar--lime-1080.png`, `--ink-1080.png` |
| Launch ad (27.0 s) | `tash/04-launch-ad/TASH-launch-9x16.mp4`, `TASH-launch-4x5.mp4` |
| Concept ads | `tash/05-concept-ads/01-perfume-layl/LAYL-concept-9x16.mp4` · `02-burger-stakk/STAKK-concept-9x16.mp4` (13.8 s) · `03-coffee-habba/HABBA-concept-9x16.mp4` |
| MOR spec ad (20.4 s) | `tash/09-pitch-mor/MOR-spec-ad-9x16.mp4`, `MOR-spec-ad-4x5.mp4`, `poster.png`, `BRIEF-MOR.md`, `SCRIPT.md` |
| Profile copy | `tash/06-copy/instagram-profile.md` (§5 updated to DM only) |
| 4-week content calendar | `tash/06-copy/content-calendar-first-4-weeks.md` |

### NOT in git (exist only in this container, and in the owner's Outputs/chat)
`tash/review/` is git-ignored. These are lost if the container is reclaimed and must be rebuilt (§7).
| File | Path in container | Size | Delivered to owner |
|---|---|---|---|
| **TASH-Kit.zip** (59 files: plan, 9 posts with `caption.txt`, highlights, stories, profile + `bio.txt`) | `tash/review/share/TASH-Kit.zip` (unzipped folder alongside) | 59,957,843 B | Yes (second version, 7 Nov, after the «على» fix). The first version had «بالإنستقرام»; the owner was told to delete it. |
| **MOR-Spec-Pitch.zip** (both MOR videos, poster, «00-اقرأني.txt» with the first-contact DM, no WhatsApp) | `tash/review/share/MOR-Spec-Pitch.zip` | 65,724,206 B | Yes (7 Nov). The MOR mp4s + poster were also sent separately just before it. |
| Re-encoded reels used in the kit (libx264 crf 19, maxrate 6M, audio copied) | `/tmp/claude-0/.../scratchpad/reenc/*.mp4` | 46 MB total | Inside TASH-Kit.zip |
| `TASH-plan.pdf` | sent as its own file too | | Yes |

The kit's images are **JPG q95 (4:4:4)** conversions of the PNG masters, and its reels are re-encodes. Both were made so the zip downloads on iPhone: 241 MB failed, 44 MB worked, and 60 MB is **not confirmed** to work. They are not byte-identical to the masters in git.
The old split zips (`split/TASH-1..6-of-6`) and `TASH-Instagram-Kit.zip` were **deleted**; they still had WhatsApp text.

## 4b. Playbook adopted from Agency Agents (7 Nov)
- The owner asked to review all files of `msitarzewski/agency-agents` (MIT) and take what's useful.
  - 28 relevant files (marketing, paid-media creative, design, sales, customer service) were read by three subagents.
  - The result is adapted to TASH rules in **`tash/_system/PLAYBOOK.md`**.
- New logs:
  - `08-instagram/plan/hook-log.csv`
  - `07-ops/11-outreach-tracker.csv`
- Pointers were added in `AI-BRIEF-posting.md` and `07-ops/README.md`.
- Not adopted:
  - the library's statistics (unsourced);
  - trending audio, influencers, client ads, outcome guarantees.
- Needs confirmation:
  - TikTok rejecting PNG for photo posts.
  - The «تجديد الإعلان» monthly pack is an idea only. Owner to decide.
- Other three repos the owner shared (OpenMontage AGPL, Graphify, codebase-memory-mcp): reviewed from their READMEs, not adopted.

## 5. Verified vs not verified
**Verified by Claude:**
- All 9 `caption.md` files pass `check_captions.py`, end with both handles, and have no WhatsApp.
- Post 8 slide 6 was re-rendered and checked by eye («تابعونا على الإنستقرام والتيك توك.»).
- Template examples `post-cta-01/02` and `carousel-how-to-order-06` were re-rendered with DM-only text.
- `TASH-Kit.zip` and `MOR-Spec-Pitch.zip` pass `unzip -t`.
- The 5 kit reels: h264 1080×1920 + AAC, durations 15.6 / 13.8 / 15.9 / 13.07 / 27.0 s.
- The plan PDF has 9 pages, embedded TrueType fonts (emoji are Type 3), and the cover and page 2 were checked visually.
- The MOR files in the zip are byte-identical (`cmp`) to `tash/09-pitch-mor/`.

**Needs confirmation:**
- Whether the owner successfully downloaded TASH-Kit.zip (60 MB) and MOR-Spec-Pitch.zip (66 MB) on the iPhone.
- Whether the owner has set up the business account, name, bio and link.
- The meaning of «على مو بالا !!!».
- Whether the plan PDF's emoji render correctly on iPhone.

**Approved / published:**
- Nothing is published yet as far as Claude knows. Claude has published nothing.
- MOR has **not** approved anything.

## 6. Still to do
1. ~~Remaining WhatsApp mentions~~ **done** (06-copy, README §8, 07-ops incl. re-rendered `order-form.png/pdf`, tracker example). The only remaining mentions say "no WhatsApp", or are the plan's tip to share on the owner's *personal* WhatsApp status.
   - Still open: get the email address from the owner, then:
     - replace `[[الإيميل]]` in `06-copy/instagram-profile.md` and `tash/README.md` §8;
     - add an "Email contact button" step to `08-instagram/plan/plan.html`;
     - rebuild the plan PDF and TASH-Kit.zip.
2. Update `tash/README.md` delivery index: add `08-instagram/plan/` and the DM-only decision.
3. PR #3 body: mention the plan + DM-only change.
4. If the iPhone download fails: shrink the reels further, or split into 2 zips of about 30 MB each.

## 7. Next step
**In progress (7 Nov):** the specialty dose spec story ad (`tash/10-spec-dose/`).
- Stage 1: generate the stills. **Done (generated + self-checked by Claude; NOT CD-reviewed, NOT delivered, NOT approved).**
  - 6 frames, GPT Image 2.6 medium 2k 9:16, 1 credit each, one generation each, no re-rolls: `10-spec-dose/footage/ai/frames/` d1_grinders (job df7f621d-2e12-4d8a-b2e2-8ec0fbc07313) · d2_carafe (9fb417e2-7c57-4a4d-bfc2-524aa126122a) · d3_iced (291248a5-6f75-4700-8c8e-1debbdaa9e39) · d4_cake (2a4787a0-99c1-4fd1-a897-37daef6e9da4) · d5_terrace (792c7a49-b9b5-425f-af95-7b4777f068df) · logo_plate (836ec4b1-c66c-4f9d-b693-9588a89047bc). `_rejected/` is empty.
  - Balance 253.75 → **247.75** (6 credits spent of the 75 cap; checked with `balance` before/after each job).
  - Refs were uploaded as sanitised crops (face cropped out of ref02; Mahlkönig badges + card text blanked on ref05; story sticker removed from ref11; Toyota badge/plates/card blurred on ref08; ref06 split into arch-only and sign-only crops). The crops live only in the scratchpad (not in git).
  - Known nits for the CD: logo_plate orange measures ≈ #EC6C19 (target #F26A21) and fills ≈ 84 % of the width (scale down in the edit); its «specialty» is a little heavier than ref04. d3 is cooler/whiter than the other shots (matches ref07). d5's espresso cup has one red rim line.
  - **Hostile review → d5_terrace failed (major); re-rolled 7 Nov.** Only d5 was in the failed list.
    - Cause: the brief said «an orange tray»; ref08–ref11 show **brushed steel trays**. `BRIEF-DOSE.md` corrected (Identity > Outside + d5 row).
    - v2 (job 90641f03-4d2e-406c-b9d0-3e769372fba5; refs ref08 crop, ref06 arch crop, d4_cake job as cake/tray ref): steel tray, square tables, cup shadow on saucer; plate still touching the right edge.
    - **v3 accepted** (job 3e1df8d5-c10b-429d-8a47-5c5b3f540062; refs v2 job + ref08 crop; «same frame, camera pulled back»). Whole tray inside frame (plate right edge ≈ x 938/1080, plate bottom ≈ y 1414, tray bottom ≈ y 1493, all above the IG reply bar), square orange table, cake identical to d4, lifted cup shadows on its saucer, clean plaster space at y ≈ 250–570 for the line and meter. Measured: table ≈ #EB681F, cup ≈ #FBB814, plaster ≈ #F0D8C7.
    - Rejected kept: `frames/_rejected/d5_terrace_v1.png`, `_v2.png`. Prompts: scratchpad `dose/v2/d5_terrace_v2.txt`, `_v3.txt`.
    - Still minor in v3 (grade/edit can handle): chair backs are one wide plank, not slats; hero objects are smaller than v1 (push-in can be up to ~12 % now); the cake interior is unlayered (same as d4, consistent).
    - **Not yet re-reviewed by the CD.**
  - Balance 247.75 → **245.75** after the re-roll (2 credits). Stills total **8 of 12**; ad total 8 of 75.
- Stage 2: CD review, then the videos.
- Stage 3: build the edit + hostile review.
- Then send the MP4 to the owner.

Ask the owner for the studio email address, and confirm the email split. Then do item 6.1. Also still waiting on: did the two zips download on the iPhone, and any wording fixes in the plan.
If the container was reset and the owner needs the zip again, rebuild it:
1. Re-encode the 5 reels:
   ```
   ffmpeg -i <master> -c:v libx264 -crf 19 -maxrate 6M -bufsize 12M -pix_fmt yuv420p -c:a copy
   ```
2. Copy each post folder.
3. Write `caption.txt` from the first ```text block of `caption.md` + the Alt text table.
4. Convert PNG → JPG q95 subsampling 0.
5. Copy `plan/TASH-plan.pdf/.txt`.
6. Zip with mp4/jpg/pdf stored.

Folder layout: `00-START-HERE/ 01-posts/ 02-highlights/ 03-stories/ 04-profile/`.
Plan PDF build: render `plan.html` with Playwright `page.pdf` (A4, printBackground) from the repo's fonts.

## 8. Working rules that bit us before
- Commit flow:
  ```
  git add -A tash
  git add -f <ignored mp4s if needed>
  git commit
  git fetch
  git merge --no-edit origin/<branch>   # not rebase
  git push -u origin claude/optimistic-lovelace-0b5d7t
  ```
- Arabic copy: Kuwaiti, natural grammar («تابعونا على…»). Never broken/split Arabic letters. Proofread every rendered string by eye.
- Don't claim a file or video exists unless it was actually produced and checked.
- Don't invent clients, reviews or numbers.
