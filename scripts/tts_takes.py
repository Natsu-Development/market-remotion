#!/usr/bin/env python
"""Best-of-N takes for the sentences OmniVoice gets wrong: decimals ("phẩy") and spelled acronyms (MACD).

OmniVoice is stochastic. Measured 2026-09-30 on the Channel reel: it dropped "phẩy" from
"bốn mươi ba phẩy mười ba" in 3 of 4 takes and from "hai mươi tám phẩy tám lăm" in 2 of 4, and
squeezed "em mờ a xê đê" into 0.65 s with "a" at 0.06–0.08 s — while Whisper's plain transcript
still read "43,13%" and "MACD". Whisper infers those from context, so a plain transcript is no
evidence the syllables were spoken. This script LISTENS harder: it transcribes with every digit
token (and the tokens of each written lexicon term) suppressed, so a decimal has to come back as
words, "phẩy" present or not, and an acronym as the letters actually heard, with per-word timing.

For every sentence that carries such a term — and every sentence voice.pace marks `key` (it speaks a
figure, a headline beat is pinned to it, or it is the hook) — it records N extra takes, ranks them, and
Every spoken figure ("một nghìn ba trăm bảy mươi lăm", "chín phẩy bảy phần trăm") is a required term of
its own: a take has to be heard with the whole run of number words, because OmniVoice drops "nghìn" or
"trăm" from a price as readily as "phẩy" from a decimal (measured 2026-10-01: "một nghìn bảy trăm bảy
mươi bảy" came back "một bẩy bẩy mươi bẩy").
copies the clearest one onto the .tts-cache path scripts/voiceover.mjs assembles the scene from. Among
takes that are equally clear it prefers the one with the widest pitch range (10th–90th percentile of F0,
credit capped at 12 semitones): OmniVoice's intonation varies from take to take and cannot be asked for,
so a lively read is chosen, not generated (the user, 2026-10-01: "no pace or highlight"). Then:

    node scripts/voiceover.mjs --content=<content> --reassemble --only=<ids printed at the end> --retime

Usage — run with the video-factory venv (torch + omnivoice + mlx_whisper), after a voiceover run
has written .tts-cache/_sentences.json for the reel (a plain `node scripts/voiceover.mjs --content=<reel>`
refreshes it without synthesizing anything; a sentence whose base take is missing — the lexicon just
changed its spoken form — is recorded here along with its takes):

    ../video-factory/.venv/bin/python scripts/tts_takes.py                 # 6 extra takes, pick, copy
    ../video-factory/.venv/bin/python scripts/tts_takes.py --dry-run       # rank only, copy nothing
    ../video-factory/.venv/bin/python scripts/tts_takes.py --takes=8 --only=channel-evidence-4
    ../video-factory/.venv/bin/python scripts/tts_takes.py --commas        # also re-take sentences with a
                                                                           # comma and prefer takes that pause there
    --terms=ép tê đi,chứng vịt   extra spoken forms that must be heard whole (default: "phẩy" + the lexicon
                                 + every spelled ticker of the reel, voice.letters + voice.letterJoin)
    --fresh                      record new takes even where .takeN.wav files already exist
    --report=<path.json>         write the full ranking
    --match=<regex>              only sentences whose spoken text matches (e.g. the ones a rewrite changed)

Ranking, per sentence: sane length (0.6–1.6× the median take) > every required term heard >
no gap of 0.15 s or more inside a spelled ticker (user 2026-10-01: "solid and clearly not separate") >
a pause at every comma > not a junk transcript > clarity (how long "phẩy" / the shortest letter
is held) > word overlap with the script. A sentence where no take is heard whole is left as it is
and flagged — record more takes (--takes=12) or reword it.

Whisper large-v3 (mlx-community/whisper-large-v3-mlx, ~3 GB) is fetched to ~/.cache/huggingface on
first use. Needs ffmpeg.
"""
from __future__ import annotations

import difflib
import glob
import json
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.tts-cache'
MANIFEST = CACHE / '_sentences.json'
WHISPER = 'mlx-community/whisper-large-v3-mlx'  # --whisper=mlx-community/whisper-large-v3-turbo is ~5× faster, slightly less exact
DEFAULT_RULES = ROOT / 'src/shared/content-rules.json'

argv = sys.argv[1:]
flag = lambda n: f'--{n}' in argv
def opt(n, d=None):
    hit = next((a for a in argv if a.startswith(f'--{n}=')), None)
    return hit[len(n) + 3:] if hit else d

TAKES = int(opt('takes', '6'))
DRY = flag('dry-run')
FRESH = flag('fresh')
COMMAS = flag('commas')
ONLY = set(filter(None, opt('only', '').split(',')))
REPORT = opt('report')
WHISPER = opt('whisper', WHISPER)
# --match=<regex>: only the sentences whose SPOKEN text matches (re-take what changed, not a whole scene again).
MATCH = opt('match')

low = lambda t: unicodedata.normalize('NFC', t.lower())
words_of = lambda t: re.sub(r'[^\w\s]', ' ', low(t)).split()


# ---------------------------------------------------------------- what to listen for

if not MANIFEST.exists():
    sys.exit(f'{MANIFEST.relative_to(ROOT)} is missing — run `node scripts/voiceover.mjs --content=<reel>` first '
             '(it writes the manifest before synthesizing anything).')
manifest = json.load(open(MANIFEST, encoding='utf-8'))
content = ROOT / manifest['content']
reel = json.load(open(content, encoding='utf-8'))
rules_path = ROOT / reel.get('rules', 'src/shared/content-rules.json')
lexicon = {k: v for k, v in (json.load(open(rules_path, encoding='utf-8')).get('voice', {}).get('lexicon', {}) or {}).items()
           if not k.startswith('_') and isinstance(v, str)}
# spoken forms that must be heard whole, as word lists, keyed by their written term when they have one
terms = {'phẩy': ['phẩy']}
for written, spoken in lexicon.items():
    terms[written] = words_of(spoken)
for extra in filter(None, (opt('terms') or '').split(',')):
    terms[extra.strip()] = words_of(extra)

# Spelled tickers (market-review; user 2026-10-01: "Pronounce of symbol must be solid and clearly not separate").
# The manifest holds the SPOKEN text, where a ticker is already spelled, so the tickers come from the reel's
# written narration (three capitals standing alone — scripts/lib/rules.mjs TICKER_RE) and their spoken form
# from voice.letters joined by voice.letterJoin, exactly as spellerOf builds it. A lexicon term (FTD) is
# respelled before the speller sees it and stays a lexicon term. Each spelled ticker is a required term:
# every letter heard as a letter (the strict pass suppresses the pieces Whisper would write the ticker with),
# the shortest letter held as long as possible, and no long gap inside the ticker (see GAP).
voice_rules = json.load(open(rules_path, encoding='utf-8')).get('voice', {}) or {}
letters = {k: v for k, v in (voice_rules.get('letters') or {}).items() if not k.startswith('_') and isinstance(v, str)}
letter_join = voice_rules['letterJoin'] if isinstance(voice_rules.get('letterJoin'), str) else ', '
TICKER_RE = re.compile(r'(?<![^\W_])[A-Z]{3}(?![^\W_])')
TICKERS = {}
if letters:
    for sc in reel.get('scenes', []):
        for tk in TICKER_RE.findall(sc.get('narration') or ''):
            if tk not in lexicon and tk not in TICKERS:
                TICKERS[tk] = words_of(letter_join.join(letters.get(c, c.lower()) for c in tk))
terms.update(TICKERS)
# a gap this long inside a spelled ticker (between two of its letters) is the ticker said "separated"
GAP = 0.15

NUMBER_WORDS = {'không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười', 'mươi', 'trăm',
                'nghìn', 'ngàn', 'lăm', 'lẻ', 'linh', 'mốt', 'tư', 'phẩy', 'chấm', 'phần'}

def figure_runs(text):
    """Maximal runs of number words, two or more long — the figures the sentence speaks."""
    ws = words_of(text); runs, cur = [], []
    for w in ws + ['']:
        if w in NUMBER_WORDS:
            cur.append(w)
        else:
            if len(cur) >= 2 and any(x not in {'một', 'hai', 'năm', 'ba'} for x in cur):
                runs.append(cur)
            cur = []
    return runs

UNIT = {'không': 0, 'một': 1, 'mốt': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'tư': 4, 'năm': 5, 'lăm': 5, 'sáu': 6, 'bảy': 7, 'tám': 8, 'chín': 9}

def words_to_int(ws):
    """Vietnamese number words → integer: standard grammar (nghìn/trăm/mươi/mười/linh), or digit by digit
    ('hai không mười tám' → 2018, 'tám lăm' → 85) when the words do not fit the grammar."""
    if not ws or not all(w in UNIT or w in ('nghìn', 'ngàn', 'trăm', 'mươi', 'mười', 'linh', 'lẻ') for w in ws):
        return None
    total, cur, i, standard = 0, 0, 0, True
    while i < len(ws):
        w = ws[i]
        if w in ('nghìn', 'ngàn'):
            total += (cur or 1) * 1000; cur = 0
        elif w == 'trăm':
            cur = (cur or 1) * 100 if cur < 100 else cur
        elif w == 'mười':
            cur += 10
        elif w == 'mươi':
            cur = (cur % 10) * 10 + (cur - cur % 10) if cur % 10 else cur
        elif w in ('linh', 'lẻ'):
            pass
        else:
            nxt = ws[i + 1] if i + 1 < len(ws) else None
            if nxt == 'mươi':
                cur += UNIT[w] * 10; i += 2; continue
            if UNIT[w] == 0 and nxt == 'trăm':
                i += 2; continue
            if i and ws[i - 1] in UNIT:
                standard = False  # two units in a row: digit-by-digit reading
            cur += UNIT[w]
        i += 1
    if standard:
        return total + cur
    digits = ''.join(str(UNIT[w]) if w in UNIT else ('1' if w == 'mười' else '') for w in ws if w not in ('mươi',))
    # 'hai không mười tám': units 2,0 then 'mười tám' = 18
    out, j = '', 0
    while j < len(ws):
        if ws[j] == 'mười':
            out += str(10 + (UNIT.get(ws[j + 1], 0) if j + 1 < len(ws) else 0)); j += 2
        elif ws[j] in UNIT:
            if j + 1 < len(ws) and ws[j + 1] == 'mươi':
                out += str(UNIT[ws[j]] * 10 + (UNIT.get(ws[j + 2], 0) if j + 2 < len(ws) else 0)); j += 3
            else:
                out += str(UNIT[ws[j]]); j += 1
        else:
            j += 1
    return int(out) if out.isdigit() else None

def figure_digits(run):
    """The digit strings a transcript may use for this run: '1099', '43.13', '43,13' (percent sign stripped)."""
    ws = [w for w in run if w not in ('phần',) and not (w == 'trăm' and run[-2:] == ['phần', 'trăm'])]
    if ws[-2:] == ['phần', 'trăm'] or (len(run) >= 2 and run[-2:] == ['phần', 'trăm']):
        ws = run[:-2]
    sep = next((k for k, w in enumerate(ws) if w in ('chấm', 'phẩy')), None)
    if sep is None:
        n = words_to_int(ws)
        return {str(n)} if n is not None else set()
    ip, fp = words_to_int(ws[:sep]), words_to_int(ws[sep + 1:])
    if ip is None or fp is None:
        return set()
    frac = ''.join(str(UNIT[w]) for w in ws[sep + 1:] if w in UNIT) if len(ws[sep + 1:]) <= 2 and all(w in UNIT for w in ws[sep + 1:]) else str(fp)
    return {f'{ip}.{frac}', f'{ip},{frac}', f'{ip}.{fp}', f'{ip},{fp}'}

def has_run(seq, sub):
    return bool(sub) and any(seq[i:i + len(sub)] == sub for i in range(len(seq) - len(sub) + 1))

def needs(text):
    t = low(text)
    seq = words_of(t)
    want = [w for w, ws in terms.items() if w not in TICKERS and ' '.join(ws) in ' '.join(seq)]
    # a ticker is matched word by word, so "pê vê tê" never matches inside another ticker's letters
    want += [w for w, ws in TICKERS.items() if has_run(seq, ws)]
    for run in figure_runs(text):
        key = ' '.join(run)
        if key not in terms:
            terms[key] = run
        if key not in want:
            want.append(key)
    if COMMAS and ',' in t:
        want.append(',')
    return want

targets = []
for sc in manifest['scenes']:
    if ONLY and sc['id'] not in ONLY:
        continue
    for sent in sc['sentences']:
        if MATCH and not re.search(MATCH, sent['text']):
            continue
        want = needs(sent['text'])
        if want or sent.get('key'):
            targets.append({'scene': sc['id'], 'wav': sc['wav'], 'text': sent['text'], 'file': sent['file'], 'speed': sent.get('speed'),
                            'want': want, 'key': bool(sent.get('key'))})
if not targets:
    sys.exit('nothing to re-take: no sentence carries "phẩy", a lexicon term' + (', or a comma' if COMMAS else '') + ', and none is key.')
print(f"{len(targets)} sentence(s) to re-take in {content.relative_to(ROOT)}: " +
      ', '.join(sorted({t['scene'] for t in targets})), flush=True)


# ---------------------------------------------------------------- record

def take_paths(base):
    return sorted(glob.glob(base.replace('.wav', '.take*.wav')), key=lambda p: int(re.search(r'take(\d+)', p).group(1)))

todo = []
for t in targets:
    # A base take is missing right after the lexicon changed (new spoken form, new cache key): record it here
    # so the whole batch is one model load, and voiceover.mjs --reassemble finds it in place.
    if not Path(t['file']).exists():
        todo.append({'text': t['text'], 'out': t['file'], 'speed': t.get('speed')})
    have = take_paths(t['file'])
    if FRESH:
        for p in have:
            Path(p).unlink()
        have = []
    start = 2 if not have else int(re.search(r'take(\d+)', have[-1]).group(1)) + 1
    for n in range(start, start + max(0, TAKES - len(have))):
        todo.append({'text': t['text'], 'out': t['file'].replace('.wav', f'.take{n}.wav'), 'speed': t.get('speed')})
if todo:
    spec = {k: manifest[k] for k in ('model', 'device', 'ref_audio', 'ref_text', 'speed')}
    spec['items'] = todo
    spec_path = CACHE / '_takes_items.json'
    spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f"recording {len(todo)} extra take(s) with OmniVoice…", flush=True)
    r = subprocess.run([sys.executable, str(ROOT / 'scripts/tts_omnivoice.py'), str(spec_path)], capture_output=True, text=True)
    ok = sum(l.startswith('OK') for l in r.stdout.splitlines())
    fails = [l for l in r.stdout.splitlines() if l.startswith('FAIL')]
    print(f"  {ok} ok, {len(fails)} failed" + (f"\n  {fails[0]}" if fails else ''), flush=True)
    if not ok and fails:
        sys.exit(1)
else:
    print('every take already recorded (use --fresh to record new ones)', flush=True)


# ---------------------------------------------------------------- listen

import mlx_whisper  # noqa: E402  (slow import, after the cheap exits above)
from mlx_whisper.tokenizer import get_tokenizer  # noqa: E402
import librosa  # noqa: E402
import numpy as np  # noqa: E402

def pitch_range(wav):
    """10th–90th percentile spread of the voiced pitch, in semitones around its median."""
    y, sr = librosa.load(wav, sr=None)
    f0, voiced, _ = librosa.pyin(y, fmin=60, fmax=400, sr=sr, frame_length=2048)
    f = f0[voiced & ~np.isnan(f0)]
    if len(f) < 10:
        return 0.0
    st = 12 * np.log2(f / np.median(f))
    return round(float(np.percentile(st, 90) - np.percentile(st, 10)), 2)

PROMPT = 'Giá mất hai mươi tám phẩy tám lăm phần trăm. ' + ' '.join(
    f"{' '.join(ws).capitalize()} tháng cắt xuống." for w, ws in terms.items() if w != 'phẩy' and w not in TICKERS)

def prompt_for(t):
    """The shared prompt, plus the spelled tickers of THIS sentence (a sentence without one gets PROMPT as is)."""
    tks = [w for w in t['want'] if w in TICKERS]
    return PROMPT + (' ' + ' '.join(f"{' '.join(TICKERS[w]).capitalize()} tăng." for w in tks) if tks else '')

def suppression():
    tok = get_tokenizer(multilingual=True, language='vi', task='transcribe')
    dec = lambda i: tok.encoding.decode([i])
    n = tok.encoding.n_vocab
    digits = [i for i in range(n) if re.search(r'\d|%', dec(i))]
    written = [w.lower() for w in terms if w != 'phẩy' and w != ',' and w not in TICKERS]
    acronym = [i for i in range(n) if (lambda s: len(s) >= 3 and any(s in w for w in written))(dec(i).strip().lower())]
    # A ticker's pieces: every uppercase run of 1–3 ASCII letters inside a reel ticker ("M", "SR", "MSR") and the
    # ticker itself in any case — what Whisper writes a ticker with. Suppressed only for a sentence that says it.
    pieces = {}
    if TICKERS:
        subs = {tk[a:b] for tk in TICKERS for a in range(len(tk)) for b in range(a + 1, len(tk) + 1)}
        for i in range(n):
            s = dec(i).strip()
            if s in subs or s.upper() in TICKERS:
                pieces.setdefault(s.upper() if s.upper() in TICKERS else s, []).append(i)
    return digits, acronym, pieces

DIGITS, ACRONYM, PIECES = suppression()

def stages_for(t):
    tks = [w for w in t['want'] if w in TICKERS]
    extra = sorted({i for tk in tks for a in range(len(tk)) for b in range(a + 1, len(tk) + 1) for i in PIECES.get(tk[a:b], [])})
    return [('strict', [-1] + DIGITS + ACRONYM + extra), ('digits', [-1] + DIGITS), ('plain', '-1')]

def transcribe(wav, suppress, expected, prompt=None):
    # sample_len caps a suppressed decode that starts looping ("chỉ còn chỉ còn …"): a sentence needs
    # ~2 tokens a word, so 3× is generous and a loop stops in seconds instead of running to 448 tokens.
    r = mlx_whisper.transcribe(wav, path_or_hf_repo=WHISPER, language='vi', word_timestamps=True,
                               initial_prompt=PROMPT if prompt is None else prompt, suppress_tokens=suppress, temperature=0.0,
                               compression_ratio_threshold=None, logprob_threshold=None,
                               no_speech_threshold=None, condition_on_previous_text=False,
                               sample_len=3 * expected + 12)
    words = [(low(w['word']).strip(' .,!?…'), w['start'], w['end']) for s in r['segments'] for w in s.get('words', [])]
    return r['text'].strip(), words

def junk(heard, expected):
    ws = words_of(heard)
    if len(ws) < 0.6 * expected or len(ws) > 1.8 * expected + 2 or heard.count('!') > 2:
        return True
    run = 1
    for a, b in zip(ws, ws[1:]):
        run = run + 1 if a == b and a not in NUMBER_WORDS else 1  # "bảy trăm bảy mươi bảy" is not a loop
        if run >= 3:
            return True
    return len(ws) > 4 and len(set(ws)) < len(ws) / 2

def listen(wav, expected, t):
    """Strictest transcript that is not junk: a suppressed hypothesis can make Whisper loop or stutter."""
    for mode, sup in stages_for(t):
        heard, words = transcribe(wav, sup, expected, prompt_for(t))
        if not junk(heard, expected):
            return mode, heard, words
    return 'junk', heard, words

def pauses(wav):
    e = subprocess.run(['ffmpeg', '-i', wav, '-af', 'silencedetect=noise=-40dB:d=0.06', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    dur = float(re.search(r'Duration: (\d+):(\d+):([\d.]+)', e).group(3))
    sil = [(float(a) - float(b), float(b)) for a, b in re.findall(r'silence_end: ([\d.]+) \| silence_duration: ([\d.]+)', e)]
    return [round(d, 2) for s, d in sil if s > 0.15 and s + d < dur - 0.15 and d >= 0.2], dur

def find(seq, sub):
    for i in range(len(seq) - len(sub) + 1):
        if seq[i:i + len(sub)] == sub:
            return i
    return None

def strip_marks(w):
    """A letter name without tone and vowel marks ('rờ' → 'ro', 'đê' → 'de'): Whisper writes a heard letter
    either way. Used only while no two names in voice.letters collide once stripped (LETTER_KEY)."""
    d = unicodedata.normalize('NFD', w.replace('đ', 'd'))
    return ''.join(ch for ch in d if unicodedata.category(ch) != 'Mn')

_names = [x for v in letters.values() for x in words_of(v)]
LETTER_KEY = strip_marks if len({strip_marks(x) for x in _names}) == len(set(_names)) else (lambda w: w)

def inner_silence(wav, lo, hi):
    """Longest silence that lies inside (lo, hi) — between the first and last letter of a ticker."""
    e = subprocess.run(['ffmpeg', '-i', wav, '-af', 'silencedetect=noise=-40dB:d=0.06', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    sil = [(float(a) - float(b), float(b)) for a, b in re.findall(r'silence_end: ([\d.]+) \| silence_duration: ([\d.]+)', e)]
    return round(max([d for s, d in sil if s >= lo - 0.05 and s + d <= hi + 0.05] or [0.0]), 2)

def ticker_held(wav, words, seq, first, letters_of):
    """Where a spelled ticker is heard, how long each letter is held, and the longest gap between two letters
    (Whisper's word timing, and a silence inside the ticker): None when the letters are not all there."""
    key = [LETTER_KEY(x) for x in letters_of]
    i = find([LETTER_KEY(x) for x in seq], key)
    if i is None:
        return None
    ks = range(i, i + len(letters_of))
    durs = [round(float(words[k][2] - words[k][1]), 2) for k in ks]
    # the clip's opening word often gets a 0.0 s span from Whisper, so it is not timed (see features)
    timed = [k for k in ks if k != first]
    gaps = [float(words[k + 1][1] - words[k][2]) for k in ks[:-1] if k != first and k + 1 in ks]
    lo = float(words[i][2]) if i != first else 0.15
    hi = float(words[i + len(letters_of) - 1][1])
    gap = round(max(gaps + [inner_silence(wav, lo, hi) if hi > lo else 0.0] + [0.0]), 2)
    return {'held': durs, 'span': round(float(words[i + len(letters_of) - 1][2] - words[i][1]), 2), 'gap': gap,
            'measured': [float(words[k][2] - words[k][1]) for k in timed]}

def features(t, wav):
    text = t['text']
    mode, heard, words = listen(wav, len(words_of(text)), t)
    seq = [w.replace('bẩy', 'bảy') for w, _, _ in words]
    f = {'take': wav, 'mode': mode, 'heard': heard, 'terms': {}, 'ok': 0, 'need': 0, 'clarity': 0.0,
         'ratio': round(difflib.SequenceMatcher(None, words_of(text), words_of(heard)).ratio(), 3)}
    f['pauses'], f['dur'] = pauses(wav)
    f['pitch'] = pitch_range(wav)
    # share of the non-number words of the script that appear in the transcript — a gate against garbled
    # takes that does not punish a transcript for writing the figure in digits
    spoken_terms = {x for w, ws in terms.items() if w not in TICKERS for x in ws} | \
                   {x for w in t['want'] if w in TICKERS for x in TICKERS[w]}
    content_words = {w for w in words_of(text) if w not in NUMBER_WORDS and w not in spoken_terms}
    heard_set = set(words_of(heard))
    f['coverage'] = round(len(content_words & heard_set) / len(content_words), 2) if content_words else 1.0
    f['commas'] = text.count(',')
    f['comma_ok'] = len(f['pauses']) >= f['commas'] if ',' in t['want'] else True
    f['joined'] = True
    first = next((k for k, (word, _, _) in enumerate(words) if word), 0)  # a strict pass may open with "!"
    for w in t['want']:
        if w == ',':
            continue
        f['need'] += 1
        if w in TICKERS:
            # solid and clear (user 2026-10-01): every letter heard, the shortest one held, no gap inside
            v = ticker_held(wav, words, seq, first, TICKERS[w])
            if v is None:
                f['terms'][w] = None
                continue
            measured = v.pop('measured')
            f['terms'][w] = v
            f['ok'] += 1
            f['clarity'] += min(min(measured), 0.25) if measured else 0.1
            f['joined'] = f['joined'] and v['gap'] < GAP
            continue
        i = find(seq, terms[w])
        if i is None and terms[w] and all(x in NUMBER_WORDS for x in terms[w]):
            # a plain-mode transcript writes the figure in digits — that is the figure heard whole
            want_digits = figure_digits(terms[w])
            norm = lambda tok: tok.replace('%', '').replace('.', '').replace(',', '').strip()
            hit = next((k for k, (word, _, _) in enumerate(words) if norm(word) in {norm(d) for d in want_digits} and any(ch.isdigit() for ch in word)), None)
            if hit is not None:
                f['terms'][w] = {'held': [round(float(words[hit][2] - words[hit][1]), 2)], 'span': round(float(words[hit][2] - words[hit][1]), 2), 'digits': True}
                f['ok'] += 1
                f['clarity'] += min(float(words[hit][2] - words[hit][1]) / len(terms[w]), 0.25)
                continue
        if i is None:
            f['terms'][w] = None
            continue
        durs = [round(float(words[k][2] - words[k][1]), 2) for k in range(i, i + len(terms[w]))]
        span = round(float(words[i + len(terms[w]) - 1][2] - words[i][1]), 2)
        # Whisper's alignment gives a clip's opening word a 0.0 s span more often than not ("Em, a, xê, đê
        # tháng…" measured Em=0.0 in 7 of 9 takes while the letter was plainly heard), so the first word of
        # the clip does not count towards how well the term is held.
        first = next((k for k, (word, _, _) in enumerate(words) if word), 0)  # a strict pass may open with "!"
        measured = [d for k, d in zip(range(i, i + len(terms[w])), durs) if k != first]
        f['terms'][w] = {'held': durs, 'span': span}
        f['ok'] += 1
        f['clarity'] += min(min(measured), 0.25) if measured else 0.1
        f['clarity'] += min(span, 1.2) / 10 if len(durs) > 1 else 0
    return f

def rank(rows):
    med = sorted(r['dur'] for r in rows)[len(rows) // 2]
    for r in rows:
        r['sane'] = 0.6 * med <= r['dur'] <= 1.6 * med
    return sorted(rows, key=lambda r: (r['sane'], r['ok'], r['joined'], r['comma_ok'], r['mode'] != 'junk', round(r['clarity'] * 20) / 20,
                                       r['coverage'] >= 0.85, min(r['pitch'], 12.0), r['ratio']),
                  reverse=True)


# ---------------------------------------------------------------- pick

report, changed, unresolved = [], {}, []
for t in targets:
    if not Path(t['file']).exists():
        print(f"\n== {t['scene']}: {t['text']}\n  !! base take was not recorded — see the TTS output above")
        unresolved.append(t)
        continue
    clips = [t['file']] + take_paths(t['file'])
    print(f"\nlistening to {len(clips)} take(s) of {t['scene']}: {t['text'][:60]}…", flush=True)
    rows = []
    for c in clips:
        t0 = time.time()
        rows.append(features(t, c))
        print(f"  {Path(c).name:24} {rows[-1]['mode']:6} {time.time() - t0:4.0f}s", flush=True)
    rows = rank(rows)
    best = rows[0]
    print(f"\n== {t['scene']}: {t['text']}")
    for r in rows:
        held = ' '.join((f"{w}={v['held']}" + (f" gap {v['gap']}" if 'gap' in v else '')) if v else f"{w}=MISSING"
                        for w, v in r['terms'].items())
        mark = '*' if r is best else ' '
        print(f"  {mark} {Path(r['take']).name:24} {r['ok']}/{r['need']} {'pause' if r['comma_ok'] else 'NO-PAUSE'}{r['pauses']} "
              f"{r['dur']:.2f}s pitch {r['pitch']:4.1f}st [{r['mode']}] {held}  | {r['heard']}", flush=True)
    whole = best['ok'] == best['need'] and best['sane']
    if not whole:
        # The best available take still goes in (the base is only another take); the flag says
        # a human should listen, record more (--takes=12) or reword the sentence.
        unresolved.append(t)
        print('  !! no take is heard whole — the best available one is used; listen, record more (--takes=12) or reword')
    elif not best['joined']:
        unresolved.append(t)
        print(f'  !! every take leaves a gap of {GAP}s or more inside a spelled ticker — listen, or record more (--takes=12)')
    if not DRY and Path(best['take']).resolve() != Path(t['file']).resolve():
        shutil.copyfile(best['take'], t['file'])
        Path(t['file'].replace('.wav', '.trim.wav')).unlink(missing_ok=True)
        changed.setdefault(t['scene'], []).append(Path(best['take']).name)
        print(f"  -> {Path(best['take']).name} copied onto {Path(t['file']).name}")
    elif not DRY:
        print('  -> the base take is already the best')
    report.append({**t, 'ranked': rows})

if REPORT:
    Path(REPORT).write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
print()
if unresolved:
    print(f"{len(unresolved)} sentence(s) unresolved: " + '; '.join(f"{u['scene']}: {u['text'][:50]}…" for u in unresolved))
if changed:
    ids = ','.join(changed)
    print(f"{sum(len(v) for v in changed.values())} take(s) swapped in {len(changed)} scene(s). Rebuild their tracks:\n"
          f"  node scripts/voiceover.mjs --content={content.relative_to(ROOT)} --reassemble --only={ids} --retime")
elif DRY:
    print('dry run — nothing copied')
else:
    print('nothing to rebuild')
