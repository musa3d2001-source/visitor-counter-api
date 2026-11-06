# Post 6 · «صورة عادية ← إعلان» — before/after post (a labelled demonstration)

**Format:** Single image post · **Upload:** `post.png` (1080×1350) · **Posting order:** 6 of 9
**Built with:** `src/templates/before-after.html` + `src/data/06-before-after.json`; the «before» half is `src/ba/before.html`

## Caption — paste as is

```text
الصورة تقول: «هذا منتج».

والإعلان يقول: «أبيه».

نفس المنتج… والفرق مو فلتر: الفرق ضو، وفكرة، وتصميم.

للتوضيح: المنتج تجريبي لعلامة خيالية، والنصين من شغلنا — نفس القارورة ونفس الكاميرا، مرة على مكتب بإضاءة عادية، ومرة بإضاءة إعلان.

عندك صورة منتج عادية؟ دزّها لنا، ونقول لك شنو نقدر نسوي فيها •••

#TASHcreative #قبل_وبعد #اعلانات_الكويت #تصميم_اعلاني #kuwait #beforeandafter #addesign #مشاريع_كويتية
```

## Alt text (Arabic, under 100 characters)

```text
قارورة عطر وحدة مقسومة نصين: يمين على مكتب بإضاءة عادية، ويسار بإضاءة إعلان فاخرة.
```

## How it was made (and why it is honest)
- **Left, «إعلان.»:** the LAYL ad's own hero frame (S3 orbit, t = 4.70 s, clean pass).
- **Right, «صورة عادية»:** the same bottle model (LAYL's `makeBottle`), seen from the same camera (`frameSpec(4.70)`), on a light-oak desk against a wall under one flat ceiling light, with phone-style deep focus and no styling. It is our own render made to look like an everyday product photo. It is not a photo of anyone's real product, and the post never says it is.
- The two halves meet on the lime line exactly because the camera is the same: the "before" is rendered on a 1.4× larger canvas with the field of view widened by the same factor, so its centre lines up with the ad frame pixel for pixel.
- On the post: `DEMO · CONCEPT AD 01` + «للتوضيح: منتج تجريبي لعلامة خيالية». In the caption: line 4.

## Notes for this post
- Changed from `06-copy/grid-captions.md`: line 3 «الفرق فكرة وتصميم» → «الفرق ضو، وفكرة، وتصميم» (light is the biggest visible difference here), and line 4 now says plainly that both halves are our work and how they differ.
- If someone asks in the comments «هذي صورة حقيقية؟»: «النصين من شغلنا على منتج تجريبي — النص الأول نسوّيه مثل صورة الجوال العادية عشان يبين الفرق.»
