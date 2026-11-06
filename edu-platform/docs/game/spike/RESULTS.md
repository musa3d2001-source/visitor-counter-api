# نتائج التجربة التقنية للمرحلة 0: «شُهُب فرقد»

> كود التجربة مؤقت ومعلَّم «[تجربة المرحلة 0]» في كل ملف، ويعيش في `src/app/admin/game/spike/` (للمالك فقط بـ `requireOwnerPage()`)
> و`scripts/game-spike/`. ليس كودًا إنتاجيًا، ويُحذف أو يُنقل إلى `src/game/` في المرحلة 2 بعد موافقة المالك.
> كل رقم هنا من أمر شُغّل فعلًا، والأوامر في القسم 14، والبيانات الخام في ملفات JSON بجانب هذا الملف.

## 0. الخلاصة والقرارات المقترحة

| القرار | المقترح | السند المقيس |
|---|---|---|
| حزمة Rapier للعميل | `@dimforge/rapier2d-deterministic` (العادية، `.wasm` مستقل) | أخف بـ 320,155 بايت gzip (975,081 مقابل 1,295,236)، والجاهزية أسرع بـ 445ms (وسيط 4,273 مقابل 4,718ms مع خنق ×4 وFast 4G)، وتعمل في Turbopack (dev وbuild) دون أي إعداد، ويُخدم الملف `application/wasm` ببصمة في اسمه ويُترجم بـ `instantiateStreaming`. **شرط:** تُحمَّل خلف `next/dynamic({ ssr: false })` فقط (القسم 7). |
| حزمة Rapier للخادم | `@dimforge/rapier2d-deterministic-compat` | البصمات مطابقة للعادية في 8/8 تصاميم. العادية في رسم الخادم تجعل تتبّع الملفات 13,724 ملفًا (652.2MB) للمسار، بينما `-compat` تجعله 116 ملفًا (5.5MB). |
| إصدار three | `0.186.0` (و`@types/three@0.186.0`) | `0.187.0` عمره 7 أيام (نُشر 2026-10-30) ويغيّر 15 ملفًا في `renderers/webgl` و174 سطرًا في `WebGLRenderer.js`، وفرق الحجم المجمّع لا يُذكر (−257 بايت gzip). `0.186.1` لا يغيّر `three.module.js` ولا `three.core.js` بايتًا واحدًا (تعديلاته في WebGPU فقط)، وليس له `@types/three` مطابق. |
| سقف صفحة المستوى | **1.5MB gzip شاملًا WASM** (1,500,000 بايت) | صفحة التجربة كاملة 1,348,630 بايت gzip بالحزمة العادية، مع هامش 151KB لنمو JS اللعبة حتى سقفها 300KB. `-compat` وحدها تبلغ 1,668,785 فتتجاوز السقف. |
| سياسة الاختلاف (§6.5) | **تبقى بديل طوارئ لا أساسًا**، مع حفظ المدخلات و`replay_mismatch` | لا اختلاف واحد في أي منصة قيست: Node (25 تشغيلًا لكل تصميم، 3 داخل العملية، وعملية جديدة)، وChromium 153، وWebKitGTK 2.52.6، ومسار الخادم، بالحزمتين. **مشروط** بفحص iPhone حقيقي لدى المالك (القسم 12)؛ إن اختلف تصير السياسة الأساس كما ينص الأمر. |

الميزانيات الأخرى من §6.6 مقيسة كلها ضمن حدودها: JS اللعبة دون Rapier 180,316 بايت gzip (السقف 300KB)، وأول بطاقة 1.69 إلى 1.78 ث على Fast 4G (السقف 2 ث)، وجاهزية المحرك 4.27 ث مع خنق ×4 (السقف 6 ث)، وأسوأ p95 لإعادة المحاكاة في Node 186ms (السقف 1.5 ث)، و59.6fps بالجودة المنخفضة على ملف الهاتف مع خنق ×4 (الحد الأدنى 30fps). الجودة العالية على الهاتف 25.3fps برسم برمجي (SwiftShader)، والرقم الحقيقي يقيسه المالك.

## 1. ما بُني (أقل ما يلزم، مطابقًا لبنية الأمر)

| الملف | الدور |
|---|---|
| `_engine/rng.ts` | مولّد mulberry32 مُبذَّر بتيارين مستقلين: `sim` (يحدد دوران القذيفة الابتدائي) و`render` (النجوم والشظايا). |
| `_engine/hash.ts` | `stateHash` بـ FNV-1a 32 بت على بتات float32، بايتًا بايتًا. |
| `_engine/aim-table.ts` و`aim-table.generated.ts` | `(angleStep 0..80, powerStep 0..40)` ← سرعة بجدول cos/sin صحيح (× 1e6) يولّده `scripts/game-spike/gen-aim-table.mjs` مرة واحدة خارج المحرك. |
| `_engine/level-schema.ts` | مخطط zod: `version`، `tier`، `slots`، `par`، `streakReward`، `bodies[]` (≤90 ديناميكيًا مع القناديل)، `lanterns[]`، بإحداثيات صحيحة بالسنتيمتر. |
| `_engine/materials.ts` | سعف، ساج، حجر بحري (لا يكسره إلا النيزك الثقيل)، زجاج هش، غيم شديد الارتداد، صندوق ضوء (نبضة نصف قطرها 3.2م تشعل الصناديق القريبة بعد 6 خطوات)، وثلاث قذائف: شهاب، حصاة، نيزك ثقيل. |
| `_engine/physics-adapter.ts` | `PhysicsAdapter` فوق Rapier2D: خطوة 1/60 ثابتة، 4 تكرارات حل، ترتيب أجسام بالإضافة، وأحداث قوة التماس مرتبة بالخانات. الحزمة تُحقن من الخارج. |
| `_engine/sim.ts` و`run-headless.ts` | المحاكاة وقاعدة السكون (30 خطوة نوم متتالية أو 900 حدًا)، و`runHeadless(R, layout, seed, shots) → { cleared, stateHash, steps, ... }`. |
| `_engine/load-rapier.ts` / `load-rapier-server.ts` | تحميل العميل (الحزمتان للمقارنة) / تحميل الخادم (`-compat` فقط). |
| `_render/scene.ts` | عارض three.js: `MeshToonMaterial` بتدرج 3 درجات، كاميرا منظورية مائلة، طبقات parallax (نجوم، تلال عامة، بحر، مستوى اللعب)، `InstancedMesh` لكل مادة، شظايا ونبضات مرئية فقط. جودتان: high (DPR حتى 2، ظلال، تنعيم) وlow (DPR 1، بلا ظلال، بلا تنعيم)، ولا post-processing في الحالتين. |
| `page.tsx`، `spike-client.tsx`، `spike-stage.tsx` | صفحة المالك، وغلاف `next/dynamic({ ssr: false })`، والواجهة التي تستورد المحرك وthree بـ `import()`. طبقة `?debug=perf`. |
| `replay/route.ts` | `POST` للمالك فقط: `isSameOriginRequest` ثم `assertOwner` ثم zod، ويعيد بصمات التصاميم الثمانية من Node. مقيس: بلا كوكي 307 إلى `/login`، وبلا Origin 403، وبجلسة غير صالحة 404، وجسم غير صالح 400، والمالك 200. |

القائمة البيضاء: `node scripts/game-spike/whitelist-check.mjs` فحص 14 ملفًا في `_engine` فوجد 0 مخالفات (الرمز 0)، وكشف ملفًا اختباريًا مؤقتًا فيه `Math.cos` و`**` و`Date` ثم حُذف.

### التصاميم الثمانية والحلول المرجعية (البذرة 20261106)

يولّدها `scripts/game-spike/gen-layouts.mjs`، ويبحث `solve-layouts.ts` عن الحل بخطوات المنزلقين. كلها مستقرة عند السكون (أقصى إزاحة قبل أي طلقة ≤ 7mm).

| التصميم | المستوى | أجسام ديناميكية | الحل (`idx:ammo(angle,power)`) | الطلقات / par | خطوات | انكسر في الإعادة |
|---|---:|---:|---|---:|---:|---|
| `t1-first-tower` | 1 | 7 | `0:meteor(2,28)` | 1 / 2 | 284 | لا شيء |
| `t1-glass-window` | 1 | 8 | `0:pebble(8,26) 1:meteor(23,14)` | 2 / 2 | 1,860 | زجاج 2 |
| `t2-teak-scaffold` | 2 | 25 | `0:meteor(17,22) 1:meteor(5,30)` | 2 / 3 | 691 | لا شيء |
| `t2-cloud-bounce` | 2 | 13 | `0:pebble(32,14) 1:meteor(47,10)` | 2 / 3 | 1,280 | زجاج 2 |
| `t3-stone-keep` | 3 | 34 | `0:meteor(2,26) 1:pebble(2,20) 2:heavy(5,26)` | 3 / 3 | 2,318 | حجر 3 (بالنيزك الثقيل) |
| `t3-lightbox-chain` | 3 | 47 | `0:pebble(5,24) 1:meteor(5,34)` | 2 / 2 | 1,430 | زجاج 2، صندوق ضوء 2، نبضتان |
| `t4-domino-row` | 4 | 44 | `0:meteor(35,18) 1:pebble(74,22) 2:meteor(29,18)` | 3 / 3 | 1,913 | زجاج 3، صندوق ضوء 1 |
| `t4-grand-observatory` | 4 | 90 | `0:meteor(11,30) 1:pebble(8,6) 2:meteor(38,28) 3:meteor(2,30)` | 4 / 4 | 1,626 | زجاج 2، صندوق ضوء 1 |

## 2. البيئة

Node v22.23.4 على Intel Xeon @ 2.10GHz (4 أنوية)، Next.js 16.4.4 (Turbopack)، three 0.186.0، Rapier 0.21.0،
Chromium 153.0.8010.12 (Playwright، `--use-angle=swiftshader --enable-unsafe-swiftshader`، أي رسم برمجي)، WebKitGTK 2.52.6 (MiniBrowser تحت Xvfb).
الخادم: `npx next build` ثم `npx next start -p 3200` (خادم التطوير على 3000 لم يُمس).

## 3. الحتمية

| المنصة | standard | compat | الطريقة |
|---|---|---|---|
| Node، 25 تشغيلًا لكل تصميم | 8/8 بصمة واحدة لكل تصميم | 8/8 | `node-bench.ts` |
| Node، 3 تشغيلات كاملة داخل العملية | متطابقة (مع بصمة كل طلقة) | متطابقة | `node-bench.ts` |
| Node، عملية ابن جديدة (تحميل بارد) | متطابقة (PID 9955) | متطابقة (PID 9976) | `spawnSync` |
| standard مقابل compat في Node | 8/8 متطابقة | | |
| Chromium 153 (المتصفح) | 8/8 = الذهبية | 8/8 = الذهبية | `browser-bench.mjs` |
| مسار الخادم (`next start`، Node، compat) | 8/8 = الذهبية | | `POST /admin/game/spike/replay` |
| WebKitGTK 2.52.6 (JavaScriptCore، Linux x86_64) | 8/8 = الذهبية | 8/8 = الذهبية | `webkit-bench.mjs` |
| Turbopack dev (Chromium) | 8/8 = الذهبية، والخادم (dev) 8/8 | 8/8 | فحص يدوي بـ Playwright |

البصمات الذهبية (`_engine/layouts/golden.json`): `37be6208`، `930c2a5c`، `e0a09933`، `3a1c99ea`، `b45d09f4`، `cec3545d`، `94fa983e`، `2666ac7d` بترتيب الجدول السابق.

**حساسية البذرة (مقيسة):** بالبذرة 20261107 بدل 20261106 تتغير البصمة في 8/8، ولا يتحقق الهدف في 3/8 (`t3-stone-keep`، `t4-domino-row`، `t4-grand-observatory`)، لأن تيار `sim` يغيّر دوران القذيفة بين −2 و+2 راد/ث والفيزياء فوضوية. النتيجة: الحل المرجعي والبصمة الذهبية لكل (تصميم، إصدار، بذرة)، و`validate-levels.ts` يجب أن يختبر الحلول على عدة بذور أو يقتصر أثر تيار `sim` على ما لا يمس قابلية الحل.

## 4. الأحجام (بناء معزول: `git archive HEAD` 5ac09eb + التجربة فقط)

السبب في البناء المعزول: وكلاء آخرون يضيفون `src/app/lab/game-a` و`game-b` في الشجرة نفسها وهما يستوردان three، فيكبر جزء three المشترك في الشجرة الحالية إلى 589,839 خامًا. البناء المعزول بلا تجربة طابق خط الأساس في 49/49 مسارًا بالبايت.

| الجزء (`.next/static/chunks`) | خام | gzip (مستوى 6) | brotli (11) | يُحمَّل في |
|---|---:|---:|---:|---|
| three 0.186.0 (`0v1bkmui2vb9f.js`) | 556,204 | 138,040 | 112,671 | async، صفحة التجربة فقط |
| غراء Rapier العادي + محمّل wasm (`3pncybfg3u04c.js`) | 280,931 | 50,538 | 37,722 | async |
| Rapier العادي `.wasm` (`23_rm5ep3f99q.wasm`) | 2,436,321 | 924,543 | 681,486 | `fetch` + `instantiateStreaming` |
| **Rapier العادي كاملًا** | 2,717,252 | **975,081** | 719,208 | |
| **Rapier compat** (`1o168rozd1yp6.js`، base64 داخل JS) | 3,449,903 | **1,295,236** | 954,936 | async |
| محرك التجربة (zod + التصاميم + المحاكاة) | 140,158 | 37,631 | 32,244 | async |
| واجهة التجربة (`spike-stage`) | 12,545 | 4,645 | 4,072 | async بـ `next/dynamic` |
| JS التحميل الأول لمسار التجربة (يشمل تخطيط الإدارة) | 620,669 | 193,233 | | أولي |

| المجموع (gzip) | standard | compat |
|---|---:|---:|
| JS اللعبة دون Rapier (three + المحرك + الواجهة) | 180,316 | 180,316 |
| صفحة التجربة كاملة (أولي + لعبة + Rapier) | **1,348,630** | **1,668,785** |
| المنقول فعلًا عبر `next start` (gzip من الخادم، يشمل HTML وCSS والخطوط، وسيط 3 تحميلات باردة) | 1,547,394 | 1,867,184 |

three 0.187.0 في البناء المعزول نفسه: 559,822 خامًا / 137,783 gzip (مقابل 556,204 / 138,040)، و`tsc --noEmit` نجح مع `@types/three@0.187.0`.

## 5. العزل

- **Bundle Analyzer** (`next analyze --output --snapshot spike` ثم `export`، 65 مسارًا): وحدات `three` و`@dimforge/rapier2d-deterministic` و`-compat` تظهر في مسار واحد فقط هو `/admin/game/spike`، وفي مجموعات `async` فقط. لا ظهور في أي `bootstrap` أو `render_dependent` (`isolation-analyzer.json`، `offenders: []`).
- **JS التحميل الأول للمسارات القائمة:** كل المسارات الـ49 زادت +114 بايت خامًا (+390 gzip) في البناء، و+52 بايت في المحلل. التجربة الضابطة تثبت أن السبب ليس three ولا Rapier: صفحة مالك تافهة فيها زر `useState` واحد فقط تعطي **الزيادة نفسها بالضبط** (+114 / +390)، لأن Turbopack يعيد تجميع الأجزاء المشتركة عند إضافة أي مسار عميل (جزء جديد بحجم 350 بايت لـ `HeadManagerContext`، وزيادة gzip سببها ملف إضافي). المقترح لبوابة المراحل: مقارنة المسارات القائمة ببناء ضابط فيه المسار الجديد فارغًا، لا بخط الأساس الحرفي.
- **الشبكة (Playwright):** في `/` و`/grades/grade-6` و`/products/...` و`/library`: صفر طلب لأي جزء three أو Rapier، وصفر `.wasm`.
- **فحص البناء:** `measure-sizes.mjs` لم يجد أي جزء three/Rapier ضمن JS التحميل الأول لأي مسار (`initialJsOffenders: []`).

## 6. Turbopack وWASM وCSP

| | dev (`next dev`) | build + start |
|---|---|---|
| العادية | تعمل: `200 application/wasm` من `/_next/static/chunks/node_modules_%40dimforge_..._05ek5-kaqh2we.wasm` | تعمل: `/_next/static/chunks/23_rm5ep3f99q.wasm` بـ `application/wasm` ومضغوط gzip من `next start`. محمّل Turbopack في العميل: `fetch(url)` ثم `WebAssembly.instantiateStreaming(i, r)` |
| compat | تعمل (لا طلب `.wasm`) | تعمل، `init()` يفك base64 داخل JS |
| إعداد إضافي | لا شيء (لا `turbopack.rules` ولا تعديل `next.config.ts`) | لا شيء |

**CSP:** السياسة الحالية في الإنتاج (`script-src 'self' 'nonce-…' 'strict-dynamic' 'wasm-unsafe-eval'`، `worker-src 'self' blob:`) تكفي للحزمتين. أول قياس سجّل انتهاكًا واحدًا لكل تحميل للمحرك (11 من 11 تحميلًا): `script-src` / `eval` من جزء المحرك عند العمود 4401، وتبيّن أنه فحص zod 4 الداخلي `Function("")` داخل `try/catch` لا WASM. بعد `z.config({ jitless: true })` في مدخل العميل فقط (`_engine/zod-jitless.ts`): **0 انتهاك** في كل القياسات اللاحقة. لم يُضف `'unsafe-eval'`. التوصية للإنتاج: لا zod في حزمة اللعبة على العميل (التصميم يصل مُتحققًا منه من الخادم)، أو `jitless`.

## 7. Node وVercel (تتبّع ملفات الخادم)

| التجربة | `page.js.nft.json` | `route.js.nft.json` | ملاحظة |
|---|---:|---:|---|
| A: العادية في رسم الخادم (الواجهة تستورد المحرك بـ `import()` عادي، والمسار يحمّل العادية) | 13,795 ملفًا، 653.9MB، 17 ملف wasm | 13,724 ملفًا، 652.2MB | تحذير Turbopack: `[turbopack-wasm]/node/loadWasm.ts:25:10` «The file pattern … matches 27420 files» (`build-warning-experiment-A.txt`) |
| النهائي: الواجهة خلف `next/dynamic({ ssr: false })`، والمسار بـ `-compat` | 356 ملفًا، 4.1MB، 0 wasm | 116 ملفًا، 5.5MB، 0 wasm | بلا أي تحذير بناء. للمقارنة `/admin/settings`: 367 ملفًا، 4.4MB |

- العادية تعمل وظيفيًا على الخادم: في `next dev` (قبل نقل الخادم إلى `-compat`) حمّلها مسار التجربة عبر محمّل Turbopack وأعاد 8/8 بصمات مطابقة. المشكلة في التتبّع والحجم لا في الصحة.
- `-compat` تُجمَّع داخل جزء الخادم (`server/chunks/…rapier2d-deterministic-compat…js` بحجم 3,449,891) فلا تعتمد على `node_modules` وقت التشغيل، ولا تحتاج `serverExternalPackages` ولا `outputFileTracingExcludes` (وكلاهما يتطلب تعديل `next.config.ts` غير المسموح الآن).
- تحميل `-compat` باردًا في Node: 97ms داخل العملية، و108ms في عملية جديدة، و97ms في أول طلب لمسار `next start`.
- حد حجم دوال Vercel المعروف (250MB غير مضغوط) من توثيقها العام، لا من قياس هنا؛ التجربة A تتجاوزه بوضوح، والنهائي بعيد عنه.
- المهم للمرحلة 3: أي ملف يستورد الحزمة العادية يجب ألا يصل إلى رسم SSR أو مسار خادم؛ اختبار `trace-report.mjs` يصلح بوابةً (عدد ملفات التتبع لصفحة المستوى ومسار `/finish`).

## 8. الأداء

### إعادة المحاكاة في Node (25 تشغيلًا بعد إحماء، ms)

| التصميم | خطوات | p50 standard | p95 standard | p95 compat | متوسط الخطوة µs | p95 الخطوة µs | أقصى خطوة µs |
|---|---:|---:|---:|---:|---:|---:|---:|
| `t1-first-tower` | 284 | 5.53 | 7.70 | 7.67 | 19.5 | 34.2 | 160.7 |
| `t1-glass-window` | 1,860 | 33.28 | 40.26 | 37.89 | 17.9 | 31.9 | 657.6 |
| `t2-teak-scaffold` | 691 | 34.21 | 39.49 | 39.00 | 49.5 | 79.1 | 670.5 |
| `t2-cloud-bounce` | 1,280 | 27.38 | 46.64 | 34.86 | 21.4 | 79.1 | 303.6 |
| `t3-stone-keep` | 2,318 | 79.70 | 86.66 | 87.37 | 34.4 | 74.5 | 2,193.1 |
| `t3-lightbox-chain` | 1,430 | 80.97 | 102.57 | 92.45 | 56.6 | 117.9 | 895.0 |
| `t4-domino-row` | 1,913 | 73.89 | 117.61 | 91.21 | 38.6 | 72.5 | 3,061.5 |
| `t4-grand-observatory` | 1,626 | 134.19 | 182.30 | 186.26 | 82.5 | 165.2 | 1,416.8 |

أسوأ p95: 182.3ms (standard) و186.3ms (compat)، أي نحو 12% من سقف 1.5 ث. مسار الخادم في `next start` أعاد الثمانية في 7 إلى 147ms لكل تصميم.

### داخل Chromium دون عرض (للاستئناف على العميل، 5 جولات)

| | أول جولة (مجموع 8) | أسوأ وسيط دافئ (تصميم واحد) |
|---|---:|---:|
| standard، بلا خنق | 968ms | 127.5ms |
| compat، بلا خنق | 886ms | 124.9ms |
| standard، خنق ×4 | 3,017ms | 660.6ms |
| compat، خنق ×4 | 3,304ms | 563.3ms |

لا فرق أداء ثابت بين الحزمتين (WASM نفسه)؛ الفرق في التنزيل والتحميل فقط.

### جاهزية المحرك (ملف هاتف 412×915 بـ DPR 2.625، خنق CPU ×4، Fast 4G، ذاكرة باردة، 3 تحميلات)

Fast 4G مطبّق عبر CDP بقيم تعريف DevTools: كمون 165ms، تنزيل 1,012,500 بايت/ث، رفع 168,750 بايت/ث.
التصميم الأثقل `t4-grand-observatory` بالجودة العالية، والمحرك يبدأ فور تركيب الواجهة (`?auto=1`).

| (وسيط، ms) | standard | compat |
|---|---:|---:|
| FCP | 652 | 644 |
| ظهور بطاقة الأهداف (الواجهة تُركَّب على العميل في التجربة) | 1,776 | 1,687 |
| **جاهزية المحرك منذ بدء التنقل** (three + Rapier + المحاكاة + أول إطار) | **4,273** (4,201 / 4,273 / 4,491) | **4,718** (4,555 / 4,718 / 4,720) |
| منذ تركيب الواجهة | 2,547 | 2,932 |
| تحميل Rapier وحده | 1,495 إلى 1,536 | 1,851 إلى 1,909 |
| استيراد three | 541 إلى 712 | 565 إلى 717 |

في صفحة المستوى الحقيقية تُعرض بطاقة الأهداف من الخادم، فتظهر مع FCP (نحو 0.65 ث).

### الإطارات (SwiftShader برمجي، خنق ×4، 10 ث، 90 جسمًا بإعادة متكررة)

| الملف / الجودة | canvas (بكسل) | DPR | fps | وسيط الإطار | p95 | draw calls | مثلثات | ظلال |
|---|---|---:|---:|---:|---:|---:|---:|---|
| هاتف / عالية | 756×426 | 2 | 25.3 | 33.4ms | 83.3ms | 23 | 4,718 | نعم |
| هاتف / منخفضة | 378×213 | 1 | **59.6** | 16.7ms | 16.8ms | 16 | 2,354 | لا |
| حاسوب 1366×900 / عالية | 996×560 | 1 | 22.2 | 50.0ms | 83.3ms | 23 | 4,718 | نعم |
| حاسوب / منخفضة | 996×560 | 1 | 38.3 | 16.8ms | 50.0ms | 16 | 2,354 | لا |
| WebKitGTK / منخفضة، بلا خنق (Xvfb برمجي) | | 1 | 35.5 | 24ms | 45ms | 15 | 2,274 | لا |

الرسم هنا على المعالج، فالأرقام متشائمة؛ لكنها تؤكد ضرورة الجودة التلقائية (تنزل عند وسيط > 22ms، ومنفّذة في التجربة بـ `?quality=auto`). draw calls ثابتة (16 إلى 23) لأن كل مادة `InstancedMesh` واحدة.

## 9. WebKit

- `npx playwright install webkit` في مشروع مؤقت (`scratchpad/game/webkit-probe/`، playwright 1.63.0، WebKit 26.6 build v2359) **فشل بحجب الشبكة**: `server returned code 403 body 'request blocked: no rule or allowlist entry allows host "cdn.playwright.dev"'`، والأمر نفسه لـ `playwright.download.prss.microsoft.com`.
- البديل الذي نجح: `apt-get install webkit2gtk-driver xvfb xauth` (WebKitGTK 2.52.6، نفس محرك WebKit وJavaScriptCore في Safari لكن على Linux x86_64) وتشغيله بـ WebDriver عبر `webkit-bench.mjs`. النتيجة: 8/8 بصمات مطابقة بالحزمتين، و`instantiateStreaming` موجود، وWebGL2 متاح، والمحرك يرسم.
- ملاحظة بيئة اختبار فقط: كوكي الجلسة في `next start` يحمل `Secure`، وWebKitGTK لا يحفظه على `http://localhost` (Chromium يفعل)، فنُقلت قيمة الكوكي بعد تسجيل الدخول بالنموذج في Chromium.
- **غير مُتحقق:** Safari على iPhone (ARM64). صفحة التجربة تعرض بصمة كل تصميم وزر «قارن بالخادم» ليتحقق المالك على جهاز حقيقي (القسم 12).

## 10. three: 0.186.0 أم 0.187.0؟

| | 0.186.0 | 0.186.1 | 0.187.0 |
|---|---|---|---|
| تاريخ النشر (npm) | 2026-09-08 | 2026-09-24 | 2026-10-30 (قبل 7 أيام) |
| `@types/three` بالإصدار نفسه | نعم (2026-09-11) | لا يوجد | نعم (2026-10-30) |
| `build/three.module.js` + `three.core.js` | 662,772 + 1,458,113 | مطابقان بايتًا بايتًا لـ 0.186.0 (الفرق في `three.webgpu*.js` و`src/nodes` فقط) | 658,900 + 1,474,799 |
| تغييرات مسار WebGL مقابل 0.186.0 | | 0 | 15 ملفًا في `src/renderers/webgl`، و174 سطرًا في `WebGLRenderer.js` (فرق `MeshToonMaterial.js` تعليق توثيق فقط) |
| جزء three المجمّع للتجربة | 556,204 / 138,040 gzip | | 559,822 / 137,783 gzip |

القرار: **0.186.0**. لا فائدة مقيسة من 0.187.0 تقابل مخاطرة إصدار عمره أسبوع يغيّر مسار WebGL الذي نعتمد عليه، و0.186.1 لا يضيف شيئًا لمسار WebGL. ملاحظة: 0.186.0 أزال `PCFSoftShadowMap` (تحذير في وحدة التحكم أثناء التجربة)، فاستُخدم `PCFShadowMap`.

## 11. سياسة الاختلاف

لم يظهر أي اختلاف بين المنصات التي أمكن قياسها، فالحتمية الكاملة تبقى الأساس، والسياسة في §6.5 تُبنى كبديل طوارئ (حفظ كل الطلقات، و`replay_mismatch` و`user_agent`، وشروط المعقولية). تتحول إلى الأساس فقط إذا أظهر فحص iPhone أو Android لدى المالك اختلافًا في أي خلية.

## 12. ما يقيسه المالك على أجهزته (`/admin/game/spike`)

1. على iPhone حقيقي (Safari): «بصمات المتصفح (standard)» ثم «(compat)» ثم «قارن بالخادم (Node، compat)». المطلوب 8 خلايا خضراء ✓ في كل عمود. أي ✗ يُرسل بلقطة شاشة واسم الجهاز وإصدار iOS.
2. الشيء نفسه على هاتف Android متوسط (Chrome).
3. افتح `?debug=perf&layout=t4-grand-observatory&quality=high&auto=1`، واترك المشهد يعيد الحل 10 ثوانٍ، وسجّل `fps` و`frame median` و`draw calls`؛ ثم كرر بـ `quality=low` ثم `quality=auto` (هل نزلت الجودة تلقائيًا؟).
4. على شبكة الجوال (أول زيارة، دون ذاكرة مؤقتة): سجّل `engine ready … ms (nav)` من الطبقة نفسها، للحزمتين (`&pkg=compat`).
5. انتقل لتطبيق آخر ثم عد: هل استمر المشهد دون فقد سياق WebGL؟

## 13. المخاطر

1. **انفجار تتبّع الخادم:** وصول الحزمة العادية إلى رسم SSR أو أي مسار خادم يجعل التتبّع 13,795 ملفًا (653.9MB). الوقاية: `next/dynamic({ ssr: false })` حول مكوّن اللعبة، و`-compat` على الخادم، وبوابة `trace-report.mjs`.
2. **زيادة +114 بايت (+390 gzip) في كل مسار قائم** عند إضافة أي مسار عميل، من إعادة تجميع Turbopack (مثبت بمسار ضابط تافه). بوابة «لا زيادة» الحرفية ستفشل لسبب لا علاقة له بـ three؛ تحتاج قرار المالك بقبول المقارنة مع بناء ضابط.
3. **فوضوية الفيزياء وحساسية البذرة:** 3 من 8 حلول تفشل ببذرة مختلفة. يلزم ضبط التصاميم لتكون متسامحة، والتحقق من الحلول على عدة بذور.
4. **iPhone غير مُتحقق** (تنزيل WebKit محجوب؛ WebKitGTK على x86_64 فقط).
5. **أرقام fps برمجية** لا تمثل الأجهزة؛ الجودة العالية على هاتف DPR 2 كانت 25.3fps هنا.
6. **zod على العميل** يسبب تقرير CSP بلا `jitless`، ويضيف حجمًا؛ الأفضل التحقق على الخادم فقط.
7. **التجربة تحت `/admin`** ولم تُضف `/admin/game` إلى `OWNER_ONLY_PREFIXES` (ممنوع في هذه المرحلة)، فالمعلم يُرفض في الصفحة نفسها بـ `requireOwnerPage()` لا في التخطيط؛ يُصلح في المرحلة المسموح فيها تعديل `admin/layout.tsx`.
8. حجم wasm (924,543 gzip) هو معظم الصفحة؛ brotli على CDN ينزله إلى 681,486.

## 14. إعادة التشغيل (من `edu-platform/`)

```bash
node scripts/game-spike/gen-aim-table.mjs > src/app/admin/game/spike/_engine/aim-table.generated.ts
node scripts/game-spike/gen-layouts.mjs
node --import tsx scripts/game-spike/solve-layouts.ts            # يكتب layouts/solutions.json (نحو 8 دقائق)
node --import tsx --import ./scripts/game-spike/node-hooks/register.mjs --experimental-wasm-modules --no-warnings \
     scripts/game-spike/node-bench.ts --runs 25                  # node-results.json + layouts/golden.json
node scripts/game-spike/whitelist-check.mjs
npx next build && node scripts/game-spike/measure-sizes.mjs > docs/game/spike/sizes.json
node scripts/game-spike/trace-report.mjs > docs/game/spike/trace-report.json
npx next start -p 3200 &
node scripts/game-spike/browser-bench.mjs --runs 3               # browser-results.json + لقطات
node scripts/game-spike/browser-replay-bench.mjs --passes 5      # browser-replay-results.json
xvfb-run -a WebKitWebDriver --port=4444 & node scripts/game-spike/webkit-bench.mjs
npx next analyze --output --snapshot spike && npx next analyze export --snapshot spike > /tmp/graph-spike.jsonl
node scripts/game-spike/isolation-check.mjs --graph /tmp/graph-spike.jsonl > docs/game/spike/isolation-analyzer.json
node scripts/game-spike/compile-results.mjs                      # results.json
```

الحزمة العادية لا تُحمَّل في Node الخام (استيرادات بلا امتداد و`import` لملف `.wasm`)، لذلك يحتاج سكربت Node الخطاف `node-hooks/` مع `--experimental-wasm-modules`. داخل Next لا يلزم شيء.
البناء المعزول: `git archive HEAD edu-platform | tar -x` في مجلد مؤقت، ثم `node_modules` بروابط صلبة (`cp -al`)، ثم نسخ مجلدي التجربة.

## 15. الملفات

- النتائج: `results.json` (الملخص)، `node-results.json`، `browser-results.json`، `browser-replay-results.json`، `webkit-results.json`،
  `sizes.json` (الشجرة الحالية)، `sizes-isolated.json` و`sizes-isolated-control-head.json` و`sizes-isolated-control-trivial-route.json`،
  `trace-report.json` و`trace-report-experiment-A.json` و`build-warning-experiment-A.txt`، `isolation-analyzer.json`.
- اللقطات: `spike-phone-high.png`، `spike-desktop-high.png`، `spike-webkitgtk-low.png`.
