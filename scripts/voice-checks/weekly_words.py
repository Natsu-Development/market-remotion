"""Weekly vocabulary, measured before the first real weekly (9/10): the hook's new invitation and the Momentum filter names.

  invite   "Cùng mình điểm lại tuần qua và lên kế hoạch giao dịch cho tuần tới nhé." — 6 takes at the hook's pace (0.95,
           voice.pace.speed.hook): is every one of "điểm lại", "lên kế hoạch giao dịch", "tuần tới" heard in every take?
  terms    'Momentum' / 'breakout' / 'breakdown' in their real sentences (breakout scene #1, breakdown scene #1), 3 takes per
           reading: the lexicon's guesses ('mô men tầm', 'bờ rếch ao', 'bờ rếch đao'), no entry (OmniVoice reads the
           English word) and the Vietnamese trader spellings ('mô men tum', 'brếch ao', 'brếch đao').

Each take is transcribed three ways, as scripts/tts_takes.py listens (text tokens only — a suppressed timestamp token
makes the decoder loop on '!'):
  words    Vietnamese, every digit token suppressed, tts_takes.py's neutral primer — the gate's own words pass
  syll     the same with the English spellings of the three terms suppressed too, so the syllables said come back
  en       English, plain — how an English ear hears the term
A term counts as heard the way tts_takes.py counts a lexicon word: its spoken syllables (tone marks ignored, the southern
r/d/gi, x/s merge) or the English word written whole ("Momentum", "break out").

    ../video-factory/.venv/bin/python scripts/voice-checks/weekly_words.py [--synth-only | --listen-only]

Outputs .review-cache/voice-checks/weekly/ (takes, _spec.json, report.json).
"""
import difflib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.review-cache' / 'voice-checks' / 'weekly'
OUT.mkdir(parents=True, exist_ok=True)
meta = json.loads((ROOT / '.tts-cache/_sentences.json').read_text(encoding='utf-8'))
argv = sys.argv[1:]

INVITE = 'Cùng mình điểm lại tuần qua và lên kế hoạch giao dịch cho tuần tới nhé.'
BREAKOUT = 'Bộ lọc {m} {o} tuần này chỉ có hai mã.'
BREAKDOWN = 'Tuần này bộ lọc {m} {d} có tới sáu mã, gấp ba bên {o}.'
READINGS = {
    'lexicon': {'m': 'mô men tầm', 'o': 'bờ rếch ao', 'd': 'bờ rếch đao'},
    'english': {'m': 'Momentum', 'o': 'breakout', 'd': 'breakdown'},
    'trader': {'m': 'mô men tum', 'o': 'brếch ao', 'd': 'brếch đao'},
}
LABEL = {'m': 'Momentum', 'o': 'breakout', 'd': 'breakdown'}
# the gate's speed for these: invitation = hook (0.95); the two filter sentences are not key sentences (speed 1)
CASES = [('invite', INVITE, 0.95, 6, None)]
for name, r in READINGS.items():
    CASES.append((f'breakout-{name}', BREAKOUT.format(**r), 1.0, 3, r))
    CASES.append((f'breakdown-{name}', BREAKDOWN.format(**r), 1.0, 3, r))

# ICB group names as a writer would say them (the board prints rules.sectors.short, which writes '&' and 'DV'), and the
# lexicon's unmeasured SMA200 in a breadth line: checked word for word (tone marks ignored) in the words pass
EXTRA = [
    ('groups-a', 'Dẫn đầu là ngân hàng, bất động sản và dịch vụ tài chính, cuối bảng là du lịch và giải trí.', 1.0, 2),
    ('groups-b', 'Theo sau là tài nguyên cơ bản, thực phẩm và đồ uống, ô tô và phụ tùng, điện, nước và khí đốt.', 1.0, 2),
    ('groups-amp', 'Cuối bảng là xây dựng & vật liệu, ngay trên là đồ cá nhân & gia dụng.', 1.0, 2),
    ('sma200', 'Số mã trên ét em ây hai trăm chỉ còn hai trăm bốn mươi bốn.', 0.92, 3),
]
for key, text, speed, takes in EXTRA:
    CASES.append((key, text, speed, takes, None))
rows = []
ONLY = set(filter(None, next((a[8:] for a in argv if a.startswith('--cases=')), '').split(',')))
for key, text, speed, takes, reading in CASES:
    if ONLY and key not in ONLY:
        continue
    for n in range(takes):
        rows.append({'case': key, 'text': text, 'speed': speed, 'reading': reading, 'out': str(OUT / f'{key}-{n}.wav')})

if '--listen-only' not in argv:
    spec = {k: meta[k] for k in ('model', 'device', 'ref_audio', 'ref_text')}
    spec['speed'] = 1.0
    spec['items'] = [{'text': r['text'], 'out': r['out'], 'speed': r['speed']} for r in rows if not Path(r['out']).exists()]
    if spec['items']:
        p = OUT / '_spec.json'
        p.write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding='utf-8')
        subprocess.run([sys.executable, str(ROOT / 'scripts/tts_omnivoice.py'), str(p)], check=True, cwd=ROOT)
if '--synth-only' in argv:
    sys.exit(0)

import mlx_whisper  # noqa: E402
from mlx_whisper.tokenizer import get_tokenizer  # noqa: E402

WHISPER = 'mlx-community/whisper-large-v3-mlx'
low = lambda t: unicodedata.normalize('NFC', t.lower())
words_of = lambda t: re.sub(r'[^\w\s]', ' ', low(t)).split()

def strip_marks(w):
    d = unicodedata.normalize('NFD', w.replace('đ', 'd').replace('Đ', 'D'))
    return ''.join(ch for ch in d if unicodedata.category(ch) != 'Mn')

def phon(w):  # scripts/tts_takes.py phon()
    w = low(w)
    w = re.sub(r'^(gi|r|d)', 'z', w)
    w = re.sub(r'^x', 's', w)
    w = re.sub(r'^tr', 'ch', w)
    w = strip_marks(w)
    return re.sub(r'(t|ch)$', 'c', w)

PRIMER = ('Thứ Năm, ngày hai mươi chín tháng hai. Chỉ số đóng cửa một nghìn sáu trăm linh hai điểm, '
          'giảm hai phẩy tám lăm phần trăm, có bốn mươi mốt mã tăng.')
TOK = get_tokenizer(multilingual=True, language='vi', task='transcribe')
DEC = lambda i: TOK.encoding.decode([i])
DIGITS = [i for i in range(TOK.eot) if re.search(r'\d|%', DEC(i))]
ENGLISH = ('momentum', 'breakout', 'breakdown')
KEEP = {'men', 'tum', 'ten', 'tam'}  # Vietnamese syllables that are also pieces of the English words
LATIN = [i for i in range(TOK.eot)
         if (lambda s: re.fullmatch(r'[a-z]{3,}', s) and s not in KEEP and any(s in e for e in ENGLISH))(DEC(i).strip().lower())]

def junk(heard, n):  # scripts/tts_takes.py junk()
    ws = words_of(heard)
    if len(ws) < 0.6 * n or len(ws) > 1.8 * n + 2 or heard.count('!') > 3 or '$' in heard:
        return True
    run = 1
    for a, b in zip(ws, ws[1:]):
        run = run + 1 if a == b else 1
        if run >= 3:
            return True
    return len(ws) > 4 and len(set(ws)) < len(ws) / 2

def transcribe(wav, suppress, prompt, lang, n):
    for temp in (0.0, 0.3, 0.5):
        r = mlx_whisper.transcribe(wav, path_or_hf_repo=WHISPER, language=lang, word_timestamps=True, initial_prompt=prompt,
                                   suppress_tokens=suppress, temperature=temp, compression_ratio_threshold=None,
                                   logprob_threshold=None, no_speech_threshold=None, condition_on_previous_text=False,
                                   sample_len=3 * n + 12)
        text = r['text'].strip()
        if not junk(text, n):
            break
    words = []
    for s in r['segments']:
        for w in s.get('words', []):
            parts = re.findall(r'\w+', low(w['word']))
            if not parts:
                continue
            step = (float(w['end']) - float(w['start'])) / len(parts)
            for k, p in enumerate(parts):
                words.append((p, round(float(w['start']) + k * step, 2), round(float(w['start']) + (k + 1) * step, 2)))
    return text, words

def heard_term(spoken, label, words, start=0):
    """tts_takes.py's word rule: the spoken syllables (phon) in order, or the English word written whole (1-3 pieces)."""
    hw = [w for w, _, _ in words]
    ph, flat = [phon(w) for w in hw], [strip_marks(w) for w in hw]
    want = [phon(w) for w in words_of(spoken)]
    for i in range(start, len(ph) - len(want) + 1):
        if ph[i:i + len(want)] == want:
            return i, i + len(want), 'syllables'
    glued = strip_marks(label.lower())
    for i in range(start, len(flat)):
        for n in (1, 2, 3):
            if ''.join(flat[i:i + n]) == glued:
                return i, i + n, 'word'
    return None

def span(words, i, j):
    return f"{' '.join(w for w, _, _ in words[i:j])} [{words[i][1]:.2f}–{words[j - 1][2]:.2f}s, " \
           f"{', '.join(f'{e - s:.2f}' for _, s, e in words[i:j])}]"

report = []
for r in rows:
    wav, n = r['out'], len(words_of(r['text']))
    a = transcribe(wav, [-1] + DIGITS, PRIMER, 'vi', n)
    entry = {'case': r['case'], 'take': Path(wav).name, 'text': r['text'], 'words': a[0]}
    if r['case'] in {k for k, *_ in EXTRA}:
        hw = [strip_marks(w) for w, _, _ in a[1]]
        script = [strip_marks(w) for w in words_of(r['text'])]
        sm = difflib.SequenceMatcher(None, script, hw)
        entry['dropped'] = [' '.join(script[i1:i2]) for op, i1, i2, _, _ in sm.get_opcodes() if op in ('delete', 'replace')]
        entry['inserted'] = [' '.join(hw[j1:j2]) for op, _, _, j1, j2 in sm.get_opcodes() if op in ('insert', 'replace')]
        entry['timed'] = ' '.join(f'{w}({e - s:.2f})' for w, s, e in a[1])
        if r['case'] == 'sma200':
            pieces = [i for i in range(TOK.eot) if DEC(i).strip() in {'S', 'M', 'A', 'SM', 'MA', 'SMA', 'Sma', 'sma', 'Ma'}]
            b = transcribe(wav, [-1] + DIGITS + pieces, PRIMER + ' Ét em ây tăng.', 'vi', n)
            entry['letters'] = b[0]
            entry['letters_timed'] = ' '.join(f'{w}({e - s:.2f})' for w, s, e in b[1])
            print(f"    letters pass: {b[0]}\n    {entry['letters_timed']}")
        print(f"{entry['take']:16} {'ALL' if not entry['dropped'] else 'DIFF'} | {a[0]}\n    script-only: {entry['dropped']}  "
              f"heard-only: {entry['inserted']}\n    {entry['timed']}")
    elif r['case'] == 'invite':
        hw = [strip_marks(w) for w, _, _ in a[1]]
        got = {}
        for phrase in ('điểm lại', 'lên kế hoạch giao dịch', 'tuần tới', 'tuần qua'):
            want = [strip_marks(w) for w in words_of(phrase)]
            at = next((i for i in range(len(hw) - len(want) + 1) if hw[i:i + len(want)] == want), None)
            exact = any([w for w, _, _ in a[1]][i:i + len(want)] == words_of(phrase) for i in range(len(hw)))
            got[phrase] = (span(a[1], at, at + len(want)) + ('' if exact else ' (tone differs)')) if at is not None else None
        entry['phrases'] = got
        script = [strip_marks(w) for w in words_of(r['text'])]
        entry['coverage'] = round(sum(w in set(hw) for w in script) / len(script), 2)
        print(f"{entry['take']:16} {'ALL' if all(got.values()) else 'MISS'}  cov {entry['coverage']}  | {a[0]}")
        for ph, v in got.items():
            print(f"    {ph:24} {v or '— NOT HEARD'}")
    else:
        b = transcribe(wav, [-1] + DIGITS + LATIN, PRIMER, 'vi', n)
        c = transcribe(wav, [-1], None, 'en', n)
        entry.update({'syll': b[0], 'en': c[0]})
        terms = [k for k in ('m', 'o', 'd') if r['reading'][k] in r['text']]
        res = {}
        for k in terms:
            hits = heard_term(r['reading'][k], LABEL[k], a[1])
            res[LABEL[k]] = span(a[1], hits[0], hits[1]) + f" as {hits[2]}" if hits else None
        entry['terms'] = res
        en = words_of(c[0])
        entry['en_has'] = {lb: any(''.join(en[i:i + m]) == lb.lower() for i in range(len(en)) for m in (1, 2))
                           for lb in (LABEL[k] for k in terms)}
        print(f"{entry['take']:22} words: {a[0]}\n{'':22} syll:  {b[0]}\n{'':22} en:    {c[0]}")
        for lb, v in res.items():
            print(f"    {lb:18} {v or '— NOT HEARD'}")
    report.append(entry)

(OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
print()
for case in dict.fromkeys(e['case'] for e in report):
    es = [e for e in report if e['case'] == case]
    if 'dropped' in es[0]:
        print(f"{case:20} heard word for word {sum(not e['dropped'] for e in es)}/{len(es)}   "
              f"script-only {[e['dropped'] for e in es]}  heard-only {[e['inserted'] for e in es]}")
    elif case == 'invite':
        for ph in es[0]['phrases']:
            print(f"{case:20} {ph:24} heard {sum(bool(e['phrases'][ph]) for e in es)}/{len(es)}")
    else:
        for lb in es[0]['terms']:
            print(f"{case:20} {lb:18} heard {sum(bool(e['terms'][lb]) for e in es)}/{len(es)}"
                  + (f"   en-pass wrote it {sum(e['en_has'].get(lb, False) for e in es)}/{len(es)}" if lb in es[0]['en_has'] else ''))
