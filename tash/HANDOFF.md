# HANDOFF: ذاكرة مشروع «طشّ | TASH Creative»

> **Read this before resuming any TASH work. Update it after every stage and before the session ends.**
> Last updated: 2026-11-07 (after commit `adc3fa3` and the MOR zip delivery).
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
1. **Remaining WhatsApp/phone mentions**, not yet changed to DM only:
   - `tash/06-copy/cta-bank.md` (lines ~60, ~136)
   - `tash/06-copy/grid-captions.md` (~277, ~301)
   - `tash/README.md` §8 item 2 (the WhatsApp number as an open decision)
   - `tash/07-ops/*` (`order-form.html`, `02-order-form.md`, `01-welcome-and-quick-replies.md`, and others)

   The `07-ops` files are client-process docs, so ask the owner before removing WhatsApp from client ops. The decision covers the public account; whether it covers private client chats too is unclear.
2. Update `tash/README.md` delivery index: add `08-instagram/plan/` and the DM-only decision.
3. PR #3 body: mention the plan + DM-only change.
4. If the iPhone download fails: shrink the reels further, or split into 2 zips of about 30 MB each.

## 7. Next step
Wait for the owner's feedback on the plan PDF and the two zips (did they download? any wording fixes?). Then do item 6.1 after asking about `07-ops`.
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
