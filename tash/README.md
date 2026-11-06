<div dir="rtl">

# طشّ | TASH Creative: ملف تسليم الإطلاق

*Launch delivery index · 6 Nov 2026*

هذا الفهرس يجمع كل ملفات إطلاق طشّ: الهوية، الشعار، القوالب، إعلان الإطلاق، الإعلانات التجريبية، الكلام، التشغيل، وحزمة إنستغرام.
كل رقم بهالصفحة مقاس على الملفات نفسها يوم 6 نوفمبر 2026 (فحص الجودة الأخير).

**ما في شي هني منشور.** المالك ينشر بيده بعد ما يعتمد. الخطة والترتيب بـ`08-instagram/POSTING-PLAN.md`.

**ابدأوا بهالثلاث:** `01-brand-guide/TASH-Brand-Guide.pdf` ← `04-launch-ad/TASH-launch-9x16.mp4` ← `08-instagram/profile-preview.png`.

---

## 1. الفهرس · Folder index

| المجلد | شنو فيه | أهم الملفات | الحالة |
|---|---|---|---|
| `01-brand-guide/` | دليل الهوية · *Brand guide*، 29 صفحة A4 عرضي | `TASH-Brand-Guide.pdf` · `brand-guide.html` · `pages/page-01…29.png` | جاهز |
| `02-logo/` | الشعار والتوقيع المتحرّك · *Logo & sting* | `svg/` (15 ملف) · `png/` (15) · `avatar/` (ليموني وحبر: SVG و1080 و320) · `motion/tash-logo-sting-9x16.mp4` و`-9x16-lime.mp4` و`-1x1.mp4` · `motion/tash-sonic-logo.wav` | جاهز |
| `03-templates/` | قوالب إنستغرام · *Templates*: 13 قالب + ستوري متحرّك | `README.md` · `templates/*.html` · `data/*.json` · `examples/` (ونظرة شاملة `_overview.png`) · `render.mjs` | جاهز |
| `04-launch-ad/` | إعلان الإطلاق «هذا منتجك. / وهذا إعلانه.» · *Launch ad* | `TASH-launch-9x16.mp4` · `TASH-launch-4x5.mp4` · `poster.png` · `contact-sheet.png` · `SCRIPT.md` | جاهز، ويحتاج تأكيد المالك على لقطات الذكاء الاصطناعي (§7) |
| `05-concept-ads/01-perfume-layl/` | «ليل» عطر · *LAYL perfume*، مبني 3D بالكامل | `LAYL-concept-9x16.mp4` · `poster.png` · `still-hero.png` · `contact-sheet.png` · `bts/` (wire / clay / final) · `SCRIPT.md` | جاهز |
| `05-concept-ads/02-burger-stakk/` | «ستاك برجر» · *STAKK burger* | `STAKK-concept-9x16.mp4` (نسخة CGI) · `poster.png` · `still-hero.png` · `contact-sheet.png` · `SCRIPT.md` · `footage/ai/` | **قيد الشغل:** نسخة بلقطات واقعية بدال الـCGI |
| `05-concept-ads/03-coffee-habba/` | «حبّة» قهوة مختصة · *HABBA coffee*، لقطات واقعية | `HABBA-concept-9x16.mp4` · `poster.png` · `still-hero.png` · `contact-sheet.png` · `SCRIPT.md` · `footage/HANDOFF-launch.md` | جاهز |
| `06-copy/` | صوت طشّ والكلام · *Voice & copy* | `voice-and-tone.md` · `instagram-profile.md` · `grid-captions.md` · `pinned-posts.md` · `cta-bank.md` · `content-calendar-first-4-weeks.md` · `scripts-voiceover-options.md` | جاهز. `grid-captions.md` مسودة؛ الكابشن النهائي بـ`08-instagram` |
| `07-ops/` | تشغيل العملاء · *Client ops* | `README.md` · `01…09-*.md` · `10-project-tracker.csv` · `rate-card.png` · `rate-card-story.png` · `order-form.png` · `order-form.pdf` | جاهز. الأسعار مبدئية لين يعتمدها المالك |
| `08-instagram/` | حزمة الإطلاق · *Instagram launch package*: 9 بوستات | `POSTING-PLAN.md` · `01…09-*/` (ملفات الرفع + `caption.md`) · `profile-preview.png` · `profile-preview-light.png` · `stories/day2-new-work-habba.png` | جاهز ما عدا بوست 2 (ينتظر «ستاك» الجديد) |
| `09-pitch-mor/` | مقترح غير رسمي لمقهى «مور» · *MOR spec pitch* | `BRIEF-MOR.md` · `footage/ai/frames/` | **قيد الشغل** (فريمات أولية بس). علامة حقيقية: **مو للنشر** على حسابنا، يتعرض على «مور» بس |
| `_system/` | النظام المشترك · *Shared system* | `BRIEF.md` · `CRAFT-ADDENDUM.md` · `tokens.css` · `brand/` · `motion/` · `audio/` · `fonts/` · `tools/` · `vendor/` (و`README.md` للتراخيص) | ثابت. لا تعدّلونه |
| `review/` | مسودات ولقطات مراجعة · *Scratch* (6.3 GB) | — | مستبعد من git (`.gitignore`) |

---

## 2. الفيديوهات · Videos (measured)

كلها: H.264 High · yuv420p · 30 fps · AAC 48 kHz ستيريو. الصوت مقاس بـ`_system/tools/audio-check.sh` (EBU R128، والذروة ذروة حقيقية).

| الملف | المقاس | المدة | الصوت (LUFS · dBTP) | ملاحظة |
|---|---|---|---|---|
| `04-launch-ad/TASH-launch-9x16.mp4` | 1080×1920 | 27.0 ث | −14.0 · −1.5 | ريل، والماستر لبوست 9 |
| `04-launch-ad/TASH-launch-4x5.mp4` | 1080×1350 | 27.0 ث | −14.0 · −1.5 | مو قصّة: كل لقطة متركّبة من جديد للمقاس |
| `05-concept-ads/01-perfume-layl/LAYL-concept-9x16.mp4` | 1080×1920 | 15.9 ث | −14.0 · −1.8 | |
| `05-concept-ads/02-burger-stakk/STAKK-concept-9x16.mp4` | 1080×1920 | 13.8 ث | −14.0 · −1.2 | نسخة CGI |
| `05-concept-ads/03-coffee-habba/HABBA-concept-9x16.mp4` | 1080×1920 | 15.6 ث | −13.9 · −1.5 | |
| `02-logo/motion/tash-logo-sting-9x16.mp4` (و`-lime`) | 1080×1920 | 4.2 ث | −13.6 · −1.5 | |
| `02-logo/motion/tash-logo-sting-1x1.mp4` | 1080×1080 | 4.2 ث | −13.6 · −1.5 | |
| `03-templates/examples/story-new-work-anim.mp4` | 1080×1920 | 7.0 ث | −13.9 · −1.5 | ستوري «شغل جديد» |
| `08-instagram/05-bts-reel/reel.mp4` | 1080×1920 | 13.07 ث | −14.0 · −2.2 | ورا الكواليس («ليل») |
| `08-instagram/0{1,2,3,9}-*/reel.mp4` | — | — | — | نسخ مطابقة بايت ببايت للماستر (md5) |

**لوحة الإعلان التجريبي · Concept label:** آخر 3 ثواني من «ليل» و«ستاك» و«حبّة» وريل الكواليس فيها `CONCEPT AD` + «إعلان تجريبي — علامة خيالية»، ونفس الشي على أغلفة البوستات 1 و2 و3 و5.
إعلان الإطلاق إعلاننا إحنا، وشغلنا التجريبي اللي فيه مكتوب عليه «نماذج تجريبية · CONCEPT WORK».

---

## 3. شلون تشوفون الملفات · How to view

- **MP4 وPNG وPDF:** افتحوها مباشرة.
- **صفحات HTML** (الدليل، صفحات الإعلانات، القوالب) تحتاج سيرفر محلي يخدم `tash/` كجذر، لأن الروابط تبدأ بـ`/_system/`:

</div>

```bash
cd tash && python3 -m http.server 8000
# http://localhost:8000/01-brand-guide/brand-guide.html
# http://localhost:8000/04-launch-ad/src/index.html?play                  ← معاينة حيّة (live preview)
# http://localhost:8000/05-concept-ads/01-perfume-layl/src/index.html?t=12.6   ← فريم واحد (one frame)
# http://localhost:8000/03-templates/templates/post-cta.html?data=/03-templates/data/post-cta-01.json&guide
```

<div dir="rtl">

- `07-ops/rate-card.html` و`07-ops/order-form.html` تنفتح مباشرة بالمتصفح (`file://`).
- **الكابشن اللي ينلصق** موجود بـ`08-instagram/NN-*/caption.md` بس (مو `06-copy/grid-captions.md`).

---

## 4. إعادة الرندر · Re-render

الأوامر من داخل `tash/`. الجهاز مشترك: **لا تزيدون عن `--workers 2`**، وطلّعوا صور ثابتة وشوفوها قبل الفيديو الكامل.

| القطعة | الأوامر |
|---|---|
| أي صفحة: صور ثابتة أول · *stills first* | `node _system/tools/render.mjs --page <dir>/src/index.html --stills 0.5,2,4.25 --stills-dir review/<اسمك>` |
| الشعارات · *logos* | `node _system/tools/export-logo.mjs` |
| التوقيع المتحرّك · *sting* | `python3 02-logo/motion/src/sting_audio.py` (يكتب `review/sting/sting.wav`، انسخوه لـ`02-logo/motion/tash-sonic-logo.wav`)، بعدين `node _system/tools/render.mjs --page "02-logo/motion/src/sting.html" --out 02-logo/motion/tash-logo-sting-9x16.mp4 --audio 02-logo/motion/tash-sonic-logo.wav --workers 2` · ليموني: `?theme=lime` · مربع: `?fmt=11` |
| دليل الهوية · *brand guide* | `node 01-brand-guide/src/build.mjs` (PDF + صور الصفحات؛ `--only 28` لصفحة وحدة). الصور المساعدة: `src/prep-*.{py,sh,mjs}` |
| القوالب · *templates* | `node 03-templates/render.mjs --all` · أو قالب واحد: `node 03-templates/render.mjs <template.html> <data.json> <out.png>` · الستوري المتحرّك: `03-templates/README.md` §6 |
| إعلان الإطلاق · *launch ad* | `bash 04-launch-ad/src/tools/extract.sh` (**لازم أول**: الصفحة تقرا اللقطات من `review/launch-footage/`) ← `python3 04-launch-ad/src/audio.py` ← `node _system/tools/render.mjs --page 04-launch-ad/src/index.html --out 04-launch-ad/TASH-launch-9x16.mp4 --audio 04-launch-ad/src/audio.wav --workers 2` · 4:5: `?fmt=45` · الغلاف: `?poster=1` |
| «ليل» · *LAYL* | `python3 05-concept-ads/01-perfume-layl/src/audio.py` ← `node _system/tools/render.mjs --page 05-concept-ads/01-perfume-layl/src/index.html --out 05-concept-ads/01-perfume-layl/LAYL-concept-9x16.mp4 --audio 05-concept-ads/01-perfume-layl/src/audio.wav --workers 2` |
| «حبّة» · *HABBA* | `python3 05-concept-ads/03-coffee-habba/src/audio.py` ← `node _system/tools/render.mjs --page 05-concept-ads/03-coffee-habba/src/index.html --out 05-concept-ads/03-coffee-habba/HABBA-concept-9x16.mp4 --audio 05-concept-ads/03-coffee-habba/src/audio.wav --workers 2` (اللقطات: `bash 05-concept-ads/03-coffee-habba/src/tools/extract.sh`) |
| «ستاك» · *STAKK* | **انتظروا النسخة الجديدة.** `src/` الحين بنص الشغل، فما يطلّع الملف المسلّم. مصادر الـCGI القديمة بـ`src/_cgi-v1/` |
| الأسعار ونموذج الطلب · *ops* | `node 07-ops/src/render.mjs` |
| حزمة إنستغرام · *Instagram* | `python3 08-instagram/src/package_reels.py --check` ← `bash 08-instagram/src/build.sh` (و`--bts` لريل الكواليس، حوالي 8 دقايق) |
| فحص الصوت والشيت · *checks* | `bash _system/tools/audio-check.sh <file.mp4> review/<اسمك>/spec.png` · `bash _system/tools/contact.sh <file.mp4> <out.png>` |

المُخرِج (`render.mjs`) يضبط الصوت تلقائياً على −14 LUFS وذروة −1.5 dBTP وقت الدمج.

---

## 5. شنو أصلي، وشلون انسوى · What is original and how it was made

| العنصر | شلون انسوى | المصدر |
|---|---|---|
| الشعار والهوية · *logo & identity* | مرسوم بالكود من حروف Alexandria محوّلة لمسارات، والنقاط الثلاث دواير مضبوطة | `_system/brand/logo.mjs` |
| الحركة والتوقيع · *motion & sting* | صفحات HTML / SVG / Canvas، كل فريم دالة من الوقت (ما في `Math.random` ولا أنيميشن CSS)، ومرندرة بـChromium ← FFmpeg | `_system/motion/`، `_system/tools/render.mjs` |
| الـ3D · *3D* | Three.js: قارورة «ليل» مبنية من الصفر بالكود، إضاءة استوديو مبنية بنفسها، وزجاج وسائل بمواد فيزيائية؛ ولقطة الخاتم بإعلان الإطلاق | `05-concept-ads/01-perfume-layl/src/scene.js`، `04-launch-ad/src/built/ring/` |
| الصوت · *audio* | موسيقى ومؤثرات مركّبة بالكود من الصفر (تصفيق خليجي، مرواس، عود بأسلوب Karplus-Strong، مقامات حجاز وبياتي) — بدون عيّنات ولا موسيقى منزّلة | `_system/audio/tashaudio.py` + `src/audio.py` بكل قطعة |
| النصوص · *type* | نص حي يتشكّل بـChromium من خطوط OFL، ما في نص مرسوم كصورة | `_system/fonts/` |
| لقطات الذكاء الاصطناعي · *AI footage* | بموافقة المالك، ولّدها المدير الإبداعي بـHiggsfield (فريم بداية GPT Image 2.6 ← فيديو Kling 3.0). القص والتلوين والنص والصوت والتوقيع من شغلنا | لقطات الناس بإعلان الإطلاق، فيلم «حبّة»، ونسخة «ستاك» الجديدة؛ الكريدت بـ`SCRIPT.md` |
| العلامات الخيالية · *fictional brands* | «ليل» و«ستاك برجر» و«حبّة» و«لومة» (مثال القالب) كلها من تأليفنا؛ ما في منتج أو مطعم حقيقي | `05-concept-ads/`، `03-templates/data/` |

---

## 6. التراخيص · Licences

| الشي | الرخصة | وين |
|---|---|---|
| الخطوط: Alexandria · IBM Plex Sans Arabic · Archivo · JetBrains Mono | SIL OFL 1.1 (تجاري مسموح؛ «Plex» اسم محجوز) | `_system/fonts/OFL-*.txt` · `01-brand-guide/src/fonts/OFL-*.txt` |
| Three.js r180 | MIT | `_system/vendor/three/LICENSE` |
| GSAP 3.13.0 (موجودة بالنظام، وما تستخدمها أي قطعة مسلّمة) | GreenSock Standard «No Charge» | رأس كل ملف بـ`_system/vendor/gsap/` |
| الصوت والصور والكود والنصوص | ملك طشّ | — |
| لقطات Higgsfield | باشتراك المالك؛ راجعوا شروط الاستخدام التجاري قبل أول شغل عميل مدفوع | `*/footage/ai/` |

الملخص الكامل: `_system/vendor/README.md`. ما في صور ستوك ولا موسيقى ولا مؤثرات منزّلة، ولا شعارات منصّات (الجوال والمحادثة بالإعلانات عامّين).

---

## 7. حدود معروفة · Known limitations (honest)

1. **«ستاك» (بوست 2) للحين نسخة CGI**، والمالك قال إنها «كرتونية». النسخة الواقعية قيد الشغل. لين توصل: `src/` ما يطابق الملف المسلّم، و`SCRIPT.md` يوصف نسخة الـCGI، وصور «ستاك» بالقوالب والدليل والستوري `story-new-work-02` كلها CGI. لا تنشرون بوست 2 قبلها إلا إذا المالك وافق.
2. **إعلان الإطلاق يعرض لقطات قديمة**: لقطة «ستاك» ولقطة صبّ «حبّة» بالمونتاج من نسخ الـCGI. طريقة التبديل بـ`05-concept-ads/03-coffee-habba/footage/HANDOFF-launch.md`.
3. **سياسة لقطات الذكاء الاصطناعي** تحتاج كلمة أخيرة من المالك: البند §3.5 بالبريف يمنع المولّدات المدفوعة، والملاحظة فوقه تستثني لقطات Higgsfield. فعّلوا علامة «AI» بالمنصة على البوستات 9 و1 (و2 بعد التبديل).
4. **الجوال بلقطة البداية** يشبه جوال معروف (بدون شعار). يحتاج قرار.
5. **بوست 6 «صورة عادية»** رندر 3D من شغلنا مسوّى مثل صورة جوال، مو صورة حقيقية؛ مكتوب هالشي بالبوست وبالكابشن. لوحته «للتوضيح: منتج تجريبي لعلامة خيالية» + `DEMO · CONCEPT AD 01`، مو نفس الجملة الرسمية حرفياً.
6. **الأسعار مبدئية** (فرضية 10 د.ك بالساعة)، ورقم الواتساب `965XXXXXXXX` لازم ينحط، واسم الحساب ينتظر قرار المالك (`08-instagram/POSTING-PLAN.md` §2).
7. **الصوت انحكم عليه بالقياس** (LUFS، الذروة، الطيف) مو بالسمع على أجهزة كثيرة. ما في تعليق صوتي.
8. **الاعتماد على `review/`**: إعلان الإطلاق وريل الكواليس يقرون لقطاتهم من `review/` (مستبعد من git)، فلازم تشغّلون `extract.sh` أول بأي نسخة جديدة من المستودع.
9. **حجم المستودع:** حوالي 860 MB برّا `review/`. ما في ملف أكبر من 40 MB (أكبر واحد 37 MB). الريلز بـ`08-instagram` نسخ مكررة (حوالي 120 MB)، وتسلسلات JPEG بـ`05-concept-ads/*/src/footage/` (حوالي 120 MB) تنعاد من `footage/ai/`.
10. **«مور»** علامة حقيقية: المقترح للعرض على «مور» بس، بموافقة المالك، ومو شغل عميل. لا ينزل على حسابنا كأنه بتكليف.

---

## 8. الخطوات الجاية (اختيارية) · Next steps (optional)

كل شي هني اختياري. الحزمة تشتغل بدونه.

| الإضافة | شنو تضيف | ملاحظة |
|---|---|---|
| تصوير منتج حقيقي · *real product shoot* | منتج عميل حقيقي بإضاءة استوديو، بدال الـ3D أو الذكاء الاصطناعي؛ أول «قبل/بعد» حقيقي | مع أول عميل وبإذن مكتوب، أو مصوّر شريك (قرار المالك بـ`07-ops`) |
| تعليق صوتي · *voice-over* | صوت كويتي حقيقي يقرّب الإعلان من الناس | النصوص جاهزة: `06-copy/scripts-voiceover-options.md`؛ موهبة حقيقية بعقد، بدون استنساخ صوت |
| مولّدات فيديو مدفوعة · *paid AI video* | لقطات ناس وأماكن أوسع بسرعة | بس بموافقة المالك وبكريدت، ونفس قواعد الصدق: ما نقول «صوّرنا» على شي مولّد |
| إعلان تجريبي رابع · *4th concept ad* | تنويع بالشبكة (بدال تكرار القارورة) | `06-copy/content-calendar-first-4-weeks.md`، الأسبوع 4 |
| أول شغل عميل · *first client piece* | يحل محل التجريبي بالتثبيت | بإذن مكتوب (`07-ops/09-delivery-message.md`) |

---

## 9. فحص الجودة الأخير · Final QA log (6 Nov 2026)

**انفحص:** كل ملفات MP4 (المقاس، الـfps، الترميز، المدة، الصوت)؛ آخر 3 ثواني من كل إعلان تجريبي وأغلفة إنستغرام (لوحة التجريبي)؛ الروابط بين الملفات وتحميل 13 صفحة HTML بدون أخطاء أو 404؛ النصوص العربية (همزة، ة/ه، علامات الترقيم، الأرقام)؛ الادعاءات (أرقام، تقييمات، علامات حقيقية)؛ التراخيص؛ الملفات الكبيرة والأسرار.

**انصلّح:**
- `06-copy/grid-captions.md`: سطرين صاروا غلط بعد التسليم (كابشن بوست 9 يقول كل اللقطات من الإعلانات التجريبية، وبوست 5 يذكر ستوري بورد مو موجود)، وانضاف تنبيه إن الكابشن النهائي بـ`08-instagram`.
- `06-copy/voice-and-tone.md` §8: «بنيناها 3D» صار بس لـ«ليل» والخاتم، مو «حبّة» أو «ستاك».
- `01-brand-guide`: سطر «الصور» بصفحة التراخيص (ص 28) صار يذكر لقطات «حبّة» و«ستاك» المولّدة، وانعاد بناء الـPDF وصورة الصفحة.
- `07-ops/01-welcome-and-quick-replies.md`: فاصلة ناقصة برد التعديلات.
- انضاف `_system/vendor/README.md` (المكتبات والخطوط ورخصها) بطلب صريح.

</div>
