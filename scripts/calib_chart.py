import json, sys
import numpy as np
from PIL import Image
spec = json.loads(sys.argv[1])
im = np.asarray(Image.open(spec['img']).convert('RGB')).astype(int)
x0, y0, x1, y1 = spec['pane']
sub = im[y0:y1, x0:x1]
m = np.zeros(sub.shape[:2], bool)
for c in spec['colors']:
    m |= np.abs(sub - np.array(c)).sum(axis=2) < spec.get('tol', 45)
H, W = m.shape
top = np.full(W, np.nan); bot = np.full(W, np.nan)
for x in range(W):
    col = m[:, x]; best = (0, None, None); s = None
    for y in range(H + 1):
        on = y < H and col[y]
        if on and s is None: s = y
        if not on and s is not None:
            if y - s > best[0]: best = (y - s, s, y - 1)
            s = None
    if best[0] >= spec.get('min_run', 3): top[x] = y0 + best[1]; bot[x] = y0 + best[2]
bars = json.load(open(spec['bars']))
N = spec.get('n', len(bars)); bars = bars[-N:]
Hs = np.array([b['h'] for b in bars]); Ls = np.array([b['l'] for b in bars])
last_x = spec['last_x']            # approximate x of the last bar's centre (image px)
d0 = spec['d']                     # approximate px per bar
best = None
for d in np.linspace(d0 * spec.get('dlo', 0.95), d0 * spec.get('dhi', 1.05), spec.get('dsteps', 81)):
    for lx in np.arange(last_x - spec.get('lxr', 4), last_x + spec.get('lxr', 4) + 0.01, spec.get('lxs', 0.25)):
        xs = lx - d * np.arange(N - 1, -1, -1)
        ts, bs, ok = [], [], []
        for i, x in enumerate(xs):
            j = int(round(x)) - x0
            if j < 1 or j >= W - 1: ok.append(False); ts.append(np.nan); bs.append(np.nan); continue
            win_t = top[j - 1:j + 2]; win_b = bot[j - 1:j + 2]
            if np.all(np.isnan(win_t)): ok.append(False); ts.append(np.nan); bs.append(np.nan); continue
            ok.append(True); ts.append(np.nanmin(win_t)); bs.append(np.nanmax(win_b))
        ok = np.array(ok)
        if ok.sum() < N * 0.6: continue
        ys = np.concatenate([np.array(ts)[ok], np.array(bs)[ok]]); ps = np.concatenate([Hs[ok], Ls[ok]])
        b_, a_ = np.polyfit(ps, ys, 1)
        res = np.abs(ys - (a_ + b_ * ps))
        keep = res < max(3.0, np.percentile(res, 60))
        if keep.sum() > 10:
            b_, a_ = np.polyfit(ps[keep], ys[keep], 1)
            res = np.abs(ys - (a_ + b_ * ps))
        score = np.median(res) + 0.2 * np.percentile(res, 90) + (N - ok.sum()) * 0.5
        if best is None or score < best[0]:
            best = (score, d, lx, a_, b_, float(np.median(res)), float(np.percentile(res, 90)), int(ok.sum()))
score, d, lx, a_, b_, med, p90, nok = best
out = {'img': spec['img'], 'first_bar': bars[0]['t'], 'last_bar': bars[-1]['t'], 'n': N, 'd': float(d), 'last_x': float(lx),
       'a': float(a_), 'b': float(b_), 'res_med': med, 'res_p90': p90, 'matched': nok,
       'size': [int(im.shape[1]), int(im.shape[0])]}
print(json.dumps(out))
json.dump(out, open(spec['out'], 'w'), indent=1)
