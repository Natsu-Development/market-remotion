"""Which spoken form makes OmniVoice say every word of a big number? (5/10: the hook's "một nghìn bảy trăm năm mươi ba"
heard as "một nghìn bảy năm ba", flow's "năm nghìn tám trăm linh hai tỷ" as "năm tám không hai tỷ".) Each variant is
synthesized 3 times and transcribed with every digit token suppressed, so a number must come back as words."""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.review-cache' / 'voice-checks' / 'numbers'
OUT.mkdir(parents=True, exist_ok=True)
meta = json.loads((ROOT / '.tts-cache/_sentences.json').read_text(encoding='utf-8'))

HOOK = 'VN-Index đóng cửa {n}, tăng không chấm tám mươi chín phần trăm.'
FLOW = 'Tiền nghiêng về mã tăng: {a} tỷ, phía giảm {b} tỷ.'
VARIANTS = [
    ('hook-ngan', HOOK.format(n='một ngàn bảy trăm năm mươi ba'), 0.92),
    ('hook-ngan-comma', HOOK.format(n='một ngàn, bảy trăm năm mươi ba'), 0.92),
    ('flow-ngan-le', FLOW.format(a='năm ngàn tám trăm lẻ hai', b='ba ngàn chín trăm tám mươi hai'), 0.92),
    ('flow-ngan-le-comma', FLOW.format(a='năm ngàn, tám trăm lẻ hai', b='ba ngàn, chín trăm tám mươi hai'), 0.92),
    ('flow-nghin-le-comma', FLOW.format(a='năm nghìn, tám trăm lẻ hai', b='ba nghìn, chín trăm tám mươi hai'), 0.92),
]
TAKES = 3
items, rows = [], []
for key, text, speed in VARIANTS:
    for n in range(TAKES):
        out = OUT / f'{key}-{n}.wav'
        items.append({'text': text, 'out': str(out), 'speed': speed})
        rows.append((key, out))
spec = {k: meta[k] for k in ('model', 'device', 'ref_audio', 'ref_text')}
spec['speed'] = 1.0
spec['items'] = [it for it in items if not Path(it['out']).exists()]
if spec['items']:
    p = OUT / '_spec.json'
    p.write_text(json.dumps(spec, ensure_ascii=False), encoding='utf-8')
    subprocess.run([sys.executable, str(ROOT / 'scripts/tts_omnivoice.py'), str(p)], check=True, cwd=ROOT)

import mlx_whisper  # noqa: E402
from mlx_whisper.tokenizer import get_tokenizer  # noqa: E402
import re  # noqa: E402
tok = get_tokenizer(multilingual=True, language='vi', task='transcribe')
digits = [i for i in range(tok.encoding.n_vocab) if re.search(r'\d|%', tok.encoding.decode([i]))]
suppress = [-1] + digits
res = {}
for key, out in rows:
    r = mlx_whisper.transcribe(str(out), path_or_hf_repo='mlx-community/whisper-large-v3-mlx', language='vi', temperature=0.0,
                               suppress_tokens=suppress, sample_len=120)
    q = mlx_whisper.transcribe(str(out), path_or_hf_repo='mlx-community/whisper-large-v3-mlx', language='vi', temperature=0.0)
    res.setdefault(key, []).append(r['text'].strip() + '   ||   plain: ' + q['text'].strip())
for key, hs in res.items():
    print(f'== {key}')
    for h in hs:
        print('   ', h)
