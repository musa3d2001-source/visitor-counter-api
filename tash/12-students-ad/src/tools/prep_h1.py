"""«طشّ للطلاب»: the hook plate h1_desk → src/footage/h1/ (30 fps JPEG sequence) + screen.json (the laptop screen quad on
every frame, for the push into the screen).

Range and speed (lead's call): source frames 0..N-1 played ONE SOURCE FRAME PER FILM FRAME, i.e. the 24 fps clip runs at
30 fps = 1.25x. Nothing is synthesised or blended: no cadence judder, no interpolation artefacts. Film frame k shows
source frame k (k / 24 s of the clip). What that gives the hook (film time): hands in hair 0-1.6 s (src f0-f48), the
hands drop 1.67-2.0 s (src f50-f60), then the camera's own slow creep from behind (src f60+), which our digital push
continues into the screen. N = 90 (3.0 s of film; the hook uses 0-2.6 s, the rest is slack).
Geometry: 1080x1912 (untagged BT.709) scaled to 1084x1920 (lanczos) and centre-cropped 2 px a side, as the DOSE tools.
Screen quad: the white panel = pixels whose MIN channel > 214 (the lamp's glow is yellow, so it drops out), the
connected component nearest the previous frame's screen centre; its 4 corners from the polygon approximation, then
each edge re-fitted by least squares on the contour points between the corners (the corners trimmed 12%), corners =
the edge lines' intersections. Order: TL, TR, BR, BL (film pixels, 1080x1920). The quad is the inner edge of the
dark bezel (= where white starts).
Usage: python3 src/tools/prep_h1.py   (writes ~90 JPEGs + screen.json + a check sheet in the scratchpad if given)"""
import json, os, subprocess, sys
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
CLIP = os.path.join(os.path.dirname(SRC), 'footage', 'ai', 'h1_desk.mp4')
OUT = os.path.join(SRC, 'footage', 'h1')
W, H, N = 1080, 1920, 90
VF = f"scale={W + 4}:{H}:flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=bt709:in_range=tv,crop={W}:{H}:2:0"


def decode(a, b):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', CLIP, '-an', '-vf', f"select='between(n\\,{a}\\,{b})',{VF},format=rgb24",
                        '-vsync', '0', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE, check=True)
    buf = np.frombuffer(p.stdout, np.uint8)
    return buf.reshape(-1, H, W, 3)


def line_fit(pts):
    """total least squares line through points: (point, unit direction)"""
    c = pts.mean(0); u, s, vt = np.linalg.svd(pts - c); return c, vt[0]


def intersect(l1, l2):
    (p, d), (q, e) = l1, l2
    A = np.array([d, -e]).T; t = np.linalg.solve(A, q - p); return p + t[0] * d


def screen_quad(im, prev_c):
    m = (im.min(2) > 214).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, cents = cv2.connectedComponentsWithStats(m, 8)
    best, bd = None, 1e9
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 20000: continue
        d = np.hypot(*(cents[i] - prev_c))
        if d < bd: best, bd = i, d
    comp = (lab == best).astype(np.uint8)
    comp = cv2.morphologyEx(comp, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))    # fill the faint texture holes
    cs, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)[:, 0, :].astype(np.float64)
    peri = cv2.arcLength(c.astype(np.float32), True)
    ap = cv2.approxPolyDP(c.astype(np.float32), 0.02 * peri, True)[:, 0, :]
    if len(ap) != 4:                                       # fall back to the min-area rectangle's corners
        ap = cv2.boxPoints(cv2.minAreaRect(c.astype(np.float32)))
    # order TL, TR, BR, BL
    s, dd = ap.sum(1), ap[:, 0] - ap[:, 1]
    corners = np.array([ap[np.argmin(s)], ap[np.argmax(dd)], ap[np.argmax(s)], ap[np.argmin(dd)]], np.float64)
    # refit each edge on the contour points nearest to it (middle 76 % of the edge)
    lines = []
    for k in range(4):
        A, B = corners[k], corners[(k + 1) % 4]
        AB = B - A; L = np.linalg.norm(AB); u = AB / L; nrm = np.array([-u[1], u[0]])
        rel = c - A; along = rel @ u; across = np.abs(rel @ nrm)
        sel = (along > 0.12 * L) & (along < 0.88 * L) & (across < 6)
        lines.append(line_fit(c[sel]) if sel.sum() > 20 else (A, u))
    q = np.array([intersect(lines[(k - 1) % 4], lines[k]) for k in range(4)])
    return q, cents[best], int(stats[best, cv2.CC_STAT_AREA])


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.jpg'): os.remove(os.path.join(OUT, f))
    frames = decode(0, N - 1)
    assert len(frames) == N, len(frames)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '30',
                            '-i', '-', '-vf', 'scale=out_color_matrix=bt601:out_range=full,format=yuvj420p', '-q:v', '2',
                            '-start_number', '0', os.path.join(OUT, '%04d.jpg')], stdin=subprocess.PIPE)
    rows, prev = [], np.array([535.0, 694.0])
    for k, im in enumerate(frames):
        enc.stdin.write(np.ascontiguousarray(im).tobytes())
        q, cen, area = screen_quad(im, prev); prev = cen
        rows.append({'k': k, 'src_frame': k, 'quad': [[round(float(x), 2), round(float(y), 2)] for x, y in q],
                     'center': [round(float(q[:, 0].mean()), 2), round(float(q[:, 1].mean()), 2)],
                     'w': round(float((np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2), 2),
                     'h': round(float((np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2), 2), 'area_px': area})
    enc.stdin.close(); enc.wait()
    # temporally smoothed quad (Savitzky-Golay, 7 frames, order 2): the push-in magnifies sub-pixel jitter ~10x
    from scipy.signal import savgol_filter
    Q = savgol_filter(np.array([r['quad'] for r in rows]), 7, 2, axis=0, mode='interp')
    for r, q in zip(rows, Q): r['quad_s'] = [[round(float(x), 2), round(float(y), 2)] for x, y in q]
    J = {'_note': __doc__.split('Usage:')[0].strip(), 'clip': 'footage/ai/h1_desk.mp4', 'src_fps': 24, 'film_fps': 30,
         'speed': 1.25, 'n': N, 'size': [W, H], 'files': 'src/footage/h1/%04d.jpg (frame k = film frame k of the hook)',
         'quad_order': 'TL, TR, BR, BL (film px); quad = measured, quad_s = smoothed (use quad_s for camera moves)', 'frames': rows}
    json.dump(J, open(os.path.join(OUT, 'screen.json'), 'w'), indent=None, separators=(',', ':'))
    w = [r['w'] for r in rows]; h = [r['h'] for r in rows]
    print(f'{N} frames -> {OUT}; screen w {min(w):.1f}-{max(w):.1f} px, h {min(h):.1f}-{max(h):.1f} px; '
          f'centre {rows[0]["center"]} -> {rows[-1]["center"]}')
    if len(sys.argv) > 1:                                  # a check sheet: quads drawn on every 6th frame
        tiles = []
        for k in range(0, N, 6):
            im = cv2.cvtColor(frames[k].copy(), cv2.COLOR_RGB2BGR)
            q = np.array(rows[k]['quad'], np.int32)
            cv2.polylines(im, [q], True, (0, 0, 255), 3)
            for x, y in q: cv2.circle(im, (int(x), int(y)), 8, (0, 255, 0), 2)
            tiles.append(cv2.resize(im[300:1300, :], (324, 300)))
        while len(tiles) % 5: tiles.append(np.zeros_like(tiles[0]))
        sheet = np.vstack([np.hstack(tiles[i:i + 5]) for i in range(0, len(tiles), 5)])
        cv2.imwrite(sys.argv[1], sheet); print('check sheet', sys.argv[1])


if __name__ == '__main__':
    main()
