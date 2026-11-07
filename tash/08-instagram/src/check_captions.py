#!/usr/bin/env python3
"""Check every 0N-*/caption.md against the caption rules in 06-copy/grid-captions.md.

  python3 08-instagram/src/check_captions.py

Caption = the first ```text block. Alt text = the second ```text block, or the «Alt text» table rows.
Checks: ≤ 2200 characters · what shows before «المزيد» (≈125 characters) · concept posts carry the label by line 2 ·
exactly one ••• (our sign-off, at the CTA) · ≤ 8 hashtags, none of them a fictional brand name · alt text < 100.
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONCEPT = {1, 2, 3}
BRANDS = ['حبة', 'حبّة', 'ستاك', 'stakk', 'habba', 'layl', 'ليل']
bad = 0
for md in sorted(ROOT.glob('0[1-9]-*/caption.md')):
    n = int(md.parent.name[:2]); t = md.read_text()
    blocks = re.findall(r'```text\n(.*?)\n```', t, re.S)
    cap = blocks[0]
    alts = [blocks[1]] if len(blocks) > 1 else re.findall(r'^\| \d\d \| (.+?) \|$', t, re.M)
    lines = [l for l in cap.split('\n') if l.strip()]
    tags = re.findall(r'#\S+', cap)
    issues = []
    if len(cap) > 2200: issues.append(f'caption {len(cap)} > 2200 chars')
    if cap.count('•••') != 1: issues.append(f'••• appears {cap.count("•••")}×')
    if len(tags) > 8: issues.append(f'{len(tags)} hashtags')
    if any(b in tg.lower() for tg in tags for b in BRANDS): issues.append('a hashtag names a fictional brand')
    if n in CONCEPT and 'إعلان تجريبي لعلامة خيالية' not in '\n'.join(lines[:2]): issues.append('concept label not in lines 1–2')
    for a in alts:
        if len(a) >= 100: issues.append(f'alt text {len(a)} chars: {a[:40]}…')
    preview = ' / '.join(lines)[:125]
    print(f'post {n}: {len(cap):4d} chars · {len(tags)} tags · alt {",".join(str(len(a)) for a in alts)} · {"OK" if not issues else "; ".join(issues)}')
    print(f'         before «more»: {preview}')
    bad += bool(issues)
sys.exit(1 if bad else 0)
