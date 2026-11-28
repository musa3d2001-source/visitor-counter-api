# HABBA — CGI version 1 (Three.js), kept for reference only

This is the previous, fully CGI cut of the HABBA concept ad (Three.js plates, SwiftShader). The owner judged it
"cartoonish, not real", and the film was rebuilt from the CD-approved photoreal footage in `../../footage/ai/`.
Nothing in this folder is loaded by `../index.html`. The files are a snapshot of the v1 sources as they were:
`main.js` (renderer, light, post), `scene.js` (world, materials, steam, latte), `shots.js` (frameSpec(t)), plus copies of
v1's `index.html`, `overlay.js`, `poster.js`, `style.css`, `cues.json` and `audio.py`. They import their neighbours by
relative path, so to run v1 again, copy this folder's files back over `../` (with `habba-logo*.mjs` and `sting-short.js`).
