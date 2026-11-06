# خط أساس الحزم قبل لعبة «شُهُب فرقد» (المرحلة 0)

هذه لقطة لأحجام JavaScript في كل مسار **قبل أي تغيير** على فرع `claude/farqad-game`،
لنثبت لاحقًا أن three.js وRapier لا يدخلان إلا صفحة المستوى، وأن JS المسارات القائمة لم يزد.

## لماذا Bundle Analyzer وليس `next build`؟

Next.js 16 أزال عمودَي `size` و`First Load JS` من مخرجات `next build`
(`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`، قسم Performance Improvements).
البديل الموثّق في `package-bundling.md` هو محلل حزم Turbopack: `next analyze --output`، ومنذ 16.4
`next analyze export` لتصدير اللقطة JSON Lines.

## ظروف الالتقاط

| البند | القيمة |
|---|---|
| Next.js | 16.4.4 (Turbopack) |
| الفرع / الالتزام | `claude/farqad-game` @ `5ac09eb` (شجرة نظيفة، `gitDirty: false`) |
| اسم اللقطة | `baseline` (`createdAt: 2026-11-06T15:45:31.991Z`) |
| عدد المسارات | 63 (49 بها JS للعميل، و14 معالج مسار بلا JS للعميل) |
| three / @dimforge | غير مثبتة، وصفر ظهور في الرسم البياني (`grep -c` = 0) |

## الملفات

- `bundle-baseline.json`: الملخص المحفوظ في المستودع. لكل مسار:
  - `analyzer.initialJs` = مجموع JS التحميل الأول (مجموعات `bootstrap` + `render_dependent`) خامًا و`gzip`
    (gzip هنا = مجموع `compressed_size` لكل وحدة كما يقدّره المحلل، أي تقدير أعلى من ضغط الملف كاملًا).
  - `analyzer.asyncJs` = JS المحمَّل بـ `import()` فقط (مثلًا pdf.js في `/read/[fileId]`).
  - `analyzer.initialJsChunks` و`initialJsByPackage` = الأجزاء والحزم (لكشف three/Rapier لاحقًا).
  - `sharedChunks.byAllPageRoutes` = الأجزاء المشتركة بين كل المسارات الـ49، و`byTwoOrMore` = المشتركة بين مسارين فأكثر.
  - `measured` = قياس مستقل من ملفات `next build` الفعلية (`rootMainFiles` + `entryJSFiles` في
    `page_client-reference-manifest.js`)، وgzip بمستوى 6 لكل ملف كاملًا. أسماء الأجزاء فيه تختلف عن
    أسماء المحلل (بناءان منفصلان)، لكن الأحجام الخام متطابقة تقريبًا (فرق ≤0.2% في صفحات الموقع).
- `summarize-bundle.mjs`: سكربت Node بلا اعتمادات يولّد الملخص (أداة قياس، لا يستورده التطبيق).
- المخرجات الخام (30MB، غير محفوظة في المستودع) في مجلد العمل:
  `/tmp/claude-0/-home-user/e361d345-2d68-5683-a08a-09a4ce05cead/scratchpad/game/baseline/`
  (`analyze-dir/` نسخة من `.next/diagnostics/analyze`، و`bundle-graph.jsonl`، و`route-summaries.json`).

## أرقام مختارة (بايت)

| المسار | JS أولي خام (محلل) | gzip (تقدير المحلل) | JS أولي خام (بناء) | gzip (بناء، ملف كامل) | JS كسول (محلل) |
|---|---:|---:|---:|---:|---:|
| `/` | 588,589 | 229,478 | 589,777 | 181,447 | 0 |
| `/grades/[gradeSlug]` | 581,281 | 226,623 | 582,512 | 178,826 | 0 |
| `/grades/[gradeSlug]/[subjectSlug]` | 581,281 | 226,623 | 582,512 | 178,826 | 0 |
| `/products/[slug]` | 587,161 | 229,870 | 588,349 | 181,234 | 0 |
| `/library` | 581,281 | 226,623 | 582,512 | 178,826 | 0 |
| `/login` | 597,388 | 235,105 | 598,576 | 184,569 | 0 |
| `/read/[fileId]` | 605,542 | 238,364 | 606,763 | 187,787 | 468,858 |
| `/admin` | 641,357 | 255,338 | 615,519 | 191,111 | 0 |
| `/admin/settings` | 678,200 | 271,190 | 652,319 | 202,731 | 57,235 |
| `/admin/review` | 641,357 | 255,338 | 615,519 | 191,111 | 0 |

أكبر JS أولي: `/admin/products/[id]` بـ 692,671 خامًا (277,592 تقدير gzip).

الأجزاء المشتركة بين كل الصفحات الـ49 (أسماء المحلل): `13my00uw5li9w.js` (233,236)،
`05ieumge748ou.js` (177,588)، `3eqrbz4c9u_p6.js` (20,881)، `turbopack-32g9idqqcaa90.js` (11,242).
حزمة `next` وحدها نحو 467–490KB خامًا من JS كل صفحة.

## إعادة الالتقاط (من `edu-platform/`)

```bash
# 1) لقطة المحلل (لا تبني التطبيق، ولا تحتاج إيقاف خادم التطوير)
npx next analyze --output --snapshot <name>
# 2) تصدير JSON Lines
npx next analyze export --snapshot <name> > /tmp/graph-<name>.jsonl
# 3) (اختياري) بناء حقيقي لكتلة measured
npx next build
# 4) الملخص
node docs/game/baseline/summarize-bundle.mjs \
  --graph /tmp/graph-<name>.jsonl \
  --snapshot-dir .next/diagnostics/analyze/history/snapshot-<name> \
  --build-dir .next \
  --out /tmp/bundle-<name>.json
```

للمقارنة: قارن `routes[*].analyzer.initialJs.raw` و`initialJsByPackage` بين هذا الملف واللقطة الجديدة
(لا يجوز ظهور `three` أو `@dimforge/*` في أي مسار غير صفحة المستوى/التجربة، ولا زيادة في المسارات القائمة).
الواجهة التفاعلية: `npx next analyze` (المنفذ 4000) ثم `compare.html` لمقارنة لقطتين.

## بوابات الفرع قبل أي تغيير (نفس الالتزام)

| البوابة | الأمر | النتيجة |
|---|---|---|
| الأنواع | `npx tsc --noEmit -p .` | نجاح، 0 أخطاء (6.8 ث) |
| الوحدة والتكامل | `npx vitest run` | 17 ملفًا، 196 اختبارًا ناجحًا (53 ث) |
| البناء | `npx next build` | نجاح، 66 سطر مسار في الجدول (12 ث بذاكرة Turbopack المؤقتة) |
| E2E | `npx playwright test` | 54 حالة على 3 مشاريع: 33 ناجحة، 0 فاشلة، 21 متخطاة (3.1 د) |

التخطيات الـ21 قائمة في الاختبارات نفسها لا من هذا الفرع: `test.skip` حسب المشروع في
`02-auth` و`04-admin-journey` و`05-teacher-cycle` (الكمبيوتر فقط) و`03-purchase` (ليس الآيباد)،
فتوزّعت 13 على `ipad` و8 على `iphone`.
