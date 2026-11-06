# معمارية «شُهُب فرقد» وبنك أسئلة الكتاب

> قرارات المرحلة 0 بالأرقام، والعقود التي تُبنى عليها المراحل 1 إلى 5.
> كل رقم هنا من قياس مسجّل في `spike/RESULTS.md` (والملفات JSON بجانبه) أو في `baseline/`. أوامر إعادة القياس في `spike/RESULTS.md` §14.
> المسارات نسبية إلى `edu-platform/`. الأدلة المعتمدة هي أدلة `node_modules/next/dist/docs/` للإصدار `next@16.4.4`.

---

## 1. القرارات

### 1.1 Rapier2D الحتمي `0.21.0`

| | العميل | الخادم (Node) |
|---|---|---|
| **الحزمة** | `@dimforge/rapier2d-deterministic` (ملف `.wasm` مستقل) | `@dimforge/rapier2d-deterministic-compat` (WASM مضمّن بـ base64 داخل JS) |
| الحجم gzip-6 | 975,081 (غراء 50,538 + wasm 924,543) | لا يُنزَّل للعميل |
| جاهزية المحرك مع خنق ×4 وFast 4G (وسيط 3 تحميلات) | 4,273ms، مقابل 4,718 لـ compat | تحميل بارد 97ms داخل العملية و108ms في عملية جديدة |
| تتبّع ملفات الخادم | — | 116 ملفًا (5.5MB) لمسار إعادة المحاكاة، مقابل 13,724 ملفًا (652.2MB) لو استُخدمت العادية |
| Turbopack | يعمل في dev وbuild بلا أي إعداد. الملف يُخدم من `/_next/static/chunks/<hash>.wasm` بنوع `application/wasm`، ويُترجم بـ `WebAssembly.instantiateStreaming` | `-compat` تُجمَّع داخل جزء الخادم، فلا حاجة إلى `serverExternalPackages` |

**السبب:** العادية أخف بـ 320,155 بايت gzip وأسرع جاهزية بـ 445ms على العميل. لكنها على الخادم تفجّر تتبّع الملفات، وفي Turbopack تحذير «matches 27420 files» من `loadWasm.ts`. أما البصمات فمتطابقة بين الحزمتين في 8/8 تصاميم، في Node وفي المتصفح.
**الشرط الملزم:** أي ملف يستورد الحزمة العادية لا يصل إلى رسم SSR ولا إلى أي مسار خادم. لذلك يُحمَّل المحرك على العميل خلف `next/dynamic({ ssr: false })` من مكوّن عميل (`02-guides/lazy-loading.md`: الخيار `ssr: false` غير مسموح في مكوّن خادم).

### 1.2 three `0.186.0` و`@types/three@0.186.0`

| | 0.186.0 | 0.187.0 |
|---|---|---|
| نُشر | 2026-09-08 | 2026-10-30 (قبل 7 أيام من القياس) |
| جزء three المجمّع، خام / gzip | 556,204 / 138,040 | 559,822 / 137,783 |
| تغييرات مسار WebGL مقابل 0.186.0 | — | 15 ملفًا في `renderers/webgl`، و174 سطرًا في `WebGLRenderer.js` |

لا فائدة مقيسة من 0.187.0 تقابل مخاطرة إصدار عمره أسبوع يغيّر المسار الذي نعتمد عليه. أما `0.186.1` فلا يغيّر `three.module.js` ولا `three.core.js` بايتًا واحدًا، وليس له `@types/three` مطابق. ملاحظة تنفيذ: 0.186.0 أزال `PCFSoftShadowMap`، فنستعمل `PCFShadowMap`.

### 1.3 الأحجام وسقف الصفحة

قياس من ملفات `next build` في بناء معزول (HEAD `5ac09eb` مع التجربة فقط)، وgzip بالمستوى 6 للملف كاملًا:

| الجزء | خام | gzip | brotli-11 |
|---|---:|---:|---:|
| three | 556,204 | 138,040 | 112,671 |
| محرك التجربة (مع zod والتصاميم) | 140,158 | 37,631 | 32,244 |
| واجهة التجربة | 12,545 | 4,645 | 4,072 |
| **JS اللعبة دون Rapier** | | **180,316** (السقف 300,000) | |
| Rapier العادية كاملة | 2,717,252 | 975,081 | 719,208 |
| JS التحميل الأول لمسار التجربة (مع تخطيط الإدارة) | 620,669 | 193,233 | |
| **صفحة المستوى كاملة (JS وWASM)** | | **1,348,630** | |
| المنقول فعلًا من `next start` (مع HTML وCSS والخطوط، وسيط 3 تحميلات باردة) | | 1,547,394 | |

**السقوف المعتمدة:**
- JS اللعبة دون Rapier ≤ **300,000** بايت gzip.
- صفحة المستوى (JS أولي + JS اللعبة + Rapier + WASM) ≤ **1,500,000** بايت gzip. الهامش 151,370 بايت لنمو JS اللعبة حتى سقفه. حزمة `-compat` وحدها تبلغ 1,668,785، فتتجاوز السقف، وهذا سبب ثانٍ لاستبعادها من العميل.
- المنقول الكلي يُسجَّل في `PERF.md` للمعلومية، بلا سقف ملزم.

### 1.4 الحتمية

| المنصة | العادية | compat |
|---|---|---|
| Node v22.23.4، 25 تشغيلًا لكل تصميم + 3 داخل العملية + عملية جديدة | 8/8 | 8/8 |
| Chromium 153 (Playwright، SwiftShader) | 8/8 = الذهبية | 8/8 |
| WebKitGTK 2.52.6 (JavaScriptCore، Linux x86_64) | 8/8 | 8/8 |
| مسار الخادم في `next start` | 8/8 | — |
| **Safari على iPhone (ARM64)** | **معلّق**: تنزيل WebKit لـ Playwright محجوب (403). يقيسه المالك من أداة التشخيص | |

البصمات الذهبية (FNV-1a 32 بت على بتات float32، بالبذرة 20261106): `37be6208`، `930c2a5c`، `e0a09933`، `3a1c99ea`، `b45d09f4`، `cec3545d`، `94fa983e`، `2666ac7d`.

**حساسية البذرة:** بتغيير البذرة إلى 20261107 تغيّرت البصمة في 8/8، وفشل الحل في 3/8، لأن تيار `sim` يغيّر الدوران الابتدائي للقذيفة بين −2 و+2 راد/ث. **القرار المقترح (سؤال ج10 في PLAN):** تيار `sim` لا يمس مسار القذيفة ولا الأجسام. البذرة تُستعمل لتيار `render` ولاختيار الأسئلة، وتدخل في البصمة. ويتحقق `validate-levels.ts` من الحل المرجعي على 16 بذرة.

### 1.5 سياسة الاختلاف (§6.5)

لم يظهر أي اختلاف في المنصات المقيسة، **فالحتمية الكاملة هي الأساس**، وتُبنى السياسة بديلَ طوارئ:
- تُحفظ كل الطلقات (`game_run_shots`) دائمًا.
- عند `/finish`: إن أعلن العميل `cleared` ولم تحققه إعادة الخادم، تُقبل النتيجة إن تحققت **شروط المعقولية** كلها:
  1. كل طلقة مرت بفحص `/shots` (الفهرس والنوع من ذخيرة منحها الخادم، والمدى، والطور). هذا مضمون بالبناء.
  2. عدد الطلقات ≤ `slots + 1` (الافتتاح لا يستهلك خانة).
  3. الزمن بين طلقتين متتاليتين بوقت الخادم ≥ 1,000ms، وزمن الجولة ≥ 10 ث.
  4. `afterShotIdx` يشير إلى طلقة مسجلة.
  5. أقل من 3 جولات بـ `replay_mismatch` للطالب نفسه في آخر 24 ساعة.
- عند القبول: يُضبط `replay_mismatch = true` ويُحفظ `user_agent`، **ولا يُبلَّغ الطالب بفشل** بعد أن رأى النجاح.
- إن فشل أي شرط: لا نجمة إتمام ولا نقاط شروق، وتُعرض النتيجة «كِدت!» بلا اتهام.
- إن أظهر فحص iPhone أو Android لدى المالك اختلافًا، تصير هذه السياسة **الأساس**، ويُوثَّق القرار في هذا القسم.

### 1.6 CSP

السياسة الحالية في `src/proxy.ts` (`'wasm-unsafe-eval'` و`worker-src 'self' blob:`) تكفي للحزمتين، فلا يُضاف `'unsafe-eval'`. الانتهاك الوحيد المقيس كان من zod 4 (`Function("")`)، فلا zod في حزمة العميل (§2.3).

---

## 2. تخطيط الوحدات

```
src/game/                      نقي: بلا react ولا next ولا server-only ولا @/server
  brand.ts                     GAME_NAME = "شُهُب فرقد" وبديلاه (ثابت)
  core/                        rng.ts (mulberry32 بتيارين sim/render)، hash.ts (FNV-1a)، aim-table.ts
                               + aim-table.generated.ts، level-types.ts، materials.ts، physics-adapter.ts،
                               sim.ts، run-headless.ts. Rapier يُحقن من الخارج ولا يُستورد هنا
  core/level-schema.ts         zod: يستورده الخادم والسكربتات والاختبارات فقط، لا render ولا input
  rules/                       stars.ts، streak.ts، unlock.ts، mastery.ts، qualifying.ts، selection-order.ts،
                               age-profile.ts (من grades.level)، sunrise-points.ts
  session/                     reducer.ts: (state, event) → { state, effects }، وphases.ts وevents.ts
  render/                      three فقط هنا: scene.ts، toon.ts، sky.ts (أشرطة الشروق)، water.ts، quality.ts
  input/                       drag.ts (تكميم السحب إلى angleStep/powerStep)، keyboard.ts
  audio/                       sfx.ts (WebAudio، كتم، بلا موسيقى)
  levels/*.json + index.ts     التصاميم بإصداراتها
  create-game.ts               createGame({ canvas?, layout, seed, quality }) → { dispatch, on, destroy }
  load-engine.ts               import("three") و import("@dimforge/rapier2d-deterministic") للعميل
src/server/questions/          server-only: curriculum.ts، questions.ts، review.ts، content-hash.ts،
                               serialize.ts (toClientQuestion)، grade.ts (gradeAnswer)، select.ts،
                               [B] import-csv.ts، reports.ts، stats.ts
src/lib/csv.ts                 [B] محلل RFC 4180 نقي ومُختبَر، وتحييد الخلايا (= + - @) في التصدير
src/server/game/               server-only: access.ts (hasGameAccess)، route.ts (gameRoute)، runs.ts، answers.ts،
                               shots.ts، finish.ts، rapier.ts (يحمّل -compat فقط)، progress.ts، levels.ts، worlds.ts
src/app/api/game/              Route Handlers (§6)
src/app/(play)/play/           layout.tsx، page.tsx (الصف ثم العوالم)، [worldId]/page.tsx (خريطة SVG من الخادم)،
                               level/[levelId]/page.tsx (ملء الشاشة على نمط (reader))، [B] review/page.tsx
  level/[levelId]/game-shell.tsx   "use client": dynamic(() => import("./game-stage"), { ssr: false })
src/app/admin/curriculum/      للمالك فقط: الكتب والوحدات والدروس واستيراد الفهرس
src/app/admin/questions/       للمالك والمعلم في مواده: القائمة والإنشاء والتعديل والنسخة الجديدة، [B] import/
src/app/admin/game/            للمالك فقط: العوالم والمستويات ومانع النشر والجاهزية، وdiagnostics/
tests/fixtures/game-solutions/ <layout>@<version>.json: الحل بخطوات المنزلقين والبصمة الذهبية
scripts/validate-levels.ts     مخطط + سكون + حل مرجعي على 16 بذرة + بصمة ذهبية
scripts/demo-game.ts           بيانات demo، ويرفض NODE_ENV=production
```

### 2.1 حدود يفرضها اختبار (`tests/unit/game-boundaries.test.ts`)

- `src/game/**` لا يستورد `react` ولا `next` ولا `server-only` ولا `@/server`.
- `three` يُستورد في `render/` و`load-engine.ts` فقط. و`@dimforge/*` يُستورد في `load-engine.ts` و`src/server/game/rapier.ts` فقط.
- `core/level-schema.ts` (zod) لا يستورده `render/` ولا `input/` ولا `create-game.ts`.
- `core/` و`rules/`: من `Math` يُسمح فقط بـ `abs` `min` `max` `floor` `ceil` `round` `trunc` `sign` `sqrt` `imul` `fround`. ويُمنع `**` و`Date` و`performance` و`crypto.getRandomValues`، والمسافات تُقارن بمربعاتها. هذا تعميم لـ `scripts/game-spike/whitelist-check.mjs` الذي فحص 14 ملفًا فوجد 0 مخالفات، وكشف ملفًا اختباريًا مزروعًا.

### 2.2 الآلة والمحرك

- الأطوار المخزنة على الخادم (`game_runs.phase`): `opening`، `question`، `aim`، `flight`، `sunrise`، `finished`. والطور `settle` يعيش في مختزِل العميل فقط، ويغطيه `flight` على الخادم، لأن الخادم لا يرى سكون الأجسام. المختزِل في `src/game/session/` واحد للعميل والخادم.
- خطوة ثابتة 1/60، و4 تكرارات حل. لا إطلاق قبل نوم كل الأجسام 30 خطوة متتالية، أو 900 خطوة حدًا أقصى. وحد خطوات إعادة الخادم `(shots + 1) × 900 + 10`.
- المدخلات أعداد صحيحة: `{ idx 0..20, ammo, angleStep 0..80, powerStep 0..40, activateAt -1..900 }`. والتحويل إلى سرعة بجدول cos/sin صحيح (× 1e6).
- التصاميم: إحداثيات صحيحة بالسنتيمتر، و`bodies` ≤ 90 جسمًا ديناميكيًا مع القناديل، وأجسام وتماسات بترتيب ثابت، والشظايا مرئية فقط، و**الجودة لا تمس الفيزياء**.
- `createGame` يُشترك فيه من React عبر `useSyncExternalStore`، ويتحمل التركيب المزدوج في `reactStrictMode: true`: `destroy()` يُحرر الموارد، ويُستدعى `forceContextLoss`.

---

## 3. الإعدادات و`hasGameAccess()`

### 3.1 المفاتيح في `settings.ts` (في `settingsSchema` و`DEFAULT_SETTINGS` فقط)

| المفتاح | النوع | الافتراضي | يُدار من |
|---|---|---|---|
| `games_enabled` | `z.boolean()` | `false` | `/admin/settings`، قسم «الألعاب»: «تفعيل الألعاب» |
| `game_access` | `z.enum(["free", "subscribers_only"])` | `"free"` | القسم نفسه: «الوصول: مجانية لكل الطلاب المسجلين / للمشتركين فقط» |
| `hide_textbook_exercises` | `z.boolean()` | `false` | مفتاح للمالك في `/admin/questions` |

الحفظ بنمط `saveSettingsAction` ← `saveSettings()` مع `audit({ action: "settings.games" })`. **السريان الفوري مُتحقق منه:** `getSettings()` مغلّفة بـ `cache` من React، أي لكل طلب على حدة، و`grep` على `src/` لم يجد `unstable_cache` ولا `"use cache"` ولا `revalidate`، وكل المسارات ديناميكية (ƒ) في البناء. اختبار تكامل يقلب المفتاح ثم يطلب مباشرة بلا انتظار.

### 3.2 `hasGameAccess(userId)` في `src/server/game/access.ts`

```ts
type GameAccess =
  | { ok: true; preview: boolean }
  | { ok: false; reason: "inactive" | "disabled" | "subscribers_only" };
```

تُقيَّم الشروط بهذا الترتيب:
1. المستخدم غير موجود أو `is_active = false` ← `inactive`.
2. `role = 'admin'`، أو `role = 'teacher'` وله ملف `teachers` بوضع `self_managed` ← `{ ok: true, preview: true }` **دائمًا**، حتى لو كانت الألعاب مطفأة. جولاتهم `is_preview` خارج التقدم والإحصاءات.
3. `games_enabled = false` ← `disabled`.
4. `game_access = 'free'` ← `{ ok: true, preview: false }`.
5. `game_access = 'subscribers_only'`: يكفي وجود صف واحد في `entitlements` بـ `user_id` الطالب، و`revoked_at is null`، و`(expires_at is null or expires_at > now())`، و`source in ('purchase','bundle','manual')`. صلاحية `free` لا تكفي. وإلا ← `subscribers_only`.

استعلام قراءة فقط داخل `src/server/game/`، ولا تعديل على `src/server/access/`. تُستدعى الدالة في كل صفحة `(play)` وكل مسار `/api/game/**`، وفي `SiteHeader` لإظهار الرابط.

| النتيجة | الصفحات | الواجهات البرمجية |
|---|---|---|
| `disabled` | `notFound()` (404) | 403 `{ error: "games_disabled" }` |
| `subscribers_only` | رسالة هادئة «الألعاب متاحة للمشتركين»، بلا أسعار ولا زر شراء ولا روابط سلة | 403 `{ error: "subscribers_only" }` |
| `inactive` | تحويل إلى الدخول (السلوك القائم) | 401 |

غير المشترك لا يرى نقاط الدخول: الرابط في `header.tsx` و`mobile-nav.tsx` مشروط بـ `ok`.

---

## 4. نموذج البيانات

**قواعد عامة للترحيلين:** كل جدول له `created_at` و`updated_at` ومشغّل `set_updated_at()` (الدالة من `0001_init.sql`). المعرفات `uuid default gen_random_uuid()`. لا تغيير لأي صف قائم ولا لأي ترحيل قديم. وفي آخر كل ترحيل كتلة RLS منسوخة من `0002_teachers_videos.sql` (الأسطر 202–216): `enable row level security` لكل جدول جديد، ثم `revoke all … from anon/authenticated` إن وُجد الدوران.

### 4.1 `0007_question_bank.sql`

| الجدول | الأعمدة الأساسية | القيود والفهارس |
|---|---|---|
| `textbooks` | `subject_id` → `subjects` (restrict)، `term smallint`، `title`، `edition text`، `is_current bool`، `rights_confirmed_at/by`، `created_by` | `check (term in (1,2))`، `title` 3–160، `edition` 1–40، `unique (subject_id, term, edition)`، **جزئي** `unique (subject_id, term) where is_current` |
| `curriculum_units` | `textbook_id` (restrict)، `number smallint`، `title`، `sort_order` | `number` 1–60، `unique (textbook_id, number)` |
| `curriculum_lessons` | `unit_id` (restrict)، `number`، `title`، `page_start`، `page_end`، `sort_order` | `page_start ≥ 1`، `page_end ≥ page_start`، `unique (unit_id, number)` |
| `questions` | `lesson_id` → `curriculum_lessons`، `page int not null`، `exercise_ref` ≤40، `source_kind`، `type`، `lang`، `stem` ≤400، `explanation` 20–600، `hint` ≤200، `difficulty` 1–3، `status`، `teacher_id` (null لمحتوى المنصة)، `created_by`، `submitted_at`، `reviewed_at/by`، `review_note` ≤2000، `revision_of` → `questions`، `content_hash char(64)`، `rights_confirmed_at/by`، `paused bool`، `paused_reason`، `published_at` | `source_kind in ('textbook_exercise','textbook_based','teacher_original','demo')`، `type in ('mcq','true_false')`، `lang in ('ar','en')`، `status in ('draft','in_review','published','archived')`، `paused_reason in ('reports','owner')`، `check (status in ('draft','archived') or rights_confirmed_at is not null)` |
| `question_choices` | `question_id` (cascade)، `position smallint 1..4`، `body` 1–200، `is_correct bool` | `unique (question_id, position)`، **جزئي** `unique (question_id) where is_correct` |
| `question_reports` | `question_id`، `user_id` (cascade)، `attempt_id` → `question_attempts`، `reason`، `status`، `resolved_by/at` | `reason in ('wrong_key','unclear','typo','wrong_reference','not_in_lesson','inappropriate')` بلا نص حر، `status in ('open','resolved','dismissed')`، **جزئي** `unique (question_id, user_id) where status = 'open'` |
| `question_attempts` | `question_id` (restrict)، `user_id` (cascade)، `lesson_id`، `context_type`، `game_run_id`، `seq smallint`، `choice_order uuid[]`، `is_challenge`، `is_preview`، `chosen_choice_id`، `is_correct`، `first_attempt`، `qualifying`، `served_at`، `shown_at`، `answered_at`، `response_ms`، `voided_at` | `context_type in ('game','review')`، `check (context_type <> 'game' or game_run_id is not null)`، `check (answered_at is null or shown_at is not null)`، `response_ms between 0 and 600000`، `cardinality(choice_order) between 2 and 4` |

**فهارس جزئية للبنك:**
- `questions (lesson_id, difficulty) where status = 'published' and not paused`: للاختيار ولمانع النشر.
- `questions (submitted_at) where status = 'in_review'`: لطابور المراجعة والشارة.
- `questions (teacher_id, status)`: لقائمة المعلم.
- `questions (content_hash)`: لكشف المكرر، **غير فريد**، لأن النسخة الجديدة تبدأ بمحتوى مطابق لأصلها.
- `unique (revision_of) where status in ('draft','in_review')`: نسخة مفتوحة واحدة لكل سؤال.
- `question_attempts (user_id, lesson_id, answered_at desc) where qualifying and not is_preview`: للإتقان (آخر 8 إجابات).
- `question_attempts (user_id, question_id, answered_at desc) where answered_at is not null`: لترتيب الاختيار.
- `unique (game_run_id, question_id) where game_run_id is not null and voided_at is null`: لا تكرار في الجولة.
- `unique (game_run_id) where answered_at is null and voided_at is null`: سؤال معلّق واحد في الجولة.
- `question_attempts (question_id) where first_attempt and not is_preview`: للإحصاءات.

**مشغّلات القاعدة:**
- `check_question_ready()`: قبل أي `insert` أو `update` يجعل `status` يساوي `in_review` أو `published`. يتحقق أن `page` بين `page_start` و`page_end` للدرس، وأن الخيارات 2–4 لـ `mcq` و2 بالضبط لـ `true_false`، وأن هناك خيارًا صحيحًا واحدًا، وأن طول الشرح 20–600. وفي صفوف الابتدائي (`grades.level` ≤ 5) لا تزيد خيارات `mcq` على 3.
- `freeze_published_question()`: يرفض تعديل `stem` و`explanation` و`hint` و`page` و`type` و`lesson_id` حين تكون الحالة `published` أو `in_review`. المسموح فقط: `status` و`paused` و`paused_reason` وحقول المراجعة. والتعديل يكون بنسخة جديدة (`revision_of`).
- `freeze_choices()`: يرفض `insert` و`update` و`delete` على خيارات سؤال حالته غير `draft`.
- السؤال الذي له محاولات يُؤرشف ولا يُحذف (`question_attempts.question_id … on delete restrict`).

**المرجع المعروض بعد الإجابة** يُبنى من الربط `question → lesson → unit → textbook → subject → grade`، مثل: «كتاب العلوم، الصف السابع، الفصل الأول، الوحدة ٢، الدرس ٣، ص ٤٥».

**`content_hash`:** SHA-256 لنص مطبّع. التطبيع: NFKC، وحذف التشكيل والتطويل، وتوحيد الألف والياء والتاء المربوطة، وتحويل الأرقام العربية الهندية إلى لاتينية، وتوحيد المسافات، وأحرف صغيرة. والنص هو `stem` ثم الخيارات **مرتبة** حتى لا يتهرب منه تبديل ترتيبها. الصياغة المعدّلة من الكتاب لا يكشفها الـ hash، فيكشفها المراجع.

### 4.2 `0008_game.sql`

| الجدول | الأعمدة الأساسية | القيود والفهارس |
|---|---|---|
| `game_worlds` | `subject_id` (restrict)، `term`، `title`، `is_published`، `sort_order` | `unique (subject_id, term)`. اللون من `SUBJECT_TONES` بـ `subjects.slug`، بلا عمود |
| `game_levels` | `world_id` (restrict)، `lesson_id` → `curriculum_lessons` أو `unit_id` → `curriculum_units`، `layout_key`، `layout_version smallint`، `status`، `sort_order` | `check (num_nonnulls(lesson_id, unit_id) = 1)`، `layout_key ~ '^[a-z0-9-]{1,48}$'`، `status in ('draft','published','archived')`، **جزئيان** `unique (world_id, lesson_id) where lesson_id is not null` و`unique (world_id, unit_id) where unit_id is not null`. «قيد التحديث» حالة محسوبة لا عمود (§5.5) |
| `game_runs` | `user_id` (cascade)، `level_id` (restrict)، `layout_key`، `layout_version` (لقطة)، `seed bigint`، `mode`، `phase`، `outcome`، `is_preview`، `slots`، `slots_used`، `next_shot_idx`، `pending_ammo`، `special_kind`، `special_stock`، `streak`، `challenge_used`، `cleared_after_shot`، `stars_mask`، `points`، `client_hash`، `server_hash`، `replay_mismatch`، `user_agent` ≤300، `expires_at`، `ended_at`، `last_shot_at` | `seed between 0 and 4294967295`، `mode in ('play','questions')`، `phase in ('opening','question','aim','flight','sunrise','finished')`، `outcome in ('cleared','failed','abandoned','expired')`، `special_stock between 0 and 2`، `stars_mask between 0 and 7`، `expires_at default now() + interval '2 hours'`، **جزئي** `unique (user_id) where ended_at is null` (جولة نشطة واحدة لكل طالب) |
| `game_run_shots` | `run_id` (cascade)، `idx smallint`، `ammo`، `angle_step`، `power_step`، `activate_at`، `attempt_id` → `question_attempts` (null للافتتاح) | `primary key (run_id, idx)`، `ammo in ('meteor','pebble','heavy','comet','dawn')`، `angle_step 0..80`، `power_step 0..40`، `activate_at -1..900` |
| `game_progress` | `user_id`، `level_id`، `stars_mask`، `qonly_passed`، `fail_streak`، `best_shots`، `best_points`، `runs_count`، `badges text[]`، `completed_at` | `primary key (user_id, level_id)`، `stars_mask 0..7`، `badges <@ array['farqad_throw']` |

وأيضًا: `alter table question_attempts add foreign key (game_run_id) references game_runs(id) on delete cascade`. هذا الجدول أنشأه `0007` على فرعنا نفسه، لا جدول قائم.

قناع النجوم: `1` الإتمام، و`2` المعرفة، و`4` المهارة. يُجمع في `game_progress` بـ `stars_mask | new_mask`.

---

## 5. القواعد على الخادم

### 5.1 النجوم والشارة (`rules/stars.ts`)

- **الإتمام:** تحقق الهدف (مقبولًا بإعادة الخادم أو بسياسة الاختلاف) مع **3 إجابات جولة** على الأقل.
- **المعرفة:** دقة إجابات الجولة ≥ 80% على **5** إجابات على الأقل. إجابة الجولة هي أول إجابة عن كل سؤال فيها.
- **المهارة:** الإتمام بعدد طلقات ≤ `par`، والعدد يشمل الافتتاح والحصى.
- **«رمية الفرقد»:** الهدف بطلقة واحدة. شارة، لا نجمة.
- **النقاط:** للمتعة فقط، تُعرض بـ `ar()`، والمعدودات بـ `count` و`countParts` من `src/lib/design.ts`.

### 5.2 الذخيرة والتحدّي (`rules/streak.ts`)

- الإجابة الصحيحة تمنح شهابًا، والخاطئة حصاة.
- ثلاث صحيحة متتالية، أو تحدٍّ صحيح، تضيف قذيفة خاصة من `streakReward`، واثنتان مخزنتان على الأكثر. استعمالها يستبدل نوع طلقة الخانة ولا يضيف طلقة.
- التحدّي مرة في الجولة، **قبل** حدث `shown`، ويظهر زره فقط إن وُجد سؤال صعوبة 3 لم يُطرح.
- في الابتدائي (`age-profile.ts` من `grades.level`) لا قذائف خاصة معقدة: لا مذنّب.

### 5.3 التعريفات والإتقان

- **الإجابة المؤهلة:** أول ظهور للسؤال لهذا الطالب، أو ظهوره بعد 24 ساعة على الأقل من آخر إجابة صحيحة عليه. تُحسب عند الإجابة وتُخزن في `qualifying`.
- **`first_attempt`:** أول إجابة على هذا الإصدار إطلاقًا، للإحصاءات فقط.
- **الإتقان:** من آخر 8 إجابات مؤهلة في الدرس، بلا معاينات. 80% فأكثر «متقن»، و50–79% «يتقدّم»، وأقل من 50% «يحتاج مراجعة»، وأقل من 4 إجابات «بيانات قليلة».

### 5.4 الفتح (`rules/unlock.ts`)

- المستوى مكتمل بنجمة الإتمام أو بـ `qonly_passed`.
- أول مستوى في الوحدة مفتوح دائمًا. وغيره يُفتح باكتمال أقرب مستوى **منشور** قبله بـ `sort_order`. والتحدّي يُفتح باكتمال كل مستويات دروس الوحدة المنشورة.
- بعد 3 إخفاقات متتالية في المستوى (`fail_streak ≥ 3`) يطول دليل التصويب وتُضاف خانة.

### 5.5 اختيار الأسئلة (`src/server/questions/select.ts` مع `rules/selection-order.ts`)

- المصدر: أسئلة الدرس (أو دروس الوحدة في التحدّي) بحالة `published`، و`not paused`، وتُستبعد `textbook_exercise` إن كان `hide_textbook_exercises` مفعّلًا.
- الترتيب الحتمي: ما لم يُرَ أولًا، ثم ما أُجيب خطأ قبل يوم أو أكثر، ثم الأقدم رؤية. وداخل كل طبقة يُرتب بـ `fnv1a(seed, question_id)`.
- الصعوبة متكيفة: تبدأ من 1، وترتفع بعد صحيحتين، وتنزل بعد خطأ، بين 1 و3.
- لا تكرار في الجولة (فهرس فريد)، و`true_false` ≤ 30% مما يُقدَّم في الجولة.
- **مانع النشر:** المستوى لا يُنشر إلا بـ 8 أسئلة منشورة قابلة للتقديم على الأقل، بمستويي صعوبة على الأقل. و`/admin/game` يعرض الناقص بالضبط.
- **قيد التحديث:** إن قل المتاح عن 5، يرد `POST /runs` بـ 409 `level_updating`، والجولات النشطة تكمل بما قُدّم أو تنتهي بلا عقاب، ويظهر التنبيه للمالك في `/admin/game`.

---

## 6. الواجهات البرمجية

### 6.1 ترتيب التحقق في كل مسار (`gameRoute()` في `src/server/game/route.ts`)

على نمط `src/app/api/progress/route.ts`، مع إضافة حد المعدل والوصول:

1. `isSameOriginRequest(req)` لكل `POST` ← 403.
2. `getCurrentUser()` ← 401.
3. zod `safeParse` للجسم وللمعاملات (`await ctx.params`، وuuid) ← 400.
4. `hitRateLimit(\`game:<route>:<userId>\`, limit, window)` ← 429 مع `Retry-After`.
5. `hasGameAccess(user.id)` ← 403 (§3.2).
6. المجال: الملكية `where id = $run and user_id = $user` وإلا 404، ثم الصلاحية `expires_at > now()` وإلا 409 `expired`، ثم الطور وإلا 409 `bad_phase`، ثم فتح المستوى وإلا 404.

دوال المجال `server-only`، تستقبل `SessionUser` ولا تقرأ الكوكي. التعديلات داخل `sql.begin`، بلا أقفال جلسة، لأن مجمّع Supabase يعمل بوضع transaction.

### 6.2 الجدول

| المسار | المدخل | المخرج | الطور المطلوب ← بعده | الحد (طلب/نافذة) | قواعد النزاهة |
|---|---|---|---|---|---|
| `POST /api/game/runs` | `{ levelId, mode }` | `{ runId, layout, seed, slots, question }` | — ← `opening` | 30 / 10د | في معاملة واحدة: تُنهى النشطة السابقة `abandoned`، وتُنشأ الجديدة، ويُقدَّم أول سؤال (`served_at`). المستوى منشور ومفتوح، والبنك ≥ 5. البذرة من `crypto.randomInt` على الخادم |
| `GET …/runs/[id]` | — | حالة الاستئناف: الطور، والطلقات، والمعلق، والذخيرة | أي طور غير منتهٍ | 120 / 10د | [B] الاستئناف يعيد الطلقات دون عرض |
| `POST …/runs/[id]/challenge` | — | سؤال صعوبة 3 | `opening` أو `flight`، مع سؤال مقدَّم **لم يُعرض** | 10 / 10د | `challenge_used = false`. يُلغى المجلوب (`voided_at`) ويُقدَّم بديل `is_challenge = true` |
| `POST …/runs/[id]/attempts/[aid]/shown` | — | `{ ok }` | `opening` أو `flight` أو `sunrise` ← `question` | 120 / 10د | `shown_at = now()` مرة واحدة: `update … where shown_at is null` |
| `POST …/runs/[id]/answer` | `{ attemptId, choiceId }` | `{ correct, correctChoiceId, explanation, reference, grant, next }` | `question` ← `aim` (أو `sunrise`) | 120 / 10د | `choiceId ∈ choice_order` وإلا 400. التحديث ذري `where answered_at is null`. إعادة الإرسال تعيد النتيجة المخزنة بلا منح جديد. `grant` يُحسب من صف المحاولة (ومنه `is_challenge`) وحالة الجولة، لا من العميل. `next` سؤال يُجلب مسبقًا أثناء الطيران |
| `POST …/runs/[id]/shots` | `{ idx, ammo, angleStep, powerStep, activateAt }` | `{ ok }` | `opening` (و`idx = 0` و`meteor` مجانًا) أو `aim` ← `flight` | 60 / 10د | `update game_runs … where phase in (…) and next_shot_idx = $idx and expires_at > now() and (pending_ammo = $ammo or special_stock > 0 …) returning`، ثم إدراج الطلقة. التكرار بالحمولة نفسها يعيد `ok` بلا أثر، وبحمولة مختلفة 409 |
| `POST …/runs/[id]/cleared` | `{ afterShotIdx }` | `{ phase: "sunrise" }` | `flight` أو `question` أو `aim` ← `sunrise` | 30 / 10د | `afterShotIdx < next_shot_idx`. تُرفض أي طلقة بعدها |
| `POST …/runs/[id]/finish` | `{ clientHash }` | `{ stars, reasons, unlockedNext, badges }` | أي طور غير منتهٍ ← `finished` | 30 / 10د | `runHeadless` بـ `-compat` بحد خطوات، والتحقق من الهدف عند `afterShotIdx`، ثم سياسة الاختلاف (§1.5)، ثم النجوم من بيانات الخادم، وتحديث `game_progress` (إلا المعاينة). أسئلة الشروق: بعد 3 يجوز التخطي، والحد مجموع 5 في الجولة |
| [B] `POST /api/game/attempts/[aid]/report` | `{ reason }` | `{ ok }` | — | 10 / ساعة | للمحاولة صاحبها فقط. يتوقف السؤال (`paused_reason = 'reports'`) ببلاغات مفتوحة من 3 طلاب مختلفين لكل منهم محاولة عليه |

جولات المالك والمعلم `is_preview = true`، ومحاولاتها `is_preview = true`، فهي خارج التقدم والإتقان والإحصاءات.

### 6.3 `toClientQuestion()` (`src/server/questions/serialize.ts`): المسلسل الوحيد قبل الإجابة

```ts
type ClientQuestion = {
  attemptId: string;
  type: "mcq" | "true_false";
  lang: "ar" | "en";               // "en" يُعرض بـ dir="ltr"
  stem: string;
  hint: string | null;
  isChallenge: boolean;
  choices: { id: string; label: "أ" | "ب" | "ج" | "د"; text: string }[]; // بترتيب attempt.choice_order
};
```

- `choice_order` يُخلط على الخادم عند التقديم، بـ `fnv1a(seed, attemptId)`. والمعرّفات معرّفات `question_choices` لهذا الإصدار.
- **ممنوع في المخرج:** `is_correct`، و`explanation`، و`page`، و`exercise_ref`، والمرجع، و`teacher_id`، و`content_hash`، و`difficulty`، و`source_kind`.
- اختبار وحدة يتحقق من قائمة المفاتيح بالضبط، ومن أن ترتيب الخيارات لا يكشف الصحيح: موضع الخيار الصحيح موزع بالتساوي على 1000 بذرة، بانحراف أقل من 5%.

### 6.4 `gradeAnswer()` (`src/server/questions/grade.ts`): السلطة الوحيدة للتصحيح

```ts
gradeAnswer(db: Db, input: { attemptId: string; userId: string; choiceId: string }): Promise<{
  correct: boolean;
  correctChoiceId: string;
  explanation: string;
  reference: { label: string; grade: string; subject: string; term: 1 | 2; unit: number; lesson: number; page: number; exerciseRef: string | null };
  isChallenge: boolean;   // من الصف المخزن
  firstAttempt: boolean;
  qualifying: boolean;
}>
```

عامة لكل `context_type` (اللعبة، ودفتر المراجعة، ولاحقًا المنافسة). حساب `grant` ليس من شأنها، بل من `src/server/game/answers.ts` فوقها.

---

## 7. التحميل الكسول وإثبات العزل

**التحميل:**
- صفحة المستوى مكوّن خادم يرسم بطاقة أهداف المستوى من الخادم، فتظهر مع FCP. القياس في التجربة: FCP نحو 650ms، والبطاقة نفسها ظهرت عند 1,690 إلى 1,780ms لأنها كانت تُركَّب على العميل.
- `game-shell.tsx` (`"use client"`) يستدعي `dynamic(() => import("./game-stage"), { ssr: false })`. و`game-stage` يستدعي `load-engine.ts`: `import("three")` و`import("@dimforge/rapier2d-deterministic")`، بمسارات نصية ثابتة.
- `webglcontextlost`، أو غياب WebGL2، ينقل إلى وضع الأسئلة فقط. ويتوقف الرسم عند إخفاء التبويب وعند سكون المشهد، وتُحرر الموارد عند المغادرة.

**إثبات العزل** (سكربت `scripts/game/check-bundle-isolation.mjs` مبني على `summarize-bundle.mjs` و`isolation-check.mjs`):
1. `npx next analyze --output --snapshot <phase>` ثم `npx next analyze export`. الشرط: وحدات `three` و`@dimforge/*` لا تظهر إلا في مسار المستوى (و`/admin/game/diagnostics`)، وفي مجموعات `async` فقط، لا في `bootstrap` ولا `render_dependent`. في التجربة كانت `offenders: []` على 65 مسارًا.
2. JS التحميل الأول لكل مسار قائم: يُقارن ببناء ضابط فيه المسار الجديد فارغًا (السؤال ج9)، ويُعرض الفرق مع الخط الأساس الحرفي للمعلومية. السبب أن أي مسار عميل يزيد كل مسار بـ +114 خامًا و+390 gzip.
3. Playwright في `06-game.spec.ts`: طلبات الشبكة في `/` و`/grades/grade-6` وصفحة منتج و`/library` لا تحوي أي طلب three أو Rapier أو `.wasm` (كانت صفرًا في التجربة).
4. `trace-report`: صفحة المستوى ≤ 400 ملف، ومسار `/finish` ≤ 200 ملف و20MB، وبلا ملف `.wasm` في التتبع. المقيس في التجربة 356 و116.

---

## 8. ميزانيات الأداء ومن يقيس

| الميزانية | السقف | المقيس في المرحلة 0 | من يقيس وكيف |
|---|---|---|---|
| JS اللعبة gzip دون Rapier | ≤ 300,000 | 180,316 | الوكيل: `measure-sizes` من `next build` |
| صفحة المستوى gzip مع WASM | ≤ 1,500,000 | 1,348,630 | الوكيل |
| أول بطاقة على Fast 4G | ≤ 2 ث | 1.69 إلى 1.78 ث (والمتوقع نحو 0.65 ث برسمها من الخادم) | الوكيل: CDP بكمون 165ms وتنزيل 1,012,500 بايت/ث |
| جاهزية المحرك مع خنق ×4 | ≤ 6 ث | 4,273ms وسيطًا | الوكيل |
| إعادة المحاكاة p95 | < 1.5 ث | أسوأ تصميم 186.3ms (compat) في Node، ومسار الخادم 7 إلى 147ms | الوكيل: `node-bench`، 25 تشغيلًا |
| fps بالجودة المنخفضة مع خنق ×4 | ≥ 30 | 59.6 على ملف الهاتف (SwiftShader) | الوكيل |
| fps على الجوالات المتوسطة | 60 | 25.3 بالجودة العالية برسم برمجي، وهو رقم غير ممثل | **المالك**: `?debug=perf` على جهازه |
| draw calls | ≤ 40 | 16 إلى 23 (`InstancedMesh` لكل مادة) | الوكيل |

**الجودة:** عالية (DPR حتى 2، وظلال، وتنعيم)، ومنخفضة (DPR 1، بلا ظلال ولا تنعيم)، ولا post-processing في الحالتين. والتلقائية تنزل إذا تجاوز وسيط الإطار 22ms، و`?quality=low` يفرض المنخفضة.
تُسجل الأرقام النهائية في `docs/game/PERF.md` من `next build` ثم `next start`، مع بيئة القياس (المعالج، وإصدار المتصفح، والرسم البرمجي).

---

## 9. الأمان وحماية الطالب

| الضابط | التنفيذ والتحقق |
|---|---|
| لا مفتاح إجابة قبل الإجابة | `toClientQuestion` هو المسلسل الوحيد، واختبار يفحص المفاتيح، واختبار e2e يفحص كل استجابة JSON قبل `answer` بحثًا عن `is_correct` و`explanation` |
| الذخيرة والنتيجة من الخادم | `grant` من صف المحاولة، و`/shots` ذري، والنجوم من `/finish` فقط |
| CSRF والجلسة | `isSameOriginRequest` في كل `POST`، و`"/play"` في `needsSession` في `proxy.ts`، و`getCurrentUser()` في كل مسار. وProxy ليس حدًا أمنيًا، فالتحقق داخل كل مسار |
| الملكية وعدم الكشف | الجولة أو المحاولة لغير صاحبها ترد 404، وسؤال معلم آخر يرد «غير موجود» كما في `assertProductAccess` |
| حد المعدل | `hitRateLimit` لكل مسار (§6.2)، و10 استيرادات CSV في الساعة |
| الإدارة | `/admin/curriculum` و`/admin/game` في `OWNER_ONLY_PREFIXES`، والإجراءات عبر `adminAction` و`staffAction`، وكل تغيير حالة بـ `audit()` |
| CSV [B] | ≤ 500 صف و1MB، يُرفض قبل التحليل في الواجهة والخادم دون تغيير `bodySizeLimit` (2mb). UTF-8 فقط (يُقبل BOM)، وWindows-1256 يُرفض برسالة عربية. وتحييد الخلايا البادئة بـ `= + - @` في التصدير |
| CSP | بلا `'unsafe-eval'`، وبلا zod على العميل |
| فهرسة | `/play/:path*` في رؤوس `noIndex` في `next.config.ts` |
| القاصرون | لا إعلانات ولا مشتريات ولا عملات ولا عشوائية في المكافآت ولا «طاقة» ولا انتظار ولا سلاسل يومية ولا إشعارات ولا مؤقت أسئلة ولا لوحات صدارة ولا دردشة ولا نص حر يراه طالب آخر (البلاغات بأسباب محددة). اختبار e2e يفحص HTML صفحات `/play` فلا يجد سعرًا (`د.ك` أو `price`) ولا `/cart` ولا `/checkout` ولا `/products` ولا رابطًا خارجيًا |
| الحركة | لا وميض فوق 3 مرات في الثانية (تدقيق `scratchpad/judge3/audit-{a,b,c}.json`: `fastInfinite` فارغ في الشاشات الخمس لكل اتجاه)، و`prefers-reduced-motion`، وتذكير استراحة قابل للإغلاق بعد 25 دقيقة متواصلة |
| الطرف الثالث | لا SDK تحليلات ولا إعلانات ولا خطوط أو أصول خارجية. الأصول إجرائية بالكود وموثقة في `ASSETS.md` |
| الأصالة | فحص `grep` في البوابة على أسماء الألعاب التجارية المعروفة وكلمات الثيم الممنوع (§3) في `src/game` و`src/app/(play)` و`docs/game` |

---

## 10. استراتيجية الاختبار

| الطبقة | الملفات | ما تغطيه |
|---|---|---|
| وحدة (`tests/unit/`) | `game-determinism.test.ts` | لكل تصميم: الحل المرجعي يعطي البصمة الذهبية بـ `-compat`، ويحقق الهدف على 16 بذرة |
| | `game-whitelist.test.ts`، `game-boundaries.test.ts` | §2.1 |
| | `game-rules.test.ts`، `game-session.test.ts` | النجوم، والسلسلة، والفتح، والإتقان، والتأهيل، وترتيب الاختيار، وانتقالات المختزِل جدوليًا (كل طور مع كل حدث) |
| | `question-serialize.test.ts`، `content-hash.test.ts`، [B] `csv.test.ts` | عدم التسريب، والتطبيع، وRFC 4180 (اقتباس، وأسطر داخل الخلايا، وBOM، وCRLF، و1256)، والتحييد |
| تكامل (`tests/integration/`، PostgreSQL حقيقي `edu_test`) | `question-bank.test.ts` | قيود 0007، والمشغّلات، والسير، وعزل المعلم، و`audit` |
| | `game-access.test.ts` | كل حالات `hasGameAccess`: مطفأ، ومجاني، وغير نشط، ومشترك بـ `purchase` و`bundle` و`manual`، وصلاحية `free` فقط، ومسحوبة، ومنتهية، وغير منتهية، ومالك ومعلم وهي مطفأة، والسريان الفوري |
| | `game-runs.test.ts` | كل مسار في §6.2: الترتيب والرموز، والملكية، والطور، والانتهاء، والذرية (`Promise.all` لطلقتين بالفهرس نفسه تعطي صفًا واحدًا)، وإعادة الإرسال، والتحدّي، والشروق، وإعادة المحاكاة، وسياسة الاختلاف بكل شرط، والاختيار الحتمي، والجولة النشطة الواحدة، وقيد التحديث |
| e2e (`tests/e2e/06-game.spec.ts`، Chromium بـ SwiftShader، المشاريع الثلاثة) | | البذر في `beforeAll` (أو سطر `seedDemoGame()` في `global-setup.ts`). لعب مستوى كامل بالمنزلقات والأسهم والمسافة، والإجابة بالأرقام 1–4، والنتائج. ووضع الأسئلة فقط. والمفتاحان (مطفأ ← 404 و403، ومشتركون ← رسالة بلا أسعار). وتبويب الأسئلة في المراجعة. وطلبات الشبكة في الصفحات القائمة. وفحص HTML `/play` |
| سكربتات البوابة | `validate-levels.ts`، `check-bundle-isolation.mjs`، `trace-report`، `measure-sizes` | §7 و§8 |

**ثوابت:** لا تعديل لأي اختبار قائم ولا لأي `data-testid` قائم. معرّفات الاختبار الجديدة بالبادئة `game-` و`question-`. والاختبارات على قواعد `edu_test` وقاعدة E2E ببيانات وهمية فقط.
