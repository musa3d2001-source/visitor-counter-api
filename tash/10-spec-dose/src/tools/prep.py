"""DOSE: decode every source frame the edit uses, at the edit geometry, and apply the clip fixes (the CD reviews):
  d1_grinders   the origin names printed on the blank cards on their beats (fx_cards)
  d2d_carafe    upscaled x1.5 (lanczos + light unsharp, in common.VF); f0-99: the cup print replaced with the faithful
                recreation of dose's lockup (fx_specialty; v3 also on the hook plate f0-35)
  d5b_terrace   the AI wall sign replaced with the recreated mark (fx_sign); d5b_terrace_clean (v3, f113-120): the
                same wall with the AI sign removed and no mark, for the end-card dissolve
  d3_iced, d4_cake: nothing to fix inside the used ranges.
Writes src/footage/_src/<clip>/<source frame:03d>.png (lossless; not committed). Run tools/fx_*.py first (their
assets/*.json are committed, so normally only this and conform.py run).
Usage: python3 src/tools/prep.py [clip ...]"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import decode, PREP, SFPS, cues, tmap, edit_frames, smoothstep
import fx_cards, fx_specialty, fx_sign

C = cues()


def src_dir(seg):
    """the folder of fixed source frames a segment reads: the clip, or clip_<variant> (v3: d5b_terrace_clean = the wall
    with the AI sign removed and no mark, used under the end-card dissolve)"""
    return seg['clip'] + ('_' + seg['variant'] if seg.get('variant') else '')


def needed():
    out = {}
    for seg in C['footage']['segs']:
        f0, f1, ps = edit_frames(seg)
        ks = set()
        for p in ps:
            ks.add(int(np.floor(p))); ks.add(min(120, int(np.floor(p)) + 1)); ks.add(int(round(p)))
        out.setdefault(src_dir(seg), set()).update(ks)
    return out


def card_ink(seg, k):
    """print-on amount of each card's name at source frame k: invert the shot's time map, ramp 0.12 s from its cue"""
    # a source frame starts to show (in the blend) as soon as the edit passes its PREVIOUS frame, so the print-on is
    # keyed to frame k-1's edit time: no name ever shows before its cue, even faintly
    s = tmap(seg); ts = (k - 1) / SFPS
    lo, hi = seg['t0'], seg['t1']                              # the shot (v2: no hook hold in this segment)
    if ts <= s(lo) + 1e-6: return {}
    for _ in range(50):                                        # bisection: edit time whose source time is ts
        mid = (lo + hi) / 2
        if s(mid) < ts: lo = mid
        else: hi = mid
    te = (lo + hi) / 2
    return {cid: float(smoothstep(0, 0.12, te - C['ev'][v['cue']])) for cid, v in fx_cards._C.get('cards', {}).items()} or None


def main(want):
    need = needed()
    for name, ks in need.items():
        if want and name not in want: continue
        seg = next(s for s in C['footage']['segs'] if src_dir(s) == name and s['id'] != 'H')
        clip, variant = seg['clip'], seg.get('variant')
        ks = sorted(ks); d = os.path.join(PREP, name); os.makedirs(d, exist_ok=True)
        for old in os.listdir(d): os.remove(os.path.join(d, old))
        frames = decode(clip, ks[0], ks[-1])
        for k in ks:
            im = frames[k - ks[0]]
            if clip == 'd1_grinders':
                if not fx_cards._C: fx_cards.apply(k, im[:2, :2].copy(), {})      # load the tracks
                ink = card_ink(seg, k) or {}
                if any(v > 0 for v in ink.values()): im = fx_cards.apply(k, im, ink)
            elif clip == 'd2d_carafe': im = fx_specialty.apply(k, im)
            elif clip == 'd5b_terrace': im = fx_sign.apply(k, im, mark=variant != 'clean')
            Image.fromarray(im).save(os.path.join(d, f'{k:03d}.png'), compress_level=1)
        print(f'{name:18s} {len(ks):3d} source frames {ks[0]}-{ks[-1]}')


if __name__ == '__main__':
    main(set(sys.argv[1:]))
