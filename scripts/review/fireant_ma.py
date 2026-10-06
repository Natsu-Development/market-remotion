"""Reads the moving averages FireAnt itself draws on a chart photo — never computes one.

  ../video-factory/.venv/bin/python scripts/review/fireant_ma.py '<json spec>'

spec: img (FireAnt photo, page area 1080 wide), calib (the photo's .calib.json from calib_auto.py),
      out (<sym>-fireant.ma.json), symbol, date, periods ([50, 200]),
      optional terminal {ema50, sma200} (sanity only: EMA != SMA), debug (dir for the OCR crops).

The user (2026-10-01): "The FireAnt also have the MA50 and MA200 for this symbol refer it not need
self-calculation." So the value of each MA is what FireAnt PRINTS, read three ways:

  legend    TradingView's legend under the OHLC line, one row per indicator ("MA 50 close 0 … 43.50");
            the row's period picks the MA, its last decimal is the value, and the colour of that value
            text is the line's colour
  tags      the price scale's last-value tags: a filled box per plot, in the plot's colour, holding the
            value — matched to a legend row by colour
  line      the MA line itself at the last candle: pixels of the row's colour in the columns around
            calib.last_x, converted to a price through the calibration (y = a + b*price). It only
            CHECKS the printed value (lineVsValuePx); it is never the value.

A value FireAnt does not show (indicator absent, unreadable) is null with the reason in `why`.
The last stdout line is the JSON written to `out`.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

TESSERACT = '/opt/homebrew/bin/tesseract'
spec = json.loads(sys.argv[1])
img = Image.open(spec['img']).convert('RGB')
A = np.asarray(img).astype(int)
H, W = A.shape[:2]
cal = json.load(open(spec['calib'])) if spec.get('calib') else None
periods = spec.get('periods', [50, 200])
dbg = Path(spec['debug']) if spec.get('debug') else None
if dbg:
    dbg.mkdir(parents=True, exist_ok=True)

# Page-area geometry of FireAnt's chart at 1080 wide (measured 2026-10-01 on msr-fireant.png: OHLC header
# y ~143, legend rows from y ~168 at 22-24 px pitch, chart pane x 62..975, price scale x 975..1048).
LEGEND = (62, 128, 820, 262)
SCALE = (976, 130, 1049, 800)
PANE_X = (62, 972)
# Where FireAnt's volume bars stand (photo fraction of their base): the bottom of the price pane — 0.916 on a tab with
# price + volume only, 0.657 on the user's VNINDEX tab, whose MACD pane sits under it (2026-10-03).
VOLUME_FLOOR = float(spec.get('volumeFloor', 0.95))


def tess(im: Image.Image, psm: str, tag: str) -> str:
    path = (dbg / f'{tag}.png') if dbg else Path(spec['out']).with_suffix(f'.{tag}.tmp.png')
    im.save(path)
    out = subprocess.run([TESSERACT, str(path), '-', '--psm', psm, 'tsv'], capture_output=True).stdout.decode('utf-8', 'replace')
    if not dbg:
        path.unlink(missing_ok=True)
    return out


def words_of(tsv: str, x0: int, y0: int, k: float):
    rows = []
    for line in tsv.splitlines()[1:]:
        p = line.split('\t')
        if len(p) == 12 and p[11].strip():
            rows.append({'text': p[11].strip(), 'x': x0 + int(p[6]) / k, 'y': y0 + int(p[7]) / k, 'w': int(p[8]) / k,
                         'h': int(p[9]) / k, 'line': (int(p[2]), int(p[3]), int(p[4]))})
    return rows


def dominant_colour(x0, y0, x1, y1):
    """The most saturated colour among the bright pixels of a text box — the plot colour of a legend value."""
    box = A[int(y0):int(y1), int(x0):int(x1)].reshape(-1, 3)
    if not len(box):
        return None
    sat = box.max(axis=1) - box.min(axis=1)
    lum = box.mean(axis=1)
    pick = box[(sat > 60) & (lum > 60)]
    if len(pick) < 4:
        return None
    return [int(v) for v in np.median(pick, axis=0)]


NUM = re.compile(r'(\d{1,6}(?:[.,]\d{1,3})?)')
DEC = re.compile(r'(\d{1,6}[.,]\d{1,3})')
WHITELIST = 'tessedit_char_whitelist=0123456789.,KMB%+-()'


def to_float(s: str):
    s = s.replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def ocr_box(g: Image.Image, tag: str):
    """Two single-line reads (psm 7 and 8) of a binarised, padded crop, digits only."""
    path = (dbg / f'{tag}.png') if dbg else Path(spec['out']).with_suffix(f'.{tag}.tmp.png')
    g.save(path)
    outs = [subprocess.run([TESSERACT, str(path), '-', '--psm', psm, '-c', WHITELIST], capture_output=True).stdout.decode('utf-8', 'replace').strip() for psm in ('7', '8')]
    if not dbg:
        path.unlink(missing_ok=True)
    return outs


def reread_dark(bx, by, bw, bh, tag):
    """Coloured text on FireAnt's dark chart (a legend value): the max channel separates any hue from
    the background, where luminance loses green and red text (measured 2026-10-01: C58.60, L54.30,
    +5.97% and 3.989M read right this way; inverted luminance missed them)."""
    box = (max(0, int(bx) - 2), max(0, int(by) - 2), min(W, int(bx + bw) + 3), min(H, int(by + bh) + 3))
    v = A[box[1]:box[3], box[0]:box[2]].max(axis=2).astype(np.uint8)
    g = Image.fromarray(v).resize(((box[2] - box[0]) * 6, (box[3] - box[1]) * 6), Image.LANCZOS).point(lambda p: 0 if p > 90 else 255)
    return ocr_box(ImageOps.expand(g, border=24, fill=255), tag)


def reread_tag(box, bg, tag):
    """A price-scale tag: text in the contrast colour of its box (light on dark/saturated boxes, dark on
    light ones). Measured 2026-10-01: the 58.60 and 3.989M tags read right (psm 8 / psm 7)."""
    g = ImageOps.grayscale(img.crop(box)).resize(((box[2] - box[0]) * 6, (box[3] - box[1]) * 6), Image.LANCZOS)
    light_text = sum(bg) / 3 < 150
    g = g.point((lambda p: 0 if p > 170 else 255) if light_text else (lambda p: 0 if p < 110 else 255))
    return ocr_box(ImageOps.expand(g, border=24, fill=255), tag)


def consensus(readings):
    """The decimal most readings agree on (first one wins a tie), or None."""
    vals = []
    for r in readings:
        m = DEC.search((r or '').replace(' ', ''))
        if m:
            vals.append(to_float(m.group(1)))
    if not vals:
        return None, 0
    best = max(vals, key=lambda v: (vals.count(v), -vals.index(v)))
    return best, vals.count(best)


# ------------------------------------------------------------------ legend rows

# FireAnt's legend is a stack of rows at the top-left of the price pane — the OHLC header, "Volume - Khối lượng",
# then one row per indicator ("MA Cross - Cặp đường trung bình trượt giao cắt 50 200 44.04 39.12", the user's MA50/MA200
# on their VNINDEX tab, 2026-10-03) — with the collapse button under the last one. The rows are found by their grey title
# text at the left edge, NOT by OCR line grouping: candles and MA lines run right under (and through) the legend, and
# tesseract glued them into the rows (a PVT "row" 0.12 tall, candle "rows" on VNINDEX, 2026-10-03).
TITLE_X = (71, 250)


def legend_rows_of(arr, im):
    lum = arr.mean(axis=2)
    sat = arr.max(axis=2) - arr.min(axis=2)
    grey = (lum > 150) & (sat < 45)
    ys = [y for y in range(LEGEND[1], min(LEGEND[3], H)) if grey[y, TITLE_X[0]:TITLE_X[1]].sum() >= 3]
    bands = []
    for y in ys:
        if bands and y - bands[-1][1] <= 2:
            bands[-1][1] = y
        else:
            bands.append([y, y])
    rows = []
    for y0, y1 in bands:
        if y1 - y0 < 6:                       # the collapse button's chevron, not a text row
            continue
        if rows and y0 - rows[-1]['y1'] > 20:  # past the legend stack
            break
        # The row's right end: legend text (grey, or a value in its plot colour) until a gap wider than a word space.
        band = arr[y0:y1 + 1]
        textish = (((band.mean(axis=2) > 95) & ((band.max(axis=2) - band.min(axis=2)) < 45)) | (((band.max(axis=2) - band.min(axis=2)) > 60) & (band.max(axis=2) > 90))).any(axis=0)
        x_end, gap = TITLE_X[0], 0
        for x in range(TITLE_X[0], min(W, 900)):
            if textish[x]:
                x_end, gap = x, 0
            else:
                gap += 1
                if gap > 22 and x > TITLE_X[0] + 60:
                    break
        # OCR of that band alone: max channel, so coloured values read as well as the grey title.
        def ocr_band(pad_top, pad_bottom, tag):
            bx0, by0, bx1, by1 = 62, max(0, y0 - pad_top), min(W, x_end + 6), min(H, y1 + pad_bottom)
            v = arr[by0:by1, bx0:bx1].max(axis=2).astype(np.uint8)
            g = Image.fromarray(v).resize(((bx1 - bx0) * 3, (by1 - by0) * 3), Image.LANCZOS).point(lambda p: 0 if p > 95 else 255)
            return words_of(tess(ImageOps.expand(g, border=12, fill=255), '7', tag), bx0 - 4, by0 - 4, 3)
        words = ocr_band(3, 4, f'row-{y0}')
        # A last-price line drawn just under a row (FireAnt's dotted line at the close: MSR 5/10, 60.10 at y 201 under the
        # MA Cross row ending at y 198) puts a dashed stripe inside the box and tesseract returns nothing. Read the row
        # again with the box held to its own text before giving up on it.
        if not words:
            words = ocr_band(1, 1, f'row-{y0}-tight')
        rows.append({'y0': y0, 'y1': y1, 'x0': 62, 'x1': x_end, 'words': words, 'text': ' '.join(w['text'] for w in words)})
    return rows


def row_text(r):
    return r['text']


rows_clean = legend_rows_of(A, img)                # the clean photo: where the rows are (they get masked)
legend_text = [r['text'] for r in rows_clean]
if spec.get('legendOnly'):
    # First pass for shots.mjs: where the legend rows are, so calibration can blank them (they sit in the pane).
    print(json.dumps({'legendRows': [{'text': r['text'], 'x0': round(r['x0'] / W, 4), 'y0': round(r['y0'] / H, 4), 'x1': round(r['x1'] / W, 4), 'y1': round(r['y1'] / H, 4)} for r in rows_clean]}, ensure_ascii=False))
    sys.exit(0)

# ------------------------------------------------------------------ the values: legend rows of the as-of bar

# With legendImg (shoot_real --hover-back: the pointer on the edition's candle) the legend prints THAT bar's OHLC and
# MA values; the clean photo's own legend prints the chart's last bar.
img_clean, A_clean = img, A
if spec.get('legendImg'):
    img = Image.open(spec['legendImg']).convert('RGB')
    A = np.asarray(img).astype(int)
value_rows = legend_rows_of(A, img) if spec.get('legendImg') else rows_clean
legend_rows = {}
hover_check = None
numeric = lambda w: sum(ch.isdigit() for ch in w['text']) >= 3
for r in value_rows:
    ws = sorted(r['words'], key=lambda w: w['x'])
    text = r['text']
    norm = re.sub(r'(?<=\d)[oO]|[oO](?=\d)', '0', text)
    if hover_check is None and spec.get('expectClose') is not None and re.search(r'\bH\s*[\d.,]+.*\bL\s*[\d.,]+', norm):
        # The OHLC header of the bar the legend shows: its close must be the edition's close.
        cw = [w for w in ws if re.match(r'^[C©€]\s*\d', re.sub(r'[oO](?=\d)', '0', w['text']))]  # tesseract reads FireAnt's C as € (VIC 5/10)
        reads = [re.sub(r'^[C©€]', '', cw[-1]['text'])] + list(reread_dark(cw[-1]['x'], cw[-1]['y'], cw[-1]['w'], cw[-1]['h'], 'hover-close')) if cw else []
        got, _ = consensus(reads)
        hover_check = {'expectClose': spec['expectClose'], 'readClose': got, 'ok': got is not None and abs(got - spec['expectClose']) < 0.011, 'header': text}
        continue
    cross = re.search(r'Cross|trung\s*b|giao\s*c', norm, re.I)
    single = re.match(r'^\W*(?:S?MA|EMA|Moving\s+Average)\W*(\d{1,3})\b', norm, re.I)
    if not cross and not single:
        continue
    # The values are the numeric words right of the title: one per plot, in plot order (MA Cross: the short MA, then
    # the long one — the order of its inputs "50 200"). Each is re-read (max channel, digits only) and voted.
    title_end = max((w['x'] + w['w'] for w in ws if re.search(r'[A-Za-zÀ-ỹ]{2,}', w['text'])), default=TITLE_X[0])
    vals = [w for w in ws if numeric(w) and w['x'] > title_end - 2 and re.search(r'[.,]', w['text']) or (numeric(w) and w['x'] > title_end - 2 and len(re.sub(r'\D', '', w['text'])) >= 4)]
    periods = [int(w['text']) for w in ws if re.fullmatch(r'\d{1,3}', w['text']) and w['x'] < (vals[0]['x'] if vals else W)][-2:] if cross else [int(single.group(1))]
    if cross and len(periods) < 2:
        periods = list(spec.get('periods', [50, 200]))
    for k, period in enumerate(periods):
        if k >= len(vals):
            legend_rows[period] = {'text': text, 'value': None, 'colour': None, 'why': 'no value on the legend row'}
            continue
        v = vals[k]
        value, votes = consensus([re.sub(r'[oO]', '0', v['text']), *reread_dark(v['x'], v['y'], v['w'], v['h'], f'legend-ma{period}')])
        legend_rows[period] = {'text': text, 'value': value, 'votes': votes, 'colour': dominant_colour(v['x'], v['y'], v['x'] + v['w'], v['y'] + v['h']), 'kind': 'MA Cross' if cross else single.group(0).strip()}
img, A = img_clean, A_clean

# ------------------------------------------------------------------ price-scale tags

sx0, sy0, sx1, sy1 = SCALE
sy1 = min(sy1, int(H * VOLUME_FLOOR) + 4)          # the price pane's tags only (a MACD pane below has its own)
col = A[sy0:sy1, sx0 + 4:sx1 - 4]
sat = col.max(axis=2) - col.min(axis=2)
filled = (sat > 50).mean(axis=1) > 0.5            # rows where most of the scale is one saturated colour
tags = []
y = 0
while y < len(filled):
    if filled[y]:
        start = y
        while y < len(filled) and filled[y]:
            y += 1
        if y - start >= 10:
            ty0, ty1 = sy0 + start, sy0 + y
            bg = [int(v) for v in np.median(A[ty0:ty1, sx0 + 4:sx1 - 4].reshape(-1, 3), axis=0)]
            reads = reread_tag((sx0 + 8, ty0, sx1 - 2, ty1), bg, f'tag-{ty0}')
            value, votes = consensus(reads)
            tags.append({'y': (ty0 + ty1) / 2, 'y0': ty0, 'y1': ty1, 'bg': bg, 'text': ' | '.join(reads), 'value': value, 'votes': votes})
    else:
        y += 1

# ------------------------------------------------------------------ the line at the last candle

a, b = cal['a'], cal['b']
last_x, d = cal['last_x'], cal['d']
back = int(spec.get('asOfBack') or 0)
asof_x = last_x - back * d            # the edition's candle (back bars before the chart's last)


# The legend prints each MA's value in the line's own colour: line pixels are only taken below the legend stack (or right
# of it), or the MA50 path jumps to its own "44.04" (2026-10-03).
LEG_FLOOR = (rows_clean[-1]['y1'] + 6) if rows_clean else 0
LEG_RIGHT = max((r['x1'] for r in rows_clean), default=0) + 6


def below_legend(x, ys):
    return ys[ys + int(cal['pane'][1]) > LEG_FLOOR] if x < LEG_RIGHT else ys


def line_y(colour, tol=46):
    """Median y of `colour` pixels in the columns just left of the last candle (the candle's own
    body sits on last_x; the MA passes through the gap between the last two candles)."""
    if not colour:
        return None
    xs = [int(round(asof_x - d * f)) for f in (0.5, 0.45, 0.55, 1.5)]
    hits = []
    for x in xs:
        if not PANE_X[0] <= x < PANE_X[1]:
            continue
        colx = A[int(cal['pane'][1]):int(cal['pane'][3]), x]
        near = np.abs(colx - np.array(colour)).sum(axis=1) < tol
        ys = below_legend(x, np.where(near)[0])
        if len(ys):
            hits.append(float(np.median(ys)) + cal['pane'][1])
    return float(np.median(hits)) if hits else None


def line_path(colour, tol=46):
    """The MA line through the window: its y between each pair of neighbouring candles (where no candle body
    hides it), as [x, y] photo fractions — so a plate can sit next to the line wherever there is room."""
    if not colour:
        return []
    pts = []
    for i in range(int(cal['n']) - 1):
        x = int(round(last_x - d * (cal['n'] - 1 - i) + d / 2))
        if not PANE_X[0] <= x < PANE_X[1]:
            continue
        colx = A[int(cal['pane'][1]):int(cal['pane'][3]), x]
        ys = below_legend(x, np.where(np.abs(colx - np.array(colour)).sum(axis=1) < tol)[0])
        if len(ys) and ys.max() - ys.min() < 12:            # one thin line, not a candle or a legend glyph
            pts.append([round(x / W, 4), round((float(np.median(ys)) + cal['pane'][1]) / H, 4)])
    return pts


def nearest_tag(colour):
    if not colour or not tags:
        return None
    t = min(tags, key=lambda t: np.abs(np.array(t['bg']) - np.array(colour)).sum())
    return t if np.abs(np.array(t['bg']) - np.array(colour)).sum() < 90 else None


ma = {}
for p in periods:
    row = legend_rows.get(p)
    if not row:
        ma[f'ma{p}'] = {'value': None, 'why': f'no MA {p} row in the FireAnt legend (indicator not on this chart)', 'label': None}
        continue
    tag = nearest_tag(row.get('colour'))
    value = row['value'] if row['value'] is not None else (tag or {}).get('value')
    ly = line_y(row.get('colour'))
    entry = {
        'value': value,
        'label': row['text'],
        'kind': row.get('kind'),
        'color': row.get('colour'),
        'tag': {'value': tag['value'], 'y': tag['y']} if tag else None,
        'yAtLast': round(ly / H, 4) if ly is not None else None,
        'path': line_path(row.get('colour')),
        'source': 'legend' if row['value'] is not None else ('price-scale tag' if tag else None),
    }
    if value is not None and ly is not None:
        entry['lineVsValuePx'] = round(ly - (a + b * value), 1)
    if not back and row['value'] is not None and tag and tag['value'] is not None and abs(tag['value'] - row['value']) > 0.011:
        entry['why'] = f"legend says {row['value']}, the price-scale tag {tag['value']} — legend kept"
    ma[f'ma{p}'] = entry

# ------------------------------------------------------------------ geometry the scene needs

# Legend rows (OHLC header, Volume, one per indicator) as boxes in photo fractions: the scene masks them —
# FireAnt's small legend text would sit over a close-up — and puts its own plates on the lines instead.
legend_boxes = [{'text': r['text'], 'x0': round(r['x0'] / W, 4), 'y0': round(r['y0'] / H, 4), 'x1': round(r['x1'] / W, 4), 'y1': round(r['y1'] / H, 4)} for r in rows_clean]

# The last session's volume bar (FireAnt draws volume as muted bars along the bottom of the price pane):
# scan the last candle's column up from the pane bottom while the pixel is a volume colour.
def volume_bar():
    x = int(round(asof_x))
    bottom = None
    for y in range(int(H * VOLUME_FLOOR), int(H * 0.4), -1):
        px = A[y, x]
        if px.max() - px.min() > 25 and px.max() < 170:
            bottom = y
            break
    if bottom is None:
        return None
    top = bottom
    while top > H * 0.4 and (A[top - 1, x].max() - A[top - 1, x].min() > 25) and A[top - 1, x].max() < 170:
        top -= 1
    return {'x': round(asof_x / W, 4), 'top': round(top / H, 4), 'bottom': round((bottom + 1) / H, 4), 'colour': [int(v) for v in A[bottom - 2, x]]}


def volume_tops():
    """Top of every candle's volume bar ([x, top] photo fractions): where the muted volume overlay rises, a plate
    cannot sit."""
    if not cal:
        return []
    tops = []
    for i in range(int(cal['n'])):
        x = int(round(last_x - d * (cal['n'] - 1 - i)))
        if not PANE_X[0] <= x < PANE_X[1]:
            continue
        y = int(H * 0.915)
        bottom = None
        for yy in range(int(H * VOLUME_FLOOR), int(H * 0.4), -1):
            px = A[yy, x]
            if px.max() - px.min() > 25 and px.max() < 170:
                bottom = yy
                break
        if bottom is None:
            continue
        top = bottom
        while top > H * 0.45 and (A[top - 1, x].max() - A[top - 1, x].min() > 25) and A[top - 1, x].max() < 170:
            top -= 1
        tops.append([round(x / W, 4), round(top / H, 4)])
    return tops


term = spec.get('terminal') or {}
out = {
    'symbol': spec.get('symbol'),
    'date': spec.get('date'),
    'photo': spec['img'],
    'source': 'fireant.vn chart legend / price-scale tags (OCR, tesseract) — FireAnt\'s own moving averages, nothing computed',
    'ma': ma,
    'ocrText': legend_text,
    'tags': [{'y': round(t['y'] / H, 4), 'y0': round(t['y0'] / H, 4), 'y1': round(t['y1'] / H, 4), 'x0': round(SCALE[0] / W, 4), 'x1': round(SCALE[2] / W, 4), 'bg': t['bg'], 'value': t['value']} for t in tags],
    'asOf': {'back': back, 'x': round(asof_x / W, 4), 'legendFrom': 'hover' if spec.get('legendImg') else 'photo'},
    'hoverCheck': hover_check,
    'legendRows': legend_boxes,
    'volumeBar': volume_bar(),
    'volumeTops': volume_tops(),
    'crossCheck': {
        'ema50Terminal': term.get('ema50'),
        'sma200Terminal': term.get('sma200'),
        'lineVsValuePx': {k: v.get('lineVsValuePx') for k, v in ma.items()},
    },
}
Path(spec['out']).write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n')
print(json.dumps(out, ensure_ascii=False))
