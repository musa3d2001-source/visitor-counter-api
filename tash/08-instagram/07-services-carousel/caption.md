# Post 7 · Services — carousel (the five services, one per slide)

**Format:** Carousel, 7 slides · **Upload, in this order:** `slide-01.png` … `slide-07.png` (1080×1350 each) · **Posting order:** 7 of 9
**Built with:** `src/templates/deck.html` + `src/data/07-services.json` (pictures: `src/assets/`, the LAYL ad and the launch ad's own process frames)

## Caption — paste as is

```text
خمسة أشياء نسويها… وبس.

١. فيديوهات إعلانية

٢. إعلانات سوشال: ريلز، تيك توك، ستوري

٣. تصاميم إعلانية وبوسترات

٤. أفكار وسكربتات إعلانية

٥. موشن جرافيك ومونتاج

الشغل اللي بالشرايح إعلانات تجريبية لعلامات خيالية.

تبي واحد منها؟ ولا الخمسة مع بعض؟ دزّ لنا بالخاص •••

#TASHcreative #اعلانات_الكويت #موشن_جرافيك #تصميم_اعلاني #kuwait #ريلز #adproduction #motiongraphics
```

## Alt text, one per slide (Arabic, under 100 characters each)

| Slide | Alt text |
|---|---|
| 01 | غلاف بنص: خمسة أشياء نسويها… وبس. |
| 02 | فيديوهات إعلانية: ثلاث لقطات من إعلان «ليل» التجريبي. |
| 03 | إعلانات سوشال: إعلان «ليل» التجريبي على شاشة جوال، وفقاعة: منو مسوي هالإعلان؟! |
| 04 | تصاميم إعلانية: بوستر «ليل»، وبوست قبل وبعد، وبوست نص. |
| 05 | أفكار وسكربتات: صفحة سكربت فيها جملة الإعلان وثلاث رسومات للقطات. |
| 06 | موشن ومونتاج: الإعلان على خط المونتاج مع موجة الصوت. |
| 07 | تبي واحد؟ ولا الخمسة؟ دزّ لنا بالخاص. |

## Slide text (as set, proofread twice)
01 (paper) «خمسة أشياء / نسويها… وبس.» · «اسحب، وشوف كل وحدة.»
02 «فيديوهات إعلانية» · «إعلان كامل لمنتجك أو محلك: فكرة، سكربت، إنتاج، وملف جاهز.»
03 «إعلانات سوشال» · «ريلز، تيك توك، ستوري. عمودية، سريعة، ومبنية على أول ثانية.»
04 «تصاميم إعلانية» · «بوسترات وتصاميم لمنتجك وعروضك… تنفهم بنظرة.»
05 «أفكار وسكربتات» · «ما عندك فكرة؟ نكتبها لك بسكربت واضح — ننفّذه إحنا، أو تنفّذه إنت.»
06 «موشن ومونتاج» · «عندك لقطات خام؟ نرتبها، ونحرّكها، ونطلّعها إعلان.»
07 (paper) «تبي واحد؟ / ولا الخمسة؟» · «دزّ لنا بالخاص•••»
Every picture slide carries its label: `CONCEPT AD — 01 / PERFUME` + «إعلان تجريبي — علامة خيالية», or `CONCEPT WORK` + «أعمال تجريبية — علامات خيالية».

## Notes for this post
- Changed from `06-copy/grid-captions.md`: added the line «الشغل اللي بالشرايح إعلانات تجريبية لعلامات خيالية.», because every picture slide shows concept work. Slide 06's title is «موشن ومونتاج» (the bio's short form): «موشن جرافيك ومونتاج» doesn't fit one line at display size. The caption keeps the full name.
- Pictures are deliberately LAYL, the launch ad and TASH's own designs only. The STAKK and HABBA visuals are being re-cut from photoreal footage, so they were left out to keep this post from going stale. Swap a slide picture once those are final if you want more variety (edit `src/data/07-services.json`, then re-run `src/build.sh`).
- «تصاميم إعلانية» means posters and visuals, not logos or brand identity (`07-ops` lists those as out of scope).
