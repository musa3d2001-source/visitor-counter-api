// DOSE — the shared timeline (cues.json is read by the page and by audio.py: one source of truth).
export const C = await (await fetch(new URL('./cues.json', import.meta.url))).json();
