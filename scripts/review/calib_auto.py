"""Calibrates a chart photo against known bars, without hand-measured starting guesses.

  ../video-factory/.venv/bin/python scripts/review/calib_auto.py '<json spec>'

spec: img, bars (json file of [{t, h, l}], oldest first), out, colors [[r, g, b], ...],
      optional pane [x0, y0, x1, y1] in image px or paneFrac (the same as fractions of the image),
      tol (45), min_run (3), gap (2).

scripts/calib_chart.py fits x = last_x - d*(N-1-i) and y = a + b*price to the candle columns it
finds by colour, but it needs the pane, N, last_x and d as starting guesses — measured by hand on
each photo. A daily reel cannot wait for that, so this script finds them:

  pane    given, or the tallest horizontal band of candle-coloured pixels (the price pane; the
          volume pane below it is separated by rows with no candle colour at all)
  d       the median distance between neighbouring candle-column centres
  last_x  the centre of the right-most column
  N       (right-most centre - left-most centre) / d + 1. Counting columns would also count the
          terminal's own signal arrows and axis price tags, which share the candle colours.

then runs calib_chart.py with them and prints its result (the last stdout line is the JSON).
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

spec = json.loads(sys.argv[1])
src_img = spec['img']
pil = Image.open(src_img).convert('RGB')
blank_tmp = None
if spec.get('blank'):
    # Rects (photo fractions) painted in the pane's background before anything is detected — FireAnt's legend
    # rows sit INSIDE the price pane and print values in the candle colours (2026-10-01, the MA50/MA200 rows of
    # the stock tab), so cutting the pane below them would also cut the newest highs. calib_chart.py reads the
    # image itself, so it gets the blanked copy too; the result still names the original photo.
    from PIL import ImageDraw
    Wb, Hb = pil.size
    bg = tuple(int(v) for v in spec.get('blankColor', [21, 23, 31]))
    draw = ImageDraw.Draw(pil)
    for fx0, fy0, fx1, fy1 in spec['blank']:
        draw.rectangle([int(fx0 * Wb), int(fy0 * Hb), int(fx1 * Wb), int(fy1 * Hb)], fill=bg)
    blank_tmp = str(Path(spec['out']).with_suffix('.blanked.png'))
    pil.save(blank_tmp)
    spec['img'] = blank_tmp
im = np.asarray(pil).astype(int)
H, W = im.shape[:2]
tol = spec.get('tol', 45)
mask = np.zeros((H, W), bool)
for c in spec['colors']:
    mask |= np.abs(im - np.array(c)).sum(axis=2) < tol

if spec.get('paneFrac'):
    fx0, fy0, fx1, fy1 = spec['paneFrac']
    x0, y0, x1, y1 = int(fx0 * W), int(fy0 * H), int(fx1 * W), int(fy1 * H)
elif spec.get('pane'):
    x0, y0, x1, y1 = spec['pane']
else:
    rows = mask.sum(axis=1)
    bands, start = [], None
    for y in range(H + 1):
        on = y < H and rows[y] > 0
        if on and start is None:
            start = y
        if not on and start is not None:
            bands.append((start, y))
            start = None
    if not bands:
        sys.exit('calib_auto: no candle-coloured pixels — wrong colours or not a chart')
    # Merge bands split by thin gaps (a doji's missing body), then take the tallest.
    merged = [list(bands[0])]
    for a, b in bands[1:]:
        if a - merged[-1][1] <= spec.get('gap', 2):
            merged[-1][1] = b
        else:
            merged.append([a, b])
    y0, y1 = max(merged, key=lambda ab: (ab[1] - ab[0]) * (mask[ab[0]:ab[1]].sum() > 0))
    cols = np.where(mask[y0:y1].any(axis=0))[0]
    x0, x1 = int(cols.min()), int(cols.max()) + 1

sub = mask[y0:y1, x0:x1]
min_run = spec.get('min_run', 3)
# A column belongs to a candle when it holds a vertical run of candle colour at least min_run long.
def longest_run(col):
    best = run = 0
    for v in col:
        run = run + 1 if v else 0
        best = max(best, run)
    return best
has = np.array([longest_run(sub[:, x]) >= min_run for x in range(sub.shape[1])])
centres, start = [], None
for x in range(len(has) + 1):
    on = x < len(has) and has[x]
    if on and start is None:
        start = x
    if not on and start is not None:
        centres.append(x0 + (start + x - 1) / 2)
        start = None
if len(centres) < 10:
    sys.exit(f'calib_auto: only {len(centres)} candle columns found in pane {[x0, y0, x1, y1]}')
d = float(np.median(np.diff(centres)))
bars = json.load(open(spec['bars']))
n = min(int(round((centres[-1] - centres[0]) / d)) + 1, len(bars))

job = {'img': spec['img'], 'pane': [int(x0), int(y0), int(x1), int(y1)], 'colors': spec['colors'], 'tol': tol,
       'min_run': min_run, 'bars': spec['bars'], 'n': n, 'last_x': float(centres[-1]), 'd': d, 'out': spec['out']}
here = Path(__file__).resolve().parent
r = subprocess.run([sys.executable, str(here.parent / 'calib_chart.py'), json.dumps(job)], capture_output=True, text=True)
if r.returncode != 0:
    sys.exit(f'calib_auto: calib_chart.py failed\n{r.stderr}')
out = json.loads(r.stdout.strip().splitlines()[-1])

# Refine the TIME axis on the candle columns themselves. calib_chart.py scores a fit by the tops and
# bottoms it reads at each predicted x, which barely changes when x is off by less than half a candle
# (its neighbour is only ~6 px away) — measured 2026-09-29 on FireAnt daily: y median 0.54 px, yet the
# tips of the distribution-day arrows sat 2.4 px left of their candles. Match every detected column to
# the session it must be (k sessions before the last) and least-squares c = last_x - d*k.
lx, dd = out['last_x'], out['d']
for _ in range(3):
    pairs = []
    for c in centres:
        k = round((lx - c) / dd)
        if 0 <= k < out['n'] and abs(lx - dd * k - c) < 0.45 * dd:
            pairs.append((k, c))
    if len(pairs) < max(10, out['n'] // 3):
        break
    K = np.array([p[0] for p in pairs], float)
    Cc = np.array([p[1] for p in pairs], float)
    slope, icept = np.polyfit(K, Cc, 1)          # c = icept + slope*k, slope = -d
    lx, dd = float(icept), float(-slope)
res = [abs(lx - dd * k - c) for k, c in pairs] if pairs else [float('nan')]
out['xFit'] = {'from': {'last_x': out['last_x'], 'd': out['d']}, 'matched': len(pairs), 'res_med': float(np.median(res)), 'res_p90': float(np.percentile(res, 90))}
out['last_x'], out['d'] = lx, dd
out['pane'] = job['pane']
out['columnsFound'] = len(centres)
out['img'] = src_img
if blank_tmp:
    out['blank'] = spec['blank']
    Path(blank_tmp).unlink(missing_ok=True)
json.dump(out, open(spec['out'], 'w'), indent=1)
print(json.dumps(out))
