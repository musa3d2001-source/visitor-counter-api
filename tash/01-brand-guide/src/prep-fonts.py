"""Brand guide — static font instances for the PDF.
Run from anywhere:  python3 -I tash/01-brand-guide/src/prep-fonts.py

Why: Chromium's PDF backend (Skia) cannot embed a *variable* font with its variations applied, so it falls back to
Type 3 glyph procedures for Alexandria, Archivo and JetBrains Mono. Type 3 text prints unhinted and trips prepress
preflight. The guide therefore loads static instances of exactly the weights/widths it uses (measured from the DOM),
cut here from the same OFL files in /_system/fonts/. Same outlines, same metrics, so the layout does not move.

Licence: all three families are SIL OFL 1.1 with no Reserved Font Name, so instancing (a Modified Version) may keep the
family name. Each family's OFL text is copied next to its instances. /_system/fonts/ is not touched."""
import os, shutil
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, '..', '..', '_system', 'fonts'))
OUT = os.path.join(HERE, 'fonts')
os.makedirs(OUT, exist_ok=True)

# (source VF, licence, [(axes, file stem)]) — the combos the guide actually renders (see build.mjs font report)
JOBS = [
    ('Alexandria-VF.ttf', 'OFL-Alexandria.txt', [({'wght': 800}, 'Alexandria-ExtraBold')]),
    ('Archivo-VF.ttf', 'OFL-Archivo.txt', [({'wght': 800, 'wdth': 125}, 'Archivo-ExpandedExtraBold'),
                                           ({'wght': 900, 'wdth': 125}, 'Archivo-ExpandedBlack')]),
    ('JetBrainsMono-VF.ttf', 'OFL-JetBrainsMono.txt', [({'wght': w}, f'JetBrainsMono-{n}') for w, n in
                                                       ((400, 'Regular'), (500, 'Medium'), (600, 'SemiBold'), (700, 'Bold'))]),
]

for vf, lic, cuts in JOBS:
    shutil.copyfile(os.path.join(SRC, lic), os.path.join(OUT, lic))
    for axes, stem in cuts:
        f = TTFont(os.path.join(SRC, vf))
        st = instancer.instantiateVariableFont(f, axes, inplace=False, updateFontNames=False)
        # name the instance so the PDF lists what it is (family name kept: no RFN)
        name = st['name']
        for rec in name.names:
            if rec.nameID in (4, 6):
                rec.string = stem if rec.nameID == 6 else stem.replace('-', ' ')
        path = os.path.join(OUT, stem + '.ttf')
        st.save(path)
        print(path, os.path.getsize(path))
