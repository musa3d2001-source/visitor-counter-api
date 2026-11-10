# Third-party code and fonts used by TASH

Everything else under `tash/` is our own: code, visuals, sound and copy. Owner-approved AI footage is the one
exception, and it is listed at the end. Checked on 6 Nov 2026 by the final QA pass.

## Code libraries (vendored, loaded locally, no CDN)

| Library | Version | Files | Licence | Where the licence text is | Used by |
|---|---|---|---|---|---|
| three.js | r180 | `three/three.module.min.js`, `three/three.core.min.js`, `three/addons/**` | MIT | `three/LICENSE` and the `@license` header in each file | LAYL (`05-concept-ads/01-perfume-layl/src/`), the launch ad's ring shot (`04-launch-ad/src/built/ring/`), the IG BTS reel and post 6 (`08-instagram/src/bts/`, `src/ba/`), the archived CGI cuts (`05-concept-ads/*/src/_cgi-v1/`) |
| GSAP + CustomEase + MotionPathPlugin | 3.13.0 | `gsap/gsap.min.js`, `gsap/CustomEase.min.js`, `gsap/MotionPathPlugin.min.js` | GreenSock Standard "No Charge" License (free, including commercial use, under the terms at https://gsap.com/standard-license) | The `@license` header at the top of each file | Nothing delivered uses it today: no page imports it. Read the terms before using it in a product or a tool. |

Rules: keep the licence headers in the minified files, keep `three/LICENSE`, and add a row here for any new vendor.

## Fonts (all SIL Open Font License 1.1)

| Family | Files in `_system/fonts/` | Licence text | Reserved Font Name | Role |
|---|---|---|---|---|
| Alexandria | `Alexandria-VF.ttf` | `OFL-Alexandria.txt` | none | Arabic display, and the source of the طشّ wordmark |
| IBM Plex Sans Arabic | `IBMPlexSansArabic-{Regular,Medium,SemiBold,Bold}.ttf` | `OFL-IBMPlexSansArabic.txt` | **"Plex"**: a modified copy may not be called Plex | Arabic text |
| Archivo | `Archivo-VF.ttf` | `OFL-Archivo.txt` | none | Latin display (TASH) |
| JetBrains Mono | `JetBrainsMono-VF.ttf` | `OFL-JetBrainsMono.txt` | none | Slates and labels |

- `01-brand-guide/src/fonts/` holds static instances cut from the same files (Alexandria, Archivo, JetBrains Mono only),
  so the PDF embeds real outlines instead of Type 3 glyphs. Each family's OFL text sits next to them. Plex is not modified.
- The OFL allows commercial use, embedding in PDFs and use in videos and images. A font file may not be sold on its own.
- The logo is drawn from Alexandria outlines (`_system/brand/`). Artwork made with an OFL font is not covered by the font licence.

## Not third-party, but credited

- **Audio:** all music and SFX are synthesised by `_system/audio/tashaudio.py`. No samples, loops or downloaded sounds.
- **AI footage (owner-approved, CD-generated with Higgsfield: GPT Image 2.6 start frames → Kling 3.0):**
  `04-launch-ad/footage/ai/` (the launch ad's people shots), `05-concept-ads/03-coffee-habba/footage/ai/` (HABBA),
  `05-concept-ads/02-burger-stakk/footage/ai/` (STAKK re-cut, in progress), `09-pitch-mor/footage/ai/` (MOR spec pitch, in progress).
  Generated under the owner's subscription. Check Higgsfield's current terms for commercial use before a paid client job.
  Credits are in each piece's `SCRIPT.md`.
