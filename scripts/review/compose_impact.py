#!/usr/bin/env python
"""Stack two FireAnt photos into one picture, the same session in the same column — the index's lead mover on top of
VN-Index (user 2026-10-05: "with VIC symbol since it affect to the market so much, so need a sentence and something
like view VIC behavior price action change beside the VNIndex"). scripts/review/lib/impact-compare.mjs works out the
geometry from the two calibrations and calls this with a JSON spec:

    {"out": "...png", "size": [w, h], "bg": [r, g, b],
     "parts": [{"src": "...png", "crop": [x0, y0, x1, y1], "at": [x, y], "masks": [[x0, y0, x1, y1], ...],
                "keepRight": x}],            # source px; right of keepRight is painted bg (the sidebar)
     "rules": [[x0, y0, x1, y1, [r, g, b]], ...]}

Masks are painted on the source before cropping (FireAnt's legend rows, measured on each photo). Run with the
video-factory venv (PIL).
"""
import json
import sys

from PIL import Image, ImageDraw

spec = json.loads(open(sys.argv[1], encoding='utf-8').read())
W, H = spec['size']
bg = tuple(spec['bg'])
out = Image.new('RGB', (W, H), bg)
for part in spec['parts']:
    src = Image.open(part['src']).convert('RGB')
    draw = ImageDraw.Draw(src)
    for x0, y0, x1, y1 in part.get('masks', []):
        draw.rectangle([x0, y0, x1, y1], fill=bg)
    keep = part.get('keepRight')
    if keep is not None and keep < src.width:
        draw.rectangle([keep, 0, src.width, src.height], fill=bg)
    x0, y0, x1, y1 = part['crop']
    out.paste(src.crop((x0, y0, x1, y1)), tuple(part['at']))
draw = ImageDraw.Draw(out)
for x0, y0, x1, y1, color in spec.get('rules', []):
    draw.rectangle([x0, y0, x1, y1], fill=tuple(color))
out.save(spec['out'])
print(json.dumps({'out': spec['out'], 'size': [W, H]}))
