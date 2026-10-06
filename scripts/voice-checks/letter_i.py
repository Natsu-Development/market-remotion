"""Which spelling makes OmniVoice say the letter I so Whisper hears it? (VIC heard as "V1C" / "vê một xê", DRI as
"đê rờ một" on 5/10.) Synthesizes each variant 3 times in its real sentence and transcribes it plainly (Vietnamese).
Run with ../video-factory/.venv/bin/python from the repo root."""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.review-cache' / 'voice-checks' / 'letter_i'
OUT.mkdir(parents=True, exist_ok=True)
meta = json.loads((ROOT / '.tts-cache/_sentences.json').read_text(encoding='utf-8'))

CARRIERS = {
    'VIC': 'Thêm một mã đáng chú ý là {t}, giá hồi từ trendline hỗ trợ.',
    'DRI': 'Pê vê pê và {t} đứng đầu bảng, giá cùng nằm trên e em ây năm mươi.',
}
VARIANTS = {
    'VIC': ['vê i xê', 'vê y xê', 'vê-i-xê', 'vê ì xê'],
    'DRI': ['đê rờ i', 'đê rờ y', 'đê rờ ì'],
}
TAKES = 3
items, rows = [], []
for sym, forms in VARIANTS.items():
    for k, form in enumerate(forms):
        for n in range(TAKES):
            out = OUT / f'{sym}-{k}-{n}.wav'
            items.append({'text': CARRIERS[sym].format(t=form), 'out': str(out), 'speed': 0.92})
            rows.append((sym, form, out))
spec = {k: meta[k] for k in ('model', 'device', 'ref_audio', 'ref_text')}
spec['speed'] = 1.0
spec['items'] = [it for it in items if not Path(it['out']).exists()]
if spec['items']:
    p = OUT / '_spec.json'
    p.write_text(json.dumps(spec, ensure_ascii=False), encoding='utf-8')
    subprocess.run([sys.executable, str(ROOT / 'scripts/tts_omnivoice.py'), str(p)], check=True, cwd=ROOT)

import mlx_whisper  # noqa: E402
res = {}
for sym, form, out in rows:
    r = mlx_whisper.transcribe(str(out), path_or_hf_repo='mlx-community/whisper-large-v3-mlx', language='vi', temperature=0.0)
    heard = r['text'].strip()
    res.setdefault((sym, form), []).append(heard)
for (sym, form), hs in res.items():
    print(f'== {sym} as "{form}"')
    for h in hs:
        print('   ', h)
