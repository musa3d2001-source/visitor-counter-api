"""Shape text with HarfBuzz and export each glyph outline as SVG path data.
Usage: python3 glyphs.py FONT.ttf WEIGHT "TEXT" [out.json]
Prints JSON: {upem, ascender, descender, advance, glyphs:[{name, x, y, d}]}"""
import sys, json
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

def parse_axes(spec):
    # "900" -> {wght:900}; "wght=900,wdth=125" -> dict
    if '=' not in str(spec): return {'wght': float(spec)}
    return {k: float(v) for k, v in (kv.split('=') for kv in spec.split(','))}

def shape(font_path, weight, text):
    want = parse_axes(weight)
    tt = TTFont(font_path)
    if 'fvar' in tt:
        axes = {a.axisTag: a.defaultValue for a in tt['fvar'].axes}
        axes.update({k: v for k, v in want.items() if k in axes})
        tt = instancer.instantiateVariableFont(tt, axes)
    blob = hb.Blob.from_file_path(font_path)
    face = hb.Face(blob); font = hb.Font(face)
    try: font.set_variations(want)
    except Exception: pass
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(font, buf, {})
    gs = tt.getGlyphSet(); order = tt.getGlyphOrder()
    x = 0; out = []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        pen = SVGPathPen(gs)
        gx, gy = x + pos.x_offset, pos.y_offset
        tp = TransformPen(pen, (1, 0, 0, -1, gx, -gy))  # flip y for SVG
        gs[name].draw(tp)
        out.append({'name': name, 'cluster': info.cluster, 'x': gx, 'y': gy, 'adv': pos.x_advance, 'd': pen.getCommands()})
        x += pos.x_advance
    return {'upem': tt['head'].unitsPerEm, 'ascender': tt['hhea'].ascent, 'descender': tt['hhea'].descent, 'advance': x, 'glyphs': out}

if __name__ == '__main__':
    r = shape(sys.argv[1], sys.argv[2], sys.argv[3])
    s = json.dumps(r)
    if len(sys.argv) > 4: open(sys.argv[4], 'w').write(s)
    else: print(s)
