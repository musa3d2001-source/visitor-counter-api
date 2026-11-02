# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Students (primary):** Kuwaiti school students, from young children to teenagers. They browse by grade and subject, or by teacher, watch free previews, and buy a single video, a unit explanation (شرح وحدة), a full course (دورة كاملة), a quiz review (مراجعة اختبار قصير), an exam-night review (مراجعة ليلة الاختبار), or a bundle (باقة) of videos plus PDF notes. Afterwards they watch and read from their library and resume where they stopped.
- **Parents (أولياء الأمور):** named as primary users alongside students. *(Inferred, not confirmed: parents often make or approve the purchase, so pricing, what's included and how long access lasts must be clear to an adult who doesn't use the platform day to day.)*
- **Teachers:** self-managed accounts. They upload videos and notes as drafts and submit them for review.
- **Owner (المالك):** approves, prices and publishes content, and manages orders, payments and teacher commissions.

## Product Purpose

A Kuwaiti education platform for all grades and subjects. It currently covers the intermediate stage (grades 6–9) and is launching commercially with selected math teachers. Students find recorded explanations and notes for their grade and subject, buy exactly the unit of content they need, and come back to it in their library.

**Success test:** a grade-6 student can find and buy their material without help.

## Positioning

Inspired by Kuwaiti platforms like Ola and Saham Al-Tafawq, but with its own identity and simpler to use. It sells content in small pieces: one video, one unit, one review, one course or one bundle, so a student pays only for what they need. *(Repo evidence: no mandatory monthly subscription; each product sets its own access period.)*

## Operating Context

- Devices: iPhone, iPad and desktop must all work perfectly.
- Student path *(repo evidence, README)*: Home → grade → subject → product page with free preview → cart → payment (KNET or cards via MyFatoorah) → library right away. Browsing doesn't need an account until checkout.
- Library *(repo evidence)*: organized by grade, subject and content type, with "continue where you stopped" (أكمل من حيث توقفت).
- Content hierarchy *(repo evidence)*: stage → grade → subject → teacher → content. Containers (bundle → course → units → lessons) nest up to 4 levels deep, and buying a container grants everything inside it.
- Teacher workflow: draft → pending review (locked) → Owner sets the price and access period, then approves and publishes, or sends it back with a note.
- One dashboard (`/admin`) serves both the Owner and teachers, with different permissions *(repo evidence)*.

## Capabilities and Constraints

- **Must not break:** MyFatoorah payments, protected PDFs (watermarked reader; downloads only where allowed), Bunny Stream video (signed, short-lived embed URLs) and server-side permissions.
- Arabic first, with full RTL.
- Stack *(repo evidence)*: Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn-style components in `edu-platform/src/components/ui`, Radix UI, lucide icons, and IBM Plex Sans Arabic, self-hosted. Money is stored as integer fils (1 KWD = 1000 fils).
- Grades beyond the intermediate stage already exist in the data but are hidden. The Owner can make them visible without code changes *(repo evidence)*.
- Terms: المالك (Owner), المعلم (Teacher), الطالب (Student), أولياء الأمور (Parents), مكتبتي (My Library), باقة (Bundle), دورة كاملة, شرح وحدة, مراجعة اختبار قصير, مراجعة ليلة الاختبار, مذكرات PDF.

## Brand Commitments

- The name, logo and colors can be changed by the Owner. «منصة درب» is a temporary name, so designs must not depend on the current name, logo or palette.
- Must feel premium, editorial and distinctive, never childish and never complicated.
- Must push toward purchase without misleading anyone.
- Arabic typography must be excellent.
- Binding exclusions: no purple/blue SaaS gradients, no generic card grids everywhere, no excessive radius, shadows or glassmorphism, and no decoration without a purpose.

## Evidence on Hand

- Product docs: `edu-platform/README.md` (Arabic), `edu-platform/docs/TEST_REPORT.md`.
- None provided: no testimonials, student counts, ratings, teacher credentials, sales figures or partnerships. Future work must not make any of these up.

## Product Principles

1. **A grade-6 student must manage alone.** Every flow should pass this test: no extra steps and no hidden or confusing choices.
2. **Clear about what you're buying.** Before payment, show what's included, the price and how long access lasts. Persuade without misleading.
3. **The library is the payoff.** After paying, a student should reach their content and pick up where they stopped right away.
4. **Arabic is the source language.** RTL, Arabic typography and Arabic copy come first; nothing is a translated afterthought.
5. **Serious but approachable.** Right for both a young child and a parent paying the bill: not childish, not intimidating.

## Accessibility & Inclusion

- The users include young children, so reading level, tap-target size and navigation must suit them on phone and tablet. *(Inferred from the audience; no formal standard was specified.)*
